import type { Dimensions } from "@/types/image";
import type { ResizeOptions } from "@/types/options";

/**
 * Pure resize geometry.
 *
 * Kept free of canvas and DOM calls so the sizing rules can be reasoned about —
 * and unit tested — on their own. Everything returns whole pixels, because a
 * fractional canvas size is silently floored by the browser and would make the
 * reported output dimensions a lie.
 */

export type ResizePlan = {
  /** Region of the source to read. Defaults to the whole image. */
  source: { x: number; y: number; width: number; height: number };
  /** Size of the destination canvas. */
  target: Dimensions;
  /** True when nothing needs to change and the decode can be reused as-is. */
  noop: boolean;
};

const clampEdge = (n: number) => Math.max(1, Math.round(n));

export function computeResizePlan(
  source: Dimensions,
  options: ResizeOptions,
): ResizePlan {
  const requested = [options.width, options.height, options.percentage, options.crop?.width, options.crop?.height];
  if (requested.some((value) => value !== undefined && (!Number.isFinite(value) || value <= 0)) ||
      (options.crop && (!Number.isFinite(options.crop.x) || !Number.isFinite(options.crop.y)))) {
    throw new Error("ENCODE_FAILED: Resize values must be finite, positive numbers.");
  }
  const full = { x: 0, y: 0, width: source.width, height: source.height };
  const ratio = source.width / source.height;

  const plan = (width: number, height: number, region = full): ResizePlan => {
    let w = clampEdge(width);
    let h = clampEdge(height);

    // "Do not upscale" is checked against the *source region*, so cropping then
    // resizing still cannot invent detail.
    if (options.preventUpscale && (w > region.width || h > region.height)) {
      const scale = Math.min(region.width / w, region.height / h, 1);
      w = clampEdge(w * scale);
      h = clampEdge(h * scale);
    }

    return {
      source: region,
      target: { width: w, height: h },
      noop:
        region.x === 0 &&
        region.y === 0 &&
        region.width === source.width &&
        region.height === source.height &&
        w === source.width &&
        h === source.height,
    };
  };

  switch (options.mode) {
    case "none":
      return plan(source.width, source.height);

    case "width": {
      const w = options.width ?? source.width;
      return plan(w, options.maintainAspectRatio ? w / ratio : source.height);
    }

    case "height": {
      const h = options.height ?? source.height;
      return plan(options.maintainAspectRatio ? h * ratio : source.width, h);
    }

    case "percentage": {
      const factor = (options.percentage ?? 100) / 100;
      return plan(source.width * factor, source.height * factor);
    }

    case "maxWidth": {
      const max = options.width ?? source.width;
      // A max constraint only ever shrinks — an image already under it is left
      // untouched rather than being stretched up to the limit.
      if (source.width <= max) return plan(source.width, source.height);
      return plan(max, max / ratio);
    }

    case "maxHeight": {
      const max = options.height ?? source.height;
      if (source.height <= max) return plan(source.width, source.height);
      return plan(max * ratio, max);
    }

    case "exact": {
      const w = options.width ?? source.width;
      const h = options.height ?? source.height;
      if (!options.maintainAspectRatio) return plan(w, h);
      // With the ratio locked, "exact" degrades to a contain fit so the result
      // is never distorted.
      const scale = Math.min(w / source.width, h / source.height);
      return plan(source.width * scale, source.height * scale);
    }

    case "fit": {
      // Contain: the whole image fits inside the box, box may be underfilled.
      const boxW = options.width ?? source.width;
      const boxH = options.height ?? source.height;
      const scale = Math.min(boxW / source.width, boxH / source.height);
      return plan(source.width * scale, source.height * scale);
    }

    case "fill": {
      // Cover: the box is filled completely and the overflow is centre-cropped.
      const boxW = options.width ?? source.width;
      const boxH = options.height ?? source.height;
      const scale = Math.max(boxW / source.width, boxH / source.height);
      const cropW = Math.min(source.width, boxW / scale);
      const cropH = Math.min(source.height, boxH / scale);
      const cropWidth = Math.max(1, Math.round(cropW));
      const cropHeight = Math.max(1, Math.round(cropH));
      const region = {
        x: Math.round((source.width - cropWidth) / 2),
        y: Math.round((source.height - cropHeight) / 2),
        width: cropWidth,
        height: cropHeight,
      };
      return plan(boxW, boxH, region);
    }

    case "crop": {
      const rect = options.crop;
      if (!rect) return plan(source.width, source.height);
      // Clamp into bounds: an out-of-range rect would draw transparent padding.
      const x = Math.max(0, Math.min(Math.round(rect.x), source.width - 1));
      const y = Math.max(0, Math.min(Math.round(rect.y), source.height - 1));
      const region = {
        x,
        y,
        width: Math.max(1, Math.min(Math.round(rect.width), source.width - x)),
        height: Math.max(1, Math.min(Math.round(rect.height), source.height - y)),
      };
      const w = options.width ?? region.width;
      const h = options.maintainAspectRatio
        ? (w * region.height) / region.width
        : (options.height ?? region.height);
      return plan(w, h, region);
    }

    default: {
      // Exhaustiveness guard: adding a mode without handling it fails to compile.
      const never: never = options.mode;
      throw new Error(`Unhandled resize mode: ${String(never)}`);
    }
  }
}

/**
 * Scales a plan down by a factor, used by the target-size search once quality
 * alone cannot reach the requested byte budget.
 */
export function scalePlan(plan: ResizePlan, factor: number): ResizePlan {
  return {
    source: plan.source,
    target: {
      width: clampEdge(plan.target.width * factor),
      height: clampEdge(plan.target.height * factor),
    },
    noop: false,
  };
}
