"use client";

import Link from "next/link";
import { useEffect } from "react";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { JsonLd } from "@/components/seo/json-ld";
import {
  IconArrowRight,
  IconBolt,
  IconCheck,
  IconChevronDown,
  IconCompress,
  IconConvert,
  IconLayers,
  IconLock,
  IconOptimize,
  IconResize,
  IconShield,
} from "@/components/ui/icons";
import { UploadEntry } from "@/features/bulk/upload-entry";
import { SITE } from "@/lib/site";
import { getTool, toolJsonLd, toolPath, type ToolIconName, type ToolSlug } from "@/lib/tool-registry";
import { setOptions } from "@/stores/queue-store";

const ICONS: Record<ToolIconName, typeof IconCompress> = {
  compress: IconCompress,
  resize: IconResize,
  convert: IconConvert,
  optimize: IconOptimize,
  layers: IconLayers,
};

const TRUST = [
  {
    icon: IconLock,
    title: "Nothing is uploaded",
    body: "Images are decoded and re-encoded by your own browser. The site's Content-Security-Policy blocks connections to any other origin, so the claim is enforced by the browser rather than promised in a policy document.",
  },
  {
    icon: IconBolt,
    title: "No queue, no round trip",
    body: "There is no server to wait for and no file to send twice. Processing starts the moment you drop a file and runs across as many CPU cores as your device will give it.",
  },
  {
    icon: IconShield,
    title: "Your originals are untouched",
    body: "ShrinkFox reads your files and writes new ones. Nothing on disk is modified, so you can always compare, retry at a different setting, or walk away.",
  },
];

export function ToolPage({ slug }: { slug: ToolSlug }) {
  const tool = getTool(slug);
  const Icon = ICONS[tool.icon];

  // The page is the entry point into the workspace, so it seeds its own preset
  // into the shared queue settings. This is what makes /compress-image-to-500kb
  // arrive with a 500 KB target already selected rather than merely described.
  useEffect(() => {
    setOptions(() => tool.options);
  }, [tool]);

  return (
    <div className="flex min-h-full flex-col">
      <JsonLd data={toolJsonLd(slug)} />
      <SiteHeader />

      <main id="main" className="flex-1">
        {/* ---- Hero ---------------------------------------------------- */}
        <section className="relative overflow-hidden">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-[460px] bg-[radial-gradient(70%_100%_at_50%_0%,var(--sf-accent-softer),transparent_72%)]"
          />
          <div className="relative mx-auto max-w-3xl px-4 pt-10 pb-8 text-center sm:px-6 sm:pt-16">
            <span className="inline-flex items-center gap-2 rounded-full border border-accent/15 bg-accent-soft px-3.5 py-1.5 text-[12.5px] font-medium text-accent-deep dark:text-accent">
              <Icon size={14} />
              {tool.eyebrow}
            </span>

            <h1 className="mt-5 text-[34px] font-semibold leading-[1.08] tracking-[-0.035em] text-ink sm:text-5xl">
              {tool.h1}
            </h1>

            <p className="mx-auto mt-5 max-w-2xl text-[16.5px] leading-relaxed text-ink-2 sm:text-[17.5px]">
              {tool.sub}
            </p>

            <ul className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2.5">
              {SITE.trust.map((item) => (
                <li key={item} className="flex items-center gap-1.5 text-[13px] font-medium text-muted">
                  <IconCheck size={14} className="text-success" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---- The tool ------------------------------------------------ */}
        <section className="mx-auto max-w-3xl px-4 sm:px-6" aria-label="Upload your images">
          <div className="sf-card p-4 sm:p-7">
            <UploadEntry />

            <div className="mt-6 flex flex-wrap items-center justify-center gap-2 border-t border-line pt-5">
              <span className="text-[12.5px] text-muted">Starting settings:</span>
              {tool.presetChips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-full border border-line bg-surface px-3 py-1 text-[12px] font-medium text-ink-2"
                >
                  {chip}
                </span>
              ))}
            </div>
            <p className="mt-3 text-center text-[12.5px] leading-relaxed text-faint">
              Everything above is adjustable once your images are loaded.
            </p>
          </div>
        </section>

        {/* ---- What this does ------------------------------------------ */}
        <section className="mx-auto max-w-3xl px-4 pt-16 sm:px-6 sm:pt-20">
          <h2 className="text-2xl font-semibold tracking-[-0.025em] text-ink sm:text-[28px]">
            About {tool.eyebrow.toLowerCase() === tool.eyebrow ? tool.eyebrow : tool.eyebrow}
          </h2>
          <div className="mt-5 space-y-5">
            {tool.intro.map((paragraph) => (
              <p key={paragraph.slice(0, 48)} className="text-[15.5px] leading-[1.75] text-ink-2">
                {paragraph}
              </p>
            ))}
          </div>
        </section>

        {/* ---- How it works -------------------------------------------- */}
        <section className="mx-auto max-w-5xl px-4 pt-16 sm:px-6 sm:pt-20">
          <h2 className="text-center text-2xl font-semibold tracking-[-0.025em] text-ink sm:text-[28px]">
            How it works
          </h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-3">
            {tool.steps.map((step, index) => (
              <li key={step.title} className="sf-card-flat p-6">
                <span className="flex size-9 items-center justify-center rounded-full bg-accent-soft text-[14px] font-semibold text-accent-deep dark:text-accent">
                  {index + 1}
                </span>
                <h3 className="mt-4 text-[15.5px] font-semibold tracking-[-0.015em] text-ink">
                  {step.title}
                </h3>
                <p className="mt-2 text-[14px] leading-relaxed text-muted">{step.detail}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ---- Trust --------------------------------------------------- */}
        <section className="mx-auto max-w-5xl px-4 pt-16 sm:px-6 sm:pt-20">
          <div className="sf-card-accent p-7 sm:p-10">
            <h2 className="text-center text-2xl font-semibold tracking-[-0.025em] text-ink sm:text-[28px]">
              Why your images never leave this device
            </h2>
            <div className="mt-8 grid gap-7 sm:grid-cols-3">
              {TRUST.map((item) => (
                <div key={item.title}>
                  <span className="flex size-10 items-center justify-center rounded-xl border border-accent/15 bg-surface text-accent">
                    <item.icon size={18} />
                  </span>
                  <h3 className="mt-4 text-[15.5px] font-semibold tracking-[-0.015em] text-ink">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---- FAQ ----------------------------------------------------- */}
        <section className="mx-auto max-w-3xl px-4 pt-16 sm:px-6 sm:pt-20">
          <h2 className="text-2xl font-semibold tracking-[-0.025em] text-ink sm:text-[28px]">
            Questions, answered
          </h2>
          <div className="mt-7 space-y-3">
            {tool.faqs.map((faq) => (
              <details key={faq.question} className="group sf-card-flat px-5 py-1 sm:px-6">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-left text-[15.5px] font-medium tracking-[-0.012em] text-ink marker:hidden">
                  {faq.question}
                  <IconChevronDown
                    size={18}
                    className="shrink-0 text-faint transition-transform duration-200 group-open:rotate-180"
                  />
                </summary>
                <p className="pb-5 text-[14.5px] leading-[1.7] text-ink-2">{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ---- Related ------------------------------------------------- */}
        <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-20">
          <h2 className="text-2xl font-semibold tracking-[-0.025em] text-ink sm:text-[28px]">
            Related tools
          </h2>
          <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tool.related.map((relatedSlug) => {
              const related = getTool(relatedSlug);
              const RelatedIcon = ICONS[related.icon];
              return (
                <Link
                  key={relatedSlug}
                  href={toolPath(relatedSlug)}
                  className="sf-card-flat group flex items-start gap-3.5 p-5 transition-colors hover:border-accent/30 hover:bg-accent-softer"
                >
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-deep dark:text-accent">
                    <RelatedIcon size={17} />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-[14.5px] font-semibold tracking-[-0.015em] text-ink">
                      {related.h1}
                      <IconArrowRight
                        size={14}
                        className="text-faint transition-transform duration-200 group-hover:translate-x-0.5"
                      />
                    </span>
                    <span className="mt-1 block text-[13px] leading-relaxed text-muted">
                      {related.sub}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
