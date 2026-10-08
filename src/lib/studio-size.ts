/** Bound canvas allocations while preserving aspect ratio, including panoramas. */
export function fitStudioSize(width: number, height: number, scale = 1, maxPixels = 24_000_000) {
  if (![width, height, scale, maxPixels].every(Number.isFinite) || width < 1 || height < 1 || scale <= 0 || maxPixels < 1) {
    throw new Error("The image dimensions are invalid.");
  }
  const ratio = Math.min(scale, 8192 / width, 8192 / height, Math.sqrt(maxPixels / (width * height)));
  return { width: Math.max(1, Math.floor(width * ratio)), height: Math.max(1, Math.floor(height * ratio)), scale: ratio };
}
