"use client";
import dynamic from "next/dynamic";
import { WorkspaceSkeleton } from "@/components/ui/loading-skeleton";
const Recipes = dynamic(
  () => import("./export-recipes").then((module) => module.ExportRecipes),
  { loading: () => <WorkspaceSkeleton /> },
);
export function RecipeLoader() {
  return <Recipes />;
}
