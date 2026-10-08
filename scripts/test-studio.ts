import assert from "node:assert/strict";
import { enhancePixels, removeSolidBackground } from "../src/services/studio-pixels.ts";
import { fitStudioSize } from "../src/lib/studio-size.ts";
import { formatOcrConfidence } from "../src/lib/ocr-confidence.ts";
import { validateNeuralPixels } from "../src/services/neural-quality.ts";

const flatSource = new Uint8ClampedArray(32 * 32 * 4).fill(128);
const flatPrediction = new Float32Array(32 * 32 * 3).fill(0.5);
validateNeuralPixels(flatPrediction, 32, 32, flatSource, 32, 32);
const corruptedPrediction = Float32Array.from(flatPrediction, (_, at) => at % 2);
assert.throws(() => validateNeuralPixels(corruptedPrediction, 32, 32, flatSource, 32, 32), /noise/);
flatPrediction[0] = Number.NaN;
assert.throws(() => validateNeuralPixels(flatPrediction, 32, 32, flatSource, 32, 32), /invalid/);

assert.equal(formatOcrConfidence(0.9999), "99.9%");
assert.equal(formatOcrConfidence(1), "100%");
assert.equal(formatOcrConfidence(0), "0%");
assert.equal(formatOcrConfidence(Number.NaN), "Unavailable");
assert.equal(formatOcrConfidence(1.1), "Unavailable");

assert.deepEqual(fitStudioSize(900, 600, 1, 6_000_000), { width: 900, height: 600, scale: 1 });
for (const [width, height] of [[6000, 4000], [30000, 100], [100, 30000], [50000, 50000]]) {
  for (const budget of [6_000_000, 24_000_000]) {
    const fitted = fitStudioSize(width!, height!, 4, budget);
    assert.ok(fitted.width * fitted.height <= budget);
    assert.ok(fitted.width <= 8192 && fitted.height <= 8192);
    assert.ok(Math.abs(fitted.width / width! - fitted.height / height!) <= 1 / Math.min(width!, height!));
  }
}
assert.throws(() => fitStudioSize(Number.NaN, 100));

const width = 9;
const height = 9;
const original = new Uint8ClampedArray(width * height * 4).fill(255);
// An enclosed white center must survive while the edge-connected white goes.
for (let y = 2; y <= 6; y += 1) {
  for (let x = 2; x <= 6; x += 1) {
    if (x !== 2 && x !== 6 && y !== 2 && y !== 6) continue;
    const at = (y * width + x) * 4;
    original[at] = 210;
    original[at + 1] = 30;
    original[at + 2] = 30;
  }
}
const removed = removeSolidBackground(original, width, height, 20);
assert.equal(removed[3], 0, "edge-connected white background becomes transparent");
assert.equal(removed[(4 * width + 4) * 4 + 3], 255, "enclosed matching colors remain opaque");
assert.equal(removed[(2 * width + 2) * 4 + 3], 255, "foreground remains opaque");
assert.equal(original[3], 255, "processing never mutates original pixels");

const transparent = new Uint8ClampedArray([200, 50, 30, 0, 60, 100, 180, 128, 200, 150, 100, 255]);
const neutral = enhancePixels(transparent, 3, 1, { contrast: 0, saturation: 0, sharpness: 0 });
assert.deepEqual(neutral, transparent, "neutral enhancement preserves pixels exactly");
const enhanced = enhancePixels(transparent, 3, 1, { contrast: 10, saturation: 10, sharpness: 30 });
assert.equal(enhanced[3], 0);
assert.equal(enhanced[7], 128);
assert.equal(enhanced[11], 255);
assert.notDeepEqual(enhanced, transparent, "enhancement produces a real pixel change");
const monochrome = enhancePixels(transparent, 3, 1, { contrast: 0, saturation: -100, sharpness: 0 });
assert.equal(monochrome[4], monochrome[5]);
assert.equal(monochrome[5], monochrome[6]);
console.log("PASS: connected-background removal, protected interior, immutability, neutral enhancement, alpha preservation, color correction.");
