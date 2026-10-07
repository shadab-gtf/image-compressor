"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { FoxMark, type FoxState } from "@/components/brand/fox-mark";

/** Opaque for this long, then it stops blocking input regardless of animation state. */
const HOLD_MS = 900;
const REDUCED_HOLD_MS = 200;

const STANDALONE = "(display-mode: standalone)";

function subscribeDisplayMode(onChange: () => void) {
  const query = window.matchMedia(STANDALONE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * Installed-app launches only. In a browser tab the page itself is already the
 * first paint, so a splash would be pure delay. The server snapshot is `false`
 * because display mode is unknowable until hydration.
 */
function useStandalone() {
  return useSyncExternalStore(
    subscribeDisplayMode,
    () => window.matchMedia(STANDALONE).matches,
    () => false,
  );
}

export function Splash() {
  const reduced = useReducedMotion();
  const standalone = useStandalone();
  const [finished, setFinished] = useState(false);
  const [state, setState] = useState<FoxState>("idle");
  // Hard stop: if AnimatePresence never finishes its exit, this removes the
  // overlay from the tree anyway.
  const [retired, setRetired] = useState(false);

  useEffect(() => {
    if (!standalone) return;

    const hold = reduced ? REDUCED_HOLD_MS : HOLD_MS;
    const timers = [
      window.setTimeout(() => setFinished(true), hold),
      window.setTimeout(() => setRetired(true), hold + 600),
    ];

    if (!reduced) {
      // One compress beat, then a single settle. `working` loops on its own, so
      // it is cut short rather than left running.
      timers.push(window.setTimeout(() => setState("working"), 90));
      timers.push(window.setTimeout(() => setState("done"), 560));
    }

    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [standalone, reduced]);

  if (retired) return null;

  return (
    <AnimatePresence>
      {standalone && !finished && (
        <motion.div
          aria-hidden
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, pointerEvents: "none" }}
          transition={{ duration: reduced ? 0.12 : 0.24, ease: "easeOut" }}
          className="fixed inset-0 z-[100] grid place-items-center bg-bg"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <motion.div
            initial={reduced ? false : { opacity: 0, scale: 0.84 }}
            animate={reduced ? undefined : { opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 24 }}
            className="flex flex-col items-center gap-5"
          >
            <FoxMark size={112} state={state} />
            <span className="text-lg font-semibold tracking-[-0.02em] text-ink">ShrinkFox</span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
