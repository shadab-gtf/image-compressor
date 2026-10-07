"use client";

import {
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";
import { DoodleIcon } from "@/components/ui/doodle-icon";
import type { Dimensions } from "@/types/image";
import { clamp, frameFor, useElementSize, type Frame, type View } from "./zoom";

/* -------------------------------------------------------------------------- */
/* Checkerboard                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Two offset 45deg gradients make the classic transparency chequer without
 * shipping an image asset. Both colours are theme tokens, so the backdrop
 * re-tints with the rest of the product instead of staying light-mode grey.
 */
const CHECKER: CSSProperties = {
  backgroundColor: "var(--sf-surface-2)",
  backgroundImage:
    "linear-gradient(45deg, var(--sf-border) 25%, transparent 25%, transparent 75%, var(--sf-border) 75%)," +
    "linear-gradient(45deg, var(--sf-border) 25%, transparent 25%, transparent 75%, var(--sf-border) 75%)",
  backgroundSize: "18px 18px",
  backgroundPosition: "0 0, 9px 9px",
};

export function Checkerboard() {
  return <div aria-hidden className="absolute inset-0" style={CHECKER} />;
}

/* -------------------------------------------------------------------------- */
/* Shared pieces                                                               */
/* -------------------------------------------------------------------------- */

function frameStyle(frame: Frame, view: View): CSSProperties {
  const x = clamp(view.x, -frame.maxX, frame.maxX);
  const y = clamp(view.y, -frame.maxY, frame.maxY);
  return {
    width: frame.width,
    height: frame.height,
    transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
  };
}

function Layer({
  src,
  alt,
  frame,
  view,
}: {
  src: string | null;
  alt: string;
  frame: Frame;
  view: View;
}) {
  if (!src || !frame.ready) return null;
  return (
    <div className="absolute left-1/2 top-1/2" style={frameStyle(frame, view)}>
      {/* Plain img: the source is a local object URL, which next/image cannot
          reach or optimise. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        draggable={false}
        decoding="async"
        className={cn(
          "size-full select-none object-contain",
          // Smoothing at inspection zoom would blur away the very artefacts the
          // user opened the viewer to look for.
          frame.scale >= 2 && "[image-rendering:pixelated]",
        )}
      />
    </div>
  );
}

function PaneLabel({
  children,
  side,
}: {
  children: ReactNode;
  side: "left" | "right";
}) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute top-2 z-10 rounded-full border border-line bg-surface/85 px-2.5 py-1",
        "text-[10.5px] font-semibold uppercase tracking-[0.07em] text-ink-2 backdrop-blur-sm",
        side === "left" ? "left-2" : "right-2",
      )}
    >
      {children}
    </span>
  );
}

type PanOrigin = { px: number; py: number; x: number; y: number };

function useDragPan(
  frame: Frame,
  view: View,
  onPan: (x: number, y: number) => void,
) {
  const origin = useRef<PanOrigin | null>(null);

  return {
    /** Returns false when there is nothing to pan, so callers can fall through. */
    start(event: PointerEvent<HTMLElement>): boolean {
      if (!frame.canPan) return false;
      event.currentTarget.setPointerCapture(event.pointerId);
      origin.current = {
        px: event.clientX,
        py: event.clientY,
        x: view.x,
        y: view.y,
      };
      return true;
    },
    move(event: PointerEvent<HTMLElement>) {
      const from = origin.current;
      if (!from) return;
      onPan(
        clamp(from.x + (event.clientX - from.px), -frame.maxX, frame.maxX),
        clamp(from.y + (event.clientY - from.py), -frame.maxY, frame.maxY),
      );
    },
    end(event: PointerEvent<HTMLElement>) {
      origin.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
  };
}

const STAGE_SHELL =
  "relative h-full w-full overflow-hidden rounded-2xl border border-line";

/* -------------------------------------------------------------------------- */
/* Single pane                                                                 */
/* -------------------------------------------------------------------------- */

export function SinglePane({
  src,
  alt,
  caption,
  natural,
  view,
  onPan,
}: {
  src: string | null;
  alt: string;
  caption?: string;
  natural: Dimensions;
  view: View;
  onPan: (x: number, y: number) => void;
}) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const frame = frameFor(natural, size, view.zoom);
  const pan = useDragPan(frame, view, onPan);

  return (
    <div
      ref={ref}
      onPointerDown={(e) => void pan.start(e)}
      onPointerMove={(e) => pan.move(e)}
      onPointerUp={(e) => pan.end(e)}
      onPointerCancel={(e) => pan.end(e)}
      style={{ touchAction: frame.canPan ? "none" : "auto" }}
      className={cn(
        STAGE_SHELL,
        frame.canPan && "cursor-grab active:cursor-grabbing",
      )}
    >
      <Checkerboard />
      <Layer src={src} alt={alt} frame={frame} view={view} />
      {caption && <PaneLabel side="left">{caption}</PaneLabel>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Split (slider) pane                                                         */
/* -------------------------------------------------------------------------- */

export function SplitPane({
  originalSrc,
  outputSrc,
  natural,
  view,
  onPan,
  split,
  onSplitChange,
}: {
  originalSrc: string | null;
  outputSrc: string | null;
  natural: Dimensions;
  view: View;
  onPan: (x: number, y: number) => void;
  /** 0-100, measured across the viewport rather than across the image. */
  split: number;
  onSplitChange: (next: number) => void;
}) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const frame = frameFor(natural, size, view.zoom);
  const pan = useDragPan(frame, view, onPan);
  const scrubbing = useRef(false);

  const splitFromClientX = (clientX: number) => {
    const element = ref.current;
    if (!element) return split;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0) return split;
    return clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);
  };

  // Dragging the picture pans once there is something to pan to, and moves the
  // divider when the whole image already fits. One gesture, no mode to learn.
  const onStagePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (pan.start(event)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    scrubbing.current = true;
    onSplitChange(splitFromClientX(event.clientX));
  };

  const onStagePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (scrubbing.current) {
      onSplitChange(splitFromClientX(event.clientX));
      return;
    }
    pan.move(event);
  };

  const onStagePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    scrubbing.current = false;
    pan.end(event);
  };

  const onHandleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? 10 : 2;
    let next: number | null = null;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown")
      next = split - step;
    else if (event.key === "ArrowRight" || event.key === "ArrowUp")
      next = split + step;
    else if (event.key === "PageDown") next = split - 10;
    else if (event.key === "PageUp") next = split + 10;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = 100;
    if (next === null) return;
    event.preventDefault();
    onSplitChange(clamp(next, 0, 100));
  };

  const rounded = Math.round(split);

  return (
    <div
      ref={ref}
      onPointerDown={onStagePointerDown}
      onPointerMove={onStagePointerMove}
      onPointerUp={onStagePointerUp}
      onPointerCancel={onStagePointerUp}
      style={{ touchAction: "none" }}
      className={cn(
        STAGE_SHELL,
        frame.canPan
          ? "cursor-grab active:cursor-grabbing"
          : "cursor-ew-resize",
      )}
    >
      <Checkerboard />
      <Layer src={originalSrc} alt="Original image" frame={frame} view={view} />

      {/* The clip sits on a viewport-sized wrapper, not on the image, so the
          divider stays put while the image pans underneath it. Its own chequer
          stops a transparent output from revealing the original through it. */}
      <div
        className="absolute inset-0"
        style={{ clipPath: `inset(0 0 0 ${split}%)` }}
      >
        <Checkerboard />
        <Layer
          src={outputSrc}
          alt="Compressed output"
          frame={frame}
          view={view}
        />
      </div>

      <PaneLabel side="left">Original</PaneLabel>
      <PaneLabel side="right">Output</PaneLabel>

      <button
        type="button"
        role="slider"
        aria-label="Comparison split position"
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={rounded}
        aria-valuetext={`${rounded} percent original, ${100 - rounded} percent output`}
        onKeyDown={onHandleKeyDown}
        onPointerDown={(e) => {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          scrubbing.current = true;
        }}
        onPointerMove={(e) => {
          if (scrubbing.current) onSplitChange(splitFromClientX(e.clientX));
        }}
        onPointerUp={(e) => {
          scrubbing.current = false;
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
        }}
        style={{ left: `${split}%`, touchAction: "none" }}
        className="absolute inset-y-0 z-20 w-11 -translate-x-1/2 cursor-ew-resize rounded-full"
      >
        <span
          aria-hidden
          className="absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 bg-accent"
        />
        <span
          aria-hidden
          className={cn(
            "absolute left-1/2 top-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center",
            "justify-center rounded-full bg-accent text-on-accent shadow-accent ring-2 ring-surface",
          )}
        >
          <DoodleIcon
            name="chevron-right"
            size={13}
            className="-mr-1 rotate-180"
          />
          <DoodleIcon name="chevron-right" size={13} className="-ml-1" />
        </span>
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Side by side                                                                */
/* -------------------------------------------------------------------------- */

export function SideBySidePanes({
  originalSrc,
  outputSrc,
  natural,
  view,
  onPan,
}: {
  originalSrc: string | null;
  outputSrc: string | null;
  natural: Dimensions;
  view: View;
  onPan: (x: number, y: number) => void;
}) {
  // Equal boxes plus one shared view object means zoom and pan are synchronised
  // by construction, rather than by an effect that mirrors state between panes.
  return (
    <div className="grid h-full w-full grid-cols-2 gap-2">
      <SinglePane
        src={originalSrc}
        alt="Original image"
        caption="Original"
        natural={natural}
        view={view}
        onPan={onPan}
      />
      <SinglePane
        src={outputSrc}
        alt="Compressed output"
        caption="Output"
        natural={natural}
        view={view}
        onPan={onPan}
      />
    </div>
  );
}
