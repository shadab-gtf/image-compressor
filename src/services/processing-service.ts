"use client";

import type { CodecSupport } from "@/codecs/capabilities";
import {
  patchJob,
  queueStore,
  setJobError,
  setJobInput,
  setJobResult,
  setRunState,
} from "@/stores/queue-store";
import { WorkerPool, type PoolTask } from "@/workers/pool";

/**
 * The single seam between the processing core and application state.
 *
 * The pool knows nothing about the store and the store knows nothing about
 * workers; this module is the only place the two meet, which keeps the engine
 * reusable outside this app.
 */

let pool: WorkerPool | null = null;

function ensurePool(): WorkerPool {
  pool ??= new WorkerPool({
    onProgress: (id, fraction) => {
      if (queueStore.get().jobs.some((job) => job.id === id && job.status === "processing")) {
        patchJob(id, { progress: fraction });
      }
    },
    onDone: (id, input, result) => {
      setJobInput(id, input);
      setJobResult(id, result);
    },
    onFailed: (id, error) => {
      // A cancel arrives as a failure from the worker's point of view, but it is
      // a user action, not an error — the UI must not show it as one.
      if (error.code === "CANCELLED") patchJob(id, { status: "cancelled", progress: 0 });
      else setJobError(id, error);
    },
    onIdle: () => {
      const { run } = queueStore.get();
      if (run === "running") setRunState("idle");
    },
  });
  return pool;
}

export function getCapabilities(): Promise<CodecSupport> {
  return ensurePool().capabilities();
}

/** Queues every job that has not already completed. */
export function startProcessing(ids?: string[]) {
  const state = queueStore.get();
  const wanted = ids ? new Set(ids) : null;

  const tasks: PoolTask[] = [];
  for (const job of state.jobs) {
    if (wanted && !wanted.has(job.id)) continue;
    if (job.status === "processing" || job.status === "done") continue;
    tasks.push({
      id: job.id,
      file: job.file,
      name: job.file.name,
      // A per-job override wins over the queue-wide settings.
      options: job.options ?? state.options,
    });
    patchJob(job.id, { status: "processing", progress: 0, error: null });
  }

  if (tasks.length === 0) return;
  setRunState("running");
  ensurePool().enqueue(tasks);
  ensurePool().resume();
}

export function pauseProcessing() {
  pool?.pause();
  setRunState("paused");
}

export function resumeProcessing() {
  setRunState("running");
  pool?.resume();
  if (!pool || pool.pending === 0) setRunState("idle");
}

export function cancelProcessing() {
  pool?.cancelAll();
  // Scheduled and running entries both return to a retryable cancelled state.
  queueStore.set((state) => ({
    ...state,
    jobs: state.jobs.map((job) =>
      job.status === "processing" ? { ...job, status: "cancelled", progress: 0 } : job,
    ),
  }));
  setRunState("idle");
}

export function cancelJob(id: string) {
  pool?.cancel(id);
  patchJob(id, { status: "cancelled", progress: 0 });
}

/** Tears the pool down — used when the workspace unmounts. */
export function disposeProcessing() {
  // The client store can survive route navigation or Fast Refresh. Leave jobs
  // retryable when their workers are torn down instead of stuck "processing".
  cancelProcessing();
  pool?.dispose();
  pool = null;
}
