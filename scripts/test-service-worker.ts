import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const ORIGIN = "https://shrinkfox.test";
const workerSource = ts.transpileModule(
  (await readFile(new URL("../src/workers/service-worker.ts", import.meta.url), "utf8"))
    .replaceAll("__SW_VERSION__", "test")
    .replace('["__PUBLIC_ROUTES__"]', '["/", "/app", "/compress-image"]')
    .replace('["__PRECACHE_ASSETS__"]', '["/_next/static/lazy-image-worker.js", "/_next/static/media/pin-sans.woff2"]'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
).outputText;

type Network = (request: Request) => Promise<Response>;
type CacheKey = Request | string;
interface WorkerEvent {
  request?: Request;
  data?: unknown;
  source?: { url: string } | null;
  waitUntil(promise: Promise<unknown>): void;
  respondWith?(response: Promise<Response>): void;
}

function keyOf(value: CacheKey): string {
  return typeof value === "string" ? new URL(value, ORIGIN).href : value.url;
}

class MemoryCache {
  readonly values = new Map<string, Response>();
  private network: Network;
  private rejectWrites: boolean;
  constructor(network: Network, rejectWrites: boolean) {
    this.network = network;
    this.rejectWrites = rejectWrites;
  }

  async put(key: CacheKey, response: Response) {
    if (this.rejectWrites) throw new Error("Quota exceeded");
    this.values.set(keyOf(key), response.clone());
  }
  async match(key: CacheKey) {
    const value = this.values.get(keyOf(key));
    if (!value) return undefined;
    const copy = value.clone();
    // Real fetched Response clones retain their internal URL. The mock also
    // retains URLs assigned to synthetic responses for bootstrap regression tests.
    if (value.url) Object.defineProperty(copy, "url", { value: value.url });
    return copy;
  }
  async keys() { return [...this.values.keys()].map((url) => new Request(url)); }
  async delete(key: CacheKey) { return this.values.delete(keyOf(key)); }
  async addAll(keys: string[]) {
    const entries = await Promise.all(keys.map(async (key) => {
      const response = await this.network(new Request(keyOf(key)));
      if (!response.ok) throw new Error("Precache failed");
      return { key, response };
    }));
    for (const { key, response } of entries) await this.put(key, response);
  }
}

function runtime(network: Network, rejectWrites = false) {
  const listeners = new Map<string, (event: WorkerEvent) => void>();
  const stores = new Map<string, MemoryCache>();
  let claims = 0;
  let skips = 0;
  const cacheStorage = {
    async open(name: string) {
      let cache = stores.get(name);
      if (!cache) {
        cache = new MemoryCache(network, rejectWrites);
        stores.set(name, cache);
      }
      return cache;
    },
    async keys() { return [...stores.keys()]; },
    async delete(name: string) { return stores.delete(name); },
  };
  vm.runInNewContext(workerSource, {
    location: new URL(ORIGIN),
    addEventListener(name: string, callback: (event: WorkerEvent) => void) { listeners.set(name, callback); },
    clients: { async claim() { claims++; } },
    async skipWaiting() { skips++; },
    caches: cacheStorage,
    fetch(input: string | Request, init?: RequestInit) {
      return network(typeof input === "string" ? new Request(new URL(input, ORIGIN), init) : input);
    },
    URL,
    Response,
    Request,
    console,
  });

  return {
    stores,
    cacheStorage,
    get claims() { return claims; },
    get skips() { return skips; },
    async lifecycle(name: "install" | "activate") {
      const tasks: Promise<unknown>[] = [];
      listeners.get(name)?.({ waitUntil(promise) { tasks.push(promise); } });
      await Promise.all(tasks);
    },
    async message(data: unknown, source: { url: string } | null = { url: `${ORIGIN}/app` }) {
      const tasks: Promise<unknown>[] = [];
      listeners.get("message")?.({ data, source, waitUntil(promise) { tasks.push(promise); } });
      await Promise.all(tasks);
    },
    async fetch(request: Request) {
      const tasks: Promise<unknown>[] = [];
      let response: Promise<Response> | undefined;
      listeners.get("fetch")?.({
        request,
        waitUntil(promise) { tasks.push(promise); },
        respondWith(value) { response = value; },
      });
      const result = await response;
      await Promise.all(tasks);
      return result;
    },
  };
}

function navigate(path: string) {
  const request = new Request(`${ORIGIN}${path}`);
  Object.defineProperty(request, "mode", { value: "navigate" });
  return request;
}

test("installation warms HTML and same-origin assets, without caching third-party URLs", async () => {
  const requested: string[] = [];
  const worker = runtime(async (request) => {
    requested.push(request.url);
    if (request.url.endsWith("/app") || request.url === `${ORIGIN}/`) return new Response('<html><script src="/_next/static/app.js"></script><link href="/_next/static/app.css"><script src="https://third-party.test/tracker.js"></script></html>', { headers: { "Content-Type": "text/html" } });
    return new Response("asset");
  });
  await worker.lifecycle("install");
  assert.ok(await (await worker.cacheStorage.open("shrinkfox-shell-test")).match("/app"));
  assert.ok(await (await worker.cacheStorage.open("shrinkfox-shell-test")).match("/"));
  assert.ok(await (await worker.cacheStorage.open("shrinkfox-assets-test")).match("/_next/static/app.js"));
  assert.ok(await (await worker.cacheStorage.open("shrinkfox-assets-test")).match("/_next/static/lazy-image-worker.js"));
  assert.ok(await (await worker.cacheStorage.open("shrinkfox-assets-test")).match("/_next/static/media/pin-sans.woff2"));
  assert.ok(requested.every((url) => url.startsWith(ORIGIN)));
  assert.equal(worker.skips, 0, "updates must not interrupt an active batch");
});

test("offline navigation uses cached public HTML and a fallback for unknown pages", async () => {
  const worker = runtime(async () => { throw new TypeError("offline"); });
  const cache = await worker.cacheStorage.open("shrinkfox-shell-test");
  await cache.put("/app", new Response("saved workspace"));
  await cache.put("/offline.html", new Response("offline guide"));
  assert.equal(await (await worker.fetch(navigate("/app")))?.text(), "saved workspace");
  assert.equal(await (await worker.fetch(navigate("/unvisited")))?.text(), "offline guide");
});

test("image uploads, APIs, model URLs and RSC responses are never intercepted", async () => {
  let networkCalls = 0;
  const worker = runtime(async () => { networkCalls++; return new Response("unexpected"); });
  for (const request of [
    new Request(`${ORIGIN}/app`, { method: "POST", body: "private-image" }),
    new Request(`${ORIGIN}/api/images`),
    new Request(`${ORIGIN}/_next/static/private.js`, { headers: { Authorization: "Bearer test" } }),
    new Request(`${ORIGIN}/app?_rsc=test`),
    new Request(`${ORIGIN}/app`, { headers: { RSC: "1" } }),
    new Request("https://huggingface.co/model.onnx"),
    new Request("blob:https://shrinkfox.test/private-image"),
  ]) assert.equal(await worker.fetch(request), undefined);
  assert.equal(networkCalls, 0);
});

test("public HTML and static assets remain available after network loss", async () => {
  let online = true;
  const worker = runtime(async (request) => {
    if (!online) throw new TypeError("offline");
    return new Response(request.url.endsWith(".js") ? "worker code" : "public tool", { headers: { "Content-Type": request.url.endsWith(".js") ? "text/javascript" : "text/html" } });
  });
  await worker.fetch(navigate("/compress-image"));
  await worker.fetch(new Request(`${ORIGIN}/_next/static/processor.js`));
  online = false;
  assert.equal(await (await worker.fetch(navigate("/compress-image")))?.text(), "public tool");
  assert.equal(await (await worker.fetch(new Request(`${ORIGIN}/_next/static/processor.js`)))?.text(), "worker code");
});

test("quota failure does not break a successful asset response", async () => {
  const worker = runtime(async () => new Response("worker code"), true);
  assert.equal(await (await worker.fetch(new Request(`${ORIGIN}/_next/static/processor.js`)))?.text(), "worker code");
});

test("responses marked private or no-store are not persisted", async () => {
  for (const directive of ["private, max-age=0", "public, no-store"]) {
    const worker = runtime(async () => new Response("private data", { headers: { "Content-Type": "text/html", "Cache-Control": directive } }));
    await worker.fetch(navigate("/app"));
    assert.equal(await (await worker.cacheStorage.open("shrinkfox-shell-test")).match("/app"), undefined);
  }
});

test("the local AI engine stays available offline after its first use", async () => {
  let online = true;
  const worker = runtime(async () => {
    if (!online) throw new TypeError("offline");
    return new Response("wasm bytes");
  });
  await worker.fetch(new Request(`${ORIGIN}/wasm/ort-wasm-simd-threaded.wasm`));
  online = false;
  assert.equal(await (await worker.fetch(new Request(`${ORIGIN}/wasm/ort-wasm-simd-threaded.wasm`)))?.text(), "wasm bytes");
});

test("cached worker responses preserve the request bootstrap fragment", async () => {
  const worker = runtime(async () => { throw new TypeError("offline"); });
  const response = new Response("bootstrap code");
  Object.defineProperty(response, "url", { value: `${ORIGIN}/_next/static/worker.js` });
  const cache = await worker.cacheStorage.open("shrinkfox-assets-test");
  cache.values.set(`${ORIGIN}/_next/static/worker.js`, response);
  const result = await worker.fetch(new Request(`${ORIGIN}/_next/static/worker.js`));
  assert.equal(result?.url, "", "the worker must retain the requested #params location");
  assert.equal(await result?.text(), "bootstrap code");
});

test("failed mandatory precache rejects installation rather than offering broken offline support", async () => {
  const worker = runtime(async () => new Response("missing", { status: 404 }));
  await assert.rejects(worker.lifecycle("install"), /Precache failed/);
  assert.equal(worker.skips, 0);
});

test("activation removes only old app caches and preserves model caches", async () => {
  const worker = runtime(async () => new Response("asset"));
  for (const name of ["shrinkfox-shell-old", "shrinkfox-assets-old", "shrinkfox-pages-v1", "shrinkfox-shell-test", "shrinkfox-models-v1"])
    await worker.cacheStorage.open(name);
  await worker.lifecycle("activate");
  assert.deepEqual(await worker.cacheStorage.keys(), ["shrinkfox-shell-test", "shrinkfox-models-v1"]);
  assert.equal(worker.claims, 1);
});

test("updates activate only on a validated same-origin client request", async () => {
  const worker = runtime(async () => new Response("asset"));
  for (const value of [null, "SKIP_WAITING", {}, { type: "OTHER" }]) await worker.message(value);
  await worker.message({ type: "SKIP_WAITING" }, null);
  await worker.message({ type: "SKIP_WAITING" }, { url: "https://different.test/app" });
  await worker.message({ type: "SKIP_WAITING" }, { url: "invalid url" });
  assert.equal(worker.skips, 0);
  await worker.message({ type: "SKIP_WAITING" });
  assert.equal(worker.skips, 1);
});
