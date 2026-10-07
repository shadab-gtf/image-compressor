export type StudioMode = "remove-background" | "enhance-image";
export type RemovalMethod = "portrait" | "solid";

export interface StudioSettings {
  method: RemovalMethod;
  tolerance: number;
  contrast: number;
  saturation: number;
  sharpness: number;
  scale: 1 | 2;
}

export const DEFAULT_STUDIO_SETTINGS: StudioSettings = {
  method: "portrait",
  tolerance: 32,
  contrast: 8,
  saturation: 6,
  sharpness: 25,
  scale: 1,
};

export interface StudioImage {
  blob: Blob;
  width: number;
  height: number;
}

export interface StudioProgress {
  fraction: number;
  label: string;
}

export type StudioRequest =
  | { type: "inspect"; file: File }
  | { type: "process"; file: File; mode: StudioMode; settings: StudioSettings };

export type StudioResponse =
  | { type: "progress"; progress: StudioProgress }
  | { type: "result"; image: StudioImage }
  | { type: "error"; message: string };
