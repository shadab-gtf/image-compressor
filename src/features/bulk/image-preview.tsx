"use client";

import { useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/button";
import { DoodleIcon } from "@/components/ui/doodle-icon";
import { BeforeAfter } from "@/features/showcase/before-after";
import { formatBytes } from "@/lib/bytes";
import { downloadJob } from "@/services/download-service";
import type { ImageJob } from "@/types/job";

export function ImagePreview({
  job,
  originalUrl,
  onClose,
}: {
  job: ImageJob;
  originalUrl: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const node = dialog.current;
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    node?.showModal();
    return () => {
      node?.close();
      document.body.style.overflow = overflow;
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);

  if (!job.result || !job.previewUrl) return null;
  const { width, height } = job.result.output.dimensions;
  const displayRatio = Math.max(0.6, Math.min(2, width / height));
  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const items = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), a[href], [tabindex="0"]',
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
      className="fixed inset-0 m-auto max-h-[92dvh] w-[min(92vw,760px)] max-w-none overflow-y-auto rounded-3xl border border-line bg-surface p-5 text-ink shadow-xl backdrop:bg-black/55 backdrop:backdrop-blur-sm sm:p-6"
    >
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 id={titleId} className="truncate text-lg font-semibold">
            {job.file.name}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {formatBytes(job.file.size)} → {formatBytes(job.result.output.size)}{" "}
            · {width} × {height}px
          </p>
        </div>
        <Button
          variant="ghost"
          size="md"
          iconLeft={<DoodleIcon name="close" size={17} />}
          onClick={onClose}
        >
          Close
        </Button>
      </div>
      <BeforeAfter
        before={originalUrl}
        after={job.previewUrl}
        alt={job.file.name}
        width={Math.round(600 * displayRatio)}
        height={600}
        eager
      />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-md text-xs leading-relaxed text-muted">
          Drag the divider or use the arrow keys. Images are fitted to the
          comparison frame; resizing and crops may change the framing.
        </p>
        <Button
          variant="primary"
          size="md"
          iconLeft={<DoodleIcon name="download" size={18} />}
          onClick={() => downloadJob(job)}
        >
          Download image
        </Button>
      </div>
    </dialog>
  );
}
