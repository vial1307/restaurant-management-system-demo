const VPS_HOSTS = new Set(["82.47.180.185"]);
const LEGACY_STATIC_HOSTS = new Set(["vial1307.github.io"]);
const inventoryCache = new Map();
const receiveDefaultsCache = new Map();
const INVENTORY_CACHE_MS = 1200;
const RECEIVE_DEFAULTS_CACHE_MS = 5000;
const API_TIMEOUT_MS = 12000;
const AUTH_LOGIN_GRACE_MS = 5000;
let lastSuccessfulLoginAt = 0;
let authMeInFlight = null;
let adminUsersInFlight = null;

export function invalidateVpsInventoryCache(site = "") {
  if (site) inventoryCache.delete(site);
  else inventoryCache.clear();
}

export function invalidateVpsReceiveDefaultsCache() {
  receiveDefaultsCache.clear();
}

function clearRuntimeCaches() {
  invalidateVpsInventoryCache("");
  invalidateVpsReceiveDefaultsCache();
  authMeInFlight = null;
  adminUsersInFlight = null;
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
    const insideLoginGrace = lastSuccessfulLoginAt > 0 && Date.now() - lastSuccessfulLoginAt < AUTH_LOGIN_GRACE_MS;
    if (response.status === 401 && code === "AUTH_REQUIRED" && sessionAtStart?.id && !insideLoginGrace) {
      let currentSession = null;
      try { currentSession = JSON.parse(localStorage.getItem("shitu-kitchen-auth-v1") || "null"); } catch {}
      if (currentSession?.id === sessionAtStart.id) {
        try { localStorage.removeItem("shitu-kitchen-auth-v1"); } catch {}
        clearRuntimeCaches();
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

export async function vpsLogin(username, password) {
  clearRuntimeCaches();
  const result = await apiRequest("/api/auth/login", {
    method: "POST",
    body: { username, password },
  });
  lastSuccessfulLoginAt = Date.now();
  return result;
}

export function vpsMe() {
  if (authMeInFlight) return authMeInFlight;
  let pending;
  pending = apiRequest("/api/auth/me").finally(() => {
    if (authMeInFlight === pending) authMeInFlight = null;
  });
  authMeInFlight = pending;
  return pending;
}

export async function vpsLogout() {
  try {
    return await apiRequest("/api/auth/logout", { method: "POST" });
  } finally {
    lastSuccessfulLoginAt = 0;
    clearRuntimeCaches();
  }
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
  if (adminUsersInFlight) return adminUsersInFlight;
  let pending;
  pending = apiRequest("/api/admin/users").finally(() => {
    if (adminUsersInFlight === pending) adminUsersInFlight = null;
  });
  adminUsersInFlight = pending;
  return pending;
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
    source: String(source || ""),
    sites: (sites || []).map(String).filter(Boolean).join(","),
  });
  return apiRequest(`/api/inventory/destinations?${params}`);
}

export function vpsInventoryHistory(site, { limit = 250 } = {}) {
  return apiRequest(`/api/inventory/${encodeURIComponent(site)}/transactions?limit=${encodeURIComponent(limit)}`);
}

export function vpsSetQuantity(body) {
  return apiRequest("/api/inventory/set-quantity", { method: "POST", body });
}

export const vpsSetInventoryQuantity = vpsSetQuantity;

export function vpsSetMinimum(body) {
  return apiRequest("/api/inventory/set-minimum", { method: "POST", body });
}

export const vpsSetInventoryMinimum = vpsSetMinimum;

export function vpsAdjustInventory(body) {
  return apiRequest("/api/inventory/adjust", { method: "POST", body });
}

export function vpsTransferInventory(body) {
  return apiRequest("/api/inventory/transfer", { method: "POST", body });
}

export async function vpsDirectTransfer(body) {
  const result = await apiRequest("/api/inventory/direct-transfer", { method: "POST", body });
  invalidateVpsInventoryCache("");
  return result;
}

export function vpsShipInventory(body) {
  return apiRequest("/api/inventory/ship", { method: "POST", body });
}

export async function vpsSyncCatalog(item) {
  const result = await apiRequest("/api/inventory/catalog/sync", {
    method: "POST",
    body: { item },
  });
  invalidateVpsInventoryCache("");
  invalidateVpsReceiveDefaultsCache();
  return result;
}

export function vpsSaveInventoryItem(body) {
  const item = body?.item || body;
  return vpsSyncCatalog(item);
}

export async function vpsArchiveCatalogItem(itemKey) {
  const result = await apiRequest("/api/inventory/catalog/archive", {
    method: "POST",
    body: { itemKey: String(itemKey || "") },
  });
  invalidateVpsInventoryCache("");
  invalidateVpsReceiveDefaultsCache();
  return result;
}

export function vpsArchiveInventoryItem(body) {
  return vpsArchiveCatalogItem(body?.itemKey || body);
}

export function vpsReceiveDefaults({ sites = [], catalogKeys = [] } = {}) {
  const normalizedSites = [...new Set((sites || []).map(String).filter(Boolean))].sort();
  const normalizedCatalogKeys = [...new Set((catalogKeys || []).map(String).filter(Boolean))].sort();
  const params = new URLSearchParams();
  if (normalizedSites.length) params.set("sites", normalizedSites.join(","));
  if (normalizedCatalogKeys.length) params.set("catalogKeys", normalizedCatalogKeys.join(","));
  const key = params.toString();
  const now = Date.now();
  const cached = receiveDefaultsCache.get(key);
  if (cached && now - cached.at < RECEIVE_DEFAULTS_CACHE_MS) return cached.promise;
  const promise = apiRequest(`/api/inventory/receive-defaults${key ? `?${key}` : ""}`)
    .catch((error) => {
      receiveDefaultsCache.delete(key);
      throw error;
    });
  receiveDefaultsCache.set(key, { at: now, promise });
  return promise;
}

export async function vpsSetReceiveDefault(body) {
  const result = await apiRequest("/api/inventory/receive-default", { method: "POST", body });
  invalidateVpsReceiveDefaultsCache();
  return result;
}

export function vpsHealth() {
  return apiRequest("/api/health");
}
