import {
  isVpsApiConfigured,
  vpsAdjustInventory,
  vpsArchiveCatalogItem,
  vpsInventory,
  vpsInventoryClientId,
  vpsInventoryHistory,
  vpsInventorySites,
  vpsMasterData,
  vpsReceiveDefaults,
  vpsSchemaVersion,
  vpsSetMinimum,
  vpsSetQuantity,
  vpsSetReceiveDefault,
  vpsSyncCatalog,
  vpsTransferInventory,
  vpsRelocateStorage,
  vpsRelocateWorkArea,
} from "./vps-api.js";
import { PRIMARY_ZONES, STORAGE_KEY, WORK_AREAS, ZONES, stockKeyFor } from "./store.js";
import {
  firstInventorySite,
  inventoryLocationByCode,
  inventoryLocationByUiKey,
  inventoryLocationUiKey,
  inventorySiteForLocationCode,
  inventorySites,
  inventoryUiGroups,
  inventoryWorkLocation,
  isBranchInventorySite,
  isKnownInventorySite,
  replaceInventoryMasterSnapshot,
  replaceInventorySites,
} from "./inventory-master-data.js";

const AUTH_KEY = "shitu-kitchen-auth-v1";
const CENTRAL_KEY = "shitu-central-kitchen-stock-v1";
const CENTRAL_WORK_KEY = "shitu-central-kitchen-work-v1";
const CLOUD_FLAG_KEY = "shitu-inventory-cloud-v2";
const ACTIVE_SITE_KEY = "shitu-admin-active-site-v1";
const RECEIVE_DEFAULT_KEY = "shitu-inventory-receive-defaults-v1";
const BRANCH_SNAPSHOT_KEY_PREFIX = "shitu-inventory-branch-snapshot-v1:";
const POLL_MS = 60000;
const REQUIRED_SCHEMA_VERSION = 12;
const CLOUD_SCHEMA_VERSION_KEY = "shitu-inventory-cloud-schema-version";
const MIGRATION_RETRY_MS = 5000;
const AUTH_SYNC_RETRY_MS = 5500;

function isInventoryBackendConfigured() {
  return isVpsApiConfigured();
}

let migrationAvailable = null;
let migrationCheckedAt = 0;
let polling = 0;
let authSyncRetryTimer = 0;
let bootedUserId = "";
let inventorySyncTail = Promise.resolve();
let lastSite = "";
let siteRegistryInFlight = null;
let activeSiteSwitchSerial = 0;
let realtimeSource = null;
let realtimeUserId = "";
let realtimeRefreshTimer = 0;
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

function branchSnapshotKey(site) {
  return BRANCH_SNAPSHOT_KEY_PREFIX + String(site || "");
}

export function inventoryBranchSnapshot(site) {
  const code = String(site || "");
  if (!code || !isBranchInventorySite(code)) return null;
  const snapshot = readJson(branchSnapshotKey(code), null);
  if (!snapshot || snapshot.site !== code || !Array.isArray(snapshot.inventory) || !Array.isArray(snapshot.workInventory)) {
    return null;
  }
  return snapshot;
}

function saveInventoryBranchSnapshot(site, inventory, workInventory) {
  if (!isBranchInventorySite(site)) return;
  localStorage.setItem(branchSnapshotKey(site), JSON.stringify({
    site,
    inventory,
    workInventory,
    updatedAt:new Date().toISOString(),
  }));
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

async function ensureSiteRegistry({ force = false } = {}) {
  if (!force && inventorySites().length) return inventorySites();
  if (siteRegistryInFlight) return siteRegistryInFlight;
  let pending;
  pending = vpsInventorySites()
    .then((result) => replaceInventorySites(result?.sites || []))
    .finally(() => {
      if (siteRegistryInFlight === pending) siteRegistryInFlight = null;
    });
  siteRegistryInFlight = pending;
  return pending;
}

function syncUiMasterData(site, snapshot) {
  replaceInventoryMasterSnapshot(site, snapshot);
  const groups = inventoryUiGroups(site);
  ZONES.splice(0, ZONES.length, ...groups.storage.map((entry) => ({
    id:entry.id,
    zh:entry.zh,
    vi:entry.vi,
    code:entry.code,
    storageGroup:entry.storageGroup,
  })));
  WORK_AREAS.splice(0, WORK_AREAS.length, ...groups.workAreas);
  PRIMARY_ZONES.splice(0, PRIMARY_ZONES.length, ...groups.storage
    .filter((entry) => entry.storageGroup === "primary")
    .map((entry) => entry.id));
}

export function isCurrentBranchInventoryDate() {
  const state = appState();
  const selectedDate = String(state?.selectedDate || "").trim();
  return (selectedDate || todayKey()) === todayKey();
}

export function inventoryCloudState() {
  const state = localStorage.getItem(CLOUD_FLAG_KEY) || "checking";
  if (state === "ready" && Number(localStorage.getItem(CLOUD_SCHEMA_VERSION_KEY) || 0) < REQUIRED_SCHEMA_VERSION) {
    return "checking";
  }
  return state;
}

export function canInventoryEdit() {
  if (!hasInventoryPermission("edit")) return false;
  if (inventoryCloudState() !== "ready") return false;
  if (globalThis.navigator?.onLine === false) return false;
  const site = currentSite();
  return !isBranchInventorySite(site) || isCurrentBranchInventoryDate();
}

export function canInventoryDraftCount() {
  // PostgreSQL on the VPS is the only shared source of truth. Never accept
  // inventory writes into localStorage, otherwise devices can diverge.
  if (isInventoryBackendConfigured()) return false;
  return hasInventoryPermission("edit") && inventoryCloudState() !== "ready";
}

export function canManageCentralCatalog() {
  const s=session();
  return canInventoryEdit()
    && activeInventorySite() === "central"
    && (role() === "admin" || ["central","all"].includes(s?.location));
}

function canManageSiteCatalog(site) {
  return site === "central" ? canManageCentralCatalog() : canManageBranchCatalog(site);
}

export function canViewBranchCatalogManagement(site = activeInventorySite()) {
  const s=session();
  if (!hasInventoryPermission("edit") || !isBranchInventorySite(site)) return false;
  // The inventory edit checkbox is the source of truth. A branch employee who
  // is explicitly granted edit access must receive the same operational and
  // catalogue entry points for their assigned site.
  return role() === "admin" || s?.location === site || s?.location === "all";
}

export function canManageBranchCatalog(site = activeInventorySite()) {
  if (!canViewBranchCatalogManagement(site)) return false;
  if (inventoryCloudState() !== "ready") return false;
  if (globalThis.navigator?.onLine === false) return false;
  // Catalog/storage management is master data. It must not be locked just because
  // the operator is viewing a different service date.
  return true;
}

export function canManageReceiveDefault(site = activeInventorySite()) {
  const s = session();
  if (!s || !hasInventoryPermission("edit") || !isKnownInventorySite(site)) return false;
  return s.location === site || s.location === "all";
}

export function canDirectInventoryAdjust() {
  // Explicit module permission is authoritative. Role names must not silently
  // revoke controls after an administrator grants inventory edit access.
  return canInventoryEdit();
}

export function activeInventorySite() {
  const s = session();
  if (!s) return "";
  if (s.location !== "all") return String(s.location || "");
  const saved = localStorage.getItem(ACTIVE_SITE_KEY) || "";
  if (isKnownInventorySite(saved)) return saved;
  return firstInventorySite();
}

export function setActiveInventorySite(site) {
  const s = session();
  if (s?.location !== "all" || !isKnownInventorySite(site)) return false;
  localStorage.setItem(ACTIVE_SITE_KEY, site);
  window.dispatchEvent(new CustomEvent("shitu:active-site-changed", { detail:{ site } }));
  // Legacy low-level setter: preserve the historical immediate-notify contract
  // for non-UI callers. Interactive warehouse switching uses
  // switchActiveInventorySite() below so data is hydrated before render.
  setTimeout(() => { void syncInventoryNow(site, { reloadBranch: false }); }, 0);
  return true;
}

export async function switchActiveInventorySite(site) {
  const s = session();
  if (s?.location !== "all") return false;

  const targetSite = String(site || "");
  if (!targetSite) return false;
  try {
    await ensureSiteRegistry({ force:true });
  } catch {
    return false;
  }
  if (!isKnownInventorySite(targetSite)) return false;

  const previousSite = activeInventorySite();
  if (targetSite === previousSite) {
    await runInventorySync(targetSite, { reloadBranch:false, force:true });
    return true;
  }

  const serial = ++activeSiteSwitchSerial;
  window.dispatchEvent(new CustomEvent("shitu:active-site-changing", {
    detail:{ site:targetSite, previousSite },
  }));

  try {
    if (!(await verifyMigration()) || !hasInventoryPermission("view")) {
      throw new Error("INVENTORY_BACKEND_NOT_READY");
    }
    if (!isKnownInventorySite(targetSite)) throw new Error("INVALID_SITE");

    // Fetch the authoritative target snapshot before changing the active site.
    // This prevents Fuxing/Yongji from ever rendering the previous branch while
    // a new branch request is still in flight.
    const rows = await fetchSite(targetSite, { force:true });
    if (serial !== activeSiteSwitchSerial) return false;

    localStorage.setItem(ACTIVE_SITE_KEY, targetSite);
    if (isBranchInventorySite(targetSite)) applyBranch(rows, targetSite);
    else applyCentral(rows);
    dispatchStatus("synced", { site:targetSite, count:rows.length, switch:true });

    window.dispatchEvent(new CustomEvent("shitu:active-site-changed", {
      detail:{ site:targetSite, previousSite, hydrated:true },
    }));
    return true;
  } catch (error) {
    if (serial !== activeSiteSwitchSerial) return false;
    if (previousSite && isKnownInventorySite(previousSite)) localStorage.setItem(ACTIVE_SITE_KEY, previousSite);
    else localStorage.removeItem(ACTIVE_SITE_KEY);
    dispatchStatus("error", { site:targetSite, error:error?.message || String(error), switch:true });
    window.dispatchEvent(new CustomEvent("shitu:active-site-change-failed", {
      detail:{ site:targetSite, previousSite, status:"error", error:error?.message || String(error) },
    }));
    return false;
  }
}

function currentSite() {
  return activeInventorySite();
}

function siteFromLocationCode(code = "") {
  return inventorySiteForLocationCode(code) || currentSite();
}

function dispatchStatus(status, detail = {}) {
  window.dispatchEvent(new CustomEvent("shitu:inventory-cloud-status", {
    detail: { status, ...detail },
  }));
}

function clearAuthSyncRetry() {
  if (!authSyncRetryTimer) return;
  window.clearTimeout(authSyncRetryTimer);
  authSyncRetryTimer = 0;
}

function scheduleAuthSyncRetry(site) {
  if (authSyncRetryTimer || !site || !session()) return;
  authSyncRetryTimer = window.setTimeout(() => {
    authSyncRetryTimer = 0;
    if (document.documentElement.dataset.vpsAuthReady !== "true" || !session()) return;
    void syncInventoryNow(currentSite() || site);
  }, AUTH_SYNC_RETRY_MS);
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

export function inventoryCatalogKey(label) {
  return catalogKey(label);
}

function localReceiveDefaults() {
  const rows=readJson(RECEIVE_DEFAULT_KEY,[]);
  return Array.isArray(rows) ? rows : [];
}

function saveLocalReceiveDefault(site,catalogKeyValue,locationCode="") {
  const key=String(catalogKeyValue||"").trim();
  if(!site || !key) return;
  const rows=localReceiveDefaults().filter((entry)=>!(entry.site===site&&entry.catalogKey===key));
  if(locationCode) rows.push({site,catalogKey:key,locationCode:String(locationCode),updatedAt:new Date().toISOString()});
  localStorage.setItem(RECEIVE_DEFAULT_KEY,JSON.stringify(rows.slice(-2000)));
}

async function fetchCloudReceiveDefaults(sites=[],catalogKeys=[]) {
  const result=await vpsReceiveDefaults({sites,catalogKeys});
  return (result?.defaults||[]).map((row)=>({
    site:row.site,
    catalogKey:row.catalog_key,
    locationId:row.location_id,
    locationCode:row.location_code||"",
    location:{
      code:row.location_code||"",
      name_zh_tw:row.name_zh_tw||"",
      name_vi:row.name_vi||"",
      site:row.site,
      kind:row.kind||"storage",
      active:row.active!==false,
    },
    updatedAt:row.updated_at,
  }));
}

export async function getInventoryReceiveDefaults({sites=[],catalogKeys=[]}={}) {
  const wantedSites=(sites||[]).map(String).filter(Boolean);
  const wantedKeys=(catalogKeys||[]).map(String).filter(Boolean);
  if(inventoryCloudState()==="ready" && globalThis.navigator?.onLine!==false){
    try{
      const cloud=await fetchCloudReceiveDefaults(wantedSites,wantedKeys);
      const matchesScope=(row)=>
        (!wantedSites.length||wantedSites.includes(row.site))
        && (!wantedKeys.length||wantedKeys.includes(row.catalogKey));
      const retained=localReceiveDefaults().filter((row)=>!matchesScope(row));
      const next=[...retained,...cloud.map((row)=>({
        site:row.site,
        catalogKey:row.catalogKey,
        locationCode:row.locationCode,
        updatedAt:row.updatedAt||new Date().toISOString(),
      }))];
      localStorage.setItem(RECEIVE_DEFAULT_KEY,JSON.stringify(next.slice(-2000)));
      return cloud;
    }catch{}
  }
  return localReceiveDefaults().filter((row)=>
    (!wantedSites.length||wantedSites.includes(row.site))
    && (!wantedKeys.length||wantedKeys.includes(row.catalogKey))
  );
}

export async function cloudSetReceiveDefault({site,catalogKey:catalogKeyValue,locationCode=""}) {
  const key=String(catalogKeyValue||"").trim();
  const code=String(locationCode||"").trim();
  if(!site||!key) return {ok:false,fallback:false,error:new Error("INVALID_RECEIVE_DEFAULT")};
  if(!canManageReceiveDefault(site)) return {ok:false,fallback:false,error:new Error("RECEIVE_DEFAULT_MANAGER_REQUIRED")};
  if(globalThis.navigator?.onLine===false) return {ok:false,fallback:false,error:new Error("INVENTORY_OFFLINE")};
  if(!(await verifyMigration())) return {ok:false,fallback:false,error:new Error("INVENTORY_BACKEND_NOT_READY")};
  try{
    await vpsSetReceiveDefault({site,catalogKey:key,locationCode:code});
    saveLocalReceiveDefault(site,key,code);
    return {ok:true,fallback:false};
  }catch(error){
    dispatchStatus("error",{error:error.message,stage:"receive-default"});
    return {ok:false,fallback:false,error};
  }
}

function buildBranchCatalog(site = currentSite(), { zeroQuantities = false } = {}) {
  const { record } = currentBranchRecord();
  if (!record || !isBranchInventorySite(site)) return [];
  const inventory = Array.isArray(record?.inventory) ? record.inventory : [];
  const work = Array.isArray(record?.workInventory) ? record.workInventory : [];
  const grouped = new Map();

  for (const entry of inventory) {
    const stockKey = entry.stockKey || stockKeyFor(entry);
    if (!grouped.has(stockKey)) {
      grouped.set(stockKey, {
        key: `${site}:${stockKey}`,
        catalog_key: entry.catalogKey || catalogKey(entry.label || stockKey),
        zh: entry.label || stockKey,
        vi: entry.labelVi || entry.label || stockKey,
        unit: entry.unit || "個",
        work_area: entry.workArea || WORK_AREAS[0]?.id || "",
        storage_only: Boolean(entry.storageOnly),
        locations: [],
      });
    }
    const item = grouped.get(stockKey);
    item.zh = entry.label || item.zh;
    item.vi = entry.labelVi || item.vi;
    item.catalog_key = entry.catalogKey || item.catalog_key || catalogKey(item.zh);
    item.unit = entry.unit || item.unit;
    item.work_area = entry.workArea || item.work_area;
    item.storage_only = Boolean(entry.storageOnly);
    const code = branchLocationCode(site, entry.zone);
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
    const area = entry.workArea || item.work_area || WORK_AREAS[0]?.id || "";
    const code = branchWorkLocationCode(site, area);
    if (!code) continue;
    item.locations.push({
      code,
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
        catalog_key:entry.catalogKey || catalogKey(entry.zh || baseId),
        zh:entry.zh || baseId,
        vi:entry.vi || entry.zh || baseId,
        unit:entry.unit || "個",
        work_area:entry.workArea || entry.work_area || WORK_AREAS[0]?.id || "",
        storage_only:true,
        locations:[],
      });
    }
    const item=grouped.get(key);
    const code=centralLocationCode(entry.zone);
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

async function verifyMigration({ force = false } = {}) {
  const now = Date.now();
  if (!force && migrationAvailable === true) return true;
  if (!force && migrationAvailable === false && now - migrationCheckedAt < MIGRATION_RETRY_MS) return false;

  if (!isInventoryBackendConfigured()) {
    migrationAvailable = false;
    migrationCheckedAt = now;
    return false;
  }

  const priorState = localStorage.getItem(CLOUD_FLAG_KEY);
  const priorVersion = Number(localStorage.getItem(CLOUD_SCHEMA_VERSION_KEY) || 0);
  const priorReady = priorState === "ready" && priorVersion >= REQUIRED_SCHEMA_VERSION;

  if (globalThis.navigator?.onLine === false && priorReady) {
    migrationAvailable = true;
    migrationCheckedAt = now;
    dispatchStatus("offline");
    return true;
  }

  try {
    const result = await vpsSchemaVersion();
    const version = Number(result?.version || 0);
    const error = null;

    migrationCheckedAt = Date.now();

    if (!error && version >= REQUIRED_SCHEMA_VERSION) {
      migrationAvailable = true;
      localStorage.setItem(CLOUD_FLAG_KEY, "ready");
      localStorage.setItem(CLOUD_SCHEMA_VERSION_KEY, String(version));
      dispatchStatus("ready", { version });
      return true;
    }

    if (priorReady && error) {
      migrationAvailable = true;
      dispatchStatus("unreachable", { error: error.message });
      return true;
    }
  } catch (error) {
    migrationCheckedAt = Date.now();
    if (priorReady) {
      migrationAvailable = true;
      dispatchStatus("unreachable", { error: error?.message || String(error) });
      return true;
    }
  }

  migrationAvailable = false;
  localStorage.setItem(CLOUD_FLAG_KEY, "migration-needed");
  localStorage.removeItem(CLOUD_SCHEMA_VERSION_KEY);
  dispatchStatus("migration-needed", { requiredVersion: REQUIRED_SCHEMA_VERSION });
  return false;
}

export async function refreshInventoryCloudState() {
  migrationAvailable = null;
  migrationCheckedAt = 0;
  await ensureSiteRegistry({ force:true });
  return verifyMigration({ force: true });
}

export async function bootstrapFuxingInventory() {
  return isVpsApiConfigured();
}

export async function bootstrapYongjiInventory() {
  return isVpsApiConfigured();
}

export async function bootstrapCentralInventory() {
  return isVpsApiConfigured();
}

async function fetchSite(site, { force = false } = {}) {
  if (!(await verifyMigration()) || !hasInventoryPermission("view") || !site) return [];

  await ensureSiteRegistry({ force });
  const [result, master] = await Promise.all([
    vpsInventory(site, { force }),
    vpsMasterData(site, { force }),
  ]);
  syncUiMasterData(site, master || {});

  const masterLocationByCode = new Map((master?.locations || []).map((location) => [location.code, location]));
  const locations = Array.isArray(result?.locations)
    ? result.locations.map((location) => ({
        ...location,
        ...(masterLocationByCode.get(location.code) || {}),
        metadata:masterLocationByCode.get(location.code)?.metadata || location.metadata || {},
      }))
    : null;
  const stocks = Array.isArray(result?.stock) ? result.stock : null;
  const items = Array.isArray(result?.items) ? result.items : null;

  if (!locations || !stocks || !items) throw new Error("INVENTORY_SNAPSHOT_INVALID");

  for (const [code, location] of [...cache.locationsByCode]) {
    if (location?.site === site) cache.locationsByCode.delete(code);
  }
  for (const [key, item] of [...cache.itemsByKey]) {
    if (String(item?.item_key || "").startsWith(`${site}:`)) cache.itemsByKey.delete(key);
  }

  for (const loc of locations) cache.locationsByCode.set(loc.code, loc);
  for (const item of items) if (item.item_key) cache.itemsByKey.set(item.item_key, item);

  // A complete snapshot with no stock rows is authoritative: local mirrors
  // must be allowed to become empty. Non-empty stock requires valid master data.
  if (!stocks.length) return [];
  if (!locations.length || !items.length) throw new Error("INVENTORY_SNAPSHOT_INVALID");

  // /api/inventory/:site already returns the receiving defaults for this
  // site as part of the same authoritative inventory snapshot. Reuse that
  // payload instead of issuing a second request here. Besides saving a round
  // trip, this prevents duplicate inventory renders from racing an otherwise
  // redundant receive-default request on WebKit/Safari.
  let receiveDefaults = Array.isArray(result?.receiveDefaults) ? result.receiveDefaults : null;
  if (!receiveDefaults) {
    // Backward-compatible fallback for an older backend that did not include
    // receiveDefaults in the inventory snapshot.
    const catalogKeys=[...new Set(items.map((item)=>item.catalog_key).filter(Boolean))];
    try{
      const cloud=await getInventoryReceiveDefaults({sites:[site],catalogKeys});
      receiveDefaults=cloud.map((entry)=>({
        catalog_key:entry.catalogKey,
        location_code:entry.locationCode,
      }));
    }catch{
      receiveDefaults=[];
    }
  }
  const defaultByCatalog=new Map(
    receiveDefaults
      .map((entry)=>[
        String(entry.catalog_key || entry.catalogKey || ""),
        String(entry.location_code || entry.locationCode || ""),
      ])
      .filter(([catalogKeyValue])=>catalogKeyValue)
  );
  for(const item of items) item.receive_default_location_code=defaultByCatalog.get(item.catalog_key)||"";

  const itemMap = new Map(items.map((item) => [item.id, item]));
  const locMap = new Map(locations.map((loc) => [loc.id, loc]));

  const rows = stocks.map((stock) => ({
    ...stock,
    item: itemMap.get(stock.item_id),
    location: locMap.get(stock.location_id),
  })).filter((row) => row.item && row.location);
  if (rows.length !== stocks.length) throw new Error("INVENTORY_SNAPSHOT_INVALID");
  return rows;
}

export async function getSiteInventoryRows(site = currentSite()) {
  if (!site) return [];
  await ensureSiteRegistry();
  if (!isKnownInventorySite(site)) return [];
  return fetchSite(site);
}

export async function getSiteLocations(site = currentSite(), kind = "storage") {
  if (!(await verifyMigration()) || !hasInventoryPermission("view") || !site) return [];
  await ensureSiteRegistry();
  const master = await vpsMasterData(site);
  syncUiMasterData(site, master || {});
  const locations = master?.locations || [];
  return kind ? locations.filter((entry)=>entry.kind===kind) : locations;
}

function applyCentral(rows) {
  const previous = readJson(CENTRAL_KEY, []);
  const previousWork = readJson(CENTRAL_WORK_KEY, {});
  const next=[];
  const nextWork={};

  for (const row of rows) {
    if (!row.item.item_key?.startsWith("central:")) continue;
    if (row.location.kind === "work") {
      nextWork[row.item.item_key] = {
        quantity:Number(row.quantity)||0,
        minimum:Number(row.minimum_quantity)||0,
        locationCode:row.location.code,
      };
      continue;
    }
    if (row.location.kind !== "storage") continue;
    const baseId = row.item.item_key.slice("central:".length);
    const zone = inventoryLocationUiKey(row.location);
    if (!zone) continue;
    next.push({
      id:`${baseId}@${row.location.code}`,
      baseId,
      itemKey:row.item.item_key,
      catalogKey:row.item.catalog_key,
      zh:row.item.name_zh_tw,
      vi:row.item.name_vi,
      unit:row.item.unit,
      workArea:row.item.work_area || WORK_AREAS[0]?.id || "",
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
  const oldWorkJson=JSON.stringify(previousWork);
  const nextWorkJson=JSON.stringify(nextWork);
  if(oldJson===nextJson && oldWorkJson===nextWorkJson) return false;
  localStorage.setItem(CENTRAL_KEY,nextJson);
  localStorage.setItem(CENTRAL_WORK_KEY,nextWorkJson);
  window.dispatchEvent(new CustomEvent("shitu:inventory-cloud-updated",{detail:{site:"central"}}));
  return true;
}

function applyBranch(rows, site) {
  if (!isBranchInventorySite(site)) return false;
  // A stale sync from a previously selected branch must never overwrite the
  // shared branch record after the user has switched to another site.
  if (site !== currentSite()) return false;
  const state=appState();
  if(!state?.records?.[state.selectedDate] || state.selectedDate!==todayKey()) return false;
  const record=state.records[state.selectedDate];
  const inventory=[];
  const workMap=new Map();

  for(const row of rows){
    const key=row.item.item_key||"";
    if(!key.startsWith(`${site}:`)) continue;
    const stockKey=key.slice(site.length+1);
    const receiveLocation=inventoryLocationByCode(row.item.receive_default_location_code);
    const receiveZone=receiveLocation ? inventoryLocationUiKey(receiveLocation) : "";
    if(row.location.kind==="storage"){
      const zone=inventoryLocationUiKey(row.location);
      if(!zone) continue;
      inventory.push({
        id:`${stockKey}-${zone}`,
        stockKey,
        label:row.item.name_zh_tw,
        labelVi:row.item.name_vi,
        catalogKey:row.item.catalog_key || "",
        receiveZone,
        unit:row.item.unit,
        workArea:row.item.work_area||WORK_AREAS[0]?.id||"",
        storageOnly:Boolean(row.item.storage_only),
        zone,
        quantity:Number(row.quantity)||0,
        minimum:Number(row.minimum_quantity)||0,
        cloudItemId:row.item.id,
        cloudLocationId:row.location.id,
      });
    }else if(row.location.kind==="work"){
      const area=String(row.location.metadata?.work_area || inventoryLocationUiKey(row.location) || row.item.work_area || "");
      workMap.set(stockKey,{
        id:`work-${stockKey}`,
        stockKey,
        label:row.item.name_zh_tw,
        labelVi:row.item.name_vi,
        catalogKey:row.item.catalog_key || "",
        receiveZone,
        unit:row.item.unit,
        workArea:area||row.item.work_area||WORK_AREAS[0]?.id||"",
        quantity:Number(row.quantity)||0,
        minimum:Number(row.minimum_quantity)||0,
        cloudItemId:row.item.id,
        cloudLocationId:row.location.id,
      });
    }
  }

  inventory.sort((a,b)=>String(a.label).localeCompare(String(b.label),"zh-Hant") || String(a.zone).localeCompare(String(b.zone)));
  const workInventory=[...workMap.values()].sort((a,b)=>String(a.label).localeCompare(String(b.label),"zh-Hant"));
  saveInventoryBranchSnapshot(site, inventory, workInventory);
  const before=JSON.stringify({inventory:record.inventory||[],workInventory:record.workInventory||[],inventorySite:record.inventorySite||""});
  const after=JSON.stringify({inventory,workInventory,inventorySite:site});
  if(before===after) return false;
  record.inventory=inventory;
  record.workInventory=workInventory;
  record.inventorySite=site;
  record.updatedAt=new Date().toISOString();
  localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
  window.dispatchEvent(new CustomEvent("shitu:inventory-cloud-updated",{detail:{site}}));
  return true;
}

async function runInventorySync(site, { reloadBranch = false, force = false } = {}) {
  if (!site || !(await verifyMigration()) || !hasInventoryPermission("view")) return false;
  await ensureSiteRegistry();
  if (!isKnownInventorySite(site)) return false;
  if (isBranchInventorySite(site) && !isCurrentBranchInventoryDate()) {
    dispatchStatus("historical-readonly", { site });
    return false;
  }
  try {
    const rows = await fetchSite(site, { force });
    clearAuthSyncRetry();
    const changed = isBranchInventorySite(site) ? applyBranch(rows, site) : applyCentral(rows);
    void reloadBranch;
    dispatchStatus("synced", { site, count: rows.length });
    return changed;
  } catch (error) {
    if (error?.code === "AUTH_REQUIRED") scheduleAuthSyncRetry(site);
    dispatchStatus("error", { site, error: error?.message || String(error) });
    return false;
  }
}

export function syncInventoryNow(site = currentSite(), { reloadBranch = false, force = false } = {}) {
  const requestedSite = site;
  const requestedOptions = { reloadBranch: Boolean(reloadBranch), force:Boolean(force) };
  const task = inventorySyncTail.then(() => runInventorySync(requestedSite, requestedOptions));
  inventorySyncTail = task.catch(() => false);
  return task;
}

async function resolveIds(itemKey, locationCode) {
  let location = cache.locationsByCode.get(locationCode) || inventoryLocationByCode(locationCode);
  const site = location?.site || siteFromLocationCode(locationCode);
  if (!cache.itemsByKey.has(itemKey) || !cache.locationsByCode.has(locationCode)) {
    if (site) await fetchSite(site);
    location = cache.locationsByCode.get(locationCode) || inventoryLocationByCode(locationCode);
  }
  return {
    item: cache.itemsByKey.get(itemKey),
    location,
  };
}

export async function cloudAdjustQuantity({
  itemId = "",
  locationId = "",
  site = "",
  itemKey,
  locationCode,
  direction,
  amount,
  note = "",
  sync = true,
}) {
  if (!(await verifyMigration())) return { ok: false, fallback: false, error: new Error("INVENTORY_BACKEND_NOT_READY") };
  if (!canInventoryEdit()) return { ok: false, fallback: false, error: new Error("INVENTORY_EDIT_NOT_ALLOWED") };
  const resolved = itemId && locationId
    ? { item:{ id:itemId }, location:{ id:locationId, site } }
    : await resolveIds(itemKey, locationCode);
  if (!resolved.item || !resolved.location) return { ok: false, fallback: false, error: new Error("INVENTORY_BACKEND_NOT_READY") };
  const value = Math.max(0, Number(amount) || 0);
  if (!value) return { ok: false, fallback: false };
  let data;
  try {
    data = await vpsAdjustInventory({
      itemId: resolved.item.id,
      locationId: resolved.location.id,
      direction,
      amount: value,
      note,
    });
  } catch (error) {
    dispatchStatus("error", { error: error.message, stage: "adjust" });
    return { ok: false, fallback: false, error };
  }
  if (sync) await syncInventoryNow(resolved.location.site, { reloadBranch: false });
  return { ok: true, data };
}

export async function cloudSetQuantity({
  itemId = "",
  locationId = "",
  site = "",
  itemKey,
  locationCode,
  quantity,
  note = "盤點調整 / Điều chỉnh kiểm kê",
  sync = true,
  allowInventoryEditor = false,
}) {
  void allowInventoryEditor;
  if (!(await verifyMigration())) return { ok: false, fallback: false, error: new Error("INVENTORY_BACKEND_NOT_READY") };
  if (!canDirectInventoryAdjust()) return { ok: false, fallback: false, error: new Error("DIRECT_ADJUST_NOT_ALLOWED") };
  const resolved = itemId && locationId
    ? { item:{ id:itemId }, location:{ id:locationId, site } }
    : await resolveIds(itemKey, locationCode);
  if (!resolved.item || !resolved.location) return { ok: false, fallback: false, error: new Error("INVENTORY_BACKEND_NOT_READY") };
  try {
    await vpsSetQuantity({
      itemId: resolved.item.id,
      locationId: resolved.location.id,
      quantity: Math.max(0, Number(quantity) || 0),
      note,
    });
  } catch (error) {
    dispatchStatus("error", { error: error.message, stage: "set-quantity" });
    return { ok: false, fallback: false, error };
  }
  if (sync) await syncInventoryNow(resolved.location.site, { reloadBranch: false });
  return { ok: true };
}

export async function cloudSetMinimum({
  itemId = "",
  locationId = "",
  site = "",
  itemKey,
  locationCode,
  minimum,
  sync = true,
}) {
  if (!(await verifyMigration())) return { ok: false, fallback: false, error: new Error("INVENTORY_BACKEND_NOT_READY") };
  if (!canDirectInventoryAdjust()) return { ok: false, fallback: false, error: new Error("MINIMUM_EDIT_NOT_ALLOWED") };
  const resolved = itemId && locationId
    ? { item:{ id:itemId }, location:{ id:locationId, site } }
    : await resolveIds(itemKey, locationCode);
  if (!resolved.item || !resolved.location) return { ok: false, fallback: false, error: new Error("INVENTORY_BACKEND_NOT_READY") };
  try {
    await vpsSetMinimum({
      itemId: resolved.item.id,
      locationId: resolved.location.id,
      minimum: Math.max(0, Number(minimum) || 0),
    });
  } catch (error) {
    dispatchStatus("error", { error: error.message, stage: "set-minimum" });
    return { ok: false, fallback: false, error };
  }
  if (sync) await syncInventoryNow(resolved.location.site, { reloadBranch: false });
  return { ok: true };
}

export async function cloudTransferInventory({
  itemKey,
  sourceLocationCode,
  destinationLocationCode,
  amount,
  note = "庫存轉撥 / Chuyển kho",
}) {
  if (!(await verifyMigration())) return { ok: false, fallback: false, error: new Error("INVENTORY_BACKEND_NOT_READY") };
  if (!canInventoryEdit()) return { ok: false, fallback: false, error: new Error("INVENTORY_EDIT_NOT_ALLOWED") };

  const source = await resolveIds(itemKey, sourceLocationCode);
  const destination = await resolveIds(itemKey, destinationLocationCode);
  if (!source.item || !source.location || !destination.location) return { ok: false, fallback: false, error: new Error("INVENTORY_BACKEND_NOT_READY") };

  const value = Math.max(0, Number(amount) || 0);
  if (!value) return { ok: false, fallback: false };

  try {
    await vpsTransferInventory({
      itemId: source.item.id,
      sourceLocationId: source.location.id,
      destinationLocationId: destination.location.id,
      amount: value,
      note,
    });
  } catch (error) {
    dispatchStatus("error", { error: error.message, stage: "transfer" });
    return { ok: false, fallback: false, error };
  }

  await syncInventoryNow(source.location.site, { reloadBranch: false });
  return { ok: true };
}


export async function cloudRelocateStorage({
  itemKey,
  sourceLocationCode,
  destinationLocationCode,
  note = "儲位移動 / Chuyển vị trí lưu",
  sync = true,
}) {
  if (!(await verifyMigration())) return { ok:false,fallback:false,error:new Error("INVENTORY_BACKEND_NOT_READY") };

  const source = await resolveIds(itemKey, sourceLocationCode);
  const destination = await resolveIds(itemKey, destinationLocationCode);
  const site = source.location?.site || "";
  if (!source.item || !source.location || !destination.location) {
    return { ok:false,fallback:false,error:new Error("INVENTORY_BACKEND_NOT_READY") };
  }
  if (!site || destination.location.site !== site || !canManageSiteCatalog(site)) {
    return { ok:false,fallback:false,error:new Error("CATALOG_EDIT_NOT_ALLOWED") };
  }

  try {
    const data = await vpsRelocateStorage({
      itemId:source.item.id,
      sourceLocationId:source.location.id,
      destinationLocationId:destination.location.id,
      note,
    });
    if (sync) await syncInventoryNow(site,{reloadBranch:false});
    return { ok:true,fallback:false,data };
  } catch (error) {
    dispatchStatus("error",{error:error.message,stage:"relocate-storage"});
    if (sync) await syncInventoryNow(site,{reloadBranch:false});
    return { ok:false,fallback:false,error };
  }
}

export async function cloudRelocateWorkArea({
  itemKey,
  sourceLocationCode,
  destinationLocationCode,
  note = "工作區移動 / Chuyển khu làm việc",
  sync = true,
}) {
  if (!(await verifyMigration())) return { ok:false,fallback:false,error:new Error("INVENTORY_BACKEND_NOT_READY") };

  const source = await resolveIds(itemKey,sourceLocationCode);
  const destination = await resolveIds(itemKey,destinationLocationCode);
  const site = source.location?.site || "";
  if (!source.item || !source.location || !destination.location) {
    return { ok:false,fallback:false,error:new Error("INVENTORY_BACKEND_NOT_READY") };
  }
  if (!site || destination.location.site !== site || !canManageBranchCatalog(site)) {
    return { ok:false,fallback:false,error:new Error("CATALOG_EDIT_NOT_ALLOWED") };
  }

  try {
    const data = await vpsRelocateWorkArea({
      itemId:source.item.id,
      sourceLocationId:source.location.id,
      destinationLocationId:destination.location.id,
      note,
    });
    if (sync) await syncInventoryNow(site,{reloadBranch:false});
    return { ok:true,fallback:false,data };
  } catch (error) {
    dispatchStatus("error",{error:error.message,stage:"relocate-work-area"});
    if (sync) await syncInventoryNow(site,{reloadBranch:false});
    return { ok:false,fallback:false,error };
  }
}

export async function reconcileFuxingSnapshot(note = "同步庫存 / Đồng bộ tồn kho") {
  if (!(await verifyMigration())) return { ok: false, fallback: false, error: new Error("INVENTORY_BACKEND_NOT_READY") };
  if (!canInventoryEdit()) return { ok: false, fallback: false, error: new Error("INVENTORY_EDIT_NOT_ALLOWED") };
  const site = "fuxing";
  const rows = await fetchSite(site);
  const { record } = selectedBranchRecord();
  if (!record) return { ok: false, fallback: false, error: new Error("INVENTORY_BACKEND_NOT_READY") };

  const local = new Map();
  for (const entry of record.inventory || []) {
    const stockKey = entry.stockKey || stockKeyFor(entry);
    const code = branchLocationCode(site,entry.zone);
    if (code) local.set(`${site}:${stockKey}|${code}`, Number(entry.quantity) || 0);
  }
  for (const entry of record.workInventory || []) {
    const stockKey = entry.stockKey || String(entry.id || "").replace(/^work-/, "");
    const code = branchWorkLocationCode(site,entry.workArea);
    if (code) local.set(`${site}:${stockKey}|${code}`, Number(entry.quantity) || 0);
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
    try {
      await vpsAdjustInventory({
        itemId: change.itemId,
        locationId: change.locationId,
        direction: change.direction,
        amount: change.amount,
        note,
      });
    } catch (error) {
      dispatchStatus("error", { error: error.message, stage: "reconcile-fuxing" });
      await syncInventoryNow(site, { reloadBranch: false });
      return { ok: false, fallback: false, error };
    }
  }

  await syncInventoryNow(site, { reloadBranch: false });
  return { ok: true, changed: changes.length };
}

export async function cloudSyncBranchCatalogItem(stockKey, site = currentSite(), { sync = true } = {}) {
  if (!(await verifyMigration())) return { ok: false, fallback: false, error: new Error("INVENTORY_BACKEND_NOT_READY") };
  if (!canManageBranchCatalog(site)) return { ok: false, fallback: false, error: new Error("CATALOG_EDIT_NOT_ALLOWED") };
  if (!isBranchInventorySite(site)) return { ok:false, fallback:false, error:new Error("INVALID_SITE") };

  const catalog = buildBranchCatalog(site);
  const item = catalog.find((entry) => entry.key === branchItemKey(site,stockKey));
  if (!item) return { ok: false, fallback: false, error: new Error("CATALOG_ITEM_NOT_FOUND") };

  try {
    await vpsSyncCatalog(item);
    if (sync) await syncInventoryNow(site, { reloadBranch: false });
    return { ok: true };
  } catch (error) {
    dispatchStatus("error", { error: error.message, stage: "catalog-sync" });
    return { ok: false, fallback: false, error };
  }
}

export async function cloudSyncCentralCatalogItem(itemKey, items = readJson(CENTRAL_KEY, []), { sync = true } = {}) {
  if (!(await verifyMigration())) return { ok: false, fallback: false, error: new Error("INVENTORY_BACKEND_NOT_READY") };
  if (!canManageCentralCatalog()) return { ok: false, fallback: false, error: new Error("CATALOG_EDIT_NOT_ALLOWED") };
  const catalog = buildCentralCatalog(items);
  const item = catalog.find((entry) => entry.key === itemKey);
  if (!item) return { ok: false, fallback: false, error: new Error("CATALOG_ITEM_NOT_FOUND") };

  try {
    await vpsSyncCatalog(item);
    if (sync) await syncInventoryNow("central", { reloadBranch: false });
    return { ok: true };
  } catch (error) {
    dispatchStatus("error", { error: error.message, stage: "central-catalog-sync" });
    return { ok: false, fallback: false, error };
  }
}

export async function cloudArchiveCentralItem(itemKey) {
  if (!(await verifyMigration())) return { ok: false, fallback: false, error: new Error("INVENTORY_BACKEND_NOT_READY") };
  if (role() !== "admin") return { ok: false, fallback: false, error: new Error("ADMIN_REQUIRED") };
  if (!String(itemKey || "").startsWith("central:")) return { ok: false, fallback: false, error: new Error("INVALID_ITEM_KEY") };
  try {
    const data = await vpsArchiveCatalogItem(itemKey);
    await syncInventoryNow("central", { reloadBranch: false });
    return { ok: Boolean(data?.archived), fallback: false };
  } catch (error) {
    dispatchStatus("error", { error: error.message, stage: "central-catalog-archive" });
    return { ok: false, fallback: false, error };
  }
}

export async function cloudArchiveBranchItem(stockKey, site = currentSite()) {
  if (!(await verifyMigration())) return { ok: false, fallback: false, error: new Error("INVENTORY_BACKEND_NOT_READY") };
  if (role() !== "admin") return { ok: false, fallback: false, error: new Error("ADMIN_REQUIRED") };
  if (!isBranchInventorySite(site)) return { ok:false, fallback:false, error:new Error("INVALID_SITE") };

  const itemKey = branchItemKey(site,stockKey);
  try {
    const data = await vpsArchiveCatalogItem(itemKey);
    await syncInventoryNow(site, { reloadBranch: false });
    return { ok: Boolean(data?.archived), fallback: false };
  } catch (error) {
    dispatchStatus("error", { error: error.message, stage: "catalog-archive" });
    return { ok: false, fallback: false, error };
  }
}

export function cloudSyncFuxingCatalogItem(stockKey) {
  return cloudSyncBranchCatalogItem(stockKey,"fuxing");
}

export function cloudArchiveFuxingItem(stockKey) {
  return cloudArchiveBranchItem(stockKey,"fuxing");
}

export function branchLocationCode(site, zone) {
  return inventoryLocationByUiKey(site,zone,"storage")?.code || "";
}

export function branchWorkLocationCode(site, area) {
  return inventoryWorkLocation(site,area)?.code || "";
}

export function branchItemKey(site, stockKey) {
  return site && stockKey ? `${site}:${stockKey}` : "";
}

export function fuxingLocationCode(zone) {
  return branchLocationCode("fuxing",zone);
}

export function fuxingWorkLocationCode(area) {
  return branchWorkLocationCode("fuxing",area);
}

export function centralLocationCode(zone) {
  return inventoryLocationByUiKey("central",zone,"storage")?.code || "";
}

export function fuxingItemKey(stockKey) {
  return branchItemKey("fuxing",stockKey);
}

export function centralItemKey(id) {
  return id ? `central:${id}` : "";
}

export async function getCloudInventoryHistory(site = currentSite(), limit = 200) {
  if (!(await verifyMigration()) || role() !== "admin") return [];

  try {
    const [historyResult, rows] = await Promise.all([
      vpsInventoryHistory(site, { limit }),
      fetchSite(site),
    ]);
    const itemMap = new Map(rows.map((row) => [row.item.id, row.item]));
    const locationMap = new Map(rows.map((row) => [row.location.id, row.location]));
    const tx = historyResult?.transactions || [];

    return tx.map((entry) => {
      const locationId = entry.destination_location_id || entry.source_location_id || "";
      const meta = entry.metadata || {};
      const minimumChange = meta.operation === "set_minimum";
      const before = minimumChange
        ? meta.before_minimum ?? ""
        : meta.before_quantity ?? meta.source_before ?? meta.destination_before ?? "";
      const after = minimumChange
        ? meta.after_minimum ?? ""
        : meta.after_quantity ?? meta.source_after ?? meta.destination_after ?? "";
      return {
        ...entry,
        location_id: locationId,
        direction: minimumChange ? "minimum" : entry.action || "",
        before_quantity: before,
        after_quantity: after,
        actor_id: entry.actor_user_id,
        item: itemMap.get(entry.item_id),
        location: locationMap.get(locationId),
        actor: entry.actor_username ? {
          id: entry.actor_user_id,
          username: entry.actor_username,
          display_name: entry.actor_username,
        } : null,
      };
    });
  } catch {
    return [];
  }
}

async function subscribeRealtime(site) {
  if (!(await verifyMigration()) || !site) return;
  lastSite = site;
  const s = session();
  if (!s?.id || typeof EventSource === "undefined") return;
  if (realtimeSource && realtimeUserId === s.id) return;
  realtimeSource?.close();
  realtimeSource = null;
  realtimeUserId = s.id;
  const clientId = vpsInventoryClientId();
  const source = new EventSource(`/api/inventory/events?clientId=${encodeURIComponent(clientId)}`);
  realtimeSource = source;
  source.addEventListener("inventory", (event) => {
    let payload = null;
    try { payload = JSON.parse(event.data || "null"); } catch {}
    if (payload?.sourceClientId && payload.sourceClientId === clientId) return;
    clearTimeout(realtimeRefreshTimer);
    realtimeRefreshTimer = window.setTimeout(() => {
      const activeSite = currentSite();
      if (activeSite) void syncInventoryNow(activeSite, { reloadBranch:false, force:true });
    }, 120);
  });
}

function closeRealtime() {
  realtimeSource?.close();
  realtimeSource = null;
  realtimeUserId = "";
  clearTimeout(realtimeRefreshTimer);
}

async function boot() {
  if (document.documentElement.dataset.vpsAuthReady !== "true") return;
  const s = session();
  if (!isInventoryBackendConfigured() || !s) {
    closeRealtime();
    return;
  }
  if (bootedUserId && bootedUserId !== s.id && polling) {
    clearInterval(polling);
    polling = 0;
    closeRealtime();
  }
  if (bootedUserId === s.id && polling) return;
  if (!(await verifyMigration())) return;
  await ensureSiteRegistry();
  bootedUserId = s.id || "";

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

window.addEventListener("shitu:auth-synced", () => { void boot(); });
window.addEventListener("shitu:vps-auth-ready", () => { void boot(); });
window.addEventListener("shitu:auth-expired", () => {
  closeRealtime();
});
window.addEventListener("focus", () => {
  if (document.documentElement.dataset.vpsAuthReady === "true") void syncInventoryNow(currentSite());
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && document.documentElement.dataset.vpsAuthReady === "true") {
    void syncInventoryNow(currentSite());
  }
});
window.addEventListener("hashchange", () => {
  const site = currentSite();
  if (site && site !== lastSite) void subscribeRealtime(site);
  setTimeout(() => { void syncInventoryNow(site); }, 80);
});
window.addEventListener("shitu:central-stock-ready", (event) => {
  void event;
});

if (document.documentElement.dataset.vpsAuthReady === "true") void boot();
