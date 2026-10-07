/**
 * JPEG EXIF reading and surgical rewriting.
 *
 * Why this exists: re-encoding through a canvas strips *all* metadata. That is
 * exactly right for "remove all", but it means "preserve" and "remove personal"
 * have to put something back. Rather than rebuild a TIFF from scratch, this
 * module copies the original APP1 segment and edits it in place.
 *
 * The in-place trick: IFD entries are a packed array of 12-byte records followed
 * by a 4-byte next-IFD pointer, and *then* the value heap. Deleting an entry
 * only shifts bytes inside that array — every absolute offset into the heap
 * stays valid. So tags can be removed without recomputing a single offset, which
 * is where a naive EXIF rewriter corrupts files.
 */

const SOI = 0xd8;
const APP1 = 0xe1;
const SOS = 0xda;

/** EXIF tag numbers this module cares about. */
const TAG = {
  orientation: 0x0112,
  exifIfdPointer: 0x8769,
  gpsIfdPointer: 0x8825,
} as const;

export type ExifInfo = {
  hasExif: boolean;
  hasGps: boolean;
  /** 1-8, or 1 when absent. */
  orientation: number;
};

export const NO_EXIF: ExifInfo = { hasExif: false, hasGps: false, orientation: 1 };

/* -------------------------------------------------------------------------- */
/* Segment walking                                                             */
/* -------------------------------------------------------------------------- */

/** Returns [start, end) of the APP1/Exif segment, or null. */
function findApp1(bytes: Uint8Array): [number, number] | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== SOI) return null;

  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1]!;
    // Start of scan: compressed data follows, no more metadata segments.
    if (marker === SOS || marker === 0xd9) return null;

    const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
    if (length < 2) return null;
    const end = offset + 2 + length;
    if (end > bytes.length) return null;

    if (marker === APP1) {
      const header = String.fromCharCode(...bytes.slice(offset + 4, offset + 10));
      if (header === "Exif\0\0") return [offset, end];
    }
    offset = end;
  }
  return null;
}

type Reader = {
  u16: (at: number) => number;
  u32: (at: number) => number;
  setU16: (at: number, value: number) => void;
};

function reader(view: DataView, little: boolean): Reader {
  return {
    u16: (at) => view.getUint16(at, little),
    u32: (at) => view.getUint32(at, little),
    setU16: (at, value) => view.setUint16(at, value, little),
  };
}

/** Walks every IFD entry, invoking `visit` with its tag and absolute position. */
function eachEntry(
  r: Reader,
  tiffStart: number,
  ifdOffset: number,
  limit: number,
  visit: (tag: number, entryAt: number, valueOrOffset: number) => void,
): void {
  const base = tiffStart + ifdOffset;
  if (base + 2 > limit) return;
  const count = r.u16(base);
  // A corrupt count could otherwise send us reading megabytes past the segment.
  if (count > 2048 || base + 2 + count * 12 > limit) return;

  for (let i = 0; i < count; i += 1) {
    const entryAt = base + 2 + i * 12;
    visit(r.u16(entryAt), entryAt, r.u32(entryAt + 8));
  }
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                     */
/* -------------------------------------------------------------------------- */

export function readExif(bytes: Uint8Array): ExifInfo {
  try {
    const found = findApp1(bytes);
    if (!found) return NO_EXIF;

    const [start, end] = found;
    const tiffStart = start + 10; // marker(2) + length(2) + "Exif\0\0"(6)
    if (tiffStart + 8 > end) return NO_EXIF;

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const endianness = view.getUint16(tiffStart, false);
    if (endianness !== 0x4949 && endianness !== 0x4d4d) return NO_EXIF;
    const r = reader(view, endianness === 0x4949);
    if (r.u16(tiffStart + 2) !== 42) return NO_EXIF;

    let orientation = 1;
    let hasGps = false;

    eachEntry(r, tiffStart, r.u32(tiffStart + 4), end, (tag, entryAt) => {
      if (tag === TAG.orientation) {
        // SHORT values live in the first 2 bytes of the 4-byte value field.
        const value = r.u16(entryAt + 8);
        if (value >= 1 && value <= 8) orientation = value;
      } else if (tag === TAG.gpsIfdPointer) {
        hasGps = true;
      }
    });

    return { hasExif: true, hasGps, orientation };
  } catch {
    // Malformed metadata must never fail the image itself.
    return NO_EXIF;
  }
}

/* -------------------------------------------------------------------------- */
/* Rewriting                                                                   */
/* -------------------------------------------------------------------------- */

/** Deletes entries from one IFD in place, returning the number removed. */
function deleteEntries(
  bytes: Uint8Array,
  r: Reader,
  tiffStart: number,
  ifdOffset: number,
  limit: number,
  shouldDelete: (tag: number) => boolean,
): number {
  const base = tiffStart + ifdOffset;
  if (base + 2 > limit) return 0;
  const count = r.u16(base);
  if (count === 0 || count > 2048 || base + 2 + count * 12 + 4 > limit) return 0;

  const keep: Uint8Array[] = [];
  for (let i = 0; i < count; i += 1) {
    const entryAt = base + 2 + i * 12;
    if (!shouldDelete(r.u16(entryAt))) {
      keep.push(bytes.slice(entryAt, entryAt + 12));
    }
  }
  const removed = count - keep.length;
  if (removed === 0) return 0;

  // Rewrite the packed entry array, then the next-IFD pointer, then zero the
  // bytes the shortened array vacated. Heap offsets are untouched by design.
  const nextIfdAt = base + 2 + count * 12;
  const nextIfd = bytes.slice(nextIfdAt, nextIfdAt + 4);

  let cursor = base + 2;
  for (const entry of keep) {
    bytes.set(entry, cursor);
    cursor += 12;
  }
  bytes.set(nextIfd, cursor);
  cursor += 4;
  bytes.fill(0, cursor, nextIfdAt + 4);
  r.setU16(base, keep.length);

  return removed;
}

export type MetadataRewrite = "preserve" | "removePersonal";

/**
 * Produces an APP1 segment to graft onto a freshly encoded JPEG.
 *
 * Orientation is always forced to 1: the pixels have already been physically
 * rotated during decode, so leaving the original tag would rotate the image a
 * second time in any viewer that honours it.
 *
 * Returns null when the source carried no EXIF, or when the segment is damaged.
 */
export function buildExifSegment(
  sourceBytes: Uint8Array<ArrayBuffer>,
  policy: MetadataRewrite,
): Uint8Array<ArrayBuffer> | null {
  if (policy === "removePersonal") {
    // Never copy the source metadata heap for this policy. Removing an IFD
    // pointer alone leaves GPS, owner strings and thumbnails recoverable in the
    // output bytes. A fresh orientation-only segment contains no source data.
    if (!readExif(sourceBytes).hasExif) return null;
    return new Uint8Array([
      0xff, 0xe1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
      0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
      0x01, 0x00, 0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00,
      0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);
  }
  try {
    const found = findApp1(sourceBytes);
    if (!found) return null;
    const [start, end] = found;

    // Work on a copy — the source buffer may still be needed elsewhere.
    const segment = sourceBytes.slice(start, end);
    const view = new DataView(segment.buffer, segment.byteOffset, segment.byteLength);

    const tiffStart = 10;
    if (tiffStart + 8 > segment.length) return null;
    const endianness = view.getUint16(tiffStart, false);
    if (endianness !== 0x4949 && endianness !== 0x4d4d) return null;
    const r = reader(view, endianness === 0x4949);
    if (r.u16(tiffStart + 2) !== 42) return null;

    const ifd0 = r.u32(tiffStart + 4);
    const limit = segment.length;

    // Locate the Exif sub-IFD before any deletion moves things around.
    let exifIfd = 0;
    eachEntry(r, tiffStart, ifd0, limit, (tag, entryAt) => {
      if (tag === TAG.orientation) r.setU16(entryAt + 8, 1);
      else if (tag === TAG.exifIfdPointer) exifIfd = r.u32(entryAt + 8);
    });

    // Original size tags become incorrect after resizing or orientation repair.
    deleteEntries(segment, r, tiffStart, ifd0, limit, (tag) => tag === 0x0100 || tag === 0x0101);
    if (exifIfd > 0) {
      deleteEntries(segment, r, tiffStart, exifIfd, limit, (tag) => tag === 0xa002 || tag === 0xa003);
    }

    return segment;
  } catch {
    return null;
  }
}

/**
 * Inserts an APP1 segment directly after the SOI marker of a JPEG.
 *
 * Canvas output begins SOI followed by a quantisation or JFIF segment; APP1 is
 * valid anywhere in that header block, and first is where every reader looks.
 */
export function injectExif(
  jpegBytes: Uint8Array<ArrayBuffer>,
  segment: Uint8Array<ArrayBuffer>,
): Uint8Array<ArrayBuffer> {
  if (jpegBytes.length < 2 || jpegBytes[0] !== 0xff || jpegBytes[1] !== SOI) {
    return jpegBytes;
  }
  const out = new Uint8Array(jpegBytes.length + segment.length);
  out.set(jpegBytes.subarray(0, 2), 0);
  out.set(segment, 2);
  out.set(jpegBytes.subarray(2), 2 + segment.length);
  return out;
}
