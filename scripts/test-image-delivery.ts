import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "@playwright/test";

const base = process.env.E2E_BASE ?? "http://localhost:3100";
const executablePath = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
].find((candidate): candidate is string => Boolean(candidate && existsSync(candidate)));
const browser = await chromium.launch({ executablePath });

try {
  for (const width of [320, 390, 768, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      deviceScaleFactor: 2,
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    page.setDefaultNavigationTimeout(15_000);
    await page.goto(base);
    const images = page.locator('img[alt$="Terracotta vase with olive branches in warm sunlight"]');
    assert.equal(await images.count(), 2);
    let bytes = 0;
    for (const image of await images.all()) {
      await image.evaluate(async (element) => {
        if (!(element instanceof HTMLImageElement)) throw new Error("Expected an image");
        await element.decode();
      });
      const source = await image.evaluate((element) => (element as HTMLImageElement).currentSrc);
      assert.equal(new URL(source).pathname, "/_next/image");
      assert.ok(await image.getAttribute("srcset"));
      assert.ok(await image.getAttribute("sizes"));
      const response = await context.request.get(source, { headers: { Accept: "image/webp" } });
      assert.equal(response.status(), 200);
      assert.match(response.headers()["content-type"] ?? "", /image\/webp/);
      bytes += (await response.body()).byteLength;
    }
    if (width < 640) assert.ok(bytes < 120 * 1024, `Mobile hero downloaded ${bytes} bytes`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const slider = page.getByRole("slider", { name: "Compare original and optimized image" });
    await slider.focus();
    await slider.press("End");
    assert.equal(await slider.getAttribute("aria-valuetext"), "100% original image visible");
    if (width < 768) await page.locator('summary[aria-label="Menu"]').click();
    await page.getByRole("radio", { name: "Dark", exact: true }).first().click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
    console.log(`PASS: ${width}px at 2x DPR, responsive WebP (${Math.round(bytes / 1024)} KiB), comparison, theme, no overflow`);
    await context.close();
  }
} finally {
  await browser.close();
}
