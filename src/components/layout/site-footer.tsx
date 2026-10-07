import Link from "next/link";
import { FoxMarkStatic } from "@/components/brand/fox-mark-static";
import { DoodleIcon } from "@/components/ui/doodle-icon";
const groups = [
  {
    title: "Image tools",
    links: [
      { href: "/compress-image", label: "Compress image" },
      { href: "/resize-image", label: "Resize image" },
      { href: "/crop-image", label: "Crop & rotate" },
      { href: "/export-recipes", label: "Export recipes" },
      { href: "/convert-image", label: "Convert image" },
      { href: "/bulk-image-compressor", label: "Batch image compressor" },
    ],
  },
  {
    title: "Edit and convert",
    links: [
      { href: "/remove-background", label: "Remove background" },
      { href: "/enhance-image", label: "Enhance image" },
      { href: "/png-to-webp", label: "PNG to WebP" },
      { href: "/webp-to-jpg", label: "WebP to JPG" },
    ],
  },
  {
    title: "Help and guides",
    links: [
      { href: "/formats", label: "Formats & limits" },
      { href: "/guides", label: "Image guides" },
      { href: "/privacy", label: "Privacy" },
      { href: "/#faq", label: "Questions & answers" },
      { href: "/compress-image-to-100kb", label: "Compress to 100 KB" },
    ],
  },
];
export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface-2">
      <div className="sf-page-shell py-10 md:py-12">
        <div className="grid gap-10 md:grid-cols-[1fr_2fr]">
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-2.5 text-lg font-bold tracking-tight"
            >
              <FoxMarkStatic size={28} />
              Shrink<span className="-ml-2.5 text-accent">Fox.</span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-6 text-muted">
              Compress, resize and convert images, remove backgrounds or adjust
              photo color. Free tools that work in your browser.
            </p>
            <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-success">
              <DoodleIcon name="lock" size={15} /> Your images stay on your
              device.
            </p>
          </div>
          <nav
            aria-label="Footer"
            className="grid grid-cols-2 gap-6 sm:grid-cols-3"
          >
            {groups.map((group) => (
              <div key={group.title}>
                <h2 className="text-xs font-semibold text-ink">
                  {group.title}
                </h2>
                <ul className="mt-2">
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="inline-flex min-h-11 items-center text-xs text-muted transition-colors hover:text-accent"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6 text-xs text-muted">
          <p>Free to use. No added watermarks.</p>
          <p>
            Developed by{" "}
            <a
              href="https://www.gtftechnologies.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center font-medium text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:text-accent"
            >
              GTF Technologies
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </p>
          <p>No signup · No subscriptions · No image uploads</p>
        </div>
      </div>
    </footer>
  );
}
