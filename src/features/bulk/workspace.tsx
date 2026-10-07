"use client";

import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/cn";
import { formatBytes, formatCount, formatPercent } from "@/lib/bytes";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/controls";
import { DropZone } from "@/components/ui/drop-zone";
import { DoodleIcon } from "@/components/ui/doodle-icon";
import {
  IndeterminateBar,
  ProgressBar,
  StatCard,
} from "@/components/ui/progress";
import { SettingsPanel } from "@/features/compress/settings-panel";
import { useMediaQuery } from "@/hooks/use-capabilities";
import { useVirtualList } from "@/hooks/use-virtual-list";
import { downloadZip, savingsSummary } from "@/services/download-service";
import {
  cancelProcessing,
  disposeProcessing,
  pauseProcessing,
  resumeProcessing,
  startProcessing,
} from "@/services/processing-service";
import {
  addFiles,
  clearQueue,
  countsOf,
  removeJobs,
  requeue,
  selectAll,
  totalsOf,
  useJobs,
  useRunState,
} from "@/stores/queue-store";
import { JobRow } from "./job-row";
import type { ImageJob } from "@/types/job";

const ROW_HEIGHT = 76;
const ImagePreview = dynamic(
  () => import("./image-preview").then((module) => module.ImagePreview),
  { ssr: false },
);

export function Workspace() {
  const jobs = useJobs();
  const run = useRunState();
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [renamePattern, setRenamePattern] = useState("");
  const [zipping, setZipping] = useState<null | {
    done: number;
    total: number;
  }>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const archiveBusy = useRef(false);
  const [preview, setPreview] = useState<{
    job: ImageJob;
    originalUrl: string;
  } | null>(null);

  const counts = useMemo(() => countsOf(jobs), [jobs]);
  const totals = useMemo(() => totalsOf(jobs), [jobs]);
  const selected = useMemo(() => jobs.filter((j) => j.selected), [jobs]);
  const failed = useMemo(
    () => jobs.filter((j) => j.status === "failed"),
    [jobs],
  );
  const completed = useMemo(
    () => jobs.filter((j) => j.status === "done"),
    [jobs],
  );
  const originalBytes = useMemo(
    () => jobs.reduce((sum, job) => sum + job.file.size, 0),
    [jobs],
  );
  const selectedCompleted = useMemo(
    () => selected.filter((job) => job.result),
    [selected],
  );

  const {
    ref: listRef,
    start,
    end,
    padTop,
    padBottom,
  } = useVirtualList({ count: jobs.length, rowHeight: ROW_HEIGHT });

  // Tear the worker pool down on unmount so navigating away does not leave
  // threads and decoded surfaces alive in the background.
  useEffect(() => disposeProcessing, []);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.originalUrl);
    },
    [preview],
  );

  const openPreview = useCallback((job: ImageJob) => {
    if (job.result && job.previewUrl)
      setPreview({ job, originalUrl: URL.createObjectURL(job.file) });
  }, []);

  const onFiles = useCallback((files: File[]) => {
    addFiles(files);
  }, []);

  const overallProgress =
    counts.total === 0
      ? 0
      : (counts.done + counts.failed + counts.cancelled) / counts.total;

  const onDownloadZip = useCallback(
    async (which: "all" | "selected", streamToDisk = false) => {
      if (archiveBusy.current) return;
      const batch =
        which === "all" ? completed : selected.filter((j) => j.result);
      if (batch.length === 0) return;
      archiveBusy.current = true;
      setDownloadError(null);
      setZipping({ done: 0, total: batch.length });
      try {
        await downloadZip(batch, {
          pattern: renamePattern,
          streamToDisk,
          onProgress: (done, total) => setZipping({ done, total }),
        });
      } catch (cause) {
        setDownloadError(
          cause instanceof Error
            ? cause.message
            : "The archive could not be created. Try downloading a smaller selection.",
        );
      } finally {
        archiveBusy.current = false;
        setZipping(null);
      }
    },
    [completed, selected, renamePattern],
  );

  const busy = run === "running";

  return (
    <div className="sf-page-shell flex flex-1 items-start gap-5 py-5 lg:gap-6">
      {/* ---- Settings: sidebar on desktop ---- */}
      {isDesktop && (
        <aside
          aria-label="Image settings"
          className="sf-card-flat sticky top-20 max-h-[calc(100dvh-6rem)] w-[340px] shrink-0 overflow-y-auto overscroll-contain p-5 xl:w-[360px] 2xl:w-[380px]"
        >
          <div className="mb-5 flex items-center gap-3 border-b border-line pb-4">
            <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent-deep">
              <DoodleIcon name="sliders" size={19} />
            </span>
            <div>
              <h2 className="text-base font-semibold text-ink">Settings</h2>
              <p className="mt-0.5 text-xs text-muted">
                Choose how your images are exported.
              </p>
            </div>
          </div>
          <SettingsPanel />
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {jobs.length === 0 ? (
          <EmptyWorkspace
            onFiles={onFiles}
            onSettings={() => setSettingsOpen(true)}
          />
        ) : (
          <>
            {/* ---- Summary ---- */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard
                label="Images"
                icon={<DoodleIcon name="layers" size={30} />}
                value={formatCount(counts.total)}
                sub={`${counts.done} done`}
              />
              <StatCard label="Original" value={formatBytes(originalBytes)} icon={<DoodleIcon name="select-image" size={30} />} />
              <StatCard
                label="Output"
                icon={<DoodleIcon name="save-image" size={30} />}
                value={counts.done ? formatBytes(totals.outputBytes) : "—"}
              />
              <StatCard
                label="Saved"
                icon={<DoodleIcon name="compress" size={30} />}
                tone={totals.savedBytes > 0 ? "success" : "default"}
                value={
                  counts.done
                    ? formatBytes(Math.max(0, totals.savedBytes))
                    : "—"
                }
                sub={
                  totals.originalBytes > 0
                    ? formatPercent(totals.savedRatio * 100)
                    : undefined
                }
              />
            </div>

            {/* ---- Toolbar ---- */}
            <div className="sf-card-flat sticky top-20 z-20 flex flex-wrap items-center gap-2 p-3 shadow-sm">
              {run === "idle" &&
                counts.queued + counts.cancelled + counts.failed > 0 && (
                  <Button
                    variant="primary"
                    iconLeft={<DoodleIcon name="bolt" size={17} />}
                    onClick={() => startProcessing()}
                    aria-label={`Start processing ${counts.queued + counts.cancelled + counts.failed} images`}
                    disabled={
                      counts.queued + counts.cancelled + counts.failed === 0
                    }
                  >
                    {counts.done > 0 ? "Process remaining" : "Start"}
                  </Button>
                )}
              {run === "running" && (
                <>
                  <Button
                    variant="secondary"
                    iconLeft={<DoodleIcon name="pause" size={16} />}
                    onClick={pauseProcessing}
                  >
                    Pause
                  </Button>
                  <Button variant="danger" onClick={cancelProcessing}>
                    Cancel
                  </Button>
                </>
              )}
              {run === "paused" && (
                <>
                  <Button
                    variant="primary"
                    iconLeft={<DoodleIcon name="play" size={15} />}
                    onClick={resumeProcessing}
                  >
                    Resume
                  </Button>
                  <Button variant="danger" onClick={cancelProcessing}>
                    Cancel
                  </Button>
                </>
              )}

              {!isDesktop && (
                <Button
                  variant="secondary"
                  iconLeft={<DoodleIcon name="sliders" size={16} />}
                  onClick={() => setSettingsOpen(true)}
                >
                  Settings
                </Button>
              )}

              <p
                className="hidden text-sm text-muted xl:block"
                aria-live="polite"
              >
                {run === "running"
                  ? "Processing on your device"
                  : run === "paused"
                    ? "Paused — resume whenever you're ready"
                    : counts.queued + counts.cancelled + counts.failed > 0
                      ? `${counts.queued + counts.cancelled + counts.failed} images ready to process`
                      : `${counts.done} images ready to download`}
              </p>

              <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
                {failed.length > 0 && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-11"
                    iconLeft={<DoodleIcon name="retry" size={14} />}
                    onClick={() => {
                      const ids = failed.map((j) => j.id);
                      requeue(ids);
                      startProcessing(ids);
                    }}
                  >
                    Retry {failed.length} failed
                  </Button>
                )}
                {completed.length > 0 && (
                  <>
                    {selectedCompleted.length > 0 &&
                      selectedCompleted.length < completed.length && (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-11"
                          iconLeft={<DoodleIcon name="download" size={14} />}
                          onClick={() => void onDownloadZip("selected")}
                          disabled={zipping !== null}
                        >
                          Download {selectedCompleted.length} selected
                        </Button>
                      )}
                    <Button
                      variant="primary"
                      size="md"
                      iconLeft={<DoodleIcon name="archive" size={14} />}
                      onClick={() => void onDownloadZip("all")}
                      disabled={zipping !== null}
                    >
                      Download ZIP
                    </Button>
                    <Button variant="secondary" disabled={zipping !== null} onClick={() => void onDownloadZip("all", true)} iconLeft={<DoodleIcon name="archive" size={18} />}>Save ZIP to disk</Button>
                  </>
                )}
              </div>
            </div>

            {/* ---- Live progress ---- */}
            <AnimatePresence>
              {(busy || run === "paused") && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="sf-card-accent flex items-center gap-4 p-4">
                    <DoodleIcon
                      name="layers"
                      size={44}
                      className={busy ? "motion-safe:animate-pulse" : undefined}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-semibold text-ink">
                        {busy ? "Shrinking..." : "Paused"}{" "}
                        <span className="font-normal text-muted">
                          {counts.done + counts.failed} / {counts.total}
                        </span>
                      </p>
                      <ProgressBar
                        className="mt-2"
                        value={overallProgress}
                        label="Batch progress"
                      />
                    </div>
                    <span className="shrink-0 text-[13px] font-semibold tabular-nums text-ink">
                      {Math.round(overallProgress * 100)}%
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ---- ZIP progress ---- */}
            {downloadError && (
              <p
                role="alert"
                className="rounded-2xl border border-danger/25 bg-danger-soft p-4 text-sm text-danger"
              >
                {downloadError}
              </p>
            )}
            {zipping && (
              <div className="sf-card-flat p-4">
                <p className="text-[13px] font-medium text-ink">
                  Building archive — {zipping.done} / {zipping.total}
                </p>
                <div className="mt-2">
                  {zipping.total > 0 ? (
                    <ProgressBar
                      value={zipping.done / zipping.total}
                      label="Archive progress"
                    />
                  ) : (
                    <IndeterminateBar label="Archive progress" />
                  )}
                </div>
              </div>
            )}

            {/* ---- Success summary ---- */}
            {run === "idle" && counts.done > 0 && counts.queued === 0 && (
              <SuccessPanel
                doneCount={counts.done}
                failedCount={counts.failed}
                summary={savingsSummary(jobs)}
                savedBytes={totals.savedBytes}
                savedRatio={totals.savedRatio}
              />
            )}

            {/* ---- Batch controls ---- */}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1">
              <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={selected.length === jobs.length && jobs.length > 0}
                  // Mixed selection shows the indeterminate dash rather than
                  // pretending the box is simply unchecked.
                  ref={(node) => {
                    if (node)
                      node.indeterminate =
                        selected.length > 0 && selected.length < jobs.length;
                  }}
                  onChange={(e) => selectAll(e.target.checked)}
                  className="size-5 cursor-pointer rounded accent-[var(--sf-accent)]"
                />
                {selected.length} of {jobs.length} selected
              </label>

              <div className="flex flex-wrap items-center gap-1">
                {selected.length > 0 && selected.length < jobs.length && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-11"
                    iconLeft={<DoodleIcon name="trash" size={14} />}
                    onClick={() => removeJobs(selected.map((j) => j.id))}
                  >
                    Remove selected
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-11"
                  onClick={clearQueue}
                >
                  Clear all
                </Button>
              </div>
            </div>

            <details className="rounded-2xl border border-line bg-surface px-4">
              <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm font-medium text-ink-2">
                Rename downloads{" "}
                <span className="text-xs font-normal text-muted">Optional</span>
              </summary>
              <div className="border-t border-line pb-4 pt-3">
                <label
                  htmlFor="batch-rename"
                  className="mb-2 block text-sm text-muted"
                >
                  Use a pattern for the downloaded filenames.
                </label>
                <TextInput
                  id="batch-rename"
                  aria-label="Rename pattern"
                  placeholder="product-{index}"
                  value={renamePattern}
                  onChange={(event) => setRenamePattern(event.target.value)}
                  className="h-11 text-base sm:max-w-md sm:text-sm"
                />
                <p className="mt-2 text-xs leading-relaxed text-faint">
                  Available: {"{name}"}, {"{index}"}, {"{width}"}, {"{height}"},{" "}
                  {"{format}"}. Leave blank to keep original names.
                </p>
              </div>
            </details>

            {/* ---- The list ---- */}
            <div
              ref={listRef}
              aria-label="Image queue"
              className="min-h-0 overflow-y-auto overscroll-contain rounded-2xl"
              style={{ maxHeight: "min(640px, 65dvh)" }}
            >
              <div style={{ paddingTop: padTop, paddingBottom: padBottom }}>
                <ul className="space-y-2">
                  {jobs.slice(start, end).map((job, i) => (
                    <JobRow
                      key={job.id}
                      job={job}
                      index={start + i}
                      total={jobs.length}
                      renamePattern={renamePattern}
                      onPreview={openPreview}
                    />
                  ))}
                </ul>
              </div>
            </div>

            <AddMoreBar onFiles={onFiles} />
            <p className="px-1 text-xs leading-relaxed text-faint">
              Download your results before leaving or refreshing. This workspace
              does not save a copy for later.
            </p>
          </>
        )}
      </div>

      {/* ---- Settings: bottom sheet on mobile ---- */}
      <AnimatePresence>
        {!isDesktop && settingsOpen && (
          <SettingsSheet onClose={() => setSettingsOpen(false)} />
        )}
      </AnimatePresence>
      {preview && (
        <ImagePreview
          job={preview.job}
          originalUrl={preview.originalUrl}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function EmptyWorkspace({
  onFiles,
  onSettings,
}: {
  onFiles: (files: File[]) => void;
  onSettings: () => void;
}) {
  return (
    <div className="flex w-full flex-col gap-5">
      <div className="flex items-center justify-between gap-3 lg:hidden">
        <p className="text-sm font-medium text-muted">Ready when you are.</p>
        <Button
          iconLeft={<DoodleIcon name="sliders" size={16} />}
          onClick={onSettings}
        >
          Settings
        </Button>
      </div>
      <div className="sf-card p-4 sm:p-6 lg:p-8">
        <DropZone onFiles={onFiles} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          [
            "01",
            "Add your images",
            "Choose a photo, drop in several images or select a folder.",
          ],
          [
            "02",
            "Choose your settings",
            "Start with a preset or choose the quality, size and file format.",
          ],
          [
            "03",
            "Check and download",
            "Compare your results, then save individual images or a batch ZIP.",
          ],
        ].map(([step, title, description]) => (
          <div
            key={step}
            className="rounded-2xl border border-line bg-surface p-4"
          >
            <span className="text-xs font-semibold tabular-nums text-accent-deep">
              {step}
            </span>
            <h2 className="mt-2 text-sm font-semibold text-ink">{title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              {description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function AddMoreBar({ onFiles }: { onFiles: (files: File[]) => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong p-1.5">
      <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl text-sm font-medium text-muted transition-colors hover:text-ink focus-within:outline-2 focus-within:outline-accent">
        <DoodleIcon name="upload" size={15} />
        Add more images
        <input
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) onFiles(Array.from(e.target.files));
            e.target.value = "";
          }}
        />
      </label>
    </div>
  );
}

function SuccessPanel({
  doneCount,
  failedCount,
  summary,
  savedBytes,
  savedRatio,
}: {
  doneCount: number;
  failedCount: number;
  summary: string;
  savedBytes: number;
  savedRatio: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="sf-card-accent flex flex-col gap-4 p-5 sm:flex-row sm:items-center"
    >
      <DoodleIcon name="image" size={52} />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold tracking-[-0.015em] text-ink">
          Your images are ready.
        </p>
        <p className="mt-0.5 text-[13px] text-muted">
          {doneCount} optimized{failedCount > 0 && `, ${failedCount} failed`} ·{" "}
          {summary}
          {savedBytes > 0 && (
            <>
              {" "}
              · saved{" "}
              <span className="font-semibold text-success">
                {formatBytes(savedBytes)} ({formatPercent(savedRatio * 100, 1)})
              </span>
            </>
          )}
        </p>
      </div>
    </motion.div>
  );
}

function SettingsSheet({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  // Lock the page behind the sheet so scrolling inside it does not drag the
  // list underneath.
  useEffect(() => {
    const node = dialog.current;
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    node?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
      node?.close();
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={headingId}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const items = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], summary, [tabindex="0"]',
          ),
        ).filter((item) => item.getClientRects().length > 0);
        const first = items[0];
        const last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className={cn(
        "sf-settings-sheet fixed inset-x-0 bottom-0 top-auto m-0 max-h-[86dvh] w-full max-w-none overflow-y-auto rounded-t-3xl border-t border-line backdrop:bg-black/40 backdrop:backdrop-blur-sm",
        "bg-surface px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 shadow-xl",
      )}
    >
      <div className="sticky top-0 -mx-5 mb-4 bg-surface px-5 pb-3 pt-1">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong" />
        <div className="flex items-center justify-between">
          <h2 id={headingId} className="text-[15px] font-semibold text-ink">
            Settings
          </h2>
          <Button variant="ghost" size="md" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
      <SettingsPanel />
    </dialog>
  );
}
