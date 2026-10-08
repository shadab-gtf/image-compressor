import { HEADER_BYTES, readHeaderDimensions } from "@/engines/header";
import { sniffFormat } from "@/lib/format";
import type { StudioImage, StudioRequest, StudioResponse, StudioSettings } from "@/types/studio";
import { enhancePixels, removeSolidBackground } from "./studio-pixels";
import { cropGeometry, fillBackground, paintStroke } from "@/engines/editor";
import { DEFAULT_CROP } from "@/types/editor";
import { fitStudioSize } from "@/lib/studio-size";

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
    throw new Error("Choose an image up to 24 megapixels and 8,192 pixels per side. The enlarged export must also fit these limits; choose a lower scale or a smaller source.");
  }
}

async function decode(file: File, enhancement = false): Promise<ImageBitmap> {
  if (file.size === 0) throw new Error("This file is empty. Please choose another image.");
  if (file.size > 40 * 1024 * 1024) throw new Error("Choose an image smaller than 40 MB for this studio.");
  const bytes = new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer());
  const format = sniffFormat(bytes);
  if (!format) throw new Error("Choose a JPEG, PNG, WebP, AVIF, GIF or BMP image. This file’s contents are not supported.");
  const dimensions = readHeaderDimensions(bytes, format);
  if (!dimensions) throw new Error("The image header is damaged or cannot be read safely. Export it as JPEG or PNG and try again.");
  const fitted = fitStudioSize(dimensions.width, dimensions.height);
  if (!enhancement || format === "tiff") validateSize(dimensions.width, dimensions.height);
  let bitmap: ImageBitmap;
  try {
    const resize = enhancement && (fitted.width !== dimensions.width || fitted.height !== dimensions.height)
      ? { resizeWidth: fitted.width, resizeHeight: fitted.height, resizeQuality: "high" as const } : {};
    bitmap = format === "tiff" ? await (await import("@/engines/tiff")).decodeTiff(file) : await createImageBitmap(file, { imageOrientation: "from-image", ...resize });
  } catch (cause) {
    if (format === "tiff" && cause instanceof Error) throw cause;
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
  if (request.mode === "crop-image") {
    const plan = cropGeometry(bitmap.width, bitmap.height, request.settings.crop ?? DEFAULT_CROP);
    validateSize(plan.width, plan.height);
    const output = canvas2d(plan.width, plan.height);
    output.context.translate(plan.width / 2, plan.height / 2);
    output.context.rotate(plan.radians);
    output.context.drawImage(bitmap, plan.x, plan.y, plan.cropWidth, plan.cropHeight, -plan.cropWidth / 2, -plan.cropHeight / 2, plan.cropWidth, plan.cropHeight);
    progress(0.9, "Exporting your crop at the selected resolution");
    return { blob: await output.canvas.convertToBlob({ type: "image/png" }), width: plan.width, height: plan.height };
  }
  const settings: StudioSettings = request.settings;
  const fitted = fitStudioSize(bitmap.width, bitmap.height, request.mode === "enhance-image" ? settings.scale : 1,
    request.mode === "enhance-image" && settings.enhancement === "standard" ? 6_000_000 : MAX_PIXELS);
  const scale = fitted.scale;
  const width = fitted.width;
  const height = fitted.height;
  validateSize(width, height);
  const output = canvas2d(width, height);
  output.context.imageSmoothingEnabled = true;
  output.context.imageSmoothingQuality = "high";
  output.context.drawImage(bitmap, 0, 0, width, height);
  let detail: string | undefined;
  if (request.mode === "enhance-image" && ["deblur", "face", "restore", "full"].includes(settings.enhancement)) {
    const { deblurPhoto, restoreFaces } = await import("./studio-restoration");
    const strength = Math.max(0, Math.min(1, (settings.restorationStrength ?? 75) / 100));
    if (!Number.isFinite(strength)) throw new Error("Choose a valid restoration strength.");
    let prepared: OffscreenCanvas | undefined;
    try {
      if (settings.enhancement !== "face") {
        prepared = await deblurPhoto(bitmap, strength, (fraction, label) => progress(0.05 + fraction * 0.32, label));
        output.context.clearRect(0, 0, width, height); output.context.drawImage(prepared, 0, 0, width, height);
        detail = "NAFNet deblurring applied.";
      }
      if (settings.enhancement === "full" || settings.enhancement === "restore") {
        const { restorePhoto } = await import("./studio-neural");
        const enhanced = await restorePhoto(prepared ?? bitmap, scale, (fraction, label) => progress(0.37 + fraction * 0.3, label));
        output.context.clearRect(0, 0, width, height);
        output.context.drawImage(enhanced, 0, 0);
        enhanced.width = enhanced.height = 1;
        detail = "Full image processed: NAFNet deblurring + Real-ESRGAN detail enhancement across the entire frame.";
      }
      if (settings.enhancement === "face" || settings.enhancement === "restore") {
        const count = await restoreFaces(prepared ?? bitmap, output.canvas, strength, (fraction, label) => progress(0.67 + fraction * 0.21, label), settings.enhancement === "face");
        detail = `${detail ? detail + " " : ""}${count ? `Restored ${count} face${count === 1 ? "" : "s"} with RestoreFormer++. Review facial details before downloading.` : "No clear face detected; the deblurred photo is preserved."}`;
      }
    } finally { if (prepared) prepared.width = prepared.height = 1; }
  }
  if (request.mode === "enhance-image" && settings.enhancement === "ai") {
    const { restorePhoto } = await import("./studio-neural");
    const restored = await restorePhoto(bitmap, scale, progress);
    output.context.clearRect(0, 0, width, height);
    output.context.drawImage(restored, 0, 0);
    restored.width = restored.height = 1;
  }

  if (request.mode === "remove-background" && settings.method !== "solid") {
    const mask = settings.method === "portrait" ? await portraitMatte(bitmap)
      : await (await import("./studio-neural")).objectMatte(bitmap, progress);
    progress(0.86, "Applying the soft alpha mask at original resolution");
    output.context.globalCompositeOperation = "destination-in";
    output.context.drawImage(mask, 0, 0, width, height);
    output.context.globalCompositeOperation = "source-over";
    mask.width = 1;
    mask.height = 1;
  } else {
    progress(request.mode === "enhance-image" && !["standard", "text"].includes(settings.enhancement) ? 0.88 : 0.35, request.mode === "enhance-image" ? "Refining color, contrast and detail" : "Removing the connected background");
    const pixels = output.context.getImageData(0, 0, width, height);
    if (request.mode === "enhance-image" && ["face", "restore"].includes(settings.enhancement)) {
      // Replace alpha instead of multiplying it: partially transparent source
      // pixels must not become more transparent after face compositing.
      const original = canvas2d(width, height);
      original.context.imageSmoothingEnabled = true;
      original.context.imageSmoothingQuality = "high";
      original.context.drawImage(bitmap, 0, 0, width, height);
      const sourceAlpha = original.context.getImageData(0, 0, width, height).data;
      for (let at = 3; at < pixels.data.length; at += 4) pixels.data[at] = sourceAlpha[at]!;
      original.canvas.width = original.canvas.height = 1;
    }
    const result = request.mode === "enhance-image"
      ? enhancePixels(pixels.data, width, height, settings)
      : removeSolidBackground(pixels.data, width, height, settings.tolerance);
    output.context.putImageData(new ImageData(new Uint8ClampedArray(result), width, height), 0, 0);
  }
  if (request.mode === "enhance-image" && settings.enhancement === "standard") {
    detail = `Fast enhancement complete: ${width} × ${height} PNG. Color, contrast and sharpening applied without AI downloads.${width !== bitmap.width * settings.scale || height !== bitmap.height * settings.scale ? " Output automatically sized for faster processing." : ""}`;
  }
  progress(0.94, "Creating your PNG");
  const blob = await output.canvas.convertToBlob({ type: "image/png" });
  return { blob, width, height, detail };
}

async function editCutout(request: Extract<StudioRequest, { type: "edit-cutout" }>, original: ImageBitmap): Promise<StudioImage> {
  if (request.strokes.reduce((total, stroke) => total + stroke.points.length, 0) > 100_000 || request.strokes.some((stroke) => (stroke.opacity !== undefined && (!Number.isFinite(stroke.opacity) || stroke.opacity < 0 || stroke.opacity > 1)) || (stroke.hardness !== undefined && (!Number.isFinite(stroke.hardness) || stroke.hardness < 0 || stroke.hardness > 1)))) throw new Error("This edit history is too large or invalid. Reset the mask and use fewer strokes.");
  if (request.strokes.length > 200 || request.strokes.some((stroke) => stroke.points.length > 5000 || !Number.isFinite(stroke.size) || stroke.size <= 0 || stroke.size > 1 || stroke.points.some((point) => ![point.x, point.y, point.pressure].every(Number.isFinite) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1 || point.pressure < 0 || point.pressure > 1))) throw new Error("This edit history is too large or invalid. Apply a smaller set of corrections.");
  const { width, height } = original;
  const cutout = await createImageBitmap(request.cutout);
  let background: ImageBitmap | undefined;
  try {
    if (cutout.width !== width || cutout.height !== height) throw new Error("The mask no longer matches this source. Run background removal again.");
    if (request.background.kind === "image") background = await decode(request.background.file);
    const mask = canvas2d(width, height);
    mask.context.drawImage(cutout, 0, 0);
    for (const stroke of request.strokes) paintStroke(mask.context, stroke, width, height);
    progress(0.5, "Applying your reversible mask corrections");
    const subject = canvas2d(width, height);
    subject.context.drawImage(original, 0, 0);
    subject.context.globalCompositeOperation = "destination-in";
    subject.context.drawImage(mask.canvas, 0, 0);
    const output = canvas2d(width, height);
    fillBackground(output.context, width, height, request.background, background);
    output.context.drawImage(subject.canvas, 0, 0);
    progress(0.9, "Saving the same background and mask shown in your editor");
    return { blob: await output.canvas.convertToBlob({ type: "image/png" }), width, height };
  } finally {
    cutout.close();
    background?.close();
  }
}

scope.onmessage = async (event: MessageEvent<StudioRequest>) => {
  let bitmap: ImageBitmap | undefined;
  try {
    progress(0.02, "Reading your image securely on this device");
    bitmap = await decode(event.data.file, (event.data.type === "process" || event.data.type === "inspect") && event.data.mode === "enhance-image");
    if (event.data.type === "inspect") {
      // Decode the preview too, so animation, EXIF orientation and color handling
      // match processing. The original file is never placed in a network URL.
      const ratio = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
      const preview = canvas2d(Math.round(bitmap.width * ratio), Math.round(bitmap.height * ratio));
      preview.context.drawImage(bitmap, 0, 0, preview.canvas.width, preview.canvas.height);
      const blob = await preview.canvas.convertToBlob({ type: "image/png" });
      send({ type: "result", image: { blob, width: bitmap.width, height: bitmap.height } });
    } else if (event.data.type === "export-8k") {
      const ratio = 7680 / Math.max(bitmap.width, bitmap.height);
      const width = Math.max(1, Math.round(bitmap.width * ratio));
      const height = Math.max(1, Math.round(bitmap.height * ratio));
      if (width * height > 60_000_000) throw new Error("This 8K export exceeds the memory limit.");
      progress(0.3, "Enlarging the restored result to a 7,680-pixel long edge");
      const output = canvas2d(width, height);
      output.context.fillStyle = "#ffffff";
      output.context.fillRect(0, 0, width, height);
      output.context.imageSmoothingEnabled = true;
      output.context.imageSmoothingQuality = "high";
      output.context.drawImage(bitmap, 0, 0, width, height);
      progress(0.75, "Encoding your high-resolution JPEG · larger size does not recover missing detail");
      const blob = await output.canvas.convertToBlob({ type: "image/jpeg", quality: 0.95 });
      output.canvas.width = output.canvas.height = 1;
      send({ type: "result", image: { blob, width, height } });
    } else if (event.data.type === "edit-cutout") {
      send({ type: "result", image: await editCutout(event.data, bitmap) });
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
