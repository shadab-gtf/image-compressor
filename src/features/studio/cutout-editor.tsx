"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { paintStroke, fillBackground } from "@/engines/editor";
import { runStudioOperation } from "@/services/studio-service";
import type { BackgroundFill, MaskStroke } from "@/types/editor";
import type { StudioImage } from "@/types/studio";

interface Props {
  file: File;
  preview: Blob;
  cutout: StudioImage;
  onApply: (image: StudioImage) => void;
}

export function CutoutEditor({ file, preview, cutout, onApply }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const buffers = useRef<{
    original: HTMLCanvasElement;
    mask: HTMLCanvasElement;
    base: HTMLCanvasElement;
    subject: HTMLCanvasElement;
  } | null>(null);
  const active = useRef<MaskStroke | null>(null);
  const controller = useRef<AbortController | null>(null);
  const [history, setHistory] = useState<MaskStroke[]>([]);
  const [future, setFuture] = useState<MaskStroke[]>([]);
  const [mode, setMode] = useState<"erase" | "restore" | "pan">("erase");
  const [size, setSize] = useState(35);
  const [opacity, setOpacity] = useState(1);
  const [hardness, setHardness] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [background, setBackground] = useState<BackgroundFill>({
    kind: "transparent",
  });
  const [message, setMessage] = useState(
    "Drag over an edge to erase or restore it. Changes stay on this device.",
  );
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const pan = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const backdrop = useRef<ImageBitmap | undefined>(undefined);
  const pendingFrame = useRef<number | null>(null);

  useEffect(() => {
    let disposed = false;
    async function prepare() {
      const images = await Promise.all([
        createImageBitmap(preview),
        createImageBitmap(cutout.blob),
      ]);
      if (disposed) {
        images.forEach((image) => image.close());
        return;
      }
      const scale = Math.min(1, 1400 / Math.max(cutout.width, cutout.height));
      const width = Math.max(1, Math.round(cutout.width * scale));
      const height = Math.max(1, Math.round(cutout.height * scale));
      const make = () => {
        const element = document.createElement("canvas");
        element.width = width;
        element.height = height;
        return element;
      };
      const original = make();
      const base = make();
      const mask = make();
      const subject = make();
      original.getContext("2d")!.drawImage(images[0], 0, 0, width, height);
      base.getContext("2d")!.drawImage(images[1], 0, 0, width, height);
      images.forEach((image) => image.close());
      buffers.current = { original, base, mask, subject };
      setReady(true);
    }
    void prepare().catch(() => {
      if (!disposed)
        setMessage("The editing preview could not open. Try a smaller image.");
    });
    return () => {
      disposed = true;
      buffers.current = null;
      controller.current?.abort();
      if (pendingFrame.current !== null)
        cancelAnimationFrame(pendingFrame.current);
    };
  }, [file, preview, cutout]);

  useEffect(() => {
    let disposed = false;
    let bitmap: ImageBitmap | undefined;
    async function render() {
      if (background.kind === "image")
        bitmap = await createImageBitmap(background.file);
      if (disposed) {
        bitmap?.close();
        return;
      }
      const data = buffers.current;
      const output = canvas.current;
      if (!data || !output) {
        bitmap?.close();
        return;
      }
      output.width = data.base.width;
      output.height = data.base.height;
      const mask = data.mask.getContext("2d")!;
      mask.clearRect(0, 0, output.width, output.height);
      mask.drawImage(data.base, 0, 0);
      for (const stroke of history)
        paintStroke(mask, stroke, output.width, output.height);
      draw(bitmap);
      backdrop.current?.close();
      backdrop.current = bitmap;
    }
    void render().catch(() =>
      setMessage("This background image could not be opened."),
    );
    return () => {
      disposed = true;
      backdrop.current?.close();
      backdrop.current = undefined;
    };
    // The renderer reads the current background and history together.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, history, background]);

  function draw(image?: ImageBitmap) {
    const data = buffers.current;
    const output = canvas.current;
    if (!data || !output) return;
    const subject = data.subject.getContext("2d")!;
    subject.clearRect(0, 0, output.width, output.height);
    subject.globalCompositeOperation = "source-over";
    subject.drawImage(data.original, 0, 0);
    subject.globalCompositeOperation = "destination-in";
    subject.drawImage(data.mask, 0, 0);
    subject.globalCompositeOperation = "source-over";
    const context = output.getContext("2d")!;
    context.clearRect(0, 0, output.width, output.height);
    // While brushing an image background, the committed preview remains below the subject.
    const backdropImage = image ?? backdrop.current;
    fillBackground(
      context,
      output.width,
      output.height,
      background.kind === "image" && !backdropImage
        ? { kind: "transparent" }
        : background,
      backdropImage,
    );
    context.drawImage(data.subject, 0, 0);
  }

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
      pressure:
        event.pointerType === "pen" ? Math.max(0.15, event.pressure) : 1,
    };
  }

  function down(event: PointerEvent<HTMLCanvasElement>) {
    if (!ready || busy) return;
    if (
      history.length >= 200 ||
      history.reduce((sum, stroke) => sum + stroke.points.length, 0) >= 95_000
    ) {
      setMessage(
        "The mask history is full. Reset the mask to start a new set of corrections.",
      );
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    if (mode === "pan") {
      if (viewport.current)
        pan.current = {
          x: event.clientX,
          y: event.clientY,
          left: viewport.current.scrollLeft,
          top: viewport.current.scrollTop,
        };
      return;
    }
    active.current = {
      mode,
      size: size / cutout.width,
      opacity,
      hardness,
      points: [point(event)],
    };
    previewStroke();
  }

  function previewStroke() {
    if (pendingFrame.current !== null) return;
    pendingFrame.current = requestAnimationFrame(() => {
      pendingFrame.current = null;
      const data = buffers.current;
      if (!data) return;
      const mask = data.mask.getContext("2d")!;
      mask.clearRect(0, 0, data.mask.width, data.mask.height);
      mask.drawImage(data.base, 0, 0);
      for (const stroke of history)
        paintStroke(mask, stroke, data.mask.width, data.mask.height);
      if (active.current)
        paintStroke(mask, active.current, data.mask.width, data.mask.height);
      draw();
    });
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (pan.current && viewport.current) {
      viewport.current.scrollLeft =
        pan.current.left - (event.clientX - pan.current.x);
      viewport.current.scrollTop =
        pan.current.top - (event.clientY - pan.current.y);
      return;
    }
    const stroke = active.current;
    const data = buffers.current;
    if (!stroke || !data || stroke.points.length >= 5000) return;
    const next = point(event);
    const previous = stroke.points[stroke.points.length - 1];
    if (!previous) return;
    stroke.points.push(next);
    previewStroke();
  }

  function finish() {
    if (pendingFrame.current !== null) {
      cancelAnimationFrame(pendingFrame.current);
      pendingFrame.current = null;
    }
    pan.current = null;
    if (active.current) {
      const stroke = active.current;
      active.current = null;
      setHistory((items) => [...items, stroke]);
      setFuture([]);
      setMessage(
        "Preview updated. Apply edits to update your downloadable PNG.",
      );
    }
  }

  function undo() {
    const stroke = history[history.length - 1];
    if (!stroke || busy) return;
    setFuture((items) => [stroke, ...items]);
    setHistory((items) => items.slice(0, -1));
  }
  function redo() {
    const stroke = future[0];
    if (!stroke || busy) return;
    setHistory((items) => [...items, stroke]);
    setFuture((items) => items.slice(1));
  }

  async function apply() {
    const operation = new AbortController();
    controller.current = operation;
    setBusy(true);
    try {
      const image = await runStudioOperation(
        {
          type: "edit-cutout",
          file,
          cutout: cutout.blob,
          strokes: history,
          background,
        },
        operation.signal,
        (progress) => setMessage(progress.label),
      );
      if (!operation.signal.aborted) {
        onApply(image);
        setMessage(
          "Edits applied. Download PNG above to save this exact result.",
        );
      }
    } catch (cause) {
      if (!operation.signal.aborted)
        setMessage(
          cause instanceof Error
            ? cause.message
            : "Edits could not be applied.",
        );
    } finally {
      if (controller.current === operation) {
        controller.current = null;
        setBusy(false);
      }
    }
  }

  async function chooseBackground(file: File | undefined) {
    if (!file) return;
    const operation = new AbortController();
    controller.current?.abort();
    controller.current = operation;
    setBusy(true);
    try {
      await runStudioOperation(
        { type: "inspect", file },
        operation.signal,
        () => {},
      );
      if (!operation.signal.aborted) setBackground({ kind: "image", file });
    } catch (cause) {
      if (!operation.signal.aborted)
        setMessage(
          cause instanceof Error
            ? cause.message
            : "Choose a supported background image.",
        );
    } finally {
      if (controller.current === operation) {
        controller.current = null;
        setBusy(false);
      }
    }
  }

  return (
    <section
      className="mt-6 rounded-3xl border border-[var(--sf-border)] bg-[var(--sf-surface)] p-5"
      aria-label="Cutout editor"
      onKeyDown={(event) => {
        if (
          (event.ctrlKey || event.metaKey) &&
          event.key.toLowerCase() === "z"
        ) {
          event.preventDefault();
          if (event.shiftKey) redo();
          else undo();
        }
      }}
    >
      <h2 className="text-xl font-semibold">Refine your cutout</h2>
      <p className="mt-1 text-sm text-[var(--sf-muted)]">
        Erase missed background, restore details, or give your subject a new
        backdrop. Brush size is measured in original-image pixels.
      </p>
      <div className="my-4 flex flex-wrap items-center gap-3">
        {(["erase", "restore", "pan"] as const).map((tool) => (
          <button
            key={tool}
            type="button"
            aria-pressed={mode === tool}
            onClick={() => setMode(tool)}
            className="rounded-full border px-4 py-2 capitalize aria-pressed:bg-[var(--sf-accent)] aria-pressed:text-white"
          >
            {tool}
          </button>
        ))}
        <button type="button" disabled={!history.length || busy} onClick={undo}>
          Undo
        </button>
        <button type="button" disabled={!future.length || busy} onClick={redo}>
          Redo
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setHistory([]);
            setFuture([]);
          }}
        >
          Reset mask
        </button>
        <label className="flex items-center gap-2 text-sm">
          Brush {size}px{" "}
          <input
            aria-label="Brush size"
            type="range"
            min="1"
            max="200"
            value={size}
            onChange={(event) => setSize(Number(event.target.value))}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          Opacity {Math.round(opacity * 100)}%{" "}
          <input
            aria-label="Brush opacity"
            type="range"
            min="0.05"
            max="1"
            step="0.05"
            value={opacity}
            onChange={(event) => setOpacity(Number(event.target.value))}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          Hardness {Math.round(hardness * 100)}%{" "}
          <input
            aria-label="Brush hardness"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={hardness}
            onChange={(event) => setHardness(Number(event.target.value))}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          Zoom {zoom}×{" "}
          <input
            aria-label="Editing zoom"
            type="range"
            min="1"
            max="4"
            step="0.25"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
        </label>
      </div>
      <div
        ref={viewport}
        className="max-h-[560px] overflow-auto rounded-2xl bg-[var(--sf-surface-3)] p-4"
        style={{
          backgroundImage:
            "conic-gradient(#8882 25%, transparent 0 50%, #8882 0 75%, transparent 0)",
          backgroundSize: "20px 20px",
        }}
      >
        <canvas
          ref={canvas}
          tabIndex={0}
          aria-label="Cutout mask. Select erase or restore and drag. Use Control or Command Z to undo."
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={finish}
          onPointerCancel={finish}
          className="block touch-none"
          style={{
            width: `${zoom * 100}%`,
            maxWidth: `${(zoom * 500 * cutout.width) / cutout.height}px`,
            height: "auto",
            cursor: mode === "pan" ? "grab" : "crosshair",
          }}
        />
      </div>
      <fieldset
        disabled={busy}
        className="my-4 flex flex-wrap items-center gap-4"
      >
        <legend className="mb-2 font-medium">Background</legend>
        <select
          aria-label="Background style"
          className="rounded-xl border bg-transparent p-2"
          value={background.kind}
          onChange={(event) => {
            const kind = event.target.value;
            if (kind === "solid") setBackground({ kind, color: "#ffffff" });
            else if (kind === "gradient")
              setBackground({
                kind,
                color: "#fff0df",
                endColor: "#e0e8ff",
                angle: 45,
              });
            else setBackground({ kind: "transparent" });
          }}
        >
          <option value="transparent">Transparent PNG</option>
          <option value="solid">Solid colour</option>
          <option value="gradient">Gradient</option>
          {background.kind === "image" && (
            <option value="image">Uploaded background</option>
          )}
        </select>
        {(background.kind === "solid" || background.kind === "gradient") && (
          <label>
            Colour{" "}
            <input
              type="color"
              value={background.color}
              onChange={(event) =>
                setBackground({ ...background, color: event.target.value })
              }
            />
          </label>
        )}
        {background.kind === "gradient" && (
          <>
            <label>
              End colour{" "}
              <input
                type="color"
                value={background.endColor}
                onChange={(event) =>
                  setBackground({ ...background, endColor: event.target.value })
                }
              />
            </label>
            <label>
              Angle{" "}
              <input
                aria-label="Gradient angle"
                type="range"
                min="0"
                max="360"
                value={background.angle}
                onChange={(event) =>
                  setBackground({
                    ...background,
                    angle: Number(event.target.value),
                  })
                }
              />
            </label>
          </>
        )}
        <label className="cursor-pointer rounded-full border px-4 py-2">
          Upload background
          <input
            className="sr-only"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif,image/gif,image/bmp"
            onChange={(event) => {
              void chooseBackground(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
      </fieldset>
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          disabled={!ready || busy}
          onClick={() => void apply()}
          className="rounded-full bg-[var(--sf-accent)] px-5 py-3 text-white disabled:opacity-50"
        >
          {busy ? "Applying edits…" : "Apply edits"}
        </button>
        <p role="status" className="text-sm text-[var(--sf-muted)]">
          {message}
        </p>
      </div>
    </section>
  );
}
