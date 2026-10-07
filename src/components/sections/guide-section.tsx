import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import type { ImageGuide } from "@/lib/api/guides";
export function GuideSection({ guide }: { guide: ImageGuide }) {
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main id="main" className="sf-page-shell py-10 md:py-16">
        <article className="max-w-4xl">
          <Link
            href="/guides"
            className="inline-flex min-h-11 text-sm text-accent"
          >
            All image guides
          </Link>
          <p className="sf-eyebrow mt-6">PRACTICAL IMAGE GUIDES</p>
          <h1 className="sf-heading mt-4">{guide.title}</h1>
          <p className="mt-6 text-lg leading-8 text-muted">
            {guide.description}
          </p>
          {guide.sections.map((section) => (
            <section key={section.heading} className="mt-10">
              <h2 className="text-2xl font-semibold tracking-tight">
                {section.heading}
              </h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="mt-4 leading-8 text-ink-2">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
          <section className="mt-10 rounded-3xl border border-line bg-surface-2 p-6">
            <h2 className="text-xl font-semibold">Try it with your image</h2>
            <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
              {guide.tools.map((tool) => (
                <li key={tool.href}>
                  <Link
                    href={tool.href}
                    className="inline-flex min-h-11 items-center text-accent underline underline-offset-4"
                  >
                    {tool.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
