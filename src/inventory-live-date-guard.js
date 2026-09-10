const STORAGE_KEY = "shitu-kitchen-os-v1";

function todayKey(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function routeFromHash(hash = globalThis.location?.hash || "") {
  const clean = String(hash).replace(/^#\/?/, "").split("?")[0];
  return clean || "dashboard";
}

function readState(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(storage?.getItem(STORAGE_KEY) || "null");
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function inventoryEntryNeedsToday(storage = globalThis.localStorage, now = new Date()) {
  const state = readState(storage);
  const selected = String(state?.selectedDate || "").trim();
  return Boolean(selected && selected !== todayKey(now));
}

let armed = false;
let retryTimer = 0;

function clearRetry() {
  if (!retryTimer) return;
  globalThis.clearTimeout?.(retryTimer);
  retryTimer = 0;
}

function tryActivateLiveInventory() {
  if (!armed || routeFromHash() !== "inventory") return false;
  if (!inventoryEntryNeedsToday()) {
    armed = false;
    clearRetry();
    return false;
  }

  const button = document.querySelector('[data-action="inventory-go-today"]');
  if (!button) {
    clearRetry();
    retryTimer = globalThis.setTimeout?.(tryActivateLiveInventory, 60) || 0;
    return false;
  }

  armed = false;
  clearRetry();
  button.click();
  window.dispatchEvent(new CustomEvent("shitu:inventory-live-date-restored", {
    detail: { date: todayKey() },
  }));
  return true;
}

function armForCurrentRoute() {
  clearRetry();
  armed = routeFromHash() === "inventory";
  if (armed) {
    retryTimer = globalThis.setTimeout?.(tryActivateLiveInventory, 0) || 0;
  }
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.addEventListener("hashchange", armForCurrentRoute);
  window.addEventListener("shitu:vps-auth-ready", () => {
    if (routeFromHash() === "inventory") armForCurrentRoute();
  });
  document.addEventListener("DOMContentLoaded", armForCurrentRoute, { once: true });
  armForCurrentRoute();
}
