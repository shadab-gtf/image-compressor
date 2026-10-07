import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { ToolIcon } from "@/components/ui/tool-icon";
import { DoodleIcon } from "@/components/ui/doodle-icon";
import { FaqIllustration } from "@/components/ui/faq-illustration";
import { UploadEntry } from "@/features/bulk/upload-entry";
import { BeforeAfter } from "@/features/showcase/before-after";
import type { SiteCatalog } from "@/types/catalog";
import { SHOWCASE } from "@/lib/api/showcase";
import { JsonLd } from "@/components/seo/json-ld";
import type { getApplicationStructuredData } from "@/lib/api/structured-data";

const useCases = [
  {
    label: "For your storefront",
    title: "Product photos ready for your shop.",
    description:
      "Remove a plain backdrop, give your catalog consistent dimensions and reduce file sizes before listing your products.",
    href: "/remove-background",
    linkLabel: "Remove a background",
    symbol: "01",
    icon: "storefront",
    tags: "Product photos · Catalogs",
  },
  {
    label: "For your website",
    title: "Give visitors less to download.",
    description:
      "Resize oversized photos and convert to WebP for lighter blog posts, portfolios and landing pages.",
    href: "/compress-image",
    linkLabel: "Compress website images",
    symbol: "02",
    icon: "website",
    tags: "Websites · Portfolios",
  },
  {
    label: "For your content",
    title: "Get your next post ready.",
    description:
      "Start with a preset for a social post, thumbnail or link preview. Check the crop, then fine-tune your photo before sharing.",
    href: "/resize-image",
    linkLabel: "Resize a photo",
    symbol: "03",
    icon: "content",
    tags: "Social media · Creators",
  },
] as const;

export function HomeSection({
  catalog,
  structuredData,
}: {
  catalog: SiteCatalog;
  structuredData: ReturnType<typeof getApplicationStructuredData>;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <JsonLd data={structuredData} />
      <SiteHeader />
      <main id="main" className="flex-1">
        <section className="sf-page-shell grid items-center gap-10 pb-12 pt-8 md:gap-12 md:pt-12 lg:grid-cols-[1fr_1fr] lg:gap-16 lg:pb-20 lg:pt-16">
          <div>
            <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/15 bg-accent-softer px-3 py-1.5 text-xs font-semibold text-accent-deep dark:text-accent">
              <span className="size-1.5 rounded-full bg-accent" /> FREE ONLINE
              IMAGE TOOLS
            </p>
            <h1 className="max-w-xl text-[clamp(3.1rem,6vw,5.2rem)] font-bold leading-[1.02] tracking-[-0.065em]">
              Image tools.
              <br />
              <span className="text-accent">Made simple.</span>
            </h1>
            <p className="mt-6 max-w-md text-base leading-7 text-muted sm:text-lg">
              Get photos ready for your website, shop or next post. Compress,
              resize, convert and edit images in your browser. Your files stay
              on your device.
            </p>
            <div className="mt-8 max-w-md">
              <UploadEntry variant="hero" />
            </div>
            <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
              {["No signup", "No watermark", "No credit card required"].map((item) => (
                <li key={item} className="inline-flex items-center gap-1.5">
                  <DoodleIcon name="check" size={14} className="text-success" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative min-w-0">
            <div
              aria-hidden
              className="absolute -inset-2 rounded-[32px] bg-accent-soft/40 sm:-inset-3 sm:rounded-[40px]"
            />
            <div className="relative rounded-3xl border border-line bg-surface p-3 shadow-xl sm:p-4">
              <div className="flex items-center justify-between px-1 pb-3 text-xs text-muted">
                <span className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-success" /> A smaller
                  file. Take a closer look.
                </span>
                <span className="font-mono">01 / 01</span>
              </div>
              <BeforeAfter
                before="/samples/still-life-original.jpg"
                after="/samples/still-life-optimized.webp"
                alt="Terracotta vase with olive branches in warm sunlight"
                width={1200}
                height={800}
                eager
              />
              <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-2 pb-1">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted">
                    Before · JPEG
                  </p>
                  <p className="mt-1 text-xl font-semibold tracking-tight">
                    {SHOWCASE.originalLabel}
                  </p>
                </div>
                <span className="text-faint">→</span>
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted">
                    After · WebP
                  </p>
                  <p className="mt-1 text-xl font-semibold tracking-tight text-success">
                    {SHOWCASE.outputLabel}{" "}
                    <span className="ml-1 rounded-full bg-success-soft px-2 py-1 text-xs">
                      −{SHOWCASE.savedPercent}%
                    </span>
                  </p>
                </div>
              </div>
            </div>
            <p className="mt-6 text-center text-xs text-muted">
              Drag to compare the original and WebP · Results vary by image
            </p>
          </div>
        </section>

        <div className="border-y border-line bg-surface/60">
          <div className="sf-page-shell flex flex-wrap items-center justify-between gap-x-8 gap-y-4 py-6 text-[13px] font-medium text-ink-2">
            <span className="inline-flex items-center gap-2">
              <DoodleIcon name="lock" size={18} /> Your photos stay on your device
            </span>
            <span className="inline-flex items-center gap-2">
              <DoodleIcon name="bolt" size={18} /> Edit right in your browser
            </span>
            <span className="inline-flex items-center gap-2">
              <DoodleIcon name="shield" size={18} /> No credits. No daily
              quotas.
            </span>
            <Link
              href="/formats"
              className="inline-flex items-center gap-2 hover:text-accent"
            >
              JPG · PNG · WebP & more <DoodleIcon name="arrow" size={16} />
            </Link>
          </div>
        </div>

        <section id="tools" className="sf-page-shell py-12 md:py-16 lg:py-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="sf-eyebrow">WHAT DO YOU NEED TO DO?</p>
              <h2 className="sf-heading mt-3">
                Image tools for everyday work.
              </h2>
            </div>
            <p className="max-w-xs text-sm leading-6 text-muted">
              Shrink a large upload, remove a background or get a whole folder
              ready to publish. Start with the job you need to do.
            </p>
          </div>
          <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {catalog.tools
              .filter((tool) => tool.featured)
              .map((tool) => (
                <Link
                  key={tool.slug}
                  href={`/${tool.slug}`}
                  className="sf-interactive-card group flex flex-col rounded-2xl border border-line bg-surface p-6 md:p-7"
                >
                  <div className="flex items-start justify-between">
                    <span className="sf-doodle-badge grid size-20 place-items-center text-ink">
                      <ToolIcon name={tool.icon} size={72} />
                    </span>
                    {tool.badge && (
                      <span className="rounded-full border border-line px-2.5 py-1 text-[10px] font-semibold text-muted">
                        {tool.badge}
                      </span>
                    )}
                  </div>
                  <h3 className="mt-6 flex items-center justify-between text-lg font-semibold tracking-tight">
                    {tool.name}
                    <DoodleIcon
                      name="arrow"
                      size={18}
                      className="text-faint transition-transform group-hover:translate-x-1 group-hover:text-accent"
                    />
                  </h3>
                  <p className="mt-2 text-sm text-muted">
                    {tool.shortDescription}
                  </p>
                </Link>
              ))}
          </div>
        </section>

        <section className="border-y border-line bg-surface-2">
          <div className="sf-page-shell py-12 md:py-16">
            <p className="sf-eyebrow">FROM PRODUCT PHOTOS TO YOUR NEXT POST</p>
            <h2 className="sf-heading mt-3">
              Built for whatever you&apos;re making.
            </h2>
            <div className="mt-10 grid gap-8 md:grid-cols-3">
              {useCases.map((item) => (
                <article
                  key={item.label}
                  className="sf-usecase border-t border-line-strong pt-5"
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="sf-doodle-badge grid size-24 shrink-0 place-items-center text-ink">
                      <DoodleIcon name={item.icon} size={80} />
                    </span>
                    <span className="font-mono text-xs text-faint">
                      {item.symbol}
                    </span>
                  </div>
                  <p className="mt-5 text-xs font-medium text-muted">
                    {item.label}
                  </p>
                  <h3 className="mt-3 text-xl font-semibold tracking-tight">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-muted">
                    {item.description}
                  </p>
                  <p className="mt-5 text-xs text-muted">{item.tags}</p>
                  <Link
                    href={item.href}
                    className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-accent-deep dark:text-accent"
                  >
                    {item.linkLabel} <DoodleIcon name="arrow" size={17} />
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="sf-page-shell grid gap-10 py-12 md:py-16 lg:grid-cols-[0.85fr_1.15fr] lg:py-20">
          <div>
            <span className="sf-doodle-badge inline-flex size-16 items-center justify-center text-ink">
              <DoodleIcon name="lock" size={40} />
            </span>
            <h2 className="sf-heading mt-5">
              Your photos stay
              <br />
              on your device.
            </h2>
            <p className="mt-5 max-w-sm text-sm leading-7 text-muted">
              Choose a photo without sending it to a server. ShrinkFox runs
              compression, resizing and background removal on your device.
              Download the results you want to keep when you are done.
            </p>
            <Link
              href="/privacy"
              className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-ink"
            >
              How we handle privacy <DoodleIcon name="arrow" size={18} />
            </Link>
          </div>
          <div className="rounded-3xl border border-line bg-surface p-7 sm:p-9">
            {[
              {
                number: "01",
                icon: "select-image" as const,
                title: "Choose your images",
                body: "Start with one photo, drop in a batch or choose a folder.",
              },
              {
                number: "02",
                icon: "adjust-image" as const,
                title: "Choose the right settings",
                body: "Try a preset for a website, product photo or social post. Adjust the size, quality and format as needed.",
              },
              {
                number: "03",
                icon: "save-image" as const,
                title: "Review and download",
                body: "Check the result and file size, then save individual images or download a batch ZIP.",
              },
            ].map((step, index) => (
              <div
                key={step.number}
                className={`sf-usecase flex gap-4 sm:gap-5 ${index ? "mt-6 border-t border-line pt-6" : ""}`}
              >
                <span className="sf-doodle-badge grid size-16 shrink-0 place-items-center text-ink">
                  <DoodleIcon name={step.icon} size={56} />
                </span>
                <div>
                  <p className="mb-1 font-mono text-[10px] font-semibold text-accent">
                    STEP {step.number}
                  </p>
                  <h3 className="text-base font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    {step.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="faq" className="border-t border-line">
          <div className="sf-page-shell grid gap-8 py-12 md:py-16 lg:grid-cols-[0.85fr_1.15fr] lg:gap-10">
            <div>
              <p className="sf-eyebrow">BEFORE YOU GET STARTED</p>
              <h2 className="sf-heading mt-3 max-w-lg">
                Questions about your images?
              </h2>
              <p className="mt-4 max-w-sm text-sm leading-7 text-muted">
                A few useful things to know about file formats, image quality
                and keeping your photos private.
              </p>
              <FaqIllustration className="mt-6 h-auto w-full max-w-[520px] text-ink sm:mt-8" />
            </div>
            <div className="divide-y divide-line">
              {catalog.faqs.map((faq) => (
                <details key={faq.question} className="group py-5">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-5 text-sm font-semibold">
                    <h3 className="flex w-full items-center justify-between gap-5 text-sm font-semibold">
                      {faq.question}
                      <span
                        aria-hidden
                        className="text-xl font-normal text-muted transition-transform group-open:rotate-45"
                      >
                        +
                      </span>
                    </h3>
                  </summary>
                  <p className="mt-4 pr-7 text-sm leading-7 text-muted">
                    {faq.answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>
        <section className="sf-page-shell pb-12 md:pb-16">
          <div className="rounded-3xl border border-accent/15 bg-accent-soft px-6 py-10 text-center sm:py-14">
            <h2 className="sf-heading">Got an image to work on?</h2>
            <p className="mt-3 text-sm text-ink-2">
              Open the free workspace and choose your files. No signup, no
              watermark and no credit card required.
            </p>
            <Link
              href="/app"
              className="mt-6 inline-flex items-center gap-3 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-on-accent shadow-accent transition-colors hover:bg-accent-hover"
            >
              Choose your images <DoodleIcon name="arrow" size={19} />
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
