import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";
import { PUBLIC_PATHS } from "../src/lib/site.ts";

const base = new URL(process.env.E2E_BASE ?? "http://localhost:3100");
const screenshotDirectory = path.join(tmpdir(), "shrinkfox-site-check");
const chromePath = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((candidate): candidate is string =>
  Boolean(candidate && existsSync(candidate)),
);

for (const pathname of [...PUBLIC_PATHS, "/app"]) {
  const response = await fetch(new URL(pathname, base));
  assert.equal(response.status, 200, `${pathname} must render successfully`);
  const html = await response.text();
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
  assert.ok(
    title && title.length >= 12 && !title.includes("Create Next App"),
    `${pathname} needs a useful title`,
  );
  assert.ok(
    /<meta name="description" content="[^"]{40,}"/.test(html),
    `${pathname} needs a description`,
  );
  assert.equal(
    (html.match(/<h1(?:\s|>)/g) ?? []).length,
    1,
    `${pathname} needs one primary heading`,
  );
  assert.ok(
    !html.includes("fonts.googleapis.com"),
    "fonts must not require a third-party request",
  );
  if (pathname === "/app")
    assert.match(html, /<meta name="robots" content="noindex/);
  assert.match(
    response.headers.get("content-security-policy") ?? "",
    /object-src 'none'/,
  );
}
console.log(
  `PASS: ${PUBLIC_PATHS.length + 1} routes, metadata, headings and security headers`,
);

const manifestResponse = await fetch(new URL("/manifest.webmanifest", base));
assert.equal(manifestResponse.status, 200);
const manifest = (await manifestResponse.json()) as {
  start_url: string;
  display: string;
  scope: string;
  icons: { src: string; sizes: string; purpose?: string }[];
};
assert.equal(manifest.display, "standalone");
assert.equal(manifest.scope, "/");
assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable"));
for (const size of [192, 512]) {
  const icon = manifest.icons.find((item) => item.sizes === `${size}x${size}`);
  assert.ok(icon, `manifest needs a ${size}px icon`);
  const response = await fetch(new URL(icon.src, base));
  assert.equal(response.status, 200);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.readUInt32BE(16), size);
  assert.equal(bytes.readUInt32BE(20), size);
}
const swResponse = await fetch(new URL("/sw.js", base));
assert.equal(swResponse.status, 200);
assert.equal(swResponse.headers.get("service-worker-allowed"), "/");
assert.match(swResponse.headers.get("cache-control") ?? "", /no-cache/);
assert.ok(!(await swResponse.text()).includes("__SW_VERSION__"));
const ogResponse = await fetch(new URL("/opengraph-image", base));
assert.equal(ogResponse.status, 200);
assert.match(ogResponse.headers.get("content-type") ?? "", /image\/png/);
const fixtureBytes = Buffer.from(
  await (await fetch(new URL("/icons/icon-192.png", base))).arrayBuffer(),
);
console.log(
  "PASS: installable manifest, actual icon dimensions, generated service worker and social image",
);

const browser = await chromium.launch({
  ...(chromePath ? { executablePath: chromePath } : {}),
  headless: true,
});
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: "allow",
  });
  await context.addInitScript(() => {
    // Exercise the documented cross-browser installation guidance without
    // opening an OS-owned install dialog in this unattended smoke test.
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    });
  });
  const page = await context.newPage();
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) =>
    failedRequests.push(`${request.url()}: ${request.failure()?.errorText}`),
  );
  await page.goto(base.href, { waitUntil: "networkidle" });
  await page.waitForFunction(
    () => navigator.serviceWorker.controller !== null,
    undefined,
    { timeout: 30_000 },
  );
  await mkdir(screenshotDirectory, { recursive: true });
  await page.screenshot({
    path: path.join(screenshotDirectory, "home-desktop.png"),
    fullPage: true,
  });
  assert.equal(
    await page.locator("main main").count(),
    0,
    "main landmarks must not be nested",
  );
  await page.getByRole("button", { name: "Install app", exact: true }).click();
  await page.getByText("Keep ShrinkFox within reach").waitFor();
  await page.getByRole("button", { name: "Got it", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "mobile layout must fit the viewport",
  );
  await page.screenshot({
    path: path.join(screenshotDirectory, "home-mobile.png"),
    fullPage: true,
  });

  await page.goto(new URL("/app", base).href, { waitUntil: "networkidle" });
  await page.waitForSelector('input[type="file"]', { state: "attached" });
  const workspaceHeading = await page.locator("h1").innerText();
  await page.waitForFunction(async () => {
    const names = (await caches.keys()).filter((name) =>
      name.startsWith("shrinkfox-shell-"),
    );
    return (
      await Promise.all(
        names.map(async (name) => (await caches.open(name)).match("/app")),
      )
    ).some(Boolean);
  });
  await context.setOffline(true);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector('input[type="file"]', { state: "attached" });
  assert.equal(
    await page.locator("h1").innerText(),
    workspaceHeading,
    "offline reload should preserve the workspace page",
  );
  assert.equal(await page.locator("main main").count(), 0);
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: "offline-check.png",
      mimeType: "image/png",
      buffer: fixtureBytes,
    });
  await page
    .getByRole("button", { name: /^Start processing \d+ images$/ })
    .click();
  try {
    await page
      .getByRole("button", { name: "Download offline-check.png", exact: true })
      .waitFor({ timeout: 30_000 });
  } catch (error) {
    await page.screenshot({
      path: path.join(screenshotDirectory, "offline-processing-failure.png"),
      fullPage: true,
    });
    console.error(
      "Offline processing state:",
      await page.locator("main").innerText(),
    );
    console.error(
      "Runtime errors:",
      pageErrors,
      "Failed requests:",
      failedRequests,
    );
    throw error;
  }
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download offline-check.png", exact: true })
    .click();
  assert.equal(
    await (await downloadPromise).failure(),
    null,
    "offline processing must produce a downloadable file",
  );
  await page.goto(new URL("/a-page-never-cached", base).href, {
    waitUntil: "domcontentloaded",
  });
  assert.match(await page.locator("h1").innerText(), /offline/i);
  await page.getByRole("link", { name: "Open saved workspace" }).click();
  await page.waitForSelector('input[type="file"]', { state: "attached" });
  await context.setOffline(false);
  assert.deepEqual(pageErrors, [], "pages should not throw runtime errors");
  console.log(
    "PASS: desktop/mobile layout, install guidance, offline workspace reload, processing/download and fallback recovery",
  );
  console.log(`Screenshots: ${screenshotDirectory}`);
  await context.close();
} finally {
  await browser.close();
}
