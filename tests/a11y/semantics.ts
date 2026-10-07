/**
 * Semantics and ARIA: WCAG 1.1.1, 1.3.1, 2.4.4, 2.4.6, 3.1.1, 4.1.2.
 *
 * Names come from `Accessibility.getFullAXTree`, i.e. from the browser's own
 * name-computation, which already applies the whole accname algorithm
 * (aria-labelledby, aria-label, content, title, ...). Reading attributes by hand
 * would both miss names and invent them.
 *
 * Attribute-level facts that the AX tree flattens (aria-valuemin on a
 * progressbar, for instance) are read from the DOM as well, because a fix has to
 * be made against the attribute, not against the computed tree.
 */
import type { CDP, Report } from "../lib/cdp.ts";
import {
  axName,
  axNodes,
  axProperty,
  axRole,
  DESKTOP,
  describe,
  goto,
  PAGES,
  routeStatus,
  seedQueue,
  setViewport,
  type TaggedElement,
  tagDom,
} from "./harness.ts";

type DomControl = {
  id: string | null;
  tag: string;
  type: string;
  role: string;
  ariaHidden: boolean;
  visible: boolean;
  disabled: boolean;
};

type SvgInfo = {
  id: string | null;
  hidden: boolean;
  role: string;
  hasName: boolean;
  visible: boolean;
  inLink: boolean;
};

type ImgInfo = { id: string | null; hasAlt: boolean; alt: string; src: string };

type Heading = { level: number; text: string; id: string | null; visible: boolean };

type ProgressInfo = {
  id: string | null;
  now: string | null;
  min: string | null;
  max: string | null;
  label: string | null;
  labelledby: string | null;
};

type RadioGroupInfo = {
  id: string | null;
  label: string | null;
  labelledby: string | null;
  radios: Array<{ id: string | null; checked: string | null; name: string }>;
};

type SwitchInfo = { id: string | null; checked: string | null; name: string };

type PageFacts = {
  lang: string;
  controls: DomControl[];
  svgs: SvgInfo[];
  imgs: ImgInfo[];
  headings: Heading[];
  progress: ProgressInfo[];
  groups: RadioGroupInfo[];
  switches: SwitchInfo[];
  landmarks: { main: number; nav: number; header: number; footer: number };
};

const FACTS_SCRIPT = `(() => {
  const id = (el) => el.getAttribute('data-sfa11y');
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  const nameOf = (el) =>
    (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '')
      .replace(/\\s+/g, ' ').trim().slice(0, 50);

  const controlSel = 'button, a[href], input:not([type=hidden]), select, textarea, summary, ' +
    '[role=button], [role=radio], [role=switch], [role=checkbox], [role=link], [role=slider], [role=tab]';

  const controls = Array.prototype.map.call(document.querySelectorAll(controlSel), (el) => ({
    id: id(el),
    tag: el.tagName.toLowerCase(),
    type: (el.getAttribute('type') || '').toLowerCase(),
    role: el.getAttribute('role') || '',
    ariaHidden: !!el.closest('[aria-hidden="true"]'),
    visible: visible(el),
    disabled: !!el.disabled,
  }));

  const svgs = Array.prototype.map.call(document.querySelectorAll('svg'), (el) => ({
    id: id(el),
    hidden: el.getAttribute('aria-hidden') === 'true' || !!el.closest('[aria-hidden="true"]'),
    role: el.getAttribute('role') || '',
    hasName: !!(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.querySelector('title')),
    visible: visible(el),
    inLink: !!el.closest('a, button'),
  }));

  const imgs = Array.prototype.map.call(document.querySelectorAll('img'), (el) => ({
    id: id(el),
    hasAlt: el.hasAttribute('alt'),
    alt: el.getAttribute('alt') || '',
    src: (el.getAttribute('src') || '').slice(0, 60),
  }));

  const headings = Array.prototype.map.call(
    document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role=heading]'),
    (el) => ({
      level: Number(el.getAttribute('aria-level') || el.tagName.slice(1)) || 2,
      text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 50),
      id: id(el),
      visible: visible(el),
    }),
  );

  const progress = Array.prototype.map.call(document.querySelectorAll('[role=progressbar]'), (el) => ({
    id: id(el),
    now: el.getAttribute('aria-valuenow'),
    min: el.getAttribute('aria-valuemin'),
    max: el.getAttribute('aria-valuemax'),
    label: el.getAttribute('aria-label'),
    labelledby: el.getAttribute('aria-labelledby'),
  }));

  const groups = Array.prototype.map.call(document.querySelectorAll('[role=radiogroup]'), (el) => ({
    id: id(el),
    label: el.getAttribute('aria-label'),
    labelledby: el.getAttribute('aria-labelledby'),
    radios: Array.prototype.map.call(el.querySelectorAll('[role=radio]'), (r) => ({
      id: id(r),
      checked: r.getAttribute('aria-checked'),
      name: nameOf(r),
    })),
  }));

  const switches = Array.prototype.map.call(document.querySelectorAll('[role=switch]'), (el) => ({
    id: id(el),
    checked: el.getAttribute('aria-checked'),
    name: nameOf(el),
  }));

  return {
    lang: document.documentElement.getAttribute('lang') || '',
    controls, svgs, imgs, headings, progress, groups, switches,
    landmarks: {
      main: document.querySelectorAll('main, [role=main]').length,
      nav: document.querySelectorAll('nav, [role=navigation]').length,
      header: document.querySelectorAll('body > div > header, header').length,
      footer: document.querySelectorAll('footer').length,
    },
  };
})()`;

/** Roles that must carry an accessible name to be usable. */
const NAMED_ROLES = new Set([
  "button",
  "link",
  "checkbox",
  "radio",
  "switch",
  "slider",
  "combobox",
  "listbox",
  "textbox",
  "searchbox",
  "spinbutton",
  "menuitem",
  "tab",
  "progressbar",
  "radiogroup",
  "dialog",
]);

async function auditPage(
  cdp: CDP,
  report: Report,
  label: string,
): Promise<void> {
  const tags: Record<string, TaggedElement> = await tagDom(cdp);
  const facts = await cdp.evaluate<PageFacts>(FACTS_SCRIPT);
  const ax = await axNodes(cdp);

  const axById = new Map<string, (typeof ax)[number]>();
  for (const node of ax) {
    if (!node.sfa11y) continue;
    const existing = axById.get(node.sfa11y);
    // Prefer a node that is actually exposed over an ignored shadow of it.
    if (!existing || (existing.ignored && !node.ignored)) axById.set(node.sfa11y, node);
  }

  /* ---- 4.1.2 accessible names --------------------------------------- */
  const unnamedButtons: string[] = [];
  const unnamedControls: string[] = [];
  const missingFromTree: string[] = [];

  for (const control of facts.controls) {
    if (!control.id || !control.visible || control.ariaHidden) continue;
    const node = axById.get(control.id);
    if (!node || node.ignored) {
      missingFromTree.push(describe(tags, control.id));
      continue;
    }
    const role = axRole(node).toLowerCase();
    const name = axName(node);
    if (name) continue;
    if (!NAMED_ROLES.has(role)) continue;
    if (role === "button") unnamedButtons.push(`${describe(tags, control.id)} [role=${role}]`);
    else unnamedControls.push(`${describe(tags, control.id)} [role=${role}]`);
  }

  report.check(
    `[aria] ${label}: every button has an accessible name (WCAG 4.1.2)`,
    unnamedButtons.length === 0,
    unnamedButtons.length
      ? `${unnamedButtons.length} unnamed: ${unnamedButtons.slice(0, 5).join(" ; ")}`
      : `${facts.controls.filter((c) => c.tag === "button").length} buttons named`,
  );

  report.check(
    `[aria] ${label}: every form control and link has an accessible name (WCAG 4.1.2 / 2.4.4)`,
    unnamedControls.length === 0,
    unnamedControls.length
      ? `${unnamedControls.length} unnamed: ${unnamedControls.slice(0, 5).join(" ; ")}`
      : `${facts.controls.length} interactive elements checked`,
  );

  report.check(
    `[aria] ${label}: no visible interactive element is hidden from the accessibility tree (WCAG 4.1.2)`,
    missingFromTree.length === 0,
    missingFromTree.length
      ? `${missingFromTree.length} absent/ignored: ${missingFromTree.slice(0, 5).join(" ; ")}`
      : "all visible controls are exposed",
  );

  /* ---- Form controls: role + name from the AX tree -------------------- */
  const formControls = facts.controls.filter(
    (c) => c.visible && !c.ariaHidden && ["input", "select", "textarea"].includes(c.tag),
  );
  const badFields = formControls
    .map((c) => ({ c, node: c.id ? axById.get(c.id) : undefined }))
    .filter(({ node }) => !node || node.ignored || !axName(node))
    .map(({ c }) => `${describe(tags, c.id)} [${c.tag}${c.type ? ":" + c.type : ""}]`);

  report.check(
    `[aria] ${label}: every input/select/range has an associated label (WCAG 1.3.1 / 3.3.2)`,
    badFields.length === 0,
    badFields.length
      ? `${badFields.length} unlabelled: ${badFields.slice(0, 5).join(" ; ")}`
      : `${formControls.length} fields labelled`,
  );

  /* ---- radiogroup / radio -------------------------------------------- */
  if (facts.groups.length > 0) {
    const groupProblems: string[] = [];
    for (const group of facts.groups) {
      const node = group.id ? axById.get(group.id) : undefined;
      const name = node ? axName(node) : "";
      if (!name) groupProblems.push(`${describe(tags, group.id)} has no accessible name`);
      if (group.radios.length === 0) {
        groupProblems.push(`${describe(tags, group.id)} contains no role=radio children`);
        continue;
      }
      for (const radio of group.radios) {
        if (radio.checked !== "true" && radio.checked !== "false") {
          groupProblems.push(
            `${describe(tags, radio.id)} has aria-checked="${radio.checked ?? "(absent)"}"`,
          );
        }
        const radioNode = radio.id ? axById.get(radio.id) : undefined;
        if (!radioNode || !axName(radioNode)) {
          groupProblems.push(`${describe(tags, radio.id)} has no accessible name`);
        }
      }
      const checked = group.radios.filter((r) => r.checked === "true").length;
      if (checked !== 1) {
        groupProblems.push(
          `${describe(tags, group.id)} has ${checked} checked radios (expected exactly 1)`,
        );
      }
    }
    report.check(
      `[aria] ${label}: radiogroups are named and expose aria-checked correctly (WCAG 4.1.2)`,
      groupProblems.length === 0,
      groupProblems.length
        ? groupProblems.slice(0, 5).join(" ; ")
        : `${facts.groups.length} groups, ${facts.groups.reduce((n, g) => n + g.radios.length, 0)} radios`,
    );

    // Keyboard semantics of a radiogroup: arrow keys move the selection.
    // Reported separately because it is a distinct, fixable defect.
    const arrowable = await cdp.evaluate<boolean>(`(() => {
      const group = document.querySelector('[role=radiogroup]');
      if (!group) return true;
      const radios = group.querySelectorAll('[role=radio]');
      // The roving-tabindex pattern puts exactly one radio in the tab order.
      let inTabOrder = 0;
      for (const r of radios) {
        const ti = r.getAttribute('tabindex');
        if (ti === null || Number(ti) >= 0) inTabOrder++;
      }
      return inTabOrder === 1;
    })()`);
    report.check(
      `[aria] ${label}: radiogroup uses the roving-tabindex pattern (ARIA radiogroup pattern)`,
      arrowable,
      arrowable
        ? "one radio in the tab order per group"
        : "every radio is individually tabbable; arrow keys do not move the selection",
    );
  } else {
    report.skip(`[aria] ${label}: radiogroups`, "no role=radiogroup on this page");
  }

  /* ---- switch --------------------------------------------------------- */
  if (facts.switches.length > 0) {
    const bad = facts.switches.filter((s) => s.checked !== "true" && s.checked !== "false");
    report.check(
      `[aria] ${label}: every role=switch has aria-checked (WCAG 4.1.2)`,
      bad.length === 0,
      bad.length
        ? bad.map((s) => `${describe(tags, s.id)} -> "${s.checked}"`).join(" ; ")
        : `${facts.switches.length} switches`,
    );
  } else {
    report.skip(`[aria] ${label}: role=switch`, "none rendered on this page");
  }

  /* ---- progressbar ---------------------------------------------------- */
  if (facts.progress.length > 0) {
    const problems: string[] = [];
    for (const bar of facts.progress) {
      const node = bar.id ? axById.get(bar.id) : undefined;
      if (!node || !axName(node)) problems.push(`${describe(tags, bar.id)} has no accessible name`);
      if (bar.now === null || bar.min === null || bar.max === null) {
        problems.push(
          `${describe(tags, bar.id)} missing ${[
            bar.now === null ? "aria-valuenow" : "",
            bar.min === null ? "aria-valuemin" : "",
            bar.max === null ? "aria-valuemax" : "",
          ]
            .filter(Boolean)
            .join("/")}`,
        );
      }
    }
    report.check(
      `[aria] ${label}: progressbars expose a name and value range (WCAG 4.1.2)`,
      problems.length === 0,
      problems.length ? problems.slice(0, 5).join(" ; ") : `${facts.progress.length} bars`,
    );
  } else {
    report.skip(`[aria] ${label}: role=progressbar`, "none rendered in this state");
  }

  /* ---- 1.1.1 images --------------------------------------------------- */
  const loudSvgs = facts.svgs.filter(
    (s) =>
      s.visible &&
      !s.hidden &&
      s.role !== "presentation" &&
      s.role !== "none" &&
      !s.hasName,
  );
  report.check(
    `[aria] ${label}: decorative SVGs are hidden, meaningful ones are named (WCAG 1.1.1)`,
    loudSvgs.length === 0,
    loudSvgs.length
      ? `${loudSvgs.length} exposed and unnamed: ${loudSvgs
          .slice(0, 5)
          .map((s) => describe(tags, s.id))
          .join(" ; ")}`
      : `${facts.svgs.length} svgs, all hidden or named`,
  );

  const altless = facts.imgs.filter((i) => !i.hasAlt);
  report.check(
    `[aria] ${label}: every <img> carries an alt attribute (WCAG 1.1.1)`,
    altless.length === 0,
    altless.length
      ? altless.map((i) => `${describe(tags, i.id)} src=${i.src}`).join(" ; ")
      : `${facts.imgs.length} images`,
  );

  /* ---- 1.3.1 headings -------------------------------------------------- */
  const visibleHeadings = facts.headings.filter((h) => h.visible);
  const h1s = visibleHeadings.filter((h) => h.level === 1);
  report.check(
    `[aria] ${label}: exactly one <h1> (WCAG 1.3.1)`,
    h1s.length === 1,
    h1s.length === 1 ? `"${h1s[0]!.text}"` : `${h1s.length} h1 elements: ${h1s.map((h) => `"${h.text}"`).join(", ")}`,
  );

  const jumps: string[] = [];
  let previous = 0;
  for (const heading of visibleHeadings) {
    if (previous !== 0 && heading.level > previous + 1) {
      jumps.push(`h${previous} -> h${heading.level} at "${heading.text}" (${describe(tags, heading.id)})`);
    }
    previous = heading.level;
  }
  report.check(
    `[aria] ${label}: heading levels never skip a level (WCAG 1.3.1)`,
    jumps.length === 0,
    jumps.length
      ? jumps.slice(0, 4).join(" ; ")
      : `${visibleHeadings.length} headings: ${visibleHeadings.map((h) => "h" + h.level).join(" ")}`,
  );

  /* ---- 3.1.1 language -------------------------------------------------- */
  report.check(
    `[aria] ${label}: html[lang] is set (WCAG 3.1.1)`,
    /^[a-z]{2}(-[A-Za-z0-9]+)*$/.test(facts.lang),
    `lang="${facts.lang}"`,
  );

  /* ---- 1.3.1 landmarks -------------------------------------------------- */
  report.check(
    `[aria] ${label}: has exactly one main landmark (WCAG 1.3.1)`,
    facts.landmarks.main === 1,
    `${facts.landmarks.main} <main> elements`,
  );
}

/* -------------------------------------------------------------------------- */

export async function runSemantics(cdp: CDP, report: Report): Promise<void> {
  await setViewport(cdp, DESKTOP.width, DESKTOP.height);

  for (const page of PAGES) {
    const status = await routeStatus(page.path);
    if (status === 404 || status === 0) {
      report.skip(`[aria] ${page.name}`, `${page.path} returned ${status || "no response"}`);
      continue;
    }
    await goto(cdp, page.path, { wait: page.wait });
    await auditPage(cdp, report, page.name);
  }

  /* ---- The workspace again, this time with files queued ---------------- */
  await goto(cdp, "/app", { wait: "main#main" });
  let rows = 0;
  try {
    rows = await seedQueue(cdp, 3);
  } catch (error) {
    report.skip("[aria] workspace (queued)", `could not queue test images (${(error as Error).message})`);
    return;
  }
  if (rows === 0) {
    report.skip("[aria] workspace (queued)", "no test images available");
    return;
  }
  await auditPage(cdp, report, "workspace+files");

  /* ---- And once more mid-processing, to catch the live-only widgets ---- */
  await cdp.evaluate(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => /^(Start|Process remaining)$/.test((x.textContent||'').trim()));
    if (b) b.click();
  })()`);
  const sawBar = await cdp
    .evaluate<boolean>(
      `new Promise((resolve) => {
        const deadline = Date.now() + 15000;
        const tick = () => {
          if (document.querySelector('[role=progressbar]')) return resolve(true);
          if (Date.now() > deadline) return resolve(false);
          setTimeout(tick, 100);
        };
        tick();
      })`,
    )
    .catch(() => false);

  if (!sawBar) {
    report.skip("[aria] workspace (processing): progressbar semantics", "no progressbar appeared");
    return;
  }
  await auditPage(cdp, report, "workspace+processing");
}
