/**
 * Determinism layer for the visual suite.
 *
 * A screenshot test is only worth running if two runs of an unchanged app
 * produce byte-identical pixels. Everything in this file exists to remove one
 * specific source of run-to-run variance:
 *
 *   - CSS animations/transitions and the text caret (injected stylesheet)
 *   - JS-driven motion (`prefers-reduced-motion: reduce` is what motion/react's
 *     `useReducedMotion` actually reads, so emulating it disables the fox's
 *     squash loop at the source rather than papering over it)
 *   - the OS colour-scheme leaking in (emulated to match the forced theme)
 *   - webfont swap-in after first paint (`document.fonts.ready`)
 *   - undecoded preview thumbnails (`HTMLImageElement.decode`)
 *   - the Next.js dev indicator, which is a floating badge that does not exist
 *     in production and must never appear in a baseline
 *   - scrollbars, whose width differs between platforms and would shift every
 *     centred layout by ~8px
 */
import type { CDP } from "../lib/cdp.ts";
import { sleep } from "../lib/cdp.ts";

export type Theme = "light" | "dark";

/** Applied at document-start and re-applied before every capture. */
const FREEZE_CSS = `
*, *::before, *::after, *::backdrop {
  animation: none !important;
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  animation-iteration-count: 1 !important;
  transition: none !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
  caret-color: transparent !important;
  scroll-behavior: auto !important;
}
html { scrollbar-width: none !important; }
::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
/* The dev-only Next.js indicator/overlay host. Never present in production. */
nextjs-portal,
nextjs-dev-overlay,
#__next-build-watcher,
[data-nextjs-toast],
[data-next-badge-root],
[data-nextjs-dev-tools-button] { display: none !important; }
`;

/**
 * Runs before any app script on every document, including soft navigations.
 * `documentElement` can still be null at document-start, so the insert is
 * retried from a MutationObserver as well as DOMContentLoaded.
 */
const FREEZE_BOOTSTRAP = `(() => {
  const CSS = ${JSON.stringify(FREEZE_CSS)};
  const ID = "__shrinkfox_visual_freeze";
  const add = () => {
    const root = document.head || document.documentElement;
    if (!root) return;
    const existing = document.getElementById(ID);
    if (existing) {
      // Keep it last so it always wins the cascade.
      if (existing !== root.lastElementChild) root.appendChild(existing);
      return;
    }
    const style = document.createElement("style");
    style.id = ID;
    style.textContent = CSS;
    root.appendChild(style);
  };
  add();
  document.addEventListener("DOMContentLoaded", add);
  try {
    if (document.documentElement) {
      new MutationObserver(add).observe(document.documentElement, { childList: true });
    }
  } catch {}
  globalThis.__vrFreeze = add;
})();`;

export async function installDeterminism(cdp: CDP): Promise<void> {
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: FREEZE_BOOTSTRAP });
  // Belt and braces: the CSS hides scrollbars, this removes them outright so
  // `innerWidth` and `documentElement.clientWidth` agree on every platform.
  await cdp.send("Emulation.setScrollbarsHidden", { hidden: true }).catch(() => undefined);
}

export async function emulateTheme(cdp: CDP, theme: Theme): Promise<void> {
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [
      { name: "prefers-reduced-motion", value: "reduce" },
      { name: "prefers-color-scheme", value: theme },
      { name: "prefers-contrast", value: "no-preference" },
      { name: "forced-colors", value: "none" },
      { name: "prefers-reduced-transparency", value: "no-preference" },
    ],
  });
}

export async function setViewport(cdp: CDP, width: number, height: number): Promise<void> {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1, // keeps baselines small; see suite docs
    mobile: false, // breakpoints here are width-driven, so this only adds variance
    screenWidth: width,
    screenHeight: height,
    positionX: 0,
    positionY: 0,
    dontSetVisibleSize: false,
  });
}

export async function clearViewport(cdp: CDP): Promise<void> {
  await cdp.send("Emulation.clearDeviceMetricsOverride").catch(() => undefined);
}

/** Counts in-flight requests so captures can wait for a genuinely quiet page. */
export class NetworkQuiet {
  private inflight = 0;
  private changedAt = Date.now();

  constructor(cdp: CDP) {
    const up = () => {
      this.inflight += 1;
      this.changedAt = Date.now();
    };
    const down = () => {
      this.inflight = Math.max(0, this.inflight - 1);
      this.changedAt = Date.now();
    };
    cdp.on("Network.requestWillBeSent", up);
    cdp.on("Network.loadingFinished", down);
    cdp.on("Network.loadingFailed", down);
  }

  reset(): void {
    this.inflight = 0;
    this.changedAt = Date.now();
  }

  async wait(quietMs = 400, timeoutMs = 12_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.inflight === 0 && Date.now() - this.changedAt >= quietMs) return true;
      await sleep(80);
    }
    return false;
  }
}

/**
 * Waits for everything that can still change a pixel after "load": fonts,
 * image decode, and any Web Animation the CSS override did not catch (motion
 * drives some values through WAAPI, which `animation: none` cannot stop).
 */
const SETTLE = `(async () => {
  const report = { fonts: false, images: 0, pending: 0, animations: 0 };
  try { globalThis.__vrFreeze && globalThis.__vrFreeze(); } catch {}

  try {
    await Promise.race([
      document.fonts.ready.then(() => { report.fonts = true; }),
      new Promise((r) => setTimeout(r, 5000)),
    ]);
  } catch {}

  const images = Array.from(document.images);
  report.images = images.length;
  await Promise.all(
    images.map((img) =>
      Promise.race([
        (img.decode ? img.decode() : Promise.resolve()).catch(() => undefined),
        new Promise((r) => setTimeout(r, 4000)),
      ]),
    ),
  );
  report.pending = images.filter((img) => !img.complete).length;

  // Jump every running animation to its end so a capture never lands mid-tween.
  try {
    const running = document.getAnimations();
    report.animations = running.length;
    for (const animation of running) {
      try { animation.finish(); } catch { try { animation.cancel(); } catch {} }
    }
  } catch {}

  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return report;
})()`;

export type SettleReport = {
  fonts: boolean;
  images: number;
  pending: number;
  animations: number;
};

export async function settle(cdp: CDP, extraMs = 150): Promise<SettleReport> {
  const result = await cdp.evaluate<SettleReport>(SETTLE);
  if (extraMs > 0) await sleep(extraMs);
  return result;
}
