import { HEADER_BYTES, readHeaderDimensions } from "@/engines/header";
import { sniffFormat } from "@/lib/format";
import type { StudioImage, StudioRequest, StudioResponse, StudioSettings } from "@/types/studio";
import { enhancePixels, removeSolidBackground } from "./studio-pixels";

const MAX_PIXELS = 24_000_000;
const MAX_EDGE = 8192;
const MODEL_REVISION = "fa2fa546052fba4c08921230a26cc69a333fca12";
const MODEL_BYTES = 25_888_640;
const scope = self as unknown as DedicatedWorkerGlobalScope;

function send(message: StudioResponse): void {
  scope.postMessage(message);
}

function progress(fraction: number, label: string): void {
  send({ type: "progress", progress: { fraction, label } });
}

function canvas2d(width: number, height: number) {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Your browser could not create an image canvas.");
  return { canvas, context };
}

function validateSize(width: number, height: number): void {
  if (width < 1 || height < 1 || width > MAX_EDGE || height > MAX_EDGE || width * height > MAX_PIXELS) {
    throw new Error("Choose an image up to 24 megapixels and 8,192 pixels per side. A 2× export must also fit these limits.");
  }
}

async function decode(file: File): Promise<ImageBitmap> {
  if (file.size === 0) throw new Error("This file is empty. Please choose another image.");
  if (file.size > 40 * 1024 * 1024) throw new Error("Choose an image smaller than 40 MB for this studio.");
  const bytes = new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer());
  const format = sniffFormat(bytes);
  if (!format) throw new Error("Choose a JPEG, PNG, WebP, AVIF, GIF or BMP image. This file’s contents are not supported.");
  const dimensions = readHeaderDimensions(bytes, format);
  if (!dimensions) throw new Error("The image header is damaged or cannot be read safely. Export it as JPEG or PNG and try again.");
  validateSize(dimensions.width, dimensions.height);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("This browser could not read the image. Try a JPEG or PNG version, or update your browser.");
  }
  try {
    validateSize(bitmap.width, bitmap.height);
  } catch (error) {
    bitmap.close();
    throw error;
  }
  return bitmap;
}

async function modelBytes(): Promise<ArrayBuffer> {
  const url = new URL(`/models/modnet/model.onnx?v=${MODEL_REVISION}`, scope.location.origin).href;
  let cache: Cache | undefined;
  try {
    cache = await caches.open("shrinkfox-models-v1");
    const cached = await cache.match(url);
    if (cached) {
      const bytes = await cached.arrayBuffer();
      if (bytes.byteLength === MODEL_BYTES) {
        progress(0.4, "Portrait model ready on this device");
        return bytes;
      }
      await cache.delete(url);
    }
  } catch {
    // Private browsing and storage quotas must not prevent processing.
  }

  progress(0.08, "Downloading the free portrait model (26 MB, once per device)");
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok || response.headers.get("content-type")?.includes("text/html")) {
    throw new Error("The portrait model is unavailable on this deployment. Try Simple background, or try again later.");
  }
  const reader = response.body?.getReader();
  const parts: Uint8Array<ArrayBuffer>[] = [];
  let received = 0;
  if (reader) {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      parts.push(new Uint8Array(chunk.value));
      received += chunk.value.byteLength;
      if (received > MODEL_BYTES) {
        await reader.cancel();
        throw new Error("The portrait model download is invalid. Please try again later.");
      }
      progress(0.08 + Math.min(received / MODEL_BYTES, 1) * 0.32, `Downloading portrait model · ${Math.round(received / MODEL_BYTES * 100)}%`);
    }
  } else {
    parts.push(new Uint8Array(await response.arrayBuffer()));
  }
  const blob = new Blob(parts, { type: "application/octet-stream" });
  if (blob.size !== MODEL_BYTES) throw new Error("The portrait model download was incomplete. Check your connection and try again.");
  try {
    await cache?.put(url, new Response(blob));
  } catch {
    // The browser can still run without a persistent cache.
  }
  return blob.arrayBuffer();
}

async function portraitMatte(bitmap: ImageBitmap): Promise<OffscreenCanvas> {
  const ort = await import("onnxruntime-web/wasm");
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.wasm.wasmPaths = {
    wasm: new URL("/wasm/ort-wasm-simd-threaded.wasm", scope.location.origin).href,
    mjs: new URL("/wasm/ort-wasm-simd-threaded.mjs", scope.location.origin).href,
  };
  const model = await modelBytes();
  progress(0.44, "Starting the portrait model on your device");
  let session: import("onnxruntime-web").InferenceSession;
  try {
    session = await ort.InferenceSession.create(model, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
  } catch {
    throw new Error("The portrait engine could not start. Update your browser or try Simple background, which needs no AI model.");
  }
  try {
    // MODNet expects planar RGB normalized with mean/std 0.5 and dimensions
    // divisible by 32. Keep the aspect ratio and bound memory for panoramas.
    const ratio = Math.min(512 / Math.min(bitmap.width, bitmap.height), 1024 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(32, Math.floor(bitmap.width * ratio / 32) * 32);
    const height = Math.max(32, Math.floor(bitmap.height * ratio / 32) * 32);
    const input = canvas2d(width, height);
    input.context.fillStyle = "#ffffff";
    input.context.fillRect(0, 0, width, height);
    input.context.drawImage(bitmap, 0, 0, width, height);
    const rgba = input.context.getImageData(0, 0, width, height).data;
    const plane = width * height;
    const data = new Float32Array(plane * 3);
    for (let i = 0; i < plane; i += 1) {
      data[i] = (rgba[i * 4] ?? 0) / 127.5 - 1;
      data[i + plane] = (rgba[i * 4 + 1] ?? 0) / 127.5 - 1;
      data[i + plane * 2] = (rgba[i * 4 + 2] ?? 0) / 127.5 - 1;
    }
    progress(0.62, "Finding your portrait’s edges · processing locally");
    const tensor = new ort.Tensor("float32", data, [1, 3, height, width]);
    const inputName = session.inputNames[0];
    if (!inputName) throw new Error("The portrait model has no image input.");
    const outputs = await session.run({ [inputName]: tensor });
    const outputName = session.outputNames[0];
    const output = outputName ? outputs[outputName] : undefined;
    if (!output || !(output.data instanceof Float32Array)) throw new Error("The portrait model returned an invalid result.");
    const maskWidth = output.dims[output.dims.length - 1];
    const maskHeight = output.dims[output.dims.length - 2];
    if (!maskWidth || !maskHeight) throw new Error("The portrait model returned an empty mask.");
    const mask = canvas2d(maskWidth, maskHeight);
    const pixels = new Uint8ClampedArray(maskWidth * maskHeight * 4);
    for (let i = 0; i < maskWidth * maskHeight; i += 1) {
      pixels[i * 4] = 255;
      pixels[i * 4 + 1] = 255;
      pixels[i * 4 + 2] = 255;
      pixels[i * 4 + 3] = Math.max(0, Math.min(255, (output.data[i] ?? 0) * 255));
    }
    mask.context.putImageData(new ImageData(pixels, maskWidth, maskHeight), 0, 0);
    tensor.dispose();
    for (const value of Object.values(outputs)) value.dispose();
    return mask.canvas;
  } finally {
    await session.release();
  }
}

async function processImage(request: Extract<StudioRequest, { type: "process" }>, bitmap: ImageBitmap): Promise<StudioImage> {
  const settings: StudioSettings = request.settings;
  const scale = request.mode === "enhance-image" && settings.scale === 2 ? 2 : 1;
  const width = bitmap.width * scale;
  const height = bitmap.height * scale;
  validateSize(width, height);
  const output = canvas2d(width, height);
  output.context.imageSmoothingEnabled = true;
  output.context.imageSmoothingQuality = "high";
  output.context.drawImage(bitmap, 0, 0, width, height);

  if (request.mode === "remove-background" && settings.method === "portrait") {
    const mask = await portraitMatte(bitmap);
    progress(0.86, "Applying the soft alpha mask at original resolution");
    output.context.globalCompositeOperation = "destination-in";
    output.context.drawImage(mask, 0, 0, width, height);
    output.context.globalCompositeOperation = "source-over";
    mask.width = 1;
    mask.height = 1;
  } else {
    progress(0.35, request.mode === "enhance-image" ? "Refining color, contrast and detail" : "Removing the connected background");
    const pixels = output.context.getImageData(0, 0, width, height);
    const result = request.mode === "enhance-image"
      ? enhancePixels(pixels.data, width, height, settings)
      : removeSolidBackground(pixels.data, width, height, settings.tolerance);
    output.context.putImageData(new ImageData(new Uint8ClampedArray(result), width, height), 0, 0);
  }
  progress(0.94, "Creating your full-resolution PNG");
  const blob = await output.canvas.convertToBlob({ type: "image/png" });
  return { blob, width, height };
}

scope.onmessage = async (event: MessageEvent<StudioRequest>) => {
  let bitmap: ImageBitmap | undefined;
  try {
    progress(0.02, "Reading your image securely on this device");
    bitmap = await decode(event.data.file);
    if (event.data.type === "inspect") {
      // Decode the preview too, so animation, EXIF orientation and color handling
      // match processing. The original file is never placed in a network URL.
      const ratio = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
      const preview = canvas2d(Math.round(bitmap.width * ratio), Math.round(bitmap.height * ratio));
      preview.context.drawImage(bitmap, 0, 0, preview.canvas.width, preview.canvas.height);
      const blob = await preview.canvas.convertToBlob({ type: "image/png" });
      send({ type: "result", image: { blob, width: bitmap.width, height: bitmap.height } });
    } else {
      const image = await processImage(event.data, bitmap);
      send({ type: "result", image });
    }
  } catch (error) {
    send({ type: "error", message: error instanceof Error ? error.message : "The image could not be processed. Try a smaller JPEG or PNG." });
  } finally {
    bitmap?.close();
  }
};
