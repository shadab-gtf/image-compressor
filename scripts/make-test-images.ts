/**
 * Generates real test images for the end-to-end check.
 *
 * Writes genuine PNG files from scratch with node:zlib — no image dependency —
 * so the suite exercises the actual decode path rather than a stub. The content
 * is deliberately varied: a photographic-style gradient with noise (hard to
 * compress, exercises the quality search), flat UI art (compresses enormously,
 * exercises the PNG quantiser) and an alpha cut-out (exercises matte flattening).
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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
  // One filter byte (0 = none) per scanline, then RGBA.
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
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  // 10-12 stay zero: deflate, adaptive filtering, no interlace.

  const idat = new Uint8Array(deflateSync(raw, { level: 6 }));
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const parts = [signature, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", new Uint8Array(0))];

  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const png = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  return png;
}

/* Deterministic pseudo-noise so runs are reproducible. */
function noise(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

const photo: Painter = (x, y, w, h) => {
  const gx = x / w;
  const gy = y / h;
  const grain = noise(x, y) * 42 - 21;
  return [
    Math.max(0, Math.min(255, Math.round(226 * gx + 40 * gy + grain))),
    Math.max(0, Math.min(255, Math.round(120 * gy + 70 * gx + grain))),
    Math.max(0, Math.min(255, Math.round(60 + 130 * (1 - gx) + grain))),
    255,
  ];
};

const flat: Painter = (x, y, w, h) => {
  const band = Math.floor((x / w) * 5);
  const palette: Array<[number, number, number]> = [
    [232, 101, 43],
    [26, 22, 19],
    [255, 230, 204],
    [31, 122, 85],
    [243, 241, 237],
  ];
  const stripe = y > h * 0.6 ? 4 : band;
  const [r, g, b] = palette[stripe % palette.length]!;
  return [r, g, b, 255];
};

const alpha: Painter = (x, y, w, h) => {
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) * 0.42;
  const distance = Math.hypot(x - cx, y - cy);
  // Soft edge so flattening onto a matte is actually visible.
  const a = distance > radius ? 0 : distance > radius - 12 ? Math.round(255 * ((radius - distance) / 12)) : 255;
  return [232, 101, 43, a];
};

const outDir = process.argv[2] ?? join(process.env.TEMP ?? "/tmp", "shrinkfox-test-images");
mkdirSync(outDir, { recursive: true });

const files: Array<[string, Uint8Array]> = [
  ["photo-3000x2000.png", makePng(3000, 2000, photo)],
  ["photo-1600x1200.png", makePng(1600, 1200, photo)],
  ["flat-ui-1200x800.png", makePng(1200, 800, flat)],
  ["alpha-logo-800x800.png", makePng(800, 800, alpha)],
  ["tiny-64x64.png", makePng(64, 64, flat)],
  // Not an image at all: renamed so only content sniffing can reject it.
  ["not-really-an-image.png", new TextEncoder().encode("MZ\u0090\u0000this is an executable, not a picture")],
  // Zero bytes.
  ["empty.png", new Uint8Array(0)],
];

for (const [name, bytes] of files) {
  const path = join(outDir, name);
  writeFileSync(path, bytes);
  console.log(`${(bytes.length / 1024).toFixed(1).padStart(9)} KB  ${path}`);
}
console.log(`\n${files.length} test files in ${outDir}`);
