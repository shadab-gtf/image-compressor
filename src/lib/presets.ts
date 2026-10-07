import { DEFAULT_OPTIONS, type Preset, type ProcessingOptions } from "@/types/options";

/**
 * Built-in presets.
 *
 * Each one encodes a real delivery constraint rather than a vague mood. The
 * dimensions are practical starting points, not guarantees of platform upload
 * acceptance. The engine still reports when a byte target cannot be met.
 */

function preset(
  id: string,
  name: string,
  group: Preset["group"],
  description: string,
  overrides: Partial<{
    resize: Partial<ProcessingOptions["resize"]>;
    compression: Partial<ProcessingOptions["compression"]>;
    output: Partial<ProcessingOptions["output"]>;
  }>,
): Preset {
  return {
    id,
    name,
    group,
    description,
    builtIn: true,
    options: {
      resize: { ...DEFAULT_OPTIONS.resize, ...overrides.resize },
      compression: { ...DEFAULT_OPTIONS.compression, ...overrides.compression },
      output: { ...DEFAULT_OPTIONS.output, ...overrides.output },
    },
  };
}

export const BUILT_IN_PRESETS: Preset[] = [
  /* -- Website --------------------------------------------------------- */
  preset("web-hero", "Web hero", "website", "Full-width banner, 2400px wide", {
    resize: { mode: "maxWidth", width: 2400 },
    compression: { mode: "quality", quality: 76 },
    output: { format: "webp" },
  }),
  preset("blog-image", "Blog image", "website", "In-article image, 1600px wide", {
    resize: { mode: "maxWidth", width: 1600 },
    compression: { mode: "quality", quality: 78 },
    output: { format: "webp" },
  }),
  preset("thumbnail", "Thumbnail", "website", "Small preview, 400px wide", {
    resize: { mode: "maxWidth", width: 400 },
    compression: { mode: "quality", quality: 72 },
    output: { format: "webp" },
  }),
  preset("background", "Background", "website", "Large backdrop, heavier compression", {
    resize: { mode: "maxWidth", width: 2560 },
    compression: { mode: "quality", quality: 62 },
    output: { format: "webp" },
  }),

  /* -- Ecommerce ------------------------------------------------------- */
  preset("product", "Product image", "ecommerce", "Square 2000px, detail preserved", {
    resize: { mode: "fill", width: 2000, height: 2000 },
    compression: { mode: "quality", quality: 84 },
    output: { format: "webp", background: "#FFFFFF" },
  }),
  preset("product-thumb", "Product thumbnail", "ecommerce", "Square 600px grid cell", {
    resize: { mode: "fill", width: 600, height: 600 },
    compression: { mode: "quality", quality: 76 },
    output: { format: "webp", background: "#FFFFFF" },
  }),
  preset("marketplace", "Marketplace", "ecommerce", "Under 500 KB, 1600px — common limit", {
    resize: { mode: "maxWidth", width: 1600 },
    compression: { mode: "targetSize", targetBytes: 500_000 },
    output: { format: "jpeg", background: "#FFFFFF" },
  }),

  /* -- Social ---------------------------------------------------------- */
  preset("ig-square", "Instagram square", "social", "1080 x 1080", {
    resize: { mode: "fill", width: 1080, height: 1080 },
    compression: { mode: "quality", quality: 82 },
    output: { format: "jpeg" },
  }),
  preset("ig-portrait", "Instagram portrait", "social", "1080 x 1350", {
    resize: { mode: "fill", width: 1080, height: 1350 },
    compression: { mode: "quality", quality: 82 },
    output: { format: "jpeg" },
  }),
  preset("og-image", "OG image", "social", "1200 x 630 link preview", {
    resize: { mode: "fill", width: 1200, height: 630 },
    compression: { mode: "quality", quality: 82 },
    output: { format: "jpeg" },
  }),
  preset("linkedin", "LinkedIn", "social", "1200 x 627", {
    resize: { mode: "fill", width: 1200, height: 627 },
    compression: { mode: "quality", quality: 82 },
    output: { format: "jpeg" },
  }),
  preset("youtube", "YouTube thumbnail", "social", "1280 x 720, under 2 MB", {
    resize: { mode: "fill", width: 1280, height: 720 },
    compression: { mode: "targetSize", targetBytes: 2_000_000 },
    output: { format: "jpeg" },
  }),

  /* -- Developer ------------------------------------------------------- */
  preset("nextjs", "Next.js", "developer", "WebP at 1920px for next/image", {
    resize: { mode: "maxWidth", width: 1920 },
    compression: { mode: "quality", quality: 76 },
    output: { format: "webp" },
  }),
  preset("web-perf", "Web performance", "developer", "Smallest useful size, 1440px", {
    resize: { mode: "maxWidth", width: 1440 },
    compression: { mode: "quality", quality: 68 },
    output: { format: "webp" },
  }),
  preset("mobile", "Mobile", "developer", "720px for small screens", {
    resize: { mode: "maxWidth", width: 720 },
    compression: { mode: "quality", quality: 70 },
    output: { format: "webp" },
  }),
  preset("seo", "SEO", "developer", "Under 100 KB, 1200px", {
    resize: { mode: "maxWidth", width: 1200 },
    compression: { mode: "targetSize", targetBytes: 100_000 },
    output: { format: "webp" },
  }),
];

export const PRESET_GROUPS: Array<{ id: Preset["group"]; label: string }> = [
  { id: "website", label: "Website" },
  { id: "ecommerce", label: "Ecommerce" },
  { id: "social", label: "Social" },
  { id: "developer", label: "Developer" },
  { id: "custom", label: "Custom" },
];

/* -------------------------------------------------------------------------- */
/* Custom presets                                                              */
/* -------------------------------------------------------------------------- */

const STORAGE_KEY = "shrinkfox.presets";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validOptions(value: unknown): value is ProcessingOptions {
  if (!record(value) || !record(value.resize) || !record(value.compression) || !record(value.output)) return false;
  const { resize, compression, output } = value;
  const positive = (number: unknown) => typeof number === "number" && Number.isFinite(number) && number > 0;
  const optionalPositive = (number: unknown) => number === undefined || positive(number);
  if (typeof resize.mode !== "string" || !["none", "exact", "width", "height", "percentage", "maxWidth", "maxHeight", "fit", "fill", "crop"].includes(resize.mode) ||
      typeof resize.maintainAspectRatio !== "boolean" || typeof resize.preventUpscale !== "boolean" ||
      !optionalPositive(resize.width) || !optionalPositive(resize.height) || !optionalPositive(resize.percentage)) return false;
  if (resize.crop !== undefined && (!record(resize.crop) || !positive(resize.crop.width) || !positive(resize.crop.height) ||
      typeof resize.crop.x !== "number" || !Number.isFinite(resize.crop.x) || typeof resize.crop.y !== "number" || !Number.isFinite(resize.crop.y))) return false;
  if (typeof compression.mode !== "string" || !["smart", "quality", "lossless", "targetSize"].includes(compression.mode) ||
      typeof compression.quality !== "number" || !Number.isFinite(compression.quality) || compression.quality < 1 || compression.quality > 100 ||
      typeof compression.targetTolerance !== "number" || !Number.isFinite(compression.targetTolerance) || compression.targetTolerance < 0 || compression.targetTolerance > 1 ||
      typeof compression.allowDownscaleForTarget !== "boolean" || !optionalPositive(compression.targetBytes) ||
      (compression.mode === "targetSize" && !positive(compression.targetBytes)) ||
      (compression.pngPaletteColors !== undefined && (typeof compression.pngPaletteColors !== "number" || !Number.isInteger(compression.pngPaletteColors) || compression.pngPaletteColors < 2 || compression.pngPaletteColors > 256))) return false;
  return typeof output.format === "string" && ["keep", "auto", "jpeg", "png", "webp", "avif"].includes(output.format) &&
    typeof output.metadata === "string" && ["preserve", "removePersonal", "removeAll"].includes(output.metadata) &&
    typeof output.background === "string" && /^#[0-9a-f]{6}$/i.test(output.background);
}

/**
 * Custom presets live in localStorage — no account, no sync, no server.
 * A read failure is non-fatal: the user simply sees only the built-ins.
 */
export function loadCustomPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Shape-check each entry rather than trusting whatever is in storage; a
    // malformed preset would otherwise crash the settings panel on mount.
    return parsed.flatMap((item: unknown): Preset[] => {
      if (!record(item) || typeof item.id !== "string" || !item.id.trim() || typeof item.name !== "string" || !item.name.trim() || !validOptions(item.options)) return [];
      return [{ id: item.id, name: item.name, description: typeof item.description === "string" ? item.description : "Saved on this device", group: "custom", builtIn: false, options: item.options }];
    });
  } catch {
    return [];
  }
}

export function saveCustomPresets(presets: Preset[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets.filter((p) => !p.builtIn)));
  } catch {
    // Quota exceeded or storage blocked — the preset stays active this session.
  }
}

export function findPreset(id: string, custom: Preset[]): Preset | undefined {
  return BUILT_IN_PRESETS.find((p) => p.id === id) ?? custom.find((p) => p.id === id);
}
