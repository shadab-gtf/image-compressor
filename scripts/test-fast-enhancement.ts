import assert from "node:assert/strict";
import { chromium } from "playwright";

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ serviceWorkers: "block" });
  const errors: string[] = [];
  const models: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (/\/models\/|\/wasm\//.test(request.url())) models.push(request.url()); });
  await page.goto(`${process.env.BASE_URL ?? "http://localhost:3000"}/enhance-image`);
  await page.waitForTimeout(1000);
  for (const fixture of [
    { width: 900, height: 600, type: "image/webp" },
    { width: 4000, height: 3000, type: "image/jpeg" },
    { width: 10000, height: 200, type: "image/png" },
  ]) {
    const bytes = await page.evaluate(async ({ width, height, type }) => {
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "#938065"; context.fillRect(0, 0, width, height);
      context.fillStyle = "#3e798d"; context.fillRect(width / 4, height / 4, width / 2, height / 2);
      const blob = await new Promise<Blob>(resolve => canvas.toBlob(value => resolve(value!), type, 0.8));
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    }, fixture);
    assert.ok(bytes.length < 2_000_000);
    await page.locator("input[type=file]").setInputFiles({ name: `fixture.${fixture.type.split("/")[1]}`, mimeType: fixture.type, buffer: Buffer.from(bytes) });
    await page.getByRole("button", { name: "Enhance image", exact: true }).waitFor();
    await page.waitForFunction(() => !document.querySelector('[role="progressbar"]'));
    assert.deepEqual((await page.locator('[role="alert"]').allTextContents()).filter(text => text.trim()), []);
    assert.equal(await page.getByLabel("Enhancement method").inputValue(), "standard");
    const start = performance.now();
    await page.getByRole("button", { name: "Enhance image", exact: true }).click();
    await page.locator("a[download]").waitFor({ timeout: 10_000 });
    const elapsed = performance.now() - start;
    const result = await page.evaluate(async () => {
      const image = new Image();
      image.src = document.querySelector<HTMLAnchorElement>("a[download]")!.href;
      await image.decode();
      const bitmap = await createImageBitmap(image);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close(); return size;
    });
    assert.ok(result.width * result.height <= 6_000_000);
    assert.ok(elapsed < 10_000, `Fast enhancement took ${elapsed} ms`);
    console.log(`PASS ${fixture.type} ${fixture.width}×${fixture.height} → ${result.width}×${result.height}: ${Math.round(elapsed)} ms`);
  }
  assert.deepEqual(models, [], "fast enhancement never downloads models");
  assert.deepEqual(errors, []);
  if (process.env.STUDIO_TEST_FILE) {
    await page.locator("input[type=file]").setInputFiles(process.env.STUDIO_TEST_FILE);
    await page.getByAltText("Original image preview", { exact: true }).waitFor();
    await page.getByLabel("Enhancement method").selectOption("full");
    await page.locator("select[id$=scale]").selectOption("2");
    const started = performance.now();
    await page.getByRole("button", { name: "Enhance image", exact: true }).click();
    await page.locator("a[download]").waitFor({ timeout: 20_000 });
    assert.deepEqual((await page.locator('[role="alert"]').allTextContents()).filter(text => text.trim()), []);
    console.log(`PASS supplied image: 2× full-mode request completed without a dimension error in ${Math.round(performance.now() - started)} ms`);
    if (process.env.STUDIO_TEST_RESULT) {
      const downloading = page.waitForEvent("download");
      await page.locator("a[download]").click();
      await (await downloading).saveAs(process.env.STUDIO_TEST_RESULT);
    }
  }
  for (const compatibility of ["mobile", "no-worker"] as const) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: compatibility === "mobile" ? "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36" : undefined, reducedMotion: "reduce", serviceWorkers: "block" });
    if (compatibility === "no-worker") await context.addInitScript(() => {
      Object.defineProperty(window, "OffscreenCanvas", { value: undefined });
      Object.defineProperty(window, "Worker", { value: undefined });
    });
    await context.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) {
        setTimeout(() => original.call(this, callback, type, quality), 400);
      };
    });
    const mobile = await context.newPage();
    const modelRequests: string[] = [];
    mobile.on("request", request => { if (/\/models\/|\/wasm\//.test(request.url())) modelRequests.push(request.url()); });
    await mobile.goto(`${process.env.BASE_URL ?? "http://localhost:3000"}/enhance-image`);
    await mobile.waitForTimeout(1000);
    const jpeg = await mobile.evaluate(async () => {
      const canvas = document.createElement("canvas"); canvas.width = 201; canvas.height = 250;
      const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#998877"; ctx.fillRect(0, 0, 201, 250);
      ctx.font = "20px Arial"; ctx.fillStyle = "#000"; ctx.fillText("Clear text", 20, 50);
      const blob = await new Promise<Blob>(resolve => canvas.toBlob(value => resolve(value!), "image/jpeg"));
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    });
    await mobile.locator("input[type=file]").setInputFiles({ name: "images.jfif", mimeType: "image/jpeg", buffer: Buffer.from(jpeg) });
    await mobile.getByAltText("Original image preview", { exact: true }).waitFor();
    await mobile.getByLabel("Enhancement method").selectOption("full");
    await mobile.getByRole("button", { name: "Enhance image", exact: true }).click();
    await mobile.locator(".sf-enhancing-overlay").waitFor();
    assert.equal(await mobile.locator(".sf-enhancing-sweep").evaluate(element => getComputedStyle(element).animationName), "none");
    await mobile.locator("a[download]").waitFor({ timeout: 10_000 });
    await mobile.locator(".sf-enhancing-overlay").waitFor({ state: "detached" });
    assert.ok((await mobile.locator("body").innerText()).includes("lightweight processing"));
    assert.deepEqual(modelRequests, []);
    assert.deepEqual((await mobile.locator('[role="alert"]').allTextContents()).filter(text => text.trim()), []);
    console.log(`PASS ${compatibility}: JFIF upload, lightweight fallback, waiting overlay and reduced motion`);
    await context.close();
  }
} finally {
  await browser.close();
}
