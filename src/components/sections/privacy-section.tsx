import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";

export function PrivacySection() {
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main id="main" className="sf-page-shell py-8 md:py-12">
        <p className="sf-eyebrow">HOW YOUR IMAGES ARE HANDLED</p>
        <h1 className="sf-heading mt-4">Your images stay on your device.</h1>
        <p className="mt-6 max-w-3xl text-base leading-8 text-muted md:text-lg">
          Choose a photo, make your changes and download the result. ShrinkFox
          does the editing in your browser, so you don&apos;t need to upload
          your images or create an account.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[
            [
              "Where your images go",
              "The files you choose and the results you create stay in your current tab while you work. ShrinkFox does not upload them or save them to an online account. Download what you want to keep before refreshing or closing the tab. Your browser and device manage their own memory and temporary storage.",
            ],
            [
              "What your browser downloads",
              "Opening ShrinkFox downloads the files needed to run the website. AI tools also download their model and supporting files from this site on first use. These requests do not include your photos. The hosting provider may record normal visit details, such as your IP address and browser type.",
            ],
            [
              "What is saved for next time",
              "ShrinkFox remembers your theme and whether you dismissed the install prompt. Presets you save contain image settings and names, never your photos. You can export, import or delete them in Settings. Your browser can also cache website files, encoders and AI models for offline use. Images and edited results are not part of this cache. Private browsing, low storage or clearing site data can remove saved settings and website files.",
            ],
            [
              "Details stored inside photos",
              "Photos can contain hidden details such as the date, camera or location. The compressor removes personal metadata by default and keeps only corrected JPEG orientation where needed. Keeping supported JPEG EXIF metadata is optional and can retain sensitive details. Background removal and enhancement exports do not copy source metadata. Check the finished file before sharing sensitive work.",
            ],
            [
              "Analytics and tracking",
              "ShrinkFox does not include advertising trackers, third-party analytics or tracking cookies. Installing it as an app gives you another way to open the same tools; it does not create an account or start uploading images in the background.",
            ],
            [
              "How to clear saved data",
              "Use your browser's site settings to clear ShrinkFox data, remove downloaded AI files or reset permissions. You can also uninstall the app through your browser or device settings. Closing the tab clears the working session. Images you downloaded stay wherever you saved them.",
            ],
          ].map(([title, body]) => (
            <section
              key={title}
              className="rounded-2xl border border-line bg-surface p-5 md:p-7"
            >
              <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
              <p className="mt-3 text-sm leading-7 text-muted">{body}</p>
            </section>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
