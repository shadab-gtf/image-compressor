import type { ImageFormat, OutputFormat } from "@/types/image";
import { IMAGE_FORMATS, MIME_BY_FORMAT, OUTPUT_FORMATS } from "@/types/image";

/**
 * Runtime codec capability probing.
 *
 * Browser image support cannot be derived from a user-agent string or a version
 * table: AVIF encoding in particular ships at different times per platform and
 * can be absent in an otherwise current browser. The product promises never to
 * advertise a format whose pipeline does not work, so the only honest answer is
 * to actually encode and decode a 1x1 image at startup and report what happened.
 *
 * The probe costs roughly a millisecond per format and runs once per context.
 */

export type CodecSupport = {
  decode: Record<ImageFormat, boolean>;
  encode: Record<OutputFormat, boolean>;
  offscreenCanvas: boolean;
  imageBitmap: boolean;
  createImageBitmapOrientation: boolean;
};

/** 1x1 samples, the smallest valid file each format admits. */
const SAMPLES: Record<ImageFormat, string> = {
  jpeg:
    "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
    "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA" +
    "AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  png: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  webp: "UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==",
  avif:
    "AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAA" +
    "AAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAAB" +
    "AAEAAAABAAABGgAAAB0AAABoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAA" +
    "amlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAEAAAABAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFD" +
    "gQAMAAAAABNjb2xybmNseAACAAIABoAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAK" +
    "CBgABogQEDQgMgkQAAAAB8dSLfI=",
  gif: "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  bmp: "Qk06AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABABgAAAAAAAQAAAATCwAAEwsAAAAAAAAAAAAA////AA==",
};

function base64ToBlob(data: string, mime: string): Blob {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function canDecode(format: ImageFormat): Promise<boolean> {
  try {
    const blob = base64ToBlob(SAMPLES[format], MIME_BY_FORMAT[format]);
    const bitmap = await createImageBitmap(blob);
    // Release immediately — a probe must not hold GPU memory.
    bitmap.close();
    return true;
  } catch {
    return false;
  }
}

async function canEncode(format: OutputFormat): Promise<boolean> {
  try {
    const canvas = new OffscreenCanvas(1, 1);
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    ctx.fillRect(0, 0, 1, 1);
    const mime = MIME_BY_FORMAT[format];
    const blob = await canvas.convertToBlob({ type: mime, quality: 0.8 });
    // Browsers silently fall back to PNG for a type they cannot write, so the
    // returned MIME is the only trustworthy signal. Checking only for a non-null
    // blob would wrongly report AVIF support almost everywhere.
    return blob.type === mime;
  } catch {
    return false;
  }
}

function emptyDecode(): Record<ImageFormat, boolean> {
  return Object.fromEntries(IMAGE_FORMATS.map((f) => [f, false])) as Record<
    ImageFormat,
    boolean
  >;
}

function emptyEncode(): Record<OutputFormat, boolean> {
  return Object.fromEntries(OUTPUT_FORMATS.map((f) => [f, false])) as Record<
    OutputFormat,
    boolean
  >;
}

let cached: Promise<CodecSupport> | null = null;

export function detectCapabilities(): Promise<CodecSupport> {
  cached ??= (async (): Promise<CodecSupport> => {
    const offscreenCanvas = typeof OffscreenCanvas !== "undefined";
    const imageBitmap = typeof createImageBitmap === "function";

    if (!imageBitmap || !offscreenCanvas) {
      return {
        decode: emptyDecode(),
        encode: emptyEncode(),
        offscreenCanvas,
        imageBitmap,
        createImageBitmapOrientation: false,
      };
    }

    const [decodeResults, encodeResults, orientation] = await Promise.all([
      Promise.all(IMAGE_FORMATS.map(canDecode)),
      Promise.all(OUTPUT_FORMATS.map(canEncode)),
      probeOrientation(),
    ]);

    const decode = emptyDecode();
    IMAGE_FORMATS.forEach((format, i) => {
      decode[format] = decodeResults[i] ?? false;
    });

    const encode = emptyEncode();
    OUTPUT_FORMATS.forEach((format, i) => {
      encode[format] = encodeResults[i] ?? false;
    });

    return {
      decode,
      encode,
      offscreenCanvas,
      imageBitmap,
      createImageBitmapOrientation: orientation,
    };
  })();

  return cached;
}

/**
 * Whether `createImageBitmap` honours `imageOrientation: "from-image"`.
 *
 * When it does, EXIF-rotated photos come out upright for free. When it does not,
 * the pipeline has to apply the rotation itself, so this is worth knowing.
 */
async function probeOrientation(): Promise<boolean> {
  try {
    const blob = base64ToBlob(SAMPLES.jpeg, "image/jpeg");
    const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
    bitmap.close();
    return true;
  } catch {
    return false;
  }
}

/** Formats the user can actually pick as an output in this browser. */
export function availableOutputs(support: CodecSupport): OutputFormat[] {
  return OUTPUT_FORMATS.filter((format) => support.encode[format]);
}
