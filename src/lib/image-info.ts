/**
 * Container introspection: everything a file can be made to admit about itself
 * without decoding a single pixel.
 *
 * Every function here is pure over `Uint8Array`, which is what makes the
 * inspector testable and lets the same parsers run in a worker later. The React
 * layer reads these records and renders them; it never reaches into bytes.
 *
 * Hostile input is the design constraint, not an edge case. A file that claims
 * a 4 GB chunk, points an IFD at itself, or ends mid-header must produce a
 * partial record — never an exception and never an unbounded loop. Every walker
 * below is bounded by both the buffer length and an iteration cap.
 */

import { readExif } from "@/lib/exif";
import { LIMITS, sniffFormat } from "@/lib/format";
import type { ImageFormat } from "@/types/image";

/* -------------------------------------------------------------------------- */
/* Shared vocabulary                                                           */
/* -------------------------------------------------------------------------- */

/** Rough classification, used only to colour the segment listing. */
export type SegmentKind = "structure" | "pixels" | "metadata" | "colour" | "other";

export type ContainerSegment = {
  /** `IHDR`, `APP1`, `VP8L`, `ftyp`. */
  id: string;
  /** Marker byte for JPEG, e.g. `0xFFE1`. */
  code?: string;
  offset: number;
  /** Payload size in bytes, excluding the segment's own header. */
  length: number;
  kind: SegmentKind;
  note?: string;
};

export type AlphaChannel = "none" | "full" | "palette" | "binary" | "unknown";

export type AlphaInfo = {
  channel: AlphaChannel;
  /** The container declares alpha, whether or not any pixel uses it. */
  declared: boolean;
  note?: string;
};

export type IccInfo = {
  byteLength: number;
  description: string | null;
  colourSpace: string | null;
  profileClass: string | null;
  version: string | null;
  /** Which container feature carried the profile. */
  source: string;
};

/* -------------------------------------------------------------------------- */
/* Byte helpers                                                                */
/* -------------------------------------------------------------------------- */

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function ascii(bytes: Uint8Array, at: number, length: number): string {
  if (at < 0 || at + length > bytes.length) return "";
  let out = "";
  for (let i = 0; i < length; i += 1) out += String.fromCharCode(bytes[at + i] ?? 0);
  return out;
}

/** Latin-1 text up to `length` bytes, stopping at the first NUL. */
function latin1(bytes: Uint8Array, at: number, length: number): string {
  if (at < 0 || length <= 0) return "";
  const end = Math.min(bytes.length, at + length);
  let out = "";
  for (let i = at; i < end; i += 1) {
    const byte = bytes[i] ?? 0;
    if (byte === 0) break;
    out += String.fromCharCode(byte);
  }
  return out;
}

/** Collapses control characters so a crafted string cannot reflow the UI. */
function sanitise(value: string, max = 180): string {
  const cleaned = value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  return cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned;
}

function u8(bytes: Uint8Array, at: number): number {
  return bytes[at] ?? 0;
}

/* -------------------------------------------------------------------------- */
/* Geometry and efficiency                                                     */
/* -------------------------------------------------------------------------- */

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y > 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

export type AspectRatio = {
  /** Fully reduced integer ratio. */
  a: number;
  b: number;
  /** `w / h`. */
  decimal: number;
  /** Set when the reduced ratio is unwieldy and a familiar one is within 1%. */
  nearest: string | null;
  label: string;
};

const COMMON_RATIOS: ReadonlyArray<readonly [number, number]> = [
  [1, 1], [5, 4], [4, 3], [3, 2], [16, 10], [16, 9], [2, 1], [21, 9], [1.85, 1], [2.39, 1], [3, 1],
];

/**
 * A reduced ratio is the honest answer but 1207:800 tells nobody anything, so a
 * familiar ratio is offered alongside it whenever one lands within 1%.
 */
export function aspectRatio(width: number, height: number): AspectRatio | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const divisor = gcd(width, height);
  const a = width / divisor;
  const b = height / divisor;
  const decimal = width / height;

  let nearest: string | null = null;
  let best = Infinity;
  for (const [ca, cb] of COMMON_RATIOS) {
    for (const value of [ca / cb, cb / ca]) {
      const delta = Math.abs(Math.log(decimal / value));
      if (delta < best) {
        best = delta;
        const portrait = value < 1;
        const label = ca === 1.85 || ca === 2.39
          ? `${ca}:1`
          : portrait ? `${cb}:${ca}` : `${ca}:${cb}`;
        nearest = label;
      }
    }
  }
  // 1% is tight enough that "effectively 3:2" is never a lie about the crop.
  if (best > 0.01) nearest = null;

  const unwieldy = a > 50 || b > 50;
  const exact = `${a}:${b}`;
  return {
    a,
    b,
    decimal,
    nearest: nearest && nearest !== exact ? nearest : null,
    label: unwieldy ? `${decimal.toFixed(3)}:1` : exact,
  };
}

export function megapixels(width: number, height: number): number {
  return (width * height) / 1_000_000;
}

/**
 * Bits per pixel: the one number that compares compression efficiency across
 * images of different sizes. Roughly: under 1 is efficient for a photo, 8 and
 * above means the file is barely compressed at all.
 */
export function bitsPerPixel(byteLength: number, width: number, height: number): number | null {
  const pixels = width * height;
  if (!Number.isFinite(pixels) || pixels <= 0) return null;
  return (byteLength * 8) / pixels;
}

export function describeBitsPerPixel(bpp: number, hasAlpha: boolean): string {
  const ceiling = hasAlpha ? 32 : 24;
  if (bpp >= ceiling) return "Uncompressed or larger than raw";
  if (bpp >= 8) return "Very light compression";
  if (bpp >= 4) return "Light compression";
  if (bpp >= 1.5) return "Moderate compression";
  if (bpp >= 0.5) return "Efficient";
  return "Very aggressive compression";
}

/* -------------------------------------------------------------------------- */
/* EXIF / TIFF                                                                 */
/* -------------------------------------------------------------------------- */

export type GpsPosition = {
  latitude: number;
  longitude: number;
  /** Rounded decimal degrees, ready to paste into a map. */
  decimal: string;
  /** Degrees, minutes, seconds. */
  sexagesimal: string;
  altitude: string | null;
  timestamp: string | null;
  mapDatum: string | null;
};

export type ExifTag = {
  group: "Image" | "Photo" | "GPS" | "Thumbnail";
  id: number;
  name: string;
  value: string;
};

export type ExifDetail = {
  present: boolean;
  /** Size of the TIFF block, which is what a "strip metadata" pass removes. */
  byteLength: number;
  orientation: number;
  orientationLabel: string;
  tags: ExifTag[];
  gps: GpsPosition | null;
  hasThumbnail: boolean;
  thumbnailBytes: number | null;
  camera: string | null;
  lens: string | null;
  software: string | null;
  dateTaken: string | null;
  exposure: string | null;
  aperture: string | null;
  iso: string | null;
  focalLength: string | null;
  focalLength35: string | null;
  exposureProgram: string | null;
  meteringMode: string | null;
  flash: string | null;
  whiteBalance: string | null;
  exifColourSpace: string | null;
  artist: string | null;
  copyright: string | null;
};

export const NO_EXIF_DETAIL: ExifDetail = {
  present: false,
  byteLength: 0,
  orientation: 1,
  orientationLabel: "Normal",
  tags: [],
  gps: null,
  hasThumbnail: false,
  thumbnailBytes: null,
  camera: null,
  lens: null,
  software: null,
  dateTaken: null,
  exposure: null,
  aperture: null,
  iso: null,
  focalLength: null,
  focalLength35: null,
  exposureProgram: null,
  meteringMode: null,
  flash: null,
  whiteBalance: null,
  exifColourSpace: null,
  artist: null,
  copyright: null,
};

export const ORIENTATION_LABEL: Record<number, string> = {
  1: "Normal",
  2: "Mirrored horizontally",
  3: "Rotated 180 degrees",
  4: "Mirrored vertically",
  5: "Mirrored horizontally, rotated 270 degrees CW",
  6: "Rotated 90 degrees CW",
  7: "Mirrored horizontally, rotated 90 degrees CW",
  8: "Rotated 270 degrees CW",
};

const EXPOSURE_PROGRAM: Record<number, string> = {
  0: "Not defined",
  1: "Manual",
  2: "Program AE",
  3: "Aperture priority",
  4: "Shutter priority",
  5: "Creative (slow speed)",
  6: "Action (high speed)",
  7: "Portrait",
  8: "Landscape",
};

const METERING_MODE: Record<number, string> = {
  0: "Unknown",
  1: "Average",
  2: "Centre-weighted average",
  3: "Spot",
  4: "Multi-spot",
  5: "Pattern",
  6: "Partial",
  255: "Other",
};

const TYPE_SIZE: Record<number, number> = {
  1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8,
};

type Tiff = {
  view: DataView;
  bytes: Uint8Array;
  little: boolean;
  /** Absolute offset of the TIFF header; every IFD pointer is relative to it. */
  start: number;
  /** Absolute hard stop for every read. */
  end: number;
};

type TiffValue = {
  type: number;
  count: number;
  numbers: number[];
  rationals: Array<[number, number]>;
  text: string | null;
};

function readTiffValue(t: Tiff, entryAt: number): TiffValue | null {
  const type = t.view.getUint16(entryAt + 2, t.little);
  const count = t.view.getUint32(entryAt + 4, t.little);
  const unit = TYPE_SIZE[type];
  // An unknown type carries an unknown stride, so its payload cannot be trusted.
  if (!unit || count === 0 || count > 65536) return null;

  const size = unit * count;
  const at = size <= 4 ? entryAt + 8 : t.start + t.view.getUint32(entryAt + 8, t.little);
  if (at < t.start || at + size > t.end) return null;

  if (type === 2 || type === 7) {
    const raw = latin1(t.bytes, at, Math.min(size, 512));
    return { type, count, numbers: [], rationals: [], text: sanitise(raw) };
  }

  const numbers: number[] = [];
  const rationals: Array<[number, number]> = [];
  const take = Math.min(count, 64);
  for (let i = 0; i < take; i += 1) {
    const p = at + i * unit;
    switch (type) {
      case 1: numbers.push(t.view.getUint8(p)); break;
      case 3: numbers.push(t.view.getUint16(p, t.little)); break;
      case 4: numbers.push(t.view.getUint32(p, t.little)); break;
      case 6: numbers.push(t.view.getInt8(p)); break;
      case 8: numbers.push(t.view.getInt16(p, t.little)); break;
      case 9: numbers.push(t.view.getInt32(p, t.little)); break;
      case 11: numbers.push(t.view.getFloat32(p, t.little)); break;
      case 12: numbers.push(t.view.getFloat64(p, t.little)); break;
      case 5:
      case 10: {
        const num = type === 5 ? t.view.getUint32(p, t.little) : t.view.getInt32(p, t.little);
        const den = type === 5 ? t.view.getUint32(p + 4, t.little) : t.view.getInt32(p + 4, t.little);
        rationals.push([num, den]);
        numbers.push(den === 0 ? Number.NaN : num / den);
        break;
      }
      default: return null;
    }
  }
  return { type, count, numbers, rationals, text: null };
}

type IfdEntry = { tag: number; value: TiffValue | null; rawOffset: number };

function readIfd(t: Tiff, ifdOffset: number): { entries: IfdEntry[]; next: number } {
  const base = t.start + ifdOffset;
  if (ifdOffset <= 0 || base + 2 > t.end) return { entries: [], next: 0 };
  const count = t.view.getUint16(base, t.little);
  if (count > 2048 || base + 2 + count * 12 + 4 > t.end) return { entries: [], next: 0 };

  const entries: IfdEntry[] = [];
  for (let i = 0; i < count; i += 1) {
    const entryAt = base + 2 + i * 12;
    entries.push({
      tag: t.view.getUint16(entryAt, t.little),
      value: readTiffValue(t, entryAt),
      rawOffset: t.view.getUint32(entryAt + 8, t.little),
    });
  }
  return { entries, next: t.view.getUint32(base + 2 + count * 12, t.little) };
}

function firstNumber(value: TiffValue | null): number | null {
  if (!value || value.numbers.length === 0) return null;
  const n = value.numbers[0];
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function tagText(value: TiffValue | null): string | null {
  const out = value?.text?.trim();
  return out ? out : null;
}

function formatExposure(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "unknown";
  if (seconds >= 1) return `${Number(seconds.toFixed(2))} s`;
  return `1/${Math.round(1 / seconds)} s`;
}

function formatFlash(value: number): string {
  if ((value & 0x20) === 0x20) return "No flash function";
  const fired = (value & 1) === 1;
  const parts = [fired ? "Fired" : "Did not fire"];
  if ((value & 0x40) === 0x40) parts.push("red-eye reduction");
  const ret = (value >> 1) & 3;
  if (fired && ret === 2) parts.push("no return light");
  if (fired && ret === 3) parts.push("return light detected");
  if ((value & 0x18) === 0x18) parts.push("auto");
  else if ((value & 0x18) === 0x08) parts.push("compulsory");
  return parts.join(", ");
}

function toDms(value: number, positive: string, negative: string): string {
  const sign = value < 0 ? negative : positive;
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const minutes = Math.floor((abs - deg) * 60);
  const seconds = ((abs - deg) * 60 - minutes) * 60;
  return `${deg}d ${String(minutes).padStart(2, "0")}m ${seconds.toFixed(1)}s ${sign}`;
}

function gpsDegrees(value: TiffValue | null, ref: string | null): number | null {
  if (!value || value.rationals.length < 3) return null;
  const parts = value.rationals.slice(0, 3).map(([n, d]) => (d === 0 ? Number.NaN : n / d));
  const deg = parts[0] ?? Number.NaN;
  const min = parts[1] ?? Number.NaN;
  const sec = parts[2] ?? Number.NaN;
  const magnitude = deg + min / 60 + sec / 3600;
  if (!Number.isFinite(magnitude)) return null;
  return ref === "S" || ref === "W" ? -magnitude : magnitude;
}

const IMAGE_TAG_NAMES: Record<number, string> = {
  0x0100: "ImageWidth", 0x0101: "ImageLength", 0x0102: "BitsPerSample",
  0x0103: "Compression", 0x0106: "PhotometricInterpretation", 0x010e: "ImageDescription",
  0x010f: "Make", 0x0110: "Model", 0x0112: "Orientation", 0x011a: "XResolution",
  0x011b: "YResolution", 0x0128: "ResolutionUnit", 0x0131: "Software", 0x0132: "DateTime",
  0x013b: "Artist", 0x013e: "WhitePoint", 0x013f: "PrimaryChromaticities",
  0x0211: "YCbCrCoefficients", 0x0213: "YCbCrPositioning", 0x0214: "ReferenceBlackWhite",
  0x8298: "Copyright", 0x8769: "ExifIFDPointer", 0x8825: "GPSInfoIFDPointer",
  0x9c9b: "XPTitle", 0x9c9c: "XPComment", 0x9c9d: "XPAuthor", 0x9c9e: "XPKeywords",
  0x9c9f: "XPSubject", 0xc614: "UniqueCameraModel",
};

const PHOTO_TAG_NAMES: Record<number, string> = {
  0x829a: "ExposureTime", 0x829d: "FNumber", 0x8822: "ExposureProgram",
  0x8827: "ISOSpeedRatings", 0x8830: "SensitivityType", 0x8832: "RecommendedExposureIndex",
  0x9000: "ExifVersion", 0x9003: "DateTimeOriginal", 0x9004: "DateTimeDigitized",
  0x9010: "OffsetTime", 0x9011: "OffsetTimeOriginal", 0x9201: "ShutterSpeedValue",
  0x9202: "ApertureValue", 0x9203: "BrightnessValue", 0x9204: "ExposureBiasValue",
  0x9205: "MaxApertureValue", 0x9206: "SubjectDistance", 0x9207: "MeteringMode",
  0x9208: "LightSource", 0x9209: "Flash", 0x920a: "FocalLength", 0x927c: "MakerNote",
  0x9286: "UserComment", 0xa001: "ColorSpace", 0xa002: "PixelXDimension",
  0xa003: "PixelYDimension", 0xa402: "ExposureMode", 0xa403: "WhiteBalance",
  0xa404: "DigitalZoomRatio", 0xa405: "FocalLengthIn35mmFilm", 0xa406: "SceneCaptureType",
  0xa408: "Contrast", 0xa409: "Saturation", 0xa40a: "Sharpness", 0xa420: "ImageUniqueID",
  0xa430: "CameraOwnerName", 0xa431: "BodySerialNumber", 0xa432: "LensSpecification",
  0xa433: "LensMake", 0xa434: "LensModel", 0xa435: "LensSerialNumber",
};

const GPS_TAG_NAMES: Record<number, string> = {
  0x0000: "GPSVersionID", 0x0001: "GPSLatitudeRef", 0x0002: "GPSLatitude",
  0x0003: "GPSLongitudeRef", 0x0004: "GPSLongitude", 0x0005: "GPSAltitudeRef",
  0x0006: "GPSAltitude", 0x0007: "GPSTimeStamp", 0x0008: "GPSSatellites",
  0x0009: "GPSStatus", 0x000a: "GPSMeasureMode", 0x000b: "GPSDOP", 0x000c: "GPSSpeedRef",
  0x000d: "GPSSpeed", 0x000e: "GPSTrackRef", 0x000f: "GPSTrack",
  0x0010: "GPSImgDirectionRef", 0x0011: "GPSImgDirection", 0x0012: "GPSMapDatum",
  0x001b: "GPSProcessingMethod", 0x001d: "GPSDateStamp", 0x001f: "GPSHPositioningError",
};

function hexTag(tag: number): string {
  return `Tag 0x${tag.toString(16).padStart(4, "0")}`;
}

function renderValue(value: TiffValue | null): string {
  if (!value) return "unreadable";
  if (value.text !== null) return value.text || "(empty)";
  if (value.rationals.length > 0) {
    return value.rationals
      .slice(0, 6)
      .map(([n, d]) => (d === 1 ? String(n) : `${n}/${d}`))
      .join(", ");
  }
  if (value.numbers.length === 0) return "(no value)";
  const shown = value.numbers.slice(0, 8).map((n) => (Number.isInteger(n) ? String(n) : n.toFixed(4)));
  return shown.join(", ") + (value.count > shown.length ? ` and ${value.count - shown.length} more` : "");
}

/**
 * Parses a TIFF header at `start` into a rich record.
 *
 * `end` is the hard limit of the metadata block. Passing the whole file instead
 * would let a crafted value offset read image data back out as a "tag".
 */
export function parseTiff(bytes: Uint8Array, start: number, end: number): ExifDetail {
  try {
    if (start < 0 || start + 8 > end || end > bytes.length) return NO_EXIF_DETAIL;
    const view = viewOf(bytes);
    const order = view.getUint16(start, false);
    if (order !== 0x4949 && order !== 0x4d4d) return NO_EXIF_DETAIL;
    const little = order === 0x4949;
    if (view.getUint16(start + 2, little) !== 42) return NO_EXIF_DETAIL;

    const t: Tiff = { view, bytes, little, start, end };
    const ifd0 = readIfd(t, view.getUint32(start + 4, little));

    const detail: ExifDetail = { ...NO_EXIF_DETAIL, present: true, byteLength: end - start };
    const tags: ExifTag[] = [];
    let exifPointer = 0;
    let gpsPointer = 0;
    let make: string | null = null;
    let model: string | null = null;

    for (const entry of ifd0.entries) {
      if (entry.tag === 0x8769) { exifPointer = entry.rawOffset; continue; }
      if (entry.tag === 0x8825) { gpsPointer = entry.rawOffset; continue; }
      tags.push({
        group: "Image",
        id: entry.tag,
        name: IMAGE_TAG_NAMES[entry.tag] ?? hexTag(entry.tag),
        value: renderValue(entry.value),
      });
      switch (entry.tag) {
        case 0x0112: {
          const o = firstNumber(entry.value);
          if (o !== null && o >= 1 && o <= 8) detail.orientation = o;
          break;
        }
        case 0x010f: make = tagText(entry.value); break;
        case 0x0110: model = tagText(entry.value); break;
        case 0x0131: detail.software = tagText(entry.value); break;
        case 0x0132: detail.dateTaken = tagText(entry.value); break;
        case 0x013b: detail.artist = tagText(entry.value); break;
        case 0x8298: detail.copyright = tagText(entry.value); break;
      }
    }

    // Most bodies repeat the make inside the model ("NIKON" + "NIKON Z 6").
    if (make && model) detail.camera = model.toUpperCase().startsWith(make.toUpperCase()) ? model : `${make} ${model}`;
    else detail.camera = model ?? make;

    if (exifPointer > 0) {
      let lensMake: string | null = null;
      for (const entry of readIfd(t, exifPointer).entries) {
        tags.push({
          group: "Photo",
          id: entry.tag,
          name: PHOTO_TAG_NAMES[entry.tag] ?? hexTag(entry.tag),
          // A MakerNote is an opaque vendor blob; its bytes are noise, not data.
          value: entry.tag === 0x927c
            ? `${entry.value?.count ?? 0} bytes, vendor-specific`
            : renderValue(entry.value),
        });
        const n = firstNumber(entry.value);
        switch (entry.tag) {
          case 0x829a: if (n !== null) detail.exposure = formatExposure(n); break;
          case 0x829d: if (n !== null && n > 0) detail.aperture = `f/${Number(n.toFixed(1))}`; break;
          case 0x8822: if (n !== null) detail.exposureProgram = EXPOSURE_PROGRAM[n] ?? `Mode ${n}`; break;
          case 0x8827: if (n !== null && n > 0) detail.iso = `ISO ${n}`; break;
          case 0x9003: detail.dateTaken = tagText(entry.value) ?? detail.dateTaken; break;
          case 0x9207: if (n !== null) detail.meteringMode = METERING_MODE[n] ?? `Mode ${n}`; break;
          case 0x9209: if (n !== null) detail.flash = formatFlash(n); break;
          case 0x920a: if (n !== null && n > 0) detail.focalLength = `${Number(n.toFixed(1))} mm`; break;
          case 0xa001:
            detail.exifColourSpace =
              n === 1 ? "sRGB" : n === 2 ? "Adobe RGB" : n === 0xffff ? "Uncalibrated" : null;
            break;
          case 0xa403: if (n !== null) detail.whiteBalance = n === 0 ? "Auto" : "Manual"; break;
          case 0xa405: if (n !== null && n > 0) detail.focalLength35 = `${Math.round(n)} mm equivalent`; break;
          case 0xa433: lensMake = tagText(entry.value); break;
          case 0xa434: detail.lens = tagText(entry.value); break;
        }
      }
      if (!detail.lens && lensMake) detail.lens = lensMake;
      else if (detail.lens && lensMake && !detail.lens.toUpperCase().startsWith(lensMake.toUpperCase())) {
        detail.lens = `${lensMake} ${detail.lens}`;
      }
    }

    if (gpsPointer > 0) {
      let latRef: string | null = null;
      let lonRef: string | null = null;
      let lat: TiffValue | null = null;
      let lon: TiffValue | null = null;
      let altitude: number | null = null;
      let altitudeRef = 0;
      let clock: string | null = null;
      let date: string | null = null;
      let datum: string | null = null;

      for (const entry of readIfd(t, gpsPointer).entries) {
        tags.push({
          group: "GPS",
          id: entry.tag,
          name: GPS_TAG_NAMES[entry.tag] ?? hexTag(entry.tag),
          value: renderValue(entry.value),
        });
        switch (entry.tag) {
          case 0x0001: latRef = tagText(entry.value); break;
          case 0x0002: lat = entry.value; break;
          case 0x0003: lonRef = tagText(entry.value); break;
          case 0x0004: lon = entry.value; break;
          case 0x0005: altitudeRef = firstNumber(entry.value) ?? 0; break;
          case 0x0006: altitude = firstNumber(entry.value); break;
          case 0x0007: {
            const parts = entry.value?.rationals.slice(0, 3).map(([n, d]) => (d === 0 ? 0 : n / d));
            if (parts && parts.length === 3) {
              clock = parts.map((p) => String(Math.round(p)).padStart(2, "0")).join(":");
            }
            break;
          }
          case 0x0012: datum = tagText(entry.value); break;
          case 0x001d: date = tagText(entry.value); break;
        }
      }

      const latitude = gpsDegrees(lat, latRef);
      const longitude = gpsDegrees(lon, lonRef);
      // A null island fix is the signature of a cleared GPS block, not a place.
      const plausible =
        latitude !== null && longitude !== null &&
        Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 &&
        !(latitude === 0 && longitude === 0);

      if (plausible && latitude !== null && longitude !== null) {
        detail.gps = {
          latitude,
          longitude,
          decimal: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
          sexagesimal: `${toDms(latitude, "N", "S")}  ${toDms(longitude, "E", "W")}`,
          altitude:
            altitude === null || !Number.isFinite(altitude)
              ? null
              : `${Math.round(Math.abs(altitude))} m ${altitudeRef === 1 ? "below" : "above"} sea level`,
          timestamp: date && clock ? `${date} ${clock} UTC` : date ?? (clock ? `${clock} UTC` : null),
          mapDatum: datum,
        };
      }
    }

    // IFD1 holds the embedded preview, which carries its own copy of the scene.
    if (ifd0.next > 0) {
      for (const entry of readIfd(t, ifd0.next).entries) {
        if (entry.tag === 0x0201) detail.hasThumbnail = true;
        if (entry.tag === 0x0202) detail.thumbnailBytes = firstNumber(entry.value);
      }
      if (detail.hasThumbnail) {
        tags.push({
          group: "Thumbnail",
          id: 0x0201,
          name: "ThumbnailImage",
          value: detail.thumbnailBytes ? `${detail.thumbnailBytes} bytes` : "present",
        });
      }
    }

    detail.orientationLabel = ORIENTATION_LABEL[detail.orientation] ?? "Unknown";
    detail.tags = tags;
    return detail;
  } catch {
    return NO_EXIF_DETAIL;
  }
}

/* -------------------------------------------------------------------------- */
/* ICC profiles                                                                */
/* -------------------------------------------------------------------------- */

const ICC_COLOUR_SPACE: Record<string, string> = {
  "RGB ": "RGB",
  GRAY: "Greyscale",
  CMYK: "CMYK",
  "Lab ": "CIE L*a*b*",
  "XYZ ": "CIE XYZ",
  YCbr: "YCbCr",
  "CMY ": "CMY",
};

const ICC_CLASS: Record<string, string> = {
  scnr: "Input device",
  mntr: "Display device",
  prtr: "Output device",
  link: "Device link",
  spac: "Colour space conversion",
  abst: "Abstract",
  nmcl: "Named colour",
};

/** Pulls the human-readable name out of the profile's `desc` tag. */
function iccDescription(icc: Uint8Array): string | null {
  try {
    const view = viewOf(icc);
    if (icc.length < 132) return null;
    const tagCount = view.getUint32(128);
    if (tagCount === 0 || tagCount > 256 || 132 + tagCount * 12 > icc.length) return null;

    for (let i = 0; i < tagCount; i += 1) {
      const at = 132 + i * 12;
      if (ascii(icc, at, 4) !== "desc") continue;
      const offset = view.getUint32(at + 4);
      const size = view.getUint32(at + 8);
      if (offset + Math.min(size, 8) > icc.length || size < 12) return null;

      const type = ascii(icc, offset, 4);
      if (type === "desc") {
        const length = view.getUint32(offset + 8);
        if (length === 0 || offset + 12 + length > icc.length) return null;
        return sanitise(latin1(icc, offset + 12, Math.min(length, 128))) || null;
      }
      if (type === "mluc") {
        const records = view.getUint32(offset + 8);
        if (records === 0 || offset + 28 > icc.length) return null;
        const length = view.getUint32(offset + 20);
        const stringAt = offset + view.getUint32(offset + 24);
        if (length === 0 || stringAt + length > icc.length) return null;
        let out = "";
        for (let p = 0; p + 1 < Math.min(length, 256); p += 2) {
          const code = view.getUint16(stringAt + p);
          if (code === 0) break;
          out += String.fromCharCode(code);
        }
        return sanitise(out) || null;
      }
      return null;
    }
    return null;
  } catch {
    return null;
  }
}

export function parseIcc(icc: Uint8Array, source: string): IccInfo | null {
  try {
    if (icc.length < 128 || ascii(icc, 36, 4) !== "acsp") {
      return icc.length > 0
        ? { byteLength: icc.length, description: null, colourSpace: null, profileClass: null, version: null, source }
        : null;
    }
    const view = viewOf(icc);
    const major = view.getUint8(8);
    const minor = view.getUint8(9);
    const space = ascii(icc, 16, 4);
    const cls = ascii(icc, 12, 4);
    return {
      byteLength: icc.length,
      description: iccDescription(icc),
      colourSpace: ICC_COLOUR_SPACE[space] ?? space.trim() ?? null,
      profileClass: ICC_CLASS[cls] ?? cls.trim() ?? null,
      version: `${major}.${minor >> 4}.${minor & 0x0f}`,
      source,
    };
  } catch {
    return null;
  }
}
