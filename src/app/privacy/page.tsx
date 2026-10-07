import { createPageMetadata } from "@/lib/site";
import { PrivacySection } from "@/components/sections/privacy-section";
export const ensureStatic = "navigation";
export const metadata = createPageMetadata({
  title: "Privacy",
  description:
    "See where your images are processed, what ShrinkFox saves on your device and how to clear it. Learn about photo metadata, offline files and hosting requests.",
  path: "/privacy",
});
export default function PrivacyPage() {
  return <PrivacySection />;
}
