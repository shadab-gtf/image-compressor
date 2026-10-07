import { getGuides } from "@/lib/api/guides";
import { createPageMetadata } from "@/lib/site";
import { GuidesSection } from "@/components/sections/guides-section";
export const ensureStatic = "navigation";
export const metadata = createPageMetadata({
  title: "Practical Image Editing Guides",
  description:
    "Learn how to choose image formats, meet file-size limits, prepare product photos and keep transparency with ShrinkFox's free local tools.",
  path: "/guides",
});
export default function GuidesPage() {
  return <GuidesSection guides={getGuides()} />;
}
