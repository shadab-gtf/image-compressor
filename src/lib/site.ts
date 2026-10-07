import type { Metadata } from "next";

function resolveSiteUrl(): URL {
  const value = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const url = new URL(value || "https://shrinkfox.vercel.app");
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL must be an HTTP(S) origin without credentials.",
    );
  }
  return new URL(url.origin);
}

const siteUrl = resolveSiteUrl();
const isPublicOrigin =
  !["localhost", "127.0.0.1", "[::1]"].includes(siteUrl.hostname);

export const SITE = {
  name: "ShrinkFox",
  tagline: "Your images. Your device. Your toolkit.",
  description:
    "Free image tools to compress, resize and convert photos, remove backgrounds and upscale with AI. " +
    "Work in your browser without uploads, signup or added watermarks.",
  url: siteUrl.origin,
  indexable:
    isPublicOrigin &&
    process.env.NODE_ENV === "production" &&
    process.env.VERCEL_ENV !== "preview" &&
    process.env.VERCEL_ENV !== "development" &&
    process.env.DISABLE_INDEXING !== "true",
  trust: ["Local processing", "Free to use", "No sign-up", "No image uploads"],
} as const;

export const DEFAULT_PAGE_TITLE =
  "Free Image Compressor, Converter & Background Remover";
export const PAGE_TITLE_SUFFIX = `No watermark | No signup | No credit card required | ${SITE.name}`;

export function createPageTitle(title: string): string {
  return `${title} | ${PAGE_TITLE_SUFFIX}`;
}

export const FORMAT_LABELS = [
  "JPG",
  "PNG",
  "WebP",
  "AVIF",
  "GIF",
  "BMP",
] as const;

export const PUBLIC_PATHS = [
  "/",
  "/compress-image",
  "/resize-image",
  "/crop-image",
  "/export-recipes",
  "/convert-image",
  "/bulk-image-compressor",
  "/bulk-image-resizer",
  "/compress-image-to-100kb",
  "/compress-image-to-200kb",
  "/compress-image-to-500kb",
  "/png-to-webp",
  "/jpg-to-webp",
  "/webp-to-jpg",
  "/remove-background",
  "/enhance-image",
  "/privacy",
  "/formats",
  "/guides",
  "/guides/choose-image-format",
  "/guides/meet-upload-size-limit",
  "/guides/prepare-product-photos",
  "/guides/keep-transparent-background",
] as const;

interface PageMetadataInput {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  noIndex?: boolean;
}

export function createPageMetadata({
  title,
  description,
  path,
  keywords,
  noIndex = false,
}: PageMetadataInput): Metadata {
  const url = new URL(path, SITE.url).href;
  const pageTitle = createPageTitle(title);
  return {
    // Absolute titles already include the shared suffix, so the layout template
    // cannot add a second copy on nested routes.
    title: { absolute: pageTitle },
    description,
    keywords,
    alternates: SITE.indexable ? { canonical: url } : undefined,
    robots: { index: SITE.indexable && !noIndex, follow: true },
    openGraph: {
      type: "website",
      siteName: SITE.name,
      title: pageTitle,
      description,
      url: SITE.indexable ? url : undefined,
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
      title: pageTitle,
      description,
      images: ["/opengraph-image"],
    },
  };
}
