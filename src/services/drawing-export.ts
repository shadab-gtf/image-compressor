import type { DrawingDocument } from "@/types/drawing";
import { drawingSvg } from "@/engines/drawing";
import { saveBlob } from "./download-service";

export async function exportDrawing(
  document: DrawingDocument,
  format: "png" | "svg" | "project",
  share = false,
): Promise<void> {
  const name = (
    document.name.replace(/[^\p{L}\p{N}_ -]/gu, "").trim() || "drawing"
  ).slice(0, 80);
  let blob: Blob;
  const extension = format === "project" ? "shrinkfox.json" : format;
  if (format === "project")
    blob = new Blob([JSON.stringify(document)], { type: "application/json" });
  else {
    blob = new Blob([drawingSvg(document)], { type: "image/svg+xml" });
    if (format === "png") {
      const url = URL.createObjectURL(blob),
        image = new Image();
      try {
        image.src = url;
        await image.decode();
        const canvas = window.document.createElement("canvas");
        canvas.width = document.width;
        canvas.height = document.height;
        const context = canvas.getContext("2d");
        if (!context)
          throw new Error("Your browser could not create the export.");
        context.drawImage(image, 0, 0);
        blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (value) =>
              value ? resolve(value) : reject(new Error("PNG export failed.")),
            "image/png",
          ),
        );
        canvas.width = canvas.height = 1;
      } finally {
        URL.revokeObjectURL(url);
      }
    }
  }
  const filename = `${name}.${extension}`;
  if (share) {
    const file = new File([blob], filename, { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: document.name });
      return;
    }
  }
  saveBlob(blob, filename);
}
