"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { DoodleIcon } from "@/components/ui/doodle-icon";
import dynamic from "next/dynamic";
import { addFiles, setOptions } from "@/stores/queue-store";
import type { ProcessingOptions } from "@/types/options";

const DropZone = dynamic(() => import("@/components/ui/drop-zone").then((module) => module.DropZone), {
  loading: () => <div role="status" aria-label="Loading image upload" className="min-h-48 rounded-3xl bg-surface-2 motion-safe:animate-pulse" />,
});

/**
 * Entry point from any marketing or SEO page into the workspace.
 *
 * Files are pushed into the shared queue store and the route changes; the store
 * holds live `File` handles, which is why ingestion must stay client-side and
 * cannot round-trip through a URL or the server.
 */
export function UploadEntry({
  compact,
  variant,
  options,
}: {
  compact?: boolean;
  variant?: "hero";
  options?: ProcessingOptions;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);

  const onFiles = useCallback(
    (files: File[]) => {
      if (options) setOptions(() => structuredClone(options));
      addFiles(files);
      router.push("/app");
    },
    [router, options],
  );

  if (variant === "hero")
    return (
      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          if (event.dataTransfer.files.length)
            onFiles(Array.from(event.dataTransfer.files));
        }}
      >
        <Button
          variant="primary"
          size="lg"
          iconLeft={<DoodleIcon name="upload" size={18} />}
          className="min-h-13 rounded-full! px-7!"
          onClick={() => input.current?.click()}
        >
          Choose your images
        </Button>
        <p className="mt-3 text-xs text-muted">
          or drop images here · JPG, PNG, WebP & more
        </p>
        <input
          ref={input}
          hidden
          type="file"
          accept="image/*"
          multiple
          onChange={(event) => {
            if (event.target.files?.length)
              onFiles(Array.from(event.target.files));
            event.target.value = "";
          }}
        />
      </div>
    );
  return <DropZone onFiles={onFiles} compact={compact} />;
}
