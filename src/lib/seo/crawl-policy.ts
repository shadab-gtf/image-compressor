import type { MetadataRoute } from "next";

interface CrawlSite {
  url: string;
  indexable: boolean;
}

export function createSitemap(
  site: CrawlSite,
  paths: readonly string[],
): MetadataRoute.Sitemap {
  if (!site.indexable) return [];

  return [...new Set(paths)].map((path) => ({
    url: new URL(path, site.url).href,
  }));
}

export function createRobots(site: CrawlSite): MetadataRoute.Robots {
  if (!site.indexable) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    // HTML pages marked noindex must remain crawlable for that directive to be read.
    // Public scripts, styles and images also stay available for rendering.
    rules: { userAgent: "*", allow: "/", disallow: ["/api/"] },
    sitemap: new URL("/sitemap.xml", site.url).href,
  };
}
