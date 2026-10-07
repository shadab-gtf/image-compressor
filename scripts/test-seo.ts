import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";
import { PUBLIC_PATHS } from "../src/lib/site.ts";
import { createRobots, createSitemap } from "../src/lib/seo/crawl-policy.ts";

const base = new URL(process.env.E2E_BASE ?? "http://localhost:3102");
const reportPath = path.join(tmpdir(), "shrinkfox-seo-audit.json");
const liveSite = { url: "https://seo-test.example", indexable: true };
const previewSite = { ...liveSite, indexable: false };

// Check the launch policy without publishing a made-up domain into the app.
assert.deepEqual(createSitemap(previewSite, PUBLIC_PATHS), []);
assert.deepEqual(createRobots(previewSite).rules, { userAgent: "*", disallow: "/" });
assert.equal(createSitemap(liveSite, [...PUBLIC_PATHS, "/"]).length, PUBLIC_PATHS.length);
assert.equal(createRobots(liveSite).sitemap, `${liveSite.url}/sitemap.xml`);
assert.deepEqual(createRobots(liveSite).rules, {
  userAgent: "*", allow: "/", disallow: ["/api/"],
});

const browser = await chromium.launch({ headless: true });
const reports: Array<{
  path: string;
  title: string;
  description: string;
  robots: string;
  canonical: string | null;
  headings: { level: number; text: string }[];
  imageCount: number;
}> = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const pathname of [...PUBLIC_PATHS, "/app"]) {
    const response = await page.goto(new URL(pathname, base).href);
    assert.equal(response?.status(), 200, pathname);
    await page.locator("main h1").waitFor();
    const data = await page.evaluate(() => {
      const meta = (selector: string) =>
        document.querySelector(selector)?.getAttribute("content") ?? "";
      return {
        title: document.title,
        description: meta('meta[name="description"]'),
        robots: meta('meta[name="robots"]'),
        canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null,
        ogTitle: meta('meta[property="og:title"]'),
        twitterTitle: meta('meta[name="twitter:title"]'),
        headings: [...document.querySelectorAll("main h1, main h2, main h3, main h4, main h5, main h6")]
          .map((node) => ({ level: Number(node.tagName[1]), text: node.textContent?.trim() ?? "" })),
        missingAlt: [...document.images].filter((image) => !image.hasAttribute("alt")).map((image) => image.src),
        imageCount: document.images.length,
        structuredData: [...document.querySelectorAll('script[type="application/ld+json"]')]
          .map((node) => node.textContent ?? ""),
      };
    });
    assert.equal(data.headings.filter((heading) => heading.level === 1).length, 1, `${pathname}: one H1`);
    let previous = 0;
    for (const heading of data.headings) {
      assert.ok(heading.text, `${pathname}: empty heading`);
      assert.ok(!previous || heading.level <= previous + 1, `${pathname}: skipped heading level`);
      previous = heading.level;
    }
    assert.deepEqual(data.missingAlt, [], `${pathname}: missing image alt attribute`);
    assert.ok(data.description.length >= 40, `${pathname}: missing useful description`);
    for (const phrase of ["No watermark", "No signup", "No credit card required"])
      assert.equal(data.title.split(phrase).length - 1, 1, `${pathname}: title benefits`);
    assert.equal(data.ogTitle, data.title, `${pathname}: Open Graph title`);
    assert.equal(data.twitterTitle, data.title, `${pathname}: Twitter title`);
    for (const json of data.structuredData) assert.ok(JSON.parse(json), `${pathname}: invalid JSON-LD`);
    if (pathname === "/app") assert.match(data.robots, /noindex/);
    reports.push({ path: pathname, ...data });
  }
  assert.deepEqual(errors, []);
  assert.equal(new Set(reports.map((entry) => entry.title)).size, reports.length, "Unique titles");
  assert.equal(new Set(reports.map((entry) => entry.description)).size, reports.length, "Unique descriptions");

  const robotsResponse = await fetch(new URL("/robots.txt", base));
  const sitemapResponse = await fetch(new URL("/sitemap.xml", base));
  assert.equal(robotsResponse.status, 200);
  assert.equal(sitemapResponse.status, 200);
  const robots = await robotsResponse.text();
  const sitemap = await sitemapResponse.text();
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => {
    assert.ok(match[1], "Sitemap URL must not be empty");
    return new URL(match[1]);
  });
  const home = reports.find((entry) => entry.path === "/");
  assert.ok(home, "Home page must be audited");
  const indexable = !home.robots.includes("noindex");
  if (indexable) {
    assert.deepEqual(urls.map((url) => url.pathname).sort(), [...PUBLIC_PATHS].sort());
    assert.match(robots, /^Allow: \/$/m);
    assert.doesNotMatch(robots, /^Disallow: \/(?:app|offline\.html)?$/m);
    const origin = new URL(home.canonical ?? "").origin;
    assert.ok(robots.includes(`Sitemap: ${origin}/sitemap.xml`));
    for (const report of reports.filter((entry) => entry.path !== "/app")) {
      assert.equal(report.canonical, new URL(report.path, origin).href);
      assert.doesNotMatch(report.robots, /noindex/);
    }
    assert.ok(urls.every((url) => url.origin === origin));
  } else {
    assert.equal(urls.length, 0, "Preview sitemap must not publish localhost URLs");
    assert.match(robots, /^Disallow: \/$/m);
  }
  await writeFile(reportPath, JSON.stringify({
    checkedAt: new Date().toISOString(), base: base.href,
    mode: indexable ? "public" : "preview", robots, sitemapUrls: urls, pages: reports,
    scope: "Automated checks, not a Lighthouse score or guarantee of indexing/ranking. Alt-text meaning still needs editorial review.",
  }, null, 2));
  console.log(`PASS: ${reports.length} pages: headings, alt attributes, unique metadata, social titles, JSON-LD and crawl policy.`);
  console.log(`Mode: ${indexable ? "public indexing enabled" : "preview intentionally not indexed"}. Both crawl-policy branches passed.`);
  console.log(`Report: ${reportPath}`);
} finally {
  await browser.close();
}
