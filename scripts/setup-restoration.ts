import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
const cvRevision = "47534e27c9851bb1128ccc0102f1145e27f23f98";
const destination = resolve("public/models/restoration");
await mkdir(destination, { recursive: true });
const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const assets = [
  {
    name: "nafnet",
    size: 91736251,
    sha: "07263f416febecce10193dd648e950b22e397cf521eedab1a114ef77b2bc9587",
    url: `https://media.githubusercontent.com/media/opencv/opencv_zoo/${cvRevision}/models/deblurring_nafnet/deblurring_nafnet_2025may.onnx`,
  },
  {
    name: "yunet",
    size: 232589,
    sha: "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4",
    url: `https://media.githubusercontent.com/media/opencv/opencv_zoo/${cvRevision}/models/face_detection_yunet/face_detection_yunet_2023mar.onnx`,
  },
  {
    name: "restoreformer",
    size: 74375477,
    sha: "4b3983dba15b8dd26db1bc94be57558ca4d783424ca6f3715676ab53450bcb6c",
    url: "https://huggingface.co/Saimon8420/restoreformer-pp-web/resolve/9e5912e04026135bc1a7c8557a2da66f521a7b8e/restoreformer_pp_int8w.onnx",
  },
] as const;
for (const asset of assets) {
  const count = Math.ceil(asset.size / 40_000_000);
  let valid = false;
  try {
    const bytes = Buffer.concat(
      await Promise.all(
        Array.from({ length: count }, (_, index) =>
          readFile(`${destination}/${asset.name}.part${index}`),
        ),
      ),
    );
    valid = bytes.length === asset.size && hash(bytes) === asset.sha;
  } catch {
    /* First setup. */
  }
  if (valid) continue;
  console.log(`Downloading ${asset.name} (${Math.round(asset.size / 1e6)} MB)`);
  const response = await fetch(asset.url, {
    signal: AbortSignal.timeout(300_000),
  });
  if (!response.ok) throw new Error(`${asset.name}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length !== asset.size || hash(bytes) !== asset.sha)
    throw new Error(`${asset.name}: checksum mismatch`);
  for (let index = 0; index < count; index++)
    await writeFile(
      `${destination}/${asset.name}.part${index}`,
      bytes.subarray(index * 40_000_000, (index + 1) * 40_000_000),
    );
}
for (const [name, url] of [
  [
    "NAFNet-LICENSE",
    `https://raw.githubusercontent.com/opencv/opencv_zoo/${cvRevision}/models/deblurring_nafnet/LICENSE`,
  ],
  [
    "YuNet-LICENSE",
    `https://raw.githubusercontent.com/opencv/opencv_zoo/${cvRevision}/models/face_detection_yunet/LICENSE`,
  ],
  [
    "RestoreFormer-LICENSE",
    "https://raw.githubusercontent.com/wzhouxiff/RestoreFormerPlusPlus/59d250f45d6b11a3e620d62e6e067ca1288f93a9/LICENSE",
  ],
] as const) {
  try {
    await readFile(`${destination}/${name}`);
  } catch {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`License unavailable: ${name}`);
    await writeFile(`${destination}/${name}`, await response.text());
  }
}
await mkdir(resolve("public/wasm"), { recursive: true });
for (const extension of ["mjs", "wasm"])
  await copyFile(
    `node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.${extension}`,
    `public/wasm/ort-wasm-simd-threaded.jsep.${extension}`,
  );
await writeFile(
  `${destination}/NOTICE.txt`,
  `NAFNet: MIT, Megvii Research; OpenCV Zoo export at ${cvRevision}.\nYuNet: MIT, Shiqi Yu and OpenCV Zoo, same pinned revision.\nRestoreFormer++: Apache-2.0, Zhouxia Wang et al.\nhttps://github.com/wzhouxiff/RestoreFormerPlusPlus\nBrowser int8-weight export by Saimon8420 at revision 9e5912e04026135bc1a7c8557a2da66f521a7b8e.\nhttps://huggingface.co/Saimon8420/restoreformer-pp-web\nOriginal model bytes are split without modification for static hosting. SHA-256 verification is in scripts/setup-restoration.ts.\n`,
);
console.log("Verified face restoration, face detection and deblurring assets");
