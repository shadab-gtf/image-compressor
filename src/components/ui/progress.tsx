"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

export function ProgressBar({
  value,
  label,
  className,
  tone = "accent",
}: {
  /** 0-1. */
  value: number;
  label: string;
  className?: string;
  tone?: "accent" | "success";
}) {
  const percent = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const reduced = useReducedMotion();
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-line-strong", className)}
    >
      <motion.div
        className={cn("h-full rounded-full", tone === "accent" ? "bg-accent" : "bg-success")}
        initial={false}
        animate={{ width: `${percent}%` }}
        transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 180, damping: 28 }}
      />
    </div>
  );
}

/**
 * Indeterminate bar for work whose duration cannot be known, such as building a
 * ZIP of unknown total size. Kept visually distinct from the determinate bar so
 * it never reads as "stuck at 0%".
 */
export function IndeterminateBar({ label }: { label: string }) {
  const reduced = useReducedMotion();
  return (
    <div
      role="progressbar"
      aria-label={label}
      className="h-1.5 w-full overflow-hidden rounded-full bg-line-strong"
    >
      <motion.div
        className="h-full w-1/3 rounded-full bg-accent"
        animate={reduced ? { x: "100%" } : { x: ["-100%", "300%"] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  icon,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: ReactNode;
  tone?: "default" | "success" | "accent";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-3",
        tone === "success"
          ? "border-success/20 bg-success-soft"
          : tone === "accent"
            ? "border-accent/20 bg-accent-soft"
            : "border-line bg-surface",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p
          className={cn(
            "text-[11px] font-semibold uppercase tracking-[0.07em]",
            tone === "success" ? "text-success" : tone === "accent" ? "text-accent-deep dark:text-accent" : "text-faint",
          )}
        >
          {label}
        </p>
        {icon && (
          <span aria-hidden="true" className="sf-doodle-badge grid size-9 shrink-0 place-items-center text-ink">
            {icon}
          </span>
        )}
      </div>
      <p
        className={cn(
          "mt-1 text-[19px] font-semibold tracking-[-0.02em]",
          tone === "success" ? "text-success" : "text-ink",
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[12px] text-muted">{sub}</p>}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
  className,
  title,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warn" | "danger" | "accent";
  className?: string;
  /** Tooltip for badges whose short label needs expanding. */
  title?: string;
}) {
  const tones = {
    neutral: "border-line bg-surface-3 text-muted",
    success: "border-success/20 bg-success-soft text-success",
    warn: "border-warn/20 bg-warn-soft text-warn",
    danger: "border-danger/20 bg-danger-soft text-danger",
    accent: "border-accent/20 bg-accent-soft text-accent-deep dark:text-accent",
  } as const;

  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
