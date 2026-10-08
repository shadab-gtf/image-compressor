import type { StudioImage, StudioProgress, StudioRequest, StudioResponse } from "@/types/studio";

/** One disposable worker per operation makes cancellation immediate, even in WASM. */
export function runStudioOperation(
  request: StudioRequest,
  signal: AbortSignal,
  onProgress: (progress: StudioProgress) => void,
): Promise<StudioImage> {
  const enhancement = request.type === "process" && request.mode === "enhance-image";
  const compatible = enhancement || (request.type === "inspect" && request.mode === "enhance-image");
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const smallDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (memory !== undefined && memory <= 4);
  const fallback = () => import("./studio-browser").then(module => module.runBrowserEnhancement(request, signal, onProgress));
  if (compatible && (smallDevice || typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined" || typeof createImageBitmap === "undefined")) return fallback();
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Cancelled", "AbortError"));
      return;
    }
    if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") {
      reject(new Error("This studio needs a modern browser with background image processing. Please update Chrome, Edge, Firefox or Safari."));
      return;
    }
    let worker: Worker;
    try { worker = new Worker(new URL("./studio.worker.ts", import.meta.url), { type: "module" }); }
    catch (cause) { if (compatible) fallback().then(resolve, reject); else reject(cause); return; }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      clearTimeout(timer);
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
      signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      reject(new DOMException("Cancelled", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    const recover = () => { cleanup(); fallback().then(resolve, reject); };
    if (enhancement) timer = setTimeout(recover, 8000);
    worker.onmessage = (event: MessageEvent<StudioResponse>) => {
      const response = event.data;
      if (response.type === "progress") {
        onProgress(response.progress);
      } else if (response.type === "result") {
        cleanup();
        resolve(response.image);
      } else {
        cleanup();
        if (enhancement) fallback().then(resolve, reject);
        else reject(new Error(response.message));
      }
    };
    worker.onerror = () => {
      if (compatible) { recover(); return; }
      cleanup();
      reject(new Error(request.type === "process" && request.mode === "remove-background" && request.settings.method === "general"
        ? "BiRefNet could not finish on this device. Close other tabs, or choose Portrait AI for people or Simple background for a plain backdrop."
        : "The image worker stopped unexpectedly. Try a smaller image or reload this page."));
    };
    worker.postMessage(request);
  });
}

