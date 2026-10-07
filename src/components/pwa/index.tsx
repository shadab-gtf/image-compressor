"use client";

import { Suspense } from "react";
import { InstallPrompt } from "./install-prompt";
import { ServiceWorker } from "./service-worker";
import { Splash } from "./splash";

/** Every progressive-enhancement surface, so the root layout needs one import. */
export function PwaProviders() {
  return (
    <>
      <ServiceWorker />
      <Splash />
      <Suspense fallback={null}>
        <InstallPrompt />
      </Suspense>
    </>
  );
}

export { InstallPrompt, ServiceWorker, Splash };
