import { getSupabase, isSupabaseConfigured } from "./supabase-client.js";
import { DEFAULT_ITEMS, STORAGE_KEY, stockKeyFor } from "./store.js";

const AUTH_KEY = "shitu-kitchen-auth-v1";
const CENTRAL_KEY = "shitu-central-kitchen-stock-v1";
const CLOUD_FLAG_KEY = "shitu-inventory-cloud-v2";
const ACTIVE_SITE_KEY = "shitu-admin-active-site-v1";
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
const YONGJI_STORAGE_CODES = {
  "large-freezer": "yongji-large-freezer",
  "large-fridge": "yongji-large-fridge",
  "four-door": "yongji-four-door",
  "kitchen": "yongji-kitchen",
};
const YONGJI_CODE_TO_ZONE = Object.fromEntries(
  Object.entries(YONGJI_STORAGE_CODES).map(([zone, code]) => [code, zone])
);
const BRANCH_STORAGE_CODES = { fuxing: FUXING_STORAGE_CODES, yongji: YONGJI_STORAGE_CODES };
const BRANCH_CODE_TO_ZONE = { fuxing: FUXING_CODE_TO_ZONE, yongji: YONGJI_CODE_TO_ZONE };
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
let bootedUserId = "";
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

function hasInventoryPermission(action = "view") {
  const s = session();
  if (!s) return false;
  if (s.role === "admin" || s.accountRole === "admin") return true;
  return Boolean(s.permissions?.inventory?.[action]);
}

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isCurrentBranchInventoryDate() {
  const state = appState();
  return Boolean(state?.selectedDate && state.selectedDate === todayKey());
}

export function inventoryCloudState() {
  return localStorage.getItem(CLOUD_FLAG_KEY) || "checking";
}

export function canInventoryEdit() {
  if (!hasInventoryPermission("edit")) return false;
  if (inventoryCloudState() !== "ready") return false;
  if (globalThis.navigator?.onLine === false) return false;
  const site = currentSite();
  return !["fuxing","yongji"].includes(site) || isCurrentBranchInventoryDate();
}

export function canInventoryDraftCount() {
  return hasInventoryPermission("edit") && inventoryCloudState() !== "ready";
}

export function canDirectInventoryAdjust() {
  return canInventoryEdit() && role() === "admin";
}

export function activeInventorySite() {
  const s = session();
  if (!s) return "";
  if (["central","fuxing","yongji"].includes(s.location)) return s.location;
  if (s.location === "all") {
    const saved = localStorage.getItem(ACTIVE_SITE_KEY);
    if (["central","fuxing","yongji"].includes(saved)) return saved;
    return document.querySelector(".central-heading") ? "central" : "fuxing";
  }
  return "";
}

export function setActiveInventorySite(site) {
  const s = session();
  if (s?.location !== "all" || !["central","fuxing","yongji"].includes(site)) return false;
  localStorage.setItem(ACTIVE_SITE_KEY, site);
  return true;
}

function currentSite() {
  return activeInventorySite();
}

function siteFromLocationCode(code = "") {
  const value = String(code);
  if (value.startsWith("central-")) return "central";
  if (value.startsWith("yongji-")) return "yongji";
  return "fuxing";
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

function currentBranchRecord() {
  const state = appState();
  if (!state?.records) return { state: null, record: null };
  const date = todayKey();
  return { state, record: state.records[date] || null };
}

function catalogKey(label) {
  return String(label || "").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu,"");
}

function buildBranchCatalog(site = "fuxing", { zeroQuantities = false } = {}) {
  const { record } = currentBranchRecord();
  if (!record || !["fuxing","yongji"].includes(site)) return [];
  const inventory = Array.isArray(record?.inventory) && record.inventory.length
    ? record.inventory
    : DEFAULT_ITEMS;
  const work = Array.isArray(record?.workInventory) ? record.workInventory : [];
  const grouped = new Map();
  const storageCodes = BRANCH_STORAGE_CODES[site];

  for (const entry of inventory) {
    const stockKey = entry.stockKey || stockKeyFor(entry);
    if (!grouped.has(stockKey)) {
      grouped.set(stockKey, {
        key: `${site}:${stockKey}`,
        catalog_key: catalogKey(entry.label || stockKey),
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
    item.catalog_key = catalogKey(item.zh);
    item.unit = entry.unit || item.unit;
    item.work_area = entry.workArea || item.work_area;
    item.storage_only = Boolean(entry.storageOnly);
    const code = storageCodes?.[entry.zone];
    if (code) {
      item.locations.push({
        code,
        quantity: zeroQuantities ? 0 : Math.max(0, Number(entry.quantity) || 0),
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
      code: `${site}-work-${area}`,
      quantity: zeroQuantities ? 0 : Math.max(0, Number(entry.quantity) || 0),
      minimum: Math.max(0, Number(entry.minimum) || 0),
    });
  }

  return [...grouped.values()];
}

function buildCentralCatalog(items) {
  if (!Array.isArray(items)) return [];
  const grouped=new Map();
  for(const entry of items){
    const baseId=entry.baseId || String(entry.id||"").split("@")[0];
    const key=entry.itemKey || `central:${baseId}`;
    if(!grouped.has(key)){
      grouped.set(key,{
        key,
        catalog_key:catalogKey(entry.zh || baseId),
        zh:entry.zh || baseId,
        vi:entry.vi || entry.zh || baseId,
        unit:entry.unit || "個",
        work_area:entry.workArea || entry.work_area || "noodles",
        storage_only:true,
        locations:[],
      });
    }
    const item=grouped.get(key);
    const code=CENTRAL_ZONE_CODES[entry.zone];
    if(code && !item.locations.some((location)=>location.code===code)){
      item.locations.push({
        code,
        quantity:Math.max(0,Number(entry.qty)||0),
        minimum:Math.max(0,Number(entry.minimum)||0),
      });
    }
  }
  return [...grouped.values()].filter((entry)=>entry.locations.length);
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

  const prior = localStorage.getItem(CLOUD_FLAG_KEY);
  if (globalThis.navigator?.onLine === false && prior === "ready") {
    // Once cloud mode has been enabled, never downgrade to local-authoritative writes just because the device is offline.
    migrationAvailable = true;
    dispatchStatus("offline");
    return true;
  }

  try {
    const supabase = await getSupabase();
    const { data: version, error } = await supabase.rpc("kitchen_inventory_schema_version");
    if (!error && Number(version) >= 7) {
      migrationAvailable = true;
      localStorage.setItem(CLOUD_FLAG_KEY, "ready");
      dispatchStatus("ready");
      return true;
    }
    // A previously validated cloud database remains authoritative during temporary API/network failures.
    if (prior === "ready" && error) {
      migrationAvailable = true;
      dispatchStatus("unreachable", { error: error.message });
      return true;
    }
  } catch (error) {
    if (prior === "ready") {
      migrationAvailable = true;
      dispatchStatus("unreachable", { error: error?.message || String(error) });
      return true;
    }
  }

  migrationAvailable = false;
  localStorage.setItem(CLOUD_FLAG_KEY, "migration-needed");
  dispatchStatus("migration-needed");
  return false;
}

export async function bootstrapFuxingInventory() {
  if (!(await verifyMigration()) || role() !== "admin") return false;
  const catalog = buildBranchCatalog("fuxing");
  if (!catalog.length) return false;
  const { error } = await rpc("bootstrap_inventory_catalog", { p_items: catalog });
  if (error) {
    dispatchStatus("error", { error: error.message, stage: "bootstrap-fuxing" });
    return false;
  }
  return true;
}

export async function bootstrapYongjiInventory() {
  if (!(await verifyMigration()) || role() !== "admin") return false;
  const catalog = buildBranchCatalog("yongji", { zeroQuantities: true });
  if (!catalog.length) return false;
  const { error } = await rpc("bootstrap_inventory_catalog", { p_items: catalog });
  if (error) {
    dispatchStatus("error", { error: error.message, stage: "bootstrap-yongji" });
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
    .select("id,item_key,catalog_key,name_zh_tw,name_vi,unit,work_area,storage_only,active")
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

export async function getSiteInventoryRows(site = currentSite()) {
  if (!["central","fuxing","yongji"].includes(site)) return [];
  return fetchSite(site);
}

export async function getSiteLocations(site = currentSite(), kind = "storage") {
  if (!(await verifyMigration()) || !hasInventoryPermission("view")) return [];
  const supabase = await getSupabase();
  const query = supabase
    .from("inventory_locations")
    .select("id,code,name_zh_tw,name_vi,site,kind,sort_order")
    .eq("site",site)
    .eq("active",true)
    .order("sort_order",{ascending:true});
  const { data, error } = kind ? await query.eq("kind",kind) : await query;
  if (error) throw error;
  return data || [];
}

function applyCentral(rows) {
  if (!rows.length) return false;
  const previous = readJson(CENTRAL_KEY, []);
  const next=[];

  for (const row of rows) {
    if (row.location.kind !== "storage") continue;
    if (!row.item.item_key?.startsWith("central:")) continue;
    const baseId = row.item.item_key.slice("central:".length);
    const zone = CENTRAL_CODE_TO_ZONE[row.location.code];
    if (!zone) continue;
    next.push({
      id:`${baseId}@${row.location.code}`,
      baseId,
      itemKey:row.item.item_key,
      catalogKey:row.item.catalog_key,
      zh:row.item.name_zh_tw,
      vi:row.item.name_vi,
      unit:row.item.unit,
      workArea:row.item.work_area || "noodles",
      zone,
      qty:Number(row.quantity)||0,
      minimum:Number(row.minimum_quantity)||0,
      cloudItemId:row.item.id,
      cloudLocationId:row.location.id,
    });
  }

  next.sort((a,b)=>String(a.zh).localeCompare(String(b.zh),"zh-Hant") || String(a.zone).localeCompare(String(b.zone),"zh-Hant"));
  const oldJson=JSON.stringify(previous);
  const nextJson=JSON.stringify(next);
  if(oldJson===nextJson) return false;
  localStorage.setItem(CENTRAL_KEY,nextJson);
  window.dispatchEvent(new CustomEvent("shitu:inventory-cloud-updated",{detail:{site:"central"}}));
  return true;
}

function applyBranch(rows, site) {
  if (!rows.length || !["fuxing","yongji"].includes(site)) return false;
  const state=appState();
  if(!state?.records?.[state.selectedDate] || state.selectedDate!==todayKey()) return false;
  const record=state.records[state.selectedDate];
  const codeToZone=BRANCH_CODE_TO_ZONE[site];
  const inventory=[];
  const workMap=new Map();

  for(const row of rows){
    const key=row.item.item_key||"";
    if(!key.startsWith(`${site}:`)) continue;
    const stockKey=key.slice(site.length+1);
    if(row.location.kind==="storage"){
      const zone=codeToZone?.[row.location.code];
      if(!zone) continue;
      inventory.push({
        id:`${stockKey}-${zone}`,
        stockKey,
        label:row.item.name_zh_tw,
        labelVi:row.item.name_vi,
        unit:row.item.unit,
        workArea:row.item.work_area||"noodles",
        storageOnly:Boolean(row.item.storage_only),
        zone,
        quantity:Number(row.quantity)||0,
        minimum:Number(row.minimum_quantity)||0,
        cloudItemId:row.item.id,
        cloudLocationId:row.location.id,
      });
    }else if(row.location.kind==="work"){
      const area=row.location.code.replace(`${site}-work-`,"");
      workMap.set(stockKey,{
        id:`work-${stockKey}`,
        stockKey,
        label:row.item.name_zh_tw,
        labelVi:row.item.name_vi,
        unit:row.item.unit,
        workArea:area||row.item.work_area||"noodles",
        quantity:Number(row.quantity)||0,
        minimum:Number(row.minimum_quantity)||0,
        cloudItemId:row.item.id,
        cloudLocationId:row.location.id,
      });
    }
  }

  inventory.sort((a,b)=>String(a.label).localeCompare(String(b.label),"zh-Hant") || String(a.zone).localeCompare(String(b.zone)));
  const workInventory=[...workMap.values()].sort((a,b)=>String(a.label).localeCompare(String(b.label),"zh-Hant"));
  const before=JSON.stringify({inventory:record.inventory||[],workInventory:record.workInventory||[]});
  const after=JSON.stringify({inventory,workInventory});
  if(before===after) return false;
  record.inventory=inventory;
  record.workInventory=workInventory;
  record.updatedAt=new Date().toISOString();
  localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
  window.dispatchEvent(new CustomEvent("shitu:inventory-cloud-updated",{detail:{site}}));
  return true;
}

export async function syncInventoryNow(site = currentSite(), { reloadBranch = true } = {}) {
  if (!site || syncing || !(await verifyMigration()) || !hasInventoryPermission("view")) return false;
  if (["fuxing","yongji"].includes(site) && !isCurrentBranchInventoryDate()) {
    dispatchStatus("historical-readonly", { site });
    return false;
  }
  syncing = true;
  try {
    const rows = await fetchSite(site);
    const changed = site === "central" ? applyCentral(rows) : applyBranch(rows, site);
    if (changed && ["fuxing","yongji"].includes(site) && reloadBranch) {
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
  if (!(await verifyMigration())) return { ok: false, fallback: true };
  if (!canInventoryEdit()) return { ok: false, fallback: false, error: new Error("INVENTORY_EDIT_NOT_ALLOWED") };
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
  if (!(await verifyMigration())) return { ok: false, fallback: true };
  if (!canDirectInventoryAdjust()) return { ok: false, fallback: false, error: new Error("DIRECT_ADJUST_NOT_ALLOWED") };
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
  if (!(await verifyMigration())) return { ok: false, fallback: true };
  if (!canDirectInventoryAdjust()) return { ok: false, fallback: false, error: new Error("MINIMUM_EDIT_NOT_ALLOWED") };
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


export async function cloudTransferInventory({
  itemKey,
  sourceLocationCode,
  destinationLocationCode,
  amount,
  note = "庫存轉撥 / Chuyển kho",
}) {
  if (!(await verifyMigration())) return { ok: false, fallback: true };
  if (!canInventoryEdit()) return { ok: false, fallback: false, error: new Error("INVENTORY_EDIT_NOT_ALLOWED") };

  const source = await resolveIds(itemKey, sourceLocationCode);
  const destination = await resolveIds(itemKey, destinationLocationCode);
  if (!source.item || !source.location || !destination.location) return { ok: false, fallback: true };

  const value = Math.max(0, Number(amount) || 0);
  if (!value) return { ok: false, fallback: false };

  const { error } = await rpc("transfer_inventory", {
    p_item_id: source.item.id,
    p_source_location_id: source.location.id,
    p_destination_location_id: destination.location.id,
    p_amount: value,
    p_note: note,
  });
  if (error) {
    dispatchStatus("error", { error: error.message, stage: "transfer" });
    return { ok: false, fallback: false, error };
  }

  await syncInventoryNow(siteFromLocationCode(sourceLocationCode), { reloadBranch: false });
  return { ok: true };
}

export async function reconcileFuxingSnapshot(note = "同步庫存 / Đồng bộ tồn kho") {
  if (!(await verifyMigration())) return { ok: false, fallback: true };
  if (!canInventoryEdit()) return { ok: false, fallback: false, error: new Error("INVENTORY_EDIT_NOT_ALLOWED") };
  const rows = await fetchSite("fuxing");
  const { record } = selectedBranchRecord();
  if (!record) return { ok: false, fallback: true };

  const local = new Map();
  for (const entry of record.inventory || []) {
    const stockKey = entry.stockKey || stockKeyFor(entry);
    const code = FUXING_STORAGE_CODES[entry.zone];
    if (code) local.set(`fuxing:${stockKey}|${code}`, Number(entry.quantity) || 0);
  }
  for (const entry of record.workInventory || []) {
    const stockKey = entry.stockKey || String(entry.id || "").replace(/^work-/, "");
    const code = fuxingWorkLocationCode(entry.workArea);
    if (code) local.set(`fuxing:${stockKey}|${code}`, Number(entry.quantity) || 0);
  }

  const changes = [];
  for (const row of rows) {
    const key = `${row.item.item_key}|${row.location.code}`;
    if (!local.has(key)) continue;
    const target = local.get(key);
    const current = Number(row.quantity) || 0;
    if (target === current) continue;
    changes.push({
      itemId: row.item.id,
      locationId: row.location.id,
      direction: target > current ? "in" : "out",
      amount: Math.abs(target - current),
    });
  }

  if (!changes.length) return { ok: true, changed: 0 };

  for (const change of changes) {
    const { error } = await rpc("adjust_inventory", {
      p_item_id: change.itemId,
      p_location_id: change.locationId,
      p_direction: change.direction,
      p_amount: change.amount,
      p_note: note,
    });
    if (error) {
      dispatchStatus("error", { error: error.message, stage: "reconcile-fuxing" });
      await syncInventoryNow("fuxing", { reloadBranch: false });
      return { ok: false, fallback: false, error };
    }
  }

  await syncInventoryNow("fuxing", { reloadBranch: false });
  return { ok: true, changed: changes.length };
}

export async function cloudSyncBranchCatalogItem(stockKey, site = currentSite()) {
  if (!(await verifyMigration())) return { ok: false, fallback: true };
  if (!canDirectInventoryAdjust()) return { ok: false, fallback: false, error: new Error("CATALOG_EDIT_NOT_ALLOWED") };
  if (!["fuxing","yongji"].includes(site)) return { ok:false, fallback:false, error:new Error("INVALID_SITE") };

  const catalog = buildBranchCatalog(site);
  const item = catalog.find((entry) => entry.key === branchItemKey(site,stockKey));
  if (!item) return { ok: false, fallback: false, error: new Error("CATALOG_ITEM_NOT_FOUND") };

  const { error } = await rpc("sync_inventory_catalog_item", { p_item: item });
  if (error) {
    dispatchStatus("error", { error: error.message, stage: "catalog-sync" });
    return { ok: false, fallback: false, error };
  }

  await fetchSite(site);
  for (const location of item.locations || []) {
    const ids = await resolveIds(item.key, location.code);
    if (!ids.item || !ids.location) continue;
    const currentRows = await fetchSite(site);
    const current = currentRows.find((row) =>
      row.item.id === ids.item.id && row.location.id === ids.location.id
    );
    const wanted = Math.max(0, Number(location.quantity) || 0);
    const actual = Math.max(0, Number(current?.quantity) || 0);
    if (wanted !== actual) {
      const result = await cloudSetQuantity({
        itemKey: item.key,
        locationCode: location.code,
        quantity: wanted,
        note: "品項資料調整／盤點 / Chỉnh mặt hàng và kiểm kê",
      });
      if (!result.ok) return result;
    }
  }

  await syncInventoryNow(site, { reloadBranch: false });
  return { ok: true };
}

export async function cloudSyncCentralCatalogItem(itemKey, items = readJson(CENTRAL_KEY, [])) {
  if (!(await verifyMigration())) return { ok: false, fallback: true };
  if (!canDirectInventoryAdjust()) return { ok: false, fallback: false, error: new Error("CATALOG_EDIT_NOT_ALLOWED") };
  const catalog = buildCentralCatalog(items);
  const item = catalog.find((entry) => entry.key === itemKey);
  if (!item) return { ok: false, fallback: false, error: new Error("CATALOG_ITEM_NOT_FOUND") };

  const { error } = await rpc("sync_inventory_catalog_item", { p_item: item });
  if (error) {
    dispatchStatus("error", { error: error.message, stage: "central-catalog-sync" });
    return { ok: false, fallback: false, error };
  }

  await fetchSite("central");
  for (const location of item.locations || []) {
    const ids = await resolveIds(item.key, location.code);
    if (!ids.item || !ids.location) continue;
    const currentRows = await fetchSite("central");
    const current = currentRows.find((row) =>
      row.item.id === ids.item.id && row.location.id === ids.location.id
    );
    const wanted = Math.max(0, Number(location.quantity) || 0);
    const actual = Math.max(0, Number(current?.quantity) || 0);
    if (wanted !== actual) {
      const result = await cloudSetQuantity({
        itemKey: item.key,
        locationCode: location.code,
        quantity: wanted,
        note: "央廚品項資料調整／盤點 / Chỉnh mặt hàng và kiểm kê bếp trung tâm",
      });
      if (!result.ok) return result;
    }
    const currentMinimum = Math.max(0, Number(current?.minimum_quantity) || 0);
    const wantedMinimum = Math.max(0, Number(location.minimum) || 0);
    if (wantedMinimum !== currentMinimum) {
      const result = await cloudSetMinimum({
        itemKey: item.key,
        locationCode: location.code,
        minimum: wantedMinimum,
      });
      if (!result.ok) return result;
    }
  }

  await syncInventoryNow("central", { reloadBranch: false });
  return { ok: true };
}

export async function cloudArchiveCentralItem(itemKey) {
  if (!(await verifyMigration())) return { ok: false, fallback: true };
  if (!canDirectInventoryAdjust()) return { ok: false, fallback: false, error: new Error("CATALOG_EDIT_NOT_ALLOWED") };
  if (!String(itemKey || "").startsWith("central:")) return { ok: false, fallback: false, error: new Error("INVALID_ITEM_KEY") };
  const { data, error } = await rpc("archive_inventory_item", { p_item_key: itemKey });
  if (error) {
    dispatchStatus("error", { error: error.message, stage: "central-catalog-archive" });
    return { ok: false, fallback: false, error };
  }
  await syncInventoryNow("central", { reloadBranch: false });
  return { ok: data === true || data === false, fallback: false };
}

export async function cloudArchiveBranchItem(stockKey, site = currentSite()) {
  if (!(await verifyMigration())) return { ok: false, fallback: true };
  if (!canDirectInventoryAdjust()) return { ok: false, fallback: false, error: new Error("CATALOG_EDIT_NOT_ALLOWED") };
  if (!["fuxing","yongji"].includes(site)) return { ok:false, fallback:false, error:new Error("INVALID_SITE") };

  const { data, error } = await rpc("archive_inventory_item", {
    p_item_key: branchItemKey(site,stockKey),
  });
  if (error) {
    dispatchStatus("error", { error: error.message, stage: "catalog-archive" });
    return { ok: false, fallback: false, error };
  }
  return { ok: data === true || data === false, fallback: false };
}

export function cloudSyncFuxingCatalogItem(stockKey) {
  return cloudSyncBranchCatalogItem(stockKey,"fuxing");
}

export function cloudArchiveFuxingItem(stockKey) {
  return cloudArchiveBranchItem(stockKey,"fuxing");
}

export function branchLocationCode(site, zone) {
  return BRANCH_STORAGE_CODES[site]?.[zone] || "";
}

export function branchWorkLocationCode(site, area) {
  return ["fuxing","yongji"].includes(site) && ["noodles","soup","seafood","meat"].includes(area)
    ? `${site}-work-${area}`
    : "";
}

export function branchItemKey(site, stockKey) {
  return ["fuxing","yongji"].includes(site) ? `${site}:${stockKey}` : "";
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
  if (!(await verifyMigration()) || role() !== "admin") return [];
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
  const actorIds = [...new Set(tx.map((entry) => entry.actor_id).filter(Boolean))];
  let actorMap = new Map();
  if (actorIds.length) {
    const { data: actors } = await supabase
      .from("profiles")
      .select("id,display_name,username,role")
      .in("id", actorIds);
    actorMap = new Map((actors || []).map((actor) => [actor.id, actor]));
  }
  return tx.map((entry) => ({
    ...entry,
    item: itemMap.get(entry.item_id),
    location: locMap.get(entry.location_id),
    actor: actorMap.get(entry.actor_id),
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
  const s = session();
  if (!isSupabaseConfigured() || !s) return;
  if (bootedUserId === s.id && polling) return;
  if (!(await verifyMigration())) return;
  bootedUserId = s.id || "";

  if (role() === "admin") {
    await bootstrapFuxingInventory();
    await bootstrapYongjiInventory();
    const central = readJson(CENTRAL_KEY, []);
    if (central.length) await bootstrapCentralInventory(central);
  }

  const site = currentSite();
  if (site) {
    await syncInventoryNow(site, { reloadBranch: ["fuxing","yongji"].includes(site) });
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

window.addEventListener("shitu:auth-synced", () => { void boot(); });
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
