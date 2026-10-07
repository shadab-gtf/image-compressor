"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { Segmented } from "@/components/ui/controls";
import { Badge } from "@/components/ui/progress";
import { DoodleIcon } from "@/components/ui/doodle-icon";
import { formatBytes, savingsPercent } from "@/lib/bytes";
import type { Dimensions } from "@/types/image";
import type { ImageJob } from "@/types/job";
import { SideBySidePanes, SinglePane, SplitPane } from "./compare-stage";
import { CompareStats, CompareWarnings } from "./compare-stats";
import { useObjectUrl } from "./use-object-url";
import { ZOOM_OPTIONS, type View, type ZoomLevel } from "./zoom";

type Mode = "slider" | "side" | "single";
type Which = "original" | "output";

const MODE_OPTIONS: Array<{
  value: Mode;
  label: string;
  title: string;
  disabled?: boolean;
}> = [
  {
    value: "slider",
    label: "Slider",
    title: "Drag a divider across the image",
  },
  { value: "side", label: "Side by side", title: "Two panes, one shared zoom" },
  { value: "single", label: "Single", title: "One image, full width" },
];

const WHICH_OPTIONS: Array<{ value: Which; label: string }> = [
  { value: "original", label: "Original" },
  { value: "output", label: "Output" },
];

const HINTS: Record<Mode, string> = {
  slider: "Drag the divider, or focus it and use the arrow keys.",
  side: "Zoom past Fit, then drag either pane — both stay in sync.",
  single: "Zoom past Fit, then drag to pan.",
};

/* -------------------------------------------------------------------------- */
/* Shell                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Open/close lives inside the component so a caller can mount it with a plain
 * `{open && <ComparisonViewer …/>}` and still get an exit transition: the
 * internal AnimatePresence plays the close animation first and only then calls
 * `onClose`, at which point the caller unmounts it.
 */
const noopSubscribe = () => () => {};

export function ComparisonViewer({
  job,
  onClose,
}: {
  job: ImageJob;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(true);
  // The portal target only exists in the browser, and this is the one hook that
  // reports "hydrated" without a setState inside an effect.
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const requestClose = useCallback(() => setOpen(false), []);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence onExitComplete={onClose}>
      {open && <ViewerDialog job={job} onRequestClose={requestClose} />}
    </AnimatePresence>,
    document.body,
  );
}

/* -------------------------------------------------------------------------- */
/* Dialog                                                                      */
/* -------------------------------------------------------------------------- */

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function ViewerDialog({
  job,
  onRequestClose,
}: {
  job: ImageJob;
  onRequestClose: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef(onRequestClose);

  useEffect(() => {
    closeRef.current = onRequestClose;
  }, [onRequestClose]);

  const result = job.result;
  const hasOutput = result !== null;

  const [mode, setMode] = useState<Mode>(hasOutput ? "slider" : "single");
  const [which, setWhich] = useState<Which>(hasOutput ? "output" : "original");
  const [split, setSplit] = useState(50);
  const [view, setView] = useState<View>({ zoom: "fit", x: 0, y: 0 });
  const [measured, setMeasured] = useState<Dimensions | null>(null);

  // The store owns `previewUrl` (the output) and revokes it when the job goes
  // away, so it must never be revoked here. The original has no URL at all
  // until the viewer makes one, and that one is ours to clean up.
  const originalUrl = useObjectUrl(job.file);
  const outputFallback = useObjectUrl(
    job.previewUrl ? null : (result?.output.blob ?? null),
  );
  const outputUrl = job.previewUrl ?? outputFallback;

  // `input` is null until validation finishes, so fall back to asking the
  // decoded bitmap rather than rendering the stage at the wrong aspect ratio.
  useEffect(() => {
    if (job.input || !originalUrl) return;
    const probe = new Image();
    probe.onload = () =>
      setMeasured({ width: probe.naturalWidth, height: probe.naturalHeight });
    probe.src = originalUrl;
    return () => {
      probe.onload = null;
    };
  }, [job.input, originalUrl]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const restoreTo = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;

      const items = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter(
        (element) =>
          element.offsetWidth > 0 ||
          element.offsetHeight > 0 ||
          element === document.activeElement,
      );
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }

      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      restoreTo?.focus({ preventScroll: true });
    };
  }, []);

  const originalDimensions = job.input?.dimensions ?? measured;
  // The original is the reference frame: at 100% it is 1:1, and a resized
  // output is scaled to sit exactly on top of it so the two are comparable.
  const natural: Dimensions = originalDimensions ??
    result?.output.dimensions ?? { width: 1, height: 1 };

  const onPan = useCallback((x: number, y: number) => {
    setView((current) => ({ ...current, x, y }));
  }, []);

  const setZoom = useCallback((zoom: ZoomLevel) => {
    setView({ zoom, x: 0, y: 0 });
  }, []);

  const changeMode = useCallback((next: Mode) => {
    setMode(next);
    // Pane width changes with the mode, so a carried-over offset would land the
    // image somewhere the user did not put it.
    setView((current) => ({ ...current, x: 0, y: 0 }));
  }, []);

  const saved = result ? savingsPercent(job.file.size, result.output.size) : 0;
  const grew = saved < 0;

  const modeOptions = MODE_OPTIONS.map((option) =>
    option.value === "single" ? option : { ...option, disabled: !hasOutput },
  );

  const spring = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 340, damping: 32 };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-stretch justify-center p-3 sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.18 }}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close comparison"
        onClick={onRequestClose}
        className="absolute inset-0 bg-ink/45 backdrop-blur-sm"
      />

      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        initial={
          reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 10 }
        }
        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
        exit={
          reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 10 }
        }
        transition={spring}
        className="sf-card relative flex w-full max-w-5xl flex-col gap-3 overflow-hidden p-3 sm:p-4"
      >
        {/* Header */}
        <header className="flex shrink-0 items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2
              id={titleId}
              className="truncate text-[15px] font-semibold tracking-[-0.01em] text-ink"
              title={job.file.name}
            >
              {job.file.name}
            </h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-muted">
              <span>{formatBytes(job.file.size)}</span>
              {result && (
                <>
                  <span aria-hidden>→</span>
                  <span className="font-medium text-ink">
                    {formatBytes(result.output.size)}
                  </span>
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
                </>
              )}
            </p>
          </div>

          <button
            type="button"
            aria-label="Close comparison"
            onClick={onRequestClose}
            className="grid size-9 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface-3 hover:text-ink"
          >
            <DoodleIcon name="close" size={17} />
          </button>
        </header>

        {/* Controls */}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Segmented
            label="Comparison mode"
            size="sm"
            value={mode}
            onChange={changeMode}
            options={modeOptions}
            className="min-w-[240px] flex-1"
          />
          {mode === "single" && (
            <Segmented
              label="Image shown"
              size="sm"
              value={which}
              onChange={setWhich}
              options={WHICH_OPTIONS.map((option) =>
                option.value === "output"
                  ? { ...option, disabled: !hasOutput }
                  : option,
              )}
              className="min-w-[150px]"
            />
          )}
          <Segmented
            label="Zoom level"
            size="sm"
            value={view.zoom}
            onChange={setZoom}
            options={ZOOM_OPTIONS}
            className="min-w-[200px] flex-1"
          />
        </div>

        {/* Stage */}
        <div className="min-h-[180px] flex-1">
          {mode === "slider" ? (
            <SplitPane
              originalSrc={originalUrl}
              outputSrc={outputUrl}
              natural={natural}
              view={view}
              onPan={onPan}
              split={split}
              onSplitChange={setSplit}
            />
          ) : mode === "side" ? (
            <SideBySidePanes
              originalSrc={originalUrl}
              outputSrc={outputUrl}
              natural={natural}
              view={view}
              onPan={onPan}
            />
          ) : (
            <SinglePane
              src={which === "output" ? outputUrl : originalUrl}
              alt={which === "output" ? "Compressed output" : "Original image"}
              caption={which === "output" ? "Output" : "Original"}
              natural={natural}
              view={view}
              onPan={onPan}
            />
          )}
        </div>

        {/* Facts */}
        <div
          className={cn(
            "shrink-0 space-y-2 overflow-y-auto sf-no-scrollbar",
            "max-h-[46dvh] sm:max-h-none",
          )}
        >
          <p className="text-[11.5px] text-faint">{HINTS[mode]}</p>
          <CompareWarnings job={job} />
          <CompareStats job={job} originalDimensions={originalDimensions} />
        </div>
      </motion.div>
    </motion.div>
  );
}
