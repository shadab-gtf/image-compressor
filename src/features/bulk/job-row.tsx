"use client";

import { memo } from "react";
import { JobThumbnail } from "./job-thumbnail";
import { cn } from "@/lib/cn";
import { formatBytes, savingsPercent } from "@/lib/bytes";
import { Badge, ProgressBar } from "@/components/ui/progress";
import { DoodleIcon } from "@/components/ui/doodle-icon";
import { downloadJob, renameJob } from "@/services/download-service";
import { cancelJob, startProcessing } from "@/services/processing-service";
import { removeJobs, requeue, setSelected } from "@/stores/queue-store";
import { FORMAT_LABEL } from "@/types/image";
import type { ImageJob } from "@/types/job";

/**
 * One file in the queue.
 *
 * Memoised on the job object. The store replaces only the jobs that actually
 * changed, so during a 500-file batch React re-renders the handful of rows that
 * are moving rather than the whole list on every progress tick.
 */
export const JobRow = memo(function JobRow({
  job,
  index,
  renamePattern,
  total,
  onPreview,
}: {
  job: ImageJob;
  index: number;
  renamePattern: string;
  total: number;
  onPreview: (job: ImageJob) => void;
}) {
  const result = job.result;
  const saved = result ? savingsPercent(job.file.size, result.output.size) : 0;
  // A conversion can legitimately produce a larger file — PNG to lossless WebP
  // on noisy photography, for instance. Saying "-12% smaller" would be absurd,
  // so growth gets its own wording.
  const grew = saved < 0;

  return (
    <li
      className={cn(
        "group flex h-[68px] items-center gap-2 rounded-2xl border px-2.5 py-2.5 transition-colors sm:gap-3 sm:px-4",
        job.status === "failed"
          ? "border-danger/25 bg-danger-soft/40"
          : "border-line bg-surface hover:border-line-strong",
      )}
    >
      <input
        type="checkbox"
        checked={job.selected}
        aria-label={`Select ${job.file.name}`}
        onChange={(e) => setSelected(job.id, e.target.checked)}
        className="size-5 shrink-0 cursor-pointer rounded accent-[var(--sf-accent)]"
      />

      {/* Thumbnail */}
      <JobThumbnail file={job.file} outputUrl={job.previewUrl} onPreview={() => onPreview(job)} />

      {/* Name and numbers */}
      <div className="min-w-0 flex-1">
        <p
          className="truncate text-[13.5px] font-medium text-ink"
          title={job.file.name}
        >
          {job.file.name}
        </p>

        {job.status === "processing" ? (
          <div className="mt-1.5 flex items-center gap-2">
            <ProgressBar
              value={job.progress}
              label={`Processing ${job.file.name}`}
            />
            <span className="shrink-0 text-[11.5px] tabular-nums text-muted">
              {Math.round(job.progress * 100)}%
            </span>
          </div>
        ) : job.status === "failed" && job.error ? (
          <p
            className="mt-0.5 truncate text-[12px] leading-snug text-danger"
            title={`${job.error.message} ${job.error.hint ?? ""}`}
          >
            {job.error.message}
            {job.error.hint && (
              <span className="text-danger/70"> {job.error.hint}</span>
            )}
          </p>
        ) : result ? (
          <p className="mt-0.5 flex items-center gap-x-1 text-xs text-muted sm:gap-x-1.5">
            <span>{formatBytes(job.file.size)}</span>
            <span aria-hidden>→</span>
            <span className="font-medium text-ink">
              {formatBytes(result.output.size)}
            </span>
            <span className="hidden text-faint md:inline">·</span>
            <span className="hidden tabular-nums md:inline">
              {result.output.dimensions.width} x{" "}
              {result.output.dimensions.height}
            </span>
            <span className="text-faint">·</span>
            <span>{FORMAT_LABEL[result.output.format]}</span>
          </p>
        ) : (
          <p className="mt-0.5 text-[12px] text-muted">
            {formatBytes(job.file.size)}
            {job.status === "cancelled" && " · cancelled"}
          </p>
        )}
      </div>

      {/* Outcome */}
      <div className="hidden shrink-0 items-center gap-2 sm:flex">
        {result?.target && !result.target.reached && (
          <Badge tone="warn" title="Closest achievable size">
            <DoodleIcon name="info" size={11} />
            Closest
          </Badge>
        )}
        {result?.flattenedAlpha && <Badge tone="warn">Flattened</Badge>}
        {result && (
          <Badge tone={grew ? "warn" : "success"}>
            {grew ? (
              `+${Math.abs(saved).toFixed(0)}% larger`
            ) : (
              <>
                <DoodleIcon name="check" size={11} />
                {saved.toFixed(0)}% smaller
              </>
            )}
          </Badge>
        )}
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-0.5">
        {job.status === "done" && (
          <RowButton
            label={`Download ${renameJob(job, renamePattern, index, total)}`}
            onClick={() => downloadJob(job, renamePattern, index, total)}
          >
            <DoodleIcon name="download" size={16} />
          </RowButton>
        )}
        {job.status === "processing" && (
          <RowButton
            label={`Cancel ${job.file.name}`}
            onClick={() => cancelJob(job.id)}
          >
            <DoodleIcon name="close" size={16} />
          </RowButton>
        )}
        {(job.status === "failed" || job.status === "cancelled") && (
          <RowButton
            label={`Retry ${job.file.name}`}
            onClick={() => {
              requeue([job.id]);
              startProcessing([job.id]);
            }}
          >
            <DoodleIcon name="retry" size={16} />
          </RowButton>
        )}
        <RowButton
          label={`Remove ${job.file.name}`}
          onClick={() => removeJobs([job.id])}
        >
          <DoodleIcon name="trash" size={16} />
        </RowButton>
      </div>
    </li>
  );
});

function RowButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid size-11 place-items-center rounded-xl text-muted transition-colors hover:bg-surface-3 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {children}
    </button>
  );
}
