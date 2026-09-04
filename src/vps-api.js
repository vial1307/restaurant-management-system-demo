const VPS_HOSTS = new Set(["82.47.180.185"]);
const LEGACY_STATIC_HOSTS = new Set(["vial1307.github.io"]);
const inventoryCache = new Map();
const INVENTORY_CACHE_MS = 1200;
const API_TIMEOUT_MS = 12000;

export function invalidateVpsInventoryCache(site = "") {
  if (site) inventoryCache.delete(site);
  else inventoryCache.clear();
}

export function isVpsApiConfigured() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  if (VPS_HOSTS.has(host)) return true;
  if (!/^https?:$/.test(window.location.protocol) || !host) return false;
  return !LEGACY_STATIC_HOSTS.has(host) && !host.endsWith(".github.io");
}

export async function apiRequest(path, {
  method = "GET",
  body,
  headers = {},
  allow404 = false,
  timeoutMs = API_TIMEOUT_MS,
} = {}) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || API_TIMEOUT_MS));
  let sessionAtStart = null;
  try {
    sessionAtStart = JSON.parse(localStorage.getItem("shitu-kitchen-auth-v1") || "null");
  } catch {}

  let response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (cause) {
    const code = controller.signal.aborted ? "REQUEST_TIMEOUT" : "API_UNREACHABLE";
    const error = new Error(code);
    error.code = code;
    error.cause = cause;
    throw error;
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  const type = response.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    try { data = await response.json(); } catch {}
  } else {
    try { data = await response.text(); } catch {}
  }

  if (!response.ok && !(allow404 && response.status === 404)) {
    const code = data && typeof data === "object" ? data.error : "";
    if (response.status === 401 && code === "AUTH_REQUIRED" && sessionAtStart?.id) {
      let currentSession = null;
      try { currentSession = JSON.parse(localStorage.getItem("shitu-kitchen-auth-v1") || "null"); } catch {}
      // A request started before a successful login must never remove the new
      // session when its stale 401 response arrives later.
      if (currentSession?.id === sessionAtStart.id) {
        try { localStorage.removeItem("shitu-kitchen-auth-v1"); } catch {}
        window.dispatchEvent(new CustomEvent("shitu:auth-expired", { detail: { path } }));
      }
    }
    const error = new Error(code || `HTTP_${response.status}`);
    error.status = response.status;
    error.code = code || "";
    error.payload = data;
    throw error;
  }

  return data;
}

export function vpsLogin(username, password) {
  return apiRequest("/api/auth/login", {
    method: "POST",
    body: { username, password },
  });
}

export function vpsMe() {
  return apiRequest("/api/auth/me");
}

export function vpsLogout() {
  return apiRequest("/api/auth/logout", { method: "POST" });
}

export function vpsChangePassword(currentPassword, newPassword) {
  return apiRequest("/api/auth/change-password", {
    method: "POST",
    body: { currentPassword, newPassword },
  });
}

export function vpsUpdatePreferences(preferredLanguage) {
  return apiRequest("/api/auth/preferences", {
    method: "POST",
    body: { preferredLanguage },
  });
}

export function vpsListUsers() {
  return apiRequest("/api/admin/users");
}

export function vpsSaveUser(body) {
  return apiRequest("/api/admin/users", { method: "POST", body });
}

export function vpsDeleteUser(id) {
  return apiRequest(`/api/admin/users/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function vpsBusinessState(site) {
  return apiRequest(`/api/business-state/${encodeURIComponent(site)}`);
}

export function vpsSaveBusinessState(site, modules) {
  return apiRequest(`/api/business-state/${encodeURIComponent(site)}`, {
    method: "POST",
    body: { modules },
    timeoutMs: 30000,
  });
}

export function vpsSchemaVersion() {
  return apiRequest("/api/inventory/schema-version");
}

export function vpsInventory(site, { force = false } = {}) {
  const key = String(site || "");
  const now = Date.now();
  const cached = inventoryCache.get(key);
  if (!force && cached && now - cached.at < INVENTORY_CACHE_MS) {
    return cached.promise;
  }

  const promise = apiRequest(`/api/inventory/${encodeURIComponent(key)}`)
    .catch((error) => {
      inventoryCache.delete(key);
      throw error;
    });

  inventoryCache.set(key, { at: now, promise });
  return promise;
}

export function vpsInventoryDestinations(source, sites = []) {
  const params = new URLSearchParams({
    source:String(source || ""),
    sites:[...new Set(sites.map(String).filter(Boolean))].join(","),
  });
  return apiRequest(`/api/inventory/destinations?${params.toString()}`);
}

export function vpsInventoryHistory(site, limit = 200) {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 200));
  return apiRequest(`/api/inventory/${encodeURIComponent(site)}/transactions?limit=${safeLimit}`);
}

export async function vpsAdjustInventory(body) {
  const result = await apiRequest("/api/inventory/adjust", { method: "POST", body });
  invalidateVpsInventoryCache(String(body?.locationCode || "").split("-")[0] || "");
  return result;
}

export async function vpsSetQuantity(body) {
  const result = await apiRequest("/api/inventory/set-quantity", { method: "POST", body });
  invalidateVpsInventoryCache("");
  return result;
}

export async function vpsSetMinimum(body) {
  const result = await apiRequest("/api/inventory/set-minimum", { method: "POST", body });
  invalidateVpsInventoryCache("");
  return result;
}

export async function vpsTransferInventory(body) {
  const result = await apiRequest("/api/inventory/transfer", { method: "POST", body });
  invalidateVpsInventoryCache("");
  return result;
}

export async function vpsDirectTransfer(body) {
  const result = await apiRequest("/api/inventory/direct-transfer", { method: "POST", body });
  invalidateVpsInventoryCache("");
  return result;
}

export function vpsReceiveDefaults({ sites = [], catalogKeys = [] } = {}) {
  const params = new URLSearchParams();
  if (sites.length) params.set("sites", sites.join(","));
  if (catalogKeys.length) params.set("catalogKeys", catalogKeys.join(","));
  const suffix = params.toString() ? `?${params}` : "";
  return apiRequest(`/api/inventory/receive-defaults${suffix}`);
}

export async function vpsSetReceiveDefault(body) {
  const result = await apiRequest("/api/inventory/receive-default", { method: "POST", body });
  invalidateVpsInventoryCache(String(body?.site || ""));
  return result;
}

export async function vpsSyncCatalog(item) {
  const result = await apiRequest("/api/inventory/catalog/sync", {
    method: "POST",
    body: { item },
  });
  invalidateVpsInventoryCache(String(item?.key || "").split(":")[0] || "");
  return result;
}

export async function vpsArchiveCatalogItem(itemKey) {
  const result = await apiRequest("/api/inventory/catalog/archive", {
    method: "POST",
    body: { itemKey },
  });
  invalidateVpsInventoryCache(String(itemKey || "").split(":")[0] || "");
  return result;
}
