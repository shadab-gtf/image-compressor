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

interface FoxMarkStaticProps {
  size?: number;
  className?: string;
  title?: string;
}

/** Inline SVG lets the theme recolor the muzzle without client-side rendering. */
export function FoxMarkStatic({
  size = 32,
  className,
  title,
}: FoxMarkStaticProps) {
  const clipId = `fox-head-${useId().replace(/:/g, "")}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox={VIEW_BOX}
      fill="none"
      className={cn("shrink-0", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <defs>
        <clipPath id={clipId}>
          <path d={HEAD} />
        </clipPath>
      </defs>
      <path d={EAR_LEFT} fill={BRAND.accent} />
      <path d={EAR_RIGHT} fill={BRAND.accent} />
      <path d={HEAD} fill={BRAND.accent} />
      <g clipPath={`url(#${clipId})`}>
        <path d={CHEEK_LEFT} fill={BRAND.cheek} />
        <path d={CHEEK_RIGHT} fill={BRAND.cheek} />
      </g>
      <circle cx={EYE_LEFT.cx} cy={EYE_LEFT.cy} r={EYE_LEFT.r} fill={BRAND.ink} />
      <circle cx={EYE_RIGHT.cx} cy={EYE_RIGHT.cy} r={EYE_RIGHT.r} fill={BRAND.ink} />
      <path d={NOSE} fill="var(--sf-mark-nose)" />
    </svg>
  );
}
