/**
 * Pixel comparison, performed inside the browser we already drive.
 *
 * Decoding PNG in Node would mean either a dependency (against this project's
 * whole premise) or a hand-rolled inflate/unfilter decoder. The headless Chrome
 * sitting right there decodes PNG natively, so both images are pushed into a
 * blank page as data URLs, compared on a canvas, and the diff comes back as a
 * ready-made PNG. No image dependency, one code path.
 */
import type { CDP } from "../lib/cdp.ts";

export type DiffResult = {
  width: number;
  height: number;
  baselineWidth: number;
  baselineHeight: number;
  actualWidth: number;
  actualHeight: number;
  sameSize: boolean;
  diffPixels: number;
  totalPixels: number;
  /** Fraction of differing pixels, 0..1. */
  ratio: number;
  /** base64 PNG (no data: prefix), empty when nothing differs. */
  diffPng: string;
};

/**
 * Installed once per blank page. Kept as a string rather than a bundled module
 * so it can be injected without a build step.
 */
const DIFFER = `globalThis.__vrDiff = async (aUrl, bUrl, tolerance) => {
  const load = (src) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("PNG failed to decode"));
      img.src = src;
    });

  const [a, b] = await Promise.all([load(aUrl), load(bUrl)]);
  const width = Math.max(a.naturalWidth, b.naturalWidth);
  const height = Math.max(a.naturalHeight, b.naturalHeight);

  const read = (img) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, width, height).data;
  };

  const base = read(a);
  const next = read(b);

  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const octx = out.getContext("2d");
  const image = octx.createImageData(width, height);
  const px = image.data;

  let differing = 0;
  for (let i = 0; i < base.length; i += 4) {
    const changed =
      Math.abs(base[i] - next[i]) > tolerance ||
      Math.abs(base[i + 1] - next[i + 1]) > tolerance ||
      Math.abs(base[i + 2] - next[i + 2]) > tolerance ||
      Math.abs(base[i + 3] - next[i + 3]) > tolerance;

    if (changed) {
      differing += 1;
      px[i] = 255;
      px[i + 1] = 0;
      px[i + 2] = 170;
      px[i + 3] = 255;
    } else {
      // Washed-out greyscale of the baseline, so the magenta reads instantly.
      const lum = base[i] * 0.299 + base[i + 1] * 0.587 + base[i + 2] * 0.114;
      const v = Math.round(240 - (240 - lum) * 0.22);
      px[i] = v;
      px[i + 1] = v;
      px[i + 2] = v;
      px[i + 3] = 255;
    }
  }
  octx.putImageData(image, 0, 0);

  const total = width * height;
  return {
    width,
    height,
    baselineWidth: a.naturalWidth,
    baselineHeight: a.naturalHeight,
    actualWidth: b.naturalWidth,
    actualHeight: b.naturalHeight,
    sameSize: a.naturalWidth === b.naturalWidth && a.naturalHeight === b.naturalHeight,
    diffPixels: differing,
    totalPixels: total,
    ratio: total === 0 ? 1 : differing / total,
    diffPng: differing > 0 ? out.toDataURL("image/png").slice(22) : "",
  };
};
true`;

const CHUNK = 256 * 1024;

/** Streams a long string into a page global; one evaluate per 256 KB. */
async function pushString(cdp: CDP, name: string, value: string): Promise<void> {
  await cdp.evaluate<boolean>(`(globalThis[${JSON.stringify(name)}] = ""), true`);
  for (let at = 0; at < value.length; at += CHUNK) {
    const part = value.slice(at, at + CHUNK);
    await cdp.evaluate<boolean>(
      `(globalThis[${JSON.stringify(name)}] += ${JSON.stringify(part)}), true`,
    );
  }
}

export async function installDiffer(cdp: CDP): Promise<void> {
  await cdp.evaluate<boolean>(DIFFER);
}

/**
 * `tolerance` is per channel (0-255). A couple of levels absorbs sub-pixel
 * antialiasing jitter without hiding a real colour or position change.
 */
export async function comparePngs(
  cdp: CDP,
  baselineBase64: string,
  actualBase64: string,
  tolerance = 4,
): Promise<DiffResult> {
  await pushString(cdp, "__vrA", `data:image/png;base64,${baselineBase64}`);
  await pushString(cdp, "__vrB", `data:image/png;base64,${actualBase64}`);
  const result = await cdp.evaluate<DiffResult>(
    `__vrDiff(globalThis.__vrA, globalThis.__vrB, ${tolerance})`,
  );
  await cdp.evaluate<boolean>(`(globalThis.__vrA = ""), (globalThis.__vrB = ""), true`);
  return result;
}
