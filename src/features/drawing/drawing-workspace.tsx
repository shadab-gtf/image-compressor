"use client";

import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  DrawingObjectView,
  DrawingSymbolView,
} from "@/components/ui/drawing-object";
import {
  DRAWING_STORAGE_KEY,
  drawingHistory,
  newDrawing,
  objectStrokes,
  parseDrawing,
  pathObject,
  pointBounds,
  rankDrawingSymbols,
  textBox,
} from "@/engines/drawing";
import { exportDrawing } from "@/services/drawing-export";
import type {
  DrawingDocument,
  DrawingObject,
  DrawingSymbol,
  DrawPoint,
  DrawTool,
} from "@/types/drawing";

const tools: { id: DrawTool; label: string; mark: string; shortcut: string }[] =
  [
    { id: "smart", label: "Smart sketch", mark: "✧", shortcut: "A" },
    { id: "pen", label: "Freehand", mark: "✎", shortcut: "D" },
    { id: "select", label: "Select & move", mark: "↖", shortcut: "V" },
    { id: "text", label: "Text", mark: "T", shortcut: "T" },
    { id: "fill", label: "Fill", mark: "◕", shortcut: "F" },
    { id: "rectangle", label: "Rectangle", mark: "□", shortcut: "R" },
    { id: "ellipse", label: "Ellipse", mark: "○", shortcut: "O" },
    { id: "triangle", label: "Triangle", mark: "△", shortcut: "" },
    { id: "line", label: "Line", mark: "╱", shortcut: "L" },
    { id: "eraser", label: "Erase object", mark: "⌫", shortcut: "E" },
    { id: "pan", label: "Pan", mark: "✥", shortcut: "H" },
  ];
const palette = [
  "#202124",
  "#ffffff",
  "#c74316",
  "#f59e0b",
  "#facc15",
  "#16a34a",
  "#0891b2",
  "#2563eb",
  "#7c3aed",
  "#db2777",
];
const control =
  "min-h-11 rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40";
type Gesture = {
  mode: "draw" | "move" | "resize" | "pan";
  start: DrawPoint;
  points: DrawPoint[];
  base?: DrawingObject;
  pointer: number;
  scrollX?: number;
  scrollY?: number;
};

function loadSaved(): DrawingDocument {
  try {
    const saved = localStorage.getItem(DRAWING_STORAGE_KEY);
    if (saved && saved.length <= 3_000_000)
      return parseDrawing(JSON.parse(saved));
  } catch {
    /* Storage is optional. */
  }
  return newDrawing();
}
export function DrawingWorkspace({
  symbols,
}: {
  symbols: readonly DrawingSymbol[];
}) {
  const [history, dispatch] = useReducer(drawingHistory, undefined, () => ({
    past: [],
    present: loadSaved(),
    future: [],
  }));
  const document = history.present;
  const [tool, setTool] = useState<DrawTool>("smart");
  const [color, setColor] = useState("#202124"),
    [width, setWidth] = useState(4);
  const [text, setText] = useState("Hello, world!"),
    [fontSize, setFontSize] = useState(36),
    [bold, setBold] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DrawingObject | null>(null);
  const [smartIds, setSmartIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [zoom, setZoom] = useState(1);
  const [message, setMessage] = useState(
    "Draw something. Try a house, a heart or a star.",
  );
  const [saveStatus, setSaveStatus] = useState("Saving locally…");
  const [exporting, setExporting] = useState(false),
    [help, setHelp] = useState(false);
  const gesture = useRef<Gesture | null>(null),
    liveDraft = useRef<DrawingObject | null>(null);
  const root = useRef<HTMLDivElement>(null),
    viewport = useRef<HTMLDivElement>(null),
    projectInput = useRef<HTMLInputElement>(null);
  const pointers = useRef(new Map<number, DrawPoint>()),
    pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const selected = document.objects.find((object) => object.id === selectedId);
  const smartObjects = useMemo(
    () => document.objects.filter((object) => smartIds.includes(object.id)),
    [document.objects, smartIds],
  );
  const suggestions = useMemo(
    () => rankDrawingSymbols(smartObjects.flatMap(objectStrokes), symbols),
    [smartObjects, symbols],
  );
  const displayedSymbols = search.trim()
    ? symbols
        .filter((symbol) =>
          `${symbol.label} ${symbol.category}`
            .toLowerCase()
            .includes(search.toLowerCase()),
        )
        .slice(0, 48)
    : suggestions.length
      ? suggestions
      : symbols.slice(0, 12);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const json = JSON.stringify(document);
        if (json.length > 3_000_000) throw new Error();
        localStorage.setItem(DRAWING_STORAGE_KEY, json);
        setSaveStatus("Saved on this device");
      } catch {
        setSaveStatus("Autosave unavailable — download your project");
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [document]);

  function commit(next: DrawingDocument) {
    try {
      parseDrawing(next);
      dispatch({ type: "commit", document: next });
    } catch {
      setMessage(
        "This drawing is too large. Export your project and start a new canvas.",
      );
    }
  }
  function modifySelected(change: Partial<DrawingObject>) {
    if (
      selected?.kind === "text" &&
      (change.text !== undefined || change.fontSize !== undefined)
    ) {
      const before = textBox(selected),
        after = textBox({ ...selected, ...change });
      change = {
        ...change,
        width: Math.min(10000, (selected.width / before.width) * after.width),
        height: Math.min(
          10000,
          (selected.height / before.height) * after.height,
        ),
      };
    }
    if (selected)
      commit({
        ...document,
        objects: document.objects.map((object) =>
          object.id === selected.id ? { ...object, ...change } : object,
        ),
      });
  }
  function deleteSelected() {
    if (selectedId) {
      commit({
        ...document,
        objects: document.objects.filter((object) => object.id !== selectedId),
      });
      setSelectedId(null);
    }
  }
  function duplicateSelected() {
    if (!selected) return;
    const copy = {
      ...selected,
      id: crypto.randomUUID(),
      x: selected.x + 20,
      y: selected.y + 20,
    };
    commit({ ...document, objects: [...document.objects, copy] });
    setSelectedId(copy.id);
  }
  function chooseTool(next: DrawTool) {
    setTool(next);
    setDraft(null);
    liveDraft.current = null;
    gesture.current = null;
    if (next !== "smart") setSmartIds([]);
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        !root.current?.contains(window.document.activeElement) ||
        (event.target instanceof HTMLElement &&
          event.target.closest("input,textarea,select,[contenteditable=true]"))
      )
        return;
      const key = event.key.toLowerCase(),
        command = event.ctrlKey || event.metaKey;
      if (command && key === "z") {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? "redo" : "undo" });
      } else if (command && key === "y") {
        event.preventDefault();
        dispatch({ type: "redo" });
      } else if (command && key === "d") {
        event.preventDefault();
        duplicateSelected();
      } else if (key === "delete" || key === "backspace") {
        event.preventDefault();
        deleteSelected();
      } else if (key === "escape") {
        setSelectedId(null);
        setSmartIds([]);
        setDraft(null);
        liveDraft.current = null;
        gesture.current = null;
      } else if (
        selected &&
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
      ) {
        event.preventDefault();
        const amount = event.shiftKey ? 10 : 1;
        modifySelected({
          x:
            selected.x +
            (event.key === "ArrowRight"
              ? amount
              : event.key === "ArrowLeft"
                ? -amount
                : 0),
          y:
            selected.y +
            (event.key === "ArrowDown"
              ? amount
              : event.key === "ArrowUp"
                ? -amount
                : 0),
        });
      } else if (!command) {
        const next = tools.find((item) => item.shortcut.toLowerCase() === key);
        if (next) {
          event.preventDefault();
          chooseTool(next.id);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function coordinate(event: ReactPointerEvent<SVGSVGElement>): DrawPoint {
    const rectangle = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(
          document.width,
          ((event.clientX - rectangle.left) / rectangle.width) * document.width,
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          document.height,
          ((event.clientY - rectangle.top) / rectangle.height) *
            document.height,
        ),
      ),
    };
  }
  function updateDraft(next: DrawingObject | null) {
    liveDraft.current = next;
    setDraft(next);
  }
  function pointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(a!.x - b!.x, a!.y - b!.y), zoom };
      gesture.current = null;
      updateDraft(null);
      return;
    }
    const point = coordinate(event);
    const target = event.target instanceof Element ? event.target : null;
    const objectId = target
      ?.closest("[data-object-id]")
      ?.getAttribute("data-object-id");
    const object = document.objects.find((item) => item.id === objectId);
    if (tool === "pan") {
      gesture.current = {
        mode: "pan",
        start: { x: event.clientX, y: event.clientY },
        points: [],
        pointer: event.pointerId,
        scrollX: viewport.current?.scrollLeft ?? 0,
        scrollY: viewport.current?.scrollTop ?? 0,
      };
      return;
    }
    if (tool === "fill") {
      if (object)
        commit({
          ...document,
          objects: document.objects.map((item) =>
            item.id === object.id
              ? {
                  ...item,
                  fill: color,
                  ...(item.kind === "text" ? { color } : {}),
                }
              : item,
          ),
        });
      else commit({ ...document, background: color });
      return;
    }
    if (tool === "eraser") {
      if (object)
        commit({
          ...document,
          objects: document.objects.filter((item) => item.id !== object.id),
        });
      return;
    }
    if (tool === "select") {
      const resizing = target?.getAttribute("data-resize") === "true";
      const base = resizing ? selected : object;
      setSelectedId(base?.id ?? null);
      if (base)
        gesture.current = {
          mode: resizing ? "resize" : "move",
          start: point,
          points: [],
          base,
          pointer: event.pointerId,
        };
      return;
    }
    if (tool === "text") {
      if (!text.trim()) {
        setMessage("Enter your text in the text box first.");
        return;
      }
      const lines = text.split("\n");
      const object: DrawingObject = {
        id: crypto.randomUUID(),
        kind: "text",
        label: text.slice(0, 30),
        x: point.x,
        y: point.y,
        width: Math.min(
          10000,
          Math.max(...lines.map((line) => line.length), 1) * fontSize * 0.65,
        ),
        height: fontSize * lines.length * 1.25,
        rotation: 0,
        color,
        fill: "none",
        strokeWidth: width,
        strokes: [],
        text,
        fontSize,
        bold,
      };
      commit({ ...document, objects: [...document.objects, object] });
      setSelectedId(object.id);
      chooseTool("select");
      return;
    }
    gesture.current = {
      mode: "draw",
      start: point,
      points: [point],
      pointer: event.pointerId,
    };
    updateDraft(
      pathObject(
        [[point, { x: point.x + 0.1, y: point.y + 0.1 }]],
        color,
        width,
        tool === "smart" ? "Smart sketch" : tool,
      ),
    );
    setSelectedId(null);
  }
  function pointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      setZoom(
        Math.max(
          0.5,
          Math.min(
            3,
            (pinch.current.zoom * Math.hypot(a!.x - b!.x, a!.y - b!.y)) /
              Math.max(1, pinch.current.distance),
          ),
        ),
      );
      return;
    }
    const action = gesture.current;
    if (!action || action.pointer !== event.pointerId) return;
    if (action.mode === "pan") {
      if (viewport.current) {
        viewport.current.scrollLeft =
          action.scrollX! + action.start.x - event.clientX;
        viewport.current.scrollTop =
          action.scrollY! + action.start.y - event.clientY;
      }
      return;
    }
    const point = coordinate(event);
    if (action.base) {
      updateDraft(
        action.mode === "resize"
          ? {
              ...action.base,
              width: Math.max(
                10,
                Math.min(10000, action.base.width + point.x - action.start.x),
              ),
              height: Math.max(
                10,
                Math.min(10000, action.base.height + point.y - action.start.y),
              ),
            }
          : {
              ...action.base,
              x: action.base.x + point.x - action.start.x,
              y: action.base.y + point.y - action.start.y,
            },
      );
      return;
    }
    let next: DrawingObject;
    if (tool === "smart" || tool === "pen") {
      if (action.points.length >= 5000) return;
      const last = action.points[action.points.length - 1]!;
      if (Math.hypot(point.x - last.x, point.y - last.y) < 1) return;
      action.points.push(point);
      next = pathObject(
        [action.points],
        color,
        width,
        tool === "smart" ? "Smart sketch" : "Freehand",
      );
    } else {
      let x = Math.min(point.x, action.start.x),
        y = Math.min(point.y, action.start.y),
        w = Math.max(1, Math.abs(point.x - action.start.x)),
        h = Math.max(1, Math.abs(point.y - action.start.y));
      if (event.shiftKey) {
        w = h = Math.max(w, h);
        x = point.x < action.start.x ? action.start.x - w : action.start.x;
        y = point.y < action.start.y ? action.start.y - h : action.start.y;
      }
      const points =
        tool === "line"
          ? [action.start, point]
          : tool === "ellipse"
            ? Array.from({ length: 65 }, (_, i) => ({
                x: x + w / 2 + (w / 2) * Math.cos((i / 64) * Math.PI * 2),
                y: y + h / 2 + (h / 2) * Math.sin((i / 64) * Math.PI * 2),
              }))
            : tool === "triangle"
              ? [
                  { x: x + w / 2, y },
                  { x: x + w, y: y + h },
                  { x, y: y + h },
                  { x: x + w / 2, y },
                ]
              : [
                  { x, y },
                  { x: x + w, y },
                  { x: x + w, y: y + h },
                  { x, y: y + h },
                  { x, y },
                ];
      next = pathObject([points], color, width, tool);
    }
    next.id = liveDraft.current?.id ?? next.id;
    updateDraft(next);
  }
  function pointerEnd(
    event: ReactPointerEvent<SVGSVGElement>,
    cancelled = false,
  ) {
    pointers.current.delete(event.pointerId);
    if (pinch.current) {
      if (!pointers.current.size) pinch.current = null;
      gesture.current = null;
      updateDraft(null);
      return;
    }
    const action = gesture.current,
      object = liveDraft.current;
    if (!action || action.pointer !== event.pointerId) return;
    gesture.current = null;
    updateDraft(null);
    if (cancelled || !object || action.mode === "pan") return;
    if (action.base)
      commit({
        ...document,
        objects: document.objects.map((item) =>
          item.id === action.base!.id ? object : item,
        ),
      });
    else {
      commit({ ...document, objects: [...document.objects, object] });
      if (tool === "smart") setSmartIds((current) => [...current, object.id]);
      else setSelectedId(object.id);
    }
  }
  function insertSymbol(symbol: DrawingSymbol) {
    const bounds = smartObjects.length
      ? pointBounds(smartObjects.flatMap(objectStrokes))
      : {
          x: document.width / 2 - 80,
          y: document.height / 2 - 80,
          width: 160,
          height: 160,
        };
    const object = pathObject(symbol.strokes, color, width, symbol.label);
    object.x = bounds.x;
    object.y = bounds.y;
    object.width = Math.max(30, bounds.width);
    object.height = Math.max(30, bounds.height);
    commit({
      ...document,
      objects: [
        ...document.objects.filter((item) => !smartIds.includes(item.id)),
        object,
      ],
    });
    setSelectedId(object.id);
    setSmartIds([]);
    setTool("select");
    setMessage(
      `${symbol.label} added. Drag to move, or use its size and rotation controls.`,
    );
  }
  async function download(format: "png" | "svg" | "project", share = false) {
    setExporting(true);
    try {
      await exportDrawing(document, format, share);
      setMessage(
        share
          ? "Share opened, or your drawing downloaded if sharing is unavailable."
          : "Your drawing is ready to save.",
      );
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        setMessage(
          error instanceof Error ? error.message : "Export failed. Try again.",
        );
    } finally {
      setExporting(false);
    }
  }
  async function openProject(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 3_000_000)
        throw new Error("Choose a ShrinkFox project under 3 MB.");
      const next = parseDrawing(JSON.parse(await file.text()));
      commit(next);
      setSelectedId(null);
      setSmartIds([]);
      setMessage("Project opened. Undo returns to your previous drawing.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not open this project.",
      );
    }
  }
  const replacingObject =
    draft && document.objects.some((object) => object.id === draft.id);
  const visibleObjects =
    draft && replacingObject
      ? document.objects.map((object) =>
          object.id === draft.id ? draft : object,
        )
      : document.objects;
  const selection = draft?.id === selectedId ? draft : selected;
  return (
    <div
      ref={root}
      className="sf-drawing-workspace overflow-hidden rounded-3xl border border-line bg-surface shadow-sm"
      aria-label="Smart Draw workspace"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="grid size-10 place-items-center rounded-xl bg-accent-soft text-xl text-accent"
            aria-hidden="true"
          >
            ✧
          </span>
          <div className="min-w-0">
            <input
              aria-label="Drawing name"
              maxLength={100}
              value={document.name}
              onChange={(event) =>
                commit({ ...document, name: event.target.value })
              }
              className="w-full max-w-52 bg-transparent text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
            <p className="mt-0.5 text-[11px] text-muted">{saveStatus}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className={control}
            onClick={() => {
              commit(newDrawing());
              setSmartIds([]);
              setSelectedId(null);
              setMessage("New canvas. Undo restores your previous drawing.");
            }}
          >
            New
          </button>
          <button
            className={control}
            onClick={() => projectInput.current?.click()}
          >
            Open project
          </button>
          <button
            className={control}
            disabled={exporting}
            onClick={() => void download("project")}
          >
            Save project
          </button>
          <button
            className={`${control} border-accent bg-accent! text-on-accent!`}
            disabled={exporting}
            onClick={() => void download("png")}
          >
            {exporting ? "Preparing…" : "Download PNG"}
          </button>
          <button
            className={control}
            disabled={exporting}
            onClick={() => void download("svg")}
          >
            SVG
          </button>
          <button
            className={control}
            disabled={exporting}
            onClick={() => void download("png", true)}
          >
            Share
          </button>
        </div>
        <input
          ref={projectInput}
          type="file"
          accept=".json,application/json"
          className="hidden"
          aria-label="Open drawing project"
          onChange={(event) => {
            void openProject(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </header>
      <section
        className="border-b border-line bg-surface-2 px-4 py-3"
        aria-label="Drawing suggestions"
      >
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-medium text-muted">
            {suggestions.length && !search
              ? "Looks like… choose a clean drawing"
              : "Sketch it, or choose a drawing"}{" "}
            <span className="ml-2 text-accent">{symbols.length} symbols</span>
          </div>
          <div className="flex gap-2">
            <input
              className={`${control} min-h-9! w-40`}
              aria-label="Search drawings"
              placeholder="Search drawings"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {smartIds.length > 0 && (
              <button
                className={`${control} min-h-9!`}
                onClick={() => {
                  setSmartIds([]);
                  setMessage(
                    "Sketch kept. Draw a new object to get fresh suggestions.",
                  );
                }}
              >
                Keep sketch
              </button>
            )}
          </div>
        </div>
        <div className="flex min-h-20 gap-2 overflow-x-auto pb-1">
          {displayedSymbols.map((symbol) => (
            <button
              key={symbol.id}
              onClick={() => insertSymbol(symbol)}
              title={symbol.label}
              aria-label={`Use ${symbol.label} drawing`}
              className="flex min-w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-line bg-surface p-2 text-ink hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
            >
              <DrawingSymbolView symbol={symbol} />
              <span className="text-[10px]">{symbol.label}</span>
            </button>
          ))}
          {!displayedSymbols.length && (
            <p className="py-5 text-sm text-muted">
              No match. Try a different word, or draw freely.
            </p>
          )}
        </div>
      </section>
      <div className="flex flex-col lg:flex-row">
        <div
          role="toolbar"
          aria-label="Drawing tools"
          className="flex gap-1 overflow-x-auto border-b border-line p-2 lg:w-[76px] lg:shrink-0 lg:flex-col lg:border-r lg:border-b-0"
        >
          {tools.map((item) => (
            <button
              key={item.id}
              aria-label={item.label}
              aria-pressed={tool === item.id}
              title={`${item.label}${item.shortcut ? ` (${item.shortcut})` : ""}`}
              onClick={() => chooseTool(item.id)}
              className={`flex min-h-12 min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl text-ink focus-visible:outline-2 focus-visible:outline-accent ${tool === item.id ? "bg-accent-soft text-accent!" : "hover:bg-surface-2"}`}
            >
              <span aria-hidden="true" className="text-xl leading-5">
                {item.mark}
              </span>
              <span className="text-[9px] leading-3">
                {item.label.split(" ")[0]}
              </span>
            </button>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
            <div className="flex flex-wrap gap-1.5" aria-label="Color palette">
              {palette.map((value) => (
                <button
                  key={value}
                  aria-label={`Color ${value}`}
                  aria-pressed={color === value}
                  onClick={() => {
                    setColor(value);
                    modifySelected({ color: value });
                  }}
                  className={`size-7 rounded-full border ${color === value ? "ring-2 ring-accent ring-offset-2 ring-offset-surface" : "border-line"}`}
                  style={{ background: value }}
                />
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-muted">
              Custom
              <input
                type="color"
                aria-label="Custom drawing color"
                value={color}
                onChange={(event) => {
                  setColor(event.target.value);
                  modifySelected({ color: event.target.value });
                }}
                className="size-8"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-muted">
              Stroke
              <input
                type="range"
                aria-label="Stroke width"
                min={1}
                max={24}
                value={width}
                onChange={(event) => {
                  setWidth(Number(event.target.value));
                  modifySelected({ strokeWidth: Number(event.target.value) });
                }}
                className="w-20 accent-accent"
              />
              <span className="w-4">{width}</span>
            </label>
          </div>
          {tool === "text" && (
            <div className="flex flex-wrap gap-3 border-b border-line p-3">
              <textarea
                aria-label="Text to place"
                maxLength={2000}
                value={text}
                onChange={(event) => setText(event.target.value)}
                className={`${control} min-h-12 w-64 py-2`}
              />
              <label className="text-xs">
                Font size
                <input
                  aria-label="New text font size"
                  className={`${control} ml-2 w-20`}
                  type="number"
                  min={8}
                  max={200}
                  value={fontSize}
                  onChange={(event) =>
                    setFontSize(
                      Math.max(8, Math.min(200, Number(event.target.value))),
                    )
                  }
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={bold}
                  onChange={(event) => setBold(event.target.checked)}
                />
                Bold
              </label>
              <p className="self-center text-xs text-muted">
                Tap the canvas to place your text.
              </p>
            </div>
          )}
          <div
            ref={viewport}
            className="max-h-[650px] min-h-[320px] overflow-auto bg-surface-3 p-4 sm:p-6"
            style={{
              backgroundImage:
                "radial-gradient(var(--sf-border-strong) 1px, transparent 1px)",
              backgroundSize: "20px 20px",
            }}
          >
            <div
              style={{ width: `${zoom * 100}%` }}
              className="mx-auto shadow-sm"
            >
              <svg
                aria-label="Drawing canvas"
                role="img"
                tabIndex={0}
                viewBox={`0 0 ${document.width} ${document.height}`}
                width={document.width}
                height={document.height}
                className="block h-auto w-full outline-none focus-visible:ring-2 focus-visible:ring-accent"
                style={{
                  touchAction: "none",
                  background:
                    document.background === "none"
                      ? "repeating-conic-gradient(#eee 0 25%, white 0 50%) 0 / 20px 20px"
                      : document.background,
                  cursor:
                    tool === "pan"
                      ? "grab"
                      : tool === "select"
                        ? "default"
                        : "crosshair",
                }}
                onPointerDown={pointerDown}
                onPointerMove={pointerMove}
                onPointerUp={(event) => pointerEnd(event)}
                onPointerCancel={(event) => pointerEnd(event, true)}
              >
                <title>
                  Drawing canvas. Use the tools, symbol library, or touch to
                  draw. Select objects in the Layers list for keyboard editing.
                </title>
                {visibleObjects.map((object) => (
                  <DrawingObjectView
                    key={object.id}
                    object={object}
                    hitArea={["select", "fill", "eraser"].includes(tool)}
                  />
                ))}
                {draft && !replacingObject && (
                  <DrawingObjectView object={draft} />
                )}
                {selection && tool === "select" && (
                  <g
                    transform={`translate(${selection.x} ${selection.y}) rotate(${selection.rotation} ${selection.width / 2} ${selection.height / 2})`}
                  >
                    <rect
                      x={-6}
                      y={-6}
                      width={selection.width + 12}
                      height={selection.height + 12}
                      fill="none"
                      stroke="#c74316"
                      strokeWidth={1.5}
                      strokeDasharray="6 4"
                      pointerEvents="none"
                    />
                    {selection.rotation === 0 && (
                      <rect
                        data-resize="true"
                        aria-hidden="true"
                        x={selection.width - 8}
                        y={selection.height - 8}
                        width={16}
                        height={16}
                        fill="white"
                        stroke="#c74316"
                        strokeWidth={2}
                        style={{ cursor: "nwse-resize" }}
                      />
                    )}
                  </g>
                )}
              </svg>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-3">
            <div className="flex gap-2">
              <button
                className={control}
                disabled={!history.past.length}
                onClick={() => {
                  dispatch({ type: "undo" });
                  setSelectedId(null);
                }}
              >
                Undo
              </button>
              <button
                className={control}
                disabled={!history.future.length}
                onClick={() => {
                  dispatch({ type: "redo" });
                  setSelectedId(null);
                }}
              >
                Redo
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                className={control}
                aria-label="Zoom out"
                onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
              >
                −
              </button>
              <button
                className={control}
                aria-label="Fit canvas"
                onClick={() => setZoom(1)}
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                className={control}
                aria-label="Zoom in"
                onClick={() => setZoom(Math.min(3, zoom + 0.25))}
              >
                +
              </button>
              <button
                className={control}
                onClick={() => {
                  if (window.document.fullscreenElement)
                    void window.document.exitFullscreen();
                  else if (root.current?.requestFullscreen)
                    void root.current
                      .requestFullscreen()
                      .catch(() =>
                        setMessage(
                          "Fullscreen is unavailable in this browser.",
                        ),
                      );
                  else setMessage("Fullscreen is unavailable in this browser. Use the zoom controls to enlarge your canvas.");
                }}
              >
                Fullscreen
              </button>
            </div>
          </div>
        </div>
        <aside
          aria-label="Canvas and object settings"
          className="space-y-5 border-t border-line p-4 lg:w-56 lg:shrink-0 lg:border-t-0 lg:border-l"
        >
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
              Canvas
            </h3>
            <label className="mt-3 block text-xs text-muted">
              Size
              <select
                aria-label="Canvas size"
                className={`${control} mt-1 w-full`}
                value={`${document.width}x${document.height}`}
                onChange={(event) => {
                  const [w, h] = event.target.value.split("x").map(Number);
                  commit({ ...document, width: w!, height: h! });
                }}
              >
                <option value="1200x800">Landscape · 1200 × 800</option>
                <option value="1000x1000">Square · 1000 × 1000</option>
                <option value="800x1200">Portrait · 800 × 1200</option>
                <option value="1920x1080">HD · 1920 × 1080</option>
                {!["1200x800", "1000x1000", "800x1200", "1920x1080"].includes(
                  `${document.width}x${document.height}`,
                ) && (
                  <option value={`${document.width}x${document.height}`}>
                    Custom · {document.width} × {document.height}
                  </option>
                )}
              </select>
            </label>
            <div className="mt-3 flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs">
                Background
                <input
                  aria-label="Canvas background"
                  type="color"
                  value={
                    document.background === "none"
                      ? "#ffffff"
                      : document.background
                  }
                  onChange={(event) =>
                    commit({ ...document, background: event.target.value })
                  }
                />
              </label>
            </div>
            <label className="mt-3 flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={document.background === "none"}
                onChange={(event) =>
                  commit({
                    ...document,
                    background: event.target.checked ? "none" : "#ffffff",
                  })
                }
              />
              Transparent background
            </label>
          </div>
          {selected && (
            <div className="space-y-3 border-t border-line pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                Selected: {selected.label.slice(0, 20)}
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {(["width", "height", "rotation"] as const).map((key) => (
                  <label key={key} className="text-xs capitalize text-muted">
                    {key}
                    <input
                      aria-label={`Object ${key}`}
                      type="number"
                      className={`${control} mt-1 w-full px-2!`}
                      min={key === "rotation" ? -360 : 1}
                      max={key === "rotation" ? 360 : 10000}
                      value={Math.round(selected[key])}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        if (Number.isFinite(value))
                          modifySelected({
                            [key]: Math.max(
                              key === "rotation" ? -360 : 1,
                              Math.min(key === "rotation" ? 360 : 10000, value),
                            ),
                          });
                      }}
                    />
                  </label>
                ))}
              </div>
              <label className="flex items-center gap-2 text-xs">
                Fill
                <input
                  type="color"
                  aria-label="Object fill color"
                  value={selected.fill === "none" ? "#ffffff" : selected.fill}
                  onChange={(event) =>
                    modifySelected({ fill: event.target.value })
                  }
                />
              </label>
              <button
                className={`${control} w-full`}
                onClick={() => modifySelected({ fill: "none" })}
              >
                Remove fill
              </button>
              {selected.kind === "text" && (
                <>
                  <textarea
                    aria-label="Edit selected text"
                    maxLength={2000}
                    className={`${control} w-full py-2`}
                    value={selected.text}
                    onChange={(event) =>
                      modifySelected({
                        text: event.target.value,
                        label: event.target.value.slice(0, 30),
                      })
                    }
                  />
                  <label className="text-xs">
                    Font size
                    <input
                      type="number"
                      min={8}
                      max={200}
                      aria-label="Selected text font size"
                      value={selected.fontSize}
                      className={`${control} mt-1 w-full`}
                      onChange={(event) =>
                        modifySelected({
                          fontSize: Math.max(
                            8,
                            Math.min(200, Number(event.target.value)),
                          ),
                        })
                      }
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={selected.bold}
                      onChange={(event) =>
                        modifySelected({ bold: event.target.checked })
                      }
                    />
                    Bold
                  </label>
                </>
              )}
              <div className="flex flex-wrap gap-2">
                <button className={control} onClick={duplicateSelected}>
                  Duplicate
                </button>
                <button className={control} onClick={deleteSelected}>
                  Delete
                </button>
                <button
                  className={control}
                  onClick={() =>
                    commit({
                      ...document,
                      objects: [
                        ...document.objects.filter(
                          (item) => item.id !== selected.id,
                        ),
                        selected,
                      ],
                    })
                  }
                >
                  To front
                </button>
                <button
                  className={control}
                  onClick={() =>
                    commit({
                      ...document,
                      objects: [
                        selected,
                        ...document.objects.filter(
                          (item) => item.id !== selected.id,
                        ),
                      ],
                    })
                  }
                >
                  To back
                </button>
              </div>
            </div>
          )}
          <div className="border-t border-line pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
              Layers · {document.objects.length}
            </h3>
            <div className="mt-2 max-h-48 space-y-1 overflow-auto">
              {[...document.objects].reverse().map((object, index) => (
                <button
                  key={object.id}
                  aria-label={`Select layer ${object.label} ${document.objects.length - index}`}
                  aria-pressed={selectedId === object.id}
                  onClick={() => {
                    setSelectedId(object.id);
                    chooseTool("select");
                  }}
                  className={`w-full truncate rounded-lg px-2 py-2 text-left text-xs ${selectedId === object.id ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2"}`}
                >
                  {object.kind === "text" ? "T" : "◇"} {object.label}
                </button>
              ))}
              {!document.objects.length && (
                <p className="mt-2 text-xs leading-5 text-muted">
                  Your shapes and sketches appear here.
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface-2 px-4 py-3">
        <p
          role="status"
          aria-live="polite"
          className="max-w-2xl text-xs leading-5 text-muted"
        >
          {message}
        </p>
        <button
          className="min-h-10 text-xs font-medium text-accent underline underline-offset-4"
          onClick={() => setHelp(!help)}
          aria-expanded={help}
        >
          How to & shortcuts
        </button>
      </footer>
      {help && (
        <div className="grid gap-4 border-t border-line p-5 text-xs leading-6 text-muted sm:grid-cols-2">
          <p>
            Smart sketch groups your strokes until you choose a suggestion or
            press Keep sketch. Suggestions match your sketch against our local
            symbol library. Search the library to add a symbol directly. Fill
            recolors a selected object, or the canvas when you tap an empty
            area. Erase removes a whole object.
          </p>
          <p>
            A: Smart sketch · D: Freehand · V: Select · T: Text · F: Fill · R:
            Rectangle · O: Ellipse · L: Line · E: Erase · H: Pan. Ctrl/⌘ Z: Undo
            · Shift Ctrl/⌘ Z: Redo · Ctrl/⌘ D: Duplicate. Arrow keys move
            selections; Shift moves 10 pixels. Shift-drag makes equal-sided
            shapes. Pinch to zoom on touchscreens. Save a project to keep
            editable layers.
          </p>
        </div>
      )}
    </div>
  );
}
