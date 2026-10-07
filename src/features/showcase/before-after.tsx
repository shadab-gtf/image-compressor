"use client";

import Image from "next/image";
import { useId, useRef, useState, type CSSProperties } from "react";
import { DoodleIcon } from "@/components/ui/doodle-icon";
import { cn } from "@/lib/cn";

export interface BeforeAfterProps {
  before: string;
  after: string;
  alt: string;
  width: number;
  height: number;
  eager?: boolean;
}

export function BeforeAfter({
  before,
  after,
  alt,
  width,
  height,
  eager = false,
}: BeforeAfterProps) {
  const [position, setPosition] = useState(50);
  const [dragging, setDragging] = useState(false);
  const comparison = useRef<HTMLDivElement>(null);
  const id = useId();
  return (
    <div
      ref={comparison}
      data-dragging={dragging}
      className="group/compare relative overflow-hidden rounded-2xl bg-surface-3"
      style={
        {
          aspectRatio: `${width} / ${height}`,
          "--sf-compare-position": `${position}%`,
        } as CSSProperties
      }
    >
      <Image
        src={after}
        alt={`After: ${alt}`}
        width={width}
        height={height}
        sizes="(max-width: 768px) 94vw, 550px"
        unoptimized
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : undefined}
        className="absolute inset-0 size-full object-cover"
      />
      <div
        className={cn(
          "absolute inset-0",
          dragging
            ? "transition-none"
            : "motion-safe:transition-[clip-path] motion-safe:duration-150 motion-safe:ease-out",
        )}
        style={{
          clipPath: "inset(0 calc(100% - var(--sf-compare-position)) 0 0)",
        }}
      >
        <Image
          src={before}
          alt={`Before: ${alt}`}
          width={width}
          height={height}
          sizes="(max-width: 768px) 94vw, 550px"
          unoptimized
          loading={eager ? "eager" : "lazy"}
          className="size-full object-cover"
        />
      </div>
      <div className="pointer-events-none absolute inset-x-4 top-4 flex justify-between gap-2 text-xs font-semibold text-white">
        <span className="rounded-full bg-black/60 px-3 py-1.5">Original</span>
        <span className="rounded-full bg-black/60 px-3 py-1.5">Optimized</span>
      </div>
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-md",
          dragging
            ? "transition-none"
            : "motion-safe:transition-[left] motion-safe:duration-150 motion-safe:ease-out",
        )}
        style={{ left: "var(--sf-compare-position)" }}
      >
        <span className="absolute top-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/40 bg-white text-neutral-700 shadow-lg motion-safe:transition-transform motion-safe:duration-150 motion-safe:group-hover/compare:scale-110 motion-safe:group-data-[dragging=true]/compare:scale-95">
          <DoodleIcon name="compare" size={24} />
        </span>
      </div>
      <label htmlFor={id} className="sr-only">
        Compare original and optimized image
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        value={position}
        onChange={(event) => {
          const next = Number(event.target.value);
          comparison.current?.style.setProperty(
            "--sf-compare-position",
            `${next}%`,
          );
          setPosition(next);
        }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
        }}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        onLostPointerCapture={() => setDragging(false)}
        onBlur={() => setDragging(false)}
        aria-valuetext={`${position}% original image visible`}
        className="sf-comparison-range absolute inset-0 m-0 size-full cursor-ew-resize opacity-0 focus-visible:opacity-100"
      />
    </div>
  );
}
