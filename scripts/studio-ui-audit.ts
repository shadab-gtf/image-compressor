import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const base = process.env.E2E_BASE ?? "http://localhost:3000";
const output = join(tmpdir(), "shrinkfox-ui-audit");
const fixture = process.env.E2E_PORTRAIT_FILE ?? resolve("public/samples/still-life-original.jpg");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true, reducedMotion: "reduce" });
const page = await context.newPage();
const errors: string[] = [];
const layoutIssues: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));

await page.addInitScript(() => {
  const state = { urls: new Set<string>(), workers: 0 };
  Object.defineProperty(window, "__studioAudit", { value: state });
  const create = URL.createObjectURL.bind(URL);
  const revoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (blob) => { const url = create(blob); state.urls.add(url); return url; };
  URL.revokeObjectURL = (url) => { state.urls.delete(url); revoke(url); };
  const NativeWorker = window.Worker;
  window.Worker = class extends NativeWorker {
    stopped = false;
    constructor(url: string | URL, options?: WorkerOptions) { super(url, options); state.workers += 1; }
    override terminate() { if (!this.stopped) { this.stopped = true; state.workers -= 1; } super.terminate(); }
  };
});

const memory = () => page.evaluate(() => {
  const state = (window as unknown as { __studioAudit: { urls: Set<string>; workers: number } }).__studioAudit;
  return { urls: state.urls.size, workers: state.workers };
});

async function upload() {
  const preview = page.locator('img[alt="Original image preview"]:visible');
  const previous = await preview.count() ? await preview.getAttribute("src") : null;
  await page.locator("input[type=file]:visible").setInputFiles(fixture);
  await page.waitForFunction((previousUrl) => [...document.querySelectorAll<HTMLImageElement>('img[alt="Original image preview"]')].some((image) => image.offsetParent !== null && image.getAttribute("src") !== previousUrl), previous);
  await page.getByRole("progressbar").waitFor({ state: "hidden" });
}

try {
  await page.goto(`${base}/remove-background`);
  await page.getByRole("button", { name: "Choose an image", exact: true }).waitFor();
  await page.waitForTimeout(800);
  await upload();
  await page.getByRole("radio", { name: "Simple background", exact: false }).check();
  await page.getByRole("button", { name: "Remove background", exact: true }).click();
  await page.getByRole("link", { name: "Download PNG", exact: true }).waitFor();
  const completed = await memory();
  assert.equal(completed.workers, 0, "completed work terminates its worker");
  assert.equal(completed.urls, 2, "only current preview and result URLs remain");
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download PNG", exact: true }).click();
  const download = await downloadEvent;
  assert.equal(download.suggestedFilename(), `${basename(fixture).replace(/\.[^.]+$/, "")}-cutout.png`);
  const saved = await download.path();
  assert.ok(saved);
  const bytes = await readFile(saved);
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  console.log("PASS PNG filename, real download bytes, completed worker termination, two live blob URLs.");

  const divider = page.getByRole("slider", { name: "Drag image divider to compare before and after" });
  const bounds = await divider.boundingBox();
  assert.ok(bounds);
  await page.mouse.click(bounds.x + bounds.width * 0.75, bounds.y + bounds.height * 0.5);
  const position = Number(await divider.inputValue());
  assert.ok(position >= 73 && position <= 77, "drag target maps to comparison position");
  await divider.focus();
  await page.keyboard.press("ArrowLeft");
  assert.equal(Number(await divider.inputValue()), position - 1);

  await page.screenshot({ path: join(output, "studio-desktop.png"), fullPage: true });
  await page.getByRole("navigation", { name: "Main navigation", exact: true }).getByRole("link", { name: "Enhance", exact: true }).click();
  await page.waitForURL("**/enhance-image");
  await page.getByRole("heading", { name: "Image adjustments", exact: true }).waitFor();
  console.log("NAVIGATION", JSON.stringify({ sourceVisible: await page.getByAltText("Original image preview", { exact: true }).count(), oldResult: await page.getByRole("link", { name: "Download PNG", exact: true }).count(), memory: await memory() }));
  assert.equal(await page.getByRole("link", { name: "Download PNG", exact: true }).count(), 0, "remove-background output must not be relabeled as enhanced output");
  await page.goBack();
  await page.waitForURL("**/remove-background");
  await page.getByRole("button", { name: "Choose an image", exact: true }).waitFor();
  assert.equal(await page.getByRole("link", { name: "Download PNG", exact: true }).count(), 0, "Back navigation cannot expose revoked download URLs");
  assert.deepEqual(await memory(), { urls: 0, workers: 0 });
  console.log("PASS Activity navigation releases local images and cannot revive broken downloads.");
  await page.getByRole("navigation", { name: "Main navigation", exact: true }).getByRole("link", { name: "Enhance", exact: true }).click();
  await page.waitForURL("**/enhance-image");
  await upload();
  await page.getByRole("button", { name: "Enhance image", exact: true }).click();
  await page.getByRole("link", { name: "Download PNG", exact: true }).waitFor();
  await upload();
  assert.equal(await page.getByRole("link", { name: "Download PNG", exact: true }).count(), 0);
  assert.equal((await memory()).urls, 1, "replacing source releases prior result and source URLs");
  await page.locator("input[type=file]:visible").setInputFiles({ name: "fake.png", mimeType: "image/png", buffer: Buffer.from("not an image") });
  await page.getByRole("alert").waitFor();
  await page.getByRole("progressbar").waitFor({ state: "hidden" });
  assert.equal((await memory()).workers, 0, "failed inspection terminates its worker");
  assert.equal((await memory()).urls, 1, "failed inspection retains only the current source preview");
  console.log("PASS replacement cleanup and malformed file handling.");

  for (const width of [390, 320, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    for (const route of ["/", "/remove-background", "/enhance-image"]) {
      await page.goto(`${base}${route}`);
      await page.locator("h1").waitFor();
      if (route !== "/") await page.getByRole("button", { name: "Choose an image", exact: true }).waitFor();
      const audit = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        viewport: innerWidth,
        h1s: document.querySelectorAll("h1").length,
        unlabeledImages: [...document.querySelectorAll("img")].filter((image) => !image.hasAttribute("alt")).length,
        unlabeledButtons: [...document.querySelectorAll("button")].filter((button) => !button.textContent?.trim() && !button.getAttribute("aria-label") && !button.getAttribute("title")).length,
        overflows: [...document.querySelectorAll("body *")].filter((element) => element.getBoundingClientRect().right > innerWidth + 1).slice(0, 12).map((element) => `${element.tagName}.${element.className}`),
      }));
      console.log(`LAYOUT ${width} ${route}`, JSON.stringify(audit));
      if (audit.width > audit.viewport) layoutIssues.push(`Horizontal overflow at ${width} ${route}: ${audit.width}px`);
      assert.equal(audit.h1s, 1);
      assert.equal(audit.unlabeledImages, 0);
      assert.equal(audit.unlabeledButtons, 0);
      await page.screenshot({ path: join(output, `${route.slice(1) || "home"}-${width}.png`), fullPage: true });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/remove-background?__theme=dark`);
  await page.getByRole("button", { name: "Choose an image", exact: true }).waitFor();
  await page.waitForTimeout(500);
  await upload();
  await page.getByRole("radio", { name: "Simple background", exact: false }).check();
  await page.getByRole("button", { name: "Remove background", exact: true }).click();
  await page.getByRole("link", { name: "Download PNG", exact: true }).waitFor();
  await page.screenshot({ path: join(output, "studio-mobile-dark-result.png"), fullPage: true });
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  assert.deepEqual(errors, [], "no browser exceptions during audit");
  assert.deepEqual(layoutIssues, [], "no horizontal overflow across audited viewports");
  console.log(`PASS UI audit. Screenshots: ${output}`);
} catch (error) {
  console.log("AUDIT FAILURE", JSON.stringify({ errors, text: await page.locator("body").innerText() }));
  await page.screenshot({ path: join(output, "failure.png"), fullPage: true });
  throw error;
} finally {
  await browser.close();
}
