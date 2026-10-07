/**
 * Core image vocabulary.
 *
 * These types are deliberately free of React and DOM-UI concerns: the same
 * contracts are used by the worker, the engine and (eventually) a CLI, so the
 * processing core never has to import anything from the view layer.
 */

/** Formats the engine has an actual implemented path for. */
export const IMAGE_FORMATS = ["jpeg", "png", "webp", "avif", "gif", "bmp", "tiff"] as const;
export type ImageFormat = (typeof IMAGE_FORMATS)[number];

/** Formats the engine can *write*. GIF and BMP are decode-only. */
export const OUTPUT_FORMATS = ["jpeg", "png", "webp", "avif"] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

export type Dimensions = { width: number; height: number };

export const MIME_BY_FORMAT: Record<ImageFormat, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
  bmp: "image/bmp",
  tiff: "image/tiff",
};

export const EXTENSION_BY_FORMAT: Record<ImageFormat, string> = {
  jpeg: "jpg",
  png: "png",
  webp: "webp",
  avif: "avif",
  gif: "gif",
  bmp: "bmp",
  tiff: "tiff",
};

export const FORMAT_LABEL: Record<ImageFormat, string> = {
  jpeg: "JPEG",
  png: "PNG",
  webp: "WebP",
  avif: "AVIF",
  gif: "GIF",
  bmp: "BMP",
  tiff: "TIFF",
};

/** Formats that can carry an alpha channel. */
export const SUPPORTS_ALPHA: Record<ImageFormat, boolean> = {
  jpeg: false,
  png: true,
  webp: true,
  avif: true,
  gif: true,
  bmp: false,
  tiff: true,
};

/** Formats whose encoder takes a quality parameter. */
export const SUPPORTS_QUALITY: Record<OutputFormat, boolean> = {
  jpeg: true,
  png: false,
  webp: true,
  avif: true,
};

export function mimeToFormat(mime: string): ImageFormat | null {
  const normalised = mime.toLowerCase().split(";")[0]?.trim() ?? "";
  if (normalised === "image/jpg") return "jpeg";
  for (const format of IMAGE_FORMATS) {
    if (MIME_BY_FORMAT[format] === normalised) return format;
  }
  return null;
}
