/**
 * ShrinkFox brand mark — geometric construction.
 *
 * Single source of truth. The React component, the static SVG assets in
 * /public/brand and the generated PWA icons all read these paths, so the mark
 * can never drift between surfaces.
 *
 * Construction notes
 * ------------------
 * The mark is drawn on a 256x256 grid.
 *
 * The head is a rounded rectangle. Two cream cheek wedges sweep in from the
 * lower corners and pinch the orange into a narrowing V, which terminates in a
 * dark triangle that drops below the baseline. That triangle reads two ways at
 * once: as a fox muzzle, and as the "reduce" arrowhead of a compression tool.
 * This is the whole brand idea — the fox's face *is* the compress glyph.
 *
 * The ears share the head's outer edge (both sit on x=44 / x=212) and extend
 * well down into the head body. Drawing them behind an opaque head makes the
 * union seamless, instead of leaving a step where an ear base meets a corner
 * radius.
 *
 * Every shape is a closed path with no strokes, filters or embedded rasters, so
 * the mark stays crisp from 16px (favicon) to 512px (PWA icon) and flattens
 * cleanly to a single-colour silhouette.
 */

export const VIEW_BOX = "0 0 256 256";
export const CANVAS = 256;

/** Left ear: vertical outer edge, rounded apex, sweeping inner edge. */
export const EAR_LEFT =
  "M44 160V40q0-16 15-9c26 13 49 45 65 129z";

/** Right ear: exact mirror of the left about x=128. */
export const EAR_RIGHT =
  "M212 160V40q0-16-15-9c-26 13-49 45-65 129z";

/**
 * Head: rounded rectangle, with the bottom edge broken by the muzzle chevron
 * that descends past the baseline to the chin point at (128, 242).
 */
export const HEAD =
  "M70 92h116a26 26 0 0 1 26 26v60a26 26 0 0 1-26 26H70a26 26 0 0 1-26-26v-60a26 26 0 0 1 26-26z";

/**
 * Cheek wedges. These are deliberately oversized and rely on the head clip path
 * to trim them, which keeps the shared edge mathematically exact instead of
 * hand-fitted.
 */
export const CHEEK_LEFT = "M-20 144C40 150 90 166 108 204L-20 204Z";
export const CHEEK_RIGHT = "M276 144C216 150 166 166 148 204L276 204Z";

/** Eyes. */
export const EYE_LEFT = { cx: 100, cy: 162, r: 11 } as const;
export const EYE_RIGHT = { cx: 156, cy: 162, r: 11 } as const;

/** Nose: the tip of the chevron, which is also the arrowhead. */
export const NOSE = "M110 200h36l-15 37a4 4 0 0 1-6 0z";

/** Palette. Values are also mirrored as CSS custom properties in globals.css. */
export const BRAND = {
  accent: "#E8652B",
  accentDeep: "#C94F18",
  cheek: "#FFE6CC",
  ink: "#141414",
} as const;

/** Id-suffixed so multiple marks can coexist on one page without clip collisions. */
export function clipId(instance: string) {
  return `sf-head-clip-${instance}`;
}
