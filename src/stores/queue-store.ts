"use client";

import type { ImageJob, ProcessingError, ProcessingResult, QueueCounts, QueueTotals } from "@/types/job";
import type { ImageInput } from "@/types/job";
import type { ProcessingOptions } from "@/types/options";
import { DEFAULT_OPTIONS } from "@/types/options";
import { createStore, useStore } from "./create-store";

export type RunState = "idle" | "running" | "paused";

export type QueueState = {
  jobs: ImageJob[];
  /** Queue-wide settings. A job may override them via `job.options`. */
  options: ProcessingOptions;
  run: RunState;
  /** Set once the engine reports which codecs this browser can actually use. */
  startedAt: number | null;
};

const initial: QueueState = {
  jobs: [],
  options: DEFAULT_OPTIONS,
  run: "idle",
  startedAt: null,
};

export const queueStore = createStore<QueueState>(initial);

/* -------------------------------------------------------------------------- */
/* Identity                                                                    */
/* -------------------------------------------------------------------------- */

let counter = 0;
function nextId() {
  counter += 1;
  return `job_${Date.now().toString(36)}_${counter.toString(36)}`;
}

/* -------------------------------------------------------------------------- */
/* Mutations                                                                   */
/* -------------------------------------------------------------------------- */

export function addFiles(files: File[]): ImageJob[] {
  const created = files.map<ImageJob>((file) => ({
    id: nextId(),
    file,
    status: "queued",
    progress: 0,
    input: null,
    result: null,
    error: null,
    options: null,
    selected: true,
    previewUrl: null,
    addedAt: Date.now(),
  }));

  queueStore.set((state) => ({ ...state, jobs: [...state.jobs, ...created] }));
  return created;
}

/**
 * Every job mutation routes through here so the jobs array is replaced exactly
 * once per change and untouched jobs keep their object identity — which is what
 * lets a row subscribe to only itself.
 */
export function patchJob(id: string, patch: Partial<ImageJob>) {
  queueStore.set((state) => {
    const index = state.jobs.findIndex((j) => j.id === id);
    if (index === -1) return state;
    const current = state.jobs[index]!;
    const next = { ...current, ...patch };
    const jobs = state.jobs.slice();
    jobs[index] = next;
    return { ...state, jobs };
  });
}

export function setJobInput(id: string, input: ImageInput) {
  patchJob(id, { input, status: "queued" });
}

export function setJobResult(id: string, result: ProcessingResult) {
  const previewUrl = URL.createObjectURL(result.output.blob);
  queueStore.set((state) => {
    const index = state.jobs.findIndex((j) => j.id === id);
    if (index === -1) {
      // The job was removed while it was in flight — do not leak the URL.
      URL.revokeObjectURL(previewUrl);
      return state;
    }
    const jobs = state.jobs.slice();
    const current = jobs[index]!;
    if (current.previewUrl) URL.revokeObjectURL(current.previewUrl);
    jobs[index] = {
      ...current,
      status: "done",
      progress: 1,
      result,
      error: null,
      previewUrl,
    };
    return { ...state, jobs };
  });
}

export function setJobError(id: string, error: ProcessingError) {
  patchJob(id, { status: "failed", error, progress: 0 });
}

export function removeJobs(ids: string[]) {
  const set = new Set(ids);
  queueStore.set((state) => {
    for (const job of state.jobs) {
      if (set.has(job.id) && job.previewUrl) URL.revokeObjectURL(job.previewUrl);
    }
    return { ...state, jobs: state.jobs.filter((j) => !set.has(j.id)) };
  });
}

export function clearQueue() {
  queueStore.set((state) => {
    for (const job of state.jobs) {
      if (job.previewUrl) URL.revokeObjectURL(job.previewUrl);
    }
    return { ...state, jobs: [], run: "idle", startedAt: null };
  });
}

export function setSelected(id: string, selected: boolean) {
  patchJob(id, { selected });
}

export function selectAll(selected: boolean) {
  queueStore.set((state) => ({
    ...state,
    jobs: state.jobs.map((j) => (j.selected === selected ? j : { ...j, selected })),
  }));
}

export function setOptions(update: (prev: ProcessingOptions) => ProcessingOptions) {
  queueStore.set((state) => ({ ...state, options: update(state.options) }));
}

export function setRunState(run: RunState) {
  queueStore.set((state) => ({
    ...state,
    run,
    startedAt: run === "running" && state.startedAt === null ? Date.now() : state.startedAt,
  }));
}

/** Reset finished/failed jobs back to queued so they can be run again. */
export function requeue(ids: string[]) {
  const set = new Set(ids);
  queueStore.set((state) => ({
    ...state,
    jobs: state.jobs.map((job) => {
      if (!set.has(job.id)) return job;
      if (job.previewUrl) URL.revokeObjectURL(job.previewUrl);
      return { ...job, status: "queued", progress: 0, error: null, result: null, previewUrl: null };
    }),
  }));
}

/* -------------------------------------------------------------------------- */
/* Derived values                                                              */
/* -------------------------------------------------------------------------- */

export function countsOf(jobs: ImageJob[]): QueueCounts {
  const counts: QueueCounts = {
    total: jobs.length,
    queued: 0,
    processing: 0,
    done: 0,
    failed: 0,
    cancelled: 0,
  };
  for (const job of jobs) {
    if (job.status === "queued" || job.status === "validating") counts.queued += 1;
    else if (job.status === "processing") counts.processing += 1;
    else if (job.status === "done") counts.done += 1;
    else if (job.status === "failed") counts.failed += 1;
    else if (job.status === "cancelled") counts.cancelled += 1;
  }
  return counts;
}

export function totalsOf(jobs: ImageJob[]): QueueTotals {
  let originalBytes = 0;
  let outputBytes = 0;
  for (const job of jobs) {
    // Only completed jobs count, so the savings figure is never speculative.
    if (job.status !== "done" || !job.result) continue;
    originalBytes += job.file.size;
    outputBytes += job.result.output.size;
  }
  const savedBytes = originalBytes - outputBytes;
  return {
    originalBytes,
    outputBytes,
    savedBytes,
    savedRatio: originalBytes > 0 ? savedBytes / originalBytes : 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Hooks — selectors are module-level so their identity is stable              */
/* -------------------------------------------------------------------------- */

const selectJobs = (s: QueueState) => s.jobs;
const selectOptions = (s: QueueState) => s.options;
const selectRun = (s: QueueState) => s.run;

export const useJobs = () => useStore(queueStore, selectJobs);
export const useQueueOptions = () => useStore(queueStore, selectOptions);
export const useRunState = () => useStore(queueStore, selectRun);

export function useJob(id: string): ImageJob | undefined {
  return useStore(
    queueStore,
    // Safe to build inline: the result is an existing job object, so identity is
    // stable across renders when that job has not changed.
    (s) => s.jobs.find((j) => j.id === id),
  );
}
