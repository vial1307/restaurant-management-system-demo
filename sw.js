const CACHE_NAME = "shitu-kitchen-os-v21";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest?v=21",
  "./src/app.js?v=21",
  "./src/supabase-config.js",
  "./src/supabase-client.js",
  "./src/supabase-auth-bridge.js?v=21",
  "./src/store.js",
  "./src/rules.js",
  "./src/i18n.js",
  "./src/locales.js",
  "./src/operations.js",
  "./src/management.js",
  "./src/skills.js",
  "./src/qr.js",
  "./src/styles.css?v=21",
  "./src/auth-layer.css?v=21",
  "./src/account-admin.css?v=21",
  "./src/auth-layer.js?v=21",
  "./src/search-i18n-layer.js?v=21",
  "./src/account-admin.js?v=21",
  "./src/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => name.startsWith("shitu-kitchen-os-") && name !== CACHE_NAME).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy));
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match("./index.html"))),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      }
      return response;
    })),
  );
});