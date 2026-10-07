import { alignFace, suppressFaces, type Face } from "@/engines/face-geometry";
import {
  loadBytes,
  neuralProviders,
  runtime,
  type Progress,
} from "./studio-neural";
import type { InferenceSession, Tensor } from "onnxruntime-web";

const MODEL_SIZES = {
  nafnet: 91736251,
  yunet: 232589,
  restoreformer: 74375477,
} as const;
type Source = ImageBitmap | OffscreenCanvas;
function canvas(width: number, height: number) {
  const image = new OffscreenCanvas(width, height);
  const context = image.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not create the restoration canvas.");
  return { image, context };
}
async function session(name: keyof typeof MODEL_SIZES, report: Progress) {
  const size = MODEL_SIZES[name],
    bytes = new Uint8Array(size),
    count = Math.ceil(size / 40_000_000);
  for (let part = 0; part < count; part++)
    bytes.set(
      await loadBytes(
        `/models/restoration/${name}.part${part}`,
        Math.min(40_000_000, size - part * 40_000_000),
        (fraction) =>
          report(fraction, `Loading ${name} · downloaded once per device`),
        (part / count) * 0.2,
        0.2 / count,
      ),
      part * 40_000_000,
    );
  const ort = await runtime(),
    providers = await neuralProviders();
  report(
    0.22,
    `Starting ${name} · ${providers[0] === "webgpu" ? "GPU acceleration" : "CPU processing"}`,
  );
  try {
    return await ort.InferenceSession.create(bytes, {
      executionProviders: providers,
      graphOptimizationLevel: "all",
      logSeverityLevel: 3,
    });
  } catch (cause) {
    // A GPU may exist yet lack the required model operations or available memory.
    if (providers[0] !== "webgpu") throw cause;
    report(0.23, `${name}: using the CPU fallback`);
    return ort.InferenceSession.create(bytes, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
      logSeverityLevel: 3,
    });
  }
}
function tensorData(rgba: Uint8ClampedArray, range: "unit" | "signed" | "bgr") {
  const plane = rgba.length / 4,
    values = new Float32Array(plane * 3);
  for (let at = 0; at < plane; at++)
    for (let channel = 0; channel < 3; channel++) {
      const value = rgba[at * 4 + (range === "bgr" ? 2 - channel : channel)]!;
      values[channel * plane + at] =
        range === "signed"
          ? value / 127.5 - 1
          : range === "unit"
            ? value / 255
            : value;
    }
  return values;
}
async function predict(
  model: InferenceSession,
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  range: "unit" | "signed",
) {
  const ort = await runtime(),
    input = new ort.Tensor("float32", tensorData(rgba, range), [
      1,
      3,
      height,
      width,
    ]);
  let predictions: Record<string, Tensor> = {};
  try {
    const name = model.outputNames[0]!;
    predictions = await model.run({ [model.inputNames[0]!]: input }, [name]);
    const data = predictions[name]?.data;
    if (!(data instanceof Float32Array) || data.length !== width * height * 3)
      throw new Error("The restoration model returned an invalid image.");
    const plane = width * height,
      output = new Uint8ClampedArray(plane * 4);
    for (let i = 0; i < plane; i++) {
      for (let c = 0; c < 3; c++) {
        const value = data[c * plane + i]!;
        if (!Number.isFinite(value))
          throw new Error(
            "Restoration produced invalid pixels. Try CPU processing on another browser.",
          );
        output[i * 4 + c] =
          range === "signed" ? (value + 1) * 127.5 : value * 255;
      }
      output[i * 4 + 3] = 255;
    }
    return output;
  } finally {
    input.dispose();
    Object.values(predictions).forEach((value) => value.dispose());
  }
}

/** Original-resolution, overlapping NAFNet inference with reflected edge padding. */
export async function deblurPhoto(
  source: Source,
  strength: number,
  report: Progress,
) {
  const model = await session("nafnet", report);
  try {
    const original = canvas(source.width, source.height);
    original.context.drawImage(source, 0, 0);
    const pixels = original.context.getImageData(
      0,
      0,
      source.width,
      source.height,
    ).data;
    const result = canvas(source.width, source.height),
      tile = canvas(384, 384);
    const core = 256,
      padding = 64,
      total = Math.ceil(source.width / core) * Math.ceil(source.height / core);
    const reflect = (n: number, size: number) => {
      if (size === 1) return 0;
      const period = 2 * size - 2;
      const value = ((n % period) + period) % period;
      return value < size ? value : period - value;
    };
    let done = 0;
    for (let y = 0; y < source.height; y += core)
      for (let x = 0; x < source.width; x += core) {
        const values = new Uint8ClampedArray(384 * 384 * 4);
        for (let ty = 0; ty < 384; ty++)
          for (let tx = 0; tx < 384; tx++) {
            const at =
              (reflect(y + ty - padding, source.height) * source.width +
                reflect(x + tx - padding, source.width)) *
              4;
            values.set(pixels.subarray(at, at + 4), (ty * 384 + tx) * 4);
          }
        report(
          0.25 + (done / total) * 0.7,
          `NAFNet deblurring · tile ${done + 1} of ${total}`,
        );
        tile.context.putImageData(
          new ImageData(
            await predict(model, values, 384, 384, "unit"),
            384,
            384,
          ),
          0,
          0,
        );
        const w = Math.min(core, source.width - x),
          h = Math.min(core, source.height - y);
        result.context.drawImage(
          tile.image,
          padding,
          padding,
          w,
          h,
          x,
          y,
          w,
          h,
        );
        done++;
      }
    // Blend in RGB before restoring the source alpha.
    result.context.globalAlpha = 1 - strength;
    result.context.drawImage(source, 0, 0);
    result.context.globalAlpha = 1;
    result.context.globalCompositeOperation = "destination-in";
    result.context.drawImage(source, 0, 0);
    result.context.globalCompositeOperation = "source-over";
    return result.image;
  } finally {
    await model.release();
  }
}

async function detectFaces(source: Source, report: Progress): Promise<Face[]> {
  const model = await session("yunet", report),
    ort = await runtime();
  const input = canvas(640, 640),
    ratio = Math.min(640 / source.width, 640 / source.height);
  input.context.fillStyle = "#000";
  input.context.fillRect(0, 0, 640, 640);
  input.context.drawImage(
    source,
    0,
    0,
    source.width * ratio,
    source.height * ratio,
  );
  const tensor = new ort.Tensor(
    "float32",
    tensorData(input.context.getImageData(0, 0, 640, 640).data, "bgr"),
    [1, 3, 640, 640],
  );
  let outputs: Record<string, Tensor> = {};
  try {
    outputs = await model.run({ [model.inputNames[0]!]: tensor });
    const faces: Face[] = [];
    for (const stride of [8, 16, 32]) {
      const cls = outputs[`cls_${stride}`]?.data,
        obj = outputs[`obj_${stride}`]?.data,
        box = outputs[`bbox_${stride}`]?.data,
        points = outputs[`kps_${stride}`]?.data;
      if (
        ![cls, obj, box, points].every((value) => value instanceof Float32Array)
      )
        throw new Error("Invalid face detection output.");
      const columns = 640 / stride;
      for (let i = 0; i < columns * columns; i++) {
        const score = Math.sqrt(Math.max(0, Number(cls![i]) * Number(obj![i])));
        if (score < 0.55) continue;
        const x = i % columns,
          y = Math.floor(i / columns),
          w = (Math.exp(Number(box![i * 4 + 2])) * stride) / ratio,
          h = (Math.exp(Number(box![i * 4 + 3])) * stride) / ratio;
        const cx = ((x + Number(box![i * 4])) * stride) / ratio,
          cy = ((y + Number(box![i * 4 + 1])) * stride) / ratio;
        if (
          ![w, h, cx, cy].every(Number.isFinite) ||
          w < 12 ||
          h < 12 ||
          cx > source.width ||
          cy > source.height
        )
          continue;
        faces.push({
          score,
          box: [cx - w / 2, cy - h / 2, w, h],
          points: Array.from({ length: 5 }, (_, j) => [
            ((x + Number(points![i * 10 + j * 2])) * stride) / ratio,
            ((y + Number(points![i * 10 + j * 2 + 1])) * stride) / ratio,
          ]),
        });
      }
    }
    return suppressFaces(faces);
  } finally {
    tensor.dispose();
    Object.values(outputs).forEach((value) => value.dispose());
    await model.release();
  }
}

/** Detect, align, restore and feather faces back into the full-sized photograph. */
export async function restoreFaces(
  source: Source,
  output: OffscreenCanvas,
  strength: number,
  report: Progress,
  requireFace = true,
) {
  const faces = await detectFaces(source, (fraction, label) =>
    report(fraction * 0.1, label),
  );
  if (!faces.length) {
    if (!requireFace) return 0;
    throw new Error(
      "No face was detected clearly enough. Crop closer to the face and retry, or choose Motion deblur for the whole photo.",
    );
  }
  if (faces.length > 8)
    throw new Error(
      "This photo has more than eight faces. Crop it into smaller groups for face restoration.",
    );
  const model = await session("restoreformer", (fraction, label) =>
    report(0.1 + fraction * 0.25, label),
  );
  try {
    const aligned = canvas(512, 512),
      restored = canvas(512, 512),
      destination = output.getContext("2d")!;
    for (let index = 0; index < faces.length; index++) {
      const transform = alignFace(faces[index]!.points);
      aligned.context.setTransform(1, 0, 0, 1, 0, 0);
      aligned.context.fillStyle = "#808080";
      aligned.context.fillRect(0, 0, 512, 512);
      aligned.context.setTransform(...transform);
      aligned.context.drawImage(source, 0, 0);
      report(
        0.35 + (index / faces.length) * 0.6,
        `RestoreFormer++ · face ${index + 1} of ${faces.length}`,
      );
      const pixels = await predict(
        model,
        aligned.context.getImageData(0, 0, 512, 512).data,
        512,
        512,
        "signed",
      );
      for (let y = 0; y < 512; y++)
        for (let x = 0; x < 512; x++) {
          const distance = Math.hypot((x - 256) / 210, (y - 285) / 225);
          const fade = Math.max(0, Math.min(1, (1 - distance) / 0.2));
          pixels[(y * 512 + x) * 4 + 3] =
            255 * strength * fade * fade * (3 - 2 * fade);
        }
      restored.context.putImageData(new ImageData(pixels, 512, 512), 0, 0);
      const inverse = new DOMMatrix(transform).inverse(),
        scale = output.width / source.width;
      destination.save();
      destination.scale(scale, scale);
      destination.transform(
        inverse.a,
        inverse.b,
        inverse.c,
        inverse.d,
        inverse.e,
        inverse.f,
      );
      destination.drawImage(restored.image, 0, 0);
      destination.restore();
    }
    return faces.length;
  } finally {
    await model.release();
  }
}
