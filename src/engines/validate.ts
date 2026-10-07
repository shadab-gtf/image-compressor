import type { CodecSupport } from "@/codecs/capabilities";
import { LIMITS, formatFromExtension, sniffFormat } from "@/lib/format";
import { FORMAT_LABEL, type ImageFormat } from "@/types/image";
import type { ProcessingError } from "@/types/job";

/**
 * Pre-decode validation.
 *
 * Runs before a single pixel is allocated. Everything rejected here would
 * otherwise become either a confusing failure deep inside the decoder or, in the
 * decompression-bomb case, a dead browser tab.
 */

export type ValidationOk = {
  ok: true;
  format: ImageFormat;
  declaredFormat: ImageFormat | null;
};

export type ValidationFailure = { ok: false; error: ProcessingError };

export function validateHeader(
  name: string,
  size: number,
  head: Uint8Array,
  support: CodecSupport,
): ValidationOk | ValidationFailure {
  if (size === 0) {
    return {
      ok: false,
      error: {
        code: "EMPTY_FILE",
        message: "This file is empty.",
        hint: "It may not have finished copying. Try adding it again.",
        retryable: true,
      },
    };
  }

  if (size > LIMITS.maxFileBytes) {
    return {
      ok: false,
      error: {
        code: "TOO_LARGE",
        message: "This file is too large to open safely in a browser.",
        hint: "Use a source smaller than 128 MiB, or resize it in a desktop editor first.",
        retryable: false,
      },
    };
  }

  const format = sniffFormat(head);
  if (!format) {
    return {
      ok: false,
      error: {
        code: "NOT_AN_IMAGE",
        message: "This file is not an image we recognise.",
        // Renaming a .exe to .jpg lands here, which is the point of sniffing.
        hint: "The file's contents do not match any supported image format.",
        retryable: false,
      },
    };
  }

  if (!support.decode[format]) {
    return {
      ok: false,
      error: {
        code: "DECODE_UNSUPPORTED",
        message: `This browser cannot decode ${FORMAT_LABEL[format]} images.`,
        hint:
          format === "avif"
            ? "Try Chrome, Edge or Firefox, or convert the file to JPEG first."
            : "Try a recent version of Chrome, Edge, Firefox or Safari.",
        retryable: false,
      },
    };
  }

  const declaredFormat = formatFromExtension(name);
  return {
    ok: true,
    format,
    // Recorded, not rejected: a .png that is really a JPEG is usually a harmless
    // rename, and the pipeline follows the bytes regardless.
    declaredFormat: declaredFormat && declaredFormat !== format ? declaredFormat : null,
  };
}

/** Checked after the header is parsed but before the bitmap is allocated. */
export function validateDimensions(
  width: number,
  height: number,
): ValidationFailure | null {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    return {
      ok: false,
      error: {
        code: "DECODE_FAILED",
        message: "This image reports no width or height.",
        hint: "The file is likely truncated or corrupt.",
        retryable: false,
      },
    };
  }

  if (width > LIMITS.maxEdge || height > LIMITS.maxEdge) {
    return {
      ok: false,
      error: {
        code: "DIMENSIONS_TOO_LARGE",
        message: `This image is ${width} x ${height}, which exceeds the browser's canvas limit.`,
        hint: "Reduce the image in a desktop editor first.",
        retryable: false,
      },
    };
  }

  // The real guard. A small file can declare an enormous canvas; multiplying it
  // out here is what stops a decompression bomb from exhausting memory.
  if (width * height > LIMITS.maxPixels) {
    const megapixels = Math.round((width * height) / 1_000_000);
    return {
      ok: false,
      error: {
        code: "DIMENSIONS_TOO_LARGE",
        message: `This image claims to be ${megapixels} megapixels.`,
        hint: "The local processor accepts up to 40 megapixels per image to limit memory use.",
        retryable: false,
      },
    };
  }

  return null;
}

/** Maps a thrown error from anywhere in the pipeline onto a user-facing one. */
export function toProcessingError(cause: unknown): ProcessingError {
  // Structured clone does not preserve custom properties on Error instances.
  // Normalize validator errors to plain records before crossing the worker
  // boundary, and do not confuse numeric DOMException.code with our contract.
  if (cause && typeof cause === "object" && "code" in cause && "message" in cause && "retryable" in cause &&
      typeof cause.code === "string" && typeof cause.message === "string" && typeof cause.retryable === "boolean") {
    const codes: ReadonlySet<string> = new Set<ProcessingError["code"]>([
      "EMPTY_FILE", "TOO_LARGE", "NOT_AN_IMAGE", "FORMAT_MISMATCH", "DECODE_UNSUPPORTED", "DECODE_FAILED",
      "DIMENSIONS_TOO_LARGE", "ENCODE_UNSUPPORTED", "ENCODE_FAILED", "OUT_OF_MEMORY", "CANCELLED", "UNKNOWN",
    ]);
    if (codes.has(cause.code)) {
      return {
        code: cause.code as ProcessingError["code"],
        message: cause.message,
        retryable: cause.retryable,
        ...("hint" in cause && typeof cause.hint === "string" ? { hint: cause.hint } : {}),
      };
    }
  }
  const text = cause instanceof Error ? cause.message : String(cause);

  if (text.includes("CANCELLED")) {
    return { code: "CANCELLED", message: "Cancelled.", retryable: true };
  }

  if (text.startsWith("ENCODE_UNSUPPORTED")) {
    const format = text.split(":")[1] ?? "this format";
    return {
      code: "ENCODE_UNSUPPORTED",
      message: `This browser cannot write ${format.toUpperCase()} files.`,
      hint: "Pick a different output format, or try Chrome or Edge.",
      retryable: false,
    };
  }

  if (text.startsWith("ENCODE_FAILED")) {
    return {
      code: "ENCODE_FAILED",
      message: "This image could not be exported with these settings.",
      hint: text.includes(":") ? text.slice(text.indexOf(":") + 1).trim() : "Try smaller dimensions or a different output format.",
      retryable: true,
    };
  }

  // Chrome and Firefox word allocation failures differently; both show up here
  // when a batch of very large images runs the tab out of memory.
  if (/out of memory|allocation|Array buffer allocation failed/i.test(text)) {
    return {
      code: "OUT_OF_MEMORY",
      message: "Ran out of memory while processing this image.",
      hint: "Process fewer images at once, or reduce the output dimensions.",
      retryable: true,
    };
  }

  if (/decode|createImageBitmap|The source image/i.test(text)) {
    return {
      code: "DECODE_FAILED",
      message: "This image could not be decoded.",
      hint: "The file may be truncated or corrupt.",
      retryable: false,
    };
  }

  return {
    code: "UNKNOWN",
    message: "Something went wrong processing this image.",
    hint: text.slice(0, 160),
    retryable: true,
  };
}
