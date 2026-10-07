/**
 * Generates every static brand asset from the shared geometry.
 * Run with: npm run brand
 *
 * SVGs are written directly. The PNGs that the web app manifest needs are
 * rasterised by driving headless Chrome over a generated HTML page, which keeps
 * the toolchain free of native image dependencies.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { markSvg } from "./brand-svg.ts";
import { BRAND, VIEW_BOX } from "../src/components/brand/geometry.ts";

const root = resolve(import.meta.dirname, "..");
const brandDir = join(root, "public", "brand");
const iconDir = join(root, "public", "icons");
mkdirSync(brandDir, { recursive: true });
mkdirSync(iconDir, { recursive: true });

const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((p) => existsSync(p));

/** Wordmark: the mark locked up with the name at a fixed optical ratio. */
function wordmarkSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 880 200" fill="none" role="img" aria-label="ShrinkFox">
  <g transform="translate(0 -12) scale(.84)">${markSvg("color", { id: "wm" })
    .replace(/^<svg[^>]*>/, "")
    .replace(/<\/svg>$/, "")}</g>
  <text x="248" y="134" font-family="Geist,Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
        font-size="124" font-weight="600" letter-spacing="-5" fill="${BRAND.ink}">Shrink<tspan fill="${BRAND.accent}">Fox</tspan></text>
</svg>`;
}

const files: Array<[string, string]> = [
  [join(brandDir, "shrinkfox-mark.svg"), markSvg("color", { id: "mark" })],
  [join(brandDir, "shrinkfox-mark-mono.svg"), markSvg("mono", { id: "mono" })],
  [join(brandDir, "shrinkfox-icon.svg"), markSvg("icon", { id: "icon" })],
  [join(brandDir, "shrinkfox-favicon.svg"), markSvg("color", { id: "fav" })],
  [join(brandDir, "shrinkfox-wordmark.svg"), wordmarkSvg()],
];
for (const [path, content] of files) {
  writeFileSync(path, content.trim() + "\n");
  console.log("svg  ", path.replace(root, "."));
}

/** Rasterise one SVG string to a PNG of the given square size. */
function png(svg: string, size: number, out: string, transparent: boolean) {
  if (!CHROME) {
    console.warn("skip png (no Chrome/Edge found):", out);
    return;
  }
  const work = join(tmpdir(), `sf-icon-${size}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(work, { recursive: true });
  const html = join(work, "i.html");
  writeFileSync(
    html,
    `<!doctype html><meta charset="utf-8"><style>
      html,body{margin:0;padding:0;width:${size}px;height:${size}px;overflow:hidden;
        background:${transparent ? "transparent" : BRAND.accent}}
      svg{display:block;width:${size}px;height:${size}px}
    </style>${svg}`,
  );
  execFileSync(
    CHROME,
    [
      "--headless",
      "--disable-gpu",
      "--hide-scrollbars",
      transparent ? "--default-background-color=00000000" : "--default-background-color=FFFFFFFF",
      `--screenshot=${out}`,
      `--window-size=${size},${size}`,
      pathToFileURL(html).href,
    ],
    { stdio: "pipe" },
  );
  rmSync(work, { recursive: true, force: true });
  console.log("png  ", out.replace(root, "."));
}

const plate = markSvg("icon", { id: "plate" });
png(plate, 192, join(iconDir, "icon-192.png"), false);
png(plate, 512, join(iconDir, "icon-512.png"), false);
png(plate, 512, join(iconDir, "icon-maskable-512.png"), false);
png(plate, 180, join(iconDir, "apple-icon-180.png"), false);
png(markSvg("color", { id: "t" }), 512, join(iconDir, "mark-512.png"), true);

console.log(`\nviewBox ${VIEW_BOX} — brand assets rebuilt.`);
