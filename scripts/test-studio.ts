import assert from "node:assert/strict";
import { enhancePixels, removeSolidBackground } from "../src/services/studio-pixels.ts";

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
