/** Emitted to public/sw.js by scripts/build-service-worker.ts. Never cache user files or API responses. */
const swScope = globalThis as unknown as ServiceWorkerGlobalScope;
const SW_VERSION = "__SW_VERSION__";
const CACHE_PREFIX = "shrinkfox-shell-";
const SHELL_CACHE = `${CACHE_PREFIX}${SW_VERSION}`;
const ASSET_CACHE = `shrinkfox-assets-${SW_VERSION}`;
const PUBLIC_ROUTES: ReadonlySet<string> = new Set(["__PUBLIC_ROUTES__"]);
const PRECACHE_ASSETS: readonly string[] = ["__PRECACHE_ASSETS__"];
const OFFLINE_PAGE = "/offline.html";
const STATIC_LIMIT = 180;

function isStaticAsset(url: URL): boolean {
  return url.origin === swScope.location.origin && !url.search && (
    url.pathname.startsWith("/_next/static/") ||
    /^\/wasm\/ort-wasm-simd-threaded\.(?:wasm|mjs)$/.test(url.pathname) ||
    /^\/samples\/still-life-(?:original\.jpg|optimized\.webp)$/.test(url.pathname) ||
    /^\/(?:icons|brand)\/[^/]+\.(?:png|svg|ico)$/.test(url.pathname)
  );
}

function useRequestedUrl(response: Response): Response {
  // A cached network response carries its original URL without the worker's
  // #params fragment. Returning it verbatim replaces self.location and breaks
  // Turbopack's worker bootstrap. An empty Response.url keeps the request URL.
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

async function remember(cacheName: string, request: Request | string, response: Response): Promise<void> {
  if (!response.ok || response.type === "opaque" ||
      /(?:^|,)\s*(?:private|no-store)\b/i.test(response.headers.get("cache-control") ?? "")) return;
  try {
    const cache = await caches.open(cacheName);
    await cache.put(request, response);
    if (cacheName === ASSET_CACHE) {
      const keys = await cache.keys();
      await Promise.all(keys.slice(0, Math.max(0, keys.length - STATIC_LIMIT)).map((key) => cache.delete(key)));
    }
  } catch {
    // Cache storage is optional: quota limits must not break an image operation.
  }
}

async function preparePage(pathname: "/" | "/app"): Promise<void> {
  try {
    const response = await fetch(pathname, { credentials: "omit", headers: { Accept: "text/html" } });
    if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) return;
    const html = await response.clone().text();
    await remember(SHELL_CACHE, pathname, response);
    const assets = new Set<string>();
    for (const match of html.matchAll(/(?:src|href)="([^"<>]+)"/g)) {
      if (!match[1]) continue;
      const url = new URL(match[1].replaceAll("&amp;", "&"), swScope.location.origin);
      if (isStaticAsset(url)) assets.add(url.href);
    }
    await Promise.allSettled([...assets].map(async (url) => {
      await remember(ASSET_CACHE, url, await fetch(url, { credentials: "omit" }));
    }));
  } catch {
    // The standalone offline page remains available if shell warming fails.
  }
}

swScope.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll([OFFLINE_PAGE, "/icons/icon-192.png", "/icons/icon-512.png", "/manifest.webmanifest"]);
    await Promise.all([preparePage("/"), preparePage("/app")]);
    await Promise.allSettled(PRECACHE_ASSETS.map(async (pathname) => {
      const url = new URL(pathname, swScope.location.origin);
      if (!isStaticAsset(url)) return;
      const assets = await caches.open(ASSET_CACHE);
      if (!await assets.match(url.href)) {
        await remember(ASSET_CACHE, url.href, await fetch(url.href, { credentials: "omit" }));
      }
    }));
    // Updated workers wait for existing tabs to close; never interrupt a batch.
  })());
});

swScope.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) =>
      (name.startsWith(CACHE_PREFIX) || name.startsWith("shrinkfox-assets-") || name.startsWith("shrinkfox-pages-")) &&
      name !== SHELL_CACHE && name !== ASSET_CACHE,
    ).map((name) => caches.delete(name)));
    await swScope.clients.claim();
  })());
});

swScope.addEventListener("message", (event) => {
  const message: unknown = event.data;
  if (!message || typeof message !== "object" || !("type" in message) || message.type !== "SKIP_WAITING") return;
  const source = event.source;
  if (!source || !("url" in source)) return;
  try {
    if (new URL(source.url).origin !== swScope.location.origin) return;
  } catch {
    return;
  }
  // The existing update UI sends this only after the user chooses to reload.
  event.waitUntil(swScope.skipWaiting());
});

swScope.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== swScope.location.origin || request.headers.has("Authorization")) return;
  // React Server Component payloads are not HTML, even when the pathname matches.
  if (request.headers.has("RSC") || url.searchParams.has("_rsc")) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (PUBLIC_ROUTES.has(url.pathname) && !url.search && response.ok &&
            response.headers.get("content-type")?.includes("text/html")) {
          event.waitUntil(remember(SHELL_CACHE, url.pathname, response.clone()));
        }
        return response;
      } catch {
        const cache = await caches.open(SHELL_CACHE);
        const cached = PUBLIC_ROUTES.has(url.pathname)
          ? await cache.match(url.pathname, { ignoreVary: true })
          : undefined;
        return cached ?? await cache.match(OFFLINE_PAGE) ?? Response.error();
      }
    })());
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(ASSET_CACHE);
      const cached = await cache.match(request);
      if (cached) return useRequestedUrl(cached);
      const response = await fetch(request);
      event.waitUntil(remember(ASSET_CACHE, request, response.clone()));
      return response;
    })());
  }
});
