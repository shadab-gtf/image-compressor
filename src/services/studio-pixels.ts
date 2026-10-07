import type { StudioSettings } from "../types/studio.ts";

const clamp = (value: number) => Math.max(0, Math.min(255, value));

/** Color correction + alpha-aware unsharp masking. No generated detail. */
export function enhancePixels(
  input: Uint8ClampedArray,
  width: number,
  height: number,
  settings: Pick<StudioSettings, "contrast" | "saturation" | "sharpness">,
): Uint8ClampedArray {
  const output = new Uint8ClampedArray(input.length);
  const contrast = 1 + settings.contrast / 100;
  const saturation = 1 + settings.saturation / 100;

  for (let i = 0; i < input.length; i += 4) {
    const r = input[i] ?? 0;
    const g = input[i + 1] ?? 0;
    const b = input[i + 2] ?? 0;
    const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
    output[i] = clamp(((luma + (r - luma) * saturation) - 128) * contrast + 128);
    output[i + 1] = clamp(((luma + (g - luma) * saturation) - 128) * contrast + 128);
    output[i + 2] = clamp(((luma + (b - luma) * saturation) - 128) * contrast + 128);
    output[i + 3] = input[i + 3] ?? 255;
  }

  if (settings.sharpness <= 0) return output;
  const sharpened = new Uint8ClampedArray(output);
  const strength = settings.sharpness / 100;
  // A separable [1,2,1] Gaussian kernel written as a 3x3 stencil. Weighting by
  // alpha prevents invisible colors from creating halos around cutout edges.
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;
      if (!output[index + 3]) continue;
      let weight = 0;
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const at = ((y + dy) * width + x + dx) * 4;
          const w = (dy === 0 ? 2 : 1) * (dx === 0 ? 2 : 1) * (output[at + 3] ?? 0) / 255;
          weight += w;
          red += (output[at] ?? 0) * w;
          green += (output[at + 1] ?? 0) * w;
          blue += (output[at + 2] ?? 0) * w;
        }
      }
      if (weight === 0) continue;
      sharpened[index] = clamp((output[index] ?? 0) + strength * ((output[index] ?? 0) - red / weight));
      sharpened[index + 1] = clamp((output[index + 1] ?? 0) + strength * ((output[index + 1] ?? 0) - green / weight));
      sharpened[index + 2] = clamp((output[index + 2] ?? 0) + strength * ((output[index + 2] ?? 0) - blue / weight));
    }
  }
  return sharpened;
}

/** Remove only edge-connected pixels close to the most common corner color. */
export function removeSolidBackground(
  input: Uint8ClampedArray,
  width: number,
  height: number,
  tolerance: number,
): Uint8ClampedArray {
  const output = new Uint8ClampedArray(input);
  const cornerIndices = [0, width - 1, (height - 1) * width, width * height - 1];
  const distance = (a: number, b: number) => {
    const dr = (input[a * 4] ?? 0) - (input[b * 4] ?? 0);
    const dg = (input[a * 4 + 1] ?? 0) - (input[b * 4 + 1] ?? 0);
    const db = (input[a * 4 + 2] ?? 0) - (input[b * 4 + 2] ?? 0);
    return Math.sqrt((dr * dr + dg * dg + db * db) / 3);
  };
  let reference = 0;
  let bestMatches = -1;
  for (const candidate of cornerIndices) {
    const matches = cornerIndices.filter((corner) => distance(candidate, corner) <= tolerance).length;
    if (matches > bestMatches) {
      reference = candidate;
      bestMatches = matches;
    }
  }

  const visited = new Uint8Array(width * height);
  const queue = new Uint32Array(width * height);
  let read = 0;
  let write = 0;
  const feather = Math.max(3, tolerance * 0.3);
  const enqueue = (pixel: number) => {
    if (visited[pixel]) return;
    visited[pixel] = 1;
    const d = distance(pixel, reference);
    if (d > tolerance + feather && (input[pixel * 4 + 3] ?? 0) > 0) return;
    queue[write++] = pixel;
    const retained = Math.max(0, Math.min(1, (d - tolerance) / feather));
    output[pixel * 4 + 3] = (input[pixel * 4 + 3] ?? 255) * retained;
  };
  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }
  while (read < write) {
    const pixel = queue[read++]!;
    const x = pixel % width;
    if (x > 0) enqueue(pixel - 1);
    if (x < width - 1) enqueue(pixel + 1);
    if (pixel >= width) enqueue(pixel - width);
    if (pixel + width < width * height) enqueue(pixel + width);
  }
  return output;
}
