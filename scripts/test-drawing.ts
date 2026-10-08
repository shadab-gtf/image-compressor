import assert from "node:assert/strict";
import { getDrawingSymbols } from "../src/lib/api/drawing.ts";
import {
  drawingHistory,
  drawingSvg,
  newDrawing,
  parseDrawing,
  pathObject,
  rankDrawingSymbols,
} from "../src/engines/drawing.ts";

const symbols = getDrawingSymbols();
assert.ok(symbols.length >= 40);
for (const id of [
  "house",
  "circle",
  "heart",
  "star",
  "bicycle",
  "cat",
  "cloud",
]) {
  const symbol = symbols.find((item) => item.id === id)!;
  const rough = [...symbol.strokes]
    .reverse()
    .map((stroke) =>
      stroke.map((point, index) => ({
        x: 240 + point.x * 2.2 + Math.sin(index) * 1.2,
        y: 180 + point.y * 2.2 + Math.cos(index) * 1.2,
      })),
    );
  assert.equal(
    rankDrawingSymbols(rough, symbols)[0]?.id,
    id,
    `${id}: recognition survives translation, scale, roughness and stroke order`,
  );
}
const source = newDrawing();
const shape = pathObject(symbols[0]!.strokes, "#202124", 4, "Circle");
const next = { ...source, objects: [shape] };
const history = drawingHistory(
  { past: [], present: source, future: [] },
  { type: "commit", document: next },
);
assert.deepEqual(
  drawingHistory(drawingHistory(history, { type: "undo" }), { type: "redo" })
    .present,
  next,
);
assert.deepEqual(parseDrawing(JSON.parse(JSON.stringify(next))), next);
assert.throws(() => parseDrawing({ ...next, width: 50000 }));
assert.throws(() =>
  parseDrawing({
    ...next,
    objects: [{ ...shape, color: 'red" onload="alert(1)' }],
  }),
);
assert.throws(() => parseDrawing({ ...next, objects: [shape, shape] }));
assert.throws(() =>
  parseDrawing({ ...next, objects: [{ ...shape, width: Number.NaN }] }),
);
const text = {
  ...shape,
  kind: "text" as const,
  text: '<script>alert("x")</script>',
  strokes: [],
};
const svg = drawingSvg({ ...source, background: "none", objects: [text] });
assert.ok(svg.includes("&lt;script&gt;"));
assert.ok(!svg.includes("<script>"));
assert.ok(!svg.includes('<rect width="100%"'));
console.log(
  `PASS: ${symbols.length} symbols, sketch recognition, undo/redo, safe project parsing and escaped SVG export.`,
);
