import type { ProcessingOptions } from "./options";
export type ToolIcon =
  | "compress"
  | "resize"
  | "convert"
  | "layers"
  | "cutout"
  | "enhance";
export interface ToolDefinition {
  slug: string;
  name: string;
  seoTitle: string;
  title: string;
  description: string;
  shortDescription: string;
  icon: ToolIcon;
  featured?: boolean;
  badge?: string;
  mode?: "remove-background" | "enhance-image";
  options?: ProcessingOptions;
  steps: readonly string[];
  note: string;
}
export interface FAQ {
  question: string;
  answer: string;
}
export interface FormatInfo {
  name: string;
  input: string;
  output: string;
  note: string;
}
export interface SiteCatalog {
  tools: readonly ToolDefinition[];
  faqs: readonly FAQ[];
  formats: readonly FormatInfo[];
}

export interface ToolNavigationItem {
  href: string;
  label: string;
  description: string;
  icon: ToolIcon;
}

export interface ToolNavigationGroup {
  id: string;
  label: string;
  tools: readonly ToolNavigationItem[];
}
