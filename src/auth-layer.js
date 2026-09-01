import { mountDraftInventoryOperations, mountInventoryOperations, operationTabLabels } from "./inventory-operations.js";
import {
  activeInventorySite,
  bootstrapCentralInventory,
  canDirectInventoryAdjust,
  canInventoryDraftCount,
  canInventoryEdit,
  canManageCentralCatalog,
  centralItemKey,
  centralLocationCode,
  cloudAdjustQuantity,
  cloudArchiveCentralItem,
  cloudSetQuantity,
  cloudSyncCentralCatalogItem,
  getCloudInventoryHistory,
  getSiteInventoryRows,
  inventoryCloudState,
  setActiveInventorySite,
  syncInventoryNow,
} from "./inventory-cloud.js";
import { searchMatches } from "./search-utils.js";

const AUTH_KEY = "shitu-kitchen-auth-v1";
const CENTRAL_KEY = "shitu-central-kitchen-stock-v1";
const CENTRAL_DRAFT_KEY = "shitu-central-kitchen-draft-stock-v1";
const CENTRAL_WORK_KEY = "shitu-central-kitchen-work-v1";
const BRANCH_DRAFT_PREFIX = "shitu-branch-inventory-draft-v1:";
const OPERATION_LOG_KEY = "shitu-inventory-operation-log-v1";
const HISTORY_KEY = "shitu-central-kitchen-history-v1";


const CENTRAL_ZONES = ["央廚冷凍", "央廚4門", "央廚臥櫃", "央廚冷藏"];
const CENTRAL_WORK_AREAS = [
  { id:"noodles", zh:"麵區", vi:"Khu mì" },
  { id:"soup", zh:"湯區", vi:"Khu canh" },
  { id:"seafood", zh:"海鮮區", vi:"Khu hải sản" },
  { id:"meat", zh:"肉區", vi:"Khu thịt" },
];
const CENTRAL_UNITS = ["包","盒","箱","斤","片","個","隻","塊","條","顆","手","kg"];

const DEFAULT_PRODUCTS = [
  ["麻辣湯(3000cc/包)", "Nước lẩu mala 3000cc", "包", "央廚冷凍"],
  ["香辣湯(3000cc/包)", "Nước lẩu cay thơm 3000cc", "包", "央廚冷凍"],
  ["昆布湯(3000cc/包)", "Nước dùng kombu 3000cc", "包", "央廚冷凍"],
  ["炸芋頭(1.2K/包)", "Khoai môn chiên 1.2kg", "包", "央廚冷凍"],
  ["炸魷魚(400g/包)", "Mực chiên 400g", "包", "央廚冷凍"],
  ["排骨酥", "Sườn non chiên giòn", "包", "央廚冷凍"],
  ["虎皮雞腳", "Chân gà da hổ", "包", "央廚冷凍"],
  ["鮮肉芋丸", "Viên khoai môn nhân thịt", "顆", "央廚冷凍"],
  ["腐皮(2斤)", "Tàu hũ ky 2 cân", "斤", "央廚冷凍"],
  ["鴨肉丸", "Viên thịt vịt", "包", "央廚冷凍"],
  ["三記魚餃", "Sủi cảo cá Sanji", "包", "央廚冷凍"],
  ["魚餃", "Sủi cảo cá", "盒", "央廚冷凍"],
  ["牛肉蛋餃", "Há cảo trứng nhân bò", "盒", "央廚冷凍"],
  ["白腹豆腐", "Đậu phụ trắng", "條", "央廚冷藏"],
  ["鴨血", "Huyết vịt", "手", "央廚冷藏"],
  ["滷豆腐", "Đậu phụ kho", "手", "央廚冷藏"],
  ["鴨翅", "Cánh vịt", "盒", "央廚冷藏"],
  ["鴨舌", "Lưỡi vịt", "盒", "央廚冷藏"],
  ["豆干", "Đậu khô", "盒", "央廚冷藏"],
  ["雞腳", "Chân gà", "包", "央廚冷藏"],
  ["牛尾油汁(2000g/包)", "Sốt dầu đuôi bò 2000g", "包", "央廚4門"],
  ["辣椒油(1L/包)", "Dầu ớt 1L", "包", "央廚4門"],
  ["泡蛋汁(3K/包)", "Sốt ngâm trứng 3kg", "包", "央廚4門"],
  ["牛肉(原油)(1kg/包)", "Thịt bò 1kg", "包", "央廚臥櫃"],
  ["大骨湯(5K/包)", "Nước xương 5kg", "包", "央廚臥櫃"],
  ["牛肉燴飯", "Cơm sốt thịt bò", "包", "央廚臥櫃"],
  ["燴飯醬包(小)180g", "Gói sốt cơm nhỏ 180g", "包", "央廚臥櫃"],
  ["重麻湯包", "Gói nước dùng mala đậm", "包", "央廚冷凍"],
  ["輕麻湯包", "Gói nước dùng mala nhẹ", "包", "央廚冷凍"],
  ["川麻湯包", "Gói nước dùng mala Tứ Xuyên", "包", "央廚冷凍"],
  ["牛尾肉袋(2K/包)", "Túi thịt đuôi bò 2kg", "包", "央廚冷凍"],
  ["地獄牛肉燴飯", "Cơm sốt bò địa ngục", "包", "央廚冷凍"],
  ["燴飯汁(180g)", "Sốt cơm 180g", "包", "央廚冷凍"],
  ["地獄牛肚", "Dạ dày bò địa ngục", "包", "央廚冷凍"],
  ["舒肥牛排", "Bít tết sous-vide", "包", "央廚冷凍"],
  ["秘蒜醬", "Sốt tỏi bí truyền", "包", "央廚4門"],
  ["微辣沾醬", "Sốt chấm cay nhẹ", "包", "央廚4門"],
  ["牛尾追飯", "Cơm đuôi bò", "包", "央廚冷凍"],
  ["滷膠豆干", "Đậu khô kho", "包", "央廚冷藏"],
  ["滷膠鴨翅", "Cánh vịt kho", "包", "央廚冷藏"],
  ["滷膠鴨舌", "Lưỡi vịt kho", "包", "央廚冷藏"],
  ["滷膠鴨腸", "Lòng vịt kho", "包", "央廚冷藏"],
].map((p, index) => ({ id: `central-${index + 1}`, zh: p[0], vi: p[1], unit: p[2], zone: p[3], qty: 0 }));

function session() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY) || "null"); } catch { return null; }
}
function announceCentralStock(items) {
  queueMicrotask(() => {
    window.dispatchEvent(new CustomEvent("shitu:central-stock-ready", { detail: { items } }));
  });
}
function readCentralDrafts() {
  try {
    const saved = JSON.parse(localStorage.getItem(CENTRAL_DRAFT_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch { return []; }
}
function centralBaseKey(item) {
  return item.itemKey || item.baseId || String(item.id || "").split("@")[0];
}
function centralDraftKey(item) {
  return `${centralBaseKey(item)}|${item.zone || ""}`;
}
function loadBaseStock() {
  try {
    const saved = JSON.parse(localStorage.getItem(CENTRAL_KEY) || "null");
    if (Array.isArray(saved) && saved.length) return saved;
  } catch {}
  const seeded = structuredClone(DEFAULT_PRODUCTS);
  localStorage.setItem(CENTRAL_KEY, JSON.stringify(seeded));
  return seeded;
}
function loadStock() {
  const base = loadBaseStock();
  const cloudReady = inventoryCloudState() === "ready";
  if (cloudReady) {
    announceCentralStock(base);
    return base;
  }

  const draftRows = readCentralDrafts();
  const exactDrafts = new Map(draftRows.map((entry) => [entry.key, entry]));
  const legacyDrafts = new Map(draftRows.map((entry) => [String(entry.key || "").split("|")[0], entry]));
  const represented = new Set();
  const merged = base.map((item) => {
    const exactKey = centralDraftKey(item);
    const baseKey = centralBaseKey(item);
    const draft = exactDrafts.get(exactKey) || legacyDrafts.get(baseKey);
    represented.add(exactKey);
    return draft ? {
      ...item,
      ...draft,
      id: draft.id || item.id,
      baseId: draft.baseId || item.baseId,
      itemKey: draft.itemKey || item.itemKey,
      zh: draft.zh || item.zh,
      vi: draft.vi || item.vi,
      unit: draft.unit || item.unit,
      workArea: draft.workArea || item.workArea || "noodles",
      zone: draft.zone || item.zone,
      qty: Math.max(0, Number(draft.qty) || 0),
      draft: true,
    } : item;
  });

  for (const draft of draftRows) {
    if (!draft?.key || represented.has(draft.key) || !draft.zone || !draft.zh) continue;
    merged.push({
      id: draft.id || `${centralBaseKey(draft)}@${centralLocationCode(draft.zone)}`,
      baseId: draft.baseId || centralBaseKey(draft),
      itemKey: draft.itemKey || centralBaseKey(draft),
      catalogKey: draft.catalogKey || "",
      zh: draft.zh,
      vi: draft.vi || draft.zh,
      unit: draft.unit || "個",
      workArea: draft.workArea || "noodles",
      zone: draft.zone,
      qty: Math.max(0, Number(draft.qty) || 0),
      minimum: Math.max(0, Number(draft.minimum) || 0),
      draft: true,
    });
  }

  announceCentralStock(merged);
  return merged;
}
function saveStock(items) {
  if (inventoryCloudState() !== "ready") {
    const actor = session();
    const now = new Date().toISOString();
    const drafts = items.map((item) => ({
      key: centralDraftKey(item),
      id: item.id,
      baseId: item.baseId || centralBaseKey(item),
      itemKey: item.itemKey || centralBaseKey(item),
      catalogKey: item.catalogKey || "",
      zh: item.zh,
      vi: item.vi,
      unit: item.unit,
      workArea: item.workArea || "noodles",
      zone: item.zone,
      qty: Math.max(0, Number(item.qty) || 0),
      minimum: Math.max(0, Number(item.minimum) || 0),
      locationFixed: Boolean(item.locationFixed),
      fixedAt: item.fixedAt || null,
      fixedReason: item.fixedReason || null,
      updatedAt: now,
      updatedBy: actor?.id || null,
      updatedByName: actor?.name || "",
      status: "staging",
    }));
    localStorage.setItem(CENTRAL_DRAFT_KEY, JSON.stringify(drafts));
    return;
  }
  localStorage.setItem(CENTRAL_KEY, JSON.stringify(items));
}
function stagingLocationsForSite(site){
  if(site==="central"){
    return CENTRAL_ZONES.map((zone)=>({
      id:centralLocationCode(zone),
      code:centralLocationCode(zone),
      name_zh_tw:zone,
      name_vi:zone==="央廚冷凍"?"Tủ đông bếp trung tâm"
        :zone==="央廚冷藏"?"Tủ mát bếp trung tâm"
        :zone==="央廚4門"?"Tủ 4 cánh bếp trung tâm"
        :"Tủ đông nằm bếp trung tâm",
      site,kind:"storage",
    }));
  }
  const defs=[
    ["large-freezer","大冷凍","Tủ đông lớn"],
    ["large-fridge","大冷藏","Tủ mát lớn"],
    ["four-door","四門冰箱","Tủ lạnh 4 cánh"],
    ["kitchen","廚房冰箱","Tủ lạnh bếp"],
  ];
  return defs.map(([suffix,zh,vi])=>({
    id:`${site}-${suffix}`,code:`${site}-${suffix}`,name_zh_tw:zh,name_vi:vi,site,kind:"storage",
  }));
}
function appendOperationLog(entry){
  let rows=[];
  try{
    const saved=JSON.parse(localStorage.getItem(OPERATION_LOG_KEY)||"[]");
    if(Array.isArray(saved))rows=saved;
  }catch{}
  rows.unshift({...entry,createdAt:new Date().toISOString()});
  localStorage.setItem(OPERATION_LOG_KEY,JSON.stringify(rows.slice(0,1000)));
}
function loadBranchDraftForCentral(site){
  const key=`${BRANCH_DRAFT_PREFIX}${site}`;
  try{
    const saved=JSON.parse(localStorage.getItem(key)||"null");
    if(saved?.inventory&&saved?.workInventory)return saved;
  }catch{}
  let baseRecord={inventory:[],workInventory:[]};
  try{
    const state=JSON.parse(localStorage.getItem("shitu-kitchen-os-v1")||"null");
    const selected=state?.selectedDate;
    baseRecord=state?.records?.[selected]||baseRecord;
  }catch{}
  const inventory=JSON.parse(JSON.stringify(baseRecord.inventory||[]));
  const workInventory=JSON.parse(JSON.stringify(baseRecord.workInventory||[]));
  if(site==="yongji"){
    inventory.forEach((item)=>{item.quantity=0;});
    workInventory.forEach((item)=>{item.quantity=0;});
  }
  const seeded={inventory,workInventory,updatedAt:new Date().toISOString(),status:"staging"};
  localStorage.setItem(key,JSON.stringify(seeded));
  return seeded;
}
function addToBranchDraftFromCentral(site,itemMeta,destinationLocationId,amount){
  if(!["fuxing","yongji"].includes(site))return false;
  const suffix=String(destinationLocationId||"").replace(`${site}-`,"");
  if(!["large-freezer","large-fridge","four-door","kitchen"].includes(suffix))return false;
  const draft=loadBranchDraftForCentral(site);
  let row=draft.inventory.find((entry)=>
    (itemMeta?.catalogKey&&entry.catalogKey===itemMeta.catalogKey) || entry.label===itemMeta?.zh
  );
  if(!row){
    const stockKey=`received-${String(itemMeta?.zh||"item").replace(/\s+/g,"-")}`;
    row={id:`${stockKey}-${suffix}`,stockKey,catalogKey:itemMeta?.catalogKey||"",label:itemMeta?.zh||stockKey,labelVi:itemMeta?.vi||itemMeta?.zh||stockKey,unit:itemMeta?.unit||"個",workArea:"noodles",storageOnly:true,zone:suffix,quantity:0,minimum:0};
    draft.inventory.push(row);
  }else{
    const stockKey=row.stockKey||String(row.id||"").split("-")[0];
    let target=draft.inventory.find((entry)=>entry.stockKey===stockKey&&entry.zone===suffix);
    if(!target){
      target={...row,id:`${stockKey}-${suffix}`,zone:suffix,quantity:0,minimum:0};
      draft.inventory.push(target);
    }
    row=target;
  }
  row.quantity=Math.max(0,Number(row.quantity)||0)+Math.max(1,Number(amount)||1);
  row.locationFixed=true;
  row.fixedAt=new Date().toISOString();
  row.fixedReason="ship";
  draft.status="staging";
  draft.updatedAt=new Date().toISOString();
  localStorage.setItem(`${BRANCH_DRAFT_PREFIX}${site}`,JSON.stringify(draft));
  return true;
}
function readCentralWork(){
  try{
    const saved=JSON.parse(localStorage.getItem(CENTRAL_WORK_KEY)||"{}");
    return saved && typeof saved==="object" && !Array.isArray(saved) ? saved : {};
  }catch{return {};}
}
function saveCentralWork(value){
  localStorage.setItem(CENTRAL_WORK_KEY,JSON.stringify(value||{}));
}
function centralWorkLocation(){
  return {id:"central-work-use",code:"central-work-use",name_zh_tw:"使用中",name_vi:"Đang sử dụng",site:"central",kind:"work"};
}

function centralDraftOperationData() {
  const items = loadStock();
  const workMap = readCentralWork();
  const workLocation = centralWorkLocation();
  const locations = CENTRAL_ZONES.map((zone) => ({
    id: centralLocationCode(zone),
    code: centralLocationCode(zone),
    name_zh_tw: zone,
    name_vi: zone === "央廚冷凍" ? "Tủ đông bếp trung tâm"
      : zone === "央廚冷藏" ? "Tủ mát bếp trung tâm"
      : zone === "央廚4門" ? "Tủ 4 cánh bếp trung tâm"
      : "Tủ đông nằm bếp trung tâm",
    site: "central",
    kind: "storage",
  }));
  const grouped = new Map();
  for (const row of items) {
    const baseKey = centralBaseKey(row);
    if (!grouped.has(baseKey)) {
      const workQty=Math.max(0,Number(workMap[baseKey])||0);
      grouped.set(baseKey, {
        id: baseKey,
        itemKey: row.itemKey || baseKey,
        catalogKey: row.catalogKey || "",
        zh: row.zh,
        vi: row.vi,
        unit: row.unit,
        workArea: "use",
        locations: [],
        workLocations: [{id:workLocation.id,code:workLocation.code,zh:workLocation.name_zh_tw,vi:workLocation.name_vi,quantity:workQty,minimum:0}],
        total: 0,
        workTotal: workQty,
      });
    }
    const item = grouped.get(baseKey);
    const location = locations.find((entry) => entry.code === centralLocationCode(row.zone));
    if (!location) continue;
    const quantity = Math.max(0, Number(row.qty) || 0);
    item.locations.push({
      id: location.id,
      code: location.code,
      zh: location.name_zh_tw,
      vi: location.name_vi,
      quantity,
      minimum: Math.max(0, Number(row.minimum) || 0),
    });
    item.total += quantity;
  }
  for (const item of grouped.values()) {
    for (const location of locations) {
      if (!item.locations.some((entry) => entry.id === location.id)) {
        item.locations.push({
          id: location.id,
          code: location.code,
          zh: location.name_zh_tw,
          vi: location.name_vi,
          quantity: 0,
          minimum: 0,
        });
      }
    }
  }
  return {
    site:"central",
    items:[...grouped.values()],
    locations,
    workLocations:[workLocation],
    allLocations:["central","fuxing","yongji"].flatMap((site)=>stagingLocationsForSite(site)),
  };
}

function applyCentralDraftOperation(user,{ type, itemId, itemMeta, sourceLocationId, destinationLocationId, amount, targetSite, sourceSite }) {
  const items = loadStock();
  const workMap = readCentralWork();
  let productRows = items.filter((row) => centralBaseKey(row) === itemId);
  let template = productRows[0];
  if (!template && itemMeta?.zh) {
    productRows = items.filter((row) => row.zh === itemMeta.zh || (itemMeta.catalogKey && row.catalogKey === itemMeta.catalogKey));
    template = productRows[0];
  }
  const codeToZone = Object.fromEntries(CENTRAL_ZONES.map((zone) => [centralLocationCode(zone), zone]));
  if (!template) return { ok:false, error:new Error("ITEM_NOT_FOUND") };

  const baseKey=centralBaseKey(template);
  const sourceZone = codeToZone[sourceLocationId] || "";
  const destinationZone = codeToZone[destinationLocationId] || "";
  const value = Math.max(1, Number(amount) || 1);

  function ensureRow(zone) {
    let row = items.find((entry) => centralBaseKey(entry) === baseKey && entry.zone === zone);
    if (!row) {
      row = {
        ...template,
        id: `${baseKey}@${centralLocationCode(zone)}`,
        baseId: baseKey,
        itemKey: template.itemKey || baseKey,
        zone,
        qty: 0,
        minimum: 0,
        draft: true,
      };
      items.push(row);
    }
    return row;
  }

  let before = 0;
  let after = 0;
  let sourceLabel=sourceZone||sourceSite||"";
  let destinationLabel=destinationZone||targetSite||"";

  if (type === "in") {
    const target = ensureRow(destinationZone);
    before = Number(target.qty || 0);
    target.qty = before + value;
    after = target.qty;
  } else if (type === "pick") {
    const source=ensureRow(sourceZone);
    before=Number(source.qty||0);
    if(before<value)return {ok:false,error:new Error("INSUFFICIENT_STOCK")};
    source.qty=before-value;
    workMap[baseKey]=Math.max(0,Number(workMap[baseKey])||0)+value;
    after=source.qty;
    destinationLabel="使用中";
  } else if (type === "use") {
    before=Math.max(0,Number(workMap[baseKey])||0);
    if(before<value)return {ok:false,error:new Error("INSUFFICIENT_STOCK")};
    workMap[baseKey]=before-value;
    after=workMap[baseKey];
    sourceLabel="使用中";
    destinationLabel="使用";
  } else if (type === "return") {
    before=Math.max(0,Number(workMap[baseKey])||0);
    if(before<value)return {ok:false,error:new Error("INSUFFICIENT_STOCK")};
    workMap[baseKey]=before-value;
    const target=ensureRow(destinationZone);
    target.qty=Number(target.qty||0)+value;
    after=workMap[baseKey];
    sourceLabel="使用中";
  } else if (type === "ship") {
    const source = ensureRow(sourceZone);
    before = Number(source.qty || 0);
    if (before < value) return { ok:false, error:new Error("INSUFFICIENT_STOCK") };
    source.qty = before - value;
    after = source.qty;
    const ok = addToBranchDraftFromCentral(targetSite,itemMeta || {
      zh:template.zh,vi:template.vi,unit:template.unit,catalogKey:template.catalogKey || ""
    },destinationLocationId,value);
    if (!ok) { source.qty = before; return { ok:false, error:new Error("INVALID_DESTINATION_LOCATION") }; }
    const targetLocation=stagingLocationsForSite(targetSite).find((entry)=>entry.id===destinationLocationId);
    destinationLabel=`${targetSite}:${targetLocation?.name_zh_tw||destinationLocationId}`;
    destinationLabel=`${targetSite}:${destinationLocationId}`;
  } else if (type === "transfer") {
    if (!sourceZone || !destinationZone || sourceZone === destinationZone) return { ok:false, error:new Error("SAME_LOCATION") };
    const source = ensureRow(sourceZone);
    const target = ensureRow(destinationZone);
    const sourceBefore = Number(source.qty || 0);
    if (sourceBefore < value) return { ok:false, error:new Error("INSUFFICIENT_STOCK") };
    source.qty = sourceBefore - value;
    target.qty = Number(target.qty || 0) + value;
    before = sourceBefore;
    after = source.qty;
  } else {
    return { ok:false, error:new Error("INVALID_OPERATION") };
  }

  saveStock(items);
  saveCentralWork(workMap);
  appendOperationLog({
    site:"central",user:user.name,userId:user.id,action:type,item:template.zh,amount:value,unit:template.unit,
    source:sourceLabel,destination:destinationLabel,
    locationFixed:type==="ship"
  });
  pushHistory({
    user:user.name,
    userId:user.id,
    direction:type,
    status:"staging",
    product:template.zh,
    productId:baseKey,
    zone:`${sourceLabel}${destinationLabel ? " → "+destinationLabel : ""}`,
    unit:template.unit,
    amount:value,
    before,
    after,
    note:type === "in" ? "進貨入庫"
      : type === "pick" ? "領貨"
      : type === "use" ? "使用"
      : type === "return" ? "歸位"
      : type === "ship" ? `出貨 → ${targetSite || ""}`
      : "庫存轉撥",
  });
  return { ok:true };
}

function history() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { return []; }
}
function pushHistory(entry) {
  const list = history();
  list.unshift({ id: crypto.randomUUID?.() || String(Date.now()), at: new Date().toISOString(), ...entry });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 1000)));
}
function esc(v) { return String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }

function loginScreen(error = "") {
  document.body.classList.add("auth-locked");
  let host = document.querySelector("#auth-layer");
  if (!host) { host = document.createElement("div"); host.id = "auth-layer"; document.body.append(host); }
  host.innerHTML = `<div class="auth-shell"><section class="auth-card"><div class="auth-brand"><span>食</span><div><strong>食徒 Kitchen OS</strong><small>內部管理系統</small></div></div><h1>登入</h1><p>請使用管理員、央廚、復興店或永吉店帳號登入。</p>${error ? `<div class="auth-error">${esc(error)}</div>` : ""}<form id="auth-login-form"><label>帳號<input name="username" autocomplete="username" required /></label><label>密碼<input type="password" name="password" autocomplete="current-password" required /></label><button type="submit">登入系統</button></form><div class="demo-account-note">${location.hostname==="82.47.180.185"?"VPS Auth · 帳號與權限由 VPS 管理":"Supabase Auth · 帳號與權限雲端同步"}</div></section></div>`;

}

function addLogout(user) {
  const top = document.querySelector(".topbar-actions");
  if (!top || top.querySelector(".auth-user-chip")) return;
  const chip = document.createElement("div");
  chip.className = "auth-user-chip";
  chip.innerHTML = `<span><strong>${esc(user.name)}</strong><small>${user.location === "central" ? "央廚" : user.location === "fuxing" ? "復興店" : user.location === "yongji" ? "永吉店" : "Admin"}</small></span><button type="button">登出</button>`;
  top.prepend(chip);
}

function branchSwitcher(user, active = activeInventorySite() || "fuxing") {
  if (user.location !== "all" && user.role !== "admin") return "";
  return `<div class="warehouse-switch"><button data-warehouse="fuxing" class="${active === "fuxing" ? "active" : ""}">復興店</button><button data-warehouse="yongji" class="${active === "yongji" ? "active" : ""}">永吉店</button><button data-warehouse="central" class="${active === "central" ? "active" : ""}">央廚</button></div>`;
}

function centralPage(user) {
  const content = document.querySelector(".page-content");
  if (!content) return;
  const items = loadStock();
  const canEdit = user.role === "admin" || Boolean(user.permissions?.inventory?.edit);
  const draftCountAllowed = canInventoryDraftCount();
  const draftDirectAdjust = draftCountAllowed && user.role === "admin";
  let mode = content.dataset.centralMode || "overview";
  if (mode === "receive") { mode = "overview"; content.dataset.centralMode = "overview"; }
  if (mode === "out") { mode = "pick"; content.dataset.centralMode = "pick"; }
  if (["in","pick","transfer","ship"].includes(mode) && !canEdit) {
    mode = "overview";
    content.dataset.centralMode = mode;
  }
  const selectedZone = content.dataset.centralZone || "all";
  const query = content.dataset.centralSearch || "";
  const editorKey = content.dataset.centralEditor || "";
  const filtered = items.filter((item) => selectedZone === "all" || item.zone === selectedZone);
  const total = items.reduce((s, i) => s + Number(i.qty || 0), 0);
  const productCount = new Set(items.map((item) => centralBaseKey(item))).size;
  const accountRole = user.accountRole || (user.role === "admin" ? "admin" : user.role);
  const canManageCatalog = canManageCentralCatalog();
  const canViewHistory = accountRole === "admin";
  const log = canViewHistory && mode === "history" ? history() : [];
  const language = document.documentElement.lang === "vi" ? "vi" : "zh";
  const label = {
    overview: language === "vi" ? "Tổng quan · 庫存總覽" : "庫存總覽",
    inbound: language === "vi" ? "Nhập kho · 進貨入庫" : "進貨入庫",
    pick: language === "vi" ? "Lấy hàng · 領貨" : "領貨",
    transfer: language === "vi" ? "Điều chuyển · 庫存轉撥" : "庫存轉撥",
    ship: language === "vi" ? "Xuất hàng · 出貨" : "出貨",
    manage: language === "vi" ? "Quản trị kho · 庫存管理" : "庫存管理",
    history: language === "vi" ? "Lịch sử · 操作紀錄" : "操作紀錄",
  };
  const guide = {
    overview: language === "zh"
      ? "查看央廚各儲位的實際庫存；需要操作庫存時請切換到對應功能。"
      : "Xem tồn thực tế của từng khu trong xưởng; khi cần thao tác hãy chuyển sang đúng chức năng.",
    in: language === "zh"
      ? "新到原物料入庫：選擇要存放的央廚儲位並輸入實際到貨數量。"
      : "Nhập nguyên vật liệu mới: chọn đúng vị trí trong xưởng và nhập số lượng thực nhận.",
    pick: language === "zh"
      ? "從央廚儲位領到使用中；已使用的扣除，剩餘物料可選擇儲位歸位。"
      : "Lấy từ kho xưởng vào 使用中; phần dùng rồi được trừ, phần thừa chọn đúng vị trí để cất lại.",
    transfer: language === "zh"
      ? "只用於央廚內部換儲位；來源扣除、目的儲位增加。"
      : "Chỉ dùng để chuyển vị trí trong xưởng; nơi nguồn bị trừ và nơi đích được cộng.",
    ship: language === "zh"
      ? "從央廚出貨至分店時，請選擇分店及分店實際收貨儲位，資料會同步更新。"
      : "Khi xuất từ xưởng sang chi nhánh, chọn chi nhánh và vị trí nhận thực tế; dữ liệu hai bên cập nhật đồng thời.",
    manage: language === "zh"
      ? "新增或編輯原物料、單位、工作區、存放位置與標準量；日常進出貨請勿在此頁操作。"
      : "Thêm/sửa nguyên vật liệu, đơn vị, khu sử dụng, vị trí lưu và định mức; không dùng mục này cho nhập/xuất hằng ngày.",
    history: language === "zh"
      ? "查看庫存操作人員、時間、數量及前後變化；目前僅系統管理員可查看。"
      : "Xem người thao tác, thời gian, số lượng và thay đổi trước/sau; hiện chỉ Admin được xem.",
  };
  const guideHtml = `<div class="inventory-op-guide"><strong>${language === "zh" ? "使用說明" : "Hướng dẫn · 使用說明"}</strong><span>${esc(guide[mode] || "")}</span></div>`;
  const cloudState = inventoryCloudState();
  const cloudReady = cloudState === "ready";
  const cloudNotice = cloudReady
    ? ""
    : '<div class="inventory-cloud-notice inventory-fallback-notice"><strong>Dữ liệu kho hiện tại vẫn còn · 現有庫存資料仍保留</strong><small>Môi trường thử nghiệm: nhập kho, 領貨, sử dụng, cất lại, điều chuyển và 出貨 đều có hiệu lực ngay; hệ thống ghi người thực hiện. Không cần xác nhận quản lý ở giai đoạn hiện tại; quy trình duyệt sẽ triển khai sau trên VPS. · 測試環境：入庫、領貨、使用、歸位、轉撥與出貨皆立即生效並記錄操作人員；現階段不需主管確認，審核流程將於 VPS 正式版再啟用。</small></div>'

  content.innerHTML = `<div class="central-heading"><div><div class="central-eyebrow">工作區 · 央廚</div><h1>央廚庫存</h1><p>央廚冷凍、4門、臥櫃與冷藏的總覽及進出貨。</p></div>${branchSwitcher(user, "central")}</div>
    ${cloudNotice}<section class="central-stats"><article><span>品項</span><strong data-central-stat-items>${productCount}</strong><small>已建立產品</small></article><article><span>總數量</span><strong data-central-stat-total>${total}</strong><small>依各品項單位加總</small></article><article><span>儲存區</span><strong data-central-stat-zones>${CENTRAL_ZONES.length}</strong><small>央廚專用</small></article></section>
    <div class="central-tabs"><button data-central-mode="overview" class="${mode === "overview" ? "active" : ""}">${esc(label.overview)}</button>${canEdit ? `<button data-central-mode="in" class="${mode === "in" ? "active" : ""}">${esc(label.inbound)}</button><button data-central-mode="pick" class="${mode === "pick" ? "active" : ""}">${esc(label.pick)}</button><button data-central-mode="transfer" class="${mode === "transfer" ? "active" : ""}">${esc(label.transfer)}</button><button data-central-mode="ship" class="${mode === "ship" ? "active" : ""}">${esc(label.ship)}</button>` : ""}${canManageCatalog ? `<button data-central-mode="manage" class="${mode === "manage" ? "active" : ""}">${esc(label.manage)}</button>` : ""}${canViewHistory ? `<button data-central-mode="history" class="${mode === "history" ? "active" : ""}">${esc(label.history)}</button>` : ""}</div>
    ${guideHtml}
    ${mode === "history" && canViewHistory ? historyView(log) : mode === "manage" && canManageCatalog ? centralManageView(items, selectedZone, query, language, canViewHistory) : mode === "overview" ? stockView(filtered, "overview", selectedZone, query, draftDirectAdjust) : `<section class="inventory-operations-host" data-inventory-operations></section>`}
    ${mode === "manage" && canManageCatalog ? centralEditorModal(items, editorKey, language) : ""}
  `;
  bindCentral(user);
  const centralSearchInput = content.querySelector("[data-central-search]");
  if (centralSearchInput) applyCentralSearchDom(content, centralSearchInput.value || "");
  if (["in","pick","transfer","ship"].includes(mode)) {
    const host=content.querySelector("[data-inventory-operations]");
    if (cloudReady) {
      void mountInventoryOperations(host,{site:"central",mode,language,onUpdated:()=>{ void syncInventoryNow("central",{reloadBranch:false}); }});
    } else {
      void mountDraftInventoryOperations(host,{
        site:"central",
        mode,
        language,
        reload:async()=>centralDraftOperationData(),
        onApply:async(operation)=>{
          const result=applyCentralDraftOperation(user,operation);
          if(result.ok){
            const stat=document.querySelector("[data-central-stat-total]");
            if(stat) stat.textContent=String(loadStock().reduce((sum,item)=>sum+Number(item.qty||0),0));
          }
          return result;
        },
      });
    }
  }
  if (cloudReady) void bootstrapCentralInventory(items);
  if (cloudReady) void getSiteInventoryRows("central").then((rows) => {
    if (!rows?.length) return;
    const page=document.querySelector(".page-content");
    if (!page?.querySelector(".central-heading")) return;
    const uniqueItems=new Set(rows.map((row)=>row.item_id));
    const uniqueLocations=new Set(rows.map((row)=>row.location_id));
    const quantity=rows.reduce((sum,row)=>sum+Number(row.quantity||0),0);
    const itemNode=page.querySelector("[data-central-stat-items]");
    const totalNode=page.querySelector("[data-central-stat-total]");
    const zoneNode=page.querySelector("[data-central-stat-zones]");
    if(itemNode) itemNode.textContent=String(uniqueItems.size);
    if(totalNode) totalNode.textContent=String(quantity);
    if(zoneNode) zoneNode.textContent=String(uniqueLocations.size || CENTRAL_ZONES.length);
  }).catch(()=>{});
  if (cloudReady && mode === "history" && canViewHistory) {
    void getCloudInventoryHistory("central", 300).then((cloudLog) => {
      const current = document.querySelector(".page-content");
      if (!current || current.dataset.centralMode !== "history" || !cloudLog.length) return;
      const card = current.querySelector(".central-card");
      if (card) card.outerHTML = cloudHistoryView(cloudLog);
    });
  }
}

function stockView(items, mode, selectedZone, query, directAdjust = false) {
  const editing = mode === "in" || mode === "out";
  const direct = mode === "overview" && directAdjust;
  const draft = direct && inventoryCloudState() !== "ready";
  const directQuantityLabel = draft ? "Số lượng · 數量" : "盤點數量";
  const directActionLabel = draft ? "Cập nhật · 更新" : "盤點調整";
  return `<section class="central-card ${draft ? "central-draft-card" : ""}"><div class="central-toolbar"><div class="central-zone-tabs"><button data-central-zone="all" class="${selectedZone === "all" ? "active" : ""}">全部</button>${CENTRAL_ZONES.map(z => `<button data-central-zone="${esc(z)}" class="${selectedZone === z ? "active" : ""}">${esc(z)}</button>`).join("")}</div><input type="search" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" enterkeyhint="search" data-central-search placeholder="搜尋品項..." value="${esc(query)}" /></div>
    ${draft ? '<div class="central-draft-banner">Dữ liệu thử nghiệm · thao tác có hiệu lực ngay · 測試資料即時生效</div>' : ""}
    <div class="central-table-head"><span>品項</span><span>位置</span><span>目前數量</span>${editing ? `<span>${mode === "in" ? "入庫數量" : "出庫數量"}</span><span>操作</span>` : direct ? `<span>${directQuantityLabel}</span><span>${draft ? "暫存" : "調整"}</span>` : ""}</div>
    <div class="central-list">${items.map(i => `<article class="central-row ${i.draft ? "is-draft" : ""}"><div><strong>${esc(i.zh)}</strong><small>${esc(i.vi)}</small></div><span class="zone-pill">${esc(i.zone)}</span><div class="central-current"><strong>${Number(i.qty || 0)}</strong><small>${esc(i.unit)}${i.draft ? " · 測試" : ""}</small></div>${editing ? `<input type="number" min="1" value="1" data-central-qty="${esc(i.id)}"/><button class="central-action ${mode === "out" ? "out" : ""}" data-central-adjust="${esc(i.id)}" data-direction="${mode}">${mode === "in" ? "+ 入庫" : "− 出庫"}</button>` : direct ? `<input type="number" min="0" value="${Number(i.qty || 0)}" data-central-set-qty="${esc(i.id)}"/><button class="central-action adjust ${draft ? "draft-save" : ""}" data-central-set="${esc(i.id)}">${directActionLabel}</button>` : ""}</article>`).join("") || `<p class="central-empty">沒有符合條件的品項。</p>`}<p class="central-empty" data-central-search-empty hidden>沒有符合條件的品項。</p></div></section>`;
}


function centralProductKey(item) {
  const key = centralBaseKey(item);
  return String(key || "");
}

function centralProductGroups(items) {
  const grouped = new Map();
  for (const item of items) {
    const key = centralProductKey(item);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  }
  return [...grouped.entries()].map(([key, rows]) => ({ key, rows, item: rows[0] }));
}

function centralZoneLabel(zone, language) {
  if (language === "zh") return zone;
  if (zone === "央廚冷凍") return "Tủ đông bếp trung tâm · 央廚冷凍";
  if (zone === "央廚冷藏") return "Tủ mát bếp trung tâm · 央廚冷藏";
  if (zone === "央廚4門") return "Tủ 4 cánh bếp trung tâm · 央廚4門";
  if (zone === "央廚臥櫃") return "Tủ đông nằm · 央廚臥櫃";
  return zone;
}

function centralWorkAreaLabel(area, language) {
  const found = CENTRAL_WORK_AREAS.find((entry) => entry.id === area);
  return found ? (language === "zh" ? found.zh : `${found.vi} · ${found.zh}`) : area || "—";
}

function centralManageView(items, selectedZone, query, language, allowDelete = false) {
  const groups = centralProductGroups(items).filter(({ rows }) =>
    selectedZone === "all" || rows.some((row) => row.zone === selectedZone)
  );
  const addLabel = language === "zh" ? "新增食材" : "Thêm nguyên liệu · 新增食材";
  const editLabel = language === "zh" ? "編輯" : "Sửa · 編輯";
  const deleteLabel = language === "zh" ? "刪除" : "Xóa · 刪除";
  return `<section class="central-card central-manage-card">
    <div class="central-toolbar central-manage-toolbar">
      <div class="central-zone-tabs"><button data-central-zone="all" class="${selectedZone === "all" ? "active" : ""}">全部</button>${CENTRAL_ZONES.map((zone) => `<button data-central-zone="${esc(zone)}" class="${selectedZone === zone ? "active" : ""}">${esc(zone)}</button>`).join("")}</div>
      <button class="primary-button" type="button" data-central-editor-open="new">＋ ${esc(addLabel)}</button>
      <input type="search" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" enterkeyhint="search" data-central-search placeholder="${language === "zh" ? "搜尋品項..." : "Tìm nguyên liệu..."}" value="${esc(query)}" />
    </div>
    <div class="central-manage-list">${groups.map(({ key, item, rows }) => {
      const locations = rows.map((row) => `<span class="op-location-pill"><small>${esc(centralZoneLabel(row.zone, language))}</small><strong>${Number(row.qty || 0)} ${esc(row.unit || item.unit || "")}</strong><small>${language === "zh" ? "標準量" : "Định mức"} ${Number(row.minimum || 0)}</small></span>`).join("");
      return `<article class="central-manage-row" data-central-product="${esc(key)}">
        <div class="central-manage-product"><strong>${esc(item.zh)}</strong><small>${esc(item.vi || "")}</small><span>${esc(centralWorkAreaLabel(item.workArea || "noodles", language))} · ${esc(item.unit || "")}</span></div>
        <div class="op-location-list">${locations}</div>
        <div class="central-manage-actions"><button type="button" class="inventory-action-button" data-central-editor-open="${esc(key)}" aria-label="${esc(editLabel)}">✎</button>${allowDelete ? `<button type="button" class="inventory-action-button delete-action" data-central-product-delete="${esc(key)}" aria-label="${esc(deleteLabel)}">🗑</button>` : ""}</div>
      </article>`;
    }).join("") || `<p class="central-empty">${language === "zh" ? "沒有符合條件的品項。" : "Không có nguyên liệu phù hợp."}</p>`}<p class="central-empty" data-central-search-empty hidden>${language === "zh" ? "沒有符合條件的品項。" : "Không có nguyên liệu phù hợp."}</p></div>
  </section>`;
}

function centralEditorModal(items, editorKey, language) {
  if (!editorKey) return "";
  const editing = editorKey !== "new";
  const rows = editing ? items.filter((item) => centralProductKey(item) === editorKey) : [];
  const item = rows[0] || {};
  const title = editing
    ? (language === "zh" ? "編輯食材" : "Chỉnh sửa nguyên liệu · 編輯食材")
    : (language === "zh" ? "新增食材" : "Thêm nguyên liệu · 新增食材");
  const locationRows = CENTRAL_ZONES.map((zone) => {
    const stored = rows.find((row) => row.zone === zone);
    const checked = editing ? Boolean(stored) : zone === "央廚冷凍";
    return `<div class="modal-location-row">
      <label class="modal-location-choice"><input type="checkbox" name="central-zones" value="${esc(zone)}" ${checked ? "checked" : ""}/><span>${esc(centralZoneLabel(zone, language))}</span></label>
      <label><span>${language === "zh" ? "現有" : "Hiện có"}</span><input type="number" min="0" name="central-quantity:${esc(zone)}" value="${Number(stored?.qty || 0)}"/></label>
      <label><span>${language === "zh" ? "標準量" : "Định mức"}</span><input type="number" min="0" name="central-minimum:${esc(zone)}" value="${Number(stored?.minimum || 0)}"/></label>
    </div>`;
  }).join("");
  return `<div class="modal-backdrop central-editor-backdrop" data-central-editor-close>
    <section class="modal-card ingredient-modal central-editor-modal" role="dialog" aria-modal="true">
      <div class="card-heading"><h2>${esc(title)}</h2><button class="icon-button" type="button" data-central-editor-close>×</button></div>
      <form data-central-editor-form data-editor-key="${esc(editorKey)}">
        <label>中文<input required name="central-label" value="${esc(item.zh || "")}" placeholder="牛肉"/></label>
        <label>Tiếng Việt<input required name="central-label-vi" value="${esc(item.vi || "")}" placeholder="Thịt bò"/></label>
        <label>${language === "zh" ? "工作區" : "Khu làm việc · 工作區"}<select name="central-work-area">${CENTRAL_WORK_AREAS.map((area) => `<option value="${area.id}" ${(item.workArea || "noodles") === area.id ? "selected" : ""}>${esc(language === "zh" ? area.zh : `${area.vi} · ${area.zh}`)}</option>`).join("")}</select><small class="ingredient-form-guide">${language === "zh" ? "設定此原物料主要提供給哪個工作區使用。" : "Chọn khu làm việc chính sử dụng nguyên vật liệu này."}</small></label>
        <fieldset class="modal-locations"><legend>${language === "zh" ? "選擇食材存放位置" : "Chọn nơi cất nguyên liệu · 選擇食材存放位置"}</legend><p class="ingredient-form-guide">${language === "zh" ? "勾選實際存放的位置；「現有」為目前實際庫存，「標準量」為補貨／低庫存判斷基準。" : "Chọn vị trí thực tế có cất hàng; 現有 là tồn thực tế, 標準量 là mức chuẩn để cảnh báo/bổ hàng."}</p>${locationRows}</fieldset>
        <div class="modal-grid modal-meta-grid"><label>${language === "zh" ? "數量單位" : "Đơn vị · 數量"}<select name="central-unit">${CENTRAL_UNITS.map((unit) => `<option value="${esc(unit)}" ${item.unit === unit ? "selected" : ""}>${esc(unit)}</option>`).join("")}</select></label></div>
        <button class="primary-button modal-submit" type="submit">${editing ? "✓" : "＋"} ${esc(title)}</button>
      </form>
    </section>
  </div>`;
}

function historyView(log) {
  const actionLabel = {
    in:"進貨入庫",
    pick:"領貨",
    use:"使用",
    return:"歸位",
    ship:"出貨",
    transfer:"庫存轉撥",
    adjust:"盤點調整",
  };
  return `<section class="central-card"><div class="history-title"><div><h2>央廚庫存操作紀錄</h2><p>僅系統管理員可查看。</p></div><span>${log.length} 筆</span></div><div class="central-history">${log.map(x => {
    const sign=x.direction==="in"?"+":x.direction==="use"||x.direction==="ship"?"−":"↔";
    const tone=x.direction==="in"?"history-in":x.direction==="use"||x.direction==="ship"?"history-out":"history-adjust";
    return `<article><div><strong>${esc(x.product)}</strong><small>${new Date(x.at).toLocaleString("zh-TW")} · ${esc(x.user)} · ${esc(actionLabel[x.direction]||x.direction||"")}</small></div><span>${esc(x.zone)}</span><strong class="${tone}">${sign}${x.amount} ${esc(x.unit)}</strong><small>${x.before} → ${x.after}</small></article>`;
  }).join("") || `<p class="central-empty">目前尚無操作紀錄。</p>`}</div></section>`;
}

function cloudHistoryView(log) {
  return `<section class="central-card"><div class="history-title"><div><h2>央廚進出庫紀錄</h2><p>僅系統管理員可查看；資料來自目前主資料庫。</p></div><span>${log.length} 筆</span></div><div class="central-history">${log.map(x => {
    const direction = x.direction;
    const sign = direction === "out" ? "−" : direction === "in" ? "+" : "↔";
    const tone = direction === "out" ? "history-out" : direction === "in" ? "history-in" : "history-adjust";
    return `<article><div><strong>${esc(x.item?.name_zh_tw || "—")}</strong><small>${new Date(x.created_at).toLocaleString("zh-TW")} · ${esc(x.actor?.display_name || x.actor?.username || "—")} · ${esc(x.note || "")}</small></div><span>${esc(x.location?.name_zh_tw || "")}</span><strong class="${tone}">${sign}${x.amount} ${esc(x.item?.unit || "")}</strong><small>${x.before_quantity} → ${x.after_quantity}</small></article>`;
  }).join("") || `<p class="central-empty">目前尚無操作紀錄。</p>`}</div></section>`;
}

function applyCentralSearchDom(content, query) {
  const rows = [...content.querySelectorAll(".central-row, .central-manage-row")];
  let visible = 0;
  rows.forEach((row) => {
    const show = searchMatches(row.textContent || "", query);
    row.hidden = !show;
    if (show) visible += 1;
  });
  const empty = content.querySelector("[data-central-search-empty]");
  if (empty) empty.hidden = !query || visible > 0;
}

function bindCentral(user) {
  const content = document.querySelector(".page-content");
  if (!content) return;
  content.querySelectorAll("[data-central-mode]").forEach(b => b.onclick = () => { content.dataset.centralMode = b.dataset.centralMode; content.dataset.centralEditor = ""; centralPage(user); });
  content.querySelectorAll("[data-central-zone]").forEach(b => b.onclick = () => { content.dataset.centralZone = b.dataset.centralZone; centralPage(user); });
  const search = content.querySelector("[data-central-search]");
  if (search) {
    const applySearch = (event) => {
      if (event?.isComposing) return;
      const value = search.value;
      content.dataset.centralSearch = value;
      applyCentralSearchDom(content, value);
    };
    search.oninput = applySearch;
    search.onsearch = applySearch;
    search.oncompositionend = applySearch;
  }

  content.querySelectorAll("[data-central-editor-open]").forEach((button) => {
    button.onclick = () => {
      content.dataset.centralEditor = button.dataset.centralEditorOpen || "new";
      centralPage(user);
    };
  });
  content.querySelectorAll("[data-central-editor-close]").forEach((node) => {
    node.onclick = (event) => {
      if (node.classList.contains("central-editor-backdrop") && event.target !== node) return;
      content.dataset.centralEditor = "";
      centralPage(user);
    };
  });
  const editorForm = content.querySelector("[data-central-editor-form]");
  if (editorForm) editorForm.onsubmit = async (event) => {
    event.preventDefault();
    if (!canManageCentralCatalog()) return;
    const data = new FormData(editorForm);
    const selectedZones = data.getAll("central-zones").map(String);
    if (!selectedZones.length) {
      alert("請至少選擇一個存放位置。");
      return;
    }
    const zh = String(data.get("central-label") || "").trim();
    const vi = String(data.get("central-label-vi") || "").trim();
    const unit = String(data.get("central-unit") || "個");
    const workArea = String(data.get("central-work-area") || "noodles");
    if (!zh || !vi) return;

    const oldItems = loadStock();
    const editorKey = String(editorForm.dataset.editorKey || "new");
    const editing = editorKey !== "new";
    const oldRows = editing ? oldItems.filter((row) => centralProductKey(row) === editorKey) : [];
    if (editing) {
      const removedWithStock = oldRows.find((row) => !selectedZones.includes(row.zone) && Number(row.qty || 0) > 0);
      if (removedWithStock) {
        alert("儲位仍有庫存，請先將數量調整為 0，再取消該存放位置。");
        return;
      }
    }

    const first = oldRows[0] || null;
    const rawBaseId = first?.baseId
      || (String(first?.itemKey || "").startsWith("central:") ? String(first.itemKey).slice("central:".length) : "")
      || (editing ? String(editorKey).replace(/^central:/, "") : `custom-${Date.now()}`);
    const itemKey = first?.itemKey || `central:${rawBaseId}`;
    const catalogKey = first?.catalogKey || zh.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
    const nextRows = selectedZones.map((zone) => ({
      id: `${rawBaseId}@${centralLocationCode(zone)}`,
      baseId: rawBaseId,
      itemKey,
      catalogKey,
      zh,
      vi,
      unit,
      workArea,
      zone,
      qty: Math.max(0, Number(data.get(`central-quantity:${zone}`)) || 0),
      minimum: Math.max(0, Number(data.get(`central-minimum:${zone}`)) || 0),
    }));
    const nextItems = editing
      ? oldItems.filter((row) => centralProductKey(row) !== editorKey).concat(nextRows)
      : oldItems.concat(nextRows);

    saveStock(nextItems);
    if (inventoryCloudState() === "ready") {
      const result = await cloudSyncCentralCatalogItem(itemKey, nextItems);
      if (!result.ok) {
        saveStock(oldItems);
        const message = result.error?.message === "LOCATION_HAS_STOCK"
          ? "儲位仍有庫存，請先轉撥或盤點為 0。"
          : "品項資料同步失敗，已還原原本資料。";
        alert(message);
        await syncInventoryNow("central", { reloadBranch: false });
        centralPage(user);
        return;
      }
    } else {
      announceCentralStock(nextItems);
    }
    content.dataset.centralEditor = "";
    centralPage(user);
  };
  content.querySelectorAll("[data-central-product-delete]").forEach((button) => {
    button.onclick = async () => {
      if (user.role !== "admin" && user.accountRole !== "admin") return;
      const key = button.dataset.centralProductDelete;
      const oldItems = loadStock();
      const rows = oldItems.filter((row) => centralProductKey(row) === key);
      if (!rows.length) return;
      if (rows.some((row) => Number(row.qty || 0) > 0)) {
        alert("品項仍有庫存，請先將所有儲位數量調整為 0。");
        return;
      }
      if (!confirm(`確定刪除「${rows[0].zh}」？`)) return;
      const itemKey = rows[0].itemKey || centralItemKey(rows[0].baseId || String(key).replace(/^central:/, ""));
      if (inventoryCloudState() === "ready") {
        const result = await cloudArchiveCentralItem(itemKey);
        if (!result.ok) {
          alert(result.error?.message === "ITEM_HAS_STOCK" ? "品項仍有庫存，無法刪除。" : "無法刪除品項。");
          return;
        }
      }
      const nextItems = oldItems.filter((row) => centralProductKey(row) !== key);
      saveStock(nextItems);
      announceCentralStock(nextItems);
      centralPage(user);
    };
  });

  content.querySelectorAll("[data-central-adjust]").forEach(b => b.onclick = async () => {
    if (!canInventoryEdit()) return;
    const items = loadStock();
    const item = items.find(i => i.id === b.dataset.centralAdjust);
    if (!item) return;
    const amount = Math.max(1, Number(content.querySelector(`[data-central-qty="${CSS.escape(item.id)}"]`)?.value || 1));
    const before = Number(item.qty || 0);
    const direction = b.dataset.direction;
    if (direction === "out" && amount > before) { alert("出庫數量不能大於目前庫存。"); return; }

    b.disabled = true;
    const result = await cloudAdjustQuantity({
      itemKey: item.itemKey || centralItemKey(item.baseId || item.id),
      locationCode: centralLocationCode(item.zone),
      direction,
      amount,
      note: direction === "in" ? "央廚進貨入庫" : "央廚領料／出庫",
    });

    if (result.ok) {
      await syncInventoryNow("central", { reloadBranch: false });
      centralPage(user);
      return;
    }
    if (result.fallback) {
      item.qty = direction === "in" ? before + amount : before - amount;
      saveStock(items);
      pushHistory({ user: user.name, userId: user.id, direction, product: item.zh, productId: item.id, zone: item.zone, unit: item.unit, amount, before, after: item.qty });
      centralPage(user);
      return;
    }
    b.disabled = false;
    alert("雲端庫存更新失敗，請重新整理後再試。");
  });

  content.querySelectorAll("[data-central-set]").forEach(b => b.onclick = async () => {
    if (!canDirectInventoryAdjust() && !(canInventoryDraftCount() && user.role === "admin")) return;
    const items = loadStock();
    const item = items.find(i => i.id === b.dataset.centralSet);
    if (!item) return;
    const input = content.querySelector(`[data-central-set-qty="${CSS.escape(item.id)}"]`);
    const next = Math.max(0, Number(input?.value) || 0);
    const before = Number(item.qty || 0);
    if (next === before) return;

    b.disabled = true;
    const result = await cloudSetQuantity({
      itemKey: item.itemKey || centralItemKey(item.baseId || item.id),
      locationCode: centralLocationCode(item.zone),
      quantity: next,
      note: "央廚盤點調整 / Điều chỉnh kiểm kê bếp trung tâm",
    });

    if (result.ok) {
      await syncInventoryNow("central", { reloadBranch: false });
      centralPage(user);
      return;
    }
    if (result.fallback) {
      item.qty = next;
      saveStock(items);
      pushHistory({ user: user.name, userId: user.id, direction: "adjust", status: inventoryCloudState() === "ready" ? "cloud" : "staging", product: item.zh, productId: item.id, zone: item.zone, unit: item.unit, amount: Math.abs(next - before), before, after: next });
      centralPage(user);
      return;
    }
    b.disabled = false;
    alert("盤點調整失敗，請重新整理後再試。");
  });
  content.querySelectorAll("[data-warehouse]").forEach(b => b.onclick = () => {
    const site=b.dataset.warehouse;
    if (!setActiveInventorySite(site)) return;
    if (site === "central") { centralPage(user); return; }
    content.dataset.centralView = "off";
    location.hash = "#inventory";
    setTimeout(() => location.reload(), 20);
  });
}

let patching = false;
function applyAccess() {
  if (patching) return;
  const user = session();
  if (!user) return loginScreen();
  patching = true;
  try {
    document.body.classList.remove("auth-locked");
    document.querySelector("#auth-layer")?.remove();
    addLogout(user);

    const permissions = user.permissions || {};
    if (Object.keys(permissions).length) {
      document.querySelectorAll(".desktop-nav .nav-item, .mobile-nav .nav-item").forEach(a => {
        const moduleKey = (a.getAttribute("href") || "").replace(/^#/, "").split("?")[0];
        if (permissions[moduleKey]) a.style.display = permissions[moduleKey].view ? "" : "none";
      });
    }

    const currentModule = (location.hash || "#dashboard").replace(/^#/, "").split("?")[0];
    if (permissions[currentModule]?.view === false) {
      const firstAllowed = Object.keys(permissions).find((key) => permissions[key]?.view);
      if (firstAllowed) {
        location.hash = `#${firstAllowed}`;
        return;
      }
      const page = document.querySelector(".page-content");
      if (page) {
        page.innerHTML = '<section class="card access-empty-state"><h1>Chưa được cấp quyền · 尚未開放權限</h1><p>Hãy liên hệ quản trị viên để được cấp chức năng cần sử dụng. · 請聯絡系統管理員開放所需功能。</p></section>';
      }
      return;
    }

    const centralOnlyRole = user.accountRole === "central" || user.role === "central";
    const selectedSite = activeInventorySite();
    const centralWorkplace = user.location === "central" || (user.location === "all" && selectedSite === "central");

    // 央廚 is a site context, not only a job title.
    if (centralOnlyRole) {
      document.querySelector(".sidebar-summary")?.setAttribute("hidden", "");
      if (!location.hash.startsWith("#inventory")) location.hash = "#inventory";
    }

    if (centralWorkplace && location.hash.startsWith("#inventory")) {
      centralPage(user);
    } else if ((user.role === "admin" || user.location === "all") && location.hash.startsWith("#inventory")) {
      const heading = document.querySelector(".page-heading");
      if (heading && !heading.querySelector(".warehouse-switch")) {
        heading.insertAdjacentHTML("beforeend", branchSwitcher(user,selectedSite));
        heading.querySelectorAll("[data-warehouse]").forEach((button)=>button.addEventListener("click",()=>{
          const site=button.dataset.warehouse;
          if(!setActiveInventorySite(site)) return;
          if(site==="central") centralPage(user);
          else location.reload();
        }));
      }
    }
  } finally {
    patching = false;
  }
}

let accessFrame = 0;
function scheduleAccess() {
  if (accessFrame) return;
  accessFrame = requestAnimationFrame(() => {
    accessFrame = 0;
    applyAccess();
  });
}

const observer = new MutationObserver(scheduleAccess);
const appRoot = document.querySelector("#app");
if (appRoot) observer.observe(appRoot, { childList: true });
window.addEventListener("hashchange", scheduleAccess);
window.addEventListener("shitu:auth-synced", scheduleAccess);
window.addEventListener("shitu:inventory-cloud-updated", (event) => {
  if (event.detail?.site !== "central" || !location.hash.startsWith("#inventory")) return;
  const user = session();
  if (user?.location === "central" || (user?.location === "all" && activeInventorySite()==="central")) centralPage(user);
});
window.addEventListener("shitu:inventory-cloud-status", () => {
  if (!location.hash.startsWith("#inventory") || !document.querySelector(".central-heading")) return;
  const user = session();
  if (user?.location === "central" || (user?.location === "all" && activeInventorySite()==="central")) centralPage(user);
});
scheduleAccess();