import { getCatalog } from "@/lib/api/catalog";
import { HomeSection } from "@/components/sections/home-section";
import { getApplicationStructuredData } from "@/lib/api/structured-data";
import { createPageMetadata, DEFAULT_PAGE_TITLE, SITE } from "@/lib/site";

export const ensureStatic = "navigation";
export const metadata = createPageMetadata({
  title: DEFAULT_PAGE_TITLE,
  description: SITE.description,
  path: "/",
});
export default function HomePage() {
  const catalog = getCatalog();
  const structuredData = getApplicationStructuredData();
  return <HomeSection catalog={catalog} structuredData={structuredData} />;
}
