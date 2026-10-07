import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
async function installed(path: string, checksum: string) {
  try { return hash(await readFile(resolve(root, path))) === checksum; } catch { return false; }
}
async function download(url: string, checksum: string): Promise<Uint8Array> {
  const response = await fetch(url, { signal: AbortSignal.timeout(300_000) });
  if (!response.ok) throw new Error(`Neural model download failed: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (hash(bytes) !== checksum) throw new Error("Neural model checksum mismatch. No model was installed.");
  return bytes;
}
const realFiles = [
  ["real_esrgan_general_x4v3.onnx", "09e6b675a0a18a97e1057c8dd7e984ef878a0a02ce104430da525b6241c858e7"],
  ["real_esrgan_general_x4v3.data", "512d0ec9940c2e9d85d27f2952f12a0b77b7841dc22df4ce9f3ea458bc98f37f"],
] as const;
await mkdir(resolve(root, "public/models/realesrgan"), { recursive: true });
if (!(await Promise.all(realFiles.map(([name, checksum]) => installed(`public/models/realesrgan/${name}`, checksum)))).every(Boolean)) {
  console.log("Downloading pinned Real-ESRGAN General x4v3 ONNX export");
  const archive = await download("https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models/models/real_esrgan_general_x4v3/releases/v0.64.0/real_esrgan_general_x4v3-onnx-float.zip",
    "fc094329b24a00c936ebc1cc4c51bc59633e7dc36f4a553344342171cbd3c7cf");
  const files = unzipSync(archive);
  for (const [name, checksum] of realFiles) {
    const bytes = files[`real_esrgan_general_x4v3-onnx-float/${name}`];
    if (!bytes || hash(bytes) !== checksum) throw new Error(`Invalid Real-ESRGAN asset: ${name}`);
    await writeFile(resolve(root, `public/models/realesrgan/${name}`), bytes);
  }
}
const partHashes = [
  "f5eab3f5d8736c10a57a991d30303ec93cfc49b1bcca30877e14b7dad9a8c7ba",
  "768e33ed4225dc9b7d780a994f63af84da04adb4587d5dfc31a4388016303b49",
  "8cf43e37f883a8f68ca859630293a0ad2061ac0a4322c43a89ff224a5e5f9c1b",
  "073bee735cd2abad139247afe500ae48d5524df77916c71fe1cf3db5d8677276",
];
await mkdir(resolve(root, "public/models/birefnet"), { recursive: true });
if (!(await Promise.all(partHashes.map((checksum, index) => installed(`public/models/birefnet/model.part${index}`, checksum)))).every(Boolean)) {
  console.log("Downloading pinned BiRefNet Lite 512 ONNX export (192 MB)");
  const bytes = await download("https://huggingface.co/studioludens/birefnet-lite-512/resolve/4a3c40c36c94093cc1e724d9ea428b8fa4b57dc7/onnx/model.onnx",
    "1cb0fb360dadd15af77c639085d77a9df67db0c64315560c3de005f676345ac2");
  // Small static parts avoid a single very large deployment asset.
  for (let index = 0; index < 4; index++) {
    const part = bytes.subarray(index * 48_000_000, Math.min(bytes.length, (index + 1) * 48_000_000));
    if (hash(part) !== partHashes[index]) throw new Error("BiRefNet part checksum mismatch.");
    await writeFile(resolve(root, `public/models/birefnet/model.part${index}`), part);
  }
}
for (const [directory, url, checksum] of [
  ["realesrgan", "https://raw.githubusercontent.com/xinntao/Real-ESRGAN/master/LICENSE", "4a699ec4863d96a91fc265948a0c90033f7e8735d515524dcf3444736406e0c2"],
  ["birefnet", "https://raw.githubusercontent.com/ZhengPeng7/BiRefNet/main/LICENSE", "92a7089e0915fc32bc40067560b398f1e6a7a5958abd7d04eda393629a5acefb"],
] as const) {
  const path = `public/models/${directory}/LICENSE`;
  if (!await installed(path, checksum)) await writeFile(resolve(root, path), await download(url, checksum));
}
await writeFile(resolve(root, "public/models/realesrgan/NOTICE.txt"), "Real-ESRGAN General x4v3 · BSD-3-Clause · Copyright 2021 Xintao Wang.\nOriginal: https://github.com/xinntao/Real-ESRGAN\nONNX export: Qualcomm AI Hub v0.64.0, float, 128×128 input / 512×512 output.\nhttps://huggingface.co/qualcomm/Real-ESRGAN-General-x4v3\nExport bytes are redistributed unmodified; see LICENSE.\n");
await writeFile(resolve(root, "public/models/birefnet/NOTICE.txt"), "BiRefNet Lite · MIT · Copyright 2024 ZhengPeng.\nOriginal: https://github.com/ZhengPeng7/BiRefNet\nBrowser export: https://huggingface.co/studioludens/birefnet-lite-512\nRevision: 4a3c40c36c94093cc1e724d9ea428b8fa4b57dc7 · 512×512 FP32, sigmoid logits.\nSHA-256: 1cb0fb360dadd15af77c639085d77a9df67db0c64315560c3de005f676345ac2\nSplit into four byte-preserving parts, assembled unchanged during inference; see LICENSE.\n");
console.log("Verified Real-ESRGAN and BiRefNet model assets");
