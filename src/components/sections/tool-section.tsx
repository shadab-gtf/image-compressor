import Link from "next/link";
import { Suspense } from "react";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { WorkspaceSkeleton } from "@/components/ui/loading-skeleton";
import { ToolIcon } from "@/components/ui/tool-icon";
import { DoodleIcon } from "@/components/ui/doodle-icon";
import { UploadEntry } from "@/features/bulk/upload-entry";
import { StudioLoader } from "@/features/studio/studio-loader";
import { RecipeLoader } from "@/features/recipes/recipe-loader";
import type { ToolDefinition } from "@/types/catalog";

const stepIcons = ["select-image", "adjust-image", "save-image"] as const;

export function ToolSection({ tool }: { tool: ToolDefinition }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="flex-1">
        <section className="sf-page-shell pb-6 pt-5 md:pb-7 md:pt-7">
          <Link
            href="/#tools"
            className="inline-flex min-h-11 items-center gap-2 text-xs text-muted hover:text-accent"
          >
            <span aria-hidden="true">←</span> All image tools
          </Link>
          <div className="mt-3 flex items-start gap-3 md:gap-4">
            <span className="sf-doodle-badge hidden size-16 shrink-0 place-items-center text-ink sm:grid">
              <ToolIcon name={tool.icon} size={56} />
            </span>
            <div className="min-w-0">
              <h1 className="text-balance text-[1.75rem] font-bold leading-tight tracking-[-0.035em] md:text-4xl">
                {tool.title}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted md:text-base">
                {tool.description}
              </p>
            </div>
          </div>
        </section>
        <section aria-label={tool.name} className="sf-page-shell pb-8 md:pb-12">
          <Suspense fallback={<WorkspaceSkeleton />}>
            {tool.slug === "export-recipes" ? <RecipeLoader /> : tool.mode ? (
              <StudioLoader key={tool.mode} mode={tool.mode} />
            ) : (
              <div className="sf-card-flat p-4 md:p-8">
                <UploadEntry options={tool.options} />
              </div>
            )}
          </Suspense>
          <p className="mt-5 max-w-3xl text-xs leading-6 text-muted">
            {tool.note}
          </p>
        </section>
        <section className="border-t border-line bg-surface-2">
          <div className="sf-page-shell py-10 md:py-12">
            <h2 className="text-2xl font-semibold tracking-tight">
              A few simple steps.
            </h2>
            <ol className="mt-8 grid gap-6 sm:grid-cols-3">
              {tool.steps.map((step, index) => (
                <li
                  key={step}
                  className="sf-usecase rounded-2xl border border-line bg-surface p-5 md:p-6"
                >
                  <div className="flex items-start justify-between gap-4">
                    <span className="sf-doodle-badge grid size-20 place-items-center text-ink">
                      <DoodleIcon
                        name={stepIcons[index] ?? "save-image"}
                        size={68}
                      />
                    </span>
                    <span className="pt-1 font-mono text-xs font-semibold text-accent">
                      0{index + 1}
                    </span>
                  </div>
                  <p className="mt-5 text-sm leading-6 text-ink-2">{step}</p>
                </li>
              ))}
            </ol>
            <div className="mt-8 flex flex-wrap gap-6 text-sm text-muted">
              <Link href="/formats" className="underline underline-offset-4">
                Supported formats & limits
              </Link>
              <Link href="/privacy" className="underline underline-offset-4">
                Privacy
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
