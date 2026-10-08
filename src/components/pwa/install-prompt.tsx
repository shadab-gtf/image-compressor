"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FoxMarkStatic } from "@/components/brand/fox-mark-static";
import { DoodleIcon } from "@/components/ui/doodle-icon";
import { useJobs, useRunState } from "@/stores/queue-store";

const DISMISS_KEY = "shrinkfox:install-dismissed";
const EDITOR_ROUTES = new Set(["/app", "/remove-background", "/enhance-image"]);

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
}

/** localStorage throws outright in some private sessions, so both sides are guarded. */
function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDismissed() {
  try {
    window.localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // Dismissal lasts for this session only.
  }
}

export function InstallPrompt() {
  const pathname = usePathname();
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = useRunState();
  const jobs = useJobs();
  const working =
    run === "running" || jobs.some((job) => job.status === "processing");

  useEffect(() => {
    const onPrompt = (incoming: Event) => {
      // Chrome shows its own mini-infobar unless the event is cancelled.
      incoming.preventDefault();
      // The stored dismissal is read here rather than on mount: this event is
      // the only moment it can matter, and reading it lazily keeps a storage
      // call out of render and out of the effect body.
      if (readDismissed()) return;
      setEvent(incoming as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setEvent(null);
      writeDismissed();
      setDismissed(true);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const close = () => {
    writeDismissed();
    setDismissed(true);
  };

  const install = async () => {
    if (!event) return;
    setBusy(true);
    try {
      await event.prompt();
      await event.userChoice;
    } catch {
      // The event is single-use; a rejection means the browser declined to show
      // it, and there is nothing useful to say about that.
    } finally {
      setEvent(null);
      setBusy(false);
    }
  };

  // Never interrupt a batch: the bar sits at the bottom of the viewport, which
  // is exactly where the queue's progress and actions live.
  const open =
    Boolean(event) && !dismissed && !working && !EDITOR_ROUTES.has(pathname);

  return (
    <>
      {open && (
        <div
          className="sf-notice-enter fixed inset-x-3 bottom-[calc(var(--sf-mobile-nav-height,0px)+0.75rem)] z-40 mx-auto flex max-w-xl items-center gap-2 rounded-3xl border border-line bg-surface p-3 pl-4 shadow-lg sm:gap-4 sm:p-4 sm:pl-5 md:bottom-5"
        >
          <FoxMarkStatic size={34} className="hidden sm:block" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">Install ShrinkFox</p>
            <p className="mt-0.5 text-[13px] leading-snug text-ink-2">
              Keep your image tools one tap away. Open them online first to use them offline.
            </p>
          </div>
          <Button
            size="sm"
            variant="primary"
            className="min-h-11 shrink-0"
            loading={busy}
            onClick={() => void install()}
          >
            Install
          </Button>
          <button
            type="button"
            onClick={close}
            aria-label="Dismiss install prompt"
            className="grid size-11 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface-3 hover:text-ink"
          >
            <DoodleIcon name="close" size={15} />
          </button>
        </div>
      )}
    </>
  );
}
