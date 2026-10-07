import type { OutputFormat } from "@/types/image";
import { MIME_BY_FORMAT, SUPPORTS_QUALITY } from "@/types/image";
import { paletteSizeForQuality, quantize } from "./quantize";
import type { ResizePlan } from "./resize";

/**
 * Rasterisation and encoding.
 *
 * Everything here runs inside a worker on an OffscreenCanvas; nothing touches
 * the document. Canvases are created per call and dropped immediately so a long
 * batch cannot accumulate GPU-backed surfaces.
 */

export type RenderOptions = {
  /** Matte applied when the target format has no alpha channel. */
  background: string;
  flattenAlpha: boolean;
};

/**
 * Draws the source into a canvas at the planned size.
 *
 * Large reductions are done in halving steps rather than one jump. A browser's
 * single-pass `drawImage` samples far too sparsely when shrinking by more than
 * ~2x, which is what makes naive canvas resizing look aliased and "crunchy"
 * next to a real image library. Halving repeatedly keeps every source pixel
 * contributing, and costs only a few extra milliseconds.
 */
export function renderToCanvas(
  bitmap: ImageBitmap,
  plan: ResizePlan,
  options: RenderOptions,
): OffscreenCanvas {
  const { source, target } = plan;

  let currentWidth = source.width;
  let currentHeight = source.height;
  let current: ImageBitmap | OffscreenCanvas = bitmap;
  let sx = source.x;
  let sy = source.y;

  // Step down by halves while we are still more than 2x away from the target.
  while (currentWidth / 2 >= target.width && currentHeight / 2 >= target.height) {
    const nextWidth = Math.max(target.width, Math.floor(currentWidth / 2));
    const nextHeight = Math.max(target.height, Math.floor(currentHeight / 2));
    const step = new OffscreenCanvas(nextWidth, nextHeight);
    const stepCtx = step.getContext("2d");
    if (!stepCtx) break;
    stepCtx.imageSmoothingEnabled = true;
    stepCtx.imageSmoothingQuality = "high";
    stepCtx.drawImage(
      current as CanvasImageSource,
      sx,
      sy,
      currentWidth,
      currentHeight,
      0,
      0,
      nextWidth,
      nextHeight,
    );
    if (current instanceof OffscreenCanvas) {
      current.width = 1;
      current.height = 1;
    }
    // After the first step we are reading a canvas that already holds only the
    // cropped region, so the source offset no longer applies.
    sx = 0;
    sy = 0;
    currentWidth = nextWidth;
    currentHeight = nextHeight;
    current = step;
    if (nextWidth === target.width && nextHeight === target.height) break;
  }

  const canvas = new OffscreenCanvas(target.width, target.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("ENCODE_FAILED: 2D context unavailable");

  if (options.flattenAlpha) {
    // Paint the matte first; drawing over it composites the alpha correctly
    // instead of leaving the black that an un-cleared canvas would show.
    ctx.fillStyle = options.background;
    ctx.fillRect(0, 0, target.width, target.height);
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    current as CanvasImageSource,
    sx,
    sy,
    currentWidth,
    currentHeight,
    0,
    0,
    target.width,
    target.height,
  );
  if (current instanceof OffscreenCanvas) {
    current.width = 1;
    current.height = 1;
  }

  return canvas;
}

/** Applies PNG palette reduction in place. No-op for other formats. */
export function applyPngQuantisation(canvas: OffscreenCanvas, colors: number): void {
  if (colors >= 256) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  quantize(image.data, colors);
  ctx.putImageData(image, 0, 0);
}

export async function encodeCanvas(
  canvas: OffscreenCanvas,
  format: OutputFormat,
  quality: number,
  encoder: "browser" | "wasm" = "browser",
): Promise<Blob> {
  if (encoder === "wasm" && (format === "jpeg" || format === "webp")) {
    const { encodeWasm } = await import("@/codecs/wasm-encode");
    return encodeWasm(canvas, format, Math.max(1, Math.min(100, quality)));
  }
  const type = MIME_BY_FORMAT[format];
  const blob = await canvas.convertToBlob(
    SUPPORTS_QUALITY[format]
      ? { type, quality: Math.max(0.01, Math.min(1, quality / 100)) }
      : { type },
  );
  // A browser that cannot write the requested type silently returns PNG. Left
  // unchecked this would hand the user a .avif file containing PNG bytes.
  if (blob.type !== type) {
    throw new Error(`ENCODE_UNSUPPORTED:${format}`);
  }
  return blob;
}

export type TargetSearchResult = {
  blob: Blob;
  quality: number;
  /** Dimensions actually used, which may be below the plan if downscaling ran. */
  width: number;
  height: number;
  attempts: number;
  reached: boolean;
};

/**
 * Finds the highest-quality encode that fits inside `targetBytes`.
 *
 * Strategy, in order:
 *   1. Binary search the quality axis. Size is monotonic in quality for every
 *      codec here, which is what makes a bisection valid.
 *   2. If the floor quality is still too big and downscaling is permitted,
 *      shrink the canvas and search again.
 *
 * The caller is told plainly whether the target was met. The function never
 * returns a "success" it did not achieve — overshooting the target silently is
 * the single most common dishonesty in online compressors.
 */
export async function encodeToTargetSize(
  bitmap: ImageBitmap,
  plan: ResizePlan,
  format: OutputFormat,
  targetBytes: number,
  render: RenderOptions,
  options: {
    allowDownscale: boolean;
    tolerance: number;
    minQuality?: number;
    maxQuality?: number;
    signal?: { aborted: boolean };
    encoder?: "browser" | "wasm";
  },
): Promise<TargetSearchResult> {
  if (!Number.isFinite(targetBytes) || targetBytes < 1 || !Number.isFinite(options.tolerance) || options.tolerance < 0 || options.tolerance > 1) {
    throw new Error("ENCODE_FAILED: Choose a positive target size and a tolerance between 0 and 1.");
  }
  const ceiling = targetBytes * (1 + options.tolerance);
  const minQuality = options.minQuality ?? 25;
  const maxQuality = options.maxQuality ?? 96;
  let attempts = 0;

  type Attempt = { blob: Blob; quality: number; width: number; height: number };

  let currentPlan = plan;
  let best: Attempt | null = null;
  // Tracks the smallest result seen overall, so an unreachable target still
  // returns the closest thing rather than nothing.
  //
  // Held in a container rather than a bare `let`: TypeScript does not track
  // assignments made inside the `attempt` closure below, and would narrow a
  // plain local to `null` for the rest of the function.
  const seen: { smallest: Attempt | null } = { smallest: null };

  const attempt = async (quality: number) => {
    if (options.signal?.aborted) throw new Error("CANCELLED");
    attempts += 1;
    const canvas = renderToCanvas(bitmap, currentPlan, render);
    if (format === "png") {
      applyPngQuantisation(canvas, paletteSizeForQuality(quality));
    }
    let blob: Blob;
    try {
      blob = await encodeCanvas(canvas, format, quality, options.encoder);
    } finally {
      canvas.width = 1;
      canvas.height = 1;
    }
    const record = {
      blob,
      quality,
      width: currentPlan.target.width,
      height: currentPlan.target.height,
    };
    if (!seen.smallest || blob.size < seen.smallest.blob.size) seen.smallest = record;
    return record;
  };

  // Up to 4 scale passes: 100%, 80%, 64%, 51% of the requested dimensions.
  for (let pass = 0; pass < 4; pass += 1) {
    let low = minQuality;
    let high = maxQuality;

    // Probe the ceiling first: if top quality already fits, no search is needed.
    const top = await attempt(high);
    if (top.blob.size <= ceiling) {
      return {
        ...top,
        attempts,
        reached: true,
      };
    }

    // 6 bisections narrow 25-96 to within ~1 quality point.
    for (let i = 0; i < 6 && low <= high; i += 1) {
      const mid = Math.round((low + high) / 2);
      const result = await attempt(mid);
      if (result.blob.size <= ceiling) {
        if (!best || result.quality > best.quality) best = result;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    // Integer bisection can finish one step above its lower bound. Always
    // evaluate the floor before sacrificing resolution for an unreachable size.
    if (!best) {
      const floor = await attempt(minQuality);
      if (floor.blob.size <= ceiling) best = floor;
    }

    if (best) {
      return { ...best, attempts, reached: true };
    }
    if (!options.allowDownscale) break;

    // Quality alone cannot get there. Shrink and try again.
    const factor = 0.8;
    const next = {
      source: currentPlan.source,
      target: {
        width: Math.max(1, Math.round(currentPlan.target.width * factor)),
        height: Math.max(1, Math.round(currentPlan.target.height * factor)),
      },
      noop: false,
    };
    // Below 32px on an edge the result stops being a usable image; stop rather
    // than chase the number.
    if (next.target.width < 32 || next.target.height < 32) break;
    currentPlan = next;
  }

  if (!seen.smallest) throw new Error("ENCODE_FAILED");
  return { ...seen.smallest, attempts, reached: false };
}
