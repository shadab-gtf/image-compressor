import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { DoodleIcon } from "@/components/ui/doodle-icon";
import type { ImageGuide } from "@/lib/api/guides";
export function GuidesSection({ guides }: { guides: ImageGuide[] }) {
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main id="main" className="sf-page-shell py-10 md:py-16">
        <p className="sf-eyebrow">HELP FOR THE NEXT IMAGE</p>
        <h1 className="sf-heading mt-4">A few useful image guides.</h1>
        <p className="mt-5 max-w-2xl text-muted">
          Choose the right format, meet an upload limit or prepare a cleaner
          product photo. Practical steps you can try with your own files.
        </p>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {guides.map((guide) => (
            <Link
              key={guide.slug}
              href={`/guides/${guide.slug}`}
              className="sf-card-flat p-6 motion-safe:transition-transform motion-safe:hover:-translate-y-1"
            >
              <DoodleIcon name="image" size={42} />
              <h2 className="mt-4 text-xl font-semibold">{guide.title}</h2>
              <p className="mt-3 text-sm leading-6 text-muted">
                {guide.description}
              </p>
              <span className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-accent">
                Read guide →
              </span>
            </Link>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
