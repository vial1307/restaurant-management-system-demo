// One-time cleanup for the retired Kitchen OS service worker.
// The old worker caused stale JavaScript and repeated controller/update reloads on iOS/Safari.
const RELEASE = document.querySelector('meta[name="kitchen-release"]')?.content || "development";
const CLEANUP_KEY = `shitu-kitchen-sw-cleanup-${RELEASE}`;

document.documentElement.dataset.release = RELEASE;

async function cleanupKitchenServiceWorker() {
  if (sessionStorage.getItem(CLEANUP_KEY) === "1") return;
  sessionStorage.setItem(CLEANUP_KEY, "1");

  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations
          .filter((registration) => {
            const url =
              registration.active?.scriptURL ||
              registration.waiting?.scriptURL ||
              registration.installing?.scriptURL ||
              "";
            return /\/sw\.js(?:\?|$)/.test(url);
          })
          .map((registration) => registration.unregister())
      );
    }
  } catch {}

  try {
    if ("caches" in globalThis) {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("shitu-kitchen-os-"))
          .map((name) => caches.delete(name))
      );
    }
  } catch {}
}

void cleanupKitchenServiceWorker();
