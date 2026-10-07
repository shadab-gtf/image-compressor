"use client";

import { motion, useReducedMotion } from "motion/react";
import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { DoodleIcon } from "@/components/ui/doodle-icon";

/* -------------------------------------------------------------------------- */
/* Field                                                                       */
/* -------------------------------------------------------------------------- */

export function Field({
  label,
  hint,
  htmlFor,
  action,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  htmlFor?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label
          htmlFor={htmlFor}
          className="text-[12px] font-semibold uppercase tracking-[0.06em] text-faint"
        >
          {label}
        </label>
        {action}
      </div>
      {children}
      {hint && <p className="text-[12.5px] leading-snug text-muted">{hint}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Segmented control                                                           */
/* -------------------------------------------------------------------------- */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = "md",
  className,
}: {
  value: T;
  onChange: (next: T) => void;
  options: Array<{
    value: T;
    label: string;
    disabled?: boolean;
    title?: string;
  }>;
  label: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const layoutId = useId();
  const reducedMotion = useReducedMotion();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "grid gap-0.5 rounded-full border border-line bg-surface-3 p-1",
        className,
      )}
      style={{
        gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
      }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={option.disabled}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative rounded-full font-medium transition-colors duration-200",
              size === "sm"
                ? "h-11 text-[12px] md:h-7"
                : "h-11 text-[13px] md:h-9",
              option.disabled
                ? "cursor-not-allowed text-faint/60"
                : active
                  ? "text-ink"
                  : "text-muted hover:text-ink",
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${layoutId}`}
                initial={false}
                className="absolute inset-0 rounded-full bg-surface shadow-xs"
                transition={
                  reducedMotion
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 380, damping: 32, mass: 0.7 }
                }
              />
            )}
            <span className="relative z-10 px-1">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Slider                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Built on a native range input rather than a div with pointer handlers, so
 * keyboard stepping, arrow keys, Home/End and screen-reader announcements all
 * work without reimplementing them.
 */
export function Slider({
  value,
  onChange,
  min = 1,
  max = 100,
  step = 1,
  label,
  suffix,
  id,
  disabled,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  suffix?: string;
  id?: string;
  disabled?: boolean;
}) {
  const generated = useId();
  const inputId = id ?? generated;
  const percent = ((value - min) / (max - min)) * 100;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <label htmlFor={inputId} className="text-[13px] font-medium text-ink-2">
          {label}
        </label>
        <output
          htmlFor={inputId}
          className="rounded-lg bg-surface-3 px-2 py-0.5 text-[12.5px] font-semibold text-ink"
        >
          {value}
          {suffix}
        </output>
      </div>
      <input
        id={inputId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="sf-range"
        // The filled portion is drawn by the track's own background, fed from a
        // custom property. A pseudo-element cannot read a Tailwind class with a
        // runtime percentage in it, so the value is passed as a variable.
        style={
          {
            "--sf-track": `linear-gradient(to right, var(--sf-accent) ${percent}%, var(--sf-border-strong) ${percent}%)`,
          } as React.CSSProperties
        }
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Switch                                                                      */
/* -------------------------------------------------------------------------- */

export function Switch({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const reducedMotion = useReducedMotion();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label
          htmlFor={id}
          className="block text-[13px] font-medium text-ink-2"
        >
          {label}
        </label>
        {hint && (
          <p className="mt-0.5 text-[12px] leading-snug text-muted">{hint}</p>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative grid size-11 shrink-0 place-items-center rounded-full",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <span
          className={cn(
            "relative block h-6 w-10 rounded-full transition-colors duration-200",
            checked ? "bg-accent" : "bg-line-strong",
          )}
        >
          <motion.span
            initial={false}
            className="absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-sm"
            animate={{ x: checked ? 16 : 0 }}
            transition={
              reducedMotion
                ? { duration: 0 }
                : { type: "spring", stiffness: 380, damping: 28, mass: 0.65 }
            }
          />
        </span>
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Inputs                                                                      */
/* -------------------------------------------------------------------------- */

export function TextInput({
  className,
  suffix,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { suffix?: string }) {
  return (
    <div className="relative">
      <input
        {...rest}
        className={cn(
          "h-11 w-full rounded-xl border border-line bg-surface px-3 text-[13.5px] text-ink",
          "placeholder:text-faint transition-colors",
          "hover:border-line-strong focus:border-accent",
          "disabled:cursor-not-allowed disabled:opacity-50",
          suffix && "pr-10",
          className,
        )}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-medium text-faint">
          {suffix}
        </span>
      )}
    </div>
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  label,
  id,
  disabled,
}: {
  value: T;
  onChange: (next: T) => void;
  options: Array<{ value: T; label: string; disabled?: boolean }>;
  label: string;
  id?: string;
  disabled?: boolean;
}) {
  const generated = useId();
  return (
    <div className="relative">
      <select
        id={id ?? generated}
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
        className={cn(
          "h-11 w-full cursor-pointer appearance-none rounded-xl border border-line bg-surface",
          "px-3 pr-9 text-[13.5px] font-medium text-ink transition-colors",
          "hover:border-line-strong focus:border-accent",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </option>
        ))}
      </select>
      <DoodleIcon
        name="chevron-down"
        size={16}
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-faint"
      />
    </div>
  );
}
