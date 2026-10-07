/**
 * Shared plumbing for the performance suites.
 *
 * Everything here is measurement-only: it drives the real app through the
 * DevTools Protocol and reads numbers back out. No suite is allowed to change
 * application behaviour to make a number look better.
 *
 * Two deliberate choices:
 *
 *  - Page-side instrumentation is installed with
 *    `Page.addScriptToEvaluateOnNewDocument`, so the observers exist before any
 *    application script runs and survive every navigation in the session. A
 *    `PerformanceObserver` attached after load would miss the long tasks that
 *    hydration itself produces, which are exactly the ones worth seeing.
 *  - Polling from Node is kept to O(1) selector lookups. Reading
 *    `document.body.innerText` forces a full layout, which would show up in the
 *    very long-task measurement it is meant to observe.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { type CDP, TEST_IMAGES, waitFor } from "../../lib/cdp.ts";

export const PERF_IMAGES = join(process.env.TEMP ?? "/tmp", "shrinkfox-perf-images");

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Source fixtures, by the role they play in a measurement.
 *
 * `heavy` is a 1.9 MP photographic PNG — hard to compress, so it exercises the
 * quality search rather than returning instantly. `tiny` exists so the list
 * suite measures list rendering and not codec time.
 */
export const SOURCES = {
  heavy: "photo-1600x1200.png",
  mid: "alpha-logo-800x800.png",
  light: "flat-ui-1200x800.png",
  tiny: "tiny-64x64.png",
} as const;

export type SourceKind = keyof typeof SOURCES;

export function assertFixtures(): void {
  const missing = Object.values(SOURCES).filter((name) => !existsSync(join(TEST_IMAGES, name)));
  if (missing.length > 0) {
    throw new Error(
      `Missing fixtures in ${TEST_IMAGES}: ${missing.join(", ")}. Run: npm run test:images`,
    );
  }
}

/**
 * Materialises `count` real files on disk by cycling `recipe`.
 *
 * Real paths matter: `DOM.setFileInputFiles` is the only way to put genuine
 * `File` handles into the page, and a synthesised `File` built in page script
 * would not exercise the same ingest path a user does.
 *
 * Keeping the cycle length constant across batch sizes is what makes the 10 vs
 * 30 vs 60 comparison honest — every batch has the same mix of work per image.
 */
export function fixtureSet(label: string, recipe: SourceKind[], count: number): string[] {
  const dir = join(PERF_IMAGES, label);
  mkdirSync(dir, { recursive: true });

  const existing = new Set(readdirSync(dir));
  const paths: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const kind = recipe[i % recipe.length]!;
    const name = `${String(i).padStart(4, "0")}-${SOURCES[kind]}`;
    const target = join(dir, name);
    if (!existing.has(name)) copyFileSync(join(TEST_IMAGES, SOURCES[kind]), target);
    paths.push(target);
  }
  return paths;
}

export function totalBytes(paths: string[]): number {
  return paths.reduce((sum, p) => sum + statSync(p).size, 0);
}

/* -------------------------------------------------------------------------- */
/* Page-side instrumentation                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Installed before any application script. Everything it collects hangs off
 * `window.__perf`, which the suites read with `Runtime.evaluate`.
 */
export const INSTRUMENT = `
(() => {
  if (window.__perf) return;
  var perf = {
    longTasks: [],
    frames: [],
    samples: [],
    lcp: 0,
    fcp: 0,
    cls: 0,
    shifts: 0,
    objectUrls: { created: 0, revoked: 0, live: 0 },
    errors: {},
  };
  window.__perf = perf;

  function observe(type, handler) {
    try {
      new PerformanceObserver(function (list) {
        var entries = list.getEntries();
        for (var i = 0; i < entries.length; i += 1) handler(entries[i]);
      }).observe({ type: type, buffered: true });
    } catch (error) {
      perf.errors[type] = String(error);
    }
  }

  observe('longtask', function (entry) {
    perf.longTasks.push({ start: entry.startTime, duration: entry.duration, name: entry.name });
  });
  observe('largest-contentful-paint', function (entry) {
    if (entry.startTime > perf.lcp) perf.lcp = entry.startTime;
  });
  observe('paint', function (entry) {
    if (entry.name === 'first-contentful-paint') perf.fcp = entry.startTime;
  });
  observe('layout-shift', function (entry) {
    if (entry.hadRecentInput) return;
    perf.cls += entry.value;
    perf.shifts += 1;
    (perf.shiftLog = perf.shiftLog || []).push({ at: entry.startTime, value: entry.value });
  });

  // Object-URL accounting. ImageBitmaps and blobs do not live on the JS heap,
  // so a heap reading alone cannot see them leak; the live count can.
  var live = new Set();
  var create = URL.createObjectURL.bind(URL);
  var revoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = function (object) {
    var url = create(object);
    live.add(url);
    perf.objectUrls.created += 1;
    perf.objectUrls.live = live.size;
    return url;
  };
  URL.revokeObjectURL = function (url) {
    if (live.delete(url)) perf.objectUrls.revoked += 1;
    perf.objectUrls.live = live.size;
    return revoke(url);
  };
  perf.liveUrls = function () { return Array.from(live); };

  // Frame-gap recorder: the independent read on whether the page still paints.
  var rafId = 0;
  var last = 0;
  perf.startFrames = function () {
    perf.frames.length = 0;
    last = performance.now();
    var tick = function (now) {
      perf.frames.push(now - last);
      last = now;
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  };
  perf.stopFrames = function () {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    return perf.frames.slice();
  };

  // Batch progress, read through the same ARIA surface a screen reader uses.
  perf.bar = function () {
    return document.querySelector('[role="progressbar"][aria-label="Batch progress"]');
  };
  perf.busy = function () { return !!perf.bar(); };
  perf.percent = function () {
    var bar = perf.bar();
    return bar ? Number(bar.getAttribute('aria-valuenow')) : -1;
  };

  var samplerId = 0;
  perf.startSampler = function (interval) {
    perf.samples = [];
    var t0 = performance.now();
    samplerId = setInterval(function () {
      perf.samples.push([Math.round(performance.now() - t0), perf.percent()]);
    }, interval || 40);
  };
  perf.stopSampler = function () {
    clearInterval(samplerId);
    samplerId = 0;
    return perf.samples;
  };

  perf.rows = function () { return document.querySelectorAll('ul li').length; };
  perf.nodes = function () { return document.getElementsByTagName('*').length; };

  perf.click = function (label) {
    var buttons = Array.prototype.slice.call(document.querySelectorAll('button'));
    for (var i = 0; i < buttons.length; i += 1) {
      if (buttons[i].textContent.trim() === label) { buttons[i].click(); return true; }
    }
    return false;
  };
  perf.start = function () {
    var buttons = Array.prototype.slice.call(document.querySelectorAll('button'));
    for (var i = 0; i < buttons.length; i += 1) {
      if (/^(Start|Process remaining)$/.test(buttons[i].textContent.trim())) {
        buttons[i].click();
        return true;
      }
    }
    return false;
  };

  // Nearest scrollable ancestor of the job list.
  perf.scroller = function () {
    var ul = document.querySelector('ul');
    var node = ul ? ul.parentElement : null;
    while (node && node.scrollHeight <= node.clientHeight + 1) node = node.parentElement;
    return node;
  };
})();
`;

export async function installInstrumentation(cdp: CDP): Promise<void> {
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: INSTRUMENT });
}

/* -------------------------------------------------------------------------- */
/* Driving the workspace                                                       */
/* -------------------------------------------------------------------------- */

export type LongTask = { start: number; duration: number; name: string };

const FILE_INPUT = "input[type=file]:not([webkitdirectory])";

/** Navigates to a fresh `/app`, discarding any previous document and queue. */
export async function openWorkspace(cdp: CDP, base: string): Promise<void> {
  await cdp.send("Page.navigate", { url: "about:blank" });
  await cdp.send("Page.navigate", { url: `${base}/app` });
  await waitFor("workspace file input", 60_000, async () =>
    cdp.evaluate<boolean>(`!!document.querySelector(${JSON.stringify(FILE_INPUT)}) && !!window.__perf`),
  );
}

export async function feedFiles(cdp: CDP, paths: string[]): Promise<number> {
  await cdp.setFiles(FILE_INPUT, paths);
  return waitFor("queue rows", 90_000, async () => {
    const rows = await cdp.evaluate<number>(`window.__perf.rows()`);
    return rows > 0 ? rows : null;
  }, 150);
}

/** Clicks Start and returns the page-clock timestamp of the click. */
export async function startBatch(cdp: CDP): Promise<number> {
  const at = await cdp.evaluate<number | null>(
    `(() => (window.__perf.start() ? performance.now() : null))()`,
  );
  if (at === null) throw new Error("No Start / Process remaining button found");
  return at;
}

/**
 * Waits for the batch to drain.
 *
 * The live-progress panel only exists while the run state is running or paused,
 * so its absence is the cheapest reliable "done" signal — one selector lookup,
 * no layout. Two consecutive idle reads guard against the brief window between
 * clicking Start and React committing the panel.
 */
export async function waitForBatchIdle(cdp: CDP, timeoutMs = 600_000): Promise<number> {
  await waitFor("batch to start", 30_000, async () =>
    cdp.evaluate<boolean>(`window.__perf.busy() || window.__perf.percent() === 100`), 50,
  );
  let idle = 0;
  const finishedAt = await waitFor<number>(
    "batch to finish",
    timeoutMs,
    async () => {
      const busy = await cdp.evaluate<boolean>(`window.__perf.busy()`);
      if (busy) {
        idle = 0;
        return null;
      }
      idle += 1;
      return idle >= 2 ? cdp.evaluate<number>(`performance.now()`) : null;
    },
    60,
  );
  return finishedAt;
}

export async function clearQueue(cdp: CDP): Promise<void> {
  await cdp.evaluate(`window.__perf.click('Clear all')`);
  await waitFor("queue to empty", 30_000, async () =>
    cdp.evaluate<boolean>(`window.__perf.rows() === 0`), 100,
  );
}

/** Counts dedicated workers in the browser, excluding the PWA service worker. */
export async function workerTargets(cdp: CDP): Promise<Array<{ url: string; title: string }>> {
  const result = await cdp.send<{
    targetInfos: Array<{ type: string; url: string; title: string }>;
  }>("Target.getTargets");
  return result.targetInfos
    .filter((t) => t.type === "worker")
    .map((t) => ({ url: t.url, title: t.title }));
}

/* -------------------------------------------------------------------------- */
/* Network capture                                                             */
/* -------------------------------------------------------------------------- */

export type NetEntry = {
  url: string;
  resourceType: string;
  mimeType: string;
  bytes: number;
  fromCache: boolean;
};

export function captureNetwork(cdp: CDP) {
  const byId = new Map<string, NetEntry>();

  cdp.on<{ requestId: string; request: { url: string }; type?: string }>(
    "Network.requestWillBeSent",
    (p) => {
      byId.set(p.requestId, {
        url: p.request.url,
        resourceType: p.type ?? "Other",
        mimeType: "",
        bytes: 0,
        fromCache: false,
      });
    },
  );

  cdp.on<{
    requestId: string;
    type?: string;
    response: { mimeType: string; fromDiskCache?: boolean; encodedDataLength?: number };
  }>("Network.responseReceived", (p) => {
    const entry = byId.get(p.requestId);
    if (!entry) return;
    entry.mimeType = p.response.mimeType;
    entry.fromCache = Boolean(p.response.fromDiskCache);
    if (p.type) entry.resourceType = p.type;
  });

  cdp.on<{ requestId: string; encodedDataLength: number }>("Network.loadingFinished", (p) => {
    const entry = byId.get(p.requestId);
    if (entry) entry.bytes = p.encodedDataLength;
  });

  return {
    entries: () => [...byId.values()],
    reset: () => byId.clear(),
  };
}

export const isScript = (entry: NetEntry): boolean =>
  entry.resourceType === "Script" ||
  /javascript|ecmascript/i.test(entry.mimeType) ||
  /\.m?js(\?|$)/.test(new URL(entry.url, "http://x").pathname);

/**
 * The image engine's worker chunk, as distinct from the PWA service worker.
 *
 * Turbopack names the chunk after the module path, so both the dev
 * (`src_workers_image_worker_ts`) and production spellings are matched.
 */
export const isEngineWorkerChunk = (url: string): boolean =>
  /image[._-]?worker|studio[._-]?worker/i.test(url);

export const isServiceWorker = (url: string): boolean =>
  /\/sw\.js(\?|$)/.test(url) || /service[._-]?worker/i.test(url);

/* -------------------------------------------------------------------------- */
/* Statistics and formatting                                                   */
/* -------------------------------------------------------------------------- */

export function median(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index]!;
}

export const mb = (bytes: number): string => `${(bytes / 1_000_000).toFixed(2)} MB`;
export const kb = (bytes: number): string => `${(bytes / 1000).toFixed(1)} kB`;
export const ms = (value: number): string => `${Math.round(value)} ms`;

/* -------------------------------------------------------------------------- */
/* Result rows for the final table                                             */
/* -------------------------------------------------------------------------- */

export type Row = { suite: string; metric: string; value: string; note: string };

export class Measurements {
  readonly rows: Row[] = [];
  constructor(private readonly suite: string) {}
  record(metric: string, value: string, note = ""): void {
    this.rows.push({ suite: this.suite, metric, value, note });
    console.log(`        ${metric.padEnd(44)} ${value}${note ? `   (${note})` : ""}`);
  }
}

export function printTable(rows: Row[]): void {
  const widths = [
    Math.max(...rows.map((r) => r.suite.length), 5),
    Math.max(...rows.map((r) => r.metric.length), 6),
    Math.max(...rows.map((r) => r.value.length), 5),
  ];
  const line = (a: string, b: string, c: string, d: string) =>
    `| ${a.padEnd(widths[0]!)} | ${b.padEnd(widths[1]!)} | ${c.padEnd(widths[2]!)} | ${d} |`;
  console.log(`\n${line("Suite", "Metric", "Value", "Notes")}`);
  console.log(
    `|${"-".repeat(widths[0]! + 2)}|${"-".repeat(widths[1]! + 2)}|${"-".repeat(widths[2]! + 2)}|------|`,
  );
  for (const row of rows) console.log(line(row.suite, row.metric, row.value, row.note));
}
