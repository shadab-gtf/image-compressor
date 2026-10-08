import type { BackgroundFill, CropTransform, MaskStroke } from "./editor";
export type StudioMode = "remove-background" | "enhance-image" | "crop-image";
export type RemovalMethod = "general" | "portrait" | "solid";

export interface StudioSettings {
  method: RemovalMethod;
  tolerance: number;
  contrast: number;
  saturation: number;
  sharpness: number;
  enhancement: "ai" | "standard" | "text" | "deblur" | "face" | "restore" | "full";
  restorationStrength?: number;
  scale: 1 | 2 | 3 | 4;
  crop?: CropTransform;
}

export const DEFAULT_STUDIO_SETTINGS: StudioSettings = {
  method: "general",
  tolerance: 32,
  contrast: 8,
  saturation: 6,
  sharpness: 25,
  enhancement: "standard",
  scale: 1,
};

export interface StudioImage {
  blob: Blob;
  width: number;
  height: number;
  detail?: string;
  processing?: "lightweight";
}

export interface StudioProgress {
  fraction: number;
  label: string;
}

export type StudioRequest =
  | { type: "inspect"; file: File; mode?: StudioMode }
  | { type: "export-8k"; file: File }
  | { type: "edit-cutout"; file: File; cutout: Blob; strokes: MaskStroke[]; background: BackgroundFill }
  | { type: "process"; file: File; mode: StudioMode; settings: StudioSettings };

export type StudioResponse =
  | { type: "progress"; progress: StudioProgress }
  | { type: "result"; image: StudioImage }
  | { type: "error"; message: string };
