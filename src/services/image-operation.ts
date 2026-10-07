import type { ProcessingOptions } from "@/types/options";
import type { WorkerResponse } from "@/types/worker";

/** Disposable worker for a serial export recipe; cancellation releases its decoder immediately. */
export function runImageOperation(
  file: File,
  options: ProcessingOptions,
  signal: AbortSignal,
  progress: (fraction: number) => void,
): Promise<Extract<WorkerResponse, { type: "done" }>> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Cancelled", "AbortError"));
      return;
    }
    const worker = new Worker(
      new URL("../workers/image.worker.ts", import.meta.url),
      { type: "module" },
    );
    const cleanup = () => {
      worker.terminate();
      signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      reject(new DOMException("Cancelled", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.type === "progress") progress(event.data.fraction);
      else if (event.data.type === "done") {
        cleanup();
        resolve(event.data);
      } else if (event.data.type === "failed") {
        cleanup();
        reject(new Error(event.data.error.message));
      }
    };
    worker.onerror = () => {
      cleanup();
      reject(
        new Error(
          "This export stopped. Try a smaller photo or close other tabs.",
        ),
      );
    };
    worker.postMessage({
      type: "process",
      id: "recipe",
      file,
      name: file.name,
      options,
    });
  });
}
