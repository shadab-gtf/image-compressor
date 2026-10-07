"use client";

import { useEffect, useRef, useState } from "react";
import type { Dimensions } from "@/types/image";

export const ZOOM_LEVELS = ["fit", "1", "2", "4"] as const;
export type ZoomLevel = (typeof ZOOM_LEVELS)[number];

export const ZOOM_OPTIONS: Array<{ value: ZoomLevel; label: string; title: string }> = [
  { value: "fit", label: "Fit", title: "Fit the whole image in view" },
  { value: "1", label: "100%", title: "One image pixel per screen pixel" },
  { value: "2", label: "200%", title: "Inspect compression artefacts" },
  { value: "4", label: "400%", title: "Inspect individual pixels" },
];

export type Size = { w: number; h: number };

/** Zoom plus pan offset in CSS pixels from centre. Shared by every pane. */
export type View = { zoom: ZoomLevel; x: number; y: number };

export type Frame = {
  width: number;
  height: number;
  scale: number;
  /** Largest pan offset that still keeps the viewport covered. */
  maxX: number;
  maxY: number;
  canPan: boolean;
  ready: boolean;
};

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function frameFor(natural: Dimensions, stage: Size, zoom: ZoomLevel): Frame {
  const ready =
    stage.w > 0 && stage.h > 0 && natural.width > 0 && natural.height > 0;
  const scale = !ready
    ? 1
    : zoom === "fit"
      ? Math.min(stage.w / natural.width, stage.h / natural.height)
      : Number(zoom);

  const width = natural.width * scale;
  const height = natural.height * scale;
  const maxX = Math.max(0, (width - stage.w) / 2);
  const maxY = Math.max(0, (height - stage.h) / 2);

  return {
    width,
    height,
    scale,
    maxX,
    maxY,
    // Sub-pixel overflow is not worth a grab cursor.
    canPan: ready && (maxX > 0.5 || maxY > 0.5),
    ready,
  };
}

export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<Size>({ w: 0, h: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    observer.observe(element);
    setSize({ w: element.clientWidth, h: element.clientHeight });
    return () => observer.disconnect();
  }, []);

  return [ref, size] as const;
}
