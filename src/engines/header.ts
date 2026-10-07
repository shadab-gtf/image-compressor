import type { Dimensions, ImageFormat } from "@/types/image";
import { tiffHeader } from "./tiff";

/** Bounded metadata read; no pixel decoder is invoked during this preflight. */
export const HEADER_BYTES = 1_048_576;

export function readHeaderDimensions(bytes: Uint8Array, format: ImageFormat): Dimensions | null {
  if (format === "tiff") { try { const { width, height } = tiffHeader(bytes); return { width, height }; } catch { return null; } }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (at: number, count: number) =>
    String.fromCharCode(...bytes.subarray(at, at + count));
  const dimensions = (width: number, height: number): Dimensions => ({ width, height });

  if (format === "png") {
    return bytes.length >= 24 && text(12, 4) === "IHDR"
      ? dimensions(view.getUint32(16), view.getUint32(20))
      : null;
  }
  if (format === "gif") {
    return bytes.length >= 10 ? dimensions(view.getUint16(6, true), view.getUint16(8, true)) : null;
  }
  if (format === "bmp") {
    if (bytes.length < 26) return null;
    const headerSize = view.getUint32(14, true);
    return headerSize === 12
      ? dimensions(view.getUint16(18, true), view.getUint16(20, true))
      : headerSize >= 40
        ? dimensions(view.getInt32(18, true), Math.abs(view.getInt32(22, true)))
        : null;
  }
  if (format === "jpeg") {
    let at = 2;
    while (at + 4 <= bytes.length) {
      if (bytes[at] !== 0xff) return null;
      while (bytes[at] === 0xff) at += 1;
      const marker = bytes[at++];
      if (marker === undefined || marker === 0xda || marker === 0xd9) return null;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (at + 2 > bytes.length) return null;
      const length = view.getUint16(at);
      if (length < 2 || at + length > bytes.length) return null;
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return length >= 8
          ? dimensions(view.getUint16(at + 5), view.getUint16(at + 3))
          : null;
      }
      at += length;
    }
    return null;
  }
  if (format === "webp") {
    // Extended WebP declares its canvas before image or animation chunks.
    if (bytes.length < 25) return null;
    const chunk = text(12, 4);
    if (chunk === "VP8X" && bytes.length >= 30) {
      const u24 = (at: number) => bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16);
      return dimensions(u24(24) + 1, u24(27) + 1);
    }
    if (chunk === "VP8 " && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      return dimensions(view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff);
    }
    if (chunk === "VP8L" && bytes[20] === 0x2f) {
      const bits = view.getUint32(21, true);
      return dimensions((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
    }
    return null;
  }

  // AVIF dimensions live in meta/iprp/ipco/ispe. Inspect only real BMFF boxes,
  // never a byte-pattern match inside compressed payloads. A grid's largest
  // declared extent is a conservative bound even when it has multiple tiles.
  let largest: Dimensions | null = null;
  const walk = (start: number, end: number, depth: number): void => {
    if (depth > 5) return;
    for (let at = start; at + 8 <= end;) {
      let size = view.getUint32(at);
      const type = text(at + 4, 4);
      let header = 8;
      if (size === 1) {
        if (at + 16 > end) return;
        const extended = view.getBigUint64(at + 8);
        if (extended > BigInt(Number.MAX_SAFE_INTEGER)) return;
        size = Number(extended);
        header = 16;
      } else if (size === 0) size = end - at;
      if (size < header || at + size > end) return;
      const body = at + header;
      if (type === "ispe" && size >= header + 12) {
        const found = dimensions(view.getUint32(body + 4), view.getUint32(body + 8));
        largest = largest
          ? dimensions(Math.max(largest.width, found.width), Math.max(largest.height, found.height))
          : found;
      } else if (type === "meta" && size >= header + 4) walk(body + 4, at + size, depth + 1);
      else if (type === "iprp" || type === "ipco") walk(body, at + size, depth + 1);
      at += size;
    }
  };
  walk(0, bytes.length, 0);
  return largest;
}
