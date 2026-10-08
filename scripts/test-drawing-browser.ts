import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import sharp from "sharp";
import { getDrawingSymbols } from "../src/lib/api/drawing.ts";

const browser = await chromium.launch();
const base = process.env.BASE_URL ?? "http://localhost:3000";
await mkdir("temp/drawing-check", { recursive: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    serviceWorkers: "block",
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/smart-draw`);
  const canvas = page.getByRole("img", { name: "Drawing canvas", exact: true });
  await canvas.waitFor();
  const rectangle = (await canvas.boundingBox())!;
  const house = getDrawingSymbols().find((symbol) => symbol.id === "house")!;
  for (const stroke of house.strokes) {
    const first = stroke[0]!;
    await page.mouse.move(
      rectangle.x + ((140 + first.x * 2) / 1200) * rectangle.width,
      rectangle.y + ((100 + first.y * 2) / 800) * rectangle.height,
    );
    await page.mouse.down();
    for (const point of stroke.slice(1))
      await page.mouse.move(
        rectangle.x + ((140 + point.x * 2) / 1200) * rectangle.width,
        rectangle.y + ((100 + point.y * 2) / 800) * rectangle.height,
        { steps: 4 },
      );
    await page.mouse.up();
  }
  await page
    .getByRole("button", { name: "Use House drawing", exact: true })
    .click();
  assert.equal(await canvas.locator("[data-object-id]").count(), 1);
  await page.getByLabel("Object rotation", { exact: true }).fill("15");
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  assert.equal(await canvas.locator("[data-object-id]").count(), 2);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  assert.equal(await canvas.locator("[data-object-id]").count(), 1);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  assert.equal(await canvas.locator("[data-object-id]").count(), 2);
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page
    .getByLabel("Text to place", { exact: true })
    .fill("Hello ShrinkFox!");
  await canvas.click({
    position: { x: rectangle.width * 0.55, y: rectangle.height * 0.55 },
  });
  assert.equal(await canvas.locator("text").textContent(), "Hello ShrinkFox!");
  const textWidth = Number(await page.getByLabel("Object width", { exact: true }).inputValue());
  await page.getByLabel("Object width", { exact: true }).fill(String(textWidth * 2));
  const textScale = Number((await canvas.locator("text").getAttribute("transform"))!.match(/scale\(([^ ]+)/)![1]);
  assert.ok(Math.abs(textScale - 2) < 0.01, "resizing text scales the actual glyphs, allowing rounded inspector dimensions");
  await page.getByRole("button", { name: "Select layer House 1", exact: true }).click();
  await page.getByLabel("Object fill color", { exact: true }).fill("#f59e0b");
  assert.equal(await canvas.locator("[data-object-id]").first().locator("polyline").first().getAttribute("fill"), "#f59e0b");
  await page.getByRole("button", { name: "To front", exact: true }).click();
  assert.equal(await canvas.locator("[data-object-id]").last().locator("polyline").first().getAttribute("fill"), "#f59e0b");
  await page.getByLabel("Transparent background", { exact: true }).check();
  await page.getByLabel("Drawing name", { exact: true }).fill("Drawing test");
  for (const [label, extension] of [
    ["Download PNG", "png"],
    ["SVG", "svg"],
    ["Save project", "shrinkfox.json"],
  ]) {
    const event = page.waitForEvent("download");
    await page.getByRole("button", { name: label, exact: true }).click();
    const download = await event;
    assert.equal(download.suggestedFilename(), `Drawing test.${extension}`);
    await download.saveAs(`temp/drawing-check/result.${extension}`);
  }
  const image = sharp("temp/drawing-check/result.png");
  const metadata = await image.metadata();
  assert.equal(metadata.width, 1200);
  assert.equal(metadata.height, 800);
  const pixels = await image.ensureAlpha().raw().toBuffer();
  assert.equal(pixels[3], 0);
  assert.ok(pixels.some((value, index) => index % 4 === 3 && value > 0));
  const svg = await readFile("temp/drawing-check/result.svg", "utf8");
  assert.ok(svg.includes("Hello ShrinkFox!"));
  await page.getByRole("button", { name: "New", exact: true }).click();
  assert.equal(await canvas.locator("[data-object-id]").count(), 0);
  await page
    .getByLabel("Open drawing project", { exact: true })
    .setInputFiles("temp/drawing-check/result.shrinkfox.json");
  await page.waitForFunction(
    () => document.querySelectorAll("[data-object-id]").length === 3,
  );
  await page.waitForTimeout(700);
  await page.reload();
  await canvas.waitFor();
  assert.equal(await canvas.locator("[data-object-id]").count(), 3);
  await page.getByRole("button", { name: "Smart sketch", exact: true }).click();
  await page.screenshot({
    path: "temp/drawing-check/desktop.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS desktop: sketch → suggestion, objects, text, history, PNG/SVG/project export, project import and reload recovery.",
  );

  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
    serviceWorkers: "block",
  });
  await mobile.goto(`${base}/smart-draw`);
  const mobileCanvas = mobile.getByRole("img", {
    name: "Drawing canvas",
    exact: true,
  });
  await mobileCanvas.waitFor();
  await mobile.getByLabel("Search drawings", { exact: true }).fill("cat");
  await mobile
    .getByRole("button", { name: "Use Cat drawing", exact: true })
    .tap();
  await mobile.getByRole("button", { name: "Freehand", exact: true }).tap();
  await mobileCanvas.scrollIntoViewIfNeeded();
  const bounds = (await mobileCanvas.boundingBox())!;
  const cdp = await mobile.context().newCDPSession(mobile);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: bounds.x + 30, y: bounds.y + 30, id: 0 }],
  });
  for (let i = 1; i <= 6; i++)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: bounds.x + 30 + i * 15, y: bounds.y + 30 + i * 10, id: 0 },
      ],
    });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  assert.equal(await mobileCanvas.locator("[data-object-id]").count(), 2);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: bounds.x+80, y: bounds.y+70, id: 0 }, { x: bounds.x+160, y: bounds.y+70, id: 1 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: bounds.x+50, y: bounds.y+70, id: 0 }, { x: bounds.x+190, y: bounds.y+70, id: 1 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  assert.ok(Number((await mobile.getByRole("button", { name: "Fit canvas", exact: true }).textContent())!.replace("%", "")) > 100);
  assert.equal(await mobileCanvas.locator("[data-object-id]").count(), 2, "pinching must not add a stray stroke");
  await mobile.getByRole("button", { name: "Fit canvas", exact: true }).tap();
  assert.ok(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
    "no horizontal page overflow",
  );
  await mobile.screenshot({
    path: "temp/drawing-check/mobile.png",
    fullPage: true,
  });
  console.log(
    "PASS mobile: symbol search, touch drawing, no horizontal overflow.",
  );
} finally {
  await browser.close();
}
