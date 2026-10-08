import { memo } from "react";
import type { DrawingObject, DrawingSymbol } from "@/types/drawing";
import { polyline, textBox } from "@/engines/drawing";

export const DrawingObjectView = memo(function DrawingObjectView({
  object,
  hitArea = false,
}: {
  object: DrawingObject;
  hitArea?: boolean;
}) {
  const box = textBox(object);
  return (
    <g
      data-object-id={object.id}
      transform={`translate(${object.x} ${object.y}) rotate(${object.rotation} ${object.width / 2} ${object.height / 2})`}
    >
      {hitArea && (
        <rect
          x={-5}
          y={-5}
          width={object.width + 10}
          height={object.height + 10}
          fill="transparent"
        />
      )}
      {object.kind === "text" ? (
        <text
          transform={`scale(${object.width / box.width} ${object.height / box.height})`}
          fill={object.color}
          fontFamily="Arial,sans-serif"
          fontSize={object.fontSize}
          fontWeight={object.bold ? 700 : 400}
        >
          {object.text.split("\n").map((line, index) => (
            <tspan key={index} x={0} y={object.fontSize * (1 + index * 1.25)}>
              {line}
            </tspan>
          ))}
        </text>
      ) : (
        object.strokes.map((stroke, index) => (
          <polyline
            key={index}
            points={polyline(
              stroke.map((point) => ({
                x: (point.x / 100) * object.width,
                y: (point.y / 100) * object.height,
              })),
            )}
            fill={object.fill}
            stroke={object.color}
            strokeWidth={object.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))
      )}
    </g>
  );
});

export function DrawingSymbolView({ symbol }: { symbol: DrawingSymbol }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width="40"
      height="40"
      aria-hidden="true"
      className="h-9 w-9 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {symbol.strokes.map((stroke, index) => (
        <polyline key={index} points={polyline(stroke)} />
      ))}
    </svg>
  );
}
