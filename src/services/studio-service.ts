import type { StudioImage, StudioProgress, StudioRequest, StudioResponse } from "@/types/studio";

/** One disposable worker per operation makes cancellation immediate, even in WASM. */
export function runStudioOperation(
  request: StudioRequest,
  signal: AbortSignal,
  onProgress: (progress: StudioProgress) => void,
): Promise<StudioImage> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Cancelled", "AbortError"));
      return;
    }
    if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") {
      reject(new Error("This studio needs a modern browser with background image processing. Please update Chrome, Edge, Firefox or Safari."));
      return;
    }
    const worker = new Worker(new URL("./studio.worker.ts", import.meta.url), { type: "module" });
    const cleanup = () => {
      worker.terminate();
      signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      reject(new DOMException("Cancelled", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = (event: MessageEvent<StudioResponse>) => {
      const response = event.data;
      if (response.type === "progress") {
        onProgress(response.progress);
      } else if (response.type === "result") {
        cleanup();
        resolve(response.image);
      } else {
        cleanup();
        reject(new Error(response.message));
      }
    };
    worker.onerror = () => {
      cleanup();
      reject(new Error("The image worker stopped unexpectedly. Try a smaller image or reload this page."));
    };
    worker.postMessage(request);
  });
}
