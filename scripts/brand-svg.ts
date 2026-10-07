/**
 * Renders the brand mark to standalone SVG documents.
 * Used by scripts/build-brand-assets.ts and by the screenshot harness, so the
 * exported files and the on-screen React component always share one geometry.
 */
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
} from "../src/components/brand/geometry.ts";

export type Variant = "color" | "mono" | "icon";

const eye = (e: { cx: number; cy: number; r: number }, fill: string) =>
  `<circle cx="${e.cx}" cy="${e.cy}" r="${e.r}" fill="${fill}"/>`;

export function markSvg(variant: Variant, opts: { id?: string } = {}) {
  const id = opts.id ?? variant;

  if (variant === "mono") {
    // One-colour silhouette. The cheeks and eyes are knocked out through a mask
    // rather than filled, so the muzzle V and the arrowhead still read when the
    // mark is reduced to a single ink.
    const m = `mask-${id}`;
    const c = `clip-${id}`;
    // The cheeks are clipped to the head before being subtracted. Letting them
    // run past the head edge leaves a hairline seam where the mask boundary and
    // the head boundary land on the same pixel row.
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW_BOX}" fill="none" role="img" aria-label="ShrinkFox">
  <defs><clipPath id="${c}"><path d="${HEAD}"/></clipPath></defs>
  <mask id="${m}" maskUnits="userSpaceOnUse" x="0" y="0" width="256" height="256">
    <rect width="256" height="256" fill="#000"/>
    <path d="${EAR_LEFT}" fill="#fff"/>
    <path d="${EAR_RIGHT}" fill="#fff"/>
    <path d="${HEAD}" fill="#fff"/>
    <g clip-path="url(#${c})">
      <path d="${CHEEK_LEFT}" fill="#000"/>
      <path d="${CHEEK_RIGHT}" fill="#000"/>
    </g>
    ${eye(EYE_LEFT, "#000")}
    ${eye(EYE_RIGHT, "#000")}
  </mask>
  <rect width="256" height="256" fill="currentColor" mask="url(#${m})"/>
  <path d="${NOSE}" fill="currentColor"/>
</svg>`;
  }

  const onPlate = variant === "icon";
  const clip = `clip-${id}`;
  const accent = onPlate ? "#FFFFFF" : BRAND.accent;
  const cheek = onPlate ? "#FFD9BC" : BRAND.cheek;
  const ink = onPlate ? BRAND.accentDeep : BRAND.ink;

  const plate = onPlate
    ? `<defs><linearGradient id="pg-${id}" x1="128" y1="0" x2="128" y2="256" gradientUnits="userSpaceOnUse">
      <stop stop-color="#F0803E"/><stop offset="1" stop-color="#C94F18"/></linearGradient></defs>
  <rect width="256" height="256" rx="60" fill="url(#pg-${id})"/>`
    : "";
  // Inset the mark inside the icon plate so it keeps a safe margin for masking.
  const inner = onPlate
    ? ` transform="translate(128 132) scale(.68) translate(-128 -128)"`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW_BOX}" fill="none" role="img" aria-label="ShrinkFox">
  ${plate}<defs><clipPath id="${clip}"><path d="${HEAD}"/></clipPath></defs>
  <g${inner}>
    <path d="${EAR_LEFT}" fill="${accent}"/>
    <path d="${EAR_RIGHT}" fill="${accent}"/>
    <path d="${HEAD}" fill="${accent}"/>
    <g clip-path="url(#${clip})">
      <path d="${CHEEK_LEFT}" fill="${cheek}"/>
      <path d="${CHEEK_RIGHT}" fill="${cheek}"/>
    </g>
    ${eye(EYE_LEFT, ink)}
    ${eye(EYE_RIGHT, ink)}
    <path d="${NOSE}" fill="${ink}"/>
  </g>
</svg>`;
}
