export interface BrushPoint {
  x: number;
  y: number;
  pressure: number;
}
export interface MaskStroke {
  mode: "erase" | "restore";
  size: number;
  opacity?: number;
  hardness?: number;
  points: BrushPoint[];
}
export type BackgroundFill =
  | { kind: "transparent" }
  | { kind: "solid"; color: string }
  | { kind: "gradient"; color: string; endColor: string; angle: number }
  | { kind: "image"; file: File };
export interface CropSelection {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface CropTransform {
  selection: CropSelection;
  rotation: number;
  straighten: number;
}
export const DEFAULT_CROP: CropTransform = {
  selection: { x: 0, y: 0, width: 1, height: 1 },
  rotation: 0,
  straighten: 0,
};
