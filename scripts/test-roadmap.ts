import assert from "node:assert/strict";
import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { unzipSync } from "fflate";
import { cropGeometry } from "../src/engines/editor.ts";
import { parseOptions, parsePresets } from "../src/lib/preset-schema.ts";
import { DEFAULT_OPTIONS } from "../src/types/options.ts";
import { createZip, streamZip } from "../src/lib/zip.ts";

assert.equal(
  cropGeometry(192, 160, {
    selection: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
    rotation: 90,
    straighten: 0,
  }).width,
  80,
);
assert.throws(() =>
  cropGeometry(100, 100, {
    selection: { x: 0, y: 0, width: 2, height: 1 },
    rotation: 0,
    straighten: 0,
  }),
);
assert.throws(() =>
  parsePresets({
    version: 1,
    presets: [{ id: "bad", name: "Bad", options: {} }],
  }),
);
assert.deepEqual(
  parseOptions({ ...DEFAULT_OPTIONS, privatePhoto: "discard" }),
  DEFAULT_OPTIONS,
);
const streamed: BlobPart[] = [];
const entries = [
  { name: "one.txt", data: new Blob(["hello"]) },
  { name: "one.txt", data: new Blob(["world"]) },
];
await streamZip(entries, {
  write: async (chunk) => {
    streamed.push(chunk);
  },
});
assert.deepEqual(
  Object.keys(
    unzipSync(new Uint8Array(await new Blob(streamed).arrayBuffer())),
  ),
  ["one.txt", "one (1).txt"],
);
assert.equal((await createZip(entries)).size, new Blob(streamed).size);
console.log(
  "PASS crop geometry, unsafe presets, settings-only import and streamed ZIP integrity",
);

const browser = await chromium.launch();
const page = await browser.newPage({ serviceWorkers: "block" });
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
const base = process.env.BASE_URL ?? "http://localhost:3102";
async function navigate(url: string) {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}
const png = await sharp({
  create: { width: 192, height: 160, channels: 4, background: "white" },
})
  .composite([
    {
      input: await sharp({
        create: { width: 100, height: 90, channels: 4, background: "#b53b27" },
      })
        .png()
        .toBuffer(),
      left: 45,
      top: 40,
    },
  ])
  .png()
  .toBuffer();
const upload = { name: "fixture.png", mimeType: "image/png", buffer: png };
async function pixels() {
  return page.evaluate(async () => {
    const link = document.querySelector<HTMLAnchorElement>("a[download]")!;
    const picture = new Image();
    picture.src = link.href;
    await picture.decode();
    const bitmap = await createImageBitmap(picture);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    const center = Array.from(
      ctx.getImageData(
        Math.floor(bitmap.width / 2),
        Math.floor(bitmap.height / 2),
        1,
        1,
      ).data,
    );
    const edge = Array.from(ctx.getImageData(0, 0, 1, 1).data);
    bitmap.close();
    return { width: canvas.width, height: canvas.height, center, edge };
  });
}
async function processAction(label: string) {
  const previous = (await page.locator("a[download]").count())
    ? await page.locator("a[download]").getAttribute("href")
    : null;
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.waitForFunction(
    (old) => {
      const link = document.querySelector<HTMLAnchorElement>("a[download]");
      return link && link.getAttribute("href") !== old;
    },
    previous,
    { timeout: 90000 },
  );
}
try {
  await navigate(`${base}/remove-background`);
  await page.getByText("Simple background", { exact: true }).click();
  await page.locator('input[type="file"]').first().setInputFiles(upload);
  await page.getByAltText("Original image preview").waitFor();
  await processAction("Remove background");
  assert.equal((await pixels()).edge[3], 0);
  await page
    .getByRole("button", { name: "Refine edges & change background" })
    .click();
  const canvas = page.locator('canvas[aria-label^="Cutout mask"]');
  await page.waitForFunction(() => {
    const canvas = document.querySelector("canvas");
    return canvas && canvas.width === 192;
  });
  async function stroke() {
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    assert.ok(box);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + 2,
      box.y + box.height / 2 + 2,
    );
    await page.mouse.up();
  }
  await stroke();
  await processAction("Apply edits");
  assert.equal((await pixels()).center[3], 0);
  await page.getByRole("button", { name: "restore", exact: true }).click();
  await stroke();
  await processAction("Apply edits");
  assert.equal((await pixels()).center[3], 255);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await processAction("Apply edits");
  assert.equal((await pixels()).center[3], 0);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await processAction("Apply edits");
  assert.equal((await pixels()).center[3], 255);
  await page.getByLabel("Background style").selectOption("solid");
  await processAction("Apply edits");
  assert.deepEqual((await pixels()).edge, [255, 255, 255, 255]);
  await page.getByLabel("Background style").selectOption("gradient");
  await processAction("Apply edits");
  assert.equal((await pixels()).edge[3], 255);
  assert.notDeepEqual((await pixels()).edge, [255, 255, 255, 255]);
  const background = await sharp({
    create: { width: 32, height: 24, channels: 4, background: "#1234ab" },
  })
    .png()
    .toBuffer();
  await page
    .locator('input[type="file"]')
    .last()
    .setInputFiles({
      name: "background.png",
      mimeType: "image/png",
      buffer: background,
    });
  await page
    .getByLabel("Background style")
    .locator('option[value="image"]')
    .waitFor({ state: "attached" });
  await processAction("Apply edits");
  assert.deepEqual((await pixels()).edge, [18, 52, 171, 255]);
  console.log(
    "PASS erase, restore, undo/redo, original-resolution PNG, solid/gradient/image backgrounds",
  );

  await navigate(`${base}/crop-image`);
  await page.locator('input[type="file"]').first().setInputFiles(upload);
  await page.getByAltText("Original image preview").waitFor();
  await page.getByLabel("Aspect ratio").selectOption("1");
  await page.getByRole("button", { name: "Rotate 90°", exact: true }).click();
  await processAction("Apply crop");
  const crop = await pixels();
  assert.equal(crop.width, 160);
  assert.equal(crop.height, 160);
  const corner = page.getByRole("button", {
    name: "Resize nw crop corner. Use arrow keys.",
  });
  await corner.focus();
  await corner.press("ArrowRight");
  await processAction("Apply crop");
  assert.ok((await pixels()).width < 160);
  console.log(
    "PASS crop aspect ratio, rotation, keyboard corners and downloaded dimensions",
  );

  await navigate(`${base}/export-recipes`);
  await page.locator('input[type="file"]').setInputFiles(upload);
  await page.getByAltText("Preview of fixture.png").waitFor();
  const downloadWait = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download variants ZIP", exact: true })
    .click();
  const download = await downloadWait;
  const path = await download.path();
  assert.ok(path);
  const archive = unzipSync(await readFile(path));
  assert.equal(Object.keys(archive).length, 4);
  assert.match(
    new TextDecoder().decode(archive["export-report.txt"]),
    /product-thumbnail/,
  );
  assert.ok(Object.values(archive).every((bytes) => bytes.length > 0));
  console.log("PASS named editable recipes, image variants and ZIP report");

  await navigate(`${base}/compress-image`);
  await page.locator('input[type="file"]').first().setInputFiles(upload);
  await page.waitForURL("**/app");
  await page.getByText("Your saved presets", { exact: true }).click();
  await page.getByLabel("Preset name").fill("My shop");
  await page
    .getByRole("button", { name: "Save current settings", exact: true })
    .click();
  await page.reload();
  await page.getByText("Your saved presets", { exact: true }).click();
  await page.getByRole("button", { name: "My shop", exact: true }).waitFor();
  assert.ok(
    await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("shrinkfox.presets.v1")!);
      return (
        data.presets.length === 1 &&
        !JSON.stringify(data).includes("fixture.png")
      );
    }),
  );
  await page
    .getByRole("button", { name: "Delete My shop", exact: true })
    .click();
  assert.equal(
    await page.getByRole("button", { name: "My shop", exact: true }).count(),
    0,
  );
  console.log(
    "PASS settings-only local presets survive reload and can be deleted",
  );

  for (const format of ["webp", "jpeg"]) {
    await navigate(`${base}/compress-image`);
    if (format === "webp") {
      await page.locator('input[type="file"]').first().setInputFiles({ ...upload, name: "xyz.png" });
    } else {
      const transfer = await page.evaluateHandle((encoded) => {
        const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
        const data = new DataTransfer();
        data.items.add(new File([bytes], "xyz.png", { type: "image/png" }));
        return data;
      }, png.toString("base64"));
      await page.getByRole("button", { name: /Drop your images here/ }).dispatchEvent("drop", { dataTransfer: transfer });
      await transfer.dispose();
    }
    await page.waitForURL("**/app");
    await page.getByLabel("Image encoder").selectOption("wasm");
    await page.getByLabel("Output format").selectOption(format);
    await page.getByRole("button", { name: /Start processing/ }).click();
    await page
      .getByRole("button", { name: /Download xyz/ })
      .waitFor({ timeout: 90000 });
    const downloadEvent = page.waitForEvent("download");
    await page.getByRole("button", { name: /Download xyz/ }).click();
    const outputDownload = await downloadEvent;
    assert.equal(outputDownload.suggestedFilename(), format === "jpeg" ? "xyz.jpg" : "xyz.webp");
    assert.equal(await page.getByText("Failed", { exact: true }).count(), 0);
  }
  console.log("PASS self-hosted WASM JPEG and WebP exports");
  const tiff = await sharp({
    create: {
      width: 32,
      height: 24,
      channels: 4,
      background: { r: 18, g: 52, b: 171, alpha: 0.5 },
    },
  })
    .tiff({ compression: "none" })
    .toBuffer();
  const ifd = tiff.readUInt32LE(4);
  const count = tiff.readUInt16LE(ifd);
  const orientationAt = Array.from(
    { length: count },
    (_, index) => ifd + 2 + index * 12,
  ).find((at) => tiff.readUInt16LE(at) === 274);
  assert.ok(orientationAt);
  for (let orientation = 1; orientation <= 8; orientation++) {
    const fixture = Buffer.from(tiff);
    fixture.writeUInt16LE(orientation, orientationAt + 8);
    await navigate(`${base}/crop-image`);
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles({
        name: `orientation-${orientation}.tif`,
        mimeType: "image/tiff",
        buffer: fixture,
      });
    await page.getByAltText("Original image preview").waitFor();
    await processAction("Apply crop");
    const output = await pixels();
    assert.equal(output.width, orientation >= 5 ? 24 : 32);
    assert.equal(output.height, orientation >= 5 ? 32 : 24);
    assert.ok(Math.abs(output.edge[3]! - 128) <= 1);
  }
  console.log(
    "PASS real TIFF fixture, all eight orientations and partial alpha",
  );
  assert.deepEqual(errors, []);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await navigate(`${base}/crop-image`);
    await page.locator('input[type="file"]').first().setInputFiles(upload);
    await page.getByAltText("Original image preview").waitFor();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
  }
  console.log(
    "PASS responsive crop at 320, 390 and 1440 pixels; no browser errors",
  );
} catch (cause) {
  console.log(
    await page
      .locator("a[download]")
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          href: (node as HTMLAnchorElement).href,
          text: node.textContent,
        })),
      ),
  );
  console.log(await page.locator("[role=alert]").allTextContents());
  console.log((await page.locator("main:visible").innerText()).slice(0, 4000));
  throw cause;
} finally {
  await browser.close();
}
