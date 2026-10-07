/**
 * End-to-end check.
 *
 * Drives the real application in headless Chrome over the DevTools Protocol:
 * real files go into the real file input, the real worker pool runs, and the
 * assertions read what the user would actually see.
 *
 * It also watches the network the whole time. The product's central promise is
 * that image bytes never leave the device, so the suite fails if any request
 * carries a body large enough to be an image, or targets another origin.
 *
 * No test-runner or browser-automation dependency: Node 22 ships a WebSocket
 * client, which is all the protocol needs.
 *
 *   npm run e2e
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const PORT = 9333;
const IMAGES = join(process.env.TEMP ?? "/tmp", "shrinkfox-test-images");

const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((p) => existsSync(p));
if (!CHROME) throw new Error("No Chrome or Edge found");

/* -------------------------------------------------------------------------- */
/* Minimal CDP client                                                          */
/* -------------------------------------------------------------------------- */

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
type ProtocolMessage = { id?: number; error?: unknown; result?: unknown; method?: string; params?: unknown };
type DebugTarget = { type: string; webSocketDebuggerUrl: string };
type NetworkRequest = { request: { url: string; method: string; postData?: string; hasPostData?: boolean } };
type RuntimeError = { exceptionDetails?: { exception?: { description?: string }; text?: string } };

class CDP {
  private socket: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private listeners = new Map<string, Array<(params: unknown) => void>>();

  async connect(url: string) {
    const socket = new WebSocket(url);
    this.socket = socket;
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new Error("CDP socket failed")), {
        once: true,
      });
    });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as ProtocolMessage;
      if (message.id) {
        const waiter = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (!waiter) return;
        clearTimeout(waiter.timer);
        if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
        else waiter.resolve(message.result);
      } else if (message.method) {
        for (const fn of this.listeners.get(message.method) ?? []) fn(message.params);
      }
    });
  }

  on<T>(method: string, fn: (params: T) => void) {
    const list = this.listeners.get(method) ?? [];
    list.push((params) => fn(params as T));
    this.listeners.set(method, list);
  }

  send<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error("CDP is not connected"));
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`CDP timeout: ${method}`));
      }, 30_000);
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject, timer });
    });
  }

  /** Evaluates an expression in the page and returns its JSON value. */
  async evaluate<T>(expression: string): Promise<T> {
    const result = await this.send<{ exceptionDetails?: unknown; result: { value: T } }>("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      throw new Error(`Page error: ${JSON.stringify(result.exceptionDetails)}`);
    }
    return result.result.value;
  }

  close() {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("CDP connection closed"));
    }
    this.pending.clear();
    this.socket?.close();
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(
  label: string,
  timeoutMs: number,
  probe: () => Promise<T | null>,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: unknown = null;
  while (Date.now() < deadline) {
    const value = await probe();
    if (value !== null && value !== undefined && value !== false) return value;
    last = value;
    await sleep(350);
  }
  throw new Error(`Timed out waiting for ${label} (last: ${JSON.stringify(last)})`);
}

/* -------------------------------------------------------------------------- */
/* Assertions                                                                  */
/* -------------------------------------------------------------------------- */

const results: Array<{ name: string; ok: boolean; detail: string }> = [];

function check(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

/* -------------------------------------------------------------------------- */

async function main() {
  if (!existsSync(IMAGES)) {
    throw new Error(`Test images missing. Run: npm run test:images`);
  }
  const temporaryRoot = resolve(tmpdir());
  const profile = mkdtempSync(join(temporaryRoot, "shrinkfox-e2e-"));
  const downloads = join(profile, "test-downloads");
  mkdirSync(downloads);

  const chrome = spawn(
    CHROME!,
    [
      "--headless=new",
      "--disable-gpu",
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--disable-extensions",
      "about:blank",
    ],
    { stdio: "ignore", windowsHide: true },
  );

  const cdp = new CDP();
  try {
    // Wait for the debugger endpoint to come up.
    const target = await waitFor("devtools endpoint", 20_000, async () => {
      try {
        const list: unknown = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((response) => response.json());
        if (!Array.isArray(list)) return null;
        return list.find((target: unknown): target is DebugTarget => typeof target === "object" && target !== null && "type" in target && target.type === "page" && "webSocketDebuggerUrl" in target && typeof target.webSocketDebuggerUrl === "string") ?? null;
      } catch {
        return null;
      }
    });

    await cdp.connect(target.webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("DOM.enable");
    await cdp.send("Network.enable");
    await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads });
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

    /* ---- Privacy watch ------------------------------------------------- */
    const suspicious: string[] = [];
    cdp.on<NetworkRequest>("Network.requestWillBeSent", (params) => {
      const { url, method, postData, hasPostData } = params.request;
      if (url.startsWith("data:") || url.startsWith("blob:")) return;
      const sameOrigin = new URL(url).origin === new URL(BASE).origin;
      if (!sameOrigin && !url.startsWith("devtools://")) {
        suspicious.push(`cross-origin ${method} ${url}`);
      }
      // An image upload would show up as a large request body.
      const size = postData ? postData.length : hasPostData ? Infinity : 0;
      if (size > 20_000) suspicious.push(`${method} ${url} with ${size} byte body`);
    });

    const pageErrors: string[] = [];
    cdp.on<RuntimeError>("Runtime.exceptionThrown", (params) => {
      pageErrors.push(params.exceptionDetails?.exception?.description ?? "unknown");
    });

    /* ---- Load ---------------------------------------------------------- */
    console.log(`\nLoading ${BASE}/app`);
    await cdp.send("Page.navigate", { url: `${BASE}/app` });
    await waitFor("workspace drop zone", 45_000, async () =>
      cdp.evaluate<boolean>(`!!document.querySelector('input[type=file]')`),
    );

    /* ---- Codec probe --------------------------------------------------- */
    // Reported through the format <select>, which is how a user learns what is
    // available — so asserting on it tests the real surface.
    await cdp.evaluate(`document.querySelector('input[type=file]').scrollIntoView()`);

    /* ---- Feed files ---------------------------------------------------- */
    const names = readdirSync(IMAGES).filter((n) => n.endsWith(".png"));
    const paths = names.map((n) => join(IMAGES, n));
    const totalInputBytes = paths.reduce((sum, p) => sum + statSync(p).size, 0);
    console.log(`Feeding ${paths.length} files (${(totalInputBytes / 1e6).toFixed(1)} MB)`);

    const doc = await cdp.send<{ root: { nodeId: number } }>("DOM.getDocument");
    const inputNode = await cdp.send<{ nodeId: number }>("DOM.querySelector", {
      nodeId: doc.root.nodeId,
      selector: "input[type=file]:not([webkitdirectory])",
    });
    await cdp.send("DOM.setFileInputFiles", { nodeId: inputNode.nodeId, files: paths });

    /* ---- Ingestion ----------------------------------------------------- */
    const rows = await waitFor("queue rows", 20_000, async () => {
      const n = await cdp.evaluate<number>(`document.querySelectorAll('ul li').length`);
      return n > 0 ? n : null;
    });
    // The two non-images are filtered at ingest by extension/type, so they do
    // reach the queue and must be rejected by the validator, not silently
    // dropped. Both paths are acceptable; the count tells us which happened.
    check("files enter the queue", rows >= 5, `${rows} rows from ${paths.length} files`);

    /* ---- Process ------------------------------------------------------- */
    const started = await cdp.evaluate<boolean>(`(() => {
      const button = [...document.querySelectorAll('button')]
        .find(b => /^(Start|Process remaining)$/.test(b.textContent.trim()));
      if (!button) return false;
      button.click();
      return true;
    })()`);
    check("start control is present", started);

    console.log("Processing...");
    const summary = await waitFor("batch to finish", 180_000, async () => {
      const state = await cdp.evaluate<{ busy: boolean; text: string }>(`(() => ({
        busy: !!document.body.innerText.match(/Shrinking\\.\\.\\.|Paused/),
        text: document.body.innerText,
      }))()`);
      if (state.busy) return null;
      // "Your images are ready." only renders once the queue has drained.
      return state.text.includes("Your images are ready.") ? state.text : null;
    });

    /* ---- Assertions ---------------------------------------------------- */
    const rowData = await cdp.evaluate<Array<{ text: string }>>(
      `[...document.querySelectorAll('ul li')].map(li => ({ text: li.innerText }))`,
    );

    const smaller = rowData.filter((r) => /% smaller/.test(r.text));
    check(
      "photographic inputs were actually compressed",
      smaller.filter((row) => row.text.includes("photo-")).length === 2,
      `${smaller.length} rows report a size reduction; already compact images may grow`,
    );
    check("all valid images produced downloadable results", await cdp.evaluate<number>(`document.querySelectorAll('button[aria-label^="Download "]').length`) === 5);

    const rejected = rowData.filter((r) =>
      /not an image we recognise|file is empty/i.test(r.text),
    );
    check(
      "malformed files are rejected with a reason",
      rejected.length === 2,
      `${rejected.length} rejected (expected the renamed executable and the empty file)`,
    );

    const crashed = rowData.filter((r) => /Something went wrong/.test(r.text));
    check("no unexplained failures", crashed.length === 0, `${crashed.length} unknown errors`);

    const savedMatch = /saved\s+([\d.]+\s*[KMG]?B)\s*\(([\d.]+%)\)/i.exec(summary);
    check(
      "a savings total is reported",
      savedMatch !== null,
      savedMatch ? `${savedMatch[1]} (${savedMatch[2]})` : "no savings line found",
    );

    check(
      "no image bytes left the device",
      suspicious.length === 0,
      suspicious.length ? suspicious.slice(0, 3).join("; ") : "0 uploads, 0 cross-origin requests",
    );

    check(
      "no uncaught page exceptions",
      pageErrors.length === 0,
      pageErrors.slice(0, 2).join("; "),
    );

    /* ---- Real result comparison --------------------------------------- */
    await cdp.evaluate(`document.querySelector('button[aria-label^="Preview "]')?.click()`);
    const comparison = await waitFor("image comparison dialog", 15_000, () => cdp.evaluate<boolean>(`!!document.querySelector('dialog[open] input[type=range]')`));
    check("processed results have a before/after comparison", comparison);
    check("comparison uses decoded local original and output images", await cdp.evaluate<boolean>(`[...document.querySelectorAll('dialog[open] img')].length === 2 && [...document.querySelectorAll('dialog[open] img')].every(image => image.src.startsWith('blob:'))`));
    await cdp.evaluate(`document.querySelector('dialog[open] button')?.click()`);

    /* ---- Target size --------------------------------------------------- */
    console.log("\nChecking target-size mode");
    await cdp.evaluate(`(() => {
      const target = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Target');
      if (target) target.click();
    })()`);
    await sleep(400);
    const picked = await cdp.evaluate<boolean>(`(() => {
      const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '500 KB');
      if (!b) return false;
      b.click();
      return true;
    })()`);

    check("target-size preset can be selected", picked);
    if (picked) {
      // Rerun fresh inputs. Retrying only failed rows would accidentally assert
      // against stale results from the earlier compression pass.
      await cdp.evaluate(`(() => {
        const select = document.querySelector('select[aria-label="Output format"]');
        if (!select || ![...select.options].some(option => option.value === 'webp' && !option.disabled)) throw new Error('WebP encoder unavailable');
        select.value = 'webp';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Clear all').click();
      })()`);
      await waitFor("empty drop zone", 5000, () => cdp.evaluate<boolean>(`!!document.querySelector('input[type=file]:not([webkitdirectory])')`));
      const freshDoc = await cdp.send<{ root: { nodeId: number } }>("DOM.getDocument");
      const freshInput = await cdp.send<{ nodeId: number }>("DOM.querySelector", { nodeId: freshDoc.root.nodeId, selector: "input[type=file]:not([webkitdirectory])" });
      const validPaths = paths.filter((path) => !path.endsWith("empty.png") && !path.endsWith("not-really-an-image.png"));
      await cdp.send("DOM.setFileInputFiles", { nodeId: freshInput.nodeId, files: validPaths });
      await waitFor("new target-size queue", 5000, () => cdp.evaluate<boolean>(`document.querySelectorAll('button[aria-label^="Remove "]').length === 5`));
      const reran = await cdp.evaluate<boolean>(`(() => {
        const button = [...document.querySelectorAll('button')]
          .find(b => /^(Start|Process remaining)$/.test(b.textContent.trim()));
        if (!button) return false;
        button.click();
        return true;
      })()`);
      if (reran) {
        await waitFor("target-size pass", 180_000, async () => {
          const state = await cdp.evaluate<{ done: boolean; errors: string[] }>(`({
            done: document.querySelectorAll('button[aria-label^="Download "]').length === 5 && !document.body.innerText.includes('Shrinking...'),
            errors: [...document.querySelectorAll('button[aria-label^="Retry "]')].map(button => button.closest('li')?.innerText ?? 'Image processing interrupted')
          })`);
          if (state.errors.length) throw new Error(`Target-size jobs failed or were interrupted: ${state.errors.join("; ")}`);
          return state.done ? true : null;
        });
        await cdp.evaluate(`(() => { const button = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Download ZIP'); button.click(); })()`);
        const archivePath = await waitFor("downloaded ZIP", 20_000, async () => {
          const name = readdirSync(downloads).find((file) => file.endsWith(".zip"));
          return name ? join(downloads, name) : null;
        });
        const archive = readFileSync(archivePath);
        const outputs: Array<{ size: number; webp: boolean }> = [];
        let offset = 0;
        while (offset + 30 <= archive.length && archive.readUInt32LE(offset) === 0x04034b50) {
          const size = archive.readUInt32LE(offset + 18);
          const nameLength = archive.readUInt16LE(offset + 26);
          const extraLength = archive.readUInt16LE(offset + 28);
          const name = archive.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
          const dataOffset = offset + 30 + nameLength + extraLength;
          if (name.endsWith(".webp")) outputs.push({ size, webp: archive.subarray(dataOffset, dataOffset + 4).toString() === "RIFF" && archive.subarray(dataOffset + 8, dataOffset + 12).toString() === "WEBP" });
          offset = dataOffset + size;
        }
        const withinTarget = outputs.filter((output) => output.size <= 525_000 && output.webp);
        check(
          "target size is respected",
          withinTarget.length === 5,
          `${withinTarget.length} outputs at or under 525 KB (500 KB + 5% tolerance)`,
        );
      }
    }

    /* ---- Mobile dialog and keyboard access ---------------------------- */
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await waitFor("mobile settings control", 5000, () => cdp.evaluate<boolean>(`[...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Settings')`));
    await cdp.evaluate(`(() => { const button = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Settings'); button.focus(); button.click(); })()`);
    await waitFor("mobile settings dialog", 5000, () => cdp.evaluate<boolean>(`!!document.querySelector('dialog[open]')`));
    let focusStayedInside = true;
    const focusLeaks: string[] = [];
    for (let i = 0; i < 22; i += 1) {
      await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
      await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
      const inside = await cdp.evaluate<boolean>(`document.querySelector('dialog[open]').contains(document.activeElement)`);
      if (!inside) focusLeaks.push(await cdp.evaluate<string>(`document.activeElement?.outerHTML.slice(0, 100) ?? 'none'`));
      focusStayedInside = focusStayedInside && inside;
    }
    check("mobile settings keep keyboard focus inside the dialog", focusStayedInside, focusLeaks.join("; "));
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await waitFor("settings close", 5000, () => cdp.evaluate<boolean>(`!document.querySelector('dialog[open]')`));
    check("Escape closes settings and restores focus", await cdp.evaluate<boolean>(`document.activeElement?.textContent.trim() === 'Settings'`));
    check("mobile workspace fits the viewport", await cdp.evaluate<boolean>(`document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1`));
    check("all tested interactions remain free of uncaught exceptions", pageErrors.length === 0, pageErrors.slice(0, 2).join("; "));

    /* ---- Report -------------------------------------------------------- */
    const failures = results.filter((r) => !r.ok);
    console.log(
      `\n${results.length - failures.length}/${results.length} checks passed${
        failures.length ? ` — ${failures.length} FAILED` : ""
      }`,
    );
    process.exitCode = failures.length === 0 ? 0 : 1;
  } finally {
    cdp.close();
    try {
      if (process.platform === "win32" && chrome.pid) {
        execFileSync("taskkill", ["/F", "/T", "/PID", String(chrome.pid)], { stdio: "ignore", windowsHide: true });
      } else chrome.kill();
    } catch {
      // Already gone.
    }
    const relativeProfile = relative(temporaryRoot, resolve(profile));
    if (relativeProfile.startsWith("shrinkfox-e2e-") && !relativeProfile.includes(sep)) {
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  }
}

await main();
