import { notFound } from "next/navigation";
import { getGuide, getGuides } from "@/lib/api/guides";
import { createPageMetadata } from "@/lib/site";
import { GuideSection } from "@/components/sections/guide-section";
export const ensureStatic = "navigation";
export function generateStaticParams() {
  return getGuides().map((guide) => ({ guide: guide.slug }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ guide: string }>;
}) {
  const { guide: slug } = await params;
  const guide = getGuide(slug);
  return createPageMetadata({
    title: guide?.title ?? "Guide not found",
    description: guide?.description ?? "Explore practical image guides.",
    path: `/guides/${slug}`,
    noIndex: !guide,
  });
}
export default async function GuidePage({
  params,
}: {
  params: Promise<{ guide: string }>;
}) {
  const { guide: slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();
  return <GuideSection guide={guide} />;
}
