"use client";

import { Suspense, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { InstallPrompt } from "./install-prompt";
import { ServiceWorker } from "./service-worker";
const Splash = dynamic(() => import("./splash").then((module) => module.Splash), { ssr: false });

function subscribeDisplayMode(notify: () => void) {
  const query = window.matchMedia("(display-mode: standalone)");
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}
const standaloneSnapshot = () => window.matchMedia("(display-mode: standalone)").matches;
const serverSnapshot = () => false;

/** Every progressive-enhancement surface, so the root layout needs one import. */
export function PwaProviders() {
  const standalone = useSyncExternalStore(subscribeDisplayMode, standaloneSnapshot, serverSnapshot);
  return (
    <>
      <ServiceWorker />
      {standalone && <Splash />}
      <Suspense fallback={null}>
        <InstallPrompt />
      </Suspense>
    </>
  );
}
