export type Point = readonly [number, number];
export interface Face {
  box: readonly [number, number, number, number];
  points: Point[];
  score: number;
}
export const FACE_TEMPLATE: readonly Point[] = [
  [192.98138, 239.94708],
  [318.90277, 240.1936],
  [256.63416, 314.01935],
  [201.26117, 371.41043],
  [313.08905, 371.15118],
];

/** Least-squares similarity transform: source landmarks to the FFHQ template. */
export function alignFace(
  points: readonly Point[],
): [number, number, number, number, number, number] {
  if (
    points.length !== 5 ||
    points.some((point) => point.some((value) => !Number.isFinite(value)))
  )
    throw new Error("Invalid face landmarks.");
  const center = (values: readonly Point[]) =>
    values.reduce(
      (sum, point) => [sum[0]! + point[0] / 5, sum[1]! + point[1] / 5],
      [0, 0],
    );
  const source = center(points),
    target = center(FACE_TEMPLATE);
  let dot = 0,
    cross = 0,
    norm = 0;
  for (let i = 0; i < 5; i++) {
    const x = points[i]![0] - source[0]!,
      y = points[i]![1] - source[1]!;
    const u = FACE_TEMPLATE[i]![0] - target[0]!,
      v = FACE_TEMPLATE[i]![1] - target[1]!;
    dot += x * u + y * v;
    cross += x * v - y * u;
    norm += x * x + y * y;
  }
  if (norm < 1e-6)
    throw new Error(
      "Face landmarks are too close together. Try a larger face crop.",
    );
  const a = dot / norm,
    b = cross / norm;
  return [
    a,
    b,
    -b,
    a,
    target[0]! - a * source[0]! + b * source[1]!,
    target[1]! - b * source[0]! - a * source[1]!,
  ];
}

export function suppressFaces(faces: Face[], threshold = 0.3): Face[] {
  const chosen: Face[] = [];
  for (const face of [...faces].sort((a, b) => b.score - a.score)) {
    if (
      chosen.some((other) => {
        const [x, y, w, h] = face.box,
          [ox, oy, ow, oh] = other.box;
        const intersection =
          Math.max(0, Math.min(x + w, ox + ow) - Math.max(x, ox)) *
          Math.max(0, Math.min(y + h, oy + oh) - Math.max(y, oy));
        return (
          intersection / Math.max(1, w * h + ow * oh - intersection) > threshold
        );
      })
    )
      continue;
    chosen.push(face);
  }
  return chosen;
}
