"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { DoodleIcon } from "@/components/ui/doodle-icon";
import { HEADER_BYTES, readHeaderDimensions } from "@/engines/header";
import { validateDimensions } from "@/engines/validate";
import { LIMITS, sniffFormat } from "@/lib/format";

interface JobThumbnailProps {
  file: File;
  outputUrl: string | null;
  onPreview: () => void;
}

export function JobThumbnail({ file, outputUrl, onPreview }: JobThumbnailProps) {
  const [original, setOriginal] = useState<{ file: File; url: string } | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (outputUrl || !file.size || file.size > LIMITS.maxFileBytes) return;
    let active = true;
    let url: string | null = null;

    // Only mounted (virtualized) rows acquire a URL. Check dimensions before
    // handing uploaded bytes to the browser's decoder, just like the processor.
    async function prepare() {
      try {
        const bytes = new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer());
        if (!active) return;
        const format = sniffFormat(bytes);
        const dimensions = format ? readHeaderDimensions(bytes, format) : null;
        if (!dimensions || validateDimensions(dimensions.width, dimensions.height)) return;
        url = URL.createObjectURL(file);
        setOriginal({ file, url });
      } catch {
        // The processing action supplies detailed errors; a thumbnail failure
        // must not remove the file or prevent the user from retrying it.
      }
    }
    void prepare();
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file, outputUrl]);

  const src = outputUrl ?? (original?.file === file ? original.url : null);
  const image = src && failedUrl !== src ? (
    <Image
      key={src}
      src={src}
      alt={outputUrl ? "" : `Uploaded image: ${file.name}`}
      width={44}
      height={44}
      unoptimized
      loading="lazy"
      decoding="async"
      onError={() => setFailedUrl(src)}
      className="size-full object-contain"
    />
  ) : (
    <span className="grid size-full place-items-center text-muted" title="Image preview unavailable">
      <DoodleIcon name="image" size={25} />
    </span>
  );

  return (
    <div className="relative size-11 shrink-0 overflow-hidden rounded-xl border border-line bg-surface-3">
      {outputUrl ? (
        <button type="button" onClick={onPreview} aria-label={`Preview ${file.name}`} title="Compare original and result" className="size-full cursor-zoom-in">
          {image}
        </button>
      ) : image}
    </div>
  );
}
