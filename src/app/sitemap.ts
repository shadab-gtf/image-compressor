import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";
import { getCatalog } from "@/lib/api/catalog";
import { createSitemap } from "@/lib/seo/crawl-policy";
import { getGuides } from "@/lib/api/guides";

export default function sitemap(): MetadataRoute.Sitemap {
  return createSitemap(SITE, [
    "/",
    ...getCatalog().tools.map((tool) => `/${tool.slug}`),
    "/formats",
    "/privacy",
    "/guides",
    ...getGuides().map((guide) => `/guides/${guide.slug}`),
  ]);
}
