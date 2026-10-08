/** Reject numerical failures and severe high-frequency noise before exporting AI pixels. */
export function validateNeuralPixels(data: Float32Array, width: number, height: number, source: Uint8ClampedArray, sourceWidth: number, sourceHeight: number, signed = false): void {
  const plane = width * height;
  if (data.length !== plane * 3) throw new Error("The AI model returned unexpected image dimensions.");
  for (const value of data) if (!Number.isFinite(value)) throw new Error("The AI model returned invalid pixels.");
  let predictedVariation = 0, sourceVariation = 0, samples = 0;
  const unit = (value: number) => signed ? (value + 1) / 2 : value;
  for (let y = 0; y < height - 1; y += 7) {
    for (let x = 0; x < width - 1; x += 7) {
      const sx = Math.min(sourceWidth - 2, Math.floor(x * sourceWidth / width));
      const sy = Math.min(sourceHeight - 2, Math.floor(y * sourceHeight / height));
      if (sx < 0 || sy < 0) continue;
      for (let channel = 0; channel < 3; channel++) {
        const at = channel * plane + y * width + x;
        predictedVariation += Math.abs(unit(data[at]!) - unit(data[at + 1]!)) + Math.abs(unit(data[at]!) - unit(data[at + width]!));
        const original = (sy * sourceWidth + sx) * 4 + channel;
        sourceVariation += (Math.abs(source[original]! - source[original + 4]!) + Math.abs(source[original]! - source[original + sourceWidth * 4]!)) / 255;
        samples += 2;
      }
    }
  }
  if (samples && predictedVariation / samples > sourceVariation / samples * 4 + 0.12) {
    throw new Error("AI produced excessive image noise. Using fast enhancement instead.");
  }
}
