const CACHE_PREFIX = "shitu-kitchen-os-";
const CACHE_NAME = `${CACHE_PREFIX}v52`;
const VERSION = "52";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest?v=52",
  "./src/app.js?v=52",
  "./src/supabase-config.js?v=52",
  "./src/supabase-client.js?v=52",
  "./src/supabase-auth-bridge.js?v=52",
  "./src/inventory-cloud.js?v=52",
  "./src/inventory-transfer-service.js?v=52",
  "./src/inventory-operations.js?v=52",
  "./src/device-sync.js?v=52",
  "./src/store.js?v=52",
  "./src/rules.js?v=52",
  "./src/i18n.js?v=52",
  "./src/locales.js?v=52",
  "./src/operations.js?v=52",
  "./src/management.js?v=52",
  "./src/skills.js?v=52",
  "./src/qr.js?v=52",
  "./src/styles.css?v=52",
  "./src/auth-layer.css?v=52",
  "./src/account-admin.css?v=52",
  "./src/ui-refresh.css?v=52",
  "./src/mobile-browser-compat.css?v=52",
  "./src/auth-layer.js?v=52",
  "./src/search-i18n-layer.js?v=52",
  "./src/account-admin.js?v=52",
  "./src/ui-refresh.js?v=52",
  "./src/browser-compat.js?v=52",
  "./src/icon.svg?v=52",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL.map((url) => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      ),
      self.clients.claim(),
    ])
  );
});

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response && response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || (fallbackUrl ? await cache.match(fallbackUrl) : undefined) || Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request, { cache: "no-store" })
    .then(async (response) => {
      if (response && response.ok) await cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  return cached || (await network) || Response.error();
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(networkFirst(event.request, "./index.html"));
    return;
  }

  // JS/CSS/manifest must check network first so new releases appear immediately.
  if (/\.(?:js|css|webmanifest)$/i.test(url.pathname)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Static images/icons can remain fast while refreshing in background.
  event.respondWith(staleWhileRevalidate(event.request));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "GET_VERSION") event.source?.postMessage({ type: "SW_VERSION", version: VERSION });
});
