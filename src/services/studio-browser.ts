import { HEADER_BYTES, readHeaderDimensions } from "@/engines/header";
import { sniffFormat } from "@/lib/format";
import { fitStudioSize } from "@/lib/studio-size";
import { enhancePixels } from "./studio-pixels";
import type { StudioImage, StudioProgress, StudioRequest } from "@/types/studio";

/** Lightweight compatibility path: no OffscreenCanvas, WASM, GPU or model downloads. */
export async function runBrowserEnhancement(request: StudioRequest, signal: AbortSignal, report: (value: StudioProgress) => void): Promise<StudioImage> {
  if (request.type !== "inspect" && !(request.type === "process" && request.mode === "enhance-image")) throw new Error("This operation needs a browser with background image processing.");
  signal.throwIfAborted();
  if (!request.file.size || request.file.size > 40 * 1024 * 1024) throw new Error("Choose a non-empty image under 40 MB.");
  const bytes = new Uint8Array(await request.file.slice(0, HEADER_BYTES).arrayBuffer());
  const format = sniffFormat(bytes);
  if (!format || !readHeaderDimensions(bytes, format)) throw new Error("This image could not be read. Try a JPEG, PNG or WebP version.");
  const url = URL.createObjectURL(request.file);
  const image = new Image();
  try {
    report({ fraction: 0.08, label: "Opening your image" });
    image.src = url;
    await image.decode();
    signal.throwIfAborted();
    const settings = request.type === "process" ? request.settings : null;
    const size = fitStudioSize(image.naturalWidth, image.naturalHeight, settings?.scale ?? 1, 2_000_000);
    const canvas = document.createElement("canvas");
    canvas.width = size.width; canvas.height = size.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("The browser could not create an image canvas.");
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, size.width, size.height);
    if (settings) {
      report({ fraction: 0.35, label: "Enhancing color and detail · lightweight processing" });
      // Give the browser a frame to paint the waiting animation before pixel work.
      await new Promise<void>(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
      signal.throwIfAborted();
      const pixels = context.getImageData(0, 0, size.width, size.height);
      context.putImageData(new ImageData(new Uint8ClampedArray(enhancePixels(pixels.data, size.width, size.height, settings)), size.width, size.height), 0, 0);
    }
    report({ fraction: 0.9, label: "Saving your enhanced image" });
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("The image could not be saved.")), "image/png"));
    signal.throwIfAborted();
    canvas.width = canvas.height = 1;
    return { blob, width: size.width, height: size.height, processing: "lightweight", detail: settings ? "Fast enhancement completed using lightweight processing. Large output fits 2 MP for device compatibility; AI restoration was not applied." : "This device uses fast enhancement without AI downloads. Output automatically fits 2 MP to reduce memory use." };
  } finally {
    image.src = "";
    URL.revokeObjectURL(url);
  }
}
