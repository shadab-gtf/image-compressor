import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const folder = resolve("public/ocr");
await mkdir(folder, { recursive: true });
await copyFile("node_modules/@paddleocr/paddleocr-js/dist/assets/worker-entry-C9UNuyOJ.js", `${folder}/paddle-worker.js`);
for (const extension of ["mjs", "wasm"]) await copyFile(`node_modules/paddle-ort-runtime/dist/ort-wasm-simd-threaded.jsep.${extension}`, `${folder}/ort-wasm-simd-threaded.jsep.${extension}`);
for (const name of ["PP-OCRv5_mobile_det", "PP-OCRv5_mobile_rec"]) {
  const path = `${folder}/${name}.tar`;
  try { await readFile(path); } catch {
    const url = `https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/${name}_onnx_infer.tar`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`PaddleOCR asset failed: ${response.status}`);
    await writeFile(path, new Uint8Array(await response.arrayBuffer()));
  }
  const bytes = await readFile(path);
  const expected = name.endsWith("det") ? "781056046c9ed77a15c94681605db6a0f62317c2e9cce6931c71da2478d4bc30" : "f7e792bc836f36e7ef895ad47c426d75b0b75b1650caa6d63fe9418441ffba8c";
  if (createHash("sha256").update(bytes).digest("hex") !== expected) throw new Error(`PaddleOCR model checksum mismatch: ${name}`);
  console.log(name, bytes.length, createHash("sha256").update(bytes).digest("hex"));
}
const license = await fetch("https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/main/LICENSE");
if (!license.ok) throw new Error("PaddleOCR license unavailable");
await writeFile(`${folder}/LICENSE`, await license.text());
const notices = await fetch("https://raw.githubusercontent.com/microsoft/onnxruntime/v1.24.3/ThirdPartyNotices.txt");
if (!notices.ok) throw new Error("ONNX Runtime notices unavailable");
await writeFile(`${folder}/ThirdPartyNotices.txt`, await notices.text());
await writeFile(`${folder}/NOTICE.txt`, "PaddleOCR.js 0.4.2, Apache-2.0. PP-OCRv5 mobile detection and recognition from PaddlePaddle official model assets. Worker embeds ONNX Runtime 1.24.3, OpenCV and third-party notices in its source. Models and runtime are self-hosted; uploaded images never leave the device.\n");
