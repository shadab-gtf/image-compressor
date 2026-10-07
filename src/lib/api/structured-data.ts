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
      "People and product background removal",
      "Real-ESRGAN image restoration and 2×–4× upscaling",
    ],
    ...(SITE.indexable ? { url: SITE.url } : {}),
  };
}
