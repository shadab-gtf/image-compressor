/**
 * The capture matrix: which viewports, which themes, and how each screen gets
 * into the state worth photographing.
 *
 * Screenshots are deliberately *not* the full cross product. Layout assertions
 * are cheap and run at every viewport; PNGs are not, and a baseline directory
 * nobody can review is a baseline directory nobody updates. Stateless pages get
 * all six widths; stateful workspace screens get the three that change the
 * layout (single column, two column, desktop sidebar).
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { sleep, waitFor, type CDP } from "../lib/cdp.ts";
import { TEST_IMAGES } from "../lib/cdp.ts";
import type { Theme } from "./stabilize.ts";

export type Viewport = { name: string; width: number; height: number };

export const VIEWPORTS: Viewport[] = [
  { name: "360x800", width: 360, height: 800 },
  { name: "390x844", width: 390, height: 844 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1920x1080", width: 1920, height: 1080 },
];

export const THEMES: Theme[] = ["light", "dark"];

/** Below this width the suite applies the touch-target rules. */
export const TOUCH_MAX_WIDTH = 767;

export type ScreenContext = {
  cdp: CDP;
  viewport: Viewport;
  theme: Theme;
  log: (line: string) => void;
};

export type Screen = {
  name: string;
  path: string;
  /** Selector that proves the route rendered rather than erroring. */
  wait: string;
  /** Viewport names to photograph. Layout runs wider — see `freshPerViewport`. */
  shots: string[];
  themes?: Theme[];
  fullPage?: boolean;
  /**
   * Set when the screen cannot be pixel-compared (a live progress bar is a
   * different picture every run). Still captured and still layout-asserted.
   */
  volatile?: string;
  /**
   * `true` re-navigates and re-runs `prepare` for every viewport — right for
   * cheap stateless pages and for states that cannot survive a resize.
   * `false` prepares once per theme and resizes, which also lets the layout
   * assertions sweep all six widths for the price of one batch run.
   */
  freshPerViewport?: boolean;
  needsFixtures?: boolean;
  prepare?: (ctx: ScreenContext) => Promise<void>;
};

/* -------------------------------------------------------------------------- */
/* Page driving helpers                                                        */
/* -------------------------------------------------------------------------- */

export const fixture = (name: string) => join(TEST_IMAGES, name);

export const FIXTURES = {
  /** Everything, including the two deliberately broken files. */
  all: [
    "photo-3000x2000.png",
    "photo-1600x1200.png",
    "flat-ui-1200x800.png",
    "alpha-logo-800x800.png",
    "tiny-64x64.png",
    "not-really-an-image.png",
    "empty.png",
  ],
  /** Fast to encode — used where the suite must wait for a batch to finish. */
  quick: ["flat-ui-1200x800.png", "alpha-logo-800x800.png", "tiny-64x64.png"],
  /** Slow to encode — used to keep the "Shrinking..." panel on screen. */
  heavy: ["photo-3000x2000.png", "photo-1600x1200.png", "flat-ui-1200x800.png"],
  /** The renamed executable and the zero-byte file. */
  broken: ["not-really-an-image.png", "empty.png"],
} as const;

export function fixturesPresent(): boolean {
  return existsSync(TEST_IMAGES) && FIXTURES.all.every((name) => existsSync(fixture(name)));
}

async function feed(cdp: CDP, names: readonly string[]): Promise<number> {
  await cdp.setFiles(
    "input[type=file]:not([webkitdirectory])",
    names.map((n) => fixture(n)),
  );
  return waitFor(
    "queue rows",
    20_000,
    async () => {
      const n = await cdp.evaluate<number>(`document.querySelectorAll('ul li').length`);
      return n > 0 ? n : null;
    },
    200,
  );
}

async function clickButton(cdp: CDP, pattern: RegExp): Promise<boolean> {
  return cdp.evaluate<boolean>(`(() => {
    const re = ${pattern.toString()};
    const button = [...document.querySelectorAll('button')]
      .find((b) => re.test((b.textContent || '').trim()) && !b.disabled);
    if (!button) return false;
    button.click();
    return true;
  })()`);
}

async function hasText(cdp: CDP, pattern: RegExp): Promise<boolean> {
  return cdp.evaluate<boolean>(
    `${pattern.toString()}.test(document.body.innerText || '')`,
  );
}

/* -------------------------------------------------------------------------- */
/* Screens                                                                     */
/* -------------------------------------------------------------------------- */

const ALL_SHOTS = VIEWPORTS.map((v) => v.name);
const WORKSPACE_SHOTS = ["360x800", "768x1024", "1440x900"];

export const SCREENS: Screen[] = [
  {
    name: "home",
    path: "/",
    wait: "main, body",
    shots: ALL_SHOTS,
    fullPage: true,
    freshPerViewport: true,
  },
  {
    name: "workspace-empty",
    path: "/app",
    wait: "input[type=file]",
    shots: ALL_SHOTS,
    fullPage: true,
    freshPerViewport: true,
  },
  {
    name: "workspace-queued",
    path: "/app",
    wait: "input[type=file]",
    shots: WORKSPACE_SHOTS,
    fullPage: true,
    needsFixtures: true,
    prepare: async ({ cdp, log }) => {
      const rows = await feed(cdp, FIXTURES.all);
      log(`queued ${rows} rows`);
    },
  },
  {
    name: "workspace-processing",
    path: "/app",
    wait: "input[type=file]",
    shots: ["390x844", "1440x900"],
    fullPage: true,
    needsFixtures: true,
    // A progress bar and a percentage are a different picture every run, so the
    // screen is evidence rather than a baseline.
    volatile: "live progress bar and percentage change on every run",
    freshPerViewport: true,
    prepare: async ({ cdp, log }) => {
      await feed(cdp, FIXTURES.heavy);
      const started = await clickButton(cdp, /^(Start|Process remaining)$/);
      if (!started) throw new Error("no Start control on the workspace toolbar");
      await waitFor("the Shrinking... panel", 30_000, () => hasText(cdp, /Shrinking\.\.\./), 60);
      log("caught the batch mid-flight");
    },
  },
  {
    name: "workspace-success",
    path: "/app",
    wait: "input[type=file]",
    shots: WORKSPACE_SHOTS,
    fullPage: true,
    needsFixtures: true,
    prepare: async ({ cdp, log }) => {
      await feed(cdp, FIXTURES.quick);
      const started = await clickButton(cdp, /^(Start|Process remaining)$/);
      if (!started) throw new Error("no Start control on the workspace toolbar");
      await waitFor(
        "the batch to finish",
        180_000,
        async () => {
          if (await hasText(cdp, /Shrinking\.\.\.|Paused/)) return null;
          return (await hasText(cdp, /Your images are ready\./)) ? true : null;
        },
        400,
      );
      log("batch complete");
    },
  },
  {
    name: "workspace-errors",
    path: "/app",
    wait: "input[type=file]",
    shots: ["390x844", "1440x900"],
    fullPage: true,
    needsFixtures: true,
    prepare: async ({ cdp, log }) => {
      const rows = await feed(cdp, FIXTURES.broken);
      await clickButton(cdp, /^(Start|Process remaining)$/);
      await waitFor(
        "the rejection reasons",
        60_000,
        async () => {
          if (await hasText(cdp, /Shrinking\.\.\./)) return null;
          return (await hasText(cdp, /not an image we recognise|file is empty|went wrong/i))
            ? true
            : null;
        },
        300,
      );
      log(`${rows} broken files rejected`);
    },
  },
  {
    name: "settings-sheet-mobile",
    path: "/app",
    wait: "input[type=file]",
    shots: ["360x800"],
    // A modal <dialog> lives in the top layer; a beyond-viewport capture would
    // stretch the backdrop oddly, and the sheet is a viewport-anchored surface
    // anyway, so the viewport is exactly the right frame.
    fullPage: false,
    freshPerViewport: true,
    needsFixtures: true,
    prepare: async ({ cdp, log }) => {
      await feed(cdp, FIXTURES.quick);
      const opened = await clickButton(cdp, /^Settings$/);
      if (!opened) throw new Error("no Settings button in the mobile toolbar");
      await waitFor(
        "the settings sheet",
        10_000,
        () => cdp.evaluate<boolean>(`!!document.querySelector('dialog[open]')`),
        100,
      );
      await sleep(200);
      log("bottom sheet open");
    },
  },
  {
    name: "privacy",
    path: "/privacy",
    wait: "main, body",
    shots: ALL_SHOTS,
    fullPage: true,
    freshPerViewport: true,
  },
  {
    name: "tool-compress-image",
    path: "/compress-image",
    wait: "main, body",
    shots: ALL_SHOTS,
    fullPage: true,
    freshPerViewport: true,
  },
];
