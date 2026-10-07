/**
 * Shared machinery for the accessibility suite.
 *
 * Everything here drives a real browser over CDP — no axe, no Playwright. The
 * checks are written out longhand so that a failure points at a line of this
 * repository rather than at a rule id inside a third-party bundle.
 *
 * Two primitives do most of the work:
 *
 *  - `tagDom()` stamps every element with `data-sfa11y`, which lets a CDP
 *    protocol response (which carries backend node ids, not selectors) be
 *    joined back to something a developer can paste into devtools.
 *  - `axNodes()` reads `Accessibility.getFullAXTree`, which is the browser's own
 *    computed accessibility tree — the accessible *name* it reports is the one
 *    a screen reader would speak, not a guess assembled from attributes.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { BASE, type CDP, sleep, TEST_IMAGES, waitFor } from "../lib/cdp.ts";

/* -------------------------------------------------------------------------- */
/* Pages under test                                                            */
/* -------------------------------------------------------------------------- */

export type PageDef = {
  /** Route, without a query string. */
  path: string;
  /** Short label used in check names. */
  name: string;
  /** Rendered before the page counts as ready. */
  wait: string;
};

export const PAGES: PageDef[] = [
  { path: "/", name: "home", wait: "main#main h1" },
  { path: "/app", name: "workspace", wait: "main#main" },
  { path: "/privacy", name: "privacy", wait: "main#main h1" },
  { path: "/compress-image", name: "compress-image", wait: "main#main h1" },
  { path: "/png-to-webp", name: "png-to-webp", wait: "main#main h1" },
];

/** Routes an agent may still be building; a 404 is a skip, not a failure. */
export async function routeStatus(path: string): Promise<number> {
  try {
    const response = await fetch(`${BASE}${path}`, { redirect: "manual" });
    return response.status;
  } catch {
    return 0;
  }
}

/* -------------------------------------------------------------------------- */
/* Navigation                                                                  */
/* -------------------------------------------------------------------------- */

export type Theme = "light" | "dark";

/**
 * Navigates and waits for hydration to settle.
 *
 * `open()` from the shared client only waits for a selector, which in a React
 * app can match the server-rendered markup before any event handler is
 * attached. Keyboard assertions need the handlers, so this additionally waits
 * for the load event and a frame of quiet.
 */
export async function goto(
  cdp: CDP,
  path: string,
  options: { theme?: Theme; wait?: string } = {},
): Promise<void> {
  const url = options.theme ? `${BASE}${path}?__theme=${options.theme}` : `${BASE}${path}`;
  await cdp.send("Page.navigate", { url });
  await waitFor(`${path} to render`, 45_000, async () =>
    cdp.evaluate<boolean>(
      `document.readyState !== 'loading' && !!document.querySelector(${JSON.stringify(
        options.wait ?? "body",
      )})`,
    ),
  );
  // React hydration + motion's first layout pass.
  await sleep(900);
}

/** Puts the real test images into the workspace queue. */
export async function seedQueue(cdp: CDP, limit = 3): Promise<number> {
  const names = readdirSync(TEST_IMAGES)
    .filter((n) => /\.(png|jpe?g|webp)$/i.test(n) && !/not-really|empty/.test(n))
    .slice(0, limit);
  if (names.length === 0) return 0;
  await cdp.setFiles(
    "input[type=file]:not([webkitdirectory])",
    names.map((n) => join(TEST_IMAGES, n)),
  );
  await waitFor("queue rows", 25_000, async () => {
    const rows = await cdp.evaluate<number>(`document.querySelectorAll('main ul li').length`);
    return rows > 0 ? rows : null;
  });
  return cdp.evaluate<number>(`document.querySelectorAll('main ul li').length`);
}

/* -------------------------------------------------------------------------- */
/* Real key events                                                             */
/* -------------------------------------------------------------------------- */

export const MOD_SHIFT = 8;

type KeySpec = { key: string; code: string; keyCode: number; text?: string };

export const KEY = {
  Tab: { key: "Tab", code: "Tab", keyCode: 9 },
  Enter: { key: "Enter", code: "Enter", keyCode: 13, text: "\r" },
  Space: { key: " ", code: "Space", keyCode: 32, text: " " },
  Escape: { key: "Escape", code: "Escape", keyCode: 27 },
  ArrowRight: { key: "ArrowRight", code: "ArrowRight", keyCode: 39 },
  ArrowDown: { key: "ArrowDown", code: "ArrowDown", keyCode: 40 },
} satisfies Record<string, KeySpec>;

/**
 * Dispatches a genuine key event through the input pipeline.
 *
 * This matters: calling `element.focus()` from script would walk the same
 * elements but could never surface a focus trap, because script focus ignores
 * whatever the page does to the Tab key.
 */
export async function pressKey(cdp: CDP, spec: KeySpec, modifiers = 0): Promise<void> {
  const base = {
    modifiers,
    key: spec.key,
    code: spec.code,
    windowsVirtualKeyCode: spec.keyCode,
    nativeVirtualKeyCode: spec.keyCode,
  };
  await cdp.send("Input.dispatchKeyEvent", {
    ...base,
    type: spec.text ? "keyDown" : "rawKeyDown",
    ...(spec.text ? { text: spec.text, unmodifiedText: spec.text } : {}),
  });
  await cdp.send("Input.dispatchKeyEvent", { ...base, type: "keyUp" });
  await sleep(45);
}

/** Headless Chrome treats the page as unfocused unless this is on. */
export async function enableInput(cdp: CDP): Promise<void> {
  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await cdp.send("Page.bringToFront").catch(() => undefined);
}

/* -------------------------------------------------------------------------- */
/* DOM tagging + accessibility tree                                            */
/* -------------------------------------------------------------------------- */

export type TaggedElement = {
  tag: string;
  selector: string;
  text: string;
};

/** Stamps `data-sfa11y` on every element and returns id -> description. */
export async function tagDom(cdp: CDP): Promise<Record<string, TaggedElement>> {
  return cdp.evaluate<Record<string, TaggedElement>>(`(() => {
    const describe = (el) => {
      const parts = [];
      let node = el, depth = 0;
      while (node && node.nodeType === 1 && depth < 4) {
        let s = node.tagName.toLowerCase();
        if (node.id) { parts.unshift(s + '#' + node.id); break; }
        const cls = (node.getAttribute('class') || '').trim().split(/\\s+/).filter(Boolean).slice(0, 3);
        if (cls.length) s += '.' + cls.join('.');
        const parent = node.parentElement;
        if (parent) {
          const sibs = Array.prototype.filter.call(parent.children, (c) => c.tagName === node.tagName);
          if (sibs.length > 1) s += ':nth-of-type(' + (sibs.indexOf(node) + 1) + ')';
        }
        parts.unshift(s);
        node = parent; depth++;
      }
      return parts.join(' > ');
    };
    const map = {};
    let n = 0;
    for (const el of document.querySelectorAll('*')) {
      const id = 'sfa' + (n++);
      el.setAttribute('data-sfa11y', id);
      map[id] = {
        tag: el.tagName.toLowerCase(),
        selector: describe(el),
        text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 60),
      };
    }
    return map;
  })()`);
}

export type AXNode = {
  nodeId: string;
  ignored: boolean;
  role?: { value?: string };
  name?: { value?: string };
  description?: { value?: string };
  properties?: Array<{ name: string; value: { value?: unknown } }>;
  backendDOMNodeId?: number;
};

/** The browser's own accessibility tree, joined to the `data-sfa11y` tags. */
export async function axNodes(
  cdp: CDP,
): Promise<Array<AXNode & { sfa11y: string | null; tagName: string }>> {
  await cdp.send("Accessibility.enable").catch(() => undefined);
  const [{ nodes }, doc] = await Promise.all([
    cdp.send<{ nodes: AXNode[] }>("Accessibility.getFullAXTree"),
    cdp.send<{ root: DomNode }>("DOM.getDocument", { depth: -1, pierce: true }),
  ]);

  const byBackend = new Map<number, { sfa11y: string | null; tagName: string }>();
  const walk = (node: DomNode) => {
    if (node.nodeType === 1) {
      const attrs = node.attributes ?? [];
      let id: string | null = null;
      for (let i = 0; i < attrs.length; i += 2) {
        if (attrs[i] === "data-sfa11y") id = attrs[i + 1] ?? null;
      }
      byBackend.set(node.backendNodeId, {
        sfa11y: id,
        tagName: (node.nodeName ?? "").toLowerCase(),
      });
    }
    for (const child of node.children ?? []) walk(child);
    for (const root of node.shadowRoots ?? []) walk(root);
    if (node.contentDocument) walk(node.contentDocument);
  };
  walk(doc.root);

  return nodes.map((node) => {
    const joined = node.backendDOMNodeId ? byBackend.get(node.backendDOMNodeId) : undefined;
    return { ...node, sfa11y: joined?.sfa11y ?? null, tagName: joined?.tagName ?? "" };
  });
}

type DomNode = {
  nodeType: number;
  nodeName?: string;
  backendNodeId: number;
  attributes?: string[];
  children?: DomNode[];
  shadowRoots?: DomNode[];
  contentDocument?: DomNode;
};

export function axProperty(node: AXNode, name: string): unknown {
  return node.properties?.find((p) => p.name === name)?.value?.value;
}

export function axRole(node: AXNode): string {
  return String(node.role?.value ?? "");
}

export function axName(node: AXNode): string {
  return String(node.name?.value ?? "").trim();
}

/** `selector — "text"` for a tagged element, or the raw id if untagged. */
export function describe(
  tags: Record<string, TaggedElement>,
  id: string | null | undefined,
): string {
  if (!id) return "<untagged element>";
  const entry = tags[id];
  if (!entry) return `<stale ${id}>`;
  return entry.text ? `${entry.selector} — "${entry.text}"` : entry.selector;
}

/* -------------------------------------------------------------------------- */
/* Emulation                                                                   */
/* -------------------------------------------------------------------------- */

export async function setViewport(
  cdp: CDP,
  width: number,
  height: number,
  mobile = false,
): Promise<void> {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
    screenWidth: width,
    screenHeight: height,
  });
}

export async function clearViewport(cdp: CDP): Promise<void> {
  await cdp.send("Emulation.clearDeviceMetricsOverride").catch(() => undefined);
}

export async function setReducedMotion(cdp: CDP, reduce: boolean): Promise<void> {
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: reduce ? "reduce" : "no-preference" }],
  });
}

/** Desktop viewport the rest of the suite assumes. */
export const DESKTOP = { width: 1280, height: 900 };
/** Narrow enough that `useMediaQuery("(min-width: 1024px)")` reports mobile. */
export const MOBILE = { width: 390, height: 844 };
