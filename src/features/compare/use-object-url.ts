"use client";

import { useEffect, useState } from "react";

/**
 * Object URL with a guaranteed revoke.
 *
 * The viewer needs its own URL for the *original* file — the store only keeps
 * one for the output. Without the cleanup below every open would leak a blob
 * reference for the lifetime of the tab, which on a 500-file batch is hundreds
 * of megabytes the browser can never reclaim.
 */
export function useObjectUrl(source: Blob | null): string | null {
  const [resource, setResource] = useState<{ source: Blob; url: string } | null>(null);

  useEffect(() => {
    if (!source) return;
    let active = true;
    const created = URL.createObjectURL(source);
    queueMicrotask(() => { if (active) setResource({ source, url: created }); });
    return () => {
      active = false;
      URL.revokeObjectURL(created);
    };
  }, [source]);

  return resource?.source === source ? resource.url : null;
}
