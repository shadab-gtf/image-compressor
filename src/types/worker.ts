import type { CodecSupport } from "@/codecs/capabilities";
import type { ImageInput, ProcessingError, ProcessingResult } from "./job";
import type { ProcessingOptions } from "./options";

/**
 * Worker message protocol.
 *
 * Both directions are discriminated unions on `type`, so adding a message
 * without handling it is a compile error rather than a silent no-op at runtime.
 */

export type WorkerRequest =
  | { type: "probe"; id: string }
  | {
      type: "process";
      id: string;
      file: File;
      name: string;
      options: ProcessingOptions;
    }
  | { type: "cancel"; id: string };

export type WorkerResponse =
  | { type: "ready" }
  | { type: "probed"; id: string; support: CodecSupport }
  | { type: "progress"; id: string; fraction: number }
  | {
      type: "done";
      id: string;
      input: ImageInput;
      // The Blob travels by structured clone. Blobs are backed by a storage
      // handle rather than the raw bytes, so this does not copy the pixels.
      result: ProcessingResult;
    }
  | { type: "failed"; id: string; error: ProcessingError };
