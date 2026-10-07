import type { ProcessingOptions } from "@/types/options";

export interface SavedPreset {
  id: string;
  name: string;
  options: ProcessingOptions;
}
export const PRESET_STORAGE_KEY = "shrinkfox.presets.v1";
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function number(value: unknown, min: number, max: number): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  );
}
function member(value: unknown, choices: readonly string[]): value is string {
  return typeof value === "string" && choices.includes(value);
}
/** Rebuild the contract instead of retaining unknown keys or imported private data. */
export function parseOptions(value: unknown): ProcessingOptions {
  if (
    !record(value) ||
    !record(value.resize) ||
    !record(value.compression) ||
    !record(value.output)
  )
    throw new Error("This file does not contain image settings.");
  const r = value.resize;
  const c = value.compression;
  const o = value.output;
  if (
    !member(r.mode, [
      "none",
      "exact",
      "width",
      "height",
      "percentage",
      "maxWidth",
      "maxHeight",
      "fit",
      "fill",
      "crop",
    ]) ||
    typeof r.maintainAspectRatio !== "boolean" ||
    typeof r.preventUpscale !== "boolean"
  )
    throw new Error("Invalid resize settings.");
  for (const field of ["width", "height"] as const)
    if (r[field] !== undefined && !number(r[field], 1, 16384))
      throw new Error("Resize dimensions must be between 1 and 16,384 pixels.");
  if (r.percentage !== undefined && !number(r.percentage, 1, 1000))
    throw new Error("Invalid resize percentage.");
  let crop: ProcessingOptions["resize"]["crop"];
  if (r.crop !== undefined) {
    if (
      !record(r.crop) ||
      !number(r.crop.x, 0, 16384) ||
      !number(r.crop.y, 0, 16384) ||
      !number(r.crop.width, 1, 16384) ||
      !number(r.crop.height, 1, 16384)
    )
      throw new Error("Invalid crop rectangle.");
    crop = {
      x: r.crop.x,
      y: r.crop.y,
      width: r.crop.width,
      height: r.crop.height,
    };
  }
  if (
    !member(c.mode, ["smart", "quality", "lossless", "targetSize"]) ||
    !number(c.quality, 1, 100) ||
    !number(c.targetTolerance, 0, 0.5) ||
    typeof c.allowDownscaleForTarget !== "boolean"
  )
    throw new Error("Invalid compression settings.");
  if (
    c.targetBytes !== undefined &&
    !number(c.targetBytes, 1000, 128 * 1024 * 1024)
  )
    throw new Error("Invalid target file size.");
  if (c.pngPaletteColors !== undefined && !number(c.pngPaletteColors, 2, 256))
    throw new Error("Invalid PNG palette size.");
  if (c.pngPaletteColors !== undefined && !Number.isInteger(c.pngPaletteColors))
    throw new Error("PNG palette size must be a whole number.");
  if (c.mode === "targetSize" && c.targetBytes === undefined)
    throw new Error("Target-size presets need a target in bytes.");
  if (
    !member(o.format, ["keep", "auto", "jpeg", "png", "webp", "avif"]) ||
    !member(o.metadata, ["preserve", "removePersonal", "removeAll"]) ||
    typeof o.background !== "string" ||
    !/^#[0-9a-f]{6}$/i.test(o.background)
  )
    throw new Error("Invalid output settings.");
  if (o.encoder !== undefined && !member(o.encoder, ["browser", "wasm"]))
    throw new Error("Invalid encoder choice.");
  return {
    resize: {
      mode: r.mode as ProcessingOptions["resize"]["mode"],
      maintainAspectRatio: r.maintainAspectRatio,
      preventUpscale: r.preventUpscale,
      ...(typeof r.width === "number" ? { width: r.width } : {}),
      ...(typeof r.height === "number" ? { height: r.height } : {}),
      ...(typeof r.percentage === "number" ? { percentage: r.percentage } : {}),
      ...(crop ? { crop } : {}),
    },
    compression: {
      mode: c.mode as ProcessingOptions["compression"]["mode"],
      quality: c.quality,
      targetTolerance: c.targetTolerance,
      allowDownscaleForTarget: c.allowDownscaleForTarget,
      ...(typeof c.targetBytes === "number"
        ? { targetBytes: c.targetBytes }
        : {}),
      ...(typeof c.pngPaletteColors === "number"
        ? { pngPaletteColors: c.pngPaletteColors }
        : {}),
    },
    output: {
      format: o.format as ProcessingOptions["output"]["format"],
      metadata: o.metadata as ProcessingOptions["output"]["metadata"],
      background: o.background,
      ...(o.encoder === "browser" || o.encoder === "wasm"
        ? { encoder: o.encoder }
        : {}),
    },
  };
}
export function parsePresets(value: unknown): SavedPreset[] {
  if (
    !record(value) ||
    value.version !== 1 ||
    !Array.isArray(value.presets) ||
    value.presets.length > 50
  )
    throw new Error("Choose a ShrinkFox preset file with up to 50 presets.");
  const ids = new Set<string>();
  return value.presets.map((item: unknown) => {
    if (
      !record(item) ||
      typeof item.name !== "string" ||
      !item.name.trim() ||
      item.name.length > 80 ||
      typeof item.id !== "string" ||
      !/^[a-z0-9-]{1,80}$/i.test(item.id) ||
      ids.has(item.id)
    )
      throw new Error("Invalid or duplicate preset name or ID.");
    ids.add(item.id);
    return {
      id: item.id,
      name: item.name.trim(),
      options: parseOptions(item.options),
    };
  });
}
