import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Suspense } from "react";
import {
  MobileNavigation,
  MobileNavigationSkeleton,
} from "@/components/layout/mobile-navigation";
import { ThemeProvider, themeInitScript } from "@/components/theme/theme";
import { PwaProviders } from "@/components/pwa";
import {
  createPageTitle,
  DEFAULT_PAGE_TITLE,
  PAGE_TITLE_SUFFIX,
  SITE,
} from "@/lib/site";
import "./globals.css";

const pinSans = localFont({
  src: [
    {
      path: "../../public/fonts/Pin-Sans-MacOS-Regular-708c49dd.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/fonts/Pin-Sans-MacOS-Medium-704a4f34.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../public/fonts/Pin-Sans-MacOS-Bold-ce475d98.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-pin-sans",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: createPageTitle(DEFAULT_PAGE_TITLE),
    template: `%s | ${PAGE_TITLE_SUFFIX}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: [
    "image compressor",
    "compress image",
    "resize image",
    "convert image",
    "png to webp",
    "jpg to webp",
    "bulk image compressor",
    "offline image optimizer",
    "free background remover",
    "image enhancer",
    "private image tools",
  ],
  authors: [{ name: SITE.name }],
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/brand/shrinkfox-favicon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-icon-180.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    title: SITE.name,
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    siteName: SITE.name,
    title: createPageTitle(DEFAULT_PAGE_TITLE),
    description: SITE.description,
    url: SITE.indexable ? SITE.url : undefined,
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "ShrinkFox — free, local image tools",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: createPageTitle(DEFAULT_PAGE_TITLE),
    description: SITE.description,
    images: ["/opengraph-image"],
  },
  robots: { index: SITE.indexable, follow: true },
  category: "technology",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f1ed" },
    { media: "(prefers-color-scheme: dark)", color: "#100f0e" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`h-full ${pinSans.variable}`}
    >
      <head>
        {/* Must run before paint — see themeInitScript for why. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full antialiased">
        <a
          href="#main"
          className="fixed top-3 left-3 z-50 -translate-y-24 rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-bg focus:translate-y-0"
        >
          Skip to content
        </a>
        <ThemeProvider>
          {children}
          <Suspense fallback={<MobileNavigationSkeleton />}>
            <MobileNavigation />
          </Suspense>
        </ThemeProvider>
        <PwaProviders />
      </body>
    </html>
  );
}
