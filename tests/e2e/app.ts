/**
 * The application driver.
 *
 * Every suite talks to ShrinkFox through this module, and this module only ever
 * does what a user can do: click a real control, type into a real field, read
 * the rendered row. Nothing reaches into the store or calls an engine function
 * directly, because a test that drives the internals cannot tell you whether the
 * product works.
 *
 * Page-side code is written as ordinary functions and serialised with
 * `Function.prototype.toString()`, so it is type-checked by `tsc` like the rest
 * of the suite instead of hiding in template strings.
 */
import { CDP, waitFor, sleep } from "../lib/cdp.ts";

/* -------------------------------------------------------------------------- */
/* Evaluating typed functions in the page                                      */
/* -------------------------------------------------------------------------- */

export function evalIn<A extends unknown[], R>(
  cdp: CDP,
  fn: (...args: A) => R,
  ...args: A
): Promise<Awaited<R>> {
  return cdp.evaluate<Awaited<R>>(`(${fn.toString()}).apply(null, ${JSON.stringify(args)})`);
}

/* -------------------------------------------------------------------------- */
/* Page shape                                                                  */
/* -------------------------------------------------------------------------- */

export type RowSnapshot = {
  index: number;
  name: string;
  status: "queued" | "processing" | "done" | "failed" | "cancelled";
  text: string;
  badges: string[];
  previewUrl: string | null;
  outWidth: number | null;
  outHeight: number | null;
  outFormat: string | null;
  selected: boolean;
};

export type QueueSnapshot = {
  rows: RowSnapshot[];
  runLabel: "idle" | "running" | "paused";
  buttons: string[];
  stats: Record<string, string>;
  summary: string | null;
};

/** One page function, used by every "what does the queue look like now" read. */
function readQueue(): QueueSnapshot {
  const text = (node: Element | null | undefined): string =>
    (node?.textContent ?? "").replace(/\s+/g, " ").trim();

  const rows = Array.from(document.querySelectorAll("ul li")).map((li, index) => {
    const nameEl = li.querySelector("p[title]");
    const box = li.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    const img = li.querySelector("img") as HTMLImageElement | null;
    const hasDownload = !!li.querySelector('button[aria-label^="Download "]');
    const hasRetry = !!li.querySelector('button[aria-label^="Retry "]');
    const hasCancel = !!li.querySelector('button[aria-label^="Cancel "]');
    const whole = text(li);

    const badgeHost = Array.from(li.children).find(
      (el) =>
        el.tagName === "DIV" &&
        typeof el.className === "string" &&
        el.className.includes("sm:flex"),
    );
    const badges = badgeHost
      ? Array.from(badgeHost.children)
          .map((el) => text(el))
          .filter((t) => t.length > 0)
      : [];

    // The result paragraph lays its facts out as sibling spans:
    // original → output · W x H · FORMAT
    const paragraphs = Array.from(li.querySelectorAll("p"));
    const info = paragraphs[1] ?? null;
    const spans = info ? Array.from(info.querySelectorAll("span")).map((s) => text(s)) : [];
    const dims = /(\d+)\s*x\s*(\d+)/.exec(text(info));

    let status: RowSnapshot["status"] = "queued";
    if (hasCancel) status = "processing";
    else if (hasDownload) status = "done";
    else if (hasRetry) status = /cancelled/i.test(whole) ? "cancelled" : "failed";

    return {
      index,
      name: nameEl?.getAttribute("title") ?? "",
      status,
      text: whole,
      badges,
      previewUrl: img?.getAttribute("src") ?? null,
      outWidth: status === "done" && dims ? Number(dims[1]) : null,
      outHeight: status === "done" && dims ? Number(dims[2]) : null,
      outFormat: status === "done" && spans.length >= 7 ? spans[6]! : null,
      selected: box ? box.checked : false,
    };
  });

  const buttons = Array.from(document.querySelectorAll("button"))
    .map((b) => text(b))
    .filter((t) => t.length > 0);

  const body = (document.body.innerText || "").replace(/\s+/g, " ");
  const runLabel = /Shrinking\.\.\./.test(body)
    ? "running"
    : /\bPaused\b/.test(body)
      ? "paused"
      : "idle";

  const stats: Record<string, string> = {};
  for (const card of Array.from(document.querySelectorAll("div"))) {
    const ps = Array.from(card.children).filter((c) => c.tagName === "P");
    if (ps.length >= 2 && /^(Images|Original|Output|Saved)$/.test(text(ps[0]))) {
      stats[text(ps[0])] = text(ps[1]);
    }
  }

  const summary = /Your images are ready\./.test(body) ? body : null;

  return { rows, runLabel, buttons, stats, summary };
}

export function snapshot(cdp: CDP): Promise<QueueSnapshot> {
  return evalIn(cdp, readQueue);
}

export function rows(cdp: CDP): Promise<RowSnapshot[]> {
  return snapshot(cdp).then((s) => s.rows);
}

export function counts(snap: QueueSnapshot) {
  const by = (status: RowSnapshot["status"]) =>
    snap.rows.filter((r) => r.status === status).length;
  return {
    total: snap.rows.length,
    queued: by("queued"),
    processing: by("processing"),
    done: by("done"),
    failed: by("failed"),
    cancelled: by("cancelled"),
  };
}

/* -------------------------------------------------------------------------- */
/* Navigation and input                                                        */
/* -------------------------------------------------------------------------- */

/**
 * A desktop viewport.
 *
 * Not cosmetic: below 1024px the settings move into a bottom sheet and below
 * 640px the outcome badges are hidden entirely, so a default 800x600 headless
 * window would make several assertions test the wrong layout.
 */
export async function setDesktopViewport(cdp: CDP, width = 1600, height = 1200) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
}

export async function openApp(cdp: CDP, base: string) {
  await setDesktopViewport(cdp);
  await cdp.send("Page.navigate", { url: `${base}/app` });
  await waitFor("workspace file input", 60_000, () =>
    evalIn(cdp, () => !!document.querySelector('input[type="file"]')),
  );
}

export async function addFiles(cdp: CDP, paths: string[]) {
  const before = (await rows(cdp)).length;
  await cdp.setFiles('input[type="file"]:not([webkitdirectory])', paths);
  await waitFor(
    `${paths.length} rows to appear`,
    60_000,
    async () => {
      const n = (await rows(cdp)).length;
      return n >= before + paths.length ? n : null;
    },
    150,
  );
}

export async function clickButton(cdp: CDP, label: string): Promise<boolean> {
  return evalIn(
    cdp,
    (want: string) => {
      const button = Array.from(document.querySelectorAll("button")).find(
        (b) => (b.textContent ?? "").replace(/\s+/g, " ").trim() === want && !b.disabled,
      );
      if (!button) return false;
      button.click();
      return true;
    },
    label,
  );
}

export async function clickButtonMatching(cdp: CDP, pattern: string): Promise<boolean> {
  return evalIn(
    cdp,
    (source: string) => {
      const re = new RegExp(source);
      const button = Array.from(document.querySelectorAll("button")).find(
        (b) => re.test((b.textContent ?? "").replace(/\s+/g, " ").trim()) && !b.disabled,
      );
      if (!button) return false;
      button.click();
      return true;
    },
    pattern,
  );
}

export async function clickAria(cdp: CDP, label: string): Promise<boolean> {
  return evalIn(
    cdp,
    (want: string) => {
      const el = document.querySelector(
        `button[aria-label="${want.replace(/"/g, '\\"')}"]`,
      ) as HTMLButtonElement | null;
      if (!el || el.disabled) return false;
      el.click();
      return true;
    },
    label,
  );
}

export async function buttonState(
  cdp: CDP,
  label: string,
): Promise<{ present: boolean; disabled: boolean }> {
  return evalIn(
    cdp,
    (want: string) => {
      const button = Array.from(document.querySelectorAll("button")).find(
        (b) => (b.textContent ?? "").replace(/\s+/g, " ").trim() === want,
      );
      return { present: !!button, disabled: button ? button.disabled : false };
    },
    label,
  );
}

/* -------------------------------------------------------------------------- */
/* Running the queue                                                           */
/* -------------------------------------------------------------------------- */

function queueState() {
  const buttons = Array.from(document.querySelectorAll("button")).map((b) =>
    (b.textContent ?? "").replace(/\s+/g, " ").trim(),
  );
  return {
    idleControl: buttons.some((t) => t === "Start" || t === "Process remaining"),
    processing: Array.from(document.querySelectorAll("ul li")).filter((li) =>
      li.querySelector('button[aria-label^="Cancel "]'),
    ).length,
    rows: document.querySelectorAll("ul li").length,
  };
}

export async function start(cdp: CDP): Promise<boolean> {
  const clicked =
    (await clickButton(cdp, "Start")) || (await clickButton(cdp, "Process remaining"));
  if (!clicked) return false;
  // Let React flush the run-state change before anyone polls for "idle".
  await sleep(250);
  return true;
}

export async function waitIdle(cdp: CDP, timeoutMs = 240_000) {
  await waitFor(
    "the queue to drain",
    timeoutMs,
    async () => {
      const state = await evalIn(cdp, queueState);
      return state.rows > 0 && state.idleControl && state.processing === 0 ? state : null;
    },
    250,
  );
  // One more frame so the result row has painted its badges.
  await sleep(120);
}

export async function runQueue(cdp: CDP, timeoutMs = 240_000): Promise<boolean> {
  if (!(await start(cdp))) return false;
  await waitIdle(cdp, timeoutMs);
  return true;
}

export async function clearAll(cdp: CDP) {
  await setRenamePattern(cdp, "");
  const had = (await rows(cdp)).length;
  if (had === 0) return;
  await clickButton(cdp, "Clear all");
  await waitFor(
    "the queue to empty",
    20_000,
    async () => ((await rows(cdp)).length === 0 ? true : null),
    150,
  );
}

/* -------------------------------------------------------------------------- */
/* Settings panel                                                              */
/* -------------------------------------------------------------------------- */

/** The panel only mounts once the queue is non-empty, so add files first. */
export async function waitForSettings(cdp: CDP) {
  await waitFor("the codec probe to resolve", 30_000, () =>
    evalIn(cdp, () => {
      const select = document.querySelector(
        'select[aria-label="Output format"]',
      ) as HTMLSelectElement | null;
      return !!select && !select.disabled;
    }),
  );
}

export type FormatOption = { value: string; label: string; disabled: boolean };

export async function formatOptions(cdp: CDP): Promise<FormatOption[]> {
  return evalIn(cdp, () => {
    const select = document.querySelector(
      'select[aria-label="Output format"]',
    ) as HTMLSelectElement | null;
    if (!select) return [];
    return Array.from(select.options).map((o) => ({
      value: o.value,
      label: (o.textContent ?? "").trim(),
      disabled: o.disabled,
    }));
  });
}

export async function setSelect(
  cdp: CDP,
  ariaLabel: string,
  value: string,
): Promise<"ok" | "missing" | "no-option" | "disabled"> {
  return evalIn(
    cdp,
    (label: string, want: string) => {
      const select = document.querySelector(
        `select[aria-label="${label}"]`,
      ) as HTMLSelectElement | null;
      if (!select) return "missing";
      const option = Array.from(select.options).find((o) => o.value === want);
      if (!option) return "no-option";
      if (option.disabled) return "disabled";
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype,
        "value",
      )?.set;
      setter?.call(select, want);
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return "ok";
    },
    ariaLabel,
    value,
  );
}

/**
 * Sets a React-controlled input the way a user's keystroke would.
 *
 * Assigning `.value` directly is swallowed: React's value tracker sees no change
 * and never fires `onChange`. Going through the prototype setter updates the
 * node without touching the tracker, so the dispatched event is believed.
 */
export async function setTextField(
  cdp: CDP,
  ariaLabel: string,
  value: string,
): Promise<boolean> {
  return evalIn(
    cdp,
    (label: string, next: string) => {
      const el = document.querySelector(
        `input[aria-label="${label}"]`,
      ) as HTMLInputElement | null;
      if (!el) return false;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(el, next);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    },
    ariaLabel,
    value,
  );
}

export async function setRenamePattern(cdp: CDP, value: string) {
  return setTextField(cdp, "Rename pattern", value);
}

export async function setSlider(cdp: CDP, labelText: string, value: number): Promise<boolean> {
  return evalIn(
    cdp,
    (want: string, next: number) => {
      const inputs = Array.from(
        document.querySelectorAll('input[type="range"]'),
      ) as HTMLInputElement[];
      const labels = Array.from(document.querySelectorAll("label"));
      const el = inputs.find((input) => {
        const label = labels.find((l) => l.getAttribute("for") === input.id);
        return !!label && (label.textContent ?? "").trim() === want;
      });
      if (!el) return false;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(el, String(next));
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    },
    labelText,
    value,
  );
}

export async function setSegment(
  cdp: CDP,
  groupLabel: string,
  optionLabel: string,
): Promise<boolean> {
  return evalIn(
    cdp,
    (group: string, option: string) => {
      const host = document.querySelector(`[role="radiogroup"][aria-label="${group}"]`);
      if (!host) return false;
      const button = Array.from(host.querySelectorAll('button[role="radio"]')).find(
        (b) => (b.textContent ?? "").replace(/\s+/g, " ").trim() === option,
      ) as HTMLButtonElement | null;
      if (!button || button.disabled) return false;
      button.click();
      return true;
    },
    groupLabel,
    optionLabel,
  );
}

export async function setSwitch(cdp: CDP, label: string, on: boolean): Promise<boolean> {
  return evalIn(
    cdp,
    (want: string, next: boolean) => {
      const el = document.querySelector(
        `button[role="switch"][aria-label="${want}"]`,
      ) as HTMLButtonElement | null;
      if (!el) return false;
      const checked = el.getAttribute("aria-checked") === "true";
      if (checked !== next) el.click();
      return true;
    },
    label,
    on,
  );
}

export async function readSwitch(cdp: CDP, label: string): Promise<boolean | null> {
  return evalIn(
    cdp,
    (want: string) => {
      const el = document.querySelector(`button[role="switch"][aria-label="${want}"]`);
      if (!el) return null;
      return el.getAttribute("aria-checked") === "true";
    },
    label,
  );
}

export async function setMatteColour(cdp: CDP, hex: string): Promise<boolean> {
  return evalIn(
    cdp,
    (value: string) => {
      const el = document.querySelector(
        'input[aria-label="Background colour for transparent areas"]',
      ) as HTMLInputElement | null;
      if (!el) return false;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    },
    hex,
  );
}

/* -------------------------------------------------------------------------- */
/* Composite settings helpers                                                  */
/* -------------------------------------------------------------------------- */

export type ResizeSetting = {
  mode: string;
  width?: number;
  height?: number;
  percentage?: number;
  maintainAspectRatio?: boolean;
  preventUpscale?: boolean;
};

export async function applyResize(cdp: CDP, resize: ResizeSetting) {
  const applied = await setSelect(cdp, "Resize mode", resize.mode);
  if (applied !== "ok") throw new Error(`Could not pick resize mode ${resize.mode}: ${applied}`);
  if (resize.percentage !== undefined) await setSlider(cdp, "Scale", resize.percentage);
  if (resize.width !== undefined) await setTextField(cdp, "Width", String(resize.width));
  if (resize.height !== undefined) await setTextField(cdp, "Height", String(resize.height));
  if (resize.maintainAspectRatio !== undefined) {
    await setSwitch(cdp, "Keep aspect ratio", resize.maintainAspectRatio);
  }
  if (resize.preventUpscale !== undefined) {
    await setSwitch(cdp, "Never enlarge", resize.preventUpscale);
  }
}

export type CompressionSetting =
  | { mode: "Smart" }
  | { mode: "Quality"; quality: number }
  | { mode: "Lossless" }
  | { mode: "Target"; targetBytes?: number; targetText?: string; allowDownscale?: boolean };

export async function applyCompression(cdp: CDP, setting: CompressionSetting) {
  if (!(await setSegment(cdp, "Compression mode", setting.mode))) {
    throw new Error(`Compression mode "${setting.mode}" is not offered`);
  }
  await sleep(80);
  if (setting.mode === "Quality") {
    if (!(await setSlider(cdp, "Quality", setting.quality))) {
      throw new Error("Quality slider did not render in Quality mode");
    }
  }
  if (setting.mode === "Target") {
    if (setting.targetText !== undefined) {
      await setTextField(cdp, "Custom target size", setting.targetText);
    }
    if (setting.allowDownscale !== undefined) {
      await setSwitch(cdp, "Reduce dimensions if needed", setting.allowDownscale);
    }
  }
  await sleep(80);
}

/** `keep`, `auto`, `jpeg`, `png`, `webp`, `avif`. */
export async function applyFormat(cdp: CDP, value: string) {
  return setSelect(cdp, "Output format", value);
}

/* -------------------------------------------------------------------------- */
/* Reading output bytes back                                                   */
/* -------------------------------------------------------------------------- */

export type DecodedOutput =
  | {
      ok: true;
      type: string;
      size: number;
      width: number;
      height: number;
      head: number[];
      corner: number[];
      centre: number[];
    }
  | { ok: false; error: string };

/**
 * Fetches a row's preview object URL inside the page and decodes it.
 *
 * This is the assertion that matters: the row can claim any size, format and
 * dimension it likes, but only bytes that `createImageBitmap` accepts are an
 * image the user can actually open.
 */
export async function decodeOutput(cdp: CDP, url: string): Promise<DecodedOutput> {
  return evalIn(
    cdp,
    async (src: string) => {
      try {
        const response = await fetch(src);
        const blob = await response.blob();
        const head = Array.from(new Uint8Array(await blob.slice(0, 16).arrayBuffer()));
        const bitmap = await createImageBitmap(blob);
        const width = bitmap.width;
        const height = bitmap.height;
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext("2d");
        if (!ctx) return { ok: false, error: "no 2d context" };
        ctx.drawImage(bitmap, 0, 0);
        const corner = Array.from(ctx.getImageData(0, 0, 1, 1).data);
        const centre = Array.from(
          ctx.getImageData(Math.floor(width / 2), Math.floor(height / 2), 1, 1).data,
        );
        bitmap.close();
        canvas.width = 1;
        canvas.height = 1;
        return {
          ok: true,
          type: blob.type,
          size: blob.size,
          width,
          height,
          head,
          corner,
          centre,
        };
      } catch (cause) {
        return { ok: false, error: String(cause) };
      }
    },
    url,
  );
}

/** Container sniffing from the first bytes, independent of any claimed MIME. */
export function sniffBytes(head: number[]): string {
  const b = head;
  const ascii = (at: number, len: number) =>
    b
      .slice(at, at + len)
      .map((n) => String.fromCharCode(n))
      .join("");
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (ascii(0, 8) === "\x89PNG\r\n\x1a\n") return "png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "webp";
  if (ascii(4, 4) === "ftyp" && /avif|avis|mif1|msf1/.test(ascii(8, 4))) return "avif";
  if (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a") return "gif";
  if (b[0] === 0x42 && b[1] === 0x4d) return "bmp";
  return "unknown";
}

/* -------------------------------------------------------------------------- */
/* Selection                                                                   */
/* -------------------------------------------------------------------------- */

export type SelectAllState = { checked: boolean; indeterminate: boolean; text: string };

export async function selectAllState(cdp: CDP): Promise<SelectAllState | null> {
  return evalIn(cdp, () => {
    const label = Array.from(document.querySelectorAll("label")).find((l) =>
      /\bof \d+ selected\b/.test(l.textContent ?? ""),
    );
    const box = label?.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    if (!label || !box) return null;
    return {
      checked: box.checked,
      indeterminate: box.indeterminate,
      text: (label.textContent ?? "").replace(/\s+/g, " ").trim(),
    };
  });
}

export async function clickSelectAll(cdp: CDP): Promise<boolean> {
  return evalIn(cdp, () => {
    const label = Array.from(document.querySelectorAll("label")).find((l) =>
      /\bof \d+ selected\b/.test(l.textContent ?? ""),
    );
    const box = label?.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    if (!box) return false;
    box.click();
    return true;
  });
}

export async function clickRowCheckbox(cdp: CDP, index: number): Promise<boolean> {
  return evalIn(
    cdp,
    (at: number) => {
      const li = document.querySelectorAll("ul li")[at];
      const box = li?.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
      if (!box) return false;
      box.click();
      return true;
    },
    index,
  );
}

/* -------------------------------------------------------------------------- */
/* Responsiveness                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Round-trip latency of a trivial main-thread evaluation.
 *
 * `Runtime.evaluate` runs on the page's main thread, so a slow answer here is
 * exactly what a user would feel as a frozen tab.
 */
export async function mainThreadLatency(cdp: CDP): Promise<number> {
  const started = Date.now();
  await evalIn(cdp, () => document.readyState);
  return Date.now() - started;
}
