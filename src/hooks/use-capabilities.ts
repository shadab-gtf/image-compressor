"use client";

import { useEffect, useState } from "react";
import type { CodecSupport } from "@/codecs/capabilities";
import { getCapabilities } from "@/services/processing-service";

/**
 * Codec support for this browser.
 *
 * Returns null until the probe resolves. Callers must treat null as "not known
 * yet" and avoid offering format choices — showing AVIF optimistically and then
 * failing the encode is exactly the behaviour this product promises not to have.
 */
export function useCapabilities(): CodecSupport | null {
  const [support, setSupport] = useState<CodecSupport | null>(null);

  useEffect(() => {
    let active = true;
    getCapabilities()
      .then((result) => {
        if (active) setSupport(result);
      })
      .catch(() => {
        // The probe spawns a worker; if that fails the workspace surfaces its
        // own error state, so there is nothing useful to do here.
      });
    return () => {
      active = false;
    };
  }, []);

  return support;
}

/** Media query hook used to pick between the sidebar and the bottom sheet. */
export function useMediaQuery(query: string): boolean {
  // Defaults to false on the server so the mobile layout renders first and the
  // desktop layout is opted into after mount — never the other way round.
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
