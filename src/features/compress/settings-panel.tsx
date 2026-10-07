"use client";

import { useId, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { formatBytes, parseBytes } from "@/lib/bytes";
import { BUILT_IN_PRESETS, PRESET_GROUPS } from "@/lib/presets";
import {
  Field,
  Segmented,
  Select,
  Slider,
  Switch,
  TextInput,
} from "@/components/ui/controls";
import { DoodleIcon } from "@/components/ui/doodle-icon";
import { ColorWheel } from "@/components/ui/color-wheel";
import { useCapabilities } from "@/hooks/use-capabilities";
import { setOptions, useQueueOptions } from "@/stores/queue-store";
import { FORMAT_LABEL, OUTPUT_FORMATS, type OutputFormat } from "@/types/image";
import type {
  CompressionMode,
  FormatChoice,
  MetadataPolicy,
  ResizeMode,
} from "@/types/options";
import { SavedPresets } from "./saved-presets";

const TARGET_PRESETS = [100_000, 200_000, 500_000, 1_000_000];

/**
 * The full control surface.
 *
 * Two rules shape this panel:
 *
 *  - A control that cannot work is disabled and says why, rather than being
 *    hidden or — worse — offered and then failing. AVIF is the live example:
 *    it is only selectable once the codec probe confirms this browser can
 *    encode it.
 *  - Controls that do not apply to the current mode are not rendered at all,
 *    so the panel never shows a quality slider that silently does nothing.
 */
export function SettingsPanel({ className }: { className?: string }) {
  const options = useQueueOptions();
  const support = useCapabilities();
  const [targetText, setTargetText] = useState("500 KB");
  const [presetId, setPresetId] = useState("");
  const presetInputId = useId();
  const backgroundColorInputId = useId();
  const selectedPreset = BUILT_IN_PRESETS.find(
    (preset) => preset.id === presetId,
  );

  const formatOptions = useMemo(() => {
    const entries: Array<{
      value: FormatChoice;
      label: string;
      disabled?: boolean;
    }> = [
      { value: "keep", label: "Keep original" },
      { value: "auto", label: "Auto (smallest)" },
    ];
    for (const format of OUTPUT_FORMATS) {
      const usable = (options.output.encoder === "wasm" && (format === "jpeg" || format === "webp")) || (support?.encode[format] ?? false);
      entries.push({
        value: format,
        label: usable
          ? FORMAT_LABEL[format]
          : `${FORMAT_LABEL[format]} — not supported here`,
        disabled: !usable,
      });
    }
    return entries;
  }, [support, options.output.encoder]);

  const { compression, resize, output } = options;
  const needsDimensions =
    resize.mode !== "none" && resize.mode !== "percentage";
  const needsBothDimensions =
    resize.mode === "exact" || resize.mode === "fit" || resize.mode === "fill";

  return (
    <div
      className={cn(
        "min-w-0 space-y-6 [&_input]:min-h-11 [&_input]:text-base [&_select]:min-h-11 [&_select]:text-base sm:[&_input]:text-sm sm:[&_select]:text-sm",
        className,
      )}
    >
      {/* ---- Presets ---- */}
      <Field
        label="Starting preset"
        htmlFor={presetInputId}
        hint={
          selectedPreset
            ? `${selectedPreset.description}. You can adjust every setting below.`
            : "Choose a preset for your project, or adjust the settings below."
        }
      >
        <select
          id={presetInputId}
          aria-label="Starting preset"
          value={presetId}
          onChange={(event) => {
            const preset = BUILT_IN_PRESETS.find(
              (item) => item.id === event.target.value,
            );
            setPresetId(event.target.value);
            if (preset) {
              setOptions(() => preset.options);
              setTargetText(
                formatBytes(preset.options.compression.targetBytes ?? 500_000),
              );
            }
          }}
          className="h-12 w-full min-w-0 cursor-pointer rounded-xl border border-line bg-surface px-3 text-ink outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/15"
        >
          <option value="">Custom settings</option>
          {PRESET_GROUPS.filter((group) => group.id !== "custom").map(
            (group) => (
              <optgroup key={group.id} label={group.label}>
                {BUILT_IN_PRESETS.filter(
                  (preset) => preset.group === group.id,
                ).map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </optgroup>
            ),
          )}
        </select>
        <SavedPresets />
        <label className="mt-3 block text-sm">Encoder
          <select aria-label="Image encoder" value={output.encoder ?? "browser"} onChange={(event) => setOptions((current) => ({ ...current, output: { ...current.output, encoder: event.target.value === "wasm" ? "wasm" : "browser" } }))} className="mt-2 h-11 w-full rounded-xl border border-line bg-surface px-3">
            <option value="browser">Browser — faster, no extra download</option><option value="wasm">Advanced — MozJPEG / libwebp</option>
          </select>
        </label>
        <p className="mt-2 text-xs leading-5 text-muted">Advanced downloads an open-source encoder when JPEG or WebP is first exported. Up to 12 MP; other formats use the browser. Check quality and file size before keeping a result.</p>
      </Field>

      {/* ---- Compression ---- */}
      <Field label="Compression">
        <Segmented<CompressionMode>
          label="Compression mode"
          value={compression.mode}
          onChange={(mode) =>
            setOptions((prev) => ({
              ...prev,
              compression: { ...prev.compression, mode },
            }))
          }
          options={[
            { value: "smart", label: "Smart" },
            { value: "quality", label: "Quality" },
            { value: "lossless", label: "Lossless" },
            { value: "targetSize", label: "Target" },
          ]}
          size="sm"
          className="[&>button]:min-h-11 [&>button]:min-w-0"
        />

        {compression.mode === "smart" && (
          <p className="mt-3 text-[12.5px] leading-snug text-muted">
            Automatic quality for each image. A good starting point for most
            photos and graphics.
          </p>
        )}

        {compression.mode === "quality" && (
          <div className="mt-3">
            <Slider
              label="Quality"
              value={compression.quality}
              min={1}
              max={100}
              onChange={(quality) =>
                setOptions((prev) => ({
                  ...prev,
                  compression: { ...prev.compression, quality },
                }))
              }
            />
          </div>
        )}

        {compression.mode === "lossless" && (
          <p className="mt-3 text-[12.5px] leading-snug text-muted">
            Saves your image as PNG without lossy compression, regardless of the
            selected format. Resizing still changes the pixels, and the file may
            be larger than your original.
          </p>
        )}

        {compression.mode === "targetSize" && (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {TARGET_PRESETS.map((bytes) => {
                const active = compression.targetBytes === bytes;
                return (
                  <button
                    key={bytes}
                    type="button"
                    onClick={() => {
                      setTargetText(formatBytes(bytes));
                      setOptions((prev) => ({
                        ...prev,
                        compression: {
                          ...prev.compression,
                          targetBytes: bytes,
                        },
                      }));
                    }}
                    className={cn(
                      "min-h-11 rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "border-accent bg-accent text-on-accent"
                        : "border-line bg-surface text-ink-2 hover:border-line-strong",
                    )}
                  >
                    {formatBytes(bytes)}
                  </button>
                );
              })}
            </div>

            <TextInput
              value={targetText}
              aria-label="Custom target size"
              placeholder="e.g. 450 KB"
              onChange={(e) => {
                setTargetText(e.target.value);
                const bytes = parseBytes(e.target.value);
                if (bytes) {
                  setOptions((prev) => ({
                    ...prev,
                    compression: { ...prev.compression, targetBytes: bytes },
                  }));
                }
              }}
            />

            <Switch
              label="Reduce dimensions if needed"
              hint="When quality alone cannot reach the target, shrink the image too."
              checked={compression.allowDownscaleForTarget}
              onChange={(allowDownscaleForTarget) =>
                setOptions((prev) => ({
                  ...prev,
                  compression: { ...prev.compression, allowDownscaleForTarget },
                }))
              }
            />

            <p className="flex gap-2 rounded-xl bg-warn-soft px-3 py-2.5 text-[12px] leading-snug text-warn">
              <DoodleIcon name="info" size={14} className="mt-px shrink-0" />
              Some images will not fit your limit with these settings. If the
              target cannot be reached, you will see the closest result and its
              actual file size. Check the image before downloading.
            </p>
          </div>
        )}
      </Field>

      {/* ---- Resize ---- */}
      <Field label="Resize">
        <Select<ResizeMode>
          label="Resize mode"
          value={resize.mode}
          onChange={(mode) =>
            setOptions((prev) => ({
              ...prev,
              resize: { ...prev.resize, mode },
            }))
          }
          options={[
            { value: "none", label: "Original size" },
            { value: "maxWidth", label: "Max width" },
            { value: "maxHeight", label: "Max height" },
            { value: "width", label: "Exact width" },
            { value: "height", label: "Exact height" },
            { value: "percentage", label: "Percentage" },
            { value: "fit", label: "Fit inside box" },
            { value: "fill", label: "Fill box (crop)" },
            { value: "exact", label: "Exact dimensions" },
          ]}
        />

        {resize.mode === "percentage" && (
          <div className="mt-3">
            <Slider
              label="Scale"
              suffix="%"
              min={5}
              max={200}
              value={resize.percentage ?? 100}
              onChange={(percentage) =>
                setOptions((prev) => ({
                  ...prev,
                  resize: { ...prev.resize, percentage },
                }))
              }
            />
          </div>
        )}

        {needsDimensions && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <TextInput
              type="number"
              min={1}
              suffix="px"
              aria-label="Width"
              placeholder="Width"
              value={resize.width ?? ""}
              onChange={(e) =>
                setOptions((prev) => ({
                  ...prev,
                  resize: {
                    ...prev.resize,
                    width: e.target.value ? Number(e.target.value) : undefined,
                  },
                }))
              }
            />
            <TextInput
              type="number"
              min={1}
              suffix="px"
              aria-label="Height"
              placeholder="Height"
              disabled={
                !needsBothDimensions &&
                resize.mode !== "maxHeight" &&
                resize.mode !== "height"
              }
              value={resize.height ?? ""}
              onChange={(e) =>
                setOptions((prev) => ({
                  ...prev,
                  resize: {
                    ...prev.resize,
                    height: e.target.value ? Number(e.target.value) : undefined,
                  },
                }))
              }
            />
          </div>
        )}

        {resize.mode !== "none" && (
          <div className="mt-4 space-y-3">
            <Switch
              label="Keep aspect ratio"
              hint="Keeps the image in proportion. Turn off to stretch it."
              checked={resize.maintainAspectRatio}
              onChange={(maintainAspectRatio) =>
                setOptions((prev) => ({
                  ...prev,
                  resize: { ...prev.resize, maintainAspectRatio },
                }))
              }
            />
            <Switch
              label="Never enlarge"
              hint="Keeps smaller images at their original size."
              checked={resize.preventUpscale}
              onChange={(preventUpscale) =>
                setOptions((prev) => ({
                  ...prev,
                  resize: { ...prev.resize, preventUpscale },
                }))
              }
            />
          </div>
        )}
      </Field>

      {/* ---- Output ---- */}
      <Field
        label="Output format"
        hint={
          support
            ? undefined
            : "Checking which formats this browser can write..."
        }
      >
        <Select<FormatChoice>
          label="Output format"
          value={output.format}
          disabled={!support}
          onChange={(format) =>
            setOptions((prev) => ({
              ...prev,
              output: { ...prev.output, format },
            }))
          }
          options={formatOptions}
        />

        {isOpaqueFormat(output.format) && (
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-line bg-surface-3 px-3 py-2.5">
            <label
              htmlFor={backgroundColorInputId}
              className="flex-1 text-[12.5px] leading-snug text-muted"
            >
              JPEG cannot store transparency. Transparent areas are filled with
              this colour.
            </label>
            <div className="relative grid size-14 shrink-0 place-items-center rounded-full transition-transform duration-200 hover:scale-105 focus-within:ring-2 focus-within:ring-accent/40 focus-within:ring-offset-2 focus-within:ring-offset-surface-3 motion-reduce:transform-none">
              <ColorWheel color={output.background} />
              <input
                id={backgroundColorInputId}
                type="color"
                aria-label="Background colour for transparent areas"
                title={`Choose background colour (${output.background.toUpperCase()})`}
                value={output.background}
                onChange={(e) =>
                  setOptions((prev) => ({
                    ...prev,
                    output: { ...prev.output, background: e.target.value },
                  }))
                }
                className="absolute inset-0 z-10 size-full cursor-pointer opacity-0"
              />
            </div>
          </div>
        )}
      </Field>

      {/* ---- Metadata ---- */}
      <Field label="Metadata">
        <Select<MetadataPolicy>
          label="Metadata policy"
          value={output.metadata}
          onChange={(metadata) =>
            setOptions((prev) => ({
              ...prev,
              output: { ...prev.output, metadata },
            }))
          }
          options={[
            { value: "preserve", label: "Keep source EXIF and location" },
            { value: "removePersonal", label: "Remove personal EXIF" },
            { value: "removeAll", label: "Remove all source EXIF" },
          ]}
        />
        <p className="mt-2.5 flex gap-2 text-[12px] leading-snug text-muted">
          <DoodleIcon
            name="lock"
            size={13}
            className="mt-px shrink-0 text-success"
          />
          {output.metadata === "preserve"
            ? "Keeps camera details, which may include the date, device and location."
            : output.metadata === "removePersonal"
              ? "Removes camera details and keeps only the information needed for the correct orientation."
              : "Removes the original EXIF data. The browser may still add basic file-format information."}
        </p>
        <p className="mt-2 text-[12px] leading-snug text-faint">
          These settings apply to JPEG files. ShrinkFox exports WebP, AVIF and
          PNG without the original EXIF data.
        </p>
      </Field>
    </div>
  );
}

function isOpaqueFormat(choice: FormatChoice): boolean {
  return choice === ("jpeg" satisfies OutputFormat);
}
