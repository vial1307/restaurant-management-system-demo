const VPS_HOSTS = new Set(["82.47.180.185"]);

export function isVpsApiConfigured() {
  if (typeof window === "undefined") return false;
  return VPS_HOSTS.has(window.location.hostname);
}

export async function apiRequest(path, {
  method = "GET",
  body,
  headers = {},
  allow404 = false,
} = {}) {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let data = null;
  const type = response.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    try { data = await response.json(); } catch {}
  } else {
    try { data = await response.text(); } catch {}
  }

  if (!response.ok && !(allow404 && response.status === 404)) {
    const code = data && typeof data === "object" ? data.error : "";
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

export function vpsListUsers() {
  return apiRequest("/api/admin/users");
}

export function vpsSaveUser(body) {
  return apiRequest("/api/admin/users", { method: "POST", body });
}

export function vpsDeleteUser(id) {
  return apiRequest(`/api/admin/users/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function vpsSchemaVersion() {
  return apiRequest("/api/inventory/schema-version");
}

export function vpsInventory(site) {
  return apiRequest(`/api/inventory/${encodeURIComponent(site)}`);
}

export function vpsInventoryHistory(site, limit = 200) {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 200));
  return apiRequest(`/api/inventory/${encodeURIComponent(site)}/transactions?limit=${safeLimit}`);
}

export function vpsAdjustInventory(body) {
  return apiRequest("/api/inventory/adjust", { method: "POST", body });
}

export function vpsSetQuantity(body) {
  return apiRequest("/api/inventory/set-quantity", { method: "POST", body });
}

export function vpsSetMinimum(body) {
  return apiRequest("/api/inventory/set-minimum", { method: "POST", body });
}

export function vpsTransferInventory(body) {
  return apiRequest("/api/inventory/transfer", { method: "POST", body });
}

export function vpsDirectTransfer(body) {
  return apiRequest("/api/inventory/direct-transfer", { method: "POST", body });
}

export function vpsReceiveDefaults({ sites = [], catalogKeys = [] } = {}) {
  const params = new URLSearchParams();
  if (sites.length) params.set("sites", sites.join(","));
  if (catalogKeys.length) params.set("catalogKeys", catalogKeys.join(","));
  const suffix = params.toString() ? `?${params}` : "";
  return apiRequest(`/api/inventory/receive-defaults${suffix}`);
}

export function vpsSetReceiveDefault(body) {
  return apiRequest("/api/inventory/receive-default", { method: "POST", body });
}

export function vpsSyncCatalog(item) {
  return apiRequest("/api/inventory/catalog/sync", {
    method: "POST",
    body: { item },
  });
}

export function vpsArchiveCatalogItem(itemKey) {
  return apiRequest("/api/inventory/catalog/archive", {
    method: "POST",
    body: { itemKey },
  });
}
