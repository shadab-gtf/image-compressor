import type { CodecSupport } from "@/codecs/capabilities";
import { buildExifSegment, injectExif, readExif, NO_EXIF } from "@/lib/exif";
import {
  MIME_BY_FORMAT,
  SUPPORTS_ALPHA,
  type ImageFormat,
  type OutputFormat,
} from "@/types/image";
import type { ImageInput, ProcessingResult } from "@/types/job";
import type { ProcessingOptions } from "@/types/options";
import { applyPngQuantisation, encodeCanvas, encodeToTargetSize, renderToCanvas } from "./encode";
import { paletteSizeForQuality } from "./quantize";
import { computeResizePlan, type ResizePlan } from "./resize";
import { validateDimensions, validateHeader } from "./validate";
import { HEADER_BYTES, readHeaderDimensions } from "./header";

/**
 * The processing core.
 *
 * Deliberately UI-free: it takes a Blob and options, returns bytes and facts.
 * No React, no store, no DOM document. That is what lets the same code run in a
 * worker today and in a CLI or desktop shell later without a rewrite.
 */

export type Abort = { aborted: boolean };

export type PipelineOutcome = {
  input: ImageInput;
  result: ProcessingResult;
};

/** Picks the output format, resolving the `keep` and `auto` choices. */
export function resolveOutputFormat(
  source: ImageFormat,
  options: ProcessingOptions,
  support: CodecSupport,
  hasAlpha: boolean,
): OutputFormat {
  const choice = options.output.format;

  // Browser canvas APIs do not expose lossless JPEG/WebP/AVIF encoders.
  // PNG preserves decoded pixels; quality=100 in a lossy codec does not.
  if (options.compression.mode === "lossless") return "png";

  if (choice !== "keep" && choice !== "auto") return choice;

  if (choice === "keep") {
    // GIF and BMP have no encoder here; keeping them is impossible, so fall
    // through to the auto rules rather than failing.
    if (source === "jpeg" || source === "png" || source === "webp" || source === "avif") {
      if (support.encode[source]) return source;
    }
  }

  // Auto: prefer the most efficient format this browser can actually write,
  // while respecting whether transparency has to survive.
  if (support.encode.avif) return "avif";
  if (support.encode.webp) return "webp";
  return hasAlpha ? "png" : "jpeg";
}

/**
 * Smart quality.
 *
 * Picks a starting point from the codec and the image's pixel count rather than
 * using one global default. Large photographs tolerate more compression than
 * small UI assets, where artefacts sit next to hard edges and are obvious.
 */
function smartQuality(format: OutputFormat, pixels: number): number {
  const megapixels = pixels / 1_000_000;
  const base = format === "avif" ? 58 : format === "webp" ? 76 : format === "jpeg" ? 80 : 85;
  if (megapixels > 12) return base - 6;
  if (megapixels > 4) return base - 3;
  if (megapixels < 0.25) return base + 6;
  return base;
}

export async function processImage(
  file: Blob,
  name: string,
  options: ProcessingOptions,
  support: CodecSupport,
  signal: Abort,
  onProgress?: (fraction: number) => void,
): Promise<PipelineOutcome> {
  const started = performance.now();
  const check = () => {
    if (signal.aborted) throw new Error("CANCELLED");
  };

  /* -- 1. Identify ------------------------------------------------------- */
  check();
  const head = new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer());
  const validation = validateHeader(name, file.size, head, support);
  if (!validation.ok) throw Object.assign(new Error(validation.error.code), validation.error);
  const { format, declaredFormat } = validation;
  const declaredDimensions = readHeaderDimensions(head, format);
  if (!declaredDimensions) {
    throw new Error("DECODE_FAILED: Image dimensions could not be verified safely from its header.");
  }
  const headerError = validateDimensions(declaredDimensions.width, declaredDimensions.height);
  if (headerError) throw Object.assign(new Error(headerError.error.code), headerError.error);
  onProgress?.(0.1);
  check();

  /* -- 2. Read metadata -------------------------------------------------- */
  // JPEG EXIF segments are bounded and available in the inspected header; never
  // retain a second full-file copy just to read a small metadata segment.
  let sourceBytes: Uint8Array<ArrayBuffer> | null = null;
  let exif = NO_EXIF;
  if (format === "jpeg") {
    sourceBytes = head;
    exif = readExif(sourceBytes);
  }
  check();

  /* -- 3. Decode --------------------------------------------------------- */
  // `from-image` makes the browser apply EXIF rotation during decode, so the
  // bitmap is already upright and every downstream dimension is the real one.
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (cause) {
    throw new Error(`DECODE_FAILED: ${String(cause)}`);
  }
  onProgress?.(0.35);

  try {
    const dimensionError = validateDimensions(bitmap.width, bitmap.height);
    if (dimensionError) {
      throw Object.assign(new Error(dimensionError.error.code), dimensionError.error);
    }
    check();

    /* -- 4. Plan ---------------------------------------------------------- */
    const source = { width: bitmap.width, height: bitmap.height };
    const plan: ResizePlan = computeResizePlan(source, options.resize);
    const outputError = validateDimensions(plan.target.width, plan.target.height);
    if (outputError) throw Object.assign(new Error(outputError.error.code), outputError.error);

    const sourceHasAlpha = SUPPORTS_ALPHA[format];
    const outputFormat = resolveOutputFormat(format, options, support, sourceHasAlpha);

    if (!support.encode[outputFormat]) {
      throw new Error(`ENCODE_UNSUPPORTED:${outputFormat}`);
    }

    // Alpha has to be flattened onto a matte when the destination cannot carry
    // it. The UI surfaces this as a warning so a transparent logo turning into a
    // white box is never a surprise.
    const flattenAlpha = sourceHasAlpha && !SUPPORTS_ALPHA[outputFormat];

    const render = { background: options.output.background, flattenAlpha };
    const pixels = plan.target.width * plan.target.height;
    const metadataSegment = outputFormat === "jpeg" && sourceBytes && exif.hasExif && options.output.metadata !== "removeAll"
      ? buildExifSegment(sourceBytes, options.output.metadata)
      : null;

    /* -- 5. Encode -------------------------------------------------------- */
    let blob: Blob;
    let quality: number | null = null;
    let width = plan.target.width;
    let height = plan.target.height;
    let target: ProcessingResult["target"];

    const { compression } = options;

    if (compression.mode === "targetSize" && compression.targetBytes) {
      const search = await encodeToTargetSize(
        bitmap,
        plan,
        outputFormat,
        Math.max(1, compression.targetBytes * (1 + compression.targetTolerance) - (metadataSegment?.length ?? 0)),
        render,
        {
          allowDownscale: compression.allowDownscaleForTarget,
          tolerance: 0,
          signal,
        },
      );
      blob = search.blob;
      quality = outputFormat === "png" ? null : search.quality;
      width = search.width;
      height = search.height;
      target = {
        requestedBytes: compression.targetBytes,
        reached: search.reached,
        attempts: search.attempts,
      };
    } else {
      const chosenQuality =
        compression.mode === "lossless"
          ? 100
          : compression.mode === "smart"
            ? smartQuality(outputFormat, pixels)
            : compression.quality;

      const canvas = renderToCanvas(bitmap, plan, render);
      if (outputFormat === "png") {
        // Lossless PNG keeps every colour; otherwise reduce the palette, which
        // is the only size lever PNG has.
        const colors =
          compression.mode === "lossless"
            ? 256
            : (compression.pngPaletteColors ?? paletteSizeForQuality(chosenQuality));
        applyPngQuantisation(canvas, colors);
      }
      try {
        blob = await encodeCanvas(canvas, outputFormat, chosenQuality);
      } finally {
        canvas.width = 1;
        canvas.height = 1;
      }
      quality = outputFormat === "png" ? null : chosenQuality;
    }
    onProgress?.(0.85);
    check();

    /* -- 6. Metadata ------------------------------------------------------ */
    // Canvas output has no metadata at all, so "remove all" needs no work. The
    // other policies graft a rewritten APP1 segment back on.
    if (metadataSegment) {
      const encoded = new Uint8Array(await blob.arrayBuffer());
      blob = new Blob([injectExif(encoded, metadataSegment)], {
        type: MIME_BY_FORMAT.jpeg,
      });
    }

    // Metadata is part of the downloaded file, so target reporting must use its
    // final byte length rather than the pre-metadata encoder result.
    if (target) {
      target.reached = blob.size <= target.requestedBytes * (1 + compression.targetTolerance);
    }
    check();

    onProgress?.(1);

    const input: ImageInput = {
      name,
      size: file.size,
      format,
      declaredFormat,
      dimensions: source,
      hasAlpha: sourceHasAlpha,
      metadata: exif.hasExif
        ? { hasExif: true, hasGps: exif.hasGps, orientation: exif.orientation }
        : undefined,
    };

    return {
      input,
      result: {
        output: {
          blob,
          size: blob.size,
          format: outputFormat,
          dimensions: { width, height },
          quality,
        },
        durationMs: Math.round(performance.now() - started),
        target,
        flattenedAlpha: flattenAlpha,
      },
    };
  } finally {
    // Always release the decoded surface. Skipping this is what makes a batch of
    // a few hundred images climb into gigabytes of retained GPU memory.
    bitmap.close();
  }
}
