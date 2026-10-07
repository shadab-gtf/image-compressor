"use client";

import { motion, useReducedMotion, type Transition } from "motion/react";
import { useId } from "react";
import { cn } from "@/lib/cn";
import {
  BRAND,
  CHEEK_LEFT,
  CHEEK_RIGHT,
  EAR_LEFT,
  EAR_RIGHT,
  EYE_LEFT,
  EYE_RIGHT,
  HEAD,
  NOSE,
  VIEW_BOX,
} from "./geometry";

/**
 * The fox is the product's status indicator, not decoration. Each state maps to
 * a real moment in the pipeline, so the mark always tells the truth about what
 * the engine is doing.
 */
export type FoxState =
  | "idle" // at rest
  | "alert" // files are over the drop zone — ears up, eyes wide
  | "working" // encoding — the head compresses on the beat
  | "done"; // batch finished — a single settle

export type FoxTone = "color" | "mono";

const spring: Transition = { type: "spring", stiffness: 260, damping: 22 };

export function FoxMark({
  size = 48,
  state = "idle",
  tone = "color",
  className,
  title,
}: {
  size?: number;
  state?: FoxState;
  tone?: FoxTone;
  className?: string;
  /** Omit to render the mark as decoration beside existing text. */
  title?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const reduced = useReducedMotion();

  const accent = tone === "mono" ? "currentColor" : BRAND.accent;
  const cheek = tone === "mono" ? "transparent" : BRAND.cheek;
  const ink = tone === "mono" ? "var(--sf-bg)" : BRAND.ink;

  // Reduced motion keeps every state visually distinct through transform-free
  // differences only; nothing animates.
  const headAnim = reduced
    ? {}
    : {
        idle: { scaleY: 1, y: 0 },
        alert: { scaleY: 1, y: -3 },
        // The squash *is* the brand idea: the fox compresses the image.
        working: { scaleY: [1, 0.88, 1], y: [0, 5, 0] },
        done: { scaleY: [1, 1.04, 1], y: [0, -4, 0] },
      }[state];

  const headTransition: Transition =
    state === "working"
      ? { duration: 0.9, repeat: Infinity, ease: "easeInOut" }
      : state === "done"
        ? { duration: 0.45, ease: "easeOut" }
        : spring;

  // Eyes narrow while working (concentration) and widen on alert.
  const eyeScale = reduced ? 1 : state === "working" ? 0.45 : state === "alert" ? 1.18 : 1;

  // Ears prick up on alert and lean in while working.
  const earAnim = reduced
    ? {}
    : {
        idle: { y: 0, rotate: 0 },
        alert: { y: -6, rotate: 0 },
        working: { y: -2, rotate: 0 },
        done: { y: 0, rotate: 0 },
      }[state];

  // The nose is the compress arrowhead — it pushes down on each beat.
  const noseAnim = reduced
    ? {}
    : state === "working"
      ? { y: [0, 6, 0], scaleY: [1, 1.18, 1] }
      : { y: 0, scaleY: 1 };

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox={VIEW_BOX}
      fill="none"
      className={cn("shrink-0 overflow-visible", className)}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      initial={false}
    >
      <defs>
        <clipPath id={`head-${uid}`}>
          <path d={HEAD} />
        </clipPath>
      </defs>

      <motion.g animate={earAnim} transition={spring} style={{ originY: 1 }}>
        <path d={EAR_LEFT} fill={accent} />
        <path d={EAR_RIGHT} fill={accent} />
      </motion.g>

      <motion.g
        animate={headAnim}
        transition={headTransition}
        style={{ originX: 0.5, originY: 1 }}
      >
        <path d={HEAD} fill={accent} />

        {tone === "color" && (
          <g clipPath={`url(#head-${uid})`}>
            <path d={CHEEK_LEFT} fill={cheek} />
            <path d={CHEEK_RIGHT} fill={cheek} />
          </g>
        )}

        {[EYE_LEFT, EYE_RIGHT].map((eye, i) => (
          <motion.ellipse
            key={i}
            cx={eye.cx}
            cy={eye.cy}
            rx={eye.r}
            ry={eye.r}
            fill={ink}
            animate={{ scaleY: eyeScale }}
            transition={spring}
            style={{ originX: `${eye.cx}px`, originY: `${eye.cy}px` }}
          />
        ))}

        <motion.path
          d={NOSE}
          fill={tone === "mono" ? ink : "var(--sf-mark-nose)"}
          animate={noseAnim}
          transition={headTransition}
          style={{ originX: 0.5, originY: 0 }}
        />
      </motion.g>
    </motion.svg>
  );
}

