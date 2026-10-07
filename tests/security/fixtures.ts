/**
 * Hostile and malformed input fixtures.
 *
 * Every byte below is written from scratch with node:zlib and a hand-rolled
 * CRC — nothing is downloaded and no image library is involved, so each file is
 * exactly as adversarial as it claims to be and the suite stays dependency-free.
 *
 * The decompression bomb is the important one: a ~200 byte PNG that declares a
 * 50000x50000 canvas. Decoding it would ask the browser for ~10 GB of RGBA.
 * `src/lib/format.ts` (LIMITS) and `src/engines/validate.ts`
 * (validateDimensions) exist to stop exactly this, and the suite proves it.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/* -------------------------------------------------------------------------- */
/* Byte helpers                                                                */
/* -------------------------------------------------------------------------- */

export function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function ascii(text: string): Uint8Array {
  return new Uint8Array([...text].map((c) => c.charCodeAt(0)));
}

/** Deterministic pseudo-noise, so every run produces byte-identical fixtures. */
function noise(seed: number): number {
  const n = Math.sin(seed * 12.9898) * 43758.5453;
  return Math.floor((n - Math.floor(n)) * 256);
}

/* -------------------------------------------------------------------------- */
/* PNG                                                                         */
/* -------------------------------------------------------------------------- */

const CRC_TABLE = (() => {
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
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function pngChunk(type: string, data: Uint8Array, breakCrc = false): Uint8Array {
  const body = concat([ascii(type), data]);
  const out = new Uint8Array(8 + data.length + 4);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(body, 4);
  view.setUint32(8 + data.length, breakCrc ? (crc32(body) ^ 0xdeadbeef) >>> 0 : crc32(body));
  return out;
}

function ihdr(width: number, height: number): Uint8Array {
  const data = new Uint8Array(13);
  const view = new DataView(data.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  data[8] = 8; // bit depth
  data[9] = 6; // colour type: RGBA
  return data;
}

type Painter = (x: number, y: number, w: number, h: number) => [number, number, number, number];

/** A genuine, fully valid RGBA PNG. */
export function makePng(width: number, height: number, paint: Painter): Uint8Array {
  const stride = width * 4 + 1;
  const raw = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * stride;
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = paint(x, y, width, height);
      const at = row + 1 + x * 4;
      raw[at] = r;
      raw[at + 1] = g;
      raw[at + 2] = b;
      raw[at + 3] = a;
    }
  }
  return concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr(width, height)),
    pngChunk("IDAT", new Uint8Array(deflateSync(raw, { level: 6 }))),
    pngChunk("IEND", new Uint8Array(0)),
  ]);
}

const photo: Painter = (x, y, w, h) => [
  Math.min(255, Math.round((226 * x) / w + noise(x * 7 + y * 13) / 12)),
  Math.min(255, Math.round((150 * y) / h + 40)),
  Math.min(255, Math.round(60 + (130 * (w - x)) / w)),
  255,
];

const flat: Painter = (x, _y, w) => {
  const palette: Array<[number, number, number]> = [
    [232, 101, 43],
    [26, 22, 19],
    [255, 230, 204],
    [31, 122, 85],
  ];
  const [r, g, b] = palette[Math.floor((x / w) * palette.length) % palette.length]!;
  return [r, g, b, 255];
};

/**
 * The decompression bomb.
 *
 * ~200 bytes on disk, a declared canvas of `width` x `height`. Nothing in the
 * IDAT could ever produce that many pixels; the point is that a decoder which
 * trusts IHDR allocates width*height*4 bytes before it finds out.
 */
export function makeBombPng(width: number, height: number): Uint8Array {
  return concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr(width, height)),
    pngChunk("IDAT", new Uint8Array(deflateSync(new Uint8Array(64), { level: 9 }))),
    pngChunk("IEND", new Uint8Array(0)),
  ]);
}

/** Valid signature and IHDR, then nothing: no IDAT, no IEND. */
export function makeTruncatedPng(width: number, height: number): Uint8Array {
  return concat([PNG_SIGNATURE, pngChunk("IHDR", ihdr(width, height))]);
}

/** A structurally complete PNG whose IDAT checksum is wrong. */
export function makeCorruptCrcPng(width: number, height: number): Uint8Array {
  const stride = width * 4 + 1;
  const raw = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) raw[y * stride] = 0;
  return concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr(width, height)),
    pngChunk("IDAT", new Uint8Array(deflateSync(raw, { level: 6 })), true),
    pngChunk("IEND", new Uint8Array(0)),
  ]);
}

/** Correct 8-byte signature, then pure garbage where the IHDR should be. */
export function makeGarbageBodyPng(length = 512): Uint8Array {
  const body = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) body[i] = noise(i + 1);
  return concat([PNG_SIGNATURE, body]);
}

/* -------------------------------------------------------------------------- */
/* JPEG                                                                        */
/* -------------------------------------------------------------------------- */

/** A complete, valid 1x1 baseline JPEG. Used as a host for EXIF attacks. */
export const JPEG_1X1 = new Uint8Array(
  Buffer.from(
    "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
      "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA" +
      "AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
    "base64",
  ),
);

const DQT_LUMINANCE = new Uint8Array([
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56,
  14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113,
  92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
]);

function segment(marker: number, payload: Uint8Array): Uint8Array {
  const length = payload.length + 2;
  return concat([new Uint8Array([0xff, marker, (length >> 8) & 0xff, length & 0xff]), payload]);
}

/**
 * A grayscale baseline JPEG whose header is entirely well-formed — SOI, JFIF,
 * quantisation table, SOF0, Huffman tables, SOS — and whose entropy-coded scan
 * simply stops part way through. No EOI.
 */
export function makeTruncatedJpeg(width: number, height: number, scanBytes = 192): Uint8Array {
  const jfif = segment(0xe0, concat([ascii("JFIF\0"), new Uint8Array([1, 1, 0, 0, 1, 0, 1, 0, 0])]));
  const dqt = segment(0xdb, concat([new Uint8Array([0]), DQT_LUMINANCE]));
  const sof0 = segment(
    0xc0,
    new Uint8Array([
      8,
      (height >> 8) & 0xff,
      height & 0xff,
      (width >> 8) & 0xff,
      width & 0xff,
      1,
      1,
      0x11,
      0,
    ]),
  );
  // Structurally valid Huffman tables: 16 length counts followed by the values.
  const dcCounts = new Uint8Array(16);
  dcCounts[0] = 1;
  const dhtDc = segment(0xc4, concat([new Uint8Array([0x00]), dcCounts, new Uint8Array([0x00])]));
  const acCounts = new Uint8Array(16);
  acCounts[0] = 1;
  const dhtAc = segment(0xc4, concat([new Uint8Array([0x10]), acCounts, new Uint8Array([0x00])]));
  const sos = segment(0xda, new Uint8Array([1, 1, 0x00, 0, 63, 0]));

  const scan = new Uint8Array(scanBytes);
  for (let i = 0; i < scanBytes; i += 1) {
    const byte = noise(i + 31);
    // 0xff inside a scan must be byte-stuffed; keep the stream plausible.
    scan[i] = byte === 0xff ? 0xfe : byte;
  }

  return concat([new Uint8Array([0xff, 0xd8]), jfif, dqt, sof0, dhtDc, dhtAc, sos, scan]);
}

/* ---- EXIF attacks -------------------------------------------------------- */

function ifdEntry(tag: number, type: number, count: number, value: number): Uint8Array {
  const bytes = new Uint8Array(12);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, tag, true);
  view.setUint16(2, type, true);
  view.setUint32(4, count, true);
  view.setUint32(8, value, true);
  return bytes;
}

function tiffHeader(ifd0Offset: number): Uint8Array {
  const bytes = new Uint8Array(8);
  const view = new DataView(bytes.buffer);
  bytes[0] = 0x49;
  bytes[1] = 0x49; // "II": little endian
  view.setUint16(2, 42, true);
  view.setUint32(4, ifd0Offset, true);
  return bytes;
}

function u16le(value: number): Uint8Array {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function u32le(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

function app1(tiff: Uint8Array): Uint8Array {
  return segment(0xe1, concat([ascii("Exif\0\0"), tiff]));
}

/** Grafts an APP1 segment on directly after the SOI of a real JPEG. */
function withApp1(jpeg: Uint8Array, app1Segment: Uint8Array): Uint8Array {
  return concat([jpeg.subarray(0, 2), app1Segment, jpeg.subarray(2)]);
}

export type ExifAttack = "circular" | "hugeCount" | "wildOffset" | "deepChain";

/**
 * EXIF segments built to break an in-place IFD rewriter.
 *
 * `src/lib/exif.ts` shortens the packed entry array without recomputing heap
 * offsets, which is correct only while the entry count and the segment bounds
 * are trusted. Each variant attacks one of those assumptions.
 */
export function makeHostileExifJpeg(attack: ExifAttack): Uint8Array {
  if (attack === "hugeCount") {
    // Claims 65535 entries inside a segment far too small to hold them.
    return withApp1(
      JPEG_1X1,
      app1(concat([tiffHeader(8), u16le(0xffff), ifdEntry(0x0112, 3, 1, 1)])),
    );
  }
  if (attack === "wildOffset") {
    // IFD0 lives four gigabytes past the end of the file.
    return withApp1(
      JPEG_1X1,
      app1(concat([tiffHeader(0xfffffff0), u16le(1), ifdEntry(0x0112, 3, 1, 1)])),
    );
  }
  if (attack === "deepChain") {
    // Every pointer aims back at the start of the TIFF block.
    return withApp1(
      JPEG_1X1,
      app1(
        concat([
          tiffHeader(8),
          u16le(2),
          ifdEntry(0x8769, 4, 1, 8),
          ifdEntry(0x8825, 4, 1, 8),
          u32le(8),
        ]),
      ),
    );
  }
  // circular: Exif sub-IFD points back at IFD0, GPS pointer is out of range,
  // the orientation value is outside 1-8, and the next-IFD pointer loops.
  return withApp1(
    JPEG_1X1,
    app1(
      concat([
        tiffHeader(8),
        u16le(3),
        ifdEntry(0x0112, 3, 1, 0xffff),
        ifdEntry(0x8769, 4, 1, 8),
        ifdEntry(0x8825, 4, 1, 0xfffffff0),
        u32le(8),
      ]),
    ),
  );
}

/* -------------------------------------------------------------------------- */
/* Other containers                                                            */
/* -------------------------------------------------------------------------- */

/** RIFF/WEBP with a VP8X chunk declaring an impossible canvas. */
export function makeWebpBomb(width: number, height: number): Uint8Array {
  const u24 = (value: number) =>
    new Uint8Array([value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff]);
  const body = concat([
    ascii("WEBP"),
    ascii("VP8X"),
    u32le(10),
    new Uint8Array([0, 0, 0, 0]),
    u24(width - 1),
    u24(height - 1),
  ]);
  return concat([ascii("RIFF"), u32le(body.length), body]);
}

/** A BMP whose DIB header declares a negative width. */
export function makeNegativeBmp(): Uint8Array {
  const bytes = new Uint8Array(54);
  const view = new DataView(bytes.buffer);
  bytes[0] = 0x42;
  bytes[1] = 0x4d; // "BM"
  view.setUint32(2, 54, true); // file size
  view.setUint32(10, 54, true); // pixel data offset
  view.setUint32(14, 40, true); // DIB header size
  view.setInt32(18, -1, true); // width
  view.setInt32(22, 1, true); // height
  view.setUint16(26, 1, true); // planes
  view.setUint16(28, 24, true); // bits per pixel
  return bytes;
}

/** A Windows executable wearing a .jpg extension. */
export function makeRenamedExecutable(): Uint8Array {
  return concat([
    ascii("MZ"),
    new Uint8Array([0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00]),
    ascii("This program cannot be run in DOS mode.\r\r\n$"),
    new Uint8Array(32),
    ascii("PE\0\0"),
  ]);
}

/* -------------------------------------------------------------------------- */
/* The fixture set                                                             */
/* -------------------------------------------------------------------------- */

export type Expectation =
  /** Must complete: a legitimate file. */
  | { kind: "succeeds" }
  /** Must be rejected, with a message matching `message`. */
  | { kind: "fails"; message: RegExp }
  /** Either outcome is defensible, but it must never be an unexplained error. */
  | { kind: "either" };

export type Fixture = {
  name: string;
  bytes: Uint8Array;
  expect: Expectation;
  why: string;
};

export function hostileFixtures(): Fixture[] {
  return [
    {
      name: "empty.jpg",
      bytes: new Uint8Array(0),
      expect: { kind: "fails", message: /this file is empty/i },
      why: "zero-byte file",
    },
    {
      name: "holiday-snap.jpg",
      bytes: makeRenamedExecutable(),
      expect: { kind: "fails", message: /not an image we recognise/i },
      why: "renamed Windows executable (MZ/PE) with a .jpg extension",
    },
    {
      name: "truncated-mid-scan.jpg",
      bytes: makeTruncatedJpeg(640, 480),
      expect: { kind: "either" },
      why: "valid JPEG header, scan cut off part way through, no EOI",
    },
    {
      name: "truncated-no-idat.png",
      bytes: makeTruncatedPng(64, 64),
      expect: { kind: "either" },
      why: "PNG signature and IHDR only — no IDAT, no IEND",
    },
    {
      name: "corrupt-crc.png",
      bytes: makeCorruptCrcPng(48, 48),
      expect: { kind: "either" },
      why: "complete PNG with a deliberately wrong IDAT checksum",
    },
    {
      name: "bomb-50000x50000.png",
      bytes: makeBombPng(50_000, 50_000),
      expect: { kind: "fails", message: /canvas limit|megapixels/i },
      why: "DECOMPRESSION BOMB: ~200 bytes declaring 2.5 gigapixels (~10 GB of RGBA)",
    },
    {
      name: "bomb-16000x16000.png",
      bytes: makeBombPng(16_000, 16_000),
      expect: { kind: "fails", message: /megapixels/i },
      why: "decompression bomb under the per-edge cap but far over the pixel cap",
    },
    {
      name: "bomb-20000x20000.webp",
      bytes: makeWebpBomb(20_000, 20_000),
      expect: { kind: "fails", message: /canvas limit|megapixels|could not be decoded/i },
      why: "WebP VP8X header declaring an impossible canvas",
    },
    {
      name: "png-signature-garbage.png",
      bytes: makeGarbageBodyPng(),
      expect: { kind: "fails", message: /could not be decoded|no width or height/i },
      why: "valid PNG signature followed by random bytes",
    },
    {
      name: "negative-dimensions.bmp",
      bytes: makeNegativeBmp(),
      expect: { kind: "fails", message: /no width or height|could not be decoded/i },
      why: "BMP declaring a negative width",
    },
    {
      name: "exif-circular.jpg",
      bytes: makeHostileExifJpeg("circular"),
      expect: { kind: "either" },
      why: "EXIF with a self-referential Exif sub-IFD pointer and an out-of-range GPS offset",
    },
    {
      name: "exif-huge-count.jpg",
      bytes: makeHostileExifJpeg("hugeCount"),
      expect: { kind: "either" },
      why: "EXIF IFD claiming 65535 entries in a 20-byte segment",
    },
    {
      name: "exif-wild-offset.jpg",
      bytes: makeHostileExifJpeg("wildOffset"),
      expect: { kind: "either" },
      why: "EXIF IFD0 offset pointing four gigabytes past the file",
    },
    {
      name: "exif-deep-chain.jpg",
      bytes: makeHostileExifJpeg("deepChain"),
      expect: { kind: "either" },
      why: "EXIF where every sub-IFD pointer loops back to IFD0",
    },
    {
      name: "actually-a-png.bmp",
      bytes: makePng(96, 72, flat),
      expect: { kind: "succeeds" },
      why: "a valid PNG with a wildly wrong extension — content sniffing must win",
    },
  ];
}

export function goodFixtures(): Fixture[] {
  return [
    {
      name: "good-photo.png",
      bytes: makePng(240, 180, photo),
      expect: { kind: "succeeds" },
      why: "legitimate photo-like PNG",
    },
    {
      name: "good-flat.png",
      bytes: makePng(160, 120, flat),
      expect: { kind: "succeeds" },
      why: "legitimate flat-art PNG",
    },
    {
      name: "good-tiny.png",
      bytes: makePng(32, 32, flat),
      expect: { kind: "succeeds" },
      why: "legitimate small PNG",
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* Hostile filenames                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Names that cannot be written to a Windows filesystem, so they are injected
 * straight into the file input as constructed `File` objects instead. That is
 * the same object the app would receive from a directory pick on a filesystem
 * which does allow them.
 */
export type HostileName = { name: string; why: string };

export function hostileNames(): HostileName[] {
  return [
    { name: `${"a".repeat(500)}.png`, why: "500-character filename" },
    { name: "../../../../etc/passwd.png", why: "POSIX path traversal" },
    { name: "..\\..\\..\\windows\\system32\\evil.png", why: "Windows path traversal" },
    { name: "line\nbreak\rinjection.png", why: "newline and carriage return" },
    { name: "null\u0000byte.png", why: "embedded NUL" },
    { name: "report‮gnp.exe.png", why: "right-to-left override (extension spoofing)" },
    { name: "‏⁦rtl-marks⁩.png", why: "bidi isolate and RTL marks" },
    { name: "...........png", why: "leading-dot run" },
    { name: "CON.png", why: "reserved Windows device name" },
    { name: "tab\tand space .png", why: "tab and trailing space" },
  ];
}

/* -------------------------------------------------------------------------- */
/* Writing to disk                                                             */
/* -------------------------------------------------------------------------- */

export type WrittenFixture = Fixture & { path: string };

export function writeFixtures(dir: string, fixtures: Fixture[]): WrittenFixture[] {
  mkdirSync(dir, { recursive: true });
  return fixtures.map((fixture) => {
    const path = join(dir, fixture.name);
    writeFileSync(path, fixture.bytes);
    return { ...fixture, path };
  });
}

/** `count` small but genuinely different PNGs, for the heap-growth check. */
export function writeBulk(dir: string, count: number): string[] {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const paths: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const path = join(dir, `bulk-${String(i).padStart(3, "0")}.png`);
    writeFileSync(
      path,
      makePng(320, 240, (x, y, w, h) => {
        const [r, g, b] = photo(x, y, w, h);
        return [(r + i * 5) % 256, (g + i * 3) % 256, b, 255];
      }),
    );
    paths.push(path);
  }
  return paths;
}

/** Two identically named files in different folders — the ZIP collision case. */
export function writeDuplicateNames(dir: string): string[] {
  rmSync(dir, { recursive: true, force: true });
  const paths: string[] = [];
  for (const folder of ["folder-a", "folder-b"]) {
    const sub = join(dir, folder);
    mkdirSync(sub, { recursive: true });
    const path = join(sub, "photo.png");
    writeFileSync(path, makePng(64, 64, folder === "folder-a" ? flat : photo));
    paths.push(path);
  }
  return paths;
}

export function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}
