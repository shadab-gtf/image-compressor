import type { ImageFormat } from "@/types/image";
import { EXTENSION_BY_FORMAT } from "@/types/image";

/**
 * Format detection from file content.
 *
 * The extension and the MIME type the OS reports are both attacker-controlled
 * and routinely wrong, so the pipeline never trusts them. Everything downstream
 * — which decoder to use, whether alpha is possible, whether to even attempt a
 * decode — keys off the magic bytes read here.
 */

/** Enough bytes to identify every supported container. */
export const SNIFF_BYTES = 256;

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i += 1) out += String.fromCharCode(bytes[offset + i] ?? 0);
  return out;
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, i) => bytes[i] === byte);
}

export function sniffFormat(bytes: Uint8Array): ImageFormat | null {
  if (bytes.length < 4) return null;
  if (startsWith(bytes, [73, 73, 42, 0]) || startsWith(bytes, [77, 77, 0, 42])) return "tiff";

  // JPEG: SOI marker.
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";

  // PNG: 8-byte signature.
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";

  // GIF.
  if (bytes.length >= 6) {
    const header = ascii(bytes, 0, 6);
    if (header === "GIF87a" || header === "GIF89a") return "gif";
  }

  // BMP.
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return "bmp";

  // RIFF container — WebP is one of several possible payloads.
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return "webp";
  }

  // ISO-BMFF: AVIF declares itself through the `ftyp` brand list.
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === "ftyp") {
    const brand = ascii(bytes, 8, 4);
    // `avis` is an AVIF image sequence; the browser decodes it as an image.
    if (brand === "avif" || brand === "avis") return "avif";
    // Some encoders put the AVIF brand only in the compatible-brand list.
    const declaredSize = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
    const end = Math.min(bytes.length, declaredSize);
    for (let at = 16; at + 4 <= end; at += 4) {
      const compatible = ascii(bytes, at, 4);
      if (compatible === "avif" || compatible === "avis") return "avif";
    }
  }

  return null;
}

/** Reads just the header of a file rather than pulling the whole blob into memory. */
export async function sniffFile(file: Blob): Promise<ImageFormat | null> {
  const head = file.slice(0, SNIFF_BYTES);
  const buffer = await head.arrayBuffer();
  return sniffFormat(new Uint8Array(buffer));
}

/** The format implied by the filename, used only to detect a mismatch. */
export function formatFromExtension(name: string): ImageFormat | null {
  const ext = name.toLowerCase().split(".").pop();
  if (!ext) return null;
  if (ext === "jpg" || ext === "jpeg") return "jpeg";
  if (ext === "tif") return "tiff";
  for (const [format, extension] of Object.entries(EXTENSION_BY_FORMAT)) {
    if (extension === ext) return format as ImageFormat;
  }
  return null;
}

/** Replaces a filename's extension, preserving the rest of the name verbatim. */
export function withExtension(name: string, extension: string): string {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  return `${stem}.${extension}`;
}

export function baseName(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

/**
 * Guard rails against decompression bombs.
 *
 * A 40 KB PNG can declare 50000x50000 pixels, which would ask the browser for
 * ~10 GB of RGBA and take down the tab. The pixel cap is checked *before* any
 * bitmap is allocated.
 */
export const LIMITS = {
  /** Per-file safety bounds; decoded RGBA surfaces require much more memory. */
  maxFileBytes: 128 * 1024 * 1024,
  maxPixels: 40_000_000,
  maxEdge: 16_384,
} as const;
