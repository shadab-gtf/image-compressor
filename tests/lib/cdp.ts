/**
 * Shared Chrome DevTools Protocol client for the test suites.
 *
 * Node 22 ships a WebSocket client, so driving a real browser needs no
 * Playwright/Puppeteer dependency — which matters for a project whose whole
 * pitch is a minimal, auditable dependency tree.
 *
 * Every suite under tests/ builds on this: launch a real Chrome, drive the real
 * app, assert on what a user would actually see.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

export const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
export const TEST_IMAGES = join(process.env.TEMP ?? "/tmp", "shrinkfox-test-images");

export const CHROME_PATH = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((p) => existsSync(p));

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

export class CDP {
  private socket!: WebSocket;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private listeners = new Map<string, Array<(params: never) => void>>();

  async connect(url: string) {
    this.socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      this.socket.addEventListener("open", () => resolve(), { once: true });
      this.socket.addEventListener("error", () => reject(new Error("CDP socket failed")), {
        once: true,
      });
    });

    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const waiter = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (!waiter) return;
        if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
        else waiter.resolve(message.result);
      } else if (message.method) {
        for (const fn of this.listeners.get(message.method) ?? []) {
          (fn as (p: unknown) => void)(message.params);
        }
      }
    });
  }

  on<T = Record<string, unknown>>(method: string, fn: (params: T) => void) {
    const list = this.listeners.get(method) ?? [];
    list.push(fn as (params: never) => void);
    this.listeners.set(method, list);
  }

  send<T = Record<string, unknown>>(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs = 120_000,
  ): Promise<T> {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`CDP timeout: ${method}`));
      }, timeoutMs);
    });
  }

  /** Evaluates an expression in the page and returns its JSON value. */
  async evaluate<T>(expression: string): Promise<T> {
    const result = await this.send<{
      result: { value: T };
      exceptionDetails?: unknown;
    }>("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) {
      throw new Error(`Page error: ${JSON.stringify(result.exceptionDetails)}`);
    }
    return result.result.value;
  }

  /** Puts real files into a real <input type=file>. */
  async setFiles(selector: string, paths: string[]) {
    const doc = await this.send<{ root: { nodeId: number } }>("DOM.getDocument");
    const node = await this.send<{ nodeId: number }>("DOM.querySelector", {
      nodeId: doc.root.nodeId,
      selector,
    });
    if (!node.nodeId) throw new Error(`No element matched ${selector}`);
    await this.send("DOM.setFileInputFiles", { nodeId: node.nodeId, files: paths });
  }

  close() {
    try {
      this.socket.close();
    } catch {
      // Already closed.
    }
  }
}

export type Session = { cdp: CDP; chrome: ChildProcess; stop: () => void };

/**
 * Launches a dedicated headless Chrome and attaches to its first page target.
 * Each suite gets its own profile directory and port so suites can run in
 * parallel without sharing storage or service workers.
 */
export async function launch(options: { port?: number; label?: string } = {}): Promise<Session> {
  if (!CHROME_PATH) throw new Error("No Chrome or Edge found");

  const port = options.port ?? 9400 + Math.floor(Math.random() * 400);
  const profile = join(
    process.env.TEMP ?? "/tmp",
    `shrinkfox-test-${options.label ?? "run"}-${port}`,
  );
  rmSync(profile, { recursive: true, force: true });
  mkdirSync(profile, { recursive: true });

  const chrome = spawn(
    CHROME_PATH,
    [
      "--headless=new",
      "--disable-gpu",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-background-timer-throttling",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  const target = await waitFor(
    "devtools endpoint",
    25_000,
    async () => {
      try {
        const list = (await fetch(`http://127.0.0.1:${port}/json/list`).then((r) =>
          r.json(),
        )) as Array<{ type: string; webSocketDebuggerUrl: string }>;
        return list.find((t) => t.type === "page") ?? null;
      } catch {
        return null;
      }
    },
    300,
  );

  const cdp = new CDP();
  await cdp.connect(target.webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("DOM.enable");
  await cdp.send("Network.enable");

  return {
    cdp,
    chrome,
    stop: () => {
      cdp.close();
      chrome.kill();
      rmSync(profile, { recursive: true, force: true });
    },
  };
}

export async function waitFor<T>(
  label: string,
  timeoutMs: number,
  probe: () => Promise<T | null | false | undefined>,
  intervalMs = 350,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: unknown;
  while (Date.now() < deadline) {
    const value = await probe();
    if (value !== null && value !== undefined && value !== false) return value;
    last = value;
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for ${label} (last seen: ${JSON.stringify(last)})`);
}

/* -------------------------------------------------------------------------- */
/* Assertions and reporting                                                    */
/* -------------------------------------------------------------------------- */

export type Check = { name: string; ok: boolean; detail: string };

export class Report {
  readonly checks: Check[] = [];
  constructor(private readonly suite: string) {
    console.log(`\n=== ${suite} ===`);
  }

  check(name: string, ok: boolean, detail = "") {
    this.checks.push({ name, ok, detail });
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
    return ok;
  }

  /** Records a check that could not run, which is neither a pass nor a silent skip. */
  skip(name: string, why: string) {
    console.log(`  SKIP  ${name} — ${why}`);
  }

  finish(): number {
    const failed = this.checks.filter((c) => !c.ok);
    console.log(
      `  ${this.checks.length - failed.length}/${this.checks.length} passed in ${this.suite}` +
        (failed.length ? ` — ${failed.length} FAILED` : ""),
    );
    return failed.length;
  }
}

/** Navigates and waits for the app shell to be interactive. */
export async function open(cdp: CDP, path: string, waitSelector = "body") {
  await cdp.send("Page.navigate", { url: `${BASE}${path}` });
  await waitFor(`${path} to render`, 45_000, async () =>
    cdp.evaluate<boolean>(`!!document.querySelector(${JSON.stringify(waitSelector)})`),
  );
}
