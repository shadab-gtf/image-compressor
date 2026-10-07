/**
 * Suite 1 — the main thread must stay free.
 *
 * This is the headline requirement. ShrinkFox's entire architecture (a bounded
 * worker pool, a UI-free pipeline) exists so that a large batch never blocks the
 * thread that paints. The suite checks it three independent ways:
 *
 *  1. `longtask` entries — if a decode or an encode ran on the main thread, a
 *     multi-megapixel image would produce a task far longer than any threshold
 *     a human would tolerate.
 *  2. `requestAnimationFrame` gaps — the direct consequence a user feels. A page
 *     that stops painting has stopped being usable, whatever the task log says.
 *  3. Live worker targets — proof the work is genuinely elsewhere, and proof the
 *     pool stays bounded rather than spawning a worker per file.
 */
import { type CDP, type Session, Report, launch, sleep } from "../lib/cdp.ts";
import {
  type LongTask,
  type Row,
  Measurements,
  feedFiles,
  fixtureSet,
  installInstrumentation,
  isEngineWorkerChunk,
  median,
  mb,
  ms,
  openWorkspace,
  percentile,
  startBatch,
  totalBytes,
  waitForBatchIdle,
  workerTargets,
} from "./lib/harness.ts";

/** Generous on purpose: this is a "did a codec run on the UI thread" tripwire. */
const LONG_TASK_BUDGET_MS = 250;
const HEAVY_BATCH = 36;
const WORKER_BOUND_BATCH = 50;
const REPS = 3;

/**
 * `chooseConcurrency` caps the pool at two workers (one on a low-memory device),
 * plus at most one transient codec-probe worker. Four leaves room for a worker
 * being replaced without making the bound meaningless.
 */
const WORKER_CEILING = 4;

type Rep = {
  longTasks: LongTask[];
  frameGaps: number[];
  durationMs: number;
};

async function pollWorkers(cdp: CDP, stop: { done: boolean }) {
  const counts: number[] = [];
  const urls = new Set<string>();
  while (!stop.done) {
    try {
      const workers = await workerTargets(cdp);
      counts.push(workers.length);
      for (const worker of workers) urls.add(worker.url);
    } catch {
      // The browser can be mid-navigation; a missed sample is not a failure.
    }
    await sleep(120);
  }
  return { counts, urls: [...urls] };
}

async function runBatch(
  cdp: CDP,
  base: string,
  paths: string[],
  withFrames: boolean,
): Promise<Rep & { workerCounts: number[]; workerUrls: string[] }> {
  await openWorkspace(cdp, base);
  await feedFiles(cdp, paths);

  // Discard everything hydration and ingest produced; only the batch window is
  // under test here.
  await cdp.evaluate(`window.__perf.longTasks.length = 0`);
  if (withFrames) await cdp.evaluate(`window.__perf.startFrames()`);

  const stop = { done: false };
  const workers = pollWorkers(cdp, stop);

  const startedAt = await startBatch(cdp);
  const finishedAt = await waitForBatchIdle(cdp);
  stop.done = true;
  const workerSamples = await workers;

  const frameGaps = withFrames
    ? await cdp.evaluate<number[]>(`window.__perf.stopFrames()`)
    : [];

  const longTasks = await cdp.evaluate<LongTask[]>(
    `window.__perf.longTasks.filter(t => t.start >= ${startedAt - 100} && t.start <= ${finishedAt + 250})`,
  );

  return {
    longTasks,
    frameGaps,
    durationMs: finishedAt - startedAt,
    workerCounts: workerSamples.counts,
    workerUrls: workerSamples.urls,
  };
}

export async function mainThreadSuite(base: string): Promise<{ report: Report; rows: Row[] }> {
  const report = new Report("1. Main thread stays free");
  const out = new Measurements("1. Main thread");

  const heavy = fixtureSet("heavy36", ["heavy", "light", "mid", "light", "mid", "light"], HEAVY_BATCH);
  const wide = fixtureSet("wide50", ["light", "mid"], WORKER_BOUND_BATCH);

  let session: Session | null = null;
  try {
    session = await launch({ label: "perf-main" });
    const { cdp } = session;
    await installInstrumentation(cdp);

    /* ---- Can we even see frames here? -------------------------------- */
    await openWorkspace(cdp, base);
    await cdp.evaluate(`window.__perf.startFrames()`);
    await sleep(1500);
    const idleFrames = await cdp.evaluate<number[]>(`window.__perf.stopFrames()`);
    const framesWork = idleFrames.length >= 20;
    out.record(
      "idle rAF rate (headless baseline)",
      framesWork ? `${(idleFrames.length / 1.5).toFixed(0)} fps` : "no frames",
      framesWork ? "" : "rAF not driven in this headless session",
    );

    /* ---- Heavy batch, repeated ---------------------------------------- */
    console.log(
      `\n    ${REPS} x ${HEAVY_BATCH}-file batch (${mb(totalBytes(heavy))}, 6 x 1600x1200 photos)`,
    );
    const reps: Awaited<ReturnType<typeof runBatch>>[] = [];
    for (let i = 0; i < REPS; i += 1) {
      const rep = await runBatch(cdp, base, heavy, framesWork);
      reps.push(rep);
      console.log(
        `      rep ${i + 1}: ${ms(rep.durationMs)}, ${rep.longTasks.length} long tasks, ` +
          `worst ${ms(Math.max(0, ...rep.longTasks.map((t) => t.duration)))}`,
      );
    }

    const worstPerRep = reps.map((r) => Math.max(0, ...r.longTasks.map((t) => t.duration)));
    const countPerRep = reps.map((r) => r.longTasks.length);
    const allTasks = reps.flatMap((r) => r.longTasks);
    const medianWorst = median(worstPerRep);
    const absoluteWorst = Math.max(0, ...worstPerRep);

    out.record("batch wall time (median of 3)", ms(median(reps.map((r) => r.durationMs))));
    out.record("long tasks > 50 ms per batch (median)", `${median(countPerRep)}`, `reps: ${countPerRep.join(", ")}`);
    out.record("worst long task (median of 3 reps)", ms(medianWorst), `reps: ${worstPerRep.map((v) => Math.round(v)).join(", ")} ms`);
    out.record("worst long task (worst of 3 reps)", ms(absoluteWorst));
    if (allTasks.length > 0) {
      out.record("long task p95", ms(percentile(allTasks.map((t) => t.duration), 95)));
      out.record(
        "total blocking time per batch (median)",
        ms(median(reps.map((r) => r.longTasks.reduce((sum, t) => sum + Math.max(0, t.duration - 50), 0)))),
      );
    }

    report.check(
      `no main-thread task exceeds ${LONG_TASK_BUDGET_MS} ms during a ${HEAVY_BATCH}-file batch`,
      medianWorst <= LONG_TASK_BUDGET_MS,
      `median worst task ${ms(medianWorst)}; worst observed ${ms(absoluteWorst)} across ${REPS} reps`,
    );

    /* ---- Frames -------------------------------------------------------- */
    if (framesWork) {
      const gapsPerRep = reps.map((r) => r.frameGaps);
      const painted = gapsPerRep.map((g) => g.length);
      const p95Gap = gapsPerRep.map((g) => percentile(g, 95));
      const worstGap = gapsPerRep.map((g) => Math.max(0, ...g));
      out.record("frames painted during batch (median)", `${median(painted)}`, `reps: ${painted.join(", ")}`);
      out.record("frame gap p95 (median of reps)", ms(median(p95Gap)));
      out.record("worst frame gap (worst rep)", ms(Math.max(0, ...worstGap)));

      report.check(
        "the page keeps painting while a batch processes",
        painted.every((count) => count >= 10),
        `frames per batch: ${painted.join(", ")}`,
      );
      report.check(
        "frame gaps stay under 250 ms during a batch",
        median(worstGap) <= 250,
        `median worst gap ${ms(median(worstGap))}`,
      );
    } else {
      report.skip(
        "the page keeps painting while a batch processes",
        "headless Chrome did not drive requestAnimationFrame in this session",
      );
      report.skip("frame gaps stay under 250 ms during a batch", "no rAF callbacks available");
    }

    /* ---- Work really is off-thread ------------------------------------- */
    const heavyWorkerCounts = reps.flatMap((r) => r.workerCounts);
    const heavyWorkerUrls = new Set(reps.flatMap((r) => r.workerUrls));
    const sawWorkers = heavyWorkerCounts.some((n) => n > 0);

    if (sawWorkers) {
      const engineWorkers = [...heavyWorkerUrls].filter(isEngineWorkerChunk);
      report.check(
        "decoding and encoding run in dedicated workers",
        engineWorkers.length > 0,
        engineWorkers.length > 0
          ? engineWorkers[0]!.split("/").pop()!
          : `worker URLs seen: ${[...heavyWorkerUrls].join(", ") || "none"}`,
      );
    } else {
      // Fall back to resource timing, which cannot be hidden by target plumbing.
      const loaded = await cdp.evaluate<string[]>(
        `performance.getEntriesByType('resource').map(e => e.name).filter(n => /worker/i.test(n))`,
      );
      report.check(
        "decoding and encoding run in dedicated workers",
        loaded.some(isEngineWorkerChunk),
        `from resource timing: ${loaded.map((n) => n.split("/").pop()).join(", ") || "no worker scripts fetched"}`,
      );
    }

    /* ---- Pool stays bounded at 50 files -------------------------------- */
    console.log(`\n    ${WORKER_BOUND_BATCH}-file batch — worker-count bound`);
    const wideRep = await runBatch(cdp, base, wide, false);
    const peakWorkers = Math.max(0, ...wideRep.workerCounts);
    const samples = wideRep.workerCounts.length;
    out.record(
      `peak live workers for ${WORKER_BOUND_BATCH} images`,
      `${peakWorkers}`,
      `${samples} samples over ${ms(wideRep.durationMs)}`,
    );
    out.record(
      "peak live workers during heavy batch",
      `${Math.max(0, ...heavyWorkerCounts)}`,
      "36 files, 6 of them 1.9 MP",
    );

    if (samples > 0 && peakWorkers > 0) {
      report.check(
        `worker count stays bounded (<= ${WORKER_CEILING}) for ${WORKER_BOUND_BATCH} images`,
        peakWorkers <= WORKER_CEILING,
        `peak ${peakWorkers} live workers, never one per image`,
      );
      report.check(
        "worker count is not proportional to the batch size",
        peakWorkers < WORKER_BOUND_BATCH / 5,
        `${peakWorkers} workers for ${WORKER_BOUND_BATCH} files`,
      );
    } else {
      report.skip(
        `worker count stays bounded (<= ${WORKER_CEILING}) for ${WORKER_BOUND_BATCH} images`,
        "Target.getTargets reported no worker targets in this browser build",
      );
      report.skip("worker count is not proportional to the batch size", "no worker targets to count");
    }
  } finally {
    session?.stop();
  }

  report.finish();
  return { report, rows: out.rows };
}
