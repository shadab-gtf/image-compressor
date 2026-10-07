/**
 * Screenshot harness.
 *
 * Drives installed Chrome in headless mode against the dev server, so visual
 * checks need no Playwright install and no extra dependency in package.json.
 *
 *   npm run shot -- /                      # default desktop, both themes
 *   npm run shot -- /app --w 390 --h 844   # one viewport
 *   npm run shot -- / --theme dark
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((p) => existsSync(p));
if (!CHROME) throw new Error("No Chrome or Edge found");

const argv = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : (argv[i + 1] ?? fallback);
};
const route = argv.find((a) => a.startsWith("/")) ?? "/";
const width = Number(flag("w", "1440"));
const height = Number(flag("h", "1000"));
const themes = flag("theme", "light,dark").split(",");
const base = flag("base", "http://localhost:3000");
const outDir = flag("out", join(process.env.TEMP ?? "/tmp", "shrinkfox-shots"));

mkdirSync(outDir, { recursive: true });

const slug = route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home";

for (const theme of themes) {
  const out = join(outDir, `${slug}-${width}-${theme}.png`);
  // Seed the theme preference before the app's inline script reads it, so the
  // screenshot is deterministic instead of following the host OS setting.
  const profile = join(outDir, `profile-${theme}-${width}`);
  const seed = join(outDir, `seed-${theme}.html`);
  writeFileSync(
    seed,
    `<!doctype html><script>
      localStorage.setItem("shrinkfox.theme", ${JSON.stringify(theme)});
      location.replace(${JSON.stringify(base + route)});
    </script>`,
  );

  execFileSync(
    CHROME,
    [
      "--headless",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=2",
      `--user-data-dir=${profile}`,
      "--virtual-time-budget=6000",
      `--screenshot=${out}`,
      `--window-size=${width},${height}`,
      // Seeding runs on the same origin only via the dev server, so navigate
      // through the app itself and set the key with a query the page reads.
      `${base}${route}${route.includes("?") ? "&" : "?"}__theme=${theme}`,
    ],
    { stdio: "pipe" },
  );
  rmSync(seed, { force: true });
  console.log(out);
}
