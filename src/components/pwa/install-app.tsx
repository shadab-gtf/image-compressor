"use client";

import { useEffect, useId, useState } from "react";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface InstallAppProps {
  className?: string;
}

export function InstallApp({ className = "" }: InstallAppProps) {
  const helpId = useId();
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
      setHelp(false);
    };
    const onDisplayChange = () => setInstalled(displayMode.matches);
    const timer = window.setTimeout(onDisplayChange, 0);
    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    displayMode.addEventListener("change", onDisplayChange);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      displayMode.removeEventListener("change", onDisplayChange);
    };
  }, []);

  useEffect(() => {
    if (!help) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHelp(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [help]);

  const install = async () => {
    if (!prompt) {
      setHelp((value) => !value);
      return;
    }
    setBusy(true);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
    } catch {
      setHelp(true);
    } finally {
      setPrompt(null);
      setBusy(false);
    }
  };

  return (
    <div className={`relative ${className}`}>
      <button type="button" onClick={() => void install()} disabled={installed || busy} aria-expanded={help} aria-controls={help ? helpId : undefined} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface-3 disabled:cursor-default disabled:opacity-60">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" className="size-4"><path d="M10 2v10m-4-4 4 4 4-4M3 13v4h14v-4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        {installed ? "App installed" : busy ? "Opening installer…" : "Install app"}
      </button>
      {help && (
        <div id={helpId} role="status" className="relative z-50 mt-3 w-full min-w-0 rounded-2xl border border-line bg-surface p-4 text-left text-sm leading-relaxed text-ink-2 shadow-lg md:absolute md:right-0 md:mt-2 md:w-72">
          <p className="font-semibold text-ink">Keep ShrinkFox within reach</p>
          <p className="mt-2">In Chrome or Edge, use the browser menu and choose Install app. On iPhone or iPad, open Safari, tap Share, then Add to Home Screen.</p>
          <p className="mt-2 text-xs text-muted">Open each tool online before using it offline. For background removal, let the model download finish first.</p>
          <button type="button" className="mt-3 min-h-11 font-semibold text-accent-deep" onClick={() => setHelp(false)}>Got it</button>
        </div>
      )}
    </div>
  );
}
