"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import { DoodleIcon } from "@/components/ui/doodle-icon";
import { DEFAULT_OPTIONS } from "@/types/options";
import type { OutputFormat } from "@/types/image";
import { runImageOperation } from "@/services/image-operation";
import { runStudioOperation } from "@/services/studio-service";
import { createZip, type ZipEntry } from "@/lib/zip";
import { saveBlob } from "@/services/download-service";

interface Variant {
  id: string;
  name: string;
  width: number;
  height: number;
  fit: "fit" | "fill";
  format: OutputFormat;
  quality: number;
}
const recipes: Record<string, Omit<Variant, "id">[]> = {
  shop: [
    {
      name: "product-thumbnail",
      width: 400,
      height: 400,
      fit: "fill",
      format: "webp",
      quality: 82,
    },
    {
      name: "product-detail",
      width: 1200,
      height: 1200,
      fit: "fit",
      format: "webp",
      quality: 85,
    },
    {
      name: "website-card",
      width: 1200,
      height: 630,
      fit: "fill",
      format: "jpeg",
      quality: 82,
    },
  ],
  social: [
    {
      name: "square-post",
      width: 1080,
      height: 1080,
      fit: "fill",
      format: "jpeg",
      quality: 85,
    },
    {
      name: "portrait-post",
      width: 1080,
      height: 1350,
      fit: "fill",
      format: "jpeg",
      quality: 85,
    },
    {
      name: "story",
      width: 1080,
      height: 1920,
      fit: "fill",
      format: "jpeg",
      quality: 85,
    },
  ],
  website: [
    {
      name: "small-card",
      width: 480,
      height: 320,
      fit: "fill",
      format: "webp",
      quality: 78,
    },
    {
      name: "article-image",
      width: 1200,
      height: 800,
      fit: "fit",
      format: "webp",
      quality: 82,
    },
    {
      name: "social-preview",
      width: 1200,
      height: 630,
      fit: "fill",
      format: "jpeg",
      quality: 82,
    },
  ],
};
const variantsFor = (name: string) =>
  (recipes[name] ?? recipes.shop ?? []).map((variant, index) => ({
    ...variant,
    id: `${name}-${index}`,
  }));
export function ExportRecipes() {
  const [variants, setVariants] = useState<Variant[]>(() =>
    variantsFor("shop"),
  );
  const [source, setSource] = useState<{
    file: File;
    width: number;
    height: number;
    url: string;
  } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const active = useRef<AbortController | null>(null);
  const url = useRef<string | null>(null);
  useLayoutEffect(
    () => () => {
      active.current?.abort();
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = null;
      setSource(null);
      setProgress(null);
    },
    [],
  );
  const busy = progress !== null;
  function update(id: string, patch: Partial<Variant>) {
    setVariants((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }
  async function choose(file: File | undefined) {
    if (!file) return;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setProgress(0);
    setMessage("Opening your photo…");
    try {
      const image = await runStudioOperation(
        { type: "inspect", file },
        controller.signal,
        (value) => setProgress(value.fraction),
      );
      if (controller.signal.aborted) return;
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = URL.createObjectURL(image.blob);
      setSource({
        file,
        width: image.width,
        height: image.height,
        url: url.current,
      });
      setMessage(
        "Your photo is ready. Check each export size before downloading.",
      );
    } catch (cause) {
      if (!controller.signal.aborted)
        setMessage(
          cause instanceof Error ? cause.message : "This photo could not open.",
        );
    } finally {
      if (active.current === controller) {
        active.current = null;
        setProgress(null);
      }
    }
  }
  async function exportAll() {
    if (!source || busy) return;
    if (
      variants.some(
        (item) =>
          !item.name.trim() ||
          !Number.isInteger(item.width) ||
          !Number.isInteger(item.height) ||
          item.width < 1 ||
          item.height < 1 ||
          item.width > 8192 ||
          item.height > 8192 ||
          item.width * item.height > 24_000_000,
      )
    ) {
      setMessage(
        "Give each variant a name and dimensions from 1 to 8,192 pixels, up to 24 MP.",
      );
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    setProgress(0);
    const entries: ZipEntry[] = [];
    const report: string[] = [];
    try {
      for (const [index, variant] of variants.entries()) {
        setMessage(`Making ${variant.name} (${index + 1}/${variants.length})…`);
        try {
          const output = await runImageOperation(
            source.file,
            {
              ...DEFAULT_OPTIONS,
              resize: {
                mode: variant.fit,
                width: variant.width,
                height: variant.height,
                maintainAspectRatio: true,
                preventUpscale: true,
              },
              compression: {
                ...DEFAULT_OPTIONS.compression,
                mode: "quality",
                quality: variant.quality,
              },
              output: { ...DEFAULT_OPTIONS.output, format: variant.format },
            },
            controller.signal,
            (value) => setProgress((index + value) / variants.length),
          );
          const safeName =
            variant.name
              .trim()
              .replace(/[^a-z0-9_-]+/gi, "-")
              .slice(0, 80) || `image-${index + 1}`;
          const retainedBytes = entries.reduce(
            (total, entry) => total + entry.data.size,
            0,
          );
          if (retainedBytes + output.result.output.size > 128 * 1024 * 1024)
            throw new Error(
              "This recipe exceeds the 128 MiB output budget. Use fewer variants, smaller dimensions or JPEG/WebP.",
            );
          entries.push({
            name: `${safeName}.${variant.format === "jpeg" ? "jpg" : variant.format}`,
            data: output.result.output.blob,
          });
          report.push(
            `${safeName}: ${output.result.output.dimensions.width} × ${output.result.output.dimensions.height} pixels; ${output.result.output.size} bytes.`,
          );
        } catch (cause) {
          if (controller.signal.aborted) throw cause;
          report.push(
            `${variant.name}: not exported — ${cause instanceof Error ? cause.message : "processing failed"}.`,
          );
        }
      }
      if (!entries.length) throw new Error(report.join(" "));
      entries.push({
        name: "export-report.txt",
        data: new Blob([report.join("\n")], { type: "text/plain" }),
      });
      setMessage("Packing your downloads…");
      const archive = await createZip(entries);
      if (controller.signal.aborted) return;
      saveBlob(
        archive,
        `${source.file.name.replace(/\.[^.]+$/, "")}-variants.zip`,
      );
      setMessage(
        `Downloaded ${entries.length - 1} variants. The ZIP includes a report with actual sizes and any skipped exports.`,
      );
    } catch (cause) {
      setMessage(
        controller.signal.aborted
          ? "Export cancelled. Your original is unchanged."
          : cause instanceof Error
            ? cause.message
            : "The exports could not finish.",
      );
    } finally {
      if (active.current === controller) {
        active.current = null;
        setProgress(null);
      }
    }
  }
  return (
    <div className="sf-card-flat p-5 md:p-8">
      <div className="flex flex-wrap items-center gap-4">
        <DoodleIcon name="layers" size={48} />
        <label className="sf-button-primary cursor-pointer rounded-full bg-accent px-5 py-3 text-on-accent">
          Choose photo
          <input
            disabled={busy}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif,image/gif,image/bmp"
            className="sr-only"
            onChange={(event) => {
              void choose(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
        <label>
          Start with{" "}
          <select
            disabled={busy}
            className="ml-2 rounded-xl border border-line bg-surface p-3"
            defaultValue="shop"
            onChange={(event) => setVariants(variantsFor(event.target.value))}
          >
            <option value="shop">Product photos</option>
            <option value="social">Social posts</option>
            <option value="website">Website images</option>
          </select>
        </label>
      </div>
      {source && (
        <div className="my-5 flex items-center gap-4">
          <Image
            src={source.url}
            alt={`Preview of ${source.file.name}`}
            width={100}
            height={100}
            unoptimized
            className="size-24 rounded-xl object-contain"
          />
          <p className="min-w-0 break-all text-sm">
            {source.file.name}
            <br />
            {source.width} × {source.height} px. Small images stay small; these
            exports do not enlarge them.
          </p>
        </div>
      )}
      <fieldset disabled={busy} className="mt-5 space-y-4">
        <legend className="sr-only">Editable export variants</legend>
        {variants.map((variant, index) => (
          <div key={variant.id} className="rounded-2xl border border-line p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <label className="text-xs text-muted">
                Name
                <input
                  aria-label={`Variant ${index + 1} name`}
                  maxLength={80}
                  value={variant.name}
                  onChange={(event) =>
                    update(variant.id, { name: event.target.value })
                  }
                  className="mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink"
                />
              </label>
              {(["width", "height"] as const).map((dimension) => (
                <label
                  key={dimension}
                  className="text-xs capitalize text-muted"
                >
                  {dimension} (px)
                  <input
                    aria-label={`Variant ${index + 1} ${dimension}`}
                    type="number"
                    min="1"
                    max="8192"
                    value={variant[dimension]}
                    onChange={(event) =>
                      update(variant.id, {
                        [dimension]: Number(event.target.value),
                      })
                    }
                    className="mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink"
                  />
                </label>
              ))}
              <label className="text-xs text-muted">
                Fit
                <select
                  aria-label={`Variant ${index + 1} fit`}
                  value={variant.fit}
                  onChange={(event) =>
                    update(variant.id, {
                      fit: event.target.value === "fill" ? "fill" : "fit",
                    })
                  }
                  className="mt-1 h-11 w-full rounded-xl border border-line bg-surface px-2 text-sm text-ink"
                >
                  <option value="fit">Fit whole photo</option>
                  <option value="fill">Fill & crop</option>
                </select>
              </label>
              <label className="text-xs text-muted">
                Format
                <select
                  aria-label={`Variant ${index + 1} format`}
                  value={variant.format}
                  onChange={(event) =>
                    update(variant.id, {
                      format: event.target.value as OutputFormat,
                    })
                  }
                  className="mt-1 h-11 w-full rounded-xl border border-line bg-surface px-2 text-sm text-ink"
                >
                  <option value="jpeg">JPEG</option>
                  <option value="png">PNG</option>
                  <option value="webp">WebP</option>
                </select>
              </label>
              <label className="text-xs text-muted">
                Quality {variant.quality}
                <input
                  aria-label={`Variant ${index + 1} quality`}
                  type="range"
                  min="1"
                  max="100"
                  value={variant.quality}
                  onChange={(event) =>
                    update(variant.id, { quality: Number(event.target.value) })
                  }
                  className="sf-range mt-1 h-11 w-full"
                />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap justify-between gap-2">
              {source &&
                (source.width < variant.width ||
                  source.height < variant.height) && (
                  <p className="text-xs text-accent">
                    This source is smaller than the requested box. Actual output
                    may be smaller to avoid blur.
                  </p>
                )}
              <button
                type="button"
                disabled={variants.length <= 1}
                onClick={() =>
                  setVariants((items) =>
                    items.filter((item) => item.id !== variant.id),
                  )
                }
                className="min-h-11 text-xs text-muted"
              >
                Remove variant
              </button>
            </div>
          </div>
        ))}
      </fieldset>
      <div className="mt-5 flex flex-wrap gap-4">
        <button
          disabled={busy || variants.length >= 20}
          type="button"
          className="min-h-11 rounded-full border border-line px-4"
          onClick={() =>
            setVariants((items) => [
              ...items,
              {
                id: crypto.randomUUID(),
                name: `variant-${items.length + 1}`,
                width: 800,
                height: 800,
                fit: "fit",
                format: "webp",
                quality: 82,
              },
            ])
          }
        >
          Add variant
        </button>
        <button
          type="button"
          disabled={!source}
          className="min-h-11 rounded-full bg-accent px-5 text-on-accent"
          onClick={() => {
            if (busy) active.current?.abort();
            else void exportAll();
          }}
        >
          {busy ? "Cancel export" : "Download variants ZIP"}
        </button>
      </div>
      {progress !== null && (
        <progress
          value={progress}
          max="1"
          className="mt-4 w-full"
          aria-label="Recipe export progress"
        />
      )}
      {message && (
        <p role="status" className="mt-4 text-sm text-muted">
          {message}
        </p>
      )}
    </div>
  );
}
