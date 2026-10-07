/** Run with: node --experimental-strip-types scripts/test-engines.ts */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runInThisContext } from "node:vm";
import ts from "typescript";
import type { CodecSupport } from "../src/codecs/capabilities.ts";
import type { ResizeOptions } from "../src/types/options.ts";

// Compile the actual source modules in memory so aliases work without adding
// a test runner or changing the application's bundler configuration.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cache = new Map<string, { exports: Record<string, unknown> }>();
function loadModule<T>(filename: string): T {
  const path = resolve(root, filename);
  const found = cache.get(path);
  if (found) return found.exports as T;
  const moduleRecord = { exports: {} as Record<string, unknown> };
  cache.set(path, moduleRecord);
  const compiled = ts.transpileModule(readFileSync(path, "utf8").replaceAll("import.meta.url", JSON.stringify(pathToFileURL(path).href)), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const execute = runInThisContext(`(function(module,exports,require){${compiled}\n})`, { filename: path }) as
    (module: { exports: Record<string, unknown> }, exports: Record<string, unknown>, require: (specifier: string) => unknown) => void;
  execute(moduleRecord, moduleRecord.exports, (specifier) => {
    const base = specifier.startsWith("@/") ? resolve(root, "src", specifier.slice(2)) : resolve(dirname(path), specifier);
    return loadModule(base.endsWith(".ts") ? base : `${base}.ts`);
  });
  return moduleRecord.exports as T;
}

const { readHeaderDimensions } = loadModule<typeof import("../src/engines/header.ts")>("src/engines/header.ts");
const { computeResizePlan } = loadModule<typeof import("../src/engines/resize.ts")>("src/engines/resize.ts");
const { processImage, resolveOutputFormat } = loadModule<typeof import("../src/engines/pipeline.ts")>("src/engines/pipeline.ts");
const { validateDimensions, toProcessingError } = loadModule<typeof import("../src/engines/validate.ts")>("src/engines/validate.ts");
const { quantize } = loadModule<typeof import("../src/engines/quantize.ts")>("src/engines/quantize.ts");
const { buildExifSegment, injectExif, readExif } = loadModule<typeof import("../src/lib/exif.ts")>("src/lib/exif.ts");
const { createZip, uniqueNames } = loadModule<typeof import("../src/lib/zip.ts")>("src/lib/zip.ts");
const { buildManifest } = loadModule<typeof import("../src/services/download-service.ts")>("src/services/download-service.ts");
const { DEFAULT_OPTIONS } = loadModule<typeof import("../src/types/options.ts")>("src/types/options.ts");
const { WorkerPool } = loadModule<typeof import("../src/workers/pool.ts")>("src/workers/pool.ts");
const { loadCustomPresets } = loadModule<typeof import("../src/lib/presets.ts")>("src/lib/presets.ts");
const support: CodecSupport = {
  decode: { jpeg: true, png: true, webp: true, avif: true, gif: true, bmp: true, tiff: true },
  encode: { jpeg: true, png: true, webp: true, avif: false },
  imageBitmap: true,
  offscreenCanvas: true,
  createImageBitmapOrientation: true,
};
let passed = 0;
async function check(name: string, run: () => void | Promise<void>) {
  await run();
  passed += 1;
  console.log(`PASS ${name}`);
}
function pngHeader(width: number, height: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

await check("header inspection reads PNG, GIF, BMP, JPEG and WebP dimensions", () => {
  assert.deepEqual(readHeaderDimensions(pngHeader(800, 600), "png"), { width: 800, height: 600 });
  assert.deepEqual(readHeaderDimensions(new Uint8Array([71, 73, 70, 56, 57, 97, 16, 0, 8, 0]), "gif"), { width: 16, height: 8 });
  const bmp = new Uint8Array(26);
  const bmpView = new DataView(bmp.buffer);
  bmpView.setUint32(14, 40, true);
  bmpView.setInt32(18, 40, true);
  bmpView.setInt32(22, -30, true);
  assert.deepEqual(readHeaderDimensions(bmp, "bmp"), { width: 40, height: 30 });
  const jpeg = new Uint8Array([255, 216, 255, 192, 0, 8, 8, 0, 60, 0, 80, 1]);
  assert.deepEqual(readHeaderDimensions(jpeg, "jpeg"), { width: 80, height: 60 });
  const webp = new Uint8Array(25);
  webp.set([86, 80, 56, 76], 12);
  webp[20] = 47;
  new DataView(webp.buffer).setUint32(21, 15 | (7 << 14), true);
  assert.deepEqual(readHeaderDimensions(webp, "webp"), { width: 16, height: 8 });
});

await check("AVIF walks bounded metadata boxes and rejects truncated headers", () => {
  const box = (name: string, payload: Uint8Array): Uint8Array<ArrayBuffer> => {
    const bytes = new Uint8Array(payload.length + 8);
    new DataView(bytes.buffer).setUint32(0, bytes.length);
    bytes.set(new TextEncoder().encode(name), 4);
    bytes.set(payload, 8);
    return bytes;
  };
  const ispe = new Uint8Array(12);
  new DataView(ispe.buffer).setUint32(4, 1024);
  new DataView(ispe.buffer).setUint32(8, 768);
  const iprp = box("iprp", box("ipco", box("ispe", ispe)));
  const meta = new Uint8Array(iprp.length + 4);
  meta.set(iprp, 4);
  assert.deepEqual(readHeaderDimensions(box("meta", meta), "avif"), { width: 1024, height: 768 });
  assert.equal(readHeaderDimensions(new Uint8Array([0, 0, 0, 255, 109, 101, 116, 97]), "avif"), null);
});

await check("oversized or unknown dimensions are rejected before any pixel decode", async () => {
  let decodes = 0;
  Object.defineProperty(globalThis, "createImageBitmap", { configurable: true, value: () => { decodes += 1; throw new Error("Unexpected decode"); } });
  await assert.rejects(processImage(new Blob([pngHeader(16000, 16000)]), "bomb.png", DEFAULT_OPTIONS, support, { aborted: false }), /megapixels/);
  await assert.rejects(processImage(new Blob([new Uint8Array([255, 216, 255, 0])]), "bad.jpg", DEFAULT_OPTIONS, support, { aborted: false }), /dimensions/);
  assert.equal(decodes, 0);
  assert.equal(validateDimensions(Number.NaN, 1)?.error.code, "DECODE_FAILED");
  assert.equal(validateDimensions(16385, 1)?.error.code, "DIMENSIONS_TOO_LARGE");
});

await check("lossless uses PNG and keep falls back when AVIF encoding is absent", () => {
  assert.equal(resolveOutputFormat("jpeg", { ...DEFAULT_OPTIONS, compression: { ...DEFAULT_OPTIONS.compression, mode: "lossless" } }, support, false), "png");
  assert.equal(resolveOutputFormat("avif", DEFAULT_OPTIONS, support, true), "webp");
});

await check("worker errors retain their code and hint after structured cloning", () => {
  const error = Object.assign(new Error("This file is empty."), { code: "EMPTY_FILE", hint: "Try again.", retryable: true });
  assert.deepEqual(structuredClone(toProcessingError(error)), { code: "EMPTY_FILE", message: "This file is empty.", hint: "Try again.", retryable: true });
  assert.equal(typeof toProcessingError(new DOMException("Could not decode", "EncodingError")).code, "string");
});

await check("resize geometry handles fill extremes and rejects invalid options", () => {
  const options: ResizeOptions = { mode: "fill", width: 1, height: 16384, maintainAspectRatio: true, preventUpscale: true };
  const plan = computeResizePlan({ width: 16384, height: 1 }, options);
  assert.ok(plan.source.width >= 1 && plan.source.height >= 1);
  assert.ok(plan.source.x + plan.source.width <= 16384);
  assert.throws(() => computeResizePlan({ width: 800, height: 600 }, { ...options, width: Number.POSITIVE_INFINITY }), /finite/);
  assert.deepEqual(computeResizePlan({ width: 800, height: 600 }, { ...options, mode: "fit", width: 200, height: 200 }).target, { width: 200, height: 150 });
});

await check("palette reduction retains exact flat colours and alpha", () => {
  const pixels = new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 128, 0, 255, 0, 255, 5, 9, 12, 0]);
  const original = pixels.slice();
  quantize(pixels, 8);
  assert.deepEqual(pixels, original);
});

await check("private EXIF bytes are discarded, not merely unlinked", () => {
  const jpeg = new Uint8Array(140);
  jpeg.set([255, 216, 255, 225, 0, 136, 69, 120, 105, 102, 0, 0, 73, 73, 42, 0, 8, 0, 0, 0]);
  const view = new DataView(jpeg.buffer);
  view.setUint16(20, 2, true);
  view.setUint16(22, 0x0112, true);
  view.setUint16(24, 3, true);
  view.setUint32(26, 1, true);
  view.setUint16(30, 6, true);
  view.setUint16(34, 0x8825, true);
  view.setUint16(36, 4, true);
  view.setUint32(38, 1, true);
  view.setUint32(42, 60, true);
  jpeg.set(new TextEncoder().encode("PRIVATE-GPS-OWNER-THUMBNAIL"), 80);
  assert.equal(readExif(jpeg).hasGps, true);
  const segment = buildExifSegment(jpeg, "removePersonal");
  assert.ok(segment);
  assert.equal(new TextDecoder().decode(segment).includes("PRIVATE"), false);
  const result = injectExif(new Uint8Array([255, 216, 255, 217]), segment);
  assert.deepEqual(readExif(result), { hasExif: true, hasGps: false, orientation: 1 });
});

await check("archive names remain unique after sanitizing and suffix collisions", () => {
  const names = uniqueNames(["image.jpg", "image.jpg", "image (1).jpg", "IMAGE.JPG", "../CON.jpg", "CON.jpg", "a/b.png", "a\\b.png"]);
  assert.equal(new Set(names.map((name) => name.toLowerCase())).size, names.length);
  assert.ok(names.every((name) => !/[\\/]/.test(name)));
  assert.equal(uniqueNames(["CON.jpg"])[0], "_CON.jpg");
});

await check("ZIP stores correct UTF-8 names, CRC, central offset and payload", async () => {
  const zip = await createZip([{ name: "photo.txt", data: new Blob(["hello"]) }, { name: "photo.txt", data: new Blob(["world"]) }]);
  const bytes = new Uint8Array(await zip.arrayBuffer());
  const view = new DataView(bytes.buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint32(14, true), 0x3610a686);
  const nameLength = view.getUint16(26, true);
  assert.equal(new TextDecoder().decode(bytes.subarray(30 + nameLength, 35 + nameLength)), "hello");
  const end = bytes.length - 22;
  assert.equal(view.getUint16(end + 10, true), 2);
  assert.equal(view.getUint32(view.getUint32(end + 16, true), true), 0x02014b50);
  await assert.rejects(createZip([{ name: "a".repeat(65536), data: new Blob() }]), /filename/);
  const huge = new Blob();
  Object.defineProperty(huge, "size", { value: 0xffffffff });
  await assert.rejects(createZip([{ name: "large.png", data: huge }]), /4 GB/);
});

await check("CSV manifests escape spreadsheet formulas in input filenames", () => {
  const file = new File(["source"], '=HYPERLINK("https://example.invalid")\rname.png');
  const job: import("../src/types/job.ts").ImageJob = {
    id: "test", file, status: "done", progress: 1, input: null,
    result: { output: { blob: new Blob(["result"]), size: 6, format: "png", dimensions: { width: 1, height: 1 }, quality: null }, durationMs: 1, flattenedAlpha: false },
    error: null, options: null, selected: true, previewUrl: null, addedAt: 0,
  };
  const csv = buildManifest([job], ["result.png"]);
  assert.ok(csv.includes('"\'=HYPERLINK(""https://example.invalid"")\rname.png"'));
});

await check("cancelled worker replies cannot overwrite a retried job", async () => {
  class FakeWorker {
    static instances: FakeWorker[] = [];
    listeners = new Map<string, Array<(event: unknown) => void>>();
    requests: import("../src/types/worker.ts").WorkerRequest[] = [];
    terminated = false;
    constructor() { FakeWorker.instances.push(this); }
    addEventListener(name: string, handler: (event: unknown) => void) {
      this.listeners.set(name, [...(this.listeners.get(name) ?? []), handler]);
    }
    postMessage(message: import("../src/types/worker.ts").WorkerRequest) { this.requests.push(message); }
    terminate() { this.terminated = true; }
    emit(message: import("../src/types/worker.ts").WorkerResponse) {
      this.listeners.get("message")?.forEach((handler) => handler({ data: message }));
    }
  }
  Object.defineProperty(globalThis, "Worker", { configurable: true, value: FakeWorker });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { hardwareConcurrency: 8, deviceMemory: 8 } });
  const events: string[] = [];
  const pool = new WorkerPool({ onProgress: (id) => events.push(id), onDone: () => undefined, onFailed: () => undefined, onIdle: () => undefined });
  const task = { id: "retry", name: "photo.png", file: new File(["image"], "photo.png"), options: DEFAULT_OPTIONS };
  pool.enqueue([task]);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  const original = FakeWorker.instances[0]!;
  pool.cancel("retry");
  assert.equal(original.terminated, true);
  pool.enqueue([task]);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  original.emit({ type: "progress", id: "retry", fraction: 1 });
  assert.deepEqual(events, []);
  FakeWorker.instances[1]!.emit({ type: "progress", id: "retry", fraction: 0.1 });
  assert.deepEqual(events, ["retry"]);
  pool.dispose();
  assert.equal(FakeWorker.instances[1]!.terminated, true);
});

await check("saved presets reject malformed nested settings", () => {
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: () => JSON.stringify([
      { id: "bad", name: "Malformed", options: {} },
      { id: "null", name: "Null", options: null },
      { id: "unsafe", name: "Bad quality", options: { ...DEFAULT_OPTIONS, compression: { ...DEFAULT_OPTIONS.compression, quality: -1 } } },
      { id: "good", name: "My preset", options: DEFAULT_OPTIONS, builtIn: true },
    ]),
  } });
  const presets = loadCustomPresets();
  assert.equal(presets.length, 1);
  assert.equal(presets[0]?.id, "good");
  assert.equal(presets[0]?.builtIn, false);
});

console.log(`\n${passed} engine regression checks passed.`);
