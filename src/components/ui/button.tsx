"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant =
  "primary" | "secondary" | "ghost" | "soft" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

/**
 * Variant maps are explicit rather than composed, so a reader can see the exact
 * final classes for any state without resolving Tailwind conflicts in their head.
 */
const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-on-accent shadow-accent hover:bg-accent-hover active:bg-accent-deep " +
    "border border-accent-deep/20",
  secondary:
    "bg-surface text-ink border border-line shadow-sm hover:bg-surface-2 " +
    "hover:border-line-strong active:bg-surface-3",
  soft:
    "bg-accent-soft text-accent-deep border border-accent/15 hover:bg-accent-soft/70 " +
    "dark:text-accent",
  ghost:
    "text-ink-2 hover:bg-surface-3 hover:text-ink border border-transparent",
  danger:
    "bg-danger-soft text-danger border border-danger/20 hover:bg-danger-soft/70",
};

const SIZES: Record<ButtonSize, string> = {
  // Compact buttons still keep a 44px touch target on phones.
  sm: "h-11 md:h-9 px-3.5 text-[13px] gap-1.5 rounded-xl",
  md: "h-11 px-5 text-sm gap-2 rounded-2xl",
  lg: "h-13 px-7 text-[15px] gap-2.5 rounded-2xl",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Renders a pill instead of the size's default radius. */
  pill?: boolean;
  block?: boolean;
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "secondary",
      size = "md",
      pill = true,
      block,
      loading,
      disabled,
      iconLeft,
      iconRight,
      className,
      children,
      type = "button",
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        // `loading` must still expose the control to assistive tech, so it is
        // reported via aria-busy rather than by removing it from the tree.
        aria-busy={loading || undefined}
        disabled={disabled || loading}
        className={cn(
          "sf-button-motion relative inline-flex select-none items-center justify-center whitespace-nowrap",
          "font-medium tracking-[-0.01em] transition-[background-color,border-color,box-shadow,transform]",
          "duration-200 ease-out motion-safe:active:scale-[.98]",
          "disabled:pointer-events-none disabled:opacity-45",
          SIZES[size],
          pill && "rounded-full",
          VARIANTS[variant],
          block && "w-full",
          className,
        )}
        {...rest}
      >
        {loading ? (
          <span
            className="size-4 rounded bg-current/25 motion-safe:animate-pulse"
            aria-hidden
          />
        ) : (
          iconLeft
        )}
        {children}
        {!loading && iconRight}
      </button>
    );
  },
);
