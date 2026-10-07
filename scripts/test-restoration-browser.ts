import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import sharp from "sharp";
import {
  FACE_TEMPLATE,
  alignFace,
  suppressFaces,
} from "../src/engines/face-geometry.ts";

const transform = alignFace(
  FACE_TEMPLATE.map(([x, y]) => [(x - 10) / 2, (y + 20) / 2]),
);
assert.ok(
  Math.abs(transform[0] - 2) < 1e-6 &&
    Math.abs(transform[4] - 10) < 1e-6 &&
    Math.abs(transform[5] + 20) < 1e-6,
);
assert.equal(
  suppressFaces([
    { box: [0, 0, 100, 100], points: [], score: 0.9 },
    { box: [2, 2, 100, 100], points: [], score: 0.7 },
  ]).length,
  1,
);
const base = process.env.BASE_URL ?? "http://localhost:3104";
const browser = await chromium.launch({
  args: process.env.TEST_WEBGPU === "true" ? ["--enable-unsafe-webgpu"] : [],
});
const page = await browser.newPage({ serviceWorkers: "block" });
const errors: string[] = [],
  external: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("request", (request) => {
  if (!request.url().startsWith(base) && !/^(data:|blob:)/.test(request.url()))
    external.push(request.url());
});
page.on("console", (message) => {
  if (message.type() === "error")
    console.log("Browser:", message.text().slice(0, 240));
});
await mkdir("temp/restoration", { recursive: true });
try {
  await page.goto(`${base}/enhance-image`);
  await page.waitForLoadState("networkidle");
  assert.equal(await page.getByLabel("Enhancement method").inputValue(), "full");
  const modes = process.env.RESTORATION_MODES?.split(",") ?? [
    "full",
    ...(process.env.FACE_SAMPLE ? ["face"] : []),
  ];
  for (const [index, mode] of modes.entries()) {
    assert.ok(["deblur", "face", "restore", "full"].includes(mode));
    const sample =
      mode === "deblur" || mode === "full" ? process.env.DEBLUR_SAMPLE : process.env.FACE_SAMPLE;
    let fixture = sample
      ? await sharp(sample).png().toBuffer()
      : await sharp("public/samples/still-life-original.jpg")
          .resize(256, 192, { fit: "fill" })
          .blur(1.2)
          .png()
          .toBuffer();
    if (process.env.PARTIAL_ALPHA === "true") fixture = await sharp(fixture).removeAlpha().ensureAlpha(0.5).png().toBuffer();
    const chooserEvent = page.waitForEvent("filechooser");
    await page
      .getByRole("button", {
        name: index === 0 ? "Choose an image" : "Replace image",
        exact: true,
      })
      .click();
    await (
      await chooserEvent
    ).setFiles({ name: `${mode}.png`, mimeType: "image/png", buffer: fixture });
    await page
      .getByAltText("Original image preview", { exact: true })
      .waitFor();
    await page.getByLabel("Enhancement method").selectOption(mode);
    await page
      .getByLabel("Enlarge")
      .count()
      .then(async (count) => {
        if (count) await page.getByLabel("Enlarge").selectOption("2");
      });
    const start = Date.now();
    await page
      .getByRole("button", { name: "Enhance image", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('[role="alert"]')].some((el) =>
          el.textContent?.trim(),
        ) ||
        (!!document.querySelector("a[download]") &&
          !document.querySelector('[role="progressbar"]')),
      null,
      { timeout: 300_000 },
    );
    const alerts = (
      await page.locator('[role="alert"]').allTextContents()
    ).filter(Boolean);
    assert.deepEqual(alerts, []);
    const downloadEvent = page.waitForEvent("download");
    await page.locator("a[download]").click();
    const download = await downloadEvent;
    assert.equal(download.suggestedFilename(), `${mode}.png`);
    const outputPath = `temp/restoration/${mode}${process.env.PARTIAL_ALPHA === "true" ? "-alpha" : ""}.png`;
    await download.saveAs(outputPath);
    const input = await sharp(fixture).metadata(),
      output = await sharp(outputPath).metadata();
    assert.equal(output.width, input.width! * 2);
    assert.equal(output.height, input.height! * 2);
    if (process.env.PARTIAL_ALPHA === "true") {
      const pixels = await sharp(outputPath).ensureAlpha().raw().toBuffer();
      for (let at = 3; at < pixels.length; at += 4) assert.ok(Math.abs(pixels[at]! - 128) <= 1, "partial alpha must be preserved throughout the image");
      console.log("PASS source transparency is preserved");
    }
    assert.match(
      await page.locator("main:visible").innerText(),
      mode === "deblur" ? /NAFNet deblurring applied/ : mode === "full" ? /Full image processed/ : /Restored \d+ face/,
    );
    console.log(
      `PASS ${mode}: ${Date.now() - start} ms, ${output.width} × ${output.height}`,
    );
  }
  await page.getByLabel("Enhancement method").selectOption("restore");
  await page
    .getByRole("button", { name: "Enhance image", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByText("Processing cancelled. Your original image is unchanged.", {
      exact: true,
    })
    .waitFor();
  console.log("PASS cancellation terminates the restoration worker");
  await page.setViewportSize({ width: 320, height: 800 });
  await page.waitForTimeout(250);
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(
    "PASS alignment, duplicate suppression, mobile width, no uncaught errors, no external requests",
  );
} catch (cause) {
  console.log("Alerts", await page.locator('[role="alert"]').allTextContents());
  console.log((await page.locator("main:visible").innerText()).slice(-4000));
  throw cause;
} finally {
  await browser.close();
}
