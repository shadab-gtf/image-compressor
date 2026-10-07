import type { OcrResult } from "@paddleocr/paddleocr-js";

/** Adapter for the pinned official 0.4.2 worker transport. No image uploads. */
export class LocalPaddleOCR {
  private worker: Worker;
  private nextId = 0;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private ready: Promise<unknown>;
  constructor() {
    this.worker = new Worker("/ocr/paddle-worker.js", { type: "module" });
    this.worker.onmessage = (event: MessageEvent<{ kind: string; requestId: number; status: string; payload: unknown; error?: { message: string } }>) => {
      const response = event.data;
      if (response.kind !== "worker-transport-response") return;
      const task = this.pending.get(response.requestId);
      if (task) clearTimeout(task.timer);
      this.pending.delete(response.requestId);
      if (response.status === "success") task?.resolve(response.payload);
      else task?.reject(new Error(response.error?.message ?? "Text recognition failed."));
    };
    this.worker.onerror = () => this.dispose("The OCR worker could not start. Reload or use a smaller image.");
    this.ready = this.request("init", { options: {
      pipelineConfig: {
        pipelineName: "OCR", raw: {}, warnings: [], unsupportedFeatures: [],
        modelSelection: { textDetectionModelName: "PP-OCRv5_mobile_det", textRecognitionModelName: "PP-OCRv5_mobile_rec" },
        assets: { det: { url: new URL("/ocr/PP-OCRv5_mobile_det.tar", location.origin).href }, rec: { url: new URL("/ocr/PP-OCRv5_mobile_rec.tar", location.origin).href } },
        runtimeDefaults: {}, pipelineBatchSize: 1, textDetectionBatchSize: 1, textRecognitionBatchSize: 6,
      },
      ortOptions: { backend: "auto", wasmPaths: new URL("/ocr/", location.origin).href, numThreads: crossOriginIsolated ? Math.min(4, Math.max(1, Math.floor(navigator.hardwareConcurrency / 2))) : 1, disableWasmProxy: true },
    } });
  }
  private request(type: string, payload: unknown, transfer: Transferable[] = []) {
    return new Promise<unknown>((resolve, reject) => {
      const requestId = ++this.nextId;
      const timer = setTimeout(() => this.dispose("Text recognition took too long on this device. Try a smaller crop."), 120_000);
      this.pending.set(requestId, { resolve, reject, timer });
      this.worker.postMessage({ kind: "worker-transport-request", type, payload, requestId }, transfer);
    });
  }
  async recognize(blob: Blob): Promise<OcrResult> {
    await this.ready;
    const bitmap = await createImageBitmap(blob);
    const result = await this.request("predict", { sources: [{ kind: "imageBitmap", imageBitmap: bitmap }], params: { textDetLimitSideLen: 960, textDetLimitType: "max", textRecScoreThresh: 0.35 } }, [bitmap]);
    const results = result as OcrResult[];
    if (!results[0]?.items || !results[0].image.width) throw new Error("OCR returned no valid result.");
    return results[0];
  }
  dispose(message = "Text recognition cancelled.") {
    this.worker.terminate();
    for (const task of this.pending.values()) { clearTimeout(task.timer); task.reject(new Error(message)); }
    this.pending.clear();
  }
}
