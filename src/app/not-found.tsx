import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main" className="mx-auto grid w-full max-w-2xl flex-1 place-items-center px-5 py-24 text-center">
        <div>
          <p className="font-mono text-sm font-semibold text-accent-deep">404 · Page not found</p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-ink">We couldn’t find that page.</h1>
          <p className="mt-4 text-base leading-relaxed text-muted">The link may be out of date or the address may have a typo. Choose an image tool from the home page to get started.</p>
          <Link href="/" className="mt-8 inline-flex min-h-12 items-center justify-center rounded-full bg-accent px-7 py-3 text-sm font-semibold text-on-accent hover:bg-accent-hover">Explore image tools</Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
