import type { Dimensions, ImageFormat, OutputFormat } from "./image";
import type { ProcessingOptions } from "./options";

export type JobStatus =
  | "queued"
  | "validating"
  | "processing"
  | "done"
  | "failed"
  | "cancelled";

/**
 * Machine-readable failure reasons.
 *
 * Every error surfaced to a user is derived from one of these, which is how the
 * UI can always explain *why* something failed and what to try instead, rather
 * than printing a raw exception.
 */
export type ProcessingErrorCode =
  | "EMPTY_FILE"
  | "TOO_LARGE"
  | "NOT_AN_IMAGE"
  | "FORMAT_MISMATCH"
  | "DECODE_UNSUPPORTED"
  | "DECODE_FAILED"
  | "DIMENSIONS_TOO_LARGE"
  | "ENCODE_UNSUPPORTED"
  | "ENCODE_FAILED"
  | "OUT_OF_MEMORY"
  | "CANCELLED"
  | "UNKNOWN";

export type ProcessingError = {
  code: ProcessingErrorCode;
  /** One sentence, plain language, shown as the headline. */
  message: string;
  /** Concrete next step. Omitted when there genuinely is not one. */
  hint?: string;
  /** True when a retry could plausibly succeed (transient/memory pressure). */
  retryable: boolean;
};

/** The immutable facts about a file as it entered the queue. */
export type ImageInput = {
  name: string;
  size: number;
  /** Format from content sniffing, not from the extension. */
  format: ImageFormat;
  /** What the extension claimed, when it disagreed with the bytes. */
  declaredFormat: ImageFormat | null;
  dimensions: Dimensions;
  hasAlpha: boolean;
  /** Present only when the source actually carried metadata. */
  metadata?: {
    hasExif: boolean;
    hasGps: boolean;
    orientation: number;
  };
};

export type ImageOutput = {
  blob: Blob;
  size: number;
  format: OutputFormat;
  dimensions: Dimensions;
  /** Encoder quality actually used, after any target-size search. */
  quality: number | null;
};

export type ProcessingResult = {
  output: ImageOutput;
  /** Wall-clock milliseconds inside the worker. */
  durationMs: number;
  /**
   * Set when the user asked for a target size. `reached` is false when the
   * engine could not land inside the tolerance — the UI must say so rather than
   * implying success.
   */
  target?: {
    requestedBytes: number;
    reached: boolean;
    attempts: number;
  };
  /** True when alpha had to be flattened onto the matte colour. */
  flattenedAlpha: boolean;
};

export type ImageJob = {
  id: string;
  file: File;
  status: JobStatus;
  /** 0-1, only meaningful while `processing`. */
  progress: number;
  input: ImageInput | null;
  result: ProcessingResult | null;
  error: ProcessingError | null;
  /** Per-job overrides; absent means "use the queue-wide options". */
  options: ProcessingOptions | null;
  selected: boolean;
  /** Object URL for the output preview. Revoked when the job is removed. */
  previewUrl: string | null;
  addedAt: number;
};

export type QueueCounts = {
  total: number;
  queued: number;
  processing: number;
  done: number;
  failed: number;
  cancelled: number;
};

export type QueueTotals = {
  originalBytes: number;
  outputBytes: number;
  savedBytes: number;
  savedRatio: number;
};
