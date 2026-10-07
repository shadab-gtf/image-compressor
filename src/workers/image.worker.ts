/// <reference lib="webworker" />

import { detectCapabilities } from "@/codecs/capabilities";
import { processImage, type Abort } from "@/engines/pipeline";
import { toProcessingError } from "@/engines/validate";
import type { WorkerRequest, WorkerResponse } from "@/types/worker";

/**
 * Image worker.
 *
 * One job at a time per worker; concurrency is the pool's responsibility. All
 * decoding, scaling and encoding happens here, which is what keeps the main
 * thread free enough to stay interactive during a thousand-file batch.
 */

const scope = self as unknown as DedicatedWorkerGlobalScope;

/** Jobs currently in flight, so a cancel can interrupt between pipeline stages. */
const running = new Map<string, Abort>();

function post(message: WorkerResponse) {
  scope.postMessage(message);
}

scope.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;

  switch (message.type) {
    case "probe": {
      void detectCapabilities().then((support) => {
        post({ type: "probed", id: message.id, support });
      });
      return;
    }

    case "cancel": {
      const signal = running.get(message.id);
      // Co-operative cancellation: the pipeline checks this flag between stages.
      // There is no way to interrupt a decode or encode already in the codec, so
      // the job stops at the next boundary rather than immediately.
      if (signal) signal.aborted = true;
      return;
    }

    case "process": {
      void run(message);
      return;
    }

    default: {
      const never: never = message;
      throw new Error(`Unhandled worker request: ${JSON.stringify(never)}`);
    }
  }
});

async function run(message: Extract<WorkerRequest, { type: "process" }>) {
  const signal: Abort = { aborted: false };
  running.set(message.id, signal);

  try {
    const support = await detectCapabilities();
    const { input, result } = await processImage(
      message.file,
      message.name,
      message.options,
      support,
      signal,
      (fraction) => post({ type: "progress", id: message.id, fraction }),
    );
    post({ type: "done", id: message.id, input, result });
  } catch (cause) {
    // An error object thrown by the validator already carries a code and hint;
    // anything else is mapped into the same shape so the UI only ever handles
    // one error type.
    post({ type: "failed", id: message.id, error: toProcessingError(cause) });
  } finally {
    running.delete(message.id);
  }
}

post({ type: "ready" });
