const sites = new Map();
const snapshots = new Map();

function normalizedMetadata(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizedSite(row) {
  if (!row?.code) return null;
  return {
    ...row,
    code:String(row.code),
    metadata:normalizedMetadata(row.metadata),
  };
}

function normalizedLocation(row) {
  if (!row?.code || !row?.site) return null;
  return {
    ...row,
    code:String(row.code),
    site:String(row.site),
    kind:String(row.kind || "storage"),
    metadata:normalizedMetadata(row.metadata),
  };
}

function normalizedWorkArea(row) {
  if (!row?.code) return null;
  return {
    ...row,
    code:String(row.code),
    metadata:normalizedMetadata(row.metadata),
  };
}

function assertMasterSnapshotReady(site, locations) {
  const mode = String(site?.metadata?.inventory_mode || "");
  if (!site?.code || !["central","branch"].includes(mode)) {
    throw new Error("INVENTORY_MASTER_DATA_NOT_READY");
  }
  const invalidLocation = locations.find((location) =>
    location.active !== false && !String(location.metadata?.ui_key || "").trim()
  );
  if (invalidLocation) throw new Error("INVENTORY_LOCATION_UI_KEY_REQUIRED");
}

export function replaceInventorySites(rows = []) {
  sites.clear();
  for (const row of Array.isArray(rows) ? rows : []) {
    const site = normalizedSite(row);
    if (site) sites.set(site.code, site);
  }
  return inventorySites();
}

export function inventorySites() {
  return [...sites.values()].sort((a,b) =>
    Number(a.sort_order || 0) - Number(b.sort_order || 0) || a.code.localeCompare(b.code)
  );
}

export function inventorySite(code) {
  return sites.get(String(code || "")) || null;
}

export function isKnownInventorySite(code) {
  return sites.has(String(code || ""));
}

export function inventoryMode(code) {
  return String(inventorySite(code)?.metadata?.inventory_mode || "");
}

export function isBranchInventorySite(code) {
  return inventoryMode(code) === "branch";
}

export function firstInventorySite(mode = "") {
  return inventorySites().find((site) => !mode || inventoryMode(site.code) === mode)?.code || "";
}

export function replaceInventoryMasterSnapshot(siteCode, snapshot = {}) {
  const code = String(siteCode || snapshot?.site?.code || "");
  if (!code) return null;
  const site = normalizedSite(snapshot.site || inventorySite(code) || { code });
  const locations = (Array.isArray(snapshot.locations) ? snapshot.locations : [])
    .map(normalizedLocation)
    .filter(Boolean);
  const workAreas = (Array.isArray(snapshot.workAreas) ? snapshot.workAreas : [])
    .map(normalizedWorkArea)
    .filter(Boolean);
  assertMasterSnapshotReady(site, locations);
  sites.set(code, site);
  const next = { site, locations, workAreas };
  snapshots.set(code, next);
  return next;
}

export function inventoryMasterSnapshot(siteCode) {
  return snapshots.get(String(siteCode || "")) || null;
}

export function inventoryLocations(siteCode, kind = "") {
  const rows = inventoryMasterSnapshot(siteCode)?.locations || [];
  return rows
    .filter((row) => row.active !== false && (!kind || row.kind === kind))
    .sort((a,b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || a.code.localeCompare(b.code));
}

export function inventoryWorkAreas(siteCode) {
  return [...(inventoryMasterSnapshot(siteCode)?.workAreas || [])]
    .filter((row) => row.active !== false)
    .sort((a,b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || a.code.localeCompare(b.code));
}

export function inventoryLocationUiKey(location) {
  const value = String(location?.metadata?.ui_key || "").trim();
  return value || String(location?.code || "");
}

export function inventoryLocationWorkArea(location) {
  return String(location?.metadata?.work_area || "").trim();
}

export function inventoryStorageGroup(location) {
  return String(location?.metadata?.storage_group || "service").trim() || "service";
}

export function inventoryLocationByCode(code) {
  const wanted = String(code || "");
  if (!wanted) return null;
  for (const snapshot of snapshots.values()) {
    const row = snapshot.locations.find((location) => location.code === wanted && location.active !== false);
    if (row) return row;
  }
  return null;
}

export function inventoryLocationByUiKey(siteCode, uiKey, kind = "storage") {
  const wanted = String(uiKey || "");
  return inventoryLocations(siteCode, kind).find((location) => inventoryLocationUiKey(location) === wanted) || null;
}

export function inventoryWorkLocation(siteCode, workArea) {
  const wanted = String(workArea || "");
  return inventoryLocations(siteCode, "work").find((location) =>
    inventoryLocationWorkArea(location) === wanted || inventoryLocationUiKey(location) === wanted
  ) || null;
}

export function inventorySiteForLocationCode(code) {
  return inventoryLocationByCode(code)?.site || "";
}

export function inventoryUiGroups(siteCode) {
  const storage = inventoryLocations(siteCode, "storage").map((location) => ({
    id:inventoryLocationUiKey(location),
    zh:location.name_zh_tw || inventoryLocationUiKey(location),
    vi:location.name_vi || location.name_zh_tw || inventoryLocationUiKey(location),
    code:location.code,
    storageGroup:inventoryStorageGroup(location),
  }));
  const workAreas = inventoryWorkAreas(siteCode).map((area) => ({
    id:area.code,
    zh:area.name_zh_tw || area.code,
    vi:area.name_vi || area.name_zh_tw || area.code,
  }));
  return { storage, workAreas };
}
