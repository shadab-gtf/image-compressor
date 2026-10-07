"use client";

import dynamic from "next/dynamic";
import { StudioSkeleton } from "./studio-skeleton";

const ImageStudio = dynamic(
  () => import("./image-studio").then((module) => module.ImageStudio),
  { loading: () => <StudioSkeleton /> },
);
export function StudioLoader({
  mode,
}: {
  mode: import("@/types/studio").StudioMode;
}) {
  return <ImageStudio mode={mode} />;
}
