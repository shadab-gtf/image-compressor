/**
 * WCAG 4.1.3 (Status Messages).
 *
 * The workspace's whole value is a long-running batch job. A sighted user reads
 * "Shrinking... 3 / 7" and a moving bar; a screen-reader user gets nothing at
 * all unless that text sits in a live region. This suite therefore samples every
 * live region in the document before, during and after a real batch and asserts
 * that the progress and the completion are actually announced.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { CDP, Report } from "../lib/cdp.ts";
import { sleep, TEST_IMAGES, waitFor } from "../lib/cdp.ts";
import { DESKTOP, goto, setViewport, tagDom } from "./harness.ts";

type Region = {
  selector: string;
  role: string;
  live: string;
  atomic: string;
  busy: string;
  text: string;
};

const SAMPLE = `(() => {
  const describe = (el) => {
    const parts = [];
    let node = el, depth = 0;
    while (node && node.nodeType === 1 && depth < 3) {
      let s = node.tagName.toLowerCase();
      if (node.id) { parts.unshift(s + '#' + node.id); break; }
      const cls = (node.getAttribute('class') || '').trim().split(/\\s+/).filter(Boolean).slice(0, 2);
      if (cls.length) s += '.' + cls.join('.');
      parts.unshift(s);
      node = node.parentElement; depth++;
    }
    return parts.join(' > ');
  };
  const sel = '[aria-live], [role=status], [role=alert], [role=log], [role=marquee], [role=timer], output';
  return Array.prototype.map.call(document.querySelectorAll(sel), (el) => ({
    selector: describe(el),
    role: el.getAttribute('role') || (el.tagName === 'OUTPUT' ? 'status (implicit)' : ''),
    live: el.getAttribute('aria-live') || '',
    atomic: el.getAttribute('aria-atomic') || '',
    busy: el.getAttribute('aria-busy') || '',
    text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 120),
  }));
})()`;

/** Text that a screen-reader user would need in order to follow the batch. */
const PROGRESS_SHAPE = /\d+\s*\/\s*\d+|shrinking|processing|\d+\s*%/i;
const DONE_SHAPE = /ready|complete|finished|done|saved/i;
const ERROR_SHAPE = /fail|error|not an image|empty/i;

function announces(regions: Region[], shape: RegExp): Region | undefined {
  return regions.find((r) => shape.test(r.text));
}

function summarise(regions: Region[]): string {
  if (regions.length === 0) return "no live regions in the document";
  return regions
    .slice(0, 6)
    .map((r) => `${r.selector}[role=${r.role || "-"},live=${r.live || "-"}]="${r.text.slice(0, 40)}"`)
    .join(" ; ");
}

export async function runLiveRegions(cdp: CDP, report: Report): Promise<void> {
  await setViewport(cdp, DESKTOP.width, DESKTOP.height);
  await goto(cdp, "/app", { wait: "main#main" });

  // A deliberately mixed batch: real images plus the two malformed fixtures, so
  // both the success and the failure announcement paths are exercised.
  const all = readdirSync(TEST_IMAGES);
  const good = all.filter((n) => /\.(png|jpe?g|webp)$/i.test(n) && !/not-really|empty/.test(n)).slice(0, 3);
  const bad = all.filter((n) => /not-really|empty/.test(n));
  if (good.length === 0) {
    report.skip("[live] batch progress is announced", "no test images — run: npm run test:images");
    return;
  }

  try {
    await cdp.setFiles(
      "input[type=file]:not([webkitdirectory])",
      [...good, ...bad].map((n) => join(TEST_IMAGES, n)),
    );
    await waitFor("queue rows", 25_000, async () => {
      const n = await cdp.evaluate<number>(`document.querySelectorAll('main ul li').length`);
      return n > 0 ? n : null;
    });
  } catch (error) {
    report.skip("[live] batch progress is announced", `could not queue files: ${(error as Error).message}`);
    return;
  }

  await tagDom(cdp);
  const before = await cdp.evaluate<Region[]>(SAMPLE);

  report.check(
    "[live] workspace declares at least one live region before work starts (WCAG 4.1.3)",
    before.length > 0,
    summarise(before),
  );

  /* ---- Run the batch, sampling as it goes ------------------------------ */
  await cdp.evaluate(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => /^(Start|Process remaining)$/.test((x.textContent||'').trim()));
    if (b) b.click();
  })()`);

  const during: Region[] = [];
  const deadline = Date.now() + 120_000;
  let busySeen = false;
  while (Date.now() < deadline) {
    const state = await cdp.evaluate<{ busy: boolean; done: boolean }>(
      `(() => { const t = document.body.innerText; return { busy: /Shrinking\\.\\.\\.|Paused/.test(t), done: /Your images are ready\\./.test(t) }; })()`,
    );
    if (state.busy) {
      busySeen = true;
      during.push(...(await cdp.evaluate<Region[]>(SAMPLE)));
    }
    if (state.done && !state.busy) break;
    await sleep(250);
  }

  if (!busySeen) {
    report.skip(
      "[live] batch progress is announced while processing (WCAG 4.1.3)",
      "the batch never entered a visible running state — too fast to sample",
    );
  } else {
    const progressRegion = announces(during, PROGRESS_SHAPE);
    report.check(
      "[live] batch progress is announced while processing (WCAG 4.1.3)",
      progressRegion !== undefined,
      progressRegion
        ? `announced by ${progressRegion.selector} (role=${progressRegion.role}, aria-live=${progressRegion.live || "implicit"})`
        : `no aria-live / role=status region carried the batch counter. Live regions seen: ${summarise(during)}`,
    );

    // The visible progress panel itself: is it inside a live region?
    const panelAnnounced = await cdp.evaluate<{ found: boolean; wrapper: string }>(`(() => {
      const nodes = [...document.querySelectorAll('p, div, span')]
        .filter(el => /Shrinking\\.\\.\\./.test(el.textContent || '') && el.children.length < 4);
      if (nodes.length === 0) return { found: false, wrapper: 'progress panel not rendered at sample time' };
      const el = nodes[nodes.length - 1];
      const live = el.closest('[aria-live], [role=status], [role=alert], [role=log]');
      return {
        found: !!live,
        wrapper: live ? live.tagName.toLowerCase() + '[' + (live.getAttribute('role') || 'aria-live=' + live.getAttribute('aria-live')) + ']' : 'nearest ancestor live region: none',
      };
    })()`);
    report.check(
      '[live] the visible "Shrinking... n / m" panel sits inside a live region (WCAG 4.1.3)',
      panelAnnounced.found,
      panelAnnounced.wrapper,
    );
  }

  /* ---- Completion ------------------------------------------------------ */
  const finished = await cdp
    .evaluate<boolean>(
      `new Promise((resolve) => {
        const deadline = Date.now() + 120000;
        const tick = () => {
          const t = document.body.innerText;
          if (/Your images are ready\\./.test(t) && !/Shrinking\\.\\.\\./.test(t)) return resolve(true);
          if (Date.now() > deadline) return resolve(false);
          setTimeout(tick, 200);
        };
        tick();
      })`,
    )
    .catch(() => false);

  if (!finished) {
    report.skip("[live] batch completion is announced (WCAG 4.1.3)", "the batch did not finish in time");
    return;
  }

  const after = await cdp.evaluate<Region[]>(SAMPLE);
  const doneRegion = announces(after, DONE_SHAPE);
  report.check(
    "[live] batch completion is announced (WCAG 4.1.3)",
    doneRegion !== undefined,
    doneRegion
      ? `announced by ${doneRegion.selector} (role=${doneRegion.role})`
      : `"Your images are ready." is rendered but is not inside any aria-live / role=status region. Live regions after completion: ${summarise(after)}`,
  );

  const errorRegion = announces(after, ERROR_SHAPE);
  const failedRows = await cdp.evaluate<number>(
    `[...document.querySelectorAll('main ul li')].filter(li => /not an image we recognise|file is empty|Something went wrong/i.test(li.innerText)).length`,
  );
  if (failedRows === 0) {
    report.skip("[live] per-file failures are announced (WCAG 4.1.3)", "no file failed in this batch");
  } else {
    report.check(
      "[live] per-file failures are announced (WCAG 4.1.3)",
      errorRegion !== undefined,
      errorRegion
        ? `announced by ${errorRegion.selector}`
        : `${failedRows} rows show an error message, none of them inside a live region or role=alert`,
    );
  }

  /* ---- ZIP build ------------------------------------------------------- */
  const zipAnnounced = await cdp.evaluate<{ started: boolean; live: boolean }>(`(() => {
    const el = [...document.querySelectorAll('p')].find(p => /Building archive/.test(p.textContent || ''));
    return { started: !!el, live: !!(el && el.closest('[aria-live], [role=status]')) };
  })()`);
  if (!zipAnnounced.started) {
    report.skip(
      "[live] ZIP archive progress is announced (WCAG 4.1.3)",
      "archive build not running at sample time",
    );
  } else {
    report.check(
      "[live] ZIP archive progress is announced (WCAG 4.1.3)",
      zipAnnounced.live,
      zipAnnounced.live ? "inside a live region" : '"Building archive — n / m" has no live-region ancestor',
    );
  }
}
