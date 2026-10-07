"use client";

import { formatBytes, savingsPercent } from "@/lib/bytes";
import { baseName, withExtension } from "@/lib/format";
import { createZip, streamZip, deflateText, uniqueNames, type ZipEntry } from "@/lib/zip";
import { EXTENSION_BY_FORMAT, FORMAT_LABEL } from "@/types/image";
import type { ImageJob } from "@/types/job";

/**
 * Saving results to disk.
 *
 * Downloads are driven by an anchor with a `download` attribute and an object
 * URL. No upload, no server round trip, nothing leaves the page.
 */

/** Triggers a browser download and releases the object URL afterwards. */
export function saveBlob(blob: Blob, filename: string): void {
  const name = uniqueNames([filename])[0]!;
  // Keep the name on both the File and anchor, including browser download bridges.
  const file = new File([blob], name, { type: blob.type || "application/octet-stream" });
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Revoking synchronously can cancel the download in Safari; one frame of
  // delay is enough for the fetch of the blob URL to have started.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/* -------------------------------------------------------------------------- */
/* Naming                                                                      */
/* -------------------------------------------------------------------------- */

export const RENAME_TOKENS = [
  { token: "{original}", description: "Original filename with extension" },
  { token: "{name}", description: "Original filename without extension" },
  { token: "{index}", description: "Position in the batch, zero-padded" },
  { token: "{width}", description: "Output width in pixels" },
  { token: "{height}", description: "Output height in pixels" },
  { token: "{format}", description: "Output format, e.g. webp" },
] as const;

/**
 * Applies a rename pattern to one job.
 *
 * An empty or whitespace-only pattern falls back to the original name, so a
 * half-typed pattern can never produce a batch of files called ".webp".
 */
export function renameJob(job: ImageJob, pattern: string, index: number, total: number): string {
  const result = job.result;
  const extension = result
    ? EXTENSION_BY_FORMAT[result.output.format]
    : (job.file.name.split(".").pop() ?? "img");

  if (!pattern.trim()) return withExtension(job.file.name, extension);

  // Pad to the width of the largest index so names sort correctly in a file
  // manager: product-002 before product-010.
  const pad = String(total).length;

  const substituted = pattern
    .replaceAll("{original}", job.file.name)
    .replaceAll("{name}", baseName(job.file.name))
    .replaceAll("{index}", String(index + 1).padStart(pad, "0"))
    .replaceAll("{width}", String(result?.output.dimensions.width ?? ""))
    .replaceAll("{height}", String(result?.output.dimensions.height ?? ""))
    .replaceAll("{format}", extension)
    // Strip anything the OS would reject in a filename.
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .trim();

  return substituted.toLowerCase().endsWith(`.${extension}`)
    ? substituted
    : `${substituted}.${extension}`;
}

/* -------------------------------------------------------------------------- */
/* Manifest                                                                    */
/* -------------------------------------------------------------------------- */

/** CSV because it opens in any spreadsheet without an import step. */
export function buildManifest(jobs: ImageJob[], names: string[]): string {
  const rows = [
    [
      "output_file",
      "original_file",
      "original_bytes",
      "output_bytes",
      "saved_bytes",
      "saved_percent",
      "original_dimensions",
      "output_dimensions",
      "original_format",
      "output_format",
      "quality",
    ].join(","),
  ];

  jobs.forEach((job, i) => {
    const result = job.result;
    if (!result) return;
    const saved = job.file.size - result.output.size;
    const cell = (value: string | number) => {
      if (typeof value === "number") return String(value);
      // Quoting alone does not stop Excel/Sheets from executing a filename as
      // a formula. Prefix formula-like text before RFC 4180 CSV escaping.
      const safe = /^\s*[=+\-@]/.test(value) || /^[\t\r]/.test(value) ? `'${value}` : value;
      return `"${safe.replaceAll('"', '""')}"`;
    };

    rows.push(
      [
        cell(names[i] ?? ""),
        cell(job.file.name),
        job.file.size,
        result.output.size,
        saved,
        savingsPercent(job.file.size, result.output.size).toFixed(2),
        cell(
          job.input ? `${job.input.dimensions.width}x${job.input.dimensions.height}` : "",
        ),
        cell(`${result.output.dimensions.width}x${result.output.dimensions.height}`),
        cell(job.input ? FORMAT_LABEL[job.input.format] : ""),
        cell(FORMAT_LABEL[result.output.format]),
        result.output.quality ?? "",
      ].join(","),
    );
  });

  return rows.join("\r\n");
}

/* -------------------------------------------------------------------------- */
/* Downloads                                                                   */
/* -------------------------------------------------------------------------- */

export function downloadJob(job: ImageJob, pattern = "", index = 0, total = 1): void {
  if (!job.result) return;
  saveBlob(job.result.output.blob, renameJob(job, pattern, index, total));
}

export type ZipOptions = {
  pattern?: string;
  includeManifest?: boolean;
  archiveName?: string;
  onProgress?: (done: number, total: number) => void;
  streamToDisk?: boolean;
};

export async function downloadZip(jobs: ImageJob[], options: ZipOptions = {}): Promise<void> {
  const completed = jobs.filter((job) => job.result !== null);
  if (completed.length === 0) return;

  const pattern = options.pattern ?? "";
  const names = uniqueNames(
    completed.map((job, i) => renameJob(job, pattern, i, completed.length)),
  );

  const entries: ZipEntry[] = completed.map((job, i) => ({
    name: names[i]!,
    data: job.result!.output.blob,
  }));

  if (options.includeManifest !== false) {
    entries.push({
      name: "shrinkfox-report.csv",
      data: new Blob([buildManifest(completed, names)], { type: "text/csv" }),
    });
  }

  const picker = (window as unknown as { showSaveFilePicker?: (options: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<{ createWritable: () => Promise<FileSystemWritableFileStream> }> }).showSaveFilePicker;
  if (options.streamToDisk && picker) {
    let writable: FileSystemWritableFileStream | undefined;
    try {
      const handle = await picker.call(window, { suggestedName: options.archiveName ?? defaultArchiveName(completed), types: [{ description: "ZIP archive", accept: { "application/zip": [".zip"] } }] });
      writable = await handle.createWritable();
      const destination = writable;
      await streamZip(entries, { write: async (chunk) => destination.write(chunk) }, options.onProgress);
      await writable.close();
    } catch (cause) { if (writable) await writable.abort().catch(() => {}); if (cause instanceof DOMException && cause.name === "AbortError") return; throw cause; }
    return;
  }
  const zip = await createZip(entries, options.onProgress);
  saveBlob(zip, options.archiveName ?? defaultArchiveName(completed));
}

function defaultArchiveName(jobs: ImageJob[]): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `shrinkfox-${jobs.length}-images-${stamp}.zip`;
}

/** Summary line used in the success state and the share copy. */
export function savingsSummary(jobs: ImageJob[]): string {
  let original = 0;
  let output = 0;
  for (const job of jobs) {
    if (!job.result) continue;
    original += job.file.size;
    output += job.result.output.size;
  }
  if (original === 0) return "";
  return `${formatBytes(original)} to ${formatBytes(output)}`;
}

/** Exposed so the manifest helper stays importable from tests without a DOM. */
export { deflateText };
