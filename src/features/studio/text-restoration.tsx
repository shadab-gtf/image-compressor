"use client";

import { useEffect, useRef, useState } from "react";
import type { OcrResult } from "@paddleocr/paddleocr-js";
import { LocalPaddleOCR } from "@/services/paddle-ocr";
import type { StudioImage } from "@/types/studio";
import { Button } from "@/components/ui/button";
import { DoodleIcon } from "@/components/ui/doodle-icon";
import { formatOcrConfidence } from "@/lib/ocr-confidence";

interface Props { source: Blob; output: StudioImage; onApply: (image: StudioImage) => void }
interface Line { text: string; selected: boolean; color: string; background: string }

export function TextRestoration({ source, output, onApply }: Props) {
  const engine = useRef<LocalPaddleOCR | null>(null);
  const [ocr, setOcr] = useState<OcrResult | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => () => { engine.current?.dispose(); engine.current = null; }, [source]);
  async function read() {
    setBusy(true); setError(null);
    try {
      engine.current ??= new LocalPaddleOCR();
      const result = await engine.current.recognize(source);
      setOcr(result);
      setLines(result.items.map(item => ({ text: item.text, selected: false, color: "#171717", background: "#ffffff" })));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Text recognition failed."); engine.current?.dispose(); engine.current = null; }
    finally { setBusy(false); }
  }
  async function apply() {
    if (!ocr) return;
    setBusy(true); setError(null);
    try {
      const bitmap = await createImageBitmap(output.blob);
      const canvas = document.createElement("canvas"); canvas.width = output.width; canvas.height = output.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not render text.");
      context.drawImage(bitmap, 0, 0); bitmap.close();
      const sx = output.width / ocr.image.width, sy = output.height / ocr.image.height;
      ocr.items.forEach((item, index) => {
        const line = lines[index];
        if (!line?.selected || !line.text.trim() || item.poly.length !== 4) return;
        const xs = item.poly.map(point => point[0] * sx), ys = item.poly.map(point => point[1] * sy);
        const x = Math.min(...xs), y = Math.min(...ys), w = Math.max(...xs) - x, h = Math.max(...ys) - y;
        context.save(); context.beginPath(); context.rect(x, y, w, h); context.clip();
        context.fillStyle = line.background; context.fillRect(x, y, w, h);
        context.fillStyle = line.color; context.font = `${Math.max(1, h * 0.85)}px Arial, sans-serif`; context.textBaseline = "middle";
        context.fillText(line.text, x, y + h / 2, w); context.restore();
      });
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("PNG export failed.")), "image/png"));
      onApply({ blob, width: output.width, height: output.height });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Text reconstruction failed."); }
    finally { setBusy(false); }
  }
  return <section className="mt-5 space-y-4 rounded-3xl border border-line bg-surface p-5" aria-label="PaddleOCR text restoration">
    <h2 className="flex items-center gap-3 text-lg font-semibold"><DoodleIcon name="enhance" size={32} />Read and restore text</h2>
    <p className="text-sm text-muted">PaddleOCR reads text locally. Confidence is the model’s estimate, not verified accuracy; even a 100% score can contain mistakes. Review and correct each line before replacing it. Select only horizontal text on a solid background.</p>
    <Button className="h-auto min-h-11 max-w-full whitespace-normal py-3" onClick={() => void read()} disabled={busy}>{busy ? "Reading text…" : "Read text with PaddleOCR"}</Button>
    {busy && <Button variant="secondary" onClick={() => { engine.current?.dispose(); engine.current = null; }}>Cancel text recognition</Button>}
    {busy && <div role="status" className="h-16 animate-pulse rounded-xl bg-surface-3">Loading local OCR / processing text…</div>}
    {error && <p role="alert" className="text-sm text-accent">{error}</p>}
    {ocr && <><p className="text-sm text-muted">{ocr.items.length} lines found · {(ocr.metrics.totalMs / 1000).toFixed(1)}s · {ocr.runtime.recProvider}. Check low-confidence words carefully.</p>
      <div className="max-h-96 space-y-3 overflow-y-auto">{ocr.items.map((item, index) => <div key={index} className="space-y-2 rounded-xl border border-line p-3">
        <p className="text-xs text-muted">Model confidence: {formatOcrConfidence(item.score)} · {!Number.isFinite(item.score) || item.score < 0.9 ? "Needs careful review" : "Review against the original"}</p>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={lines[index]?.selected ?? false} onChange={event => setLines(current => current.map((line, at) => at === index ? { ...line, selected: event.target.checked } : line))} />I reviewed line {index + 1} — replace it</label>
        <input aria-label={`Text line ${index + 1}`} value={lines[index]?.text ?? ""} onChange={event => setLines(current => current.map((line, at) => at === index ? { ...line, text: event.target.value } : line))} className="w-full rounded-lg border border-line bg-surface px-3 py-2" />
        <div className="flex gap-4"><label className="flex items-center gap-2 text-xs">Text<input type="color" value={lines[index]?.color ?? "#171717"} onChange={event => setLines(current => current.map((line, at) => at === index ? { ...line, color: event.target.value } : line))} /></label><label className="flex items-center gap-2 text-xs">Background<input type="color" value={lines[index]?.background ?? "#ffffff"} onChange={event => setLines(current => current.map((line, at) => at === index ? { ...line, background: event.target.value } : line))} /></label></div>
      </div>)}</div>
      <Button disabled={busy || !lines.some(line => line.selected)} onClick={() => void apply()}>Apply reviewed text</Button>
      <Button variant="secondary" onClick={() => { engine.current?.dispose(); engine.current = null; setBusy(false); }}>Cancel / release OCR memory</Button>
    </>}
  </section>;
}
