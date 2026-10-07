/**
 * WCAG 2.1.1 (Keyboard), 2.1.2 (No Keyboard Trap), 2.4.7 (Focus Visible).
 *
 * Every assertion here is driven by `Input.dispatchKeyEvent`, i.e. by real key
 * events going through the browser's input pipeline. Calling `element.focus()`
 * instead would visit the same elements but could never detect a trap, because
 * scripted focus bypasses whatever the page does with the Tab key.
 */
import type { CDP, Report } from "../lib/cdp.ts";
import { sleep, waitFor } from "../lib/cdp.ts";
import {
  DESKTOP,
  describe,
  enableInput,
  goto,
  KEY,
  MOBILE,
  MOD_SHIFT,
  PAGES,
  pressKey,
  routeStatus,
  seedQueue,
  setViewport,
  type TaggedElement,
  tagDom,
} from "./harness.ts";

const MAX_TABS = 140;

type Stop = {
  id: string | null;
  tag: string;
  role: string;
  name: string;
  style: string;
  focusVisible: boolean;
  disabled: boolean;
  atBody: boolean;
};

const FOCUSABLE =
  "a[href], button, input:not([type=hidden]), select, textarea, summary, details, " +
  '[tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/**
 * Resting outline/box-shadow for every focusable element, captured while
 * nothing is focused. A focus indicator is "visible" only if it changes one of
 * these — a ring that is already painted is not an indicator.
 */
async function baselineFocusStyles(cdp: CDP): Promise<Record<string, string>> {
  return cdp.evaluate<Record<string, string>>(`(() => {
    const out = {};
    for (const el of document.querySelectorAll(${JSON.stringify(FOCUSABLE)})) {
      const cs = getComputedStyle(el);
      const id = el.getAttribute('data-sfa11y');
      if (id) out[id] = [cs.outlineStyle, cs.outlineWidth, cs.outlineColor, cs.boxShadow].join(' | ');
    }
    return out;
  })()`);
}

async function readActive(cdp: CDP): Promise<Stop> {
  return cdp.evaluate<Stop>(`(() => {
    const el = document.activeElement;
    if (!el || el === document.body || el === document.documentElement) {
      return { id: null, tag: 'BODY', role: '', name: '', style: '', focusVisible: false, disabled: false, atBody: true };
    }
    const cs = getComputedStyle(el);
    const name = (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '')
      .replace(/\\s+/g, ' ').trim().slice(0, 48);
    let focusVisible = false;
    try { focusVisible = el.matches(':focus-visible'); } catch {}
    return {
      id: el.getAttribute('data-sfa11y'),
      tag: el.tagName,
      role: el.getAttribute('role') || '',
      name,
      style: [cs.outlineStyle, cs.outlineWidth, cs.outlineColor, cs.boxShadow].join(' | '),
      focusVisible,
      disabled: !!el.disabled,
      atBody: false,
    };
  })()`);
}

/** Moves focus out of the document so the next Tab lands on the first stop. */
async function resetFocus(cdp: CDP): Promise<void> {
  await cdp.evaluate(`(() => {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    window.scrollTo(0, 0);
  })()`);
  await sleep(60);
}

async function tabForward(cdp: CDP, max = MAX_TABS): Promise<Stop[]> {
  const stops: Stop[] = [];
  for (let i = 0; i < max; i++) {
    await pressKey(cdp, KEY.Tab);
    const stop = await readActive(cdp);
    if (stop.atBody) break;
    stops.push(stop);
    // Focus came back round to where it started: the ring is closed.
    if (stops.length > 2 && stop.id && stop.id === stops[0]!.id) {
      stops.pop();
      break;
    }
  }
  return stops;
}

/* -------------------------------------------------------------------------- */

export async function runKeyboard(cdp: CDP, report: Report): Promise<void> {
  await setViewport(cdp, DESKTOP.width, DESKTOP.height);
  await enableInput(cdp);

  for (const page of PAGES) {
    const status = await routeStatus(page.path);
    if (status === 404 || status === 0) {
      report.skip(`[kbd] ${page.name}: tab order`, `${page.path} returned ${status || "no response"}`);
      continue;
    }

    await goto(cdp, page.path, { wait: page.wait });
    const tags = await tagDom(cdp);
    const baseline = await baselineFocusStyles(cdp);
    await resetFocus(cdp);

    const stops = await tabForward(cdp);

    report.check(
      `[kbd] ${page.name}: tab reaches interactive content`,
      stops.length >= 3,
      `${stops.length} tab stops`,
    );

    /* ---- 2.4.7 Focus Visible ------------------------------------------- */
    const invisible: string[] = [];
    for (const stop of stops) {
      if (!stop.id) continue;
      const before = baseline[stop.id];
      if (before === undefined) continue; // Element appeared after tagging.
      if (before === stop.style) invisible.push(describe(tags, stop.id));
    }
    report.check(
      `[kbd] ${page.name}: every tab stop has a visible focus indicator (WCAG 2.4.7)`,
      invisible.length === 0,
      invisible.length
        ? `${invisible.length} without a style change on focus: ${invisible.slice(0, 4).join(" ; ")}`
        : `${stops.length} stops, all change outline or box-shadow`,
    );

    const notFocusVisible = stops.filter((s) => s.id && !s.focusVisible);
    report.check(
      `[kbd] ${page.name}: keyboard focus matches :focus-visible`,
      notFocusVisible.length === 0,
      notFocusVisible.length
        ? notFocusVisible
            .slice(0, 4)
            .map((s) => describe(tags, s.id))
            .join(" ; ")
        : "all stops",
    );

    /* ---- 2.1.2 No Keyboard Trap ---------------------------------------- */
    let stuck: string | null = null;
    for (let i = 2; i < stops.length; i++) {
      const a = stops[i - 2]!.id;
      const b = stops[i - 1]!.id;
      const c = stops[i]!.id;
      if (a && a === b && b === c) {
        stuck = describe(tags, a);
        break;
      }
    }
    report.check(
      `[kbd] ${page.name}: Tab is never trapped going forward (WCAG 2.1.2)`,
      stuck === null,
      stuck ? `focus repeats on ${stuck}` : `${stops.length} distinct advances`,
    );

    // Shift+Tab must get all the way back to the first stop.
    const first = stops.find((s) => s.id)?.id ?? null;
    let returned = false;
    const backwards: Array<string | null> = [];
    for (let i = 0; i < stops.length + 3 && first; i++) {
      await pressKey(cdp, KEY.Tab, MOD_SHIFT);
      const stop = await readActive(cdp);
      backwards.push(stop.id);
      if (stop.id === first) {
        returned = true;
        break;
      }
    }
    report.check(
      `[kbd] ${page.name}: Shift+Tab returns to the first control (WCAG 2.1.2)`,
      returned || stops.length === 0,
      returned
        ? `${backwards.length} back-steps to ${describe(tags, first)}`
        : `never reached ${describe(tags, first)} in ${backwards.length} back-steps`,
    );
  }

  await runDropZoneKeys(cdp, report);
  await runWorkspaceOperation(cdp, report);
  await runSettingsSheet(cdp, report);
}

/* -------------------------------------------------------------------------- */
/* The drop zone is a <button>: Enter and Space must open the picker           */
/* -------------------------------------------------------------------------- */

async function runDropZoneKeys(cdp: CDP, report: Report): Promise<void> {
  await setViewport(cdp, DESKTOP.width, DESKTOP.height);
  await goto(cdp, "/app", { wait: "main#main" });
  await tagDom(cdp);

  // A real file picker cannot open headlessly, so the handler is instrumented
  // instead: the component's contract is that activating the button calls
  // `click()` on the hidden <input type=file>.
  await cdp.evaluate(`(() => {
    window.__sfPicker = 0;
    const orig = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function () {
      if (this.type === 'file') { window.__sfPicker++; return; }
      return orig.apply(this, arguments);
    };
  })()`);

  await resetFocus(cdp);

  let found = false;
  for (let i = 0; i < 40; i++) {
    await pressKey(cdp, KEY.Tab);
    const isZone = await cdp.evaluate<boolean>(`(() => {
      const el = document.activeElement;
      return !!el && el.tagName === 'BUTTON' && /Drop your images here|Drop to start/.test(el.textContent || '');
    })()`);
    if (isZone) {
      found = true;
      break;
    }
  }

  if (!found) {
    report.check(
      "[kbd] drop zone is reachable by Tab (WCAG 2.1.1)",
      false,
      "never became document.activeElement within 40 Tab presses",
    );
    return;
  }
  report.check("[kbd] drop zone is reachable by Tab (WCAG 2.1.1)", true, "focused via Tab");

  await pressKey(cdp, KEY.Enter);
  const afterEnter = await cdp.evaluate<number>(`window.__sfPicker`);
  report.check(
    "[kbd] Enter on the drop zone opens the file picker (WCAG 2.1.1)",
    afterEnter >= 1,
    `file input click count = ${afterEnter}`,
  );

  await pressKey(cdp, KEY.Space);
  const afterSpace = await cdp.evaluate<number>(`window.__sfPicker`);
  report.check(
    "[kbd] Space on the drop zone opens the file picker (WCAG 2.1.1)",
    afterSpace > afterEnter,
    `file input click count = ${afterSpace} (was ${afterEnter})`,
  );
}

/* -------------------------------------------------------------------------- */
/* The workspace must be fully operable from the keyboard                      */
/* -------------------------------------------------------------------------- */

async function runWorkspaceOperation(cdp: CDP, report: Report): Promise<void> {
  await setViewport(cdp, DESKTOP.width, DESKTOP.height);
  await goto(cdp, "/app", { wait: "main#main" });

  let rows = 0;
  try {
    rows = await seedQueue(cdp, 3);
  } catch (error) {
    report.skip(
      "[kbd] workspace is operable by keyboard",
      `could not queue test images (${(error as Error).message}) — run: npm run test:images`,
    );
    return;
  }
  if (rows === 0) {
    report.skip("[kbd] workspace is operable by keyboard", "no test images available");
    return;
  }

  const tags = await tagDom(cdp);
  await resetFocus(cdp);
  const stops = await tabForward(cdp);
  const names = stops.map((s) => `${s.tag}:${s.role}:${s.name}`);

  const reach = (label: string, test: (s: Stop) => boolean) => {
    const hit = stops.find(test);
    report.check(
      `[kbd] workspace: ${label} is reachable by Tab (WCAG 2.1.1)`,
      hit !== undefined,
      hit ? describe(tags, hit.id) : `not among ${stops.length} tab stops`,
    );
    return hit;
  };

  reach("the per-file select checkbox", (s) => s.tag === "INPUT" && /^Select /.test(s.name));
  reach(
    "the select-all checkbox",
    (s) => s.tag === "INPUT" && /\d+ of \d+ selected/.test(s.name),
  );
  reach("a settings control", (s) => s.tag === "SELECT" || s.role === "radio" || s.role === "switch");
  reach("the rename field", (s) => s.tag === "INPUT" && /Rename pattern/i.test(s.name));
  const start = reach("the Start control", (s) => /^(Start|Process remaining)$/.test(s.name));

  // Toggle a checkbox with the keyboard and confirm the model actually moved.
  await resetFocus(cdp);
  let toggled = false;
  for (let i = 0; i < 80; i++) {
    await pressKey(cdp, KEY.Tab);
    const isRowBox = await cdp.evaluate<boolean>(
      `(() => { const el = document.activeElement; return !!el && el.tagName === 'INPUT' && el.type === 'checkbox' && /^Select /.test(el.getAttribute('aria-label') || ''); })()`,
    );
    if (!isRowBox) continue;
    const before = await cdp.evaluate<boolean>(`document.activeElement.checked`);
    await pressKey(cdp, KEY.Space);
    const after = await cdp.evaluate<boolean>(`document.activeElement.checked`);
    toggled = before !== after;
    break;
  }
  report.check(
    "[kbd] workspace: Space toggles a file's selection checkbox (WCAG 2.1.1)",
    toggled,
    toggled ? "checked state flipped" : "state did not change on Space",
  );

  if (!start) {
    report.skip("[kbd] workspace: processing can be started and finished by keyboard", "no Start control");
    return;
  }

  /* ---- Start the batch with the keyboard ------------------------------- */
  await resetFocus(cdp);
  let started = false;
  for (let i = 0; i < 90; i++) {
    await pressKey(cdp, KEY.Tab);
    const onStart = await cdp.evaluate<boolean>(
      `(() => { const el = document.activeElement; return !!el && el.tagName === 'BUTTON' && /^(Start|Process remaining)$/.test((el.textContent||'').trim()); })()`,
    );
    if (!onStart) continue;
    await pressKey(cdp, KEY.Enter);
    started = true;
    break;
  }
  report.check(
    "[kbd] workspace: Enter on Start begins processing (WCAG 2.1.1)",
    started,
    started ? "activated via Enter" : "Start never received focus",
  );
  if (!started) return;

  let finished = false;
  try {
    await waitFor("batch to finish", 180_000, async () =>
      cdp.evaluate<boolean>(
        `(() => { const t = document.body.innerText; return !/Shrinking\\.\\.\\.|Paused/.test(t) && /Your images are ready\\./.test(t); })()`,
      ),
    );
    finished = true;
  } catch {
    finished = false;
  }
  report.check(
    "[kbd] workspace: keyboard-started batch runs to completion",
    finished,
    finished ? "reached the ready state" : "timed out before the batch drained",
  );
  if (!finished) return;

  /* ---- Download with the keyboard -------------------------------------- */
  await cdp.send("Page.setDownloadBehavior", { behavior: "deny" }).catch(() => undefined);
  await cdp.evaluate(`(() => {
    window.__sfDownloads = 0;
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.hasAttribute('download')) { window.__sfDownloads++; return; }
      return orig.apply(this, arguments);
    };
  })()`);

  await resetFocus(cdp);
  let activatedDownload = false;
  for (let i = 0; i < 120; i++) {
    await pressKey(cdp, KEY.Tab);
    const onDownload = await cdp.evaluate<boolean>(
      `(() => { const el = document.activeElement; return !!el && el.tagName === 'BUTTON' && /^Download /.test(el.getAttribute('aria-label') || ''); })()`,
    );
    if (!onDownload) continue;
    await pressKey(cdp, KEY.Enter);
    await sleep(250);
    activatedDownload = (await cdp.evaluate<number>(`window.__sfDownloads`)) > 0;
    break;
  }
  report.check(
    "[kbd] workspace: a result can be downloaded with the keyboard (WCAG 2.1.1)",
    activatedDownload,
    activatedDownload ? "download anchor fired from Enter" : "no per-row Download button responded",
  );
}

/* -------------------------------------------------------------------------- */
/* Mobile settings sheet: Escape closes it, focus comes back                   */
/* -------------------------------------------------------------------------- */

async function runSettingsSheet(cdp: CDP, report: Report): Promise<void> {
  await setViewport(cdp, MOBILE.width, MOBILE.height, true);
  await goto(cdp, "/app", { wait: "main#main" });

  let rows = 0;
  try {
    rows = await seedQueue(cdp, 2);
  } catch (error) {
    report.skip(
      "[kbd] mobile settings sheet: Escape closes it",
      `could not queue test images (${(error as Error).message})`,
    );
    await setViewport(cdp, DESKTOP.width, DESKTOP.height);
    return;
  }
  if (rows === 0) {
    report.skip("[kbd] mobile settings sheet: Escape closes it", "no test images available");
    await setViewport(cdp, DESKTOP.width, DESKTOP.height);
    return;
  }

  const tags: Record<string, TaggedElement> = await tagDom(cdp);
  await resetFocus(cdp);

  // Reach the Settings trigger with the keyboard and open it with Enter.
  let opener: string | null = null;
  for (let i = 0; i < 90; i++) {
    await pressKey(cdp, KEY.Tab);
    const hit = await cdp.evaluate<string | null>(
      `(() => { const el = document.activeElement; return (el && el.tagName === 'BUTTON' && (el.textContent||'').trim() === 'Settings') ? el.getAttribute('data-sfa11y') : null; })()`,
    );
    if (hit) {
      opener = hit;
      break;
    }
  }

  if (!opener) {
    report.check(
      "[kbd] mobile: the Settings sheet trigger is reachable by Tab (WCAG 2.1.1)",
      false,
      "no 'Settings' button received focus within 90 Tab presses at 390px",
    );
    await setViewport(cdp, DESKTOP.width, DESKTOP.height);
    return;
  }
  report.check(
    "[kbd] mobile: the Settings sheet trigger is reachable by Tab (WCAG 2.1.1)",
    true,
    describe(tags, opener),
  );

  await pressKey(cdp, KEY.Enter);
  await sleep(500);

  const dialog = await cdp.evaluate<{
    present: boolean;
    modal: string | null;
    label: string | null;
    focusInside: boolean;
    activeDesc: string;
  }>(`(() => {
    const d = document.querySelector('[role=dialog]');
    if (!d) return { present: false, modal: null, label: null, focusInside: false, activeDesc: '' };
    const active = document.activeElement;
    return {
      present: true,
      modal: d.getAttribute('aria-modal'),
      label: d.getAttribute('aria-label') || d.getAttribute('aria-labelledby'),
      focusInside: !!active && d.contains(active),
      activeDesc: active ? active.tagName + ' ' + ((active.getAttribute('aria-label') || active.textContent || '').replace(/\\s+/g,' ').trim().slice(0,40)) : 'none',
    };
  })()`);

  report.check(
    "[kbd] mobile: Enter on Settings opens the sheet (WCAG 2.1.1)",
    dialog.present,
    dialog.present ? "role=dialog rendered" : "no [role=dialog] after Enter",
  );

  if (!dialog.present) {
    await setViewport(cdp, DESKTOP.width, DESKTOP.height);
    return;
  }

  report.check(
    "[a11y] mobile settings sheet moves focus into the dialog on open (WCAG 2.4.3)",
    dialog.focusInside,
    dialog.focusInside
      ? `focus is on ${dialog.activeDesc}`
      : `focus stayed outside the dialog, on ${dialog.activeDesc}`,
  );

  // Focus containment: Tab from inside a modal must not reach the page behind.
  let escaped: string | null = null;
  for (let i = 0; i < 25; i++) {
    await pressKey(cdp, KEY.Tab);
    const outside = await cdp.evaluate<string | null>(`(() => {
      const d = document.querySelector('[role=dialog]');
      const el = document.activeElement;
      if (!d || !el || el === document.body) return null;
      if (d.contains(el)) return null;
      return el.tagName + ' ' + ((el.getAttribute('aria-label') || el.textContent || '').replace(/\\s+/g,' ').trim().slice(0,40));
    })()`);
    if (outside) {
      escaped = outside;
      break;
    }
  }
  report.check(
    "[a11y] mobile settings sheet keeps Tab inside the modal (WCAG 2.4.3 / ARIA dialog pattern)",
    escaped === null,
    escaped ? `Tab left the modal and landed on ${escaped}` : "focus stayed within the dialog",
  );

  await pressKey(cdp, KEY.Escape);
  await sleep(500);

  const closed = await cdp.evaluate<boolean>(`!document.querySelector('[role=dialog]')`);
  report.check(
    "[kbd] mobile settings sheet: Escape closes it (WCAG 2.1.2)",
    closed,
    closed ? "dialog removed" : "dialog still in the DOM after Escape",
  );

  const restored = await cdp.evaluate<{ id: string | null; desc: string }>(`(() => {
    const el = document.activeElement;
    return {
      id: el ? el.getAttribute('data-sfa11y') : null,
      desc: el ? el.tagName + ' ' + ((el.getAttribute('aria-label') || el.textContent || '').replace(/\\s+/g,' ').trim().slice(0,40)) : 'none',
    };
  })()`);
  report.check(
    "[a11y] mobile settings sheet returns focus to the control that opened it (WCAG 2.4.3)",
    restored.id === opener,
    restored.id === opener
      ? "focus is back on the Settings button"
      : `focus landed on ${restored.desc} instead of ${describe(tags, opener)}`,
  );

  await setViewport(cdp, DESKTOP.width, DESKTOP.height);
}
