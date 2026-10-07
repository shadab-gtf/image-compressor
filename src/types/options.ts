import type { OutputFormat } from "./image";

/* -------------------------------------------------------------------------- */
/* Resize                                                                      */
/* -------------------------------------------------------------------------- */

export type ResizeMode =
  | "none"
  | "exact" // both dimensions, ratio optional
  | "width" // fit to width, height follows
  | "height" // fit to height, width follows
  | "percentage"
  | "maxWidth"
  | "maxHeight"
  | "fit" // contain inside a box
  | "fill" // cover a box, centre-cropped
  | "crop"; // explicit crop rect, then resize

export type ResizeOptions = {
  mode: ResizeMode;
  width?: number;
  height?: number;
  percentage?: number;
  /** Default true. Disabling it allows deliberate distortion in `exact` mode. */
  maintainAspectRatio: boolean;
  /** Default true. Prevents a small source being blown up and softened. */
  preventUpscale: boolean;
  /** Crop rectangle in source pixels, used by `crop`. */
  crop?: { x: number; y: number; width: number; height: number };
};

/* -------------------------------------------------------------------------- */
/* Compression                                                                 */
/* -------------------------------------------------------------------------- */

export type CompressionMode =
  | "smart" // engine picks per-image
  | "quality" // explicit quality slider
  | "lossless" // only where the codec supports it
  | "targetSize";

export type CompressionOptions = {
  mode: CompressionMode;
  /** 1-100. Used by `quality`. */
  quality: number;
  /** Bytes. Used by `targetSize`. */
  targetBytes?: number;
  /**
   * How far above the target is still reported as a success. The UI never
   * claims an exact hit outside this band — it reports the closest achievable
   * size instead.
   */
  targetTolerance: number;
  /**
   * Allow the target-size search to reduce dimensions once quality alone has
   * bottomed out.
   */
  allowDownscaleForTarget: boolean;
  /** Reduce the PNG colour palette. The only real lossy lever PNG has. */
  pngPaletteColors?: number;
};

/* -------------------------------------------------------------------------- */
/* Output                                                                      */
/* -------------------------------------------------------------------------- */

/** `keep` preserves the source format where it is also an output format. */
export type FormatChoice = OutputFormat | "keep" | "auto";

export type MetadataPolicy = "preserve" | "removePersonal" | "removeAll";

export type OutputOptions = {
  format: FormatChoice;
  /** Matte colour used when flattening alpha into a format without it. */
  background: string;
  metadata: MetadataPolicy;
};

/* -------------------------------------------------------------------------- */
/* The full job contract                                                       */
/* -------------------------------------------------------------------------- */

export type ProcessingOptions = {
  resize: ResizeOptions;
  compression: CompressionOptions;
  output: OutputOptions;
};

export const DEFAULT_OPTIONS: ProcessingOptions = {
  resize: {
    mode: "none",
    maintainAspectRatio: true,
    preventUpscale: true,
  },
  compression: {
    mode: "smart",
    quality: 78,
    targetTolerance: 0.05,
    allowDownscaleForTarget: true,
  },
  output: {
    format: "keep",
    background: "#FFFFFF",
    metadata: "removePersonal",
  },
};

/* -------------------------------------------------------------------------- */
/* Presets                                                                     */
/* -------------------------------------------------------------------------- */

export type PresetGroup = "website" | "ecommerce" | "social" | "developer" | "custom";

export type Preset = {
  id: string;
  name: string;
  group: PresetGroup;
  description: string;
  options: ProcessingOptions;
  /** User-created presets can be edited and deleted; built-ins cannot. */
  builtIn: boolean;
};
