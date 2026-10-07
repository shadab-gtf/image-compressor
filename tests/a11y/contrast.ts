/**
 * WCAG 1.4.3 (Contrast, Minimum) — AA.
 *
 * Written from scratch rather than borrowed, because the interesting failures in
 * this product are muted text on *tinted* surfaces and text on the accent, and
 * both need a backdrop that is resolved properly:
 *
 *  - ancestors are walked until an opaque background is found, compositing every
 *    translucent layer on the way (`bg-danger-soft/40`, `bg-bg/95`, ...);
 *  - `background-image` gradients — the signature `--sf-wash` card surface — are
 *    expanded into their colour stops and the *worst* stop is the one judged;
 *  - inherited `opacity` is folded into the text colour's alpha.
 *
 * Colour strings are normalised through a 1x1 canvas, so whatever Chrome decides
 * to serialise (`rgb()`, `color(srgb ...)`, `oklch()`, `color-mix()`) parses.
 *
 * Both themes are forced with `?__theme=`, which the app's pre-paint script
 * honours, so the run never depends on the CI machine's OS setting.
 */
import type { CDP, Report } from "../lib/cdp.ts";
import { DESKTOP, goto, PAGES, routeStatus, seedQueue, setViewport, type Theme } from "./harness.ts";

export type ContrastFailure = {
  selector: string;
  text: string;
  fg: string;
  bg: string;
  ratio: number;
  required: number;
  fontSize: number;
  fontWeight: number;
};

export type ContrastResult = {
  checked: number;
  skipped: number;
  failures: ContrastFailure[];
};

const CONTRAST_SCRIPT = String.raw`(() => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d');

  /* ---- colour parsing ------------------------------------------------- */
  function parseSimple(str) {
    if (!str) return null;
    const s = String(str).trim().toLowerCase();
    if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
    let m = /^rgba?\(([^)]+)\)$/.exec(s);
    if (m) {
      const p = m[1].split(/[,\s\/]+/).filter(Boolean).map(Number);
      if (p.length >= 3 && p.slice(0, 3).every((n) => !Number.isNaN(n))) {
        return { r: p[0], g: p[1], b: p[2], a: p.length > 3 && !Number.isNaN(p[3]) ? p[3] : 1 };
      }
    }
    m = /^#([0-9a-f]{3,8})$/.exec(s);
    if (m) {
      const h = m[1];
      const ex = (i, n) => parseInt(n === 1 ? h[i] + h[i] : h.slice(i * 2, i * 2 + 2), 16);
      if (h.length === 3 || h.length === 4) {
        return { r: ex(0, 1), g: ex(1, 1), b: ex(2, 1), a: h.length === 4 ? ex(3, 1) / 255 : 1 };
      }
      if (h.length === 6 || h.length === 8) {
        return { r: ex(0, 2), g: ex(1, 2), b: ex(2, 2), a: h.length === 8 ? ex(3, 2) / 255 : 1 };
      }
    }
    m = /^color\(srgb\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)(?:\s*\/\s*([\d.eE+-]+))?\)$/.exec(s);
    if (m) {
      return {
        r: Number(m[1]) * 255,
        g: Number(m[2]) * 255,
        b: Number(m[3]) * 255,
        a: m[4] === undefined ? 1 : Number(m[4]),
      };
    }
    return null;
  }

  const cache = new Map();
  function parse(str) {
    if (!str) return null;
    if (cache.has(str)) return cache.get(str);
    let value = parseSimple(str);
    if (!value) {
      // Let the browser normalise anything exotic (oklch, lab, color-mix, ...).
      try {
        ctx.fillStyle = '#000000';
        ctx.fillStyle = str;
        const normalised = ctx.fillStyle;
        if (normalised && normalised !== '#000000') value = parseSimple(normalised);
        else if (/^(#000000|black|rgb\(0,\s*0,\s*0\))$/i.test(String(str).trim())) {
          value = { r: 0, g: 0, b: 0, a: 1 };
        }
      } catch (e) { value = null; }
    }
    cache.set(str, value);
    return value;
  }

  /** Every colour literal inside a gradient / layered background-image. */
  function stopsOf(backgroundImage) {
    const out = [];
    const re = /(rgba?\([^)]*\))|(color\([^)]*\))|(oklch\([^)]*\))|(oklab\([^)]*\))|(#[0-9a-fA-F]{3,8})\b/g;
    let m;
    while ((m = re.exec(backgroundImage)) !== null) {
      const c = parse(m[0]);
      if (c) out.push(c);
    }
    if (/\btransparent\b/.test(backgroundImage)) out.push({ r: 0, g: 0, b: 0, a: 0 });
    return out;
  }

  function over(fg, bg) {
    const a = fg.a + bg.a * (1 - fg.a);
    if (a <= 0) return { r: 255, g: 255, b: 255, a: 0 };
    return {
      r: (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a,
      g: (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a,
      b: (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a,
      a,
    };
  }

  function channel(v) {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function luminance(c) {
    return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
  }
  function ratio(a, b) {
    const la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  function hex(c) {
    const f = (n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
    return '#' + f(c.r) + f(c.g) + f(c.b) + (c.a < 0.999 ? ' @' + c.a.toFixed(2) : '');
  }

  /* ---- effective background ------------------------------------------- */
  function backdrops(el) {
    const layers = [];
    let node = el;
    let guard = 0;
    while (node && guard++ < 40) {
      const cs = getComputedStyle(node);
      const bi = cs.backgroundImage;
      if (bi && bi !== 'none') {
        const stops = stopsOf(bi);
        if (stops.length) layers.push(stops);
      }
      const bc = parse(cs.backgroundColor);
      if (bc && bc.a > 0) layers.push([bc]);
      if (bc && bc.a >= 0.999) break;
      node = node.parentElement;
    }
    let results = [{ r: 255, g: 255, b: 255, a: 1 }];
    for (let i = layers.length - 1; i >= 0; i--) {
      const next = [];
      for (const base of results) for (const c of layers[i]) next.push(over(c, base));
      results = next.length > 16 ? next.slice(0, 16) : next;
    }
    return results;
  }

  function inheritedOpacity(el) {
    let value = 1, node = el, guard = 0;
    while (node && node !== document.documentElement && guard++ < 40) {
      const o = parseFloat(getComputedStyle(node).opacity);
      if (!Number.isNaN(o)) value *= o;
      node = node.parentElement;
    }
    return value;
  }

  function describe(el) {
    const parts = [];
    let node = el, depth = 0;
    while (node && node.nodeType === 1 && depth < 4) {
      let s = node.tagName.toLowerCase();
      if (node.id) { parts.unshift(s + '#' + node.id); break; }
      const cls = (node.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 3);
      if (cls.length) s += '.' + cls.join('.');
      parts.unshift(s);
      node = node.parentElement; depth++;
    }
    return parts.join(' > ');
  }

  /* ---- walk every text node ------------------------------------------- */
  const owners = new Map();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const value = (node.nodeValue || '').replace(/\s+/g, ' ').trim();
    if (!value) continue;
    const el = node.parentElement;
    if (!el) continue;
    if (el.closest('script, style, noscript, template')) continue;
    if (!owners.has(el)) owners.set(el, value);
  }

  const failures = [];
  let checked = 0, skipped = 0;

  for (const [el, sample] of owners) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') { skipped++; continue; }
    const rect = el.getBoundingClientRect();
    // sr-only text is clipped to a 1px box; genuinely off-canvas content
    // (the skip link's -translate-y-24 parking spot) has a negative rect.
    if (rect.width <= 2 || rect.height <= 2) { skipped++; continue; }
    if (rect.bottom < 0 || rect.right < 0) { skipped++; continue; }

    const opacity = inheritedOpacity(el);
    if (opacity < 0.02) { skipped++; continue; }

    const colour = parse(cs.color);
    if (!colour) { skipped++; continue; }
    if (colour.a * opacity < 0.05) { skipped++; continue; }

    const size = parseFloat(cs.fontSize) || 16;
    const weight = Number(cs.fontWeight) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const required = large ? 3 : 4.5;

    let worst = null;
    for (const back of backdrops(el)) {
      const fg = over({ ...colour, a: colour.a * opacity }, back);
      const r = ratio(fg, back);
      if (!worst || r < worst.ratio) worst = { ratio: r, fg, bg: back };
    }
    if (!worst) { skipped++; continue; }
    checked++;

    if (worst.ratio + 1e-6 < required) {
      failures.push({
        selector: describe(el),
        text: sample.slice(0, 48),
        fg: hex(worst.fg),
        bg: hex(worst.bg),
        ratio: Math.round(worst.ratio * 100) / 100,
        required,
        fontSize: Math.round(size * 10) / 10,
        fontWeight: weight,
      });
    }
  }

  failures.sort((a, b) => a.ratio - b.ratio);
  return { checked, skipped, failures: failures.slice(0, 200) };
})()`;

/** Collapses per-element failures into per-colour-pair findings. */
function group(failures: ContrastFailure[]): string[] {
  const buckets = new Map<string, { count: number; worst: ContrastFailure; examples: string[] }>();
  for (const failure of failures) {
    const key = `${failure.fg}|${failure.bg}|${failure.required}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.count++;
      if (failure.ratio < bucket.worst.ratio) bucket.worst = failure;
      if (bucket.examples.length < 3 && !bucket.examples.includes(failure.selector)) {
        bucket.examples.push(failure.selector);
      }
    } else {
      buckets.set(key, { count: 1, worst: failure, examples: [failure.selector] });
    }
  }
  return [...buckets.values()]
    .sort((a, b) => a.worst.ratio - b.worst.ratio)
    .map(
      ({ count, worst, examples }) =>
        `${worst.ratio}:1 (needs ${worst.required}:1) fg ${worst.fg} on bg ${worst.bg} — ` +
        `${worst.fontSize}px/${worst.fontWeight}, ${count} node${count === 1 ? "" : "s"}, ` +
        `e.g. ${examples[0]} "${worst.text}"`,
    );
}

async function auditContrast(
  cdp: CDP,
  report: Report,
  label: string,
  theme: Theme,
): Promise<void> {
  const result = await cdp.evaluate<ContrastResult>(CONTRAST_SCRIPT);
  const findings = group(result.failures);

  report.check(
    `[contrast] ${label} (${theme}): all text meets AA (WCAG 1.4.3)`,
    result.failures.length === 0,
    result.failures.length === 0
      ? `${result.checked} text nodes checked, ${result.skipped} not rendered`
      : `${result.failures.length} failing text nodes of ${result.checked} checked`,
  );

  if (findings.length) {
    console.log(`        contrast failures — ${label} (${theme}):`);
    for (const finding of findings.slice(0, 14)) console.log(`          - ${finding}`);
    if (findings.length > 14) console.log(`          ... and ${findings.length - 14} more colour pairs`);
  }
}

/* -------------------------------------------------------------------------- */

export async function runContrast(cdp: CDP, report: Report): Promise<void> {
  await setViewport(cdp, DESKTOP.width, DESKTOP.height);
  const themes: Theme[] = ["light", "dark"];

  for (const page of PAGES) {
    const status = await routeStatus(page.path);
    if (status === 404 || status === 0) {
      report.skip(`[contrast] ${page.name}`, `${page.path} returned ${status || "no response"}`);
      continue;
    }
    for (const theme of themes) {
      await goto(cdp, page.path, { theme, wait: page.wait });
      const applied = await cdp.evaluate<string>(
        `document.documentElement.getAttribute('data-theme') || ''`,
      );
      if (applied !== theme) {
        report.skip(
          `[contrast] ${page.name} (${theme})`,
          `?__theme=${theme} did not take effect (data-theme="${applied}")`,
        );
        continue;
      }
      await auditContrast(cdp, report, page.name, theme);
    }
  }

  /* ---- The workspace with a real queue, where most of the UI lives ----- */
  for (const theme of themes) {
    await goto(cdp, "/app", { theme, wait: "main#main" });
    let rows = 0;
    try {
      rows = await seedQueue(cdp, 3);
    } catch (error) {
      report.skip(
        `[contrast] workspace+files (${theme})`,
        `could not queue test images (${(error as Error).message})`,
      );
      continue;
    }
    if (rows === 0) {
      report.skip(`[contrast] workspace+files (${theme})`, "no test images available");
      continue;
    }
    await auditContrast(cdp, report, "workspace+files", theme);
  }
}
