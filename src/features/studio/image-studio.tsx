"use client";

import Image from "next/image";
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { DoodleIcon } from "@/components/ui/doodle-icon";
import { formatBytes } from "@/lib/bytes";
import { cn } from "@/lib/cn";
import { runStudioOperation } from "@/services/studio-service";
import {
  DEFAULT_STUDIO_SETTINGS,
  type StudioImage,
  type StudioMode,
  type StudioProgress,
  type StudioSettings,
} from "@/types/studio";

interface LoadedImage extends StudioImage {
  file: File;
  url: string;
}

interface StudioResult extends StudioImage {
  url: string;
  settingsKey: string;
}

const checkerboard = {
  backgroundColor: "var(--sf-surface)",
  backgroundImage:
    "conic-gradient(var(--sf-surface-3) 25%, transparent 0 50%, var(--sf-surface-3) 0 75%, transparent 0)",
  backgroundSize: "24px 24px",
};

export function ImageStudio({ mode }: { mode: StudioMode }) {
  const [source, setSource] = useState<LoadedImage | null>(null);
  const [result, setResult] = useState<StudioResult | null>(null);
  const [settings, setSettings] = useState<StudioSettings>(
    DEFAULT_STUDIO_SETTINGS,
  );
  const [progress, setProgress] = useState<StudioProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [position, setPosition] = useState(50);
  const [comparing, setComparing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const comparison = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const active = useRef<AbortController | null>(null);
  const urls = useRef<string[]>([]);
  const id = useId();
  const removal = mode === "remove-background";
  const busy = progress !== null;
  const settingsKey = JSON.stringify(settings);
  const stale = result !== null && result.settingsKey !== settingsKey;

  // Cache Components hides previous routes with Activity. Reset ephemeral image
  // state along with its resources so Back cannot revive revoked download URLs
  // or retain a user's photos in a hidden page. Keep only their tool settings.
  useLayoutEffect(
    () => () => {
      active.current?.abort();
      active.current = null;
      for (const url of urls.current) URL.revokeObjectURL(url);
      urls.current = [];
      setSource(null);
      setResult(null);
      setProgress(null);
      setError(null);
      setNotice(null);
      setDragging(false);
      setComparing(false);
    },
    [],
  );

  function releaseUrl(url: string | undefined) {
    if (!url) return;
    URL.revokeObjectURL(url);
    urls.current = urls.current.filter((item) => item !== url);
  }

  function createUrl(blob: Blob) {
    const url = URL.createObjectURL(blob);
    urls.current.push(url);
    return url;
  }

  async function choose(file: File | undefined) {
    if (!file) return;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setError(null);
    setNotice(null);
    setProgress({ fraction: 0, label: "Opening your image" });
    try {
      const image = await runStudioOperation(
        { type: "inspect", file },
        controller.signal,
        setProgress,
      );
      if (controller.signal.aborted) return;
      releaseUrl(source?.url);
      releaseUrl(result?.url);
      setSource({ ...image, file, url: createUrl(image.blob) });
      setResult(null);
      setPosition(50);
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "This image could not be opened.",
        );
    } finally {
      if (active.current === controller) {
        active.current = null;
        setProgress(null);
      }
    }
  }

  async function process() {
    if (!source || busy) return;
    const controller = new AbortController();
    active.current = controller;
    setProgress({ fraction: 0, label: "Preparing your image" });
    setError(null);
    setNotice(null);
    try {
      const image = await runStudioOperation(
        { type: "process", file: source.file, mode, settings },
        controller.signal,
        setProgress,
      );
      if (controller.signal.aborted) return;
      releaseUrl(result?.url);
      setResult({ ...image, url: createUrl(image.blob), settingsKey });
      setPosition(50);
      setNotice(
        "Your image is ready. Compare the result and download your PNG.",
      );
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "Processing failed. Please try again.",
        );
    } finally {
      if (active.current === controller) {
        active.current = null;
        setProgress(null);
      }
    }
  }

  function changeSetting<K extends keyof StudioSettings>(
    key: K,
    value: StudioSettings[K],
  ) {
    setSettings((current) => ({ ...current, [key]: value }));
    setNotice(null);
  }

  function compare(next: number) {
    // Paint the native range's position immediately, without waiting for the
    // surrounding settings and labels to finish their React render.
    comparison.current?.style.setProperty("--sf-compare-position", `${next}%`);
    setPosition(next);
  }

  function startComparing(event: PointerEvent<HTMLInputElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    setComparing(true);
  }

  return (
    <div className="sf-card-flat isolate grid min-w-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_350px]">
      <div className="col-span-full flex min-h-14 items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-6">
        <ol
          className="grid w-full grid-cols-3 items-center gap-1 text-[11px] sm:flex sm:w-auto sm:gap-6 sm:text-sm"
          aria-label="Editing steps"
        >
          {(["Add photo", "Adjust", "Download"] as const).map((step, index) => {
            const current = result ? 2 : source ? 1 : 0;
            return (
              <li
                key={step}
                aria-current={index === current ? "step" : undefined}
                className={cn(
                  "flex min-w-0 items-center gap-1.5 whitespace-nowrap motion-safe:transition-colors motion-safe:duration-200 sm:gap-2",
                  index === current ? "font-semibold text-ink" : "text-muted",
                )}
              >
                <span
                  className={cn(
                    "grid size-5 shrink-0 place-items-center rounded-full text-[10px] motion-safe:transition-colors motion-safe:duration-200 sm:size-6 sm:text-xs",
                    index === current
                      ? "bg-accent text-on-accent"
                      : "bg-surface-3",
                  )}
                >
                  {index + 1}
                </span>
                {step}
              </li>
            );
          })}
        </ol>
        <span className="hidden shrink-0 rounded-full bg-success-soft px-3 py-1 text-[11px] font-medium text-success sm:inline-flex">
          Private workspace
        </span>
      </div>

      <div className="min-w-0 lg:border-r lg:border-line">
        <div
          className={cn(
            "overflow-hidden transition-colors",
            dragging && "bg-accent-softer ring-2 ring-inset ring-accent",
          )}
          onDragOver={(event) => {
            event.preventDefault();
            if (!busy) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            if (!busy) void choose(event.dataTransfer.files[0]);
          }}
        >
          <input
            ref={input}
            id={`${id}-file`}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif,image/gif,image/bmp,.jpg,.jpeg,.png,.webp,.avif,.gif,.bmp"
            className="sr-only"
            tabIndex={-1}
            aria-label="Choose an image to edit"
            disabled={busy}
            onChange={(event) => {
              void choose(event.currentTarget.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
          {source ? (
            <>
              <div className="flex min-h-16 items-center justify-between gap-2 border-b border-line px-3 py-2 sm:px-5">
                <div className="min-w-0">
                  <p
                    className="truncate text-sm font-semibold text-ink"
                    title={source.file.name}
                  >
                    {source.file.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {source.width.toLocaleString()} ×{" "}
                    {source.height.toLocaleString()} ·{" "}
                    {formatBytes(source.file.size)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  className="shrink-0 px-3 text-xs sm:text-sm"
                  onClick={() => input.current?.click()}
                  disabled={busy}
                >
                  Replace image
                </Button>
              </div>
              <div
                className="relative flex h-[min(42svh,360px)] min-h-56 items-center justify-center overflow-hidden p-3 sm:h-[420px] sm:p-5 lg:h-[clamp(380px,52vh,720px)]"
                style={checkerboard}
              >
                <div
                  ref={comparison}
                  data-comparing={comparing}
                  className="group/compare relative h-full w-full focus-within:ring-2 focus-within:ring-accent"
                  style={
                    { "--sf-compare-position": `${position}%` } as CSSProperties
                  }
                >
                  <Image
                    src={result?.url ?? source.url}
                    alt={
                      result
                        ? removal
                          ? "Your image with its background removed"
                          : "Your enhanced image"
                        : "Original image preview"
                    }
                    width={source.width}
                    height={source.height}
                    unoptimized
                    className="h-full w-full object-contain"
                    onLoad={(event) => {
                      if (
                        !window.matchMedia("(prefers-reduced-motion: reduce)")
                          .matches
                      ) {
                        event.currentTarget.animate(
                          [{ opacity: 0.65 }, { opacity: 1 }],
                          { duration: 180, easing: "ease-out" },
                        );
                      }
                    }}
                  />
                  {result && (
                    <div
                      className={cn(
                        "absolute inset-0",
                        comparing
                          ? "transition-none"
                          : "motion-safe:transition-[clip-path] motion-safe:duration-150 motion-safe:ease-out",
                      )}
                      style={{
                        clipPath:
                          "inset(0 calc(100% - var(--sf-compare-position)) 0 0)",
                      }}
                    >
                      <div className="h-full w-full" style={checkerboard}>
                        <Image
                          src={source.url}
                          alt="Original image for comparison"
                          width={source.width}
                          height={source.height}
                          unoptimized
                          className="h-full w-full object-contain"
                        />
                      </div>
                    </div>
                  )}
                  {result && (
                    <div
                      aria-hidden="true"
                      className={cn(
                        "pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-md",
                        comparing
                          ? "transition-none"
                          : "motion-safe:transition-[left] motion-safe:duration-150 motion-safe:ease-out",
                      )}
                      style={{ left: "var(--sf-compare-position)" }}
                    >
                      <span className="absolute top-1/2 left-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-md motion-safe:transition-transform motion-safe:duration-150 motion-safe:group-hover/compare:scale-110 motion-safe:group-data-[comparing=true]/compare:scale-95">
                        <DoodleIcon name="compare" size={23} />
                      </span>
                    </div>
                  )}
                  {result && (
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={position}
                      onChange={(event) => compare(Number(event.target.value))}
                      onPointerDown={startComparing}
                      onPointerUp={() => setComparing(false)}
                      onPointerCancel={() => setComparing(false)}
                      onLostPointerCapture={() => setComparing(false)}
                      onBlur={() => setComparing(false)}
                      aria-label="Drag image divider to compare before and after"
                      aria-valuetext={`${position} percent original, ${100 - position} percent result`}
                      className="absolute inset-0 z-10 m-0 h-full w-full cursor-ew-resize opacity-0"
                    />
                  )}
                </div>
                {result && (
                  <>
                    <span className="absolute top-3 left-3 rounded-full bg-surface/95 px-3 py-1 text-[11px] font-semibold text-ink shadow-sm">
                      Before
                    </span>
                    <span className="absolute top-3 right-3 rounded-full bg-surface/95 px-3 py-1 text-[11px] font-semibold text-ink shadow-sm">
                      After
                    </span>
                  </>
                )}
              </div>
              {result && (
                <div className="border-t border-line px-4 py-2 sm:px-5">
                  <label
                    htmlFor={`${id}-compare`}
                    className="flex flex-wrap items-center justify-between gap-x-2 text-xs text-muted"
                  >
                    <span>Drag to compare</span>
                    <span>
                      Original {position}% / Result {100 - position}%
                    </span>
                  </label>
                  <input
                    id={`${id}-compare`}
                    type="range"
                    min={0}
                    max={100}
                    value={position}
                    onChange={(event) => compare(Number(event.target.value))}
                    onPointerDown={startComparing}
                    onPointerUp={() => setComparing(false)}
                    onPointerCancel={() => setComparing(false)}
                    onLostPointerCapture={() => setComparing(false)}
                    onBlur={() => setComparing(false)}
                    className="sf-range w-full"
                    style={{ height: 44 }}
                    aria-label="Before and after comparison"
                    aria-valuetext={`${position} percent original, ${100 - position} percent result`}
                  />
                </div>
              )}
            </>
          ) : (
            <div className="flex min-h-[270px] flex-col items-center justify-center px-4 py-7 text-center sm:min-h-[360px] sm:px-8 lg:min-h-[440px]">
              {busy ? (
                <div
                  className="mb-4 h-14 w-20 rounded-2xl bg-surface-3 motion-safe:animate-pulse"
                  aria-hidden="true"
                />
              ) : (
                <div className="mb-4 flex size-14 items-center justify-center rounded-2xl border border-accent/15 bg-accent-soft text-accent lg:size-16">
                  <DoodleIcon name="upload" size={29} />
                </div>
              )}
              <h2 className="text-lg font-semibold tracking-tight text-ink sm:text-2xl">
                {dragging ? "Drop your photo here" : "Add a photo to begin"}
              </h2>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
                {removal
                  ? "A cleaner background, in a few clicks."
                  : "Adjust the color, contrast and sharpness, then compare the result."}
              </p>
              <Button
                variant="primary"
                className="mt-5 min-h-12 px-6 text-base"
                onClick={() => input.current?.click()}
                disabled={busy}
                iconLeft={<DoodleIcon name="upload" size={19} />}
              >
                Choose an image
              </Button>
              <p className="mt-3 text-xs leading-relaxed text-muted">
                <span className="hidden sm:inline">or drop it here · </span>JPG,
                PNG, WebP, AVIF, GIF, BMP
                <br />
                Up to 40 MB / 24 MP
              </p>
            </div>
          )}
        </div>
      </div>

      <aside
        className="min-w-0 space-y-4 border-t border-line p-4 sm:p-5 lg:border-t-0 lg:p-6"
        aria-label="Image settings"
      >
        <div className="flex min-h-8 items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-ink">
            {removal ? "Background settings" : "Image adjustments"}
          </h2>
          {!removal && (
            <button
              type="button"
              className="min-h-11 min-w-11 px-2 text-sm font-medium text-muted hover:text-ink disabled:opacity-50"
              disabled={busy}
              onClick={() => {
                setSettings(DEFAULT_STUDIO_SETTINGS);
                setNotice(null);
              }}
            >
              Reset
            </button>
          )}
        </div>
        {removal ? (
          <fieldset disabled={busy} className="space-y-4">
            <legend className="sr-only">Background method</legend>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["portrait", "Portrait AI", "People & headshots"],
                  ["solid", "Simple background", "Plain backdrops"],
                ] as const
              ).map(([value, title, detail]) => (
                <label
                  key={value}
                  className={cn(
                    "group flex min-h-24 min-w-0 cursor-pointer flex-col gap-2 rounded-2xl border p-3 hover:border-accent/50 motion-safe:transition-[background-color,border-color,box-shadow,transform] motion-safe:duration-200 motion-safe:active:scale-[.98]",
                    settings.method === value
                      ? "border-accent/40 bg-accent-softer"
                      : "border-line bg-surface-2",
                  )}
                >
                  <span className="flex items-center justify-between gap-3">
                    <input
                      type="radio"
                      name={`${id}-method`}
                      value={value}
                      checked={settings.method === value}
                      onChange={() => changeSetting("method", value)}
                      className="size-4 accent-accent"
                    />
                    <DoodleIcon
                      name={value === "portrait" ? "cutout" : "layers"}
                      size={22}
                      className={
                        settings.method === value ? "text-accent" : "text-muted"
                      }
                    />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold leading-5 text-ink">
                      {title}
                    </span>
                    <span className="mt-1 block text-xs leading-4 text-muted">
                      {detail}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            {settings.method === "solid" ? (
              <StudioSlider
                id={`${id}-tolerance`}
                label="Background tolerance"
                value={settings.tolerance}
                min={5}
                max={100}
                onChange={(value) => changeSetting("tolerance", value)}
              />
            ) : (
              <p className="text-xs leading-5 text-muted">
                Best for portraits and headshots. The first use downloads about
                40 MB of AI files; your photo stays on your device.
              </p>
            )}
          </fieldset>
        ) : (
          <fieldset disabled={busy} className="space-y-3">
            <legend className="sr-only">Enhancement controls</legend>
            <StudioSlider
              id={`${id}-contrast`}
              label="Contrast"
              value={settings.contrast}
              min={-30}
              max={40}
              onChange={(value) => changeSetting("contrast", value)}
            />
            <StudioSlider
              id={`${id}-saturation`}
              label="Color"
              value={settings.saturation}
              min={-100}
              max={50}
              onChange={(value) => changeSetting("saturation", value)}
            />
            <StudioSlider
              id={`${id}-sharpness`}
              label="Sharpness"
              value={settings.sharpness}
              min={0}
              max={100}
              onChange={(value) => changeSetting("sharpness", value)}
            />
            <div>
              <label
                htmlFor={`${id}-scale`}
                className="mb-2 block text-sm font-medium text-ink-2"
              >
                Output size
              </label>
              <select
                id={`${id}-scale`}
                className="h-12 w-full min-w-0 rounded-xl border border-line bg-surface px-3 text-base text-ink"
                value={settings.scale}
                onChange={(event) =>
                  changeSetting("scale", event.target.value === "2" ? 2 : 1)
                }
              >
                <option value="1">Original resolution</option>
                <option value="2">2× smooth resize</option>
              </select>
            </div>
          </fieldset>
        )}
        <details className="group/tips border-t border-line pt-1">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium text-muted">
            Tips & limits{" "}
            <span
              aria-hidden="true"
              className="motion-safe:transition-transform motion-safe:duration-200 group-open/tips:rotate-45"
            >
              +
            </span>
          </summary>
          <div className="space-y-2 pb-2 text-xs leading-5 text-muted">
            <p>
              {removal
                ? "Use Portrait AI for people. For a product on a plain backdrop, try Simple background and adjust the tolerance. Check hair, glass and fine edges before downloading; difficult cutouts may need editing in another tool."
                : "Start with small adjustments and compare them with your original. The 2× option enlarges and smooths the image; it cannot recover missing detail. Results are limited to 24 megapixels."}
            </p>
            <p>
              Animation is saved as a still image. If a large photo is slow to
              process, try a smaller version or close other browser tabs.
            </p>
          </div>
        </details>
      </aside>

      {(progress || error || notice || stale) && (
        <div className="col-span-full space-y-2 border-t border-line px-4 py-3 sm:px-6">
          {progress && (
            <div role="status" aria-live="polite">
              <div className="mb-2 flex min-h-11 items-center justify-between gap-3">
                <p className="min-w-0 text-sm leading-5 text-ink-2">
                  {progress.label}
                </p>
                {!source && (
                  <Button
                    variant="ghost"
                    className="shrink-0 px-3"
                    onClick={() => {
                      active.current?.abort();
                      setNotice(
                        "Processing cancelled. Your original image is unchanged.",
                      );
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </div>
              <div
                role="progressbar"
                aria-label="Image processing"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress.fraction * 100)}
                className="h-1.5 overflow-hidden rounded-full bg-surface-3"
              >
                <div
                  className="h-full rounded-full bg-accent transition-[width]"
                  style={{ width: `${progress.fraction * 100}%` }}
                />
              </div>
            </div>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-xl bg-danger-soft px-3 py-2.5 text-sm leading-relaxed text-danger"
            >
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="text-sm leading-5 text-success">
              {notice}
            </p>
          )}
          {stale && (
            <p role="status" className="text-xs leading-5 text-warn">
              Settings changed. Run the tool again to update your result.
            </p>
          )}
        </div>
      )}

      <div
        className={cn(
          "fixed inset-x-3 bottom-[calc(var(--sf-mobile-nav-height,0px)+0.5rem)] z-20 col-span-full flex-col gap-2 rounded-2xl border border-line bg-surface/95 p-3 shadow-lg backdrop-blur-lg sm:flex-row sm:items-center sm:justify-between sm:px-5 md:static md:flex md:rounded-t-none md:rounded-b-[inherit] md:border-x-0 md:border-b-0 md:shadow-none",
          source ? "flex" : "hidden",
        )}
      >
        <div className="min-w-0 text-xs leading-5 text-muted">
          <p className="font-medium text-ink-2">
            {busy
              ? "Processing on your device…"
              : result
                ? `${result.width.toLocaleString()} × ${result.height.toLocaleString()} · ${formatBytes(result.blob.size)} · PNG`
                : source
                  ? "Ready when you are"
                  : "Your photo stays on your device"}
          </p>
          <p className="hidden sm:block">
            {result
              ? removal
                ? "Transparent background · Original resolution"
                : "Lossless export · No watermark"
              : source
                ? "Choose your settings, then run the tool to see the result."
                : "No signup, watermark or image uploads."}
          </p>
        </div>
        <div
          className={cn(
            "grid min-w-0 gap-2 sm:flex sm:shrink-0",
            result ? "grid-cols-2" : "grid-cols-1",
          )}
        >
          <Button
            variant={result || busy ? "secondary" : "primary"}
            className="min-h-12 min-w-0 text-sm"
            style={
              result
                ? {
                    paddingInline: "clamp(8px, 1.4vw, 20px)",
                    fontSize: "clamp(12px, 1.1vw, 14px)",
                  }
                : undefined
            }
            disabled={!source}
            iconLeft={
              result || busy ? undefined : (
                <DoodleIcon name="enhance" size={19} />
              )
            }
            onClick={() => {
              if (busy) {
                active.current?.abort();
                setNotice(
                  "Processing cancelled. Your original image is unchanged.",
                );
              } else {
                void process();
              }
            }}
          >
            {busy ? "Cancel" : removal ? "Remove background" : "Enhance image"}
          </Button>
          {result && (
            <a
              href={result.url}
              download={`${source?.file.name.replace(/\.[^.]+$/, "") ?? "image"}-${removal ? "cutout" : "enhanced"}.png`}
              className="group inline-flex min-h-12 min-w-0 items-center justify-center gap-1.5 rounded-full border border-accent-deep/20 bg-accent px-2 text-xs font-semibold text-on-accent shadow-accent hover:bg-accent-hover motion-safe:transition-[background-color,transform,box-shadow] motion-safe:duration-150 motion-safe:active:scale-[.98] sm:gap-2 sm:px-5 sm:text-sm"
            >
              <DoodleIcon name="download" size={19} />
              Download PNG
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function StudioSlider({
  id,
  label,
  value,
  min,
  max,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <label htmlFor={id} className="font-medium text-ink-2">
          {label}
        </label>
        <output
          htmlFor={id}
          className="rounded-md bg-surface-3 px-2 py-0.5 text-xs font-semibold text-ink"
        >
          {value}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="sf-range w-full"
        style={{ height: 44 }}
      />
    </div>
  );
}
