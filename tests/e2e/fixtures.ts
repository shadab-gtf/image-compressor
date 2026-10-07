/**
 * Fixtures for the functional end-to-end suites.
 *
 * The base images come from `npm run test:images`, which this module does not
 * own. Anything the functional suites need *beyond* that set is produced here:
 *
 *  - Bulk sets. 30+ real files, created as hard links to an existing fixture so
 *    a 200 MB queue costs no disk and no generation time. The names differ, so
 *    the app sees 32 distinct files — which is the thing under test.
 *  - A fully opaque PNG, used to check that the "Flattened" warning is only
 *    shown when transparency was genuinely discarded.
 */
import { deflateSync } from "node:zlib";
import {
  copyFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { TEST_IMAGES } from "../lib/cdp.ts";

export const WORK_DIR = join(process.env.TEMP ?? "/tmp", "shrinkfox-e2e-work");

export const BASE_IMAGES = {
  photoBig: join(TEST_IMAGES, "photo-3000x2000.png"),
  photoMid: join(TEST_IMAGES, "photo-1600x1200.png"),
  flatUi: join(TEST_IMAGES, "flat-ui-1200x800.png"),
  alphaLogo: join(TEST_IMAGES, "alpha-logo-800x800.png"),
  tiny: join(TEST_IMAGES, "tiny-64x64.png"),
  notAnImage: join(TEST_IMAGES, "not-really-an-image.png"),
  empty: join(TEST_IMAGES, "empty.png"),
} as const;

/** Fails loudly rather than letting a suite "pass" against missing inputs. */
export function assertBaseImages(): void {
  const missing = Object.entries(BASE_IMAGES).filter(([, path]) => !existsSync(path));
  if (missing.length > 0) {
    throw new Error(
      `Test images are missing (${missing.map(([k]) => k).join(", ")}). Run: npm run test:images`,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* PNG writer — only for fixtures the shared generator does not produce         */
/* -------------------------------------------------------------------------- */

const CRC = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new Uint8Array([...type].map((c) => c.charCodeAt(0)));
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes, 0);
  body.set(data, typeBytes.length);

  const out = new Uint8Array(8 + data.length + 4);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(body, 4);
  view.setUint32(8 + data.length, crc32(body));
  return out;
}

type Painter = (x: number, y: number, w: number, h: number) => [number, number, number, number];

export function makePng(width: number, height: number, paint: Painter): Uint8Array {
  const stride = width * 4 + 1;
  const raw = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * stride;
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = paint(x, y, width, height);
      const at = row + 1 + x * 4;
      raw[at] = r;
      raw[at + 1] = g;
      raw[at + 2] = b;
      raw[at + 3] = a;
    }
  }

  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  const idat = new Uint8Array(deflateSync(raw, { level: 6 }));
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const parts = [
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", new Uint8Array(0)),
  ];

  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const png = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  return png;
}

/* -------------------------------------------------------------------------- */
/* Derived fixtures                                                            */
/* -------------------------------------------------------------------------- */

function freshDir(name: string): string {
  const dir = join(WORK_DIR, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Hard-links where the filesystem allows it, copies otherwise.
 *
 * Both produce a genuinely separate directory entry, which is all the file input
 * sees — but a link costs nothing, so a 32-file 180 MB queue is free to build.
 */
function place(source: string, destination: string): void {
  try {
    linkSync(source, destination);
  } catch {
    copyFileSync(source, destination);
  }
}

/** A fully opaque PNG: nothing to flatten when converting to JPEG. */
export function opaquePng(): string {
  const dir = join(WORK_DIR, "shared");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "opaque-solid-400x300.png");
  if (!existsSync(path)) {
    writeFileSync(
      path,
      makePng(400, 300, (x, y, w, h) => [
        Math.round((x / w) * 200) + 30,
        Math.round((y / h) * 160) + 40,
        90,
        255, // never transparent
      ]),
    );
  }
  return path;
}

/**
 * `count` distinct files for bulk and queue-control tests.
 *
 * Mid-size photographs rather than tiny art: a batch that finishes in 300 ms
 * cannot demonstrate that Pause stops new work from starting.
 */
export function bulkSet(count = 32, source = BASE_IMAGES.photoMid): string[] {
  const dir = freshDir(`bulk-${count}`);
  const paths: string[] = [];
  const pad = String(count).length;
  for (let i = 0; i < count; i += 1) {
    const path = join(dir, `bulk-${String(i + 1).padStart(pad, "0")}.png`);
    place(source, path);
    paths.push(path);
  }
  return paths;
}

/** A mixed batch small enough to archive quickly but big enough to be real. */
export function batchSet(count = 12): string[] {
  const dir = freshDir(`batch-${count}`);
  const sources = [BASE_IMAGES.flatUi, BASE_IMAGES.photoMid];
  const paths: string[] = [];
  const pad = String(count).length;
  for (let i = 0; i < count; i += 1) {
    const path = join(dir, `shot-${String(i + 1).padStart(pad, "0")}.png`);
    place(sources[i % sources.length]!, path);
    paths.push(path);
  }
  return paths;
}

/** A download directory that is empty at the start of every run. */
export function downloadDir(): string {
  return freshDir("downloads");
}

export function listDownloads(dir: string): Array<{ name: string; size: number }> {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => !name.endsWith(".crdownload"))
    .map((name) => ({ name, size: statSync(join(dir, name)).size }));
}
