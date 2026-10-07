import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
await mkdir(resolve(root, "public/codecs"), { recursive: true });
for (const [name, packageName] of [
  ["webp", "@jsquash/webp"],
  ["mozjpeg", "@jsquash/jpeg"],
]) {
  await copyFile(
    resolve(root, `node_modules/${packageName}/codec/enc/${name}_enc.wasm`),
    resolve(root, `public/codecs/${name}_enc.wasm`),
  );
  await copyFile(
    resolve(root, `node_modules/${packageName}/LICENSE`),
    resolve(root, `public/codecs/${name}-LICENSE`),
  );
  await copyFile(resolve(root, `node_modules/${packageName}/codec/LICENSE.codec.md`), resolve(root, `public/codecs/${name}-THIRD-PARTY-LICENSES.md`));
}
await writeFile(
  resolve(root, "public/codecs/NOTICE.txt"),
  "jSquash WebP 1.5.0 and JPEG 1.6.0 encoder packages are derived from Google Squoosh and licensed under Apache-2.0. Copyright Google Inc.; modifications by Jamie Sinclair. Bundled libwebp and MozJPEG source notices are included in their package distributions. Source: https://github.com/jamsinclair/jSquash\n",
);
