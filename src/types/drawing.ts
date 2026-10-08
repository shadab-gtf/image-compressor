export interface DrawPoint {
  x: number;
  y: number;
}
export interface DrawingSymbol {
  id: string;
  label: string;
  category: string;
  strokes: DrawPoint[][];
}
export type DrawTool =
  | "smart"
  | "pen"
  | "select"
  | "text"
  | "fill"
  | "rectangle"
  | "ellipse"
  | "triangle"
  | "line"
  | "eraser"
  | "pan";
export interface DrawingObject {
  id: string;
  kind: "path" | "text";
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  strokes: DrawPoint[][];
  color: string;
  fill: string;
  strokeWidth: number;
  text: string;
  fontSize: number;
  bold: boolean;
}
export interface DrawingDocument {
  version: 1;
  name: string;
  width: number;
  height: number;
  background: string;
  objects: DrawingObject[];
}
export interface DrawingHistory {
  past: DrawingDocument[];
  present: DrawingDocument;
  future: DrawingDocument[];
}
export type DrawingAction =
  | { type: "commit"; document: DrawingDocument }
  | { type: "undo" }
  | { type: "redo" };
