"use client";

import Image from "next/image";
import { useRef, useState, type PointerEvent } from "react";
import { cropGeometry } from "@/engines/editor";
import type { CropTransform } from "@/types/editor";

interface Props {
  url: string;
  width: number;
  height: number;
  value: CropTransform;
  onChange: (value: CropTransform) => void;
}
type Handle = "move" | "nw" | "ne" | "sw" | "se";
export function CropEditor({ url, width, height, value, onChange }: Props) {
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    handle: Handle;
    x: number;
    y: number;
    value: CropTransform;
  } | null>(null);
  const [ratio, setRatio] = useState(0);
  const selection = value.selection;
  const geometry = cropGeometry(width, height, value);

  function resize(handle: Handle, dx: number, dy: number, base = value) {
    const old = base.selection;
    if (handle === "move") {
      onChange({
        ...base,
        selection: {
          ...old,
          x: Math.max(0, Math.min(1 - old.width, old.x + dx)),
          y: Math.max(0, Math.min(1 - old.height, old.y + dy)),
        },
      });
      return;
    }
    const left = handle.endsWith("w");
    const top = handle.startsWith("n");
    const anchorX = left ? old.x + old.width : old.x;
    const anchorY = top ? old.y + old.height : old.y;
    const minimum = Math.max(1 / width, 1 / height, 0.01);
    let w = Math.max(
      minimum,
      Math.min(left ? anchorX : 1 - anchorX, old.width + (left ? -dx : dx)),
    );
    let h = Math.max(
      minimum,
      Math.min(top ? anchorY : 1 - anchorY, old.height + (top ? -dy : dy)),
    );
    if (ratio) {
      const normalized = (ratio * height) / width;
      h = w / normalized;
      const available = top ? anchorY : 1 - anchorY;
      if (h > available) {
        h = available;
        w = h * normalized;
      }
    }
    onChange({
      ...base,
      selection: {
        x: left ? anchorX - w : anchorX,
        y: top ? anchorY - h : anchorY,
        width: w,
        height: h,
      },
    });
  }
  function down(event: PointerEvent<HTMLButtonElement>, handle: Handle) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { handle, x: event.clientX, y: event.clientY, value };
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    const bounds = frame.current?.getBoundingClientRect();
    if (current && bounds)
      resize(
        current.handle,
        (event.clientX - current.x) / bounds.width,
        (event.clientY - current.y) / bounds.height,
        current.value,
      );
  }
  function chooseRatio(next: number) {
    setRatio(next);
    if (!next) return;
    const normalized = (next * height) / width;
    const w = Math.min(1, normalized);
    const h = w / normalized;
    onChange({
      ...value,
      selection: { x: (1 - w) / 2, y: (1 - h) / 2, width: w, height: h },
    });
  }
  // This factory returns event callbacks only; refs are read when a pointer event runs.
  const interaction = (handle: Handle) => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) =>
      // eslint-disable-next-line react-hooks/refs -- callback executes only on a pointer event
      down(event, handle),
    // eslint-disable-next-line react-hooks/refs -- callback executes only on a pointer event
    onPointerMove: move,
    onPointerUp: () => {
      drag.current = null;
    },
    onPointerCancel: () => {
      drag.current = null;
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
      const step = event.shiftKey ? 0.05 : 0.005;
      const dx =
        event.key === "ArrowLeft"
          ? -step
          : event.key === "ArrowRight"
            ? step
            : 0;
      const dy =
        event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
      if (dx || dy) {
        event.preventDefault();
        resize(handle, dx, dy);
      }
    },
  });
  return (
    <section aria-label="Interactive crop" className="space-y-4">
      <div
        ref={frame}
        className="relative mx-3 overflow-visible rounded-xl"
        style={{ aspectRatio: `${width}/${height}` }}
      >
        <Image
          src={url}
          alt="Original image with crop selection"
          width={width}
          height={height}
          unoptimized
          className="h-full w-full rounded-xl object-contain"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-xl bg-black/40"
          style={{
            clipPath: `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${selection.x * 100}% ${selection.y * 100}%, ${selection.x * 100}% ${(selection.y + selection.height) * 100}%, ${(selection.x + selection.width) * 100}% ${(selection.y + selection.height) * 100}%, ${(selection.x + selection.width) * 100}% ${selection.y * 100}%, ${selection.x * 100}% ${selection.y * 100}%)`,
          }}
        />
        <div
          className="pointer-events-none absolute border-2 border-white"
          style={{
            left: `${selection.x * 100}%`,
            top: `${selection.y * 100}%`,
            width: `${selection.width * 100}%`,
            height: `${selection.height * 100}%`,
          }}
        >
          <div
            aria-hidden="true"
            className="absolute inset-0 grid grid-cols-3 grid-rows-3"
          >
            {Array.from({ length: 9 }, (_, index) => (
              <span key={index} className="border border-white/30" />
            ))}
          </div>
          <button
            type="button"
            aria-label="Move crop selection. Use arrow keys."
            {...interaction("move")}
            className="pointer-events-auto absolute inset-0 touch-none cursor-move"
          >
            <span className="sr-only">Move selection</span>
          </button>
          {(["nw", "ne", "sw", "se"] as const).map((handle) => (
            <button
              key={handle}
              type="button"
              aria-label={`Resize ${handle} crop corner. Use arrow keys.`}
              {...interaction(handle)}
              className="pointer-events-auto absolute size-11 touch-none rounded-full border-2 border-accent bg-white shadow"
              style={{
                left: handle.endsWith("w") ? 0 : "100%",
                top: handle.startsWith("n") ? 0 : "100%",
                transform: "translate(-50%, -50%)",
                cursor: "nwse-resize",
              }}
            />
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="text-sm">
          Aspect ratio{" "}
          <select
            value={ratio}
            onChange={(event) => chooseRatio(Number(event.target.value))}
            className="ml-2 rounded-xl border border-line bg-surface p-2"
          >
            <option value="0">Free</option>
            <option value="1">Square 1:1</option>
            <option value="0.8">Portrait 4:5</option>
            <option value="1.7777777777777777">Wide 16:9</option>
            <option value="0.5625">Story 9:16</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() =>
            onChange({ ...value, rotation: (value.rotation + 90) % 360 })
          }
          className="rounded-full border border-line px-4 py-2"
        >
          Rotate 90°
        </button>
        <label className="flex items-center gap-2 text-sm">
          Straighten {value.straighten}°{" "}
          <input
            aria-label="Straighten angle"
            type="range"
            min="-15"
            max="15"
            step="0.5"
            value={value.straighten}
            onChange={(event) =>
              onChange({ ...value, straighten: Number(event.target.value) })
            }
          />
        </label>
      </div>
      <p className="text-sm text-muted">
        Drag a corner or move the selection. Arrow keys make small adjustments;
        Shift moves faster. Crop first, then rotate {value.rotation}°. Output:{" "}
        {geometry.width} × {geometry.height} pixels. Straightening leaves
        transparent corners.
      </p>
    </section>
  );
}
