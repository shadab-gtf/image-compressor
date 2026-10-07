type Progress = (fraction: number, label: string) => void;

async function loadBytes(path: string, size: number, report: Progress, start: number, span: number): Promise<Uint8Array> {
  const url = new URL(path, self.location.origin).href;
  let cache: Cache | undefined;
  try {
    cache = await caches.open("shrinkfox-models-v2");
    const cached = await cache.match(url);
    if (cached) {
      const bytes = new Uint8Array(await cached.arrayBuffer());
      if (bytes.byteLength === size) return bytes;
      await cache.delete(url);
    }
  } catch { /* Private browsing may disable persistent caching. */ }
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error("The AI model is unavailable. Check your connection and try again.");
  const reader = response.body.getReader();
  const bytes = new Uint8Array(size);
  let received = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    if (received + chunk.value.length > size) {
      await reader.cancel();
      throw new Error("The AI model download is invalid.");
    }
    bytes.set(chunk.value, received);
    received += chunk.value.length;
    report(start + span * received / size, "Downloading the AI model · your photo stays on this device");
  }
  if (received !== size) throw new Error("The AI model download was incomplete. Please retry.");
  try { await cache?.put(url, new Response(bytes)); } catch { /* Inference still works without cache space. */ }
  return bytes;
}

async function runtime() {
  const ort = await import("onnxruntime-web/wasm");
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.wasm.wasmPaths = {
    wasm: new URL("/wasm/ort-wasm-simd-threaded.wasm", self.location.origin).href,
    mjs: new URL("/wasm/ort-wasm-simd-threaded.mjs", self.location.origin).href,
  };
  return ort;
}

function canvas(width: number, height: number) {
  const image = new OffscreenCanvas(width, height);
  const context = image.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not create the AI image canvas.");
  return { image, context };
}

/** Real-ESRGAN General x4v3, padded fixed-size tiles; all computation is in a disposable worker. */
export async function restorePhoto(bitmap: ImageBitmap, scale: number, report: Progress): Promise<OffscreenCanvas> {
  if (bitmap.width * bitmap.height > 1_000_000) throw new Error("Real-ESRGAN accepts up to 1 megapixel here. Resize your image first, or use Quick adjustments for larger photos.");
  const ort = await runtime();
  const model = await loadBytes("/models/realesrgan/real_esrgan_general_x4v3.onnx", 161087, report, 0.06, 0.02);
  const weights = await loadBytes("/models/realesrgan/real_esrgan_general_x4v3.data", 4836096, report, 0.08, 0.22);
  report(0.3, "Starting Real-ESRGAN on your device");
  const session = await ort.InferenceSession.create(model, {
    executionProviders: ["wasm"], graphOptimizationLevel: "all",
    externalData: [{ path: "real_esrgan_general_x4v3.data", data: weights }],
  });
  try {
    const source = canvas(bitmap.width, bitmap.height);
    source.context.drawImage(bitmap, 0, 0);
    const pixels = source.context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    const output = canvas(bitmap.width * scale, bitmap.height * scale);
    output.context.imageSmoothingEnabled = true;
    output.context.imageSmoothingQuality = "high";
    const tile = canvas(512, 512);
    const core = 96;
    const padding = 16;
    const plane = 128 * 128;
    const outputPlane = 512 * 512;
    const total = Math.ceil(bitmap.width / core) * Math.ceil(bitmap.height / core);
    let completed = 0;
    for (let y = 0; y < bitmap.height; y += core) {
      for (let x = 0; x < bitmap.width; x += core) {
        const values = new Float32Array(plane * 3);
        for (let ty = 0; ty < 128; ty++) {
          for (let tx = 0; tx < 128; tx++) {
            const sx = Math.max(0, Math.min(bitmap.width - 1, x + tx - padding));
            const sy = Math.max(0, Math.min(bitmap.height - 1, y + ty - padding));
            const sourceAt = (sy * bitmap.width + sx) * 4;
            const at = ty * 128 + tx;
            for (let channel = 0; channel < 3; channel++) values[channel * plane + at] = (pixels[sourceAt + channel] ?? 0) / 255;
          }
        }
        const tensor = new ort.Tensor("float32", values, [1, 3, 128, 128]);
        const input = session.inputNames[0];
        if (!input) { tensor.dispose(); throw new Error("Real-ESRGAN has no image input."); }
        let predictions: Record<string, import("onnxruntime-web").Tensor> = {};
        try {
          predictions = await session.run({ [input]: tensor });
          const prediction = predictions[session.outputNames[0] ?? ""];
          if (!prediction || !(prediction.data instanceof Float32Array) || prediction.data.length !== outputPlane * 3) throw new Error("Real-ESRGAN returned an invalid image.");
          const rgba = new Uint8ClampedArray(outputPlane * 4);
          for (let at = 0; at < outputPlane; at++) {
            for (let channel = 0; channel < 3; channel++) rgba[at * 4 + channel] = Math.round((prediction.data[channel * outputPlane + at] ?? 0) * 255);
            rgba[at * 4 + 3] = 255;
          }
          tile.context.putImageData(new ImageData(rgba, 512, 512), 0, 0);
          const width = Math.min(core, bitmap.width - x);
          const height = Math.min(core, bitmap.height - y);
          output.context.drawImage(tile.image, padding * 4, padding * 4, width * 4, height * 4, x * scale, y * scale, width * scale, height * scale);
        } finally {
          tensor.dispose();
          for (const prediction of Object.values(predictions)) prediction.dispose();
        }
        completed++;
        report(0.35 + completed / total * 0.5, `Restoring with Real-ESRGAN · tile ${completed} of ${total}`);
      }
    }
    output.context.globalCompositeOperation = "destination-in";
    output.context.drawImage(bitmap, 0, 0, output.image.width, output.image.height);
    output.context.globalCompositeOperation = "source-over";
    return output.image;
  } finally { await session.release(); }
}

/** Browser-compatible BiRefNet Lite 512 FP32 export, ImageNet input normalization and sigmoid logits. */
export async function objectMatte(bitmap: ImageBitmap, report: Progress): Promise<OffscreenCanvas> {
  const ort = await runtime();
  const bytes = new Uint8Array(191877254);
  for (let part = 0; part < 4; part++) {
    const size = part === 3 ? 47877254 : 48000000;
    bytes.set(await loadBytes(`/models/birefnet/model.part${part}`, size, report, 0.06 + part * 0.08, 0.08), part * 48000000);
  }
  report(0.4, "Starting BiRefNet Lite · this can take time on a phone");
  const session = await ort.InferenceSession.create(bytes, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
  let tensor: import("onnxruntime-web").Tensor | undefined;
  let predictions: Record<string, import("onnxruntime-web").Tensor> = {};
  try {
    const input = canvas(512, 512);
    input.context.fillStyle = "#ffffff";
    input.context.fillRect(0, 0, 512, 512);
    input.context.drawImage(bitmap, 0, 0, 512, 512);
    const rgba = input.context.getImageData(0, 0, 512, 512).data;
    const plane = 512 * 512;
    const values = new Float32Array(plane * 3);
    const mean = [0.485, 0.456, 0.406];
    const std = [0.229, 0.224, 0.225];
    for (let at = 0; at < plane; at++) for (let channel = 0; channel < 3; channel++) values[channel * plane + at] = ((rgba[at * 4 + channel] ?? 0) / 255 - mean[channel]!) / std[channel]!;
    tensor = new ort.Tensor("float32", values, [1, 3, 512, 512]);
    const name = session.inputNames[0];
    if (!name) throw new Error("BiRefNet has no image input.");
    report(0.55, "BiRefNet is finding the subject and its edges locally");
    predictions = await session.run({ [name]: tensor });
    const mask = predictions[session.outputNames[0] ?? ""];
    if (!mask || !(mask.data instanceof Float32Array) || mask.data.length !== plane) throw new Error("BiRefNet returned an invalid mask.");
    const alpha = new Uint8ClampedArray(plane * 4);
    for (let at = 0; at < plane; at++) {
      alpha[at * 4] = alpha[at * 4 + 1] = alpha[at * 4 + 2] = 255;
      alpha[at * 4 + 3] = Math.round(255 / (1 + Math.exp(-(mask.data[at] ?? 0))));
    }
    input.context.putImageData(new ImageData(alpha, 512, 512), 0, 0);
    return input.image;
  } finally {
    tensor?.dispose();
    for (const prediction of Object.values(predictions)) prediction.dispose();
    await session.release();
  }
}
