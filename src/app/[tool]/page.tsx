import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCatalog, getTool } from "@/lib/api/catalog";
import { createPageMetadata } from "@/lib/site";
import { ToolSection } from "@/components/sections/tool-section";

export const ensureStatic = "navigation";
export function generateStaticParams() {
  return getCatalog().tools.map(({ slug }) => ({ tool: slug }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ tool: string }>;
}): Promise<Metadata> {
  const { tool: slug } = await params;
  const tool = getTool(slug);
  if (!tool) {
    return createPageMetadata({
      title: "Tool not found",
      description:
        "The requested tool could not be found. Explore free image compression, resizing, conversion and background removal.",
      path: `/${slug}`,
      noIndex: true,
    });
  }
  return createPageMetadata({
    title: tool.seoTitle,
    description: tool.description,
    path: `/${tool.slug}`,
    keywords: [
      tool.name.toLowerCase(),
      `free ${tool.name.toLowerCase()}`,
      "local image tools",
      "private image editor",
    ],
  });
}
export default async function ToolPage({
  params,
}: {
  params: Promise<{ tool: string }>;
}) {
  const { tool: slug } = await params;
  const tool = getTool(slug);
  if (!tool) notFound();
  return <ToolSection tool={tool} />;
}
