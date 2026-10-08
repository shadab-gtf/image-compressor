"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DoodleIcon } from "@/components/ui/doodle-icon";

export function ServiceWorker() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [reloading, setReloading] = useState(false);
  // controllerchange also fires on the very first install, when there was no
  // previous controller. Reloading then would bounce a page the user just
  // opened, so the reload is armed only by the update button.
  const armed = useRef(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;

    const container = navigator.serviceWorker;
    let registration: ServiceWorkerRegistration | null = null;
    let cancelled = false;
    const cleanups: Array<() => void> = [];

    const onControllerChange = () => {
      if (!armed.current) return;
      armed.current = false;
      window.location.reload();
    };
    container.addEventListener("controllerchange", onControllerChange);

    const watch = (worker: ServiceWorker | null) => {
      if (!worker) return;
      const check = () => {
        // "installed" with an existing controller means a replacement is parked
        // in the waiting state; without one it is the first install, which needs
        // no prompt.
        if (worker.state === "installed" && container.controller)
          setWaiting(worker);
      };
      check();
      worker.addEventListener("statechange", check);
      cleanups.push(() => worker.removeEventListener("statechange", check));
    };

    const register = async () => {
      try {
        registration = await container.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
      } catch {
        // Service workers are disabled in some private sessions. Every image
        // tool works without one; only offline reuse is lost.
        return;
      }
      if (cancelled || !registration) return;

      if (registration.waiting && container.controller)
        setWaiting(registration.waiting);
      watch(registration.installing);

      const onUpdateFound = () => watch(registration?.installing ?? null);
      registration.addEventListener("updatefound", onUpdateFound);
      cleanups.push(() =>
        registration?.removeEventListener("updatefound", onUpdateFound),
      );
    };

    // Registering competes with the first paint for bandwidth, so it waits for
    // load rather than racing the page the user is trying to read.
    const onLoad = () => void register();
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener("load", onLoad);
      container.removeEventListener("controllerchange", onControllerChange);
      for (const off of cleanups) off();
    };
  }, []);

  const update = useCallback(() => {
    if (!waiting) return;
    armed.current = true;
    setReloading(true);
    waiting.postMessage({ type: "SKIP_WAITING" });
    // The worker may already be redundant, in which case controllerchange never
    // arrives. Reload anyway rather than leaving a spinner running forever.
    window.setTimeout(() => {
      if (armed.current) {
        armed.current = false;
        window.location.reload();
      }
    }, 3000);
  }, [waiting]);

  const open = Boolean(waiting) && !dismissed;

  return (
    <>
      {open && (
        <div
          role="status"
          aria-live="polite"
          className="sf-notice-enter fixed inset-x-3 top-[calc(4rem+0.75rem)] z-50 mx-auto grid max-w-lg grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 rounded-2xl border border-line bg-surface p-3 pl-4 shadow-lg sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center md:top-auto md:left-auto md:right-6 md:bottom-6 md:mx-0"
        >
          <p className="min-w-0 flex-1 text-sm leading-snug text-ink-2">
            <span className="font-semibold text-ink">
              A ShrinkFox update is ready.
            </span>{" "}
            Download any results you want to keep, then reload to update.
          </p>
          <Button
            size="sm"
            variant="primary"
            loading={reloading}
            onClick={update}
            iconLeft={<DoodleIcon name="retry" size={15} />}
            className="col-span-2 row-start-2 min-h-11 w-full sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:w-auto"
          >
            Reload to update
          </Button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss update notice"
            className="col-start-2 row-start-1 grid size-11 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface-3 hover:text-ink sm:col-start-3"
          >
            <DoodleIcon name="close" size={15} />
          </button>
        </div>
      )}
    </>
  );
}
