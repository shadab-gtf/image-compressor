/** Browser checks run real image workers, including the self-hosted AI model. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = process.env.E2E_BASE ?? "http://localhost:3000";
const port = 9335;
const chromePath = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
if (!chromePath) throw new Error("Chrome or Edge is required for studio browser verification.");
const profile = await mkdtemp(join(tmpdir(), "shrinkfox-studio-"));
const browser = spawn(chromePath, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--disable-extensions", "about:blank"], { stdio: "ignore", windowsHide: true });
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface ProtocolMessage { id?: number; result?: Record<string, unknown>; error?: unknown; method?: string; params?: Record<string, unknown> }
const waiting = new Map<number, { resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
let sequence = 0;
let socket: WebSocket | undefined;
const unexpected: string[] = [];

async function send(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { waiting.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 60_000);
    waiting.set(id, { resolve, reject, timer });
    socket?.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate<T>(expression: string): Promise<T> {
  const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
  return (response.result as { value: T }).value;
}

async function until(label: string, condition: () => Promise<boolean>, timeout = 90_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await delay(300);
  }
  throw new Error(`Timed out: ${label}\n${await evaluate<string>("document.body.innerText")}`);
}

async function click(label: string) {
  const found = await evaluate<boolean>(`(() => { const element = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === ${JSON.stringify(label)}); if (!element || element.disabled) return false; element.click(); return true; })()`);
  assert.ok(found, `Clickable button: ${label}`);
}

async function uploadSynthetic() {
  await evaluate(`(async () => { const canvas = document.createElement('canvas'); canvas.width = 192; canvas.height = 160; const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 192, 160); ctx.fillStyle = '#b53b27'; ctx.fillRect(45, 40, 100, 90); ctx.fillStyle = '#e09c80'; ctx.beginPath(); ctx.arc(95, 45, 26, 0, Math.PI * 2); ctx.fill(); const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png')); const transfer = new DataTransfer(); transfer.items.add(new File([blob], 'studio-fixture.png', { type: 'image/png' })); const input = document.querySelector('input[type=file]'); input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await until("image preview", () => evaluate("!!document.querySelector('img[alt=\"Original image preview\"]') && !document.querySelector('[role=progressbar]')"));
}

async function resultPixels(): Promise<{ width: number; height: number; alpha: number; centerAlpha: number; centerRed: number }> {
  return evaluate(`(async () => { const href = document.querySelector('a[download]').href; const picture = new Image(); picture.src = href; await picture.decode(); const bitmap = await createImageBitmap(picture); const canvas = new OffscreenCanvas(bitmap.width, bitmap.height); const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0); const pixels = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data; const center = (Math.floor(bitmap.height / 2) * bitmap.width + Math.floor(bitmap.width / 2)) * 4; const result = { width: bitmap.width, height: bitmap.height, alpha: pixels[3], centerAlpha: pixels[center + 3], centerRed: pixels[center] }; bitmap.close(); return result; })()`);
}

try {
  let target: { webSocketDebuggerUrl: string } | undefined;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json()) as Array<{ type: string; webSocketDebuggerUrl: string }>;
      target = targets.find((item) => item.type === "page");
      if (target) break;
    } catch { /* Browser may still be starting. */ }
    await delay(250);
  }
  if (!target) throw new Error("Could not connect to headless browser.");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => { socket!.addEventListener("open", () => resolve(), { once: true }); socket!.addEventListener("error", () => reject(new Error("CDP socket failed")), { once: true }); });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data)) as ProtocolMessage;
    if (message.id) {
      const waiter = waiting.get(message.id);
      if (!waiter) return;
      waiting.delete(message.id);
      clearTimeout(waiter.timer);
      if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
      else waiter.resolve(message.result ?? {});
    } else if (message.method === "Runtime.exceptionThrown") {
      unexpected.push(JSON.stringify(message.params));
    } else if (message.method === "Network.requestWillBeSent") {
      const request = message.params?.request as { url: string; method: string; hasPostData?: boolean };
      if (request.url.startsWith("http") && new URL(request.url).origin !== new URL(base).origin) unexpected.push(`Unexpected external request: ${request.url}`);
      if (request.hasPostData) unexpected.push(`Unexpected upload: ${request.method} ${request.url}`);
    }
  });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("DOM.enable");
  await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: `${base}/remove-background` });
  await until("studio UI", () => evaluate("!!document.querySelector('input[type=file]')"));
  await delay(800);
  await uploadSynthetic();
  await evaluate("document.querySelector('input[value=solid]').click()");
  await click("Remove background");
  await until("solid background result", () => evaluate("!!document.querySelector('a[download]') && !document.querySelector('[role=progressbar]')"));
  const solid = await resultPixels();
  assert.deepEqual(solid, { width: 192, height: 160, alpha: 0, centerAlpha: 255, centerRed: 181 });
  console.log("PASS: real worker solid-background pixels, dimensions, transparent PNG download");
  await evaluate("document.querySelector('input[aria-label=\"Drag image divider to compare before and after\"]').focus()");
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 });
  await until("keyboard comparison", () => evaluate("document.querySelector('input[aria-label=\"Before and after comparison\"]').value === '51'"));
  console.log("PASS: native comparison divider supports keyboard input");

  const portraitFile = process.env.E2E_PORTRAIT_FILE;
  if (portraitFile) {
    const document = await send("DOM.getDocument");
    const input = await send("DOM.querySelector", { nodeId: (document.root as { nodeId: number }).nodeId, selector: "input[type=file]" });
    await send("DOM.setFileInputFiles", { nodeId: input.nodeId, files: [portraitFile] });
    await until("portrait preview", () => evaluate("!!document.querySelector('img[alt=\"Original image preview\"]') && !document.querySelector('[role=progressbar]')"));
  }
  await evaluate("document.querySelector('input[value=portrait]').click()");
  await click("Remove background");
  await until("portrait inference completed", () => evaluate("!document.querySelector('[role=progressbar]') && (!!document.querySelector('[role=alert]') || document.body.innerText.includes('Your image is ready'))"), 180_000);
  const error = await evaluate<string | null>("document.querySelector('[role=alert]')?.textContent ?? null");
  assert.equal(error, null);
  const portrait = await resultPixels();
  assert.ok(portrait.width > 0 && portrait.height > 0);
  if (!portraitFile) {
    assert.equal(portrait.width, 192);
    assert.equal(portrait.height, 160);
  }
  const cached = await evaluate<boolean>("caches.open('shrinkfox-models-v1').then(cache => cache.keys()).then(keys => keys.some(key => key.url.includes('/models/modnet/model.onnx')))");
  assert.ok(cached, "AI weights cached locally");
  console.log(`PASS: self-hosted MODNet executes and creates PNG; model cache exists. Alpha corner=${portrait.alpha}, center=${portrait.centerAlpha}`);
  const screenshot = await send("Page.captureScreenshot", { format: "png" });
  await writeFile(join(profile, "portrait-result.png"), Buffer.from(screenshot.data as string, "base64"));

  await click("Remove background");
  await until("cancel control", () => evaluate("[...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Cancel')"));
  await click("Cancel");
  await until("cancellation", () => evaluate("!document.querySelector('[role=progressbar]') && document.body.innerText.includes('Processing cancelled')"));
  console.log("PASS: cancelling terminates active image worker");

  await send("Page.navigate", { url: `${base}/enhance-image` });
  await until("enhancement UI", () => evaluate("!!document.querySelector('select') && !!document.querySelector('input[type=file]')"));
  await delay(800);
  await uploadSynthetic();
  await evaluate("(() => { const select = document.querySelector('select[id$=scale]'); select.value = '2'; select.dispatchEvent(new Event('change', { bubbles: true })); })()");
  await click("Enhance image");
  await until("enhancement result", () => evaluate("!!document.querySelector('a[download]') && !document.querySelector('[role=progressbar]')"));
  const enhanced = await resultPixels();
  assert.equal(enhanced.width, 384);
  assert.equal(enhanced.height, 320);
  assert.notEqual(enhanced.centerRed, 181);
  assert.equal(enhanced.alpha, 255);
  console.log("PASS: enhancement changes pixels, preserves alpha, exports real 2× dimensions");
  assert.deepEqual(unexpected, [], "No uncaught errors, image uploads or external browser requests");
  console.log(`PASS: studio privacy checks. Screenshot: ${join(profile, "portrait-result.png")}`);
} finally {
  socket?.close();
  for (const waiter of waiting.values()) clearTimeout(waiter.timer);
  browser.kill();
}
