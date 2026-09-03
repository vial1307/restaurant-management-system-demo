// Retirement worker for installations that still have the old offline cache.
// It clears Kitchen OS caches, unregisters itself and reloads controlled tabs
// through a versioned URL so Safari cannot reuse an obsolete interface.
const CACHE_PREFIX = "shitu-kitchen-os-";
const RELEASE = "85";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => name.startsWith(CACHE_PREFIX))
        .map((name) => caches.delete(name))
    );

    await self.registration.unregister();
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    await Promise.all(windows.map((client) => {
      const url = new URL(client.url);
      if (url.origin !== self.location.origin) return Promise.resolve();
      url.searchParams.set("release", RELEASE);
      return client.navigate(url.href);
    }));
  })());
});
