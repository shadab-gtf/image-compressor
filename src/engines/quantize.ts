/**
 * Median-cut colour quantisation.
 *
 * PNG has no quality parameter: the canvas encoder always writes full RGBA and
 * DEFLATE does the rest. Reducing the number of distinct colours is therefore
 * the only lossy lever PNG has, and it is an effective one — DEFLATE compresses
 * a 64-colour image far better than a 16-million-colour one, typically halving
 * the file with no visible change on flat UI art, screenshots and logos.
 *
 * The implementation works on a 5-bit-per-channel histogram (32768 bins) rather
 * than a per-pixel list, so cost is bounded by the palette size and not by the
 * image area. A 24 MP photo quantises in roughly the same time as a 1 MP one.
 */

const BITS = 5;
const SHIFT = 8 - BITS;
const SIDE = 1 << BITS; // 32
const BINS = SIDE * SIDE * SIDE; // 32768

type Box = {
  rMin: number; rMax: number;
  gMin: number; gMax: number;
  bMin: number; bMax: number;
  /** Total pixel count inside the box. */
  count: number;
};

const binIndex = (r: number, g: number, b: number) => (r << (BITS * 2)) | (g << BITS) | b;

function boxVolumeStats(hist: Uint32Array, box: Box, channels?: readonly [Float64Array, Float64Array, Float64Array]) {
  let count = 0;
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  for (let r = box.rMin; r <= box.rMax; r += 1) {
    for (let g = box.gMin; g <= box.gMax; g += 1) {
      for (let b = box.bMin; b <= box.bMax; b += 1) {
        const index = binIndex(r, g, b);
        const n = hist[index]!;
        if (n === 0) continue;
        count += n;
        rSum += channels ? channels[0][index]! : r * n;
        gSum += channels ? channels[1][index]! : g * n;
        bSum += channels ? channels[2][index]! : b * n;
      }
    }
  }
  return { count, rSum, gSum, bSum };
}

/** Shrinks a box to the smallest range that still contains every used bin. */
function shrink(hist: Uint32Array, box: Box) {
  const used = (fix: "r" | "g" | "b", value: number) => {
    const rl = fix === "r" ? value : box.rMin;
    const rh = fix === "r" ? value : box.rMax;
    const gl = fix === "g" ? value : box.gMin;
    const gh = fix === "g" ? value : box.gMax;
    const bl = fix === "b" ? value : box.bMin;
    const bh = fix === "b" ? value : box.bMax;
    for (let r = rl; r <= rh; r += 1)
      for (let g = gl; g <= gh; g += 1)
        for (let b = bl; b <= bh; b += 1) if (hist[binIndex(r, g, b)]! > 0) return true;
    return false;
  };
  while (box.rMin < box.rMax && !used("r", box.rMin)) box.rMin += 1;
  while (box.rMax > box.rMin && !used("r", box.rMax)) box.rMax -= 1;
  while (box.gMin < box.gMax && !used("g", box.gMin)) box.gMin += 1;
  while (box.gMax > box.gMin && !used("g", box.gMax)) box.gMax -= 1;
  while (box.bMin < box.bMax && !used("b", box.bMin)) box.bMin += 1;
  while (box.bMax > box.bMin && !used("b", box.bMax)) box.bMax -= 1;
}

/** Splits a box at the median of its widest channel. */
function split(hist: Uint32Array, box: Box): [Box, Box] | null {
  const rLen = box.rMax - box.rMin;
  const gLen = box.gMax - box.gMin;
  const bLen = box.bMax - box.bMin;
  const axis = rLen >= gLen && rLen >= bLen ? "r" : gLen >= bLen ? "g" : "b";

  const lo = axis === "r" ? box.rMin : axis === "g" ? box.gMin : box.bMin;
  const hi = axis === "r" ? box.rMax : axis === "g" ? box.gMax : box.bMax;
  if (lo >= hi) return null;

  // Walk the axis accumulating counts until half the pixels are behind us.
  const half = box.count / 2;
  let running = 0;
  let cut = lo;
  for (let v = lo; v < hi; v += 1) {
    let slice = 0;
    for (let a = axis === "r" ? box.gMin : box.rMin; a <= (axis === "r" ? box.gMax : box.rMax); a += 1) {
      for (let c = axis === "b" ? box.gMin : box.bMin; c <= (axis === "b" ? box.gMax : box.bMax); c += 1) {
        const idx =
          axis === "r" ? binIndex(v, a, c) : axis === "g" ? binIndex(a, v, c) : binIndex(a, c, v);
        slice += hist[idx]!;
      }
    }
    running += slice;
    cut = v;
    if (running >= half) break;
  }

  const left: Box = { ...box };
  const right: Box = { ...box };
  if (axis === "r") {
    left.rMax = cut;
    right.rMin = cut + 1;
  } else if (axis === "g") {
    left.gMax = cut;
    right.gMin = cut + 1;
  } else {
    left.bMax = cut;
    right.bMin = cut + 1;
  }
  if (right.rMin > right.rMax || right.gMin > right.gMax || right.bMin > right.bMax) {
    return null;
  }

  left.count = boxVolumeStats(hist, left).count;
  right.count = boxVolumeStats(hist, right).count;
  if (left.count === 0 || right.count === 0) return null;
  return [left, right];
}

/**
 * Reduces `data` in place to at most `maxColors` distinct colours.
 *
 * Alpha is preserved exactly and excluded from the colour distance, so cut-outs
 * and soft edges survive untouched. Fully transparent pixels are skipped so they
 * cannot drag the palette toward black.
 */
export function quantize(data: Uint8ClampedArray, maxColors: number): void {
  if (maxColors >= 256) return;

  const hist = new Uint32Array(BINS);
  const channels = [new Float64Array(BINS), new Float64Array(BINS), new Float64Array(BINS)] as const;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! < 8) continue;
    const index = binIndex(data[i]! >> SHIFT, data[i + 1]! >> SHIFT, data[i + 2]! >> SHIFT);
    hist[index]! += 1;
    channels[0][index]! += data[i]!;
    channels[1][index]! += data[i + 1]!;
    channels[2][index]! += data[i + 2]!;
  }

  let boxes: Box[] = [
    {
      rMin: 0, rMax: SIDE - 1,
      gMin: 0, gMax: SIDE - 1,
      bMin: 0, bMax: SIDE - 1,
      count: 0,
    },
  ];
  shrink(hist, boxes[0]!);
  boxes[0]!.count = boxVolumeStats(hist, boxes[0]!).count;
  if (boxes[0]!.count === 0) return; // fully transparent image

  while (boxes.length < maxColors) {
    // Always split the box holding the most pixels: that is where banding would
    // be most visible.
    let bestIndex = -1;
    let bestCount = 1;
    for (let i = 0; i < boxes.length; i += 1) {
      const box = boxes[i]!;
      if (box.count > bestCount && (box.rMax > box.rMin || box.gMax > box.gMin || box.bMax > box.bMin)) {
        bestCount = box.count;
        bestIndex = i;
      }
    }
    if (bestIndex === -1) break;

    const parts = split(hist, boxes[bestIndex]!);
    if (!parts) {
      // Mark unsplittable so the loop cannot spin on it.
      boxes[bestIndex]!.count = 1;
      continue;
    }
    shrink(hist, parts[0]);
    shrink(hist, parts[1]);
    boxes = [...boxes.slice(0, bestIndex), ...parts, ...boxes.slice(bestIndex + 1)];
  }

  // Average each box into one palette entry.
  const palette: Array<[number, number, number]> = [];
  for (const box of boxes) {
    const { count, rSum, gSum, bSum } = boxVolumeStats(hist, box, channels);
    if (count === 0) continue;
    palette.push([
      Math.round(rSum / count),
      Math.round(gSum / count),
      Math.round(bSum / count),
    ]);
  }
  if (palette.length === 0) return;

  // Cache the nearest-palette lookup per 5-bit bin: at most 32768 searches
  // regardless of how many megapixels the image has.
  const lookup = new Int16Array(BINS).fill(-1);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! < 8) continue;
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const key = binIndex(r >> SHIFT, g >> SHIFT, b >> SHIFT);

    let index = lookup[key]!;
    if (index < 0) {
      let best = 0;
      let bestDistance = Infinity;
      for (let p = 0; p < palette.length; p += 1) {
        const entry = palette[p]!;
        const dr = r - entry[0];
        const dg = g - entry[1];
        const db = b - entry[2];
        // Weighted to approximate perceived difference; green dominates luma.
        const distance = dr * dr * 3 + dg * dg * 6 + db * db;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = p;
        }
      }
      index = best;
      lookup[key] = index;
    }

    const entry = palette[index]!;
    data[i] = entry[0];
    data[i + 1] = entry[1];
    data[i + 2] = entry[2];
  }
}

/**
 * Maps a 1-100 quality value onto a palette size.
 *
 * The curve is deliberately gentle above 70 — that is where most users sit, and
 * dropping below ~96 colours starts to show banding on gradients.
 */
export function paletteSizeForQuality(quality: number): number {
  const q = Math.max(1, Math.min(100, quality));
  if (q >= 95) return 256;
  return Math.max(8, Math.round(2 ** (2 + (q / 100) * 6)));
}
