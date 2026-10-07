import { chromium } from "playwright";
import assert from "node:assert/strict";

const base = process.env.BASE_URL ?? "http://localhost:3102";
const browser = await chromium.launch();
const page = await browser.newPage({ serviceWorkers: "block" });
const errors: string[] = [];
const external: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("request", (request) => {
  if (!request.url().startsWith(base) && !/^(blob:|data:)/.test(request.url())) external.push(request.url());
});
async function synthetic() {
  return page.evaluate(() => {
    const image = document.createElement("canvas");
    image.width = 80;
    image.height = 72;
    const context = image.getContext("2d")!;
    context.fillStyle = "#d8cab4";
    context.fillRect(8, 8, 64, 56);
    context.filter = "blur(1px)";
    context.fillStyle = "#264a83";
    context.fillRect(22, 15, 22, 40);
    return image.toDataURL().split(",")[1]!;
  });
}
async function pixels() {
  return page.evaluate(async () => {
    const link = document.querySelector<HTMLAnchorElement>("a[download]")!;
    const image = new Image();
    image.src = link.href;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    return { width: canvas.width, height: canvas.height, data: Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data) };
  });
}
async function processImage(label: string) {
  const old = await page.locator("a[download]").count() ? await page.locator("a[download]").getAttribute("href") : null;
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.waitForFunction((old) => {
    const link = document.querySelector<HTMLAnchorElement>("a[download]");
    return [...document.querySelectorAll("[role=alert]")].some((alert) => alert.textContent?.trim()) || (link && link.href !== old && !document.querySelector("[role=progressbar]"));
  }, old, { timeout: 300_000 });
  const alerts = (await page.locator("[role=alert]").allTextContents()).filter((text) => text.trim());
  assert.deepEqual(alerts, [], alerts.join("\n"));
  return pixels();
}
try {
  await page.goto(`${base}/enhance-image`);
  await page.waitForTimeout(1000);
  const image = await synthetic();
  await page.locator("input[type=file]").first().setInputFiles({ name: "soft.png", mimeType: "image/png", buffer: Buffer.from(image, "base64") });
  await page.getByAltText("Original image preview", { exact: true }).waitFor();
  let ai: Awaited<ReturnType<typeof pixels>> | undefined;
  for (const scale of [2, 3, 4]) {
    await page.locator("select[id$=scale]").selectOption(String(scale));
    const result = await processImage("Enhance image");
    assert.equal(result.width, 80 * scale);
    assert.equal(result.height, 72 * scale);
    assert.equal(result.data[3], 0);
    if (scale === 2) ai = result;
    console.log(`PASS: Real-ESRGAN ${scale}× dimensions and transparency`);
  }
  await page.locator("select[id$=scale]").selectOption("2");
  await page.locator("select").first().selectOption("standard");
  const quick = await processImage("Enhance image");
  assert.ok(ai?.data.some((value, index) => index % 4 !== 3 && Math.abs(value - quick.data[index]!) > 3));
  console.log("PASS: neural result differs from canvas interpolation");
  await page.locator("select").first().selectOption("ai");
  await page.getByRole("button", { name: "Enhance image", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByText("Processing cancelled. Your original image is unchanged.", { exact: true }).waitFor();
  console.log("PASS: cancelling terminates neural worker");
  await page.goto(`${base}/remove-background`);
  await page.waitForTimeout(1000);
  await page.locator("input[type=file]").first().setInputFiles("public/samples/still-life-optimized.webp");
  await page.getByAltText("Original image preview", { exact: true }).waitFor();
  const result = await processImage("Remove background");
  assert.equal(result.width, 1200);
  assert.equal(result.height, 800);
  assert.ok(result.data.some((value, index) => index % 4 === 3 && value < 20));
  assert.ok(result.data.some((value, index) => index % 4 === 3 && value > 230));
  console.log("PASS: BiRefNet predicts transparent background and opaque foreground at original resolution");
  await page.screenshot({ path: "temp/birefnet-result.png" });
  await page.setViewportSize({ width: 320, height: 800 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log("PASS: mobile width, no uncaught errors, no external requests");
} finally { await browser.close(); }
