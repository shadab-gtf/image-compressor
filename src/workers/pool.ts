import type { CodecSupport } from "@/codecs/capabilities";
import type { ProcessingError, ImageInput, ProcessingResult } from "@/types/job";
import type { ProcessingOptions } from "@/types/options";
import type { WorkerRequest, WorkerResponse } from "@/types/worker";
import { HEADER_BYTES, readHeaderDimensions } from "@/engines/header";
import { sniffFormat } from "@/lib/format";

/**
 * Worker pool and scheduler.
 *
 * The pool owns a small, fixed set of workers and feeds them one job at a time.
 * It never spawns a worker per file: 500 images would mean 500 decoders racing
 * for memory, which is how a browser tab dies. Instead a bounded number of jobs
 * are in flight and the rest wait in a queue.
 */

export type PoolTask = {
  id: string;
  file: File;
  name: string;
  options: ProcessingOptions;
  estimatedMemory?: number;
};

export type PoolHandlers = {
  onProgress: (id: string, fraction: number) => void;
  onDone: (id: string, input: ImageInput, result: ProcessingResult) => void;
  onFailed: (id: string, error: ProcessingError) => void;
  onIdle: () => void;
};

/**
 * Chooses how many workers to run.
 *
 * `hardwareConcurrency` alone is a poor answer. It reports logical cores, which
 * on a hyper-threaded laptop is double the useful parallelism for a workload
 * this memory-heavy, and it says nothing about how big the images are. A 50 MP
 * source needs ~200 MB of RGBA *per worker* while it is being scaled, so the
 * pool trades width for headroom when the queue is heavy.
 */
export function chooseConcurrency(averageBytes: number, queued: number): number {
  const cores = typeof navigator !== "undefined" ? (navigator.hardwareConcurrency ?? 4) : 4;

  // Leave a core for the UI thread and the compositor.
  const deviceMemory = typeof navigator !== "undefined" && "deviceMemory" in navigator
    ? Number(navigator.deviceMemory)
    : 4;
  let workers = Math.max(1, Math.min(cores - 1, deviceMemory <= 4 ? 1 : 2));

  // Large sources dominate memory, so narrow the pool rather than risk an OOM
  // that would fail the whole batch instead of slowing it down.
  if (averageBytes > 12_000_000) workers = Math.min(workers, 2);
  else if (averageBytes > 5_000_000) workers = Math.min(workers, 3);

  // No point spinning up more workers than there are jobs.
  return Math.max(1, Math.min(workers, queued));
}

type Slot = {
  worker: Worker;
  busy: string | null;
  memory: number;
};

export class WorkerPool {
  private slots: Slot[] = [];
  private queue: PoolTask[] = [];
  private paused = false;
  private disposed = false;
  private concurrency = 2;
  private support: Promise<CodecSupport> | null = null;
  private preparing = new Set<string>();
  private readonly memoryBudget = typeof navigator !== "undefined" && "deviceMemory" in navigator && Number(navigator.deviceMemory) > 4 ? 384_000_000 : 192_000_000;

  constructor(private readonly handlers: PoolHandlers) {}

  private spawn(): Slot {
    // Turbopack rewrites this URL at build time and emits the worker as its own
    // chunk, so the engine is not part of the main bundle.
    const worker = new Worker(new URL("./image.worker.ts", import.meta.url), {
      type: "module",
      name: "shrinkfox-image",
    });
    const slot: Slot = { worker, busy: null, memory: 0 };

    worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (this.disposed || !this.slots.includes(slot)) return;
      if ("id" in message && message.id !== slot.busy) return;
      switch (message.type) {
        case "progress":
          this.handlers.onProgress(message.id, message.fraction);
          break;
        case "done":
          slot.busy = null;
          slot.memory = 0;
          this.handlers.onDone(message.id, message.input, message.result);
          this.pump();
          break;
        case "failed":
          slot.busy = null;
          slot.memory = 0;
          this.handlers.onFailed(message.id, message.error);
          this.pump();
          break;
        default:
          break;
      }
    });

    worker.addEventListener("error", (event) => {
      if (this.disposed || !this.slots.includes(slot)) return;
      // A worker-level error kills whatever it was running; report that job and
      // replace the worker so the rest of the queue still drains.
      const id = slot.busy;
      slot.busy = null;
      if (id) {
        this.handlers.onFailed(id, {
          code: "UNKNOWN",
          message: "The image worker stopped unexpectedly.",
          hint: event.message || "This is usually caused by running out of memory.",
          retryable: true,
        });
      }
      worker.terminate();
      this.slots = this.slots.filter((s) => s !== slot);
      this.pump();
    });

    this.slots.push(slot);
    return slot;
  }

  /** Probes codec support once, on a worker, and caches the answer. */
  capabilities(): Promise<CodecSupport> {
    this.support ??= new Promise<CodecSupport>((resolve, reject) => {
      const worker = new Worker(new URL("./image.worker.ts", import.meta.url), {
        type: "module",
        name: "shrinkfox-probe",
      });
      const id = "probe";
      const timer = setTimeout(() => {
        worker.terminate();
        reject(new Error("Codec probe timed out"));
      }, 10_000);

      worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
        if (event.data.type !== "probed") return;
        clearTimeout(timer);
        resolve(event.data.support);
        // The probe worker has done its one job; keeping it alive would hold a
        // thread and a few megabytes for nothing.
        worker.terminate();
      });
      worker.addEventListener("error", (event) => {
        clearTimeout(timer);
        worker.terminate();
        reject(new Error(event.message || "Codec probe failed"));
      });

      worker.postMessage({ type: "probe", id } satisfies WorkerRequest);
    });
    return this.support;
  }

  enqueue(tasks: PoolTask[]) {
    if (this.disposed || tasks.length === 0) return;
    this.queue.push(...tasks);
    for (const task of tasks) {
      this.preparing.add(task.id);
      void task.file.slice(0, HEADER_BYTES).arrayBuffer().then((buffer) => {
        const bytes = new Uint8Array(buffer); const format = sniffFormat(bytes);
        const dimensions = format ? readHeaderDimensions(bytes, format) : null;
        const sourcePixels = dimensions ? dimensions.width * dimensions.height : 40_000_000;
        const targetPixels = (task.options.resize.width ?? dimensions?.width ?? 8192) * (task.options.resize.height ?? dimensions?.height ?? 8192);
        // Source, destination and scratch/encoding buffers; compressed bytes alone are misleading.
        task.estimatedMemory = Math.max(sourcePixels, targetPixels) * 16 + task.file.size;
      }).catch(() => { task.estimatedMemory = 640_000_000; }).finally(() => { this.preparing.delete(task.id); this.pump(); });
    }

    const totalBytes = this.queue.reduce((sum, task) => sum + task.file.size, 0);
    this.concurrency = chooseConcurrency(totalBytes / this.queue.length, this.queue.length);
    this.pump();
  }

  /** Jobs already in flight finish; nothing new starts. */
  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
    this.pump();
  }

  /** Termination releases an active decoder and prevents stale retry results. */
  cancel(id: string) {
    this.queue = this.queue.filter((task) => task.id !== id);
    this.preparing.delete(id);
    for (const slot of this.slots) {
      if (slot.busy === id) {
        slot.worker.terminate();
        this.slots = this.slots.filter((candidate) => candidate !== slot);
      }
    }
    this.pump();
  }

  cancelAll() {
    const ids = this.slots.map((s) => s.busy).filter((id): id is string => id !== null);
    this.queue = [];
    this.preparing.clear();
    for (const id of ids) this.cancel(id);
    this.paused = false;
  }

  get pending(): number {
    return this.queue.length + this.slots.filter((s) => s.busy !== null).length;
  }

  private pump() {
    if (this.disposed) return;

    if (!this.paused) {
      while (this.queue.length > 0) {
        const next = this.queue[0];
        if (!next || this.preparing.has(next.id)) break;
        const runningMemory = this.slots.reduce((sum, candidate) => sum + candidate.memory, 0);
        if (runningMemory > 0 && runningMemory + (next.estimatedMemory ?? this.memoryBudget) > this.memoryBudget) break;
        if (this.slots.filter((candidate) => candidate.busy !== null).length >= this.concurrency) break;
        let slot = this.slots.find((s) => s.busy === null);
        if (!slot) {
          if (this.slots.length >= this.concurrency) break;
          slot = this.spawn();
        }
        const task = this.queue.shift();
        if (!task) break;
        slot.busy = task.id;
        slot.memory = task.estimatedMemory ?? this.memoryBudget;
        slot.worker.postMessage({
          type: "process",
          id: task.id,
          file: task.file,
          name: task.name,
          options: task.options,
        } satisfies WorkerRequest);
      }
    }

    if (this.pending === 0) this.handlers.onIdle();
  }

  dispose() {
    this.disposed = true;
    this.queue = [];
    for (const slot of this.slots) slot.worker.terminate();
    this.slots = [];
  }
}
