import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import type { FormatInfo } from "@/types/catalog";

export function FormatSection({ formats }: { formats: readonly FormatInfo[] }) {
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main id="main" className="sf-page-shell py-8 md:py-12">
        <p className="sf-eyebrow">IMAGE FORMAT GUIDE</p>
        <h1 className="sf-heading mt-4">Supported image formats and limits.</h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-muted">
          See which images you can open and download in ShrinkFox. Support can
          vary by browser, so the tools check the file and available export
          formats before processing. Renaming a file does not change its format.
        </p>
        <div className="mt-9 overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <caption className="sr-only">
              Formats supported by the compression and conversion tools
            </caption>
            <thead className="bg-surface-3">
              <tr>
                {["Format", "Open", "Download as", "Good to know"].map(
                  (label) => (
                    <th
                      key={label}
                      scope="col"
                      className="p-4 text-xs font-semibold"
                    >
                      {label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="bg-surface">
              {formats.map((format) => (
                <tr key={format.name} className="border-t border-line">
                  <th scope="row" className="p-4 font-medium">
                    {format.name}
                  </th>
                  <td className="p-4 text-muted">{format.input}</td>
                  <td className="p-4 text-muted">{format.output}</td>
                  <td className="max-w-xs p-4 text-muted">{format.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <section className="mt-10 grid gap-5 md:grid-cols-2">
          <article className="rounded-2xl border border-line bg-surface p-6">
            <h2 className="text-lg font-semibold">
              File size and batch limits
            </h2>
            <p className="mt-3 text-sm leading-7 text-muted">
              The compression workspace accepts up to 128 MiB per file, 40
              megapixels per image and 16,384 pixels on either side. Your device
              may run out of memory before those limits, so start with a smaller
              batch on mobile. Keep your originals and download the results
              before closing the tab.
            </p>
          </article>
          <article className="rounded-2xl border border-line bg-surface p-6">
            <h2 className="text-lg font-semibold">
              Background removal and enhancement
            </h2>
            <p className="mt-3 text-sm leading-7 text-muted">
              These tools accept files up to 40 MiB, 24 megapixels and 8,192
              pixels on either side, and save the result as PNG. Every enlarged
              export must stay within those limits. Enhancement automatically
              fits large images and exports to the canvas. Fast enhance defaults
              to original resolution with a 6 MP output budget; optional tiled AI
              modes allow up to 24 MP output and take longer.
              BiRefNet Lite handles general subjects and downloads about 192 MB
              of model data; Portrait AI offers a smaller model for people.
              AI predicts detail and masks, so check the result before saving.
            </p>
          </article>
        </section>
        <p className="mt-7 text-sm leading-7 text-muted">
          Choose PNG for a lossless export or to keep a transparent background.
          Resizing or reducing the number of PNG colors still changes the image.
          A strict file-size target may require a smaller picture. Browser
          exports can also change color profiles, print information and HDR
          appearance, so check your result before replacing the original.
        </p>
        <Link
          href="/app"
          className="mt-8 inline-flex rounded-full bg-accent px-6 py-3 text-sm font-semibold text-on-accent"
        >
          Start working with your images →
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}
