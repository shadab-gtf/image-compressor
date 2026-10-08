import type {
  DrawingAction,
  DrawingDocument,
  DrawingHistory,
  DrawingObject,
  DrawingSymbol,
  DrawPoint,
} from "../types/drawing.ts";

export const DRAWING_STORAGE_KEY = "shrinkfox-drawing-v1";
export const newDrawing = (): DrawingDocument => ({
  version: 1,
  name: "Untitled drawing",
  width: 1200,
  height: 800,
  background: "#ffffff",
  objects: [],
});
export function drawingHistory(
  state: DrawingHistory,
  action: DrawingAction,
): DrawingHistory {
  if (action.type === "commit")
    return {
      past: [...state.past.slice(-29), state.present],
      present: action.document,
      future: [],
    };
  if (action.type === "undo" && state.past.length)
    return {
      past: state.past.slice(0, -1),
      present: state.past[state.past.length - 1]!,
      future: [state.present, ...state.future],
    };
  if (action.type === "redo" && state.future.length)
    return {
      past: [...state.past, state.present],
      present: state.future[0]!,
      future: state.future.slice(1),
    };
  return state;
}
export function pointBounds(strokes: DrawPoint[][]) {
  const points = strokes.flat();
  if (!points.length) return { x: 0, y: 0, width: 1, height: 1 };
  let x = Infinity,
    y = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const point of points) {
    x = Math.min(x, point.x);
    y = Math.min(y, point.y);
    right = Math.max(right, point.x);
    bottom = Math.max(bottom, point.y);
  }
  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  };
}
export function pathObject(
  strokes: DrawPoint[][],
  color: string,
  strokeWidth: number,
  label = "Sketch",
): DrawingObject {
  const bounds = pointBounds(strokes);
  return {
    id: crypto.randomUUID(),
    kind: "path",
    label,
    ...bounds,
    rotation: 0,
    color,
    fill: "none",
    strokeWidth,
    text: "",
    fontSize: 32,
    bold: false,
    strokes: strokes.map((stroke) =>
      stroke.map((point) => ({
        x: ((point.x - bounds.x) / bounds.width) * 100,
        y: ((point.y - bounds.y) / bounds.height) * 100,
      })),
    ),
  };
}
export function objectStrokes(object: DrawingObject): DrawPoint[][] {
  return object.strokes.map((stroke) =>
    stroke.map((point) => ({
      x: object.x + (point.x / 100) * object.width,
      y: object.y + (point.y / 100) * object.height,
    })),
  );
}
export function polyline(points: DrawPoint[]): string {
  return points
    .map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(" ");
}
export function textBox(object: Pick<DrawingObject, "text" | "fontSize">) {
  const lines = object.text.split("\n");
  return {
    width:
      Math.max(...lines.map((line) => line.length), 1) * object.fontSize * 0.65,
    height: lines.length * object.fontSize * 1.25,
  };
}
const escapeXml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[character]!,
  );
export function drawingSvg(document: DrawingDocument): string {
  const objects = document.objects
    .map((object) => {
      const transform = `translate(${object.x} ${object.y}) rotate(${object.rotation} ${object.width / 2} ${object.height / 2})`;
      if (object.kind === "text") {
        const box = textBox(object);
        return `<g transform="${transform}"><text transform="scale(${object.width / box.width} ${object.height / box.height})" fill="${object.color}" font-family="Arial,sans-serif" font-size="${object.fontSize}" font-weight="${object.bold ? 700 : 400}">${object.text
          .split("\n")
          .map(
            (line, i) =>
              `<tspan x="0" y="${object.fontSize * (1 + i * 1.25)}">${escapeXml(line)}</tspan>`,
          )
          .join("")}</text></g>`;
      }
      return `<g transform="${transform}" stroke="${object.color}" fill="${object.fill}" stroke-width="${object.strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${object.strokes.map((stroke) => `<polyline points="${polyline(stroke.map((point) => ({ x: (point.x / 100) * object.width, y: (point.y / 100) * object.height })))}"/>`).join("")}</g>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${document.width}" height="${document.height}" viewBox="0 0 ${document.width} ${document.height}">${document.background === "none" ? "" : `<rect width="100%" height="100%" fill="${document.background}"/>`}${objects}</svg>`;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const finite = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max;
const color = (value: unknown, none = false): value is string =>
  typeof value === "string" &&
  ((none && value === "none") || /^#[a-f\d]{6}$/i.test(value));
/** Validate imported/local projects before rendering or serializing any content. */
export function parseDrawing(value: unknown): DrawingDocument {
  const fail = () => {
    throw new Error("This is not a valid ShrinkFox drawing project.");
  };
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.name !== "string" ||
    value.name.length > 100 ||
    !finite(value.width, 100, 4096) ||
    !finite(value.height, 100, 4096) ||
    value.width * value.height > 12_000_000 ||
    !color(value.background, true) ||
    !Array.isArray(value.objects) ||
    value.objects.length > 500
  )
    return fail();
  const ids = new Set<string>();
  let pointCount = 0;
  const objects: DrawingObject[] = value.objects.map((item: unknown) => {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      item.id.length > 100 ||
      ids.has(item.id) ||
      !["path", "text"].includes(String(item.kind)) ||
      typeof item.label !== "string" ||
      item.label.length > 100 ||
      !finite(item.x, -50000, 50000) ||
      !finite(item.y, -50000, 50000) ||
      !finite(item.width, 1, 10000) ||
      !finite(item.height, 1, 10000) ||
      !finite(item.rotation, -360, 360) ||
      !finite(item.strokeWidth, 1, 40) ||
      !finite(item.fontSize, 8, 200) ||
      typeof item.bold !== "boolean" ||
      typeof item.text !== "string" ||
      item.text.length > 2000 ||
      !color(item.color) ||
      !color(item.fill, true) ||
      !Array.isArray(item.strokes) ||
      item.strokes.length > 500
    )
      return fail();
    const strokes: DrawPoint[][] = item.strokes.map((stroke: unknown) => {
      if (!Array.isArray(stroke) || stroke.length > 10000) return fail();
      pointCount += stroke.length;
      if (pointCount > 50000) return fail();
      return stroke.map((point: unknown) => {
        if (
          !isRecord(point) ||
          !finite(point.x, -10000, 10000) ||
          !finite(point.y, -10000, 10000)
        )
          return fail();
        return { x: point.x, y: point.y };
      });
    });
    ids.add(item.id);
    return {
      id: item.id,
      kind: item.kind as "path" | "text",
      label: item.label,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      rotation: item.rotation,
      color: item.color,
      fill: item.fill,
      strokeWidth: item.strokeWidth,
      fontSize: item.fontSize,
      text: item.text,
      bold: item.bold,
      strokes,
    };
  });
  return {
    version: 1,
    name: value.name,
    width: value.width,
    height: value.height,
    background: value.background,
    objects,
  };
}

function sample(strokes: DrawPoint[][]): DrawPoint[] {
  const bounds = pointBounds(strokes),
    longest = Math.max(bounds.width, bounds.height);
  const points: DrawPoint[] = [];
  for (const stroke of strokes) {
    for (let i = 0; i < stroke.length; i++) {
      const a = stroke[i]!,
        b = stroke[i + 1] ?? a;
      const steps = Math.max(
        1,
        Math.ceil((Math.hypot(b.x - a.x, b.y - a.y) / longest) * 32),
      );
      for (let step = 0; step < steps; step++)
        points.push({
          x:
            (a.x + ((b.x - a.x) * step) / steps - bounds.x - bounds.width / 2) /
            longest,
          y:
            (a.y +
              ((b.y - a.y) * step) / steps -
              bounds.y -
              bounds.height / 2) /
            longest,
        });
    }
  }
  return points.filter(
    (_, index) => index % Math.max(1, Math.ceil(points.length / 160)) === 0,
  );
}
function distance(from: DrawPoint[], to: DrawPoint[]): number {
  let total = 0;
  for (const point of from) {
    let nearest = Infinity;
    for (const other of to) {
      const dx = point.x - other.x, dy = point.y - other.y;
      nearest = Math.min(nearest, dx * dx + dy * dy);
    }
    total += Math.sqrt(nearest);
  }
  return total / Math.max(1, from.length);
}
/** Translation/scale invariant, stroke-order-independent geometric matching; no remote inference. */
export function rankDrawingSymbols(
  strokes: DrawPoint[][],
  symbols: readonly DrawingSymbol[],
): DrawingSymbol[] {
  const input = sample(strokes);
  if (input.length < 3) return [];
  return symbols
    .map((symbol) => {
      const reference = sample(symbol.strokes);
      return {
        symbol,
        score: distance(input, reference) + distance(reference, input),
      };
    })
    .sort((a, b) => a.score - b.score)
    .slice(0, 8)
    .map((item) => item.symbol);
}
