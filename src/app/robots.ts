import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";
import { createRobots } from "@/lib/seo/crawl-policy";

export default function robots(): MetadataRoute.Robots {
  return createRobots(SITE);
}
