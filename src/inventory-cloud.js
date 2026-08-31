import { getSupabase, isSupabaseConfigured } from "./supabase-client.js";
import { DEFAULT_ITEMS, STORAGE_KEY, stockKeyFor } from "./store.js";

const AUTH_KEY = "shitu-kitchen-auth-v1";
const CENTRAL_KEY = "shitu-central-kitchen-stock-v1";
const CLOUD_FLAG_KEY = "shitu-inventory-cloud-v2";
const SYNC_DELAY = 180;
const POLL_MS = 15000;

const FUXING_STORAGE_CODES = {
  "large-freezer": "fuxing-large-freezer",
  "large-fridge": "fuxing-large-fridge",
  "four-door": "fuxing-four-door",
  "kitchen": "fuxing-kitchen",
};
const FUXING_CODE_TO_ZONE = Object.fromEntries(
  Object.entries(FUXING_STORAGE_CODES).map(([zone, code]) => [code, zone])
);
const CENTRAL_ZONE_CODES = {
  "央廚冷凍": "central-freezer",
  "央廚4門": "central-four-door",
  "央廚臥櫃": "central-chest",
  "央廚冷藏": "central-fridge",
};
const CENTRAL_CODE_TO_ZONE = Object.fromEntries(
  Object.entries(CENTRAL_ZONE_CODES).map(([zone, code]) => [code, zone])
);

let migrationAvailable = null;
let realtime = null;
let syncTimer = 0;
let polling = 0;
let syncing = false;
let lastSite = "";
const cache = {
  itemsByKey: new Map(),
  locationsByCode: new Map(),
};

function readJson(key, fallback = null) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function session() {
  return readJson(AUTH_KEY, null);
}

function role() {
  const s = session();
  return s?.accountRole || (s?.role === "admin" ? "admin" : s?.role === "central" ? "central" : "employee");
}

export function canDirectInventoryAdjust() {
  return ["admin", "manager", "supervisor"].includes(role());
}

function hasInventoryPermission(action = "view") {
  const s = session();
  if (!s) return false;
  if (s.role === "admin" || s.accountRole === "admin") return true;
  return Boolean(s.permissions?.inventory?.[action]);
}

function currentSite() {
  const s = session();
  if (!s) return "";
  if (s.location === "central") return "central";
  if (s.location === "fuxing") return "fuxing";
  if (s.location === "all") {
    return location.hash.startsWith("#inventory") && document.querySelector(".central-heading")
      ? "central"
      : "fuxing";
  }
  return "";
}

function siteFromLocationCode(code = "") {
  return String(code).startsWith("central-") ? "central" : "fuxing";
}

function dispatchStatus(status, detail = {}) {
  window.dispatchEvent(new CustomEvent("shitu:inventory-cloud-status", {
    detail: { status, ...detail },
  }));
}

function appState() {
  return readJson(STORAGE_KEY, null);
}

function selectedBranchRecord() {
  const state = appState();
  if (!state?.records) return { state: null, record: null };
  const record = state.records[state.selectedDate];
  return { state, record };
}

function buildFuxingCatalog() {
  const { record } = selectedBranchRecord();
  const inventory = Array.isArray(record?.inventory) && record.inventory.length
    ? record.inventory
    : DEFAULT_ITEMS;
  const work = Array.isArray(record?.workInventory) ? record.workInventory : [];
  const grouped = new Map();

  for (const entry of inventory) {
    const stockKey = entry.stockKey || stockKeyFor(entry);
    if (!grouped.has(stockKey)) {
      grouped.set(stockKey, {
        key: `fuxing:${stockKey}`,
        zh: entry.label || stockKey,
        vi: entry.labelVi || entry.label || stockKey,
        unit: entry.unit || "個",
        work_area: entry.workArea || "noodles",
        storage_only: Boolean(entry.storageOnly),
        locations: [],
      });
    }
    const item = grouped.get(stockKey);
    item.zh = entry.label || item.zh;
    item.vi = entry.labelVi || item.vi;
    item.unit = entry.unit || item.unit;
    item.work_area = entry.workArea || item.work_area;
    item.storage_only = Boolean(entry.storageOnly);
    const code = FUXING_STORAGE_CODES[entry.zone];
    if (code) {
      item.locations.push({
        code,
        quantity: Math.max(0, Number(entry.quantity) || 0),
        minimum: Math.max(0, Number(entry.minimum) || 0),
      });
    }
  }

  for (const entry of work) {
    const stockKey = entry.stockKey || String(entry.id || "").replace(/^work-/, "");
    const item = grouped.get(stockKey);
    if (!item) continue;
    const area = entry.workArea || item.work_area || "noodles";
    item.locations.push({
      code: `fuxing-work-${area}`,
      quantity: Math.max(0, Number(entry.quantity) || 0),
      minimum: Math.max(0, Number(entry.minimum) || 0),
    });
  }

  return [...grouped.values()];
}

function buildCentralCatalog(items) {
  if (!Array.isArray(items)) return [];
  return items.map((entry) => {
    const code = CENTRAL_ZONE_CODES[entry.zone];
    return {
      key: `central:${entry.id}`,
      zh: entry.zh || entry.id,
      vi: entry.vi || entry.zh || entry.id,
      unit: entry.unit || "個",
      work_area: "noodles",
      storage_only: true,
      locations: code ? [{
        code,
        quantity: Math.max(0, Number(entry.qty) || 0),
        minimum: Math.max(0, Number(entry.minimum) || 0),
      }] : [],
    };
  }).filter((entry) => entry.locations.length);
}

async function rpc(name, args = {}) {
  const supabase = await getSupabase();
  if (!supabase) return { data: null, error: new Error("SUPABASE_UNAVAILABLE") };
  return supabase.rpc(name, args);
}

async function verifyMigration() {
  if (migrationAvailable !== null) return migrationAvailable;
  if (!isSupabaseConfigured()) {
    migrationAvailable = false;
    return false;
  }
  try {
    const supabase = await getSupabase();
    const { error } = await supabase
      .from("inventory_items")
      .select("id,item_key")
      .limit(1);
    migrationAvailable = !error || !String(error.message || "").includes("item_key");
  } catch {
    migrationAvailable = false;
  }
  localStorage.setItem(CLOUD_FLAG_KEY, migrationAvailable ? "ready" : "migration-needed");
  dispatchStatus(migrationAvailable ? "ready" : "migration-needed");
  return migrationAvailable;
}

export async function bootstrapFuxingInventory() {
  if (!(await verifyMigration()) || role() !== "admin") return false;
  const catalog = buildFuxingCatalog();
  if (!catalog.length) return false;
  const { error } = await rpc("bootstrap_inventory_catalog", { p_items: catalog });
  if (error) {
    dispatchStatus("error", { error: error.message, stage: "bootstrap-fuxing" });
    return false;
  }
  return true;
}

export async function bootstrapCentralInventory(items = readJson(CENTRAL_KEY, [])) {
  if (!(await verifyMigration()) || role() !== "admin") return false;
  const catalog = buildCentralCatalog(items);
  if (!catalog.length) return false;
  const { error } = await rpc("bootstrap_inventory_catalog", { p_items: catalog });
  if (error) {
    dispatchStatus("error", { error: error.message, stage: "bootstrap-central" });
    return false;
  }
  return true;
}

async function fetchSite(site) {
  if (!(await verifyMigration()) || !hasInventoryPermission("view")) return [];

  const supabase = await getSupabase();
  const { data: locations, error: locError } = await supabase
    .from("inventory_locations")
    .select("id,code,name_zh_tw,name_vi,site,kind,sort_order")
    .eq("site", site)
    .eq("active", true)
    .order("sort_order", { ascending: true });
  if (locError) throw locError;
  if (!locations?.length) return [];

  cache.locationsByCode.clear();
  for (const loc of locations) cache.locationsByCode.set(loc.code, loc);

  const locationIds = locations.map((loc) => loc.id);
  const { data: stocks, error: stockError } = await supabase
    .from("inventory_stock")
    .select("item_id,location_id,quantity,minimum_quantity,updated_at")
    .in("location_id", locationIds);
  if (stockError) throw stockError;
  if (!stocks?.length) return [];

  const itemIds = [...new Set(stocks.map((row) => row.item_id))];
  const { data: items, error: itemError } = await supabase
    .from("inventory_items")
    .select("id,item_key,name_zh_tw,name_vi,unit,work_area,storage_only,active")
    .in("id", itemIds)
    .eq("active", true);
  if (itemError) throw itemError;

  const itemMap = new Map((items || []).map((item) => [item.id, item]));
  cache.itemsByKey.clear();
  for (const item of items || []) if (item.item_key) cache.itemsByKey.set(item.item_key, item);
  const locMap = new Map(locations.map((loc) => [loc.id, loc]));

  return stocks.map((stock) => ({
    ...stock,
    item: itemMap.get(stock.item_id),
    location: locMap.get(stock.location_id),
  })).filter((row) => row.item && row.location);
}

function applyCentral(rows) {
  if (!rows.length) return false;
  const previous = readJson(CENTRAL_KEY, []);
  const byId = new Map(previous.map((item) => [item.id, { ...item }]));

  for (const row of rows) {
    if (!row.item.item_key?.startsWith("central:")) continue;
    const id = row.item.item_key.slice("central:".length);
    const zone = CENTRAL_CODE_TO_ZONE[row.location.code];
    if (!zone) continue;
    const current = byId.get(id) || {
      id,
      zh: row.item.name_zh_tw,
      vi: row.item.name_vi,
      unit: row.item.unit,
      zone,
      qty: 0,
    };
    Object.assign(current, {
      zh: row.item.name_zh_tw,
      vi: row.item.name_vi,
      unit: row.item.unit,
      zone,
      qty: Number(row.quantity) || 0,
      minimum: Number(row.minimum_quantity) || 0,
      cloudItemId: row.item.id,
      cloudLocationId: row.location.id,
    });
    byId.set(id, current);
  }

  const next = [...byId.values()];
  const oldJson = JSON.stringify(previous);
  const nextJson = JSON.stringify(next);
  if (oldJson === nextJson) return false;
  localStorage.setItem(CENTRAL_KEY, nextJson);
  window.dispatchEvent(new CustomEvent("shitu:inventory-cloud-updated", {
    detail: { site: "central" },
  }));
  return true;
}

function applyFuxing(rows) {
  if (!rows.length) return false;
  const state = appState();
  if (!state?.records?.[state.selectedDate]) return false;
  const record = state.records[state.selectedDate];
  record.inventory ??= [];
  record.workInventory ??= [];

  let changed = false;
  for (const row of rows) {
    const key = row.item.item_key || "";
    if (!key.startsWith("fuxing:")) continue;
    const stockKey = key.slice("fuxing:".length);
    if (row.location.kind === "storage") {
      const zone = FUXING_CODE_TO_ZONE[row.location.code];
      if (!zone) continue;
      let target = record.inventory.find((entry) => entry.stockKey === stockKey && entry.zone === zone);
      if (!target) {
        target = {
          id: `${stockKey}-${zone}`,
          stockKey,
          label: row.item.name_zh_tw,
          labelVi: row.item.name_vi,
          unit: row.item.unit,
          workArea: row.item.work_area || "noodles",
          storageOnly: Boolean(row.item.storage_only),
          zone,
          quantity: 0,
          minimum: 0,
        };
        record.inventory.push(target);
        changed = true;
      }
      const quantity = Number(row.quantity) || 0;
      const minimum = Number(row.minimum_quantity) || 0;
      if (Number(target.quantity) !== quantity || Number(target.minimum) !== minimum) changed = true;
      Object.assign(target, {
        label: row.item.name_zh_tw,
        labelVi: row.item.name_vi,
        unit: row.item.unit,
        workArea: row.item.work_area || target.workArea || "noodles",
        storageOnly: Boolean(row.item.storage_only),
        quantity,
        minimum,
        cloudItemId: row.item.id,
        cloudLocationId: row.location.id,
      });
    } else if (row.location.kind === "work") {
      const area = row.location.code.replace("fuxing-work-", "");
      let target = record.workInventory.find((entry) => entry.stockKey === stockKey);
      if (!target) {
        target = {
          id: `work-${stockKey}`,
          stockKey,
          label: row.item.name_zh_tw,
          labelVi: row.item.name_vi,
          unit: row.item.unit,
          workArea: area || row.item.work_area || "noodles",
          quantity: 0,
          minimum: 0,
        };
        record.workInventory.push(target);
        changed = true;
      }
      const quantity = Number(row.quantity) || 0;
      const minimum = Number(row.minimum_quantity) || 0;
      if (Number(target.quantity) !== quantity || Number(target.minimum) !== minimum) changed = true;
      Object.assign(target, {
        label: row.item.name_zh_tw,
        labelVi: row.item.name_vi,
        unit: row.item.unit,
        workArea: area || row.item.work_area || target.workArea || "noodles",
        quantity,
        minimum,
        cloudItemId: row.item.id,
        cloudLocationId: row.location.id,
      });
    }
  }

  if (!changed) return false;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent("shitu:inventory-cloud-updated", {
    detail: { site: "fuxing" },
  }));
  return true;
}

export async function syncInventoryNow(site = currentSite(), { reloadBranch = true } = {}) {
  if (!site || syncing || !(await verifyMigration()) || !hasInventoryPermission("view")) return false;
  syncing = true;
  try {
    const rows = await fetchSite(site);
    const changed = site === "central" ? applyCentral(rows) : applyFuxing(rows);
    if (changed && site === "fuxing" && reloadBranch) {
      setTimeout(() => location.reload(), 40);
    }
    dispatchStatus("synced", { site, count: rows.length });
    return changed;
  } catch (error) {
    dispatchStatus("error", { site, error: error?.message || String(error) });
    return false;
  } finally {
    syncing = false;
  }
}

async function resolveIds(itemKey, locationCode) {
  if (!cache.itemsByKey.has(itemKey) || !cache.locationsByCode.has(locationCode)) {
    await fetchSite(siteFromLocationCode(locationCode));
  }
  return {
    item: cache.itemsByKey.get(itemKey),
    location: cache.locationsByCode.get(locationCode),
  };
}

export async function cloudAdjustQuantity({
  itemKey,
  locationCode,
  direction,
  amount,
  note = "",
}) {
  if (!(await verifyMigration()) || !hasInventoryPermission("edit")) return { ok: false, fallback: true };
  const resolved = await resolveIds(itemKey, locationCode);
  if (!resolved.item || !resolved.location) return { ok: false, fallback: true };
  const value = Math.max(0, Number(amount) || 0);
  if (!value) return { ok: false, fallback: false };
  const { error } = await rpc("adjust_inventory", {
    p_item_id: resolved.item.id,
    p_location_id: resolved.location.id,
    p_direction: direction,
    p_amount: value,
    p_note: note,
  });
  if (error) {
    dispatchStatus("error", { error: error.message, stage: "adjust" });
    return { ok: false, fallback: false, error };
  }
  await syncInventoryNow(siteFromLocationCode(locationCode), { reloadBranch: false });
  return { ok: true };
}

export async function cloudSetQuantity({
  itemKey,
  locationCode,
  quantity,
  note = "盤點調整 / Điều chỉnh kiểm kê",
}) {
  if (!(await verifyMigration()) || !canDirectInventoryAdjust()) return { ok: false, fallback: true };
  const resolved = await resolveIds(itemKey, locationCode);
  if (!resolved.item || !resolved.location) return { ok: false, fallback: true };
  const { error } = await rpc("set_inventory_quantity", {
    p_item_id: resolved.item.id,
    p_location_id: resolved.location.id,
    p_quantity: Math.max(0, Number(quantity) || 0),
    p_note: note,
  });
  if (error) {
    dispatchStatus("error", { error: error.message, stage: "set-quantity" });
    return { ok: false, fallback: false, error };
  }
  await syncInventoryNow(siteFromLocationCode(locationCode), { reloadBranch: false });
  return { ok: true };
}

export async function cloudSetMinimum({
  itemKey,
  locationCode,
  minimum,
}) {
  if (!(await verifyMigration()) || !canDirectInventoryAdjust()) return { ok: false, fallback: true };
  const resolved = await resolveIds(itemKey, locationCode);
  if (!resolved.item || !resolved.location) return { ok: false, fallback: true };
  const { error } = await rpc("set_inventory_minimum", {
    p_item_id: resolved.item.id,
    p_location_id: resolved.location.id,
    p_minimum: Math.max(0, Number(minimum) || 0),
  });
  if (error) {
    dispatchStatus("error", { error: error.message, stage: "set-minimum" });
    return { ok: false, fallback: false, error };
  }
  await syncInventoryNow(siteFromLocationCode(locationCode), { reloadBranch: false });
  return { ok: true };
}

export function fuxingLocationCode(zone) {
  return FUXING_STORAGE_CODES[zone] || "";
}

export function fuxingWorkLocationCode(area) {
  return ["noodles", "soup", "seafood", "meat"].includes(area)
    ? `fuxing-work-${area}`
    : "";
}

export function centralLocationCode(zone) {
  return CENTRAL_ZONE_CODES[zone] || "";
}

export function fuxingItemKey(stockKey) {
  return `fuxing:${stockKey}`;
}

export function centralItemKey(id) {
  return `central:${id}`;
}

export async function getCloudInventoryHistory(site = currentSite(), limit = 200) {
  if (!(await verifyMigration()) || !["admin", "manager", "supervisor"].includes(role())) return [];
  const supabase = await getSupabase();
  const { data: locations, error: locError } = await supabase
    .from("inventory_locations")
    .select("id,code,name_zh_tw,name_vi")
    .eq("site", site);
  if (locError || !locations?.length) return [];
  const locMap = new Map(locations.map((loc) => [loc.id, loc]));
  const ids = locations.map((loc) => loc.id);
  const { data: tx, error } = await supabase
    .from("inventory_transactions")
    .select("id,item_id,location_id,direction,amount,before_quantity,after_quantity,note,actor_id,created_at")
    .in("location_id", ids)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(500, Number(limit) || 200)));
  if (error || !tx?.length) return [];
  const itemIds = [...new Set(tx.map((entry) => entry.item_id))];
  const { data: items } = await supabase
    .from("inventory_items")
    .select("id,item_key,name_zh_tw,name_vi,unit")
    .in("id", itemIds);
  const itemMap = new Map((items || []).map((item) => [item.id, item]));
  return tx.map((entry) => ({
    ...entry,
    item: itemMap.get(entry.item_id),
    location: locMap.get(entry.location_id),
  }));
}

async function subscribeRealtime(site) {
  if (!(await verifyMigration()) || !site) return;
  const supabase = await getSupabase();
  if (realtime) {
    try { await supabase.removeChannel(realtime); } catch {}
  }
  lastSite = site;
  realtime = supabase
    .channel(`kitchen-os-inventory-${site}-${session()?.id || "user"}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "inventory_stock" }, () => {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(() => { void syncInventoryNow(lastSite); }, SYNC_DELAY);
    })
    .subscribe();
}

async function boot() {
  if (!isSupabaseConfigured() || !session()) return;
  if (!(await verifyMigration())) return;

  if (role() === "admin") {
    await bootstrapFuxingInventory();
    const central = readJson(CENTRAL_KEY, []);
    if (central.length) await bootstrapCentralInventory(central);
  }

  const site = currentSite();
  if (site) {
    await syncInventoryNow(site, { reloadBranch: false });
    await subscribeRealtime(site);
  }

  polling = window.setInterval(() => {
    if (document.visibilityState !== "visible") return;
    const nextSite = currentSite();
    if (!nextSite) return;
    if (nextSite !== lastSite) void subscribeRealtime(nextSite);
    void syncInventoryNow(nextSite);
  }, POLL_MS);
}

window.addEventListener("focus", () => { void syncInventoryNow(currentSite()); });
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void syncInventoryNow(currentSite());
});
window.addEventListener("hashchange", () => {
  const site = currentSite();
  if (site && site !== lastSite) void subscribeRealtime(site);
  setTimeout(() => { void syncInventoryNow(site); }, 80);
});
window.addEventListener("shitu:central-stock-ready", (event) => {
  if (role() === "admin") void bootstrapCentralInventory(event.detail?.items || readJson(CENTRAL_KEY, []));
});

void boot();
