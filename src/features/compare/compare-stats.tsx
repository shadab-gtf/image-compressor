"use client";

import { StatCard } from "@/components/ui/progress";
import { DoodleIcon } from "@/components/ui/doodle-icon";
import { formatBytes, formatPercent, savingsPercent } from "@/lib/bytes";
import { FORMAT_LABEL, mimeToFormat, type Dimensions } from "@/types/image";
import type { ImageJob } from "@/types/job";

function dimensionText(dimensions: Dimensions | null): string {
  if (!dimensions) return "size unknown";
  return `${dimensions.width} x ${dimensions.height}`;
}

export function CompareStats({
  job,
  originalDimensions,
}: {
  job: ImageJob;
  originalDimensions: Dimensions | null;
}) {
  const output = job.result?.output ?? null;
  const sourceFormat = job.input?.format ?? mimeToFormat(job.file.type);
  const sourceFormatLabel = sourceFormat
    ? FORMAT_LABEL[sourceFormat]
    : "Unknown";

  const saved = output ? savingsPercent(job.file.size, output.size) : 0;
  // A conversion can legitimately produce a bigger file, so growth gets its own
  // wording rather than being reported as a negative saving.
  const grew = saved < 0;
  const delta = output ? Math.abs(job.file.size - output.size) : 0;

  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <StatCard
        label="Original"
        value={formatBytes(job.file.size)}
        sub={`${dimensionText(originalDimensions)} · ${sourceFormatLabel}`}
      />
      <StatCard
        label="Output"
        value={output ? formatBytes(output.size) : "—"}
        sub={
          output
            ? `${dimensionText(output.dimensions)} · ${FORMAT_LABEL[output.format]}`
            : "Not compressed yet"
        }
        tone="accent"
      />
      <StatCard
        label={grew ? "Larger" : "Reduction"}
        value={output ? formatPercent(Math.abs(saved)) : "—"}
        sub={output ? `${grew ? "+" : "-"}${formatBytes(delta)}` : undefined}
        tone={output && !grew ? "success" : "default"}
      />
      <StatCard
        label="Quality"
        value={
          !output
            ? "—"
            : output.quality === null
              ? "Lossless"
              : String(output.quality)
        }
        sub={
          !output
            ? undefined
            : output.quality === null
              ? "No quality parameter"
              : "Encoder quality used"
        }
      />
    </div>
  );
}

export function CompareWarnings({ job }: { job: ImageJob }) {
  const result = job.result;
  if (!result) return null;

  const missedTarget = result.target && !result.target.reached;
  if (!missedTarget && !result.flattenedAlpha) return null;

  return (
    <div className="space-y-2">
      {missedTarget && result.target && (
        <Warning>
          <strong className="font-semibold">Target size not reached.</strong>{" "}
          {formatBytes(result.output.size)} is the closest this image could get
          to the requested {formatBytes(result.target.requestedBytes)} after{" "}
          {result.target.attempts}{" "}
          {result.target.attempts === 1 ? "attempt" : "attempts"}. Resizing the
          image as well usually closes the gap.
        </Warning>
      )}
      {result.flattenedAlpha && (
        <Warning>
          <strong className="font-semibold">Transparency was flattened.</strong>{" "}
          {FORMAT_LABEL[result.output.format]} cannot store an alpha channel, so
          transparent areas were composited onto the matte colour.
        </Warning>
      )}
    </div>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-xl border border-warn/20 bg-warn-soft px-3 py-2 text-[12.5px] leading-snug text-warn">
      <DoodleIcon name="info" size={15} className="mt-px shrink-0" />
      <span>{children}</span>
    </p>
  );
}
