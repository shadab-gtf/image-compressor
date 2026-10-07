/**
 * Layout assertions.
 *
 * Pixel diffs only tell you that something changed; they cannot tell you that
 * the current look is *wrong*. These checks run in the page and catch the class
 * of defect a baseline would happily enshrine: a page the user has to scroll
 * sideways, a label cut off with no ellipsis, a tap target too small to hit,
 * a brand mark squashed out of square.
 */
import type { CDP } from "../lib/cdp.ts";

export type LayoutFinding = {
  el: string;
  detail: string;
};

export type LayoutProbe = {
  innerWidth: number;
  docScrollWidth: number;
  docClientWidth: number;
  bodyScrollWidth: number;
  markCount: number;
  overflowCount: number;
  overflowing: LayoutFinding[];
  clippedCount: number;
  clipped: LayoutFinding[];
  smallTargetCount: number;
  smallTargets: LayoutFinding[];
  markCount_bad: number;
  marks: LayoutFinding[];
};

/**
 * Elements a user can actually hit. Kept as one selector list so the
 * "outermost only" rule below can use `closest()` with the same definition —
 * an icon inside a 44px button is not its own tap target.
 */
const INTERACTIVE = [
  "a[href]",
  "button",
  "input:not([type=hidden])",
  "select",
  "textarea",
  "summary",
  '[role="button"]',
  '[role="link"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="menuitem"]',
  "label[for]",
].join(", ");

const PROBE = (mobile: boolean) => `(() => {
  const INTERACTIVE = ${JSON.stringify(INTERACTIVE)};
  const MOBILE = ${mobile ? "true" : "false"};
  const vw = window.innerWidth;
  const docEl = document.documentElement;

  const label = (el) => {
    const cls =
      typeof el.className === "string" && el.className.trim()
        ? "." + el.className.trim().split(/\\s+/).filter(Boolean).slice(0, 3).join(".")
        : "";
    const id = el.id ? "#" + el.id : "";
    const text = (el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 36);
    const aria = el.getAttribute("aria-label");
    const name = text || aria || "";
    return el.tagName.toLowerCase() + id + cls + (name ? ' "' + name + '"' : "");
  };

  const shown = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return null;
    const r = el.getBoundingClientRect();
    if (r.width <= 1 && r.height <= 1) return null;
    return { cs, r };
  };

  // Screen-reader-only content is deliberately 1px and clipped; it is not a
  // layout bug and must not drown the real findings.
  const srOnly = (el, cs, r) =>
    cs.clipPath === "inset(50%)" ||
    cs.clip === "rect(0px, 0px, 0px, 0px)" ||
    (r.width <= 2 && r.height <= 2) ||
    (el.className && typeof el.className === "string" && /\\bsr-only\\b/.test(el.className));

  const overflowing = [];
  const clipped = [];
  const smallTargets = [];
  const marks = [];

  for (const el of Array.from(document.body.querySelectorAll("*"))) {
    const v = shown(el);
    if (!v) continue;
    const { cs, r } = v;
    if (srOnly(el, cs, r)) continue;

    if (r.right > vw + 1 && r.width > 1) {
      overflowing.push({
        el: label(el),
        detail: "right=" + Math.round(r.right) + "px (" + Math.round(r.right - vw) + "px past the viewport), width=" + Math.round(r.width) + "px",
      });
    }

    // Clipped text: hidden horizontal overflow with no ellipsis affordance and
    // real text content means the user silently loses characters.
    const hasText = Array.from(el.childNodes).some(
      (n) => n.nodeType === 3 && (n.textContent || "").trim().length > 0,
    );
    const ox = cs.overflowX;
    if (
      hasText &&
      (ox === "hidden" || ox === "clip") &&
      cs.textOverflow !== "ellipsis" &&
      el.scrollWidth > el.clientWidth + 2
    ) {
      clipped.push({
        el: label(el),
        detail: "scrollWidth=" + el.scrollWidth + " > clientWidth=" + el.clientWidth + " with overflow-x:" + ox,
      });
    }
  }

  if (MOBILE) {
    for (const el of Array.from(document.body.querySelectorAll(INTERACTIVE))) {
      const v = shown(el);
      if (!v) continue;
      const { cs, r } = v;
      if (srOnly(el, cs, r)) continue;
      if (el.closest("[inert]")) continue;
      if (el.disabled) continue;
      // Only the outermost control in a nest counts as the tap target.
      const outer = el.parentElement && el.parentElement.closest(INTERACTIVE);
      if (outer) continue;
      const side = Math.min(r.width, r.height);
      if (side < 24) {
        smallTargets.push({
          el: label(el),
          detail: Math.round(r.width * 10) / 10 + "x" + Math.round(r.height * 10) / 10 + "px (needs >= 24px)",
        });
      }
    }
  }

  // The fox is drawn in a square viewBox; any non-square box means it is
  // stretched. Icons use a 24x24 box, so the selector targets the mark alone.
  const markNodes = Array.from(document.querySelectorAll('svg[viewBox="0 0 256 256"]'));
  for (const svg of markNodes) {
    const v = shown(svg);
    if (!v) continue;
    const r = v.r;
    if (Math.abs(r.width - r.height) > 1) {
      marks.push({
        el: label(svg),
        detail: "rendered " + Math.round(r.width * 10) / 10 + "x" + Math.round(r.height * 10) / 10 + "px (square viewBox)",
      });
    }
  }

  return {
    innerWidth: vw,
    docScrollWidth: docEl.scrollWidth,
    docClientWidth: docEl.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    markCount: markNodes.length,
    overflowCount: overflowing.length,
    overflowing: overflowing.slice(0, 6),
    clippedCount: clipped.length,
    clipped: clipped.slice(0, 6),
    smallTargetCount: smallTargets.length,
    smallTargets: smallTargets.slice(0, 8),
    markCount_bad: marks.length,
    marks: marks.slice(0, 6),
  };
})()`;

export async function probeLayout(cdp: CDP, mobile: boolean): Promise<LayoutProbe> {
  return cdp.evaluate<LayoutProbe>(PROBE(mobile));
}

export function summarise(findings: LayoutFinding[], total: number): string {
  if (total === 0) return "none";
  const shown = findings.map((f) => `${f.el} — ${f.detail}`).join(" | ");
  return total > findings.length ? `${shown} (+${total - findings.length} more)` : shown;
}
