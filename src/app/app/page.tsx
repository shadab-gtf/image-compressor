import { WorkspaceSection } from "@/components/sections/workspace-section";
import { createPageMetadata } from "@/lib/site";

export const metadata = createPageMetadata({
  title: "Image workspace",
  description:
    "Compress, resize or convert a batch of images with shared settings. Compare results and download files or a ZIP, with no uploads or signup.",
  path: "/app",
  noIndex: true,
});
export const ensureStatic = "navigation";
export default function WorkspacePage() {
  return <WorkspaceSection />;
}
