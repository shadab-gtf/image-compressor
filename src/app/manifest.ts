import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: SITE.name,
    short_name: SITE.name,
    description: SITE.description,
    lang: "en",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#F3F1ED",
    theme_color: "#E8652B",
    categories: ["photo", "productivity", "utilities", "graphics"],
    icons: [
      {
        src: "/brand/shrinkfox-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Compress an image",
        short_name: "Compress",
        description: "Shrink a photo without sending it anywhere",
        url: "/compress-image",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Resize an image",
        short_name: "Resize",
        description: "Scale or crop to an exact size on your device",
        url: "/resize-image",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Convert an image",
        short_name: "Convert",
        description: "Change between JPG, PNG, WebP and AVIF locally",
        url: "/convert-image",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
