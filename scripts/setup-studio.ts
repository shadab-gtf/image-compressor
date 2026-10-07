/** Reproducible, self-hosted assets. Run with `npm run setup:studio`. */
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
await import("./setup-neural.ts");
const modelRevision = "fa2fa546052fba4c08921230a26cc69a333fca12";
const runtimeVersion = "1.30.0";
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

interface Asset {
  destination: string;
  sha256: string;
  url?: string;
  source?: string;
}

const assets: Asset[] = [
  {
    destination: "public/models/modnet/model.onnx",
    sha256: "07c308cf0fc7e6e8b2065a12ed7fc07e1de8febb7dc7839d7b7f15dd66584df9",
    url: `https://huggingface.co/Xenova/modnet/resolve/${modelRevision}/onnx/model.onnx`,
  },
  {
    destination: "public/models/modnet/LICENSE",
    sha256: "c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4",
    url: "https://raw.githubusercontent.com/ZHKKKe/MODNet/28165a451e4610c9d77cfdf925a94610bb2810fb/LICENSE",
  },
  {
    destination: "public/wasm/ort-wasm-simd-threaded.wasm",
    sha256: "3398c10d07d229bd91b364548e130e0e51a8e5704b88c7c083ebbeb78842dee2",
    source: "node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm",
  },
  {
    destination: "public/wasm/ort-wasm-simd-threaded.mjs",
    sha256: "e13f7f94fc51b4ca72b12faeb1ee95f4ace6dfbc8939bc718aabdc0a27c4299b",
    source: "node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs",
  },
  {
    destination: "public/wasm/LICENSE",
    sha256: "2f07c72751aed99790b8a4869cf2311df85a860b22ded05fa22803587a48922c",
    url: "https://raw.githubusercontent.com/microsoft/onnxruntime/f2c39fe2f838cf35ce7da92824f5a5e3ee6e88a7/LICENSE",
  },
  {
    destination: "public/wasm/ThirdPartyNotices.txt",
    sha256: "143764b952fdb1a7c69ce653bfba74a7744d6a8a573bfb73e235fba356c83de3",
    url: "https://raw.githubusercontent.com/microsoft/onnxruntime/f2c39fe2f838cf35ce7da92824f5a5e3ee6e88a7/ThirdPartyNotices.txt",
  },
];

const packageInfo: unknown = JSON.parse(await readFile(resolve(root, "node_modules/onnxruntime-web/package.json"), "utf8"));
if (typeof packageInfo !== "object" || !packageInfo || !("version" in packageInfo) || packageInfo.version !== runtimeVersion) {
  throw new Error(`Install exactly onnxruntime-web@${runtimeVersion} before preparing the image studio.`);
}

for (const asset of assets) {
  const target = resolve(root, asset.destination);
  try {
    if (sha256(await readFile(target)) === asset.sha256) {
      console.log(`Verified ${asset.destination}`);
      continue;
    }
  } catch {
    // A missing asset is expected on the first run.
  }
  let bytes: Uint8Array;
  if (asset.source) {
    bytes = await readFile(resolve(root, asset.source));
  } else if (asset.url) {
    console.log(`Downloading ${asset.destination}`);
    const response = await fetch(asset.url, { signal: AbortSignal.timeout(180_000) });
    if (!response.ok) throw new Error(`Could not download ${asset.destination}: HTTP ${response.status}`);
    bytes = new Uint8Array(await response.arrayBuffer());
  } else {
    throw new Error(`Asset has no source: ${asset.destination}`);
  }
  const actual = sha256(bytes);
  if (actual !== asset.sha256) throw new Error(`Checksum mismatch for ${asset.destination}. Expected ${asset.sha256}, received ${actual}. No file was installed.`);
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.download`;
  await writeFile(temporary, bytes);
  await rename(temporary, target);
  console.log(`Installed and verified ${asset.destination} (${bytes.byteLength.toLocaleString()} bytes)`);
}

await writeFile(resolve(root, "public/models/modnet/NOTICE.txt"), [
  "MODNet portrait matting model — Apache License 2.0",
  "Original authors: Zhanghan Ke, Kaican Li, Yurou Zhou, Qiuhua Wu, Xiong Zhou, Qiong Yan, Rynson W. H. Lau.",
  "Original project: https://github.com/ZHKKKe/MODNet",
  "ONNX conversion: https://huggingface.co/Xenova/modnet",
  `Pinned model revision: ${modelRevision}`,
  `Model SHA-256: ${assets[0]!.sha256}`,
  "Original model bytes are redistributed without modification. See LICENSE.",
  "ShrinkFox runs this portrait model locally; it is not a general object segmentation model.",
  "",
].join("\n"));

await writeFile(resolve(root, "public/wasm/NOTICE.txt"), [
  `ONNX Runtime Web ${runtimeVersion} — MIT License`,
  "Copyright (c) Microsoft Corporation. All rights reserved.",
  "https://github.com/microsoft/onnxruntime",
  "Runtime artifacts copied without modification from the exact locked npm dependency.",
  "See LICENSE and ThirdPartyNotices.txt. Use the same version for JavaScript and WebAssembly artifacts.",
  "",
].join("\n"));
console.log("Image studio assets are ready. Runtime requests stay on your own origin.");
