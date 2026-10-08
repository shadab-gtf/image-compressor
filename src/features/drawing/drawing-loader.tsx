"use client";
import dynamic from "next/dynamic";
import type { DrawingSymbol } from "@/types/drawing";
import { DrawingSkeleton } from "./drawing-skeleton";
const DrawingWorkspace = dynamic(
  () => import("./drawing-workspace").then((module) => module.DrawingWorkspace),
  { ssr: false, loading: () => <DrawingSkeleton /> },
);
export function DrawingLoader({
  symbols,
}: {
  symbols: readonly DrawingSymbol[];
}) {
  return <DrawingWorkspace symbols={symbols} />;
}
