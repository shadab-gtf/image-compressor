"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Fixed-height windowing.
 *
 * At a thousand files, rendering every row costs tens of thousands of DOM nodes
 * and makes each progress tick a full-page layout. Only the visible slice plus a
 * small overscan is mounted, which keeps the list at a constant cost no matter
 * how large the batch is.
 *
 * Rows here are a known fixed height, so no measurement pass is needed.
 */
export function useVirtualList({
  count,
  rowHeight,
  overscan = 6,
}: {
  count: number;
  rowHeight: number;
  overscan?: number;
}) {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ scrollTop: 0, height: 480 });
  // A callback ref observes the list appearing after the initially empty queue.
  const ref = useCallback((element: HTMLDivElement | null) => setNode(element), []);

  useEffect(() => {
    if (!node) return;
    let frame = 0;
    const measure = () => {
      const next = { scrollTop: node.scrollTop, height: node.clientHeight };
      setViewport((previous) => previous.scrollTop === next.scrollTop && previous.height === next.height ? previous : next);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    schedule();
    node.addEventListener("scroll", schedule, { passive: true });
    const observer = new ResizeObserver(schedule);
    observer.observe(node);
    return () => {
      cancelAnimationFrame(frame);
      node.removeEventListener("scroll", schedule);
      observer.disconnect();
    };
  }, [node]);

  const scrollTop = Math.min(viewport.scrollTop, Math.max(0, count * rowHeight - viewport.height));
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(count, Math.ceil((scrollTop + viewport.height) / rowHeight) + overscan);

  return {
    ref,
    start,
    end,
    /** Spacers that preserve the scrollbar's true length. */
    padTop: start * rowHeight,
    padBottom: Math.max(0, (count - end) * rowHeight),
  };
}
