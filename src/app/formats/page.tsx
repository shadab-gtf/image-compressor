import { getCatalog } from "@/lib/api/catalog";
import { createPageMetadata } from "@/lib/site";
import { FormatSection } from "@/components/sections/format-section";
export const ensureStatic = "navigation";
export const metadata = createPageMetadata({
  title: "Supported image formats & limits",
  description:
    "Check which image formats ShrinkFox can open and export, plus file-size limits, browser differences, transparency and animation support.",
  path: "/formats",
});
export default function FormatsPage() {
  const { formats } = getCatalog();
  return <FormatSection formats={formats} />;
}
