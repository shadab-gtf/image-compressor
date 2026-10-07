import { SITE } from "@/lib/site";
export function getApplicationStructuredData() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE.name,
    description: SITE.description,
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Modern web browser",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    featureList: [
      "Image compression",
      "Batch resizing",
      "Image conversion",
      "Portrait background removal",
      "Image enhancement",
    ],
    ...(SITE.indexable ? { url: SITE.url } : {}),
  };
}
