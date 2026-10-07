"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { DoodleIcon } from "@/components/ui/doodle-icon";
import { FORMAT_LABELS } from "@/lib/site";

export interface DropZoneProps {
  onFiles: (files: File[]) => void;
  /** Compact variant for the workspace sidebar and tool pages. */
  compact?: boolean;
  className?: string;
  accept?: string;
}

/**
 * The product's primary input.
 *
 * Three things matter here and each is easy to get wrong:
 *
 *  1. Drag state. `dragleave` fires when the pointer crosses a *child* element,
 *     so a naive implementation flickers. We count enter/leave pairs instead.
 *  2. Keyboard parity. Drag and drop is unusable for keyboard and screen reader
 *     users, so the whole surface is a real <button> that opens the file picker.
 *  3. Directory input. `webkitdirectory` is supported far more widely than the
 *     File System Access API, and needs no permission prompt, so it is the
 *     default path for folder selection.
 */
export function DropZone({
  onFiles,
  compact,
  className,
  accept = "image/*",
}: DropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const reducedMotion = useReducedMotion();
  const depth = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const dirInput = useRef<HTMLInputElement>(null);

  const emit = useCallback(
    (list: FileList | null) => {
      if (!list || list.length === 0) return;
      // Directory selection sweeps up every file in the tree, so non-images are
      // filtered here rather than failing one-by-one in the validator.
      const files = Array.from(list).filter(
        (f) =>
          f.type.startsWith("image/") ||
          /\.(jpe?g|png|webp|avif|gif|bmp|tiff?)$/i.test(f.name),
      );
      if (files.length) onFiles(files);
    },
    [onFiles],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      depth.current = 0;
      setDragging(false);
      emit(event.dataTransfer?.files ?? null);
    },
    [emit],
  );

  // A drop anywhere outside the zone would otherwise make the browser navigate
  // to the file, losing whatever is in the queue.
  useEffect(() => {
    const block = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "none";
    };
    window.addEventListener("dragover", block);
    window.addEventListener("drop", block);
    return () => {
      window.removeEventListener("dragover", block);
      window.removeEventListener("drop", block);
    };
  }, []);

  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault();
        depth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        depth.current -= 1;
        if (depth.current <= 0) {
          depth.current = 0;
          setDragging(false);
        }
      }}
      onDrop={onDrop}
      className={cn("relative", className)}
    >
      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        className={cn(
          "group relative flex w-full flex-col items-center justify-center overflow-hidden",
          "rounded-3xl border-2 border-dashed text-center transition-[background-color,border-color,transform] duration-300",
          compact ? "gap-3 px-5 py-8" : "gap-5 px-6 py-14 sm:py-16",
          dragging
            ? "border-accent bg-accent-softer motion-safe:scale-[1.004]"
            : "border-line-strong bg-surface-2/60 hover:border-accent/50 hover:bg-accent-softer/50",
        )}
      >
        {/* Warm bloom that tracks the drag state. */}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-[radial-gradient(60%_100%_at_50%_100%,var(--sf-accent-soft),transparent_70%)]"
          animate={{ opacity: dragging ? 1 : 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.25 }}
        />

        <span className="sf-doodle-badge relative grid place-items-center p-2 text-ink">
          <DoodleIcon
            name="image"
            size={compact ? 56 : 80}
            className={cn(
              "transition-transform duration-300",
              dragging && "motion-safe:-translate-y-2 motion-safe:-rotate-3",
            )}
          />
        </span>

        <div className="relative space-y-1.5">
          <p
            className={cn(
              "font-semibold tracking-[-0.02em] text-ink",
              compact ? "text-[15px]" : "text-xl sm:text-2xl",
            )}
          >
            {dragging ? "Drop to start" : "Drop your images here"}
          </p>
          <p className={cn("text-muted", compact ? "text-[13px]" : "text-sm")}>
            or choose files from your device
          </p>
        </div>

        {!compact && (
          <div className="relative flex flex-wrap items-center justify-center gap-1.5">
            {FORMAT_LABELS.map((f) => (
              <span
                key={f}
                className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-muted"
              >
                {f}
              </span>
            ))}
          </div>
        )}
      </button>

      {/* Actions sit outside the button: nesting interactive elements breaks
          both the accessibility tree and click handling. */}
      <div
        className={cn(
          "mt-4 flex flex-col items-center gap-2.5 sm:flex-row sm:justify-center",
          compact && "mt-3",
        )}
      >
        <Button
          variant="primary"
          size={compact ? "sm" : "lg"}
          iconLeft={<DoodleIcon name="upload" size={compact ? 17 : 20} />}
          onClick={() => fileInput.current?.click()}
          className={cn(!compact && "w-full sm:w-auto")}
        >
          Select images
        </Button>
        <Button
          variant="secondary"
          size={compact ? "sm" : "lg"}
          iconLeft={<DoodleIcon name="folder" size={compact ? 17 : 20} />}
          onClick={() => dirInput.current?.click()}
          className={cn(!compact && "w-full sm:w-auto")}
        >
          Select folder
        </Button>
      </div>

      {!compact && (
        <p className="mt-4 flex items-center justify-center gap-1.5 text-[13px] text-muted">
          <DoodleIcon name="lock" size={15} />
          Your images stay on your device — nothing is uploaded.
        </p>
      )}

      <input
        ref={fileInput}
        type="file"
        accept={accept}
        multiple
        hidden
        // Resetting the value lets the user pick the same file twice in a row.
        onChange={(e) => {
          emit(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={dirInput}
        type="file"
        hidden
        multiple
        // Not in the React types, but supported in every target browser.
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        onChange={(e) => {
          emit(e.target.files);
          e.target.value = "";
        }}
      />

      <AnimatePresence>
        {dragging && (
          <motion.div
            key="overlay"
            initial={{ opacity: reducedMotion ? 1 : 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.2 }}
            className="pointer-events-none absolute inset-0 rounded-3xl ring-2 ring-accent/40"
          />
        )}
      </AnimatePresence>
    </div>
  );
}
