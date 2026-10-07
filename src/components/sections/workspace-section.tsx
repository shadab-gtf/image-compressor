import { Suspense } from "react";
import { SiteHeader } from "@/components/layout/site-header";
import { WorkspaceSkeleton } from "@/components/ui/loading-skeleton";
import { Workspace } from "@/features/bulk/workspace";

export function WorkspaceSection() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="flex flex-1 flex-col">
        <div className="sf-page-shell border-b border-line py-5">
          <p className="sf-eyebrow">IMAGE WORKSPACE</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            Compress, resize and convert your images.
          </h1>
          <p className="mt-2 text-sm text-muted">
            Add your files, choose the settings you need and download the
            results. Everything is processed in your browser.
          </p>
        </div>
        <Suspense fallback={<WorkspaceSkeleton />}>
          <Workspace />
        </Suspense>
      </main>
    </div>
  );
}
