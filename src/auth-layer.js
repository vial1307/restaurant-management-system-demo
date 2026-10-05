import { mountInventoryOperations, operationTabLabels } from "./inventory-operations.js";
import {
  activeInventorySite,
  canDirectInventoryAdjust,
  canInventoryAction,
  canInventoryEdit,
  canManageCentralCatalog,
  centralItemKey,
  centralLocationCode,
  cloudAdjustQuantity,
  cloudArchiveCentralItem,
  cloudRelocateStorage,
  cloudSetMinimum,
  cloudSetQuantity,
  cloudSyncCentralCatalogItem,
  getCloudInventoryHistory,
  inventoryCloudState,
  isCurrentBranchInventoryDate,
  switchActiveInventorySite,
  syncInventoryNow,
} from "./inventory-cloud.js";
import { inventorySites, inventoryUiGroups } from "./inventory-master-data.js";
import { preserveInventoryEditor, watchInventoryEditor } from "./inventory-editor-refresh.js";
import { searchMatches } from "./search-utils.js";
import { isAdminAccount, normalizeAccountPermissions } from "./account-permissions.js";

const AUTH_KEY = "shitu-kitchen-auth-v1";
const CENTRAL_KEY = "shitu-central-kitchen-stock-v1";
const CENTRAL_WORK_KEY = "shitu-central-kitchen-work-v1";


// Resolve per-site configuration from the same PostgreSQL snapshot as stock.
// UI keys stay stable when the user renames a location.
const centralStorageGroups = () => inventoryUiGroups("central").storage;
const centralZones = () => centralStorageGroups().map((zone) => zone.id);
const centralWorkAreas = () => inventoryUiGroups("central").workAreas;
const centralDefaultWorkArea = () => centralWorkAreas()[0]?.id || "";

function centralUnitSuggestions(items, current = "") {
  return [...new Set([
    current,
    ...(items || []).map((item) => item.unit),
  ].map((unit) => String(unit || "").trim()).filter(Boolean))].sort((a,b) => a.localeCompare(b,"zh-Hant"));
}
const CENTRAL_QUICK_ADJUST_DEBOUNCE_MS = 120;
const centralQuickAdjustments = new Map();

function session() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY) || "null"); } catch { return null; }
}

function patchCentralQuickAdjustment(entry,status="saving") {
  const input=document.querySelector(`[data-central-set-qty="${CSS.escape(String(entry.id||""))}"]`);
  if(!input)return;
  input.value=String(Math.max(0,Number(entry.visibleQuantity)||0));
  const control=input.closest(".quantity-control");
  if(!control)return;
  control.dataset.syncState=status;
  control.setAttribute("aria-busy",status==="saving"?"true":"false");
  const live=control.querySelector("[data-quantity-sync-status]");
  if(live)live.textContent=status==="saving"
    ? "Đang lưu… · 儲存中…"
    : status==="error"?"Lưu thất bại · 儲存失敗":"Đã lưu · 已儲存";
}

async function flushCentralQuickAdjustment(key){
  const entry=centralQuickAdjustments.get(key);
  if(!entry||entry.inFlight||entry.reconciling)return;
  const delta=Number(entry.queuedDelta||0);
  if(!delta){
    centralQuickAdjustments.delete(key);
    patchCentralQuickAdjustment(entry,"saved");
    return;
  }
  entry.queuedDelta=0;
  entry.inFlight=true;
  patchCentralQuickAdjustment(entry,"saving");
  const result=await cloudAdjustQuantity({
    itemKey:entry.itemKey,
    locationCode:entry.locationCode,
    direction:delta>0?"in":"out",
    amount:Math.abs(delta),
    note:"央廚庫存快速調整 / Điều chỉnh nhanh tồn kho bếp trung tâm",
    sync:false,
  });
  entry.inFlight=false;
  if(!result.ok){
    entry.queuedDelta=0;
    entry.failed=true;
    patchCentralQuickAdjustment(entry,"error");
    window.shituNotify?.({
      type:"error",
      title:"Không thể cập nhật tồn kho · 庫存更新失敗",
      body:"Database chưa xác nhận thay đổi; hệ thống đang tải lại số lượng thật. · 資料庫尚未確認，系統正重新載入實際數量。",
    });
    await syncInventoryNow("central",{reloadBranch:false,force:true});
    if(centralQuickAdjustments.get(key)===entry)centralQuickAdjustments.delete(key);
    return;
  }
  entry.confirmedQuantity=Number(result.data?.after??(entry.confirmedQuantity+delta));
  entry.visibleQuantity=Math.max(0,entry.confirmedQuantity+Number(entry.queuedDelta||0));
  patchCentralQuickAdjustment(entry,entry.queuedDelta?"saving":"saved");
  if(entry.queuedDelta){
    void flushCentralQuickAdjustment(key);
    return;
  }
  entry.reconciling=true;
  await syncInventoryNow("central",{reloadBranch:false,force:true});
  entry.reconciling=false;
  if(centralQuickAdjustments.get(key)!==entry)return;
  if(entry.queuedDelta){
    patchCentralQuickAdjustment(entry,"saving");
    void flushCentralQuickAdjustment(key);
    return;
  }
  centralQuickAdjustments.delete(key);
  patchCentralQuickAdjustment(entry,"saved");
}

function queueCentralQuickAdjustment(input,delta){
  const itemKey=String(input?.dataset.centralItemKey||"");
  const locationCode=String(input?.dataset.centralLocationCode||"");
  const id=String(input?.dataset.centralSetQty||"");
  if(!itemKey||!locationCode||!id||!Number.isFinite(delta)||!delta)return false;
  const key=`${itemKey}|${locationCode}`;
  let entry=centralQuickAdjustments.get(key);
  if(!entry){
    const current=Math.max(0,Number(input.value)||0);
    entry={id,itemKey,locationCode,confirmedQuantity:current,visibleQuantity:current,queuedDelta:0,inFlight:false,reconciling:false,failed:false,timer:0};
    centralQuickAdjustments.set(key,entry);
  }
  if(entry.failed)return false;
  const next=Math.max(0,entry.visibleQuantity+delta);
  const actualDelta=next-entry.visibleQuantity;
  if(!actualDelta)return false;
  entry.visibleQuantity=next;
  entry.queuedDelta+=actualDelta;
  patchCentralQuickAdjustment(entry,"saving");
  if(!entry.inFlight&&!entry.reconciling){
    clearTimeout(entry.timer);
    entry.timer=window.setTimeout(()=>{void flushCentralQuickAdjustment(key);},CENTRAL_QUICK_ADJUST_DEBOUNCE_MS);
  }
  return true;
}
function announceCentralStock(items) {
  queueMicrotask(() => {
    window.dispatchEvent(new CustomEvent("shitu:central-stock-ready", { detail: { items } }));
  });
}
function centralBaseKey(item) {
  return item.itemKey || item.baseId || String(item.id || "").split("@")[0];
}
function loadStock() {
  try {
    const saved = JSON.parse(localStorage.getItem(CENTRAL_KEY) || "[]");
    const items = Array.isArray(saved) ? saved : [];
    announceCentralStock(items);
    return items;
  } catch {
    announceCentralStock([]);
    return [];
  }
}
function readCentralWork(){
  try{
    const saved=JSON.parse(localStorage.getItem(CENTRAL_WORK_KEY)||"{}");
    return saved && typeof saved==="object" && !Array.isArray(saved) ? saved : {};
  }catch{return {};}
}
function centralWorkEntry(workMap,key){
  const value=workMap?.[key];
  if(value && typeof value==="object"){
    return {quantity:Math.max(0,Number(value.quantity)||0),minimum:Math.max(0,Number(value.minimum)||0),locationCode:value.locationCode||""};
  }
  return {quantity:Math.max(0,Number(value)||0),minimum:0,locationCode:""};
}
function esc(v) { return String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }

function centralSearchField(query = "", language = "vi") {
  const placeholder = language === "zh"
    ? "搜尋品項 / Pinyin / 注音…"
    : "Tìm nguyên liệu / 中文 / Pinyin / 注音…";
  return `<label class="central-search-box">
    <svg class="central-search-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
    <input type="search" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" enterkeyhint="search" inputmode="search" data-central-search placeholder="${esc(placeholder)}" value="${esc(query)}" />
    <button type="button" class="central-search-clear" data-central-search-clear aria-label="${language === "zh" ? "清除搜尋" : "Xóa tìm kiếm"}" hidden>×</button>
  </label>`;
}

function loginScreen(error = "") {
  document.body.classList.add("auth-locked");
  let host = document.querySelector("#auth-layer");
  if (!host) { host = document.createElement("div"); host.id = "auth-layer"; document.body.append(host); }
  host.innerHTML = `<div class="auth-shell"><section class="auth-card"><div class="auth-brand"><span>食</span><div><strong>食徒 Kitchen OS</strong><small>內部管理系統</small></div></div><h1>登入</h1><p>請使用系統管理員或已指派據點的帳號登入。</p>${error ? `<div class="auth-error">${esc(error)}</div>` : ""}<form id="auth-login-form"><label>帳號<input name="username" autocomplete="username" required /></label><label>密碼<input type="password" name="password" autocomplete="current-password" required /></label><button type="submit">登入系統</button></form><div class="demo-account-note">VPS Auth · 帳號與權限由 VPS 管理</div></section></div>`;

}

function addLogout(user) {
  const top = document.querySelector(".topbar-actions");
  if (!top || top.querySelector(".auth-user-chip")) return;
  const chip = document.createElement("div");
  chip.className = "auth-user-chip";
  const site = inventorySites().find((entry) => entry.code === user.location);
  const siteName = site?.name_zh_tw || site?.name_vi || (user.location === "all" ? "Admin" : user.location || "Admin");
  chip.innerHTML = `<span><strong>${esc(user.name)}</strong><small>${esc(siteName)}</small></span><button type="button">登出</button>`;
  top.prepend(chip);
}

function branchSwitcher(user, active = activeInventorySite()) {
  if (user.location !== "all" && user.role !== "admin") return "";
  const language = document.documentElement.lang === "vi" ? "vi" : "zh";
  const sites = inventorySites().filter((site) => site.active !== false);
  if (!sites.length) return "";
  return `<div class="warehouse-switch">${sites.map((site) => {
    const zh = site.name_zh_tw || site.name_zh || site.code;
    const vi = site.name_vi || zh;
    const label = language === "vi" && vi !== zh ? `${vi} · ${zh}` : zh;
    return `<button data-warehouse="${esc(site.code)}" class="${active === site.code ? "active" : ""}">${esc(label)}</button>`;
  }).join("")}</div>`;
}

let warehouseSwitchToken = 0;
async function switchWarehouse(button, { centralContent = null } = {}) {
  const site = String(button?.dataset?.warehouse || "");
  if (!site) return false;
  const token = ++warehouseSwitchToken;
  const buttons = [...document.querySelectorAll("[data-warehouse]")];
  buttons.forEach((entry) => {
    entry.disabled = true;
    entry.setAttribute("aria-busy","true");
  });
  button.dataset.switching = "true";
  try {
    const ok = await switchActiveInventorySite(site);
    if (token !== warehouseSwitchToken) return false;
    if (!ok) {
      window.alert("Không thể tải dữ liệu cơ sở mới từ PostgreSQL. Hệ thống đã giữ lại cơ sở hiện tại. · 無法從 PostgreSQL 載入新據點資料，系統已保留原據點。");
      return false;
    }
    if (centralContent) centralContent.dataset.centralView = "off";
    if (location.hash !== "#inventory") location.hash = "#inventory";
    return true;
  } finally {
    if (token === warehouseSwitchToken) {
      document.querySelectorAll("[data-warehouse]").forEach((entry) => {
        entry.disabled = false;
        entry.removeAttribute("aria-busy");
        delete entry.dataset.switching;
      });
    }
  }
}

function delegatedWarehouseContent(button) {
  if (!button?.closest?.("[data-central-kitchen-shell]")) return null;
  return button.closest(".page-content");
}

let warehousePointerActivation = { site:"", at:0 };
function activateWarehouseFromEvent(event) {
  const button = event.target?.closest?.(".warehouse-switch [data-warehouse]");
  if (!button || button.disabled) return false;
  const site = String(button.dataset.warehouse || "");
  if (!site) return false;
  event.preventDefault();
  if (event.type === "click" && warehousePointerActivation.site === site && Date.now() - warehousePointerActivation.at < 1200) {
    warehousePointerActivation = { site:"", at:0 };
    return true;
  }
  if (event.type === "pointerdown") warehousePointerActivation = { site, at:Date.now() };
  void switchWarehouse(button, { centralContent:delegatedWarehouseContent(button) });
  return true;
}

document.addEventListener("pointerdown", activateWarehouseFromEvent, { capture:true });
document.addEventListener("click", activateWarehouseFromEvent, { capture:true });

function centralSiteRecord() {
  return inventorySites().find((site) => site.code === "central") || null;
}

function centralSiteDisplayName(language) {
  const site = centralSiteRecord();
  if (!site) return language === "zh" ? "央廚" : "Bếp trung tâm · 央廚";
  const zh = site.name_zh_tw || site.name_zh || site.code;
  const vi = site.name_vi || zh;
  return language === "zh" ? zh : (vi === zh ? zh : `${vi} · ${zh}`);
}

function centralModeNavigation({ mode, language, operationsEnabled, catalogManageVisible, canViewHistory }) {
  const definitions = [
    { id:"overview", icon:"▦", zh:"庫存總覽", vi:"Tổng quan", group:"overview" },
    ...(operationsEnabled ? [
      { id:"in", icon:"↓", zh:"進貨入庫", vi:"Nhập kho", group:"daily" },
      { id:"pick", icon:"↗", zh:"領貨", vi:"Lấy hàng", group:"daily" },
      { id:"transfer", icon:"⇄", zh:"庫存轉撥", vi:"Điều chuyển", group:"daily" },
      { id:"ship", icon:"→", zh:"出貨", vi:"Xuất hàng", group:"daily" },
    ] : []),
    ...(catalogManageVisible ? [{ id:"manage", icon:"⚙", zh:"庫存管理", vi:"Quản trị kho", group:"admin" }] : []),
    ...(canViewHistory ? [{ id:"history", icon:"≡", zh:"操作紀錄", vi:"Lịch sử", group:"admin" }] : []),
  ];
  return `<nav class="central-tabs branch-ops-tabs central-kitchen-modebar" aria-label="${language === "zh" ? "央廚功能" : "Chức năng Bếp trung tâm"}">
    ${definitions.map((entry) => `<button type="button" data-central-mode="${entry.id}" data-mode-group="${entry.group}" class="central-kitchen-mode ${mode === entry.id ? "active" : ""}">
      <span class="central-kitchen-mode-icon" aria-hidden="true">${entry.icon}</span>
      <span><strong>${esc(language === "zh" ? entry.zh : entry.vi)}</strong><small>${esc(entry.zh)}</small></span>
    </button>`).join("")}
  </nav>`;
}

function centralPriorityPanel(items, language, operationsEnabled) {
  const attention = items
    .filter((item) => Number(item.qty || 0) < Number(item.minimum || 0))
    .map((item) => {
      const quantity = Number(item.qty || 0);
      const minimum = Number(item.minimum || 0);
      return {
        item,
        quantity,
        minimum,
        deficit: Math.max(0, minimum - quantity),
        severity: quantity <= 0 ? 2 : 1,
      };
    })
    .sort((a,b) => b.severity - a.severity || b.deficit - a.deficit || String(a.item.zh || "").localeCompare(String(b.item.zh || ""),"zh-Hant"));
  const visible = attention.slice(0,6);
  const title = language === "zh" ? "待處理" : "Cần xử lý · 待處理";
  const subtitle = language === "zh"
    ? "依 Database 安全庫存即時整理，不跨單位加總。"
    : "Tự động theo định mức trong Database; không cộng gộp khác đơn vị.";
  if (!attention.length) {
    return `<section class="central-kitchen-priority is-clear" data-central-priority>
      <header><div><span>LIVE PRIORITY</span><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div><strong class="central-kitchen-priority-count">0</strong></header>
      <div class="central-kitchen-priority-clear"><span aria-hidden="true">✓</span><div><strong>${language === "zh" ? "目前沒有低於安全庫存的儲位" : "Hiện không có vị trí dưới định mức"}</strong><small>${language === "zh" ? "庫存狀態以 PostgreSQL 即時資料為準。" : "Trạng thái lấy từ dữ liệu PostgreSQL hiện tại."}</small></div></div>
    </section>`;
  }
  return `<section class="central-kitchen-priority" data-central-priority>
    <header><div><span>LIVE PRIORITY</span><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div><div class="central-kitchen-priority-head-actions"><strong class="central-kitchen-priority-count" data-central-priority-count>${attention.length}</strong>${operationsEnabled ? `<button type="button" class="secondary-button central-kitchen-priority-action" data-central-mode="in">${language === "zh" ? "進貨入庫" : "Nhập kho · 進貨"}</button>` : ""}</div></header>
    <div class="central-kitchen-priority-list">${visible.map(({item,quantity,minimum,severity}) => {
      const primary = language === "zh" ? item.zh : (item.vi || item.zh);
      const secondary = language === "zh" ? (item.vi || "") : item.zh;
      const state = severity === 2 ? "empty" : "low";
      const stateLabel = severity === 2
        ? (language === "zh" ? "缺貨" : "Hết hàng · 缺貨")
        : (language === "zh" ? "低庫存" : "Sắp thiếu · 低庫存");
      const itemKey=String(item.itemKey||"");
      const locationCode=centralLocationCode(item.zone);
      return `<article class="central-kitchen-priority-row is-${state}">
        <button type="button" class="central-kitchen-priority-detail" data-central-priority-zone="${esc(item.zone)}">
          <span class="central-kitchen-priority-item"><strong>${esc(primary)}</strong><small>${esc(secondary)}</small></span>
          <span class="central-kitchen-priority-location">${esc(centralZoneLabel(item.zone,language))}</span>
          <span class="central-kitchen-priority-quantity"><strong>${quantity}</strong><small>/ ${minimum} ${esc(item.unit || "")}</small></span>
          <span class="tag tag-${state}">${esc(stateLabel)}</span>
        </button>
        ${operationsEnabled && itemKey && locationCode ? `<button type="button" class="central-kitchen-priority-receive" data-central-priority-receive data-item-key="${esc(itemKey)}" data-location-code="${esc(locationCode)}">${language === "zh" ? "進貨" : "Nhập · 進貨"}</button>` : ""}
      </article>`;
    }).join("")}</div>
    ${attention.length > visible.length ? `<small class="central-kitchen-priority-more">+${attention.length-visible.length} ${language === "zh" ? "筆待處理項目可在下方庫存表查看" : "mục khác xem trong bảng tồn kho bên dưới"}</small>` : ""}
  </section>`;
}

function centralPage(user) {
  const content = document.querySelector(".page-content");
  if (!content) return;
  const items = loadStock();
  const editGranted = [
    "inventory.quantity.adjust_quick","inventory.quantity.set_absolute","inventory.minimum.edit",
    "inventory.product.create","inventory.product.identity.edit","inventory.product.location.attach",
    "inventory.product.location.detach","inventory.product.primary_location.edit","inventory.work_area.edit"
  ].some((action)=>canInventoryAction(action,{site:"central"}));
  const cloudState = inventoryCloudState();
  const cloudReady = cloudState === "ready";
  const directAdjust = canDirectInventoryAdjust();
  const operationsEnabled = editGranted && cloudReady;
  let mode = content.dataset.centralMode || "overview";
  if (mode === "receive") { mode = "overview"; content.dataset.centralMode = "overview"; }
  if (mode === "out") { mode = "pick"; content.dataset.centralMode = "pick"; }
  if (["in","pick","transfer","ship"].includes(mode) && !operationsEnabled) {
    mode = "overview";
    content.dataset.centralMode = mode;
  }
  const selectedZone = content.dataset.centralZone || "all";
  const inventoryView = content.dataset.centralInventoryView || "storage";
  const query = content.dataset.centralSearch || "";
  const editorKey = content.dataset.centralEditor || "";
  const productCount = new Set(items.map((item) => centralBaseKey(item))).size;
  const lowCount = items.filter((item) => Number(item.qty || 0) < Number(item.minimum || 0)).length;
  const emptyCount = items.filter((item) => Number(item.qty || 0) <= 0).length;
  const uiGroups = inventoryUiGroups("central");
  const storageCount = uiGroups.storage.length;
  const workAreaCount = uiGroups.workAreas.length;
  const accountRole = user.accountRole || (user.role === "admin" ? "admin" : user.role);
  const catalogManageVisible = editGranted && activeInventorySite()==="central";
  const canManageCatalog = catalogManageVisible && canManageCentralCatalog();
  const canViewHistory = accountRole === "admin";
  if (mode === "manage" && !catalogManageVisible) { mode = "overview"; content.dataset.centralMode = mode; }
  if (mode === "history" && !canViewHistory) { mode = "overview"; content.dataset.centralMode = mode; }
  const log = [];
  const language = document.documentElement.lang === "vi" ? "vi" : "zh";
  const guide = {
    overview: language === "zh"
      ? "依資料庫設定的儲位與工作區查看即時庫存；低於標準量的品項會集中顯示。"
      : "Xem tồn kho theo vị trí và khu làm việc được cấu hình trong Database; nguyên liệu dưới định mức được đánh dấu rõ.",
    in: language === "zh"
      ? "新到原物料入庫：選擇實際儲位並輸入實際到貨數量。"
      : "Nhập nguyên liệu mới: chọn đúng vị trí lưu và nhập số lượng thực nhận.",
    pick: language === "zh"
      ? "從央廚儲位領到 Database 設定的工作區；已使用的扣除，剩餘物料可選擇儲位歸位。"
      : "Lấy từ kho Bếp trung tâm vào đúng khu làm việc được cấu hình trong Database; phần còn lại có thể trả về đúng vị trí lưu.",
    transfer: language === "zh"
      ? "只用於央廚內部換儲位；來源扣除、目的儲位增加。"
      : "Chỉ dùng để chuyển vị trí trong Bếp trung tâm; nguồn bị trừ và đích được cộng.",
    ship: language === "zh"
      ? "出貨至分店時選擇分店及實際收貨儲位，兩端庫存會同一交易更新。"
      : "Khi xuất sang chi nhánh, chọn chi nhánh và vị trí nhận; tồn hai bên cập nhật trong cùng giao dịch.",
    manage: language === "zh"
      ? "維護原物料、單位、工作區、存放位置與標準量；日常進出貨請使用上方作業功能。"
      : "Quản lý nguyên liệu, đơn vị, khu sử dụng, vị trí lưu và định mức; nhập/xuất hằng ngày dùng các chức năng vận hành.",
    history: language === "zh"
      ? "查看資料庫中的操作人員、時間、數量及前後變化。"
      : "Xem người thao tác, thời gian, số lượng và thay đổi trước/sau từ Database.",
  };
  const cloudNotice = cloudReady
    ? `<div class="central-kitchen-dbstate is-ready"><span class="central-kitchen-db-dot"></span><div><strong>VPS PostgreSQL · ${language === "zh" ? "已連線" : "Đã kết nối"}</strong><small>${language === "zh" ? "目前所有庫存寫入皆由 VPS API 驗證並儲存。" : "Mọi thao tác ghi kho hiện được VPS API xác thực và lưu vào PostgreSQL."}</small></div></div>`
    : cloudState === "checking"
      ? `<div class="central-kitchen-dbstate is-checking"><span class="central-kitchen-db-dot"></span><div><strong>${language === "zh" ? "正在連線 VPS 資料庫" : "Đang kết nối VPS database"}</strong><small>${language === "zh" ? "系統正在檢查 API 與 PostgreSQL。" : "Hệ thống đang kiểm tra API và PostgreSQL."}</small></div></div>`
      : `<div class="central-kitchen-dbstate is-offline"><span class="central-kitchen-db-dot"></span><div><strong>${language === "zh" ? "VPS 資料庫連線失敗" : "Không kết nối được VPS database"}</strong><small>${language === "zh" ? "為避免資料分歧，庫存寫入已鎖定。" : "Thao tác ghi đã khóa để tránh dữ liệu lệch."}</small></div></div>`;
  const manageNotice = mode === "manage" && catalogManageVisible && !canManageCatalog
    ? `<div class="inventory-readonly-notice"><strong>${language === "zh" ? "目前無法編輯央廚庫存" : "Hiện chưa thể chỉnh sửa kho Bếp trung tâm"}</strong><small>${language === "zh" ? "請確認帳號權限與 VPS 資料庫連線。" : "Hãy kiểm tra quyền tài khoản và kết nối VPS database."}</small></div>`
    : "";
  const siteName = centralSiteDisplayName(language);
  const modeNav = centralModeNavigation({ mode, language, operationsEnabled, catalogManageVisible, canViewHistory });
  const modeTitle = {
    overview: language === "zh" ? "庫存總覽" : "Tổng quan kho · 庫存總覽",
    in: language === "zh" ? "進貨入庫" : "Nhập kho · 進貨入庫",
    pick: language === "zh" ? "領貨" : "Lấy hàng · 領貨",
    transfer: language === "zh" ? "庫存轉撥" : "Điều chuyển · 庫存轉撥",
    ship: language === "zh" ? "出貨" : "Xuất hàng · 出貨",
    manage: language === "zh" ? "庫存管理" : "Quản trị kho · 庫存管理",
    history: language === "zh" ? "操作紀錄" : "Lịch sử · 操作紀錄",
  }[mode] || "";

  content.innerHTML = `<section class="central-kitchen-shell" data-central-kitchen-shell>
    <header class="central-kitchen-hero">
      <div class="central-kitchen-identity">
        <span class="central-kitchen-eyebrow">CENTRAL KITCHEN · 央廚</span>
        <h1>${esc(siteName)}</h1>
        <p>${language === "zh" ? `資料庫目前設定 ${storageCount} 個儲位、${workAreaCount} 個工作區。` : `Database hiện cấu hình ${storageCount} vị trí lưu và ${workAreaCount} khu làm việc.`}</p>
      </div>
      <div class="central-kitchen-hero-actions">${branchSwitcher(user, "central")}${cloudNotice}</div>
    </header>

    <section class="central-kitchen-kpis" aria-label="${language === "zh" ? "央廚庫存摘要" : "Tóm tắt kho Bếp trung tâm"}">
      <article><span>${language === "zh" ? "原物料" : "Nguyên liệu"}</span><strong data-central-stat-items>${productCount}</strong><small>${language === "zh" ? "資料庫品項" : "mặt hàng trong DB"}</small></article>
      <article><span>${language === "zh" ? "儲位" : "Vị trí kho"}</span><strong data-central-stat-locations>${storageCount}</strong><small>${language === "zh" ? "由 Database 設定" : "cấu hình từ Database"}</small></article>
      <article class="${lowCount ? "is-warning" : ""}"><span>${language === "zh" ? "需補貨" : "Cần bổ sung"}</span><strong data-central-stat-low>${lowCount}</strong><small>${emptyCount} ${language === "zh" ? "個儲位已歸零" : "vị trí đã hết"}</small></article>
      <article><span>${language === "zh" ? "工作區" : "Khu làm việc"}</span><strong data-central-stat-workareas>${workAreaCount}</strong><small>${language === "zh" ? "由 Database 設定" : "cấu hình từ Database"}</small></article>
    </section>

    ${mode === "overview" ? centralPriorityPanel(items, language, operationsEnabled) : ""}

    ${modeNav}

    <section class="central-kitchen-context">
      <div><span>${language === "zh" ? "目前功能" : "Chức năng hiện tại"}</span><strong>${esc(modeTitle)}</strong></div>
      <p>${esc(guide[mode] || "")}</p>
    </section>

    ${manageNotice}
    <section class="central-kitchen-workspace" data-central-workspace="${esc(mode)}">
      ${mode === "history" && canViewHistory ? historyView(log)
        : mode === "manage" && catalogManageVisible ? centralManageView(items, selectedZone, query, language, canViewHistory, canManageCatalog, canDirectInventoryAdjust())
          : mode === "overview" ? stockView(items, selectedZone, query, directAdjust, { inventoryView, canManageCatalog, operationsEnabled, workMap:readCentralWork() })
            : `<section class="inventory-operations-host central-kitchen-operation-host" data-inventory-operations></section>`}
    </section>
    ${canManageCatalog ? centralEditorModal(items, editorKey, language, canDirectInventoryAdjust()) : ""}
  </section>`;
  bindCentral(user);
  const centralSearchInput = content.querySelector("[data-central-search]");
  if (centralSearchInput) applyCentralSearchDom(content, centralSearchInput.value || "");
  if (["in","pick","transfer","ship"].includes(mode) && cloudReady) {
    const host=content.querySelector("[data-inventory-operations]");
    void mountInventoryOperations(host,{
      site:"central",
      mode,
      language,
      initialItemKey:content.dataset.centralOperationItemKey || "",
      initialLocationCode:content.dataset.centralOperationLocationCode || "",
      initialSourceLocationCode:content.dataset.centralOperationSourceLocationCode || "",
      onUpdated:()=>{ void syncInventoryNow("central",{reloadBranch:false}); },
    });
  }
  if (cloudReady && mode === "history" && canViewHistory) {
    void getCloudInventoryHistory("central", 300).then((cloudLog) => {
      const current = document.querySelector(".page-content");
      if (!current || current.dataset.centralMode !== "history" || !cloudLog.length) return;
      const card = current.querySelector(".central-card");
      if (card) card.outerHTML = cloudHistoryView(cloudLog);
    });
  }
}

function centralStockStatus(quantity,minimum){
  if(Number(quantity||0)<=0) return "empty";
  if(Number(quantity||0)<Number(minimum||0)) return "low";
  return "ok";
}

function centralQuantityControl({id,itemKey,locationCode,quantity,unit,direct,manageAdjust=false}){
  if(!direct) return `<div class="quantity-control"><strong class="quantity-readonly">${Number(quantity||0)}</strong><small>${esc(unit)}</small></div>`;
  const manageAttribute=manageAdjust?' data-central-manage-adjust="true"':"";
  return `<div class="quantity-control central-quantity-control"><button class="quantity-button" type="button" data-central-step="${esc(id)}" data-delta="-1"${manageAttribute} aria-label="Decrease">−</button><input class="quantity-input" type="number" min="0" inputmode="numeric" value="${Number(quantity||0)}" data-central-set-qty="${esc(id)}" data-central-item-key="${esc(itemKey)}" data-central-location-code="${esc(locationCode)}"${manageAttribute}><button class="quantity-button plus" type="button" data-central-step="${esc(id)}" data-delta="1"${manageAttribute} aria-label="Increase">＋</button><small>${esc(unit)}</small><span class="quantity-sync-status" data-quantity-sync-status role="status" aria-live="polite"></span></div>`;
}

function centralStorageOverviewCards(items, selectedZone, language) {
  const groups = centralStorageGroups();
  const renderClass = (storageGroup, zh, vi) => {
    const locations = groups.filter((group) => group.storageGroup === storageGroup);
    if (!locations.length) return "";
    return `<section class="central-storage-class" data-central-storage-group="${esc(storageGroup)}">
      <span class="storage-group-label">${esc(language === "zh" ? zh : vi)}</span>
      <div class="central-kitchen-location-grid">${locations.map((group) => {
        const zone = group.id;
        const rows = items.filter((item) => item.zone === zone);
        const low = rows.filter((item) => Number(item.qty || 0) < Number(item.minimum || 0)).length;
        const empty = rows.filter((item) => Number(item.qty || 0) <= 0).length;
        return `<button type="button" class="central-kitchen-location-card ${selectedZone === zone ? "is-selected" : ""} ${low ? "has-alert" : ""}" data-central-zone="${esc(zone)}">
          <span>${esc(group[language])}</span>
          <strong>${rows.length}</strong>
          <small>${language === "zh" ? `品項 · ${low} 需補貨 · ${empty} 缺貨` : `mặt hàng · ${low} cần bù · ${empty} đã hết`}</small>
        </button>`;
      }).join("")}</div>
    </section>`;
  };
  return `<div class="central-storage-classes">${renderClass("primary","主要儲位","Kho tổng · 主要儲位")}${renderClass("service","區域儲位","Kho khu vực · 區域儲位")}</div>`;
}

function centralWorkAreaOverviewCards(items, workMap, language) {
  const groups = centralProductGroups(items);
  return `<div class="central-kitchen-location-grid is-workareas">${centralWorkAreas().map((area) => {
    const rows = groups.filter(({ item }) => (item.workArea || centralDefaultWorkArea()) === area.id);
    const active = rows.filter(({ key }) => centralWorkEntry(workMap,key).quantity > 0).length;
    return `<article class="central-kitchen-location-card is-readonly">
      <span>${esc(centralWorkAreaLabel(area.id,language))}</span>
      <strong>${rows.length}</strong>
      <small>${language === "zh" ? `品項 · ${active} 使用中` : `mặt hàng · ${active} đang dùng`}</small>
    </article>`;
  }).join("")}</div>`;
}

function stockView(items, selectedZone, query, directAdjust = false, { inventoryView="storage", canManageCatalog=false, operationsEnabled=false, workMap={} } = {}) {
  const language = document.documentElement.lang === "vi" ? "vi" : "zh";
  const groups=centralProductGroups(items);
  const statusLabel=(status)=>status==="empty"?(language==="zh"?"已缺貨":"Đã hết · 已缺貨"):status==="low"?(language==="zh"?"庫存不足":"Sắp thiếu · 庫存不足"):(language==="zh"?"庫存正常":"Đủ chuẩn · 庫存正常");
  const itemName=(item)=>language==="zh"?item.zh:`${item.vi||item.zh}`;
  const secondary=(item)=>language==="zh"?(item.vi||""):item.zh;
  const storageRows=centralZones().map((zone)=>{
    const rows=items.filter((item)=>item.zone===zone && (selectedZone==="all"||selectedZone===zone));
    if(!rows.length)return "";
    return `<section class="inventory-group"><div class="inventory-group-heading"><strong>${esc(centralZoneLabel(zone,language))}</strong><span>${rows.length} ${language==="zh"?"品項":"mặt hàng"}</span></div>${rows.map((item)=>{
      const key=centralBaseKey(item);
      const work=centralWorkEntry(workMap,key);
      const status=centralStockStatus(item.qty,item.minimum);
      return `<article class="inventory-row storage-row central-row" data-central-product="${esc(key)}"><div class="inventory-item-name"><span class="inventory-status-dot ${status}"></span><div><strong>${esc(itemName(item))}</strong><small>${esc(secondary(item))}</small></div></div><label class="inventory-work-area"><span class="mobile-field-label">${language==="zh"?"工作區":"Khu làm việc · 工作區"}</span>${centralOverviewWorkAreaControl(item,key,language,canManageCatalog)}</label><label class="inventory-zone"><span class="mobile-field-label">${language==="zh"?"儲存位置":"Nơi cất · 儲存位置"}</span>${centralOverviewZoneControl(items,item,key,language,canManageCatalog)}</label><div class="inventory-storage">${centralQuantityControl({id:item.id,itemKey:item.itemKey||key,locationCode:centralLocationCode(item.zone),quantity:item.qty,unit:item.unit,direct:directAdjust})}<label class="storage-threshold"><span>${language==="zh"?"安全庫存":"Định mức · 安全庫存"}</span>${directAdjust?`<input class="minimum-input" type="number" min="0" inputmode="numeric" value="${Number(item.minimum||0)}" data-central-minimum="${esc(item.id)}" data-central-item-key="${esc(item.itemKey||key)}" data-central-location-code="${esc(centralLocationCode(item.zone))}">`:`<strong class="minimum-readonly">${Number(item.minimum||0)}</strong>`}</label></div><div class="inventory-working"><span class="mobile-field-label">${language==="zh"?"工作區數量":"SL khu làm việc · 工作區"}</span><strong>${work.quantity}</strong><small>${esc(item.unit)}</small></div><div class="inventory-actions"><div class="inventory-badge"><span class="tag tag-${status}">${esc(statusLabel(status))}</span></div><div class="inventory-item-tools">${operationsEnabled&&Number(item.qty||0)>0?`<button type="button" class="central-kitchen-row-operation" data-central-storage-pick data-item-key="${esc(item.itemKey||key)}" data-source-location-code="${esc(centralLocationCode(item.zone))}">${language==="zh"?"領貨":"Lấy · 領貨"}</button>`:""}${canManageCatalog?`<button type="button" class="inventory-action-button" data-central-editor-open="${esc(key)}" aria-label="${language==="zh"?"編輯":"Chỉnh sửa"}">✎</button>`:""}</div></div></article>`;
    }).join("")}</section>`;
  }).join("");
  const workRows=groups.map(({key,item,rows})=>{
    const work=centralWorkEntry(workMap,key);
    const status=centralStockStatus(work.quantity,work.minimum);
    const sources=rows.map((row)=>`<span class="source-quantity ${Number(row.qty||0)===0?"source-empty":""}">${esc(centralZoneLabel(row.zone,language))} <strong>${Number(row.qty||0)}</strong></span>`).join("");
    const workAreaId=item.workArea||centralDefaultWorkArea();
    return `<article class="inventory-row work-row central-row" data-central-product="${esc(key)}"><div class="inventory-item-name"><span class="inventory-status-dot ${status}"></span><div><strong>${esc(itemName(item))}</strong><small>${esc(secondary(item))}</small></div></div><label class="inventory-work-area"><span class="mobile-field-label">${language==="zh"?"工作區":"Khu làm việc · 工作區"}</span><span class="inventory-readonly-field">${esc(centralWorkAreaLabel(workAreaId,language))}</span></label>${centralQuantityControl({id:`work-${key}`,itemKey:item.itemKey||key,locationCode:work.locationCode,quantity:work.quantity,unit:item.unit,direct:directAdjust})}<div class="inventory-minimum">${directAdjust?`<input class="minimum-input" type="number" min="0" inputmode="numeric" value="${work.minimum}" data-central-minimum="work-${esc(key)}" data-central-item-key="${esc(item.itemKey||key)}" data-central-location-code="${esc(work.locationCode)}">`:`<strong class="minimum-readonly">${work.minimum}</strong>`}<small>${esc(item.unit)}</small></div><div class="inventory-source"><div class="source-quantities">${sources}</div><small>${language==="zh"?"央廚儲位":"Nguồn từ kho Bếp trung tâm"}</small></div><div class="inventory-transfer"><span class="tag tag-${status}">${esc(statusLabel(status))}</span></div></article>`;
  }).join("");
  const centralStorage = centralStorageGroups();
  const centralPrimary = centralStorage.filter((group)=>group.storageGroup==="primary");
  const centralService = centralStorage.filter((group)=>group.storageGroup==="service");
  const centralZoneTab=(group)=>`<button data-central-zone="${esc(group.id)}" class="filter-tab ${selectedZone===group.id?"selected":""}">${esc(group[language])} <span>${items.filter((item)=>item.zone===group.id).length}</span></button>`;
  const filters=inventoryView==="storage"?`<div class="storage-tab-groups"><div class="storage-tab-group"><span class="storage-group-label">${language==="zh"?"主要儲位":"Kho tổng · 主要儲位"}</span><div class="zone-tabs"><button data-central-zone="all" class="filter-tab ${selectedZone==="all"?"selected":""}">${language==="zh"?"全部":"Tất cả · 全部"} <span>${items.length}</span></button>${centralPrimary.map(centralZoneTab).join("")}</div></div><div class="storage-tab-group"><span class="storage-group-label">${language==="zh"?"區域儲位":"Kho khu vực · 區域儲位"}</span><div class="zone-tabs">${centralService.map(centralZoneTab).join("")}</div></div></div>`:"";
  const columns=inventoryView==="storage"?[language==="zh"?"品項":"Mặt hàng",language==="zh"?"工作區":"Khu làm việc",language==="zh"?"儲存位置":"Nơi cất",language==="zh"?"庫存數量":"Tồn kho",language==="zh"?"使用中":"Đang dùng",language==="zh"?"狀態":"Trạng thái"]:[language==="zh"?"品項":"Mặt hàng",language==="zh"?"工作區":"Khu làm việc",language==="zh"?"目前數量":"Hiện có",language==="zh"?"安全庫存":"Định mức",language==="zh"?"補貨來源":"Nguồn bổ sung",language==="zh"?"狀態":"Trạng thái"];
  const structureOverview = inventoryView === "storage"
    ? centralStorageOverviewCards(items,selectedZone,language)
    : centralWorkAreaOverviewCards(items,workMap,language);
  return `<section class="central-kitchen-overview">
    <div class="central-kitchen-overview-head">
      <div class="inventory-view-switch"><button class="inventory-view-button ${inventoryView==="storage"?"selected":""}" data-central-view="storage">▣ ${language==="zh"?"儲位庫存":"Kho theo vị trí · 儲位庫存"}</button><button class="inventory-view-button ${inventoryView==="work"?"selected":""}" data-central-view="work">✓ ${language==="zh"?"工作區庫存":"Tồn theo khu làm việc · 工作區"}</button></div>
      ${centralSearchField(query,language)}
    </div>
    ${structureOverview}
    ${filters}
    <p class="inventory-view-description">${inventoryView==="storage"?(language==="zh"?"依 Database 設定的央廚儲位查看實際庫存。":"Xem tồn thực tế theo các vị trí được cấu hình trong Database."):(language==="zh"?"依 Database 工作區查看已領出的原物料與目前數量。":"Xem nguyên liệu và số lượng hiện tại theo từng khu làm việc trong Database.")}</p>
    <section class="inventory-table ${inventoryView==="storage"?"storage-table":"work-table"}"><div class="inventory-table-head">${columns.map((column)=>`<span>${esc(column)}</span>`).join("")}</div>${inventoryView==="storage"?(storageRows||`<p class="central-empty">${language==="zh"?"沒有符合條件的品項。":"Không có nguyên liệu phù hợp."}</p>`):(workRows||`<p class="central-empty">${language==="zh"?"沒有符合條件的品項。":"Không có nguyên liệu phù hợp."}</p>`)}<p class="central-empty" data-central-search-empty hidden>${language==="zh"?"沒有符合條件的品項。":"Không có nguyên liệu phù hợp."}</p></section>
  </section>`;
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
  const found = inventoryUiGroups("central").storage.find((entry) => entry.id === zone);
  return found ? (language === "zh" ? found.zh : `${found.vi} · ${found.zh}`) : zone || "—";
}

function centralWorkAreaLabel(area, language) {
  const found = centralWorkAreas().find((entry) => entry.id === area);
  return found ? (language === "zh" ? found.zh : `${found.vi} · ${found.zh}`) : area || "—";
}

function centralOverviewWorkAreaControl(item, key, language, writable) {
  if (!writable) return `<span class="inventory-readonly-field">${esc(centralWorkAreaLabel(item.workArea||centralDefaultWorkArea(),language))}</span>`;
  return `<select class="inventory-select" data-central-inline-work-area data-central-product-key="${esc(key)}" data-central-item-key="${esc(item.itemKey||key)}" aria-label="${language==="zh"?"工作區":"Khu làm việc"}">${centralWorkAreas().map((area)=>`<option value="${esc(area.id)}" ${(item.workArea||centralDefaultWorkArea())===area.id?"selected":""}>${esc(centralWorkAreaLabel(area.id,language))}</option>`).join("")}</select>`;
}

function centralOverviewZoneControl(items, item, key, language, writable) {
  if (!writable) return `<span class="inventory-readonly-field">${esc(centralZoneLabel(item.zone,language))}</span>`;
  const occupied=new Set(items.filter((row)=>row!==item&&centralProductKey(row)===key).map((row)=>row.zone));
  return `<select class="inventory-select" data-central-inline-zone data-central-item-key="${esc(item.itemKey||key)}" data-central-source-zone="${esc(item.zone)}" aria-label="${language==="zh"?"儲存位置":"Nơi cất"}">${centralZones().map((zone)=>`<option value="${esc(zone)}" ${item.zone===zone?"selected":""} ${occupied.has(zone)?"disabled":""}>${esc(centralZoneLabel(zone,language))}</option>`).join("")}</select>`;
}

function centralManageView(items, selectedZone, query, language, allowDelete = false, writable = true, stocktakeWritable = false) {
  const groups = centralProductGroups(items).filter(({ rows }) =>
    selectedZone === "all" || rows.some((row) => row.zone === selectedZone)
  );
  const addLabel = language === "zh" ? "新增食材" : "Thêm nguyên liệu · 新增食材";
  const editLabel = language === "zh" ? "編輯" : "Sửa · 編輯";
  const deleteLabel = language === "zh" ? "刪除" : "Xóa · 刪除";
  return `<section class="central-card central-manage-card central-kitchen-manage">
    <header class="central-kitchen-section-head"><div><span>MASTER DATA</span><h2>${language === "zh" ? "原物料與儲位設定" : "Nguyên liệu & cấu hình kho"}</h2><p>${language === "zh" ? "此頁只維護主資料與標準量；日常庫存流動請使用進貨、領貨、轉撥或出貨。" : "Mục này chỉ quản lý master data và định mức; luồng kho hằng ngày dùng Nhập/Lấy/Điều chuyển/Xuất."}</p></div></header>
    <div class="central-toolbar central-manage-toolbar">
      <div class="central-zone-tabs"><button data-central-zone="all" class="${selectedZone === "all" ? "active" : ""}">全部</button>${centralZones().map((zone) => `<button data-central-zone="${esc(zone)}" class="${selectedZone === zone ? "active" : ""}">${esc(centralZoneLabel(zone, language))}</button>`).join("")}</div>
      ${writable ? `<button class="primary-button" type="button" data-central-editor-open="new">＋ ${esc(addLabel)}</button>` : ""}
      ${centralSearchField(query, language)}
    </div>
    <div class="central-manage-list">${groups.map(({ key, item, rows }) => {
      const locations = rows.map((row) => `<div class="central-manage-location"><span class="op-location-pill"><small>${esc(centralZoneLabel(row.zone, language))}</small><small>${language === "zh" ? "標準量" : "Định mức"} ${Number(row.minimum || 0)}</small></span>${centralQuantityControl({id:`manage-${row.id}`,itemKey:row.itemKey||key,locationCode:centralLocationCode(row.zone),quantity:row.qty,unit:row.unit||item.unit||"",direct:stocktakeWritable,manageAdjust:stocktakeWritable})}</div>`).join("");
      return `<article class="central-manage-row" data-central-product="${esc(key)}">
        <div class="central-manage-product"><strong>${esc(item.zh)}</strong><small>${esc(item.vi || "")}</small><span>${esc(centralWorkAreaLabel(item.workArea || centralDefaultWorkArea(), language))} · ${esc(item.unit || "")}</span></div>
        <div class="op-location-list">${locations}</div>
        <div class="central-manage-actions">${writable ? `<button type="button" class="inventory-action-button" data-central-editor-open="${esc(key)}" aria-label="${esc(editLabel)}">✎</button>${allowDelete ? `<button type="button" class="inventory-action-button delete-action" data-central-product-delete="${esc(key)}" aria-label="${esc(deleteLabel)}">🗑</button>` : ""}` : ""}</div>
      </article>`;
    }).join("") || `<p class="central-empty">${language === "zh" ? "沒有符合條件的品項。" : "Không có nguyên liệu phù hợp."}</p>`}<p class="central-empty" data-central-search-empty hidden>${language === "zh" ? "沒有符合條件的品項。" : "Không có nguyên liệu phù hợp."}</p></div>
  </section>`;
}

function centralEditorModal(items, editorKey, language, stocktakeEditable = false) {
  if (!editorKey) return "";
  const editing = editorKey !== "new";
  const rows = editing ? items.filter((item) => centralProductKey(item) === editorKey) : [];
  const item = rows[0] || {};
  const zones = centralZones();
  const defaultZone = zones[0] || "";
  const defaultWorkArea = centralDefaultWorkArea();
  const units = centralUnitSuggestions(items, item.unit);
  const selectedUnit = item.unit || units[0] || "";
  const title = editing
    ? (language === "zh" ? "編輯食材" : "Chỉnh sửa nguyên liệu · 編輯食材")
    : (language === "zh" ? "新增食材" : "Thêm nguyên liệu · 新增食材");
  const locationRows = zones.map((zone) => {
    const stored = rows.find((row) => row.zone === zone);
    const checked = editing ? Boolean(stored) : zone === defaultZone;
    return `<div class="modal-location-row">
      <label class="modal-location-choice"><input type="checkbox" name="central-zones" value="${esc(zone)}" ${checked ? "checked" : ""}/><span>${esc(centralZoneLabel(zone, language))}</span></label>
      <label><span>${language === "zh" ? "現有" : "Hiện có"}</span><input type="number" min="0" name="central-quantity:${esc(zone)}" value="${Number(stored?.qty || 0)}" ${stocktakeEditable ? "" : 'readonly aria-readonly="true"'}/></label>
      <label><span>${language === "zh" ? "標準量" : "Định mức"}</span><input type="number" min="0" name="central-minimum:${esc(zone)}" value="${Number(stored?.minimum || 0)}" ${stocktakeEditable ? "" : 'readonly aria-readonly="true"'}/></label>
    </div>`;
  }).join("");
  return `<div class="modal-backdrop central-editor-backdrop" data-central-editor-close>
    <section class="modal-card ingredient-modal central-editor-modal" role="dialog" aria-modal="true">
      <div class="card-heading"><h2>${esc(title)}</h2><div class="modal-heading-actions"><button class="secondary-button modal-header-save" type="submit" form="central-product-form" data-central-save-item>✓ <span>${esc(editing ? "Lưu thay đổi · 儲存變更" : "Lưu sản phẩm · 儲存品項")}</span></button><button class="icon-button" type="button" data-central-editor-close>×</button></div></div>
      <form id="central-product-form" data-central-editor-form data-editor-key="${esc(editorKey)}">
        <label>中文<input required name="central-label" value="${esc(item.zh || "")}" placeholder="牛肉"/></label>
        <label>Tiếng Việt<input required name="central-label-vi" value="${esc(item.vi || "")}" placeholder="Thịt bò"/></label>
        <label>${language === "zh" ? "工作區" : "Khu làm việc · 工作區"}<select name="central-work-area">${centralWorkAreas().map((area) => `<option value="${area.id}" ${(item.workArea || defaultWorkArea) === area.id ? "selected" : ""}>${esc(language === "zh" ? area.zh : `${area.vi} · ${area.zh}`)}</option>`).join("")}</select><small class="ingredient-form-guide">${language === "zh" ? "設定此原物料主要提供給哪個工作區使用。" : "Chọn khu làm việc chính sử dụng nguyên vật liệu này."}</small></label>
        <fieldset class="modal-locations"><legend>${language === "zh" ? "選擇食材存放位置" : "Chọn nơi cất nguyên liệu · 選擇食材存放位置"}</legend><p class="ingredient-form-guide">${language === "zh" ? "勾選實際存放的位置；「現有」為目前實際庫存，「標準量」為補貨／低庫存判斷基準。" : "Chọn vị trí thực tế có cất hàng; 現有 là tồn thực tế, 標準量 là mức chuẩn để cảnh báo/bổ hàng."}</p>${locationRows}</fieldset>
        <div class="modal-grid modal-meta-grid"><label>${language === "zh" ? "數量單位" : "Đơn vị · 數量"}<input name="central-unit" list="central-unit-suggestions" required value="${esc(selectedUnit)}" placeholder="包 / 盒 / kg"/><datalist id="central-unit-suggestions">${units.map((unit) => `<option value="${esc(unit)}"></option>`).join("")}</datalist></label></div>
        <div class="modal-submit-bar"><button class="primary-button modal-submit" type="submit" data-central-save-item>✓ ${esc(editing ? "Lưu thay đổi · 儲存變更" : "Lưu sản phẩm · 儲存品項")}</button></div>
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
  return `<section class="central-card central-kitchen-history"><div class="history-title"><div><h2>央廚庫存操作紀錄</h2><p>僅系統管理員可查看。</p></div><span>${log.length} 筆</span></div><div class="central-history">${log.map(x => {
    const sign=x.direction==="in"?"+":x.direction==="use"||x.direction==="ship"?"−":"↔";
    const tone=x.direction==="in"?"history-in":x.direction==="use"||x.direction==="ship"?"history-out":"history-adjust";
    return `<article><div><strong>${esc(x.product)}</strong><small>${new Date(x.at).toLocaleString("zh-TW")} · ${esc(x.user)} · ${esc(actionLabel[x.direction]||x.direction||"")}</small></div><span>${esc(x.zone)}</span><strong class="${tone}">${sign}${x.amount} ${esc(x.unit)}</strong><small>${x.before} → ${x.after}</small></article>`;
  }).join("") || `<p class="central-empty">目前尚無操作紀錄。</p>`}</div></section>`;
}

function cloudHistoryView(log) {
  return `<section class="central-card central-kitchen-history"><div class="history-title"><div><h2>央廚進出庫紀錄</h2><p>僅系統管理員可查看；資料來自目前主資料庫。</p></div><span>${log.length} 筆</span></div><div class="central-history">${log.map(x => {
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
  content.querySelectorAll(".inventory-group").forEach((group)=>{
    group.hidden=Boolean(query) && !group.querySelector(".central-row:not([hidden])");
  });
  const empty = content.querySelector("[data-central-search-empty]");
  if (empty) empty.hidden = !query || visible > 0;
}

function bindCentral(user) {
  const content = document.querySelector(".page-content");
  if (!content) return;
  content.querySelectorAll("[data-central-mode]").forEach(b => b.onclick = () => {
    content.dataset.centralMode = b.dataset.centralMode;
    content.dataset.centralEditor = "";
    content.dataset.centralOperationItemKey = "";
    content.dataset.centralOperationLocationCode = "";
    content.dataset.centralOperationSourceLocationCode = "";
    centralPage(user);
  });
  content.querySelectorAll("[data-central-priority-receive]").forEach((button) => {
    button.onclick = () => {
      content.dataset.centralMode = "in";
      content.dataset.centralEditor = "";
      content.dataset.centralOperationItemKey = button.dataset.itemKey || "";
      content.dataset.centralOperationLocationCode = button.dataset.locationCode || "";
      content.dataset.centralOperationSourceLocationCode = "";
      centralPage(user);
    };
  });
  content.querySelectorAll("[data-central-storage-pick]").forEach((button) => {
    button.onclick = () => {
      content.dataset.centralMode = "pick";
      content.dataset.centralEditor = "";
      content.dataset.centralOperationItemKey = button.dataset.itemKey || "";
      content.dataset.centralOperationLocationCode = "";
      content.dataset.centralOperationSourceLocationCode = button.dataset.sourceLocationCode || "";
      centralPage(user);
    };
  });
  content.querySelectorAll("[data-central-priority-zone]").forEach((button) => {
    button.onclick = () => {
      content.dataset.centralMode = "overview";
      content.dataset.centralInventoryView = "storage";
      content.dataset.centralZone = button.dataset.centralPriorityZone || "all";
      content.dataset.centralSearch = "";
      content.dataset.centralOperationItemKey = "";
      content.dataset.centralOperationLocationCode = "";
      content.dataset.centralOperationSourceLocationCode = "";
      centralPage(user);
    };
  });
  content.querySelectorAll("[data-central-zone]").forEach(b => b.onclick = () => { content.dataset.centralZone = b.dataset.centralZone; centralPage(user); });
  content.querySelectorAll("[data-central-view]").forEach(b => b.onclick = () => { content.dataset.centralInventoryView = b.dataset.centralView; centralPage(user); });
  const search = content.querySelector("[data-central-search]");
  if (search) {
    const clear = content.querySelector("[data-central-search-clear]");
    const syncClear = () => {
      if (clear) clear.hidden = !search.value;
    };
    const applySearch = () => {
      const value = search.value;
      content.dataset.centralSearch = value;
      applyCentralSearchDom(content, value);
      syncClear();
    };
    search.oninput = applySearch;
    search.onsearch = applySearch;
    search.oncompositionend = () => {
      applySearch();
      requestAnimationFrame(applySearch);
    };
    syncClear();

    if (clear) {
      clear.onclick = () => {
        search.value = "";
        content.dataset.centralSearch = "";
        applyCentralSearchDom(content, "");
        syncClear();
        try { search.focus({ preventScroll: true }); } catch { search.focus(); }
      };
    }
  }

  content.querySelectorAll("select[data-central-inline-work-area]").forEach((select) => {
    select.onchange = async () => {
      if (!canManageCentralCatalog()) return centralPage(user);
      const productKey=String(select.dataset.centralProductKey||"");
      const itemKey=String(select.dataset.centralItemKey||"");
      const nextArea=String(select.value||"");
      const oldItems=loadStock();
      if (!productKey||!itemKey||!centralWorkAreas().some((area)=>area.id===nextArea)) return centralPage(user);
      const nextItems=oldItems.map((row)=>centralProductKey(row)===productKey?{...row,workArea:nextArea}:row);
      select.disabled=true;
      const result=await cloudSyncCentralCatalogItem(itemKey,nextItems,{sync:false});
      if(!result.ok){
        await syncInventoryNow("central",{reloadBranch:false,force:true});
        window.alert("Không lưu được khu làm việc vào database. · 工作區無法儲存至資料庫。");
        return;
      }
      await syncInventoryNow("central",{reloadBranch:false,force:true});
      window.shituNotify?.({type:"success",title:"Đã lưu khu làm việc · 工作區已儲存",body:"Database và menu chỉnh sửa đã được đồng bộ. · 資料庫與編輯選單已同步。"});
    };
  });

  content.querySelectorAll("select[data-central-inline-zone]").forEach((select) => {
    select.onchange = async () => {
      if (!canManageCentralCatalog()) return centralPage(user);
      const itemKey=String(select.dataset.centralItemKey||"");
      const sourceZone=String(select.dataset.centralSourceZone||"");
      const destinationZone=String(select.value||"");
      if(!itemKey||!centralZones().includes(sourceZone)||!centralZones().includes(destinationZone)||sourceZone===destinationZone)return;
      select.disabled=true;
      const result=await cloudRelocateStorage({
        itemKey,
        sourceLocationCode:centralLocationCode(sourceZone),
        destinationLocationCode:centralLocationCode(destinationZone),
        note:"央廚總覽儲位變更 / Đổi vị trí cất từ tổng quan bếp trung tâm",
        sync:false,
      });
      if(!result.ok){
        await syncInventoryNow("central",{reloadBranch:false,force:true});
        window.alert("Không chuyển được vị trí cất trong database. · 儲存位置無法在資料庫中移動。");
        return;
      }
      await syncInventoryNow("central",{reloadBranch:false,force:true});
      window.shituNotify?.({type:"success",title:"Đã lưu vị trí cất · 儲位已儲存",body:"Database và menu chỉnh sửa đã được đồng bộ. · 資料庫與編輯選單已同步。"});
    };
  });

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
  watchInventoryEditor(editorForm);
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
    const unit = String(data.get("central-unit") || "").trim();
    const workArea = String(data.get("central-work-area") || "").trim();
    if (!zh || !vi || !unit || !workArea) return;
    const oldItems = loadStock();
    const editorKey = String(editorForm.dataset.editorKey || "new");
    const editing = editorKey !== "new";
    const oldRows = editing ? oldItems.filter((row) => centralProductKey(row) === editorKey) : [];
    let storageRelocation = null;
    if (editing) {
      const removedRows=oldRows.filter((row)=>!selectedZones.includes(row.zone));
      const addedZones=selectedZones.filter((zone)=>!oldRows.some((row)=>row.zone===zone));
      const protectedRemoved=removedRows.filter((row)=>Number(row.qty||0)>0||Number(row.minimum||0)>0);
      if(protectedRemoved.length){
        if(removedRows.length!==1||addedZones.length!==1){
          alert("舊儲位仍有庫存／標準量時，每次請只將一個舊儲位改為一個新儲位，以便安全移動資料。");
          return;
        }
        storageRelocation={source:removedRows[0],destinationZone:addedZones[0]};
      }
    }

    const first = oldRows[0] || null;
    const rawBaseId = first?.baseId
      || (String(first?.itemKey || "").startsWith("central:") ? String(first.itemKey).slice("central:".length) : "")
      || (editing ? String(editorKey).replace(/^central:/, "") : `custom-${Date.now()}`);
    const itemKey = first?.itemKey || `central:${rawBaseId}`;
    const catalogKey = first?.catalogKey || zh.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
    const nextRows = selectedZones.map((zone) => {
      const relocatedSource=storageRelocation?.destinationZone===zone?storageRelocation.source:null;
      return {
        id: `${rawBaseId}@${centralLocationCode(zone)}`,
        baseId: rawBaseId,
        itemKey,
        catalogKey,
        zh,
        vi,
        unit,
        workArea,
        zone,
        qty: relocatedSource
          ? Math.max(0,Number(relocatedSource.qty)||0)
          : Math.max(0, Number(data.get(`central-quantity:${zone}`)) || 0),
        minimum: relocatedSource
          ? Math.max(Number(relocatedSource.minimum||0),Math.max(0,Number(data.get(`central-minimum:${zone}`))||0))
          : Math.max(0, Number(data.get(`central-minimum:${zone}`)) || 0),
      };
    });
    const nextItems = editing
      ? oldItems.filter((row) => centralProductKey(row) !== editorKey).concat(nextRows)
      : oldItems.concat(nextRows);

    if (inventoryCloudState() !== "ready") {
      alert("Chưa kết nối được VPS database, sản phẩm chưa được lưu. · 目前無法連線 VPS 資料庫，品項尚未儲存。");
      return;
    }
    const saveButtons = editorForm.closest(".ingredient-modal")?.querySelectorAll("[data-central-save-item]") || [];
    for (const button of saveButtons) {
      button.disabled = true;
      button.textContent = "Đang lưu vào database… · 正在儲存…";
    }
    if(storageRelocation){
      const relocation=await cloudRelocateStorage({
        itemKey,
        sourceLocationCode:centralLocationCode(storageRelocation.source.zone),
        destinationLocationCode:centralLocationCode(storageRelocation.destinationZone),
        note:"央廚品項儲位變更 / Đổi vị trí cất nguyên liệu bếp trung tâm",
        sync:false,
      });
      if(!relocation.ok){
        for(const button of saveButtons)button.disabled=false;
        alert("儲位無法在資料庫中移動，表單已保留供檢查。");
        await syncInventoryNow("central",{reloadBranch:false,force:true});
        return;
      }
    }
    const result = await cloudSyncCentralCatalogItem(itemKey,nextItems,{sync:false});
    if (!result.ok) {
      const message = result.error?.message === "LOCATION_HAS_STOCK"
        ? "儲位仍有庫存，請先轉撥或盤點為 0。"
        : "Không lưu được sản phẩm vào VPS database; biểu mẫu được giữ lại để kiểm tra. · 無法儲存至 VPS 資料庫，表單已保留供檢查。";
      alert(message);
      await syncInventoryNow("central", { reloadBranch: false });
      centralPage(user);
      return;
    }
    if (canDirectInventoryAdjust()) {
      for (const row of nextRows) {
        const locationCode=centralLocationCode(row.zone);
        const quantityResult=await cloudSetQuantity({
          itemKey,
          locationCode,
          quantity:row.qty,
          note:"央廚品項表單盤點調整 / Điều chỉnh kiểm kê từ biểu mẫu bếp trung tâm",
          sync:false,
        });
        const minimumResult=quantityResult.ok
          ? await cloudSetMinimum({itemKey,locationCode,minimum:row.minimum,sync:false})
          : quantityResult;
        if (!quantityResult.ok || !minimumResult.ok) {
          alert("品項資料已儲存，但庫存／標準量尚未完整寫入；系統將重新載入資料庫實際資料。");
          await syncInventoryNow("central",{reloadBranch:false,force:true});
          return;
        }
      }
    }
    content.dataset.centralEditor = "";
    await syncInventoryNow("central",{reloadBranch:false,force:true});
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
      if (inventoryCloudState() !== "ready") {
        alert("VPS 資料庫尚未連線，無法刪除品項。");
        return;
      }
      const result = await cloudArchiveCentralItem(itemKey);
      if (!result.ok) {
        alert(result.error?.message === "ITEM_HAS_STOCK" ? "品項仍有庫存，無法刪除。" : "無法刪除品項。");
        return;
      }
      await syncInventoryNow("central",{reloadBranch:false,force:true});
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
      sync:false,
    });

    if (result.ok) {
      await syncInventoryNow("central", { reloadBranch: false, force:true });
      return;
    }
    b.disabled = false;
    await syncInventoryNow("central",{reloadBranch:false,force:true});
    alert("雲端庫存更新失敗，已重新載入資料庫實際數量。");
  });

  async function commitCentralQuantity(input) {
    if (!input || !canDirectInventoryAdjust()) return;
    const itemKey=input.dataset.centralItemKey;
    const locationCode=input.dataset.centralLocationCode;
    const next=Math.max(0,Number(input.value)||0);
    if(!itemKey||!locationCode)return;
    input.disabled=true;
    const result=await cloudSetQuantity({itemKey,locationCode,quantity:next,note:"盤點調整 / Điều chỉnh kiểm kê",sync:false});
    if(result.ok){
      await syncInventoryNow("central",{reloadBranch:false,force:true});
      return;
    }
    input.disabled=false;
    await syncInventoryNow("central",{reloadBranch:false,force:true});
    alert("盤點調整失敗，已重新載入資料庫實際數量。");
  }

  content.querySelectorAll("[data-central-step]").forEach((button)=>{
    button.onclick=()=>{
      const input=content.querySelector(`[data-central-set-qty="${CSS.escape(button.dataset.centralStep)}"]`);
      if(!input)return;
      queueCentralQuickAdjustment(input,Number(button.dataset.delta||0));
    };
  });
  content.querySelectorAll("input[data-central-set-qty][data-central-item-key]").forEach((input)=>{
    input.onchange=()=>{ void commitCentralQuantity(input); };
  });
  content.querySelectorAll("input[data-central-minimum]").forEach((input)=>{
    input.onchange=async()=>{
      if(!canDirectInventoryAdjust())return;
      input.disabled=true;
      const result=await cloudSetMinimum({
        itemKey:input.dataset.centralItemKey,
        locationCode:input.dataset.centralLocationCode,
        minimum:Math.max(0,Number(input.value)||0),
        sync:false,
      });
      if(result.ok){
        await syncInventoryNow("central",{reloadBranch:false,force:true});
        return;
      }
      input.disabled=false;
      alert("標準量更新失敗，請重新整理後再試。");
    };
  });

  content.querySelectorAll("[data-central-set]").forEach(b => b.onclick = async () => {
    if (!canDirectInventoryAdjust()) return;
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
      sync:false,
    });

    if (result.ok) {
      await syncInventoryNow("central", { reloadBranch: false, force:true });
      return;
    }
    b.disabled = false;
    await syncInventoryNow("central",{reloadBranch:false,force:true});
    alert("盤點調整失敗，已重新載入資料庫實際數量。");
  });
}

let patching = false;
function applyAccess() {
  if (patching || document.documentElement.dataset.vpsAuthReady !== "true") return;
  const user = session();
  if (!user) return loginScreen();
  patching = true;
  try {
    document.body.classList.remove("auth-locked");
    document.querySelector("#auth-layer")?.remove();
    addLogout(user);

    const accountRole = user.accountRole || user.role || "employee";
    const adminAccount = isAdminAccount(user);
    const permissions = normalizeAccountPermissions(accountRole, user.permissions);
    if (!adminAccount && Object.keys(permissions).length) {
      document.querySelectorAll(".desktop-nav .nav-item, .mobile-nav .nav-item").forEach(a => {
        const moduleKey = (a.getAttribute("href") || "").replace(/^#/, "").split("?")[0];
        if (permissions[moduleKey]) a.style.display = permissions[moduleKey].view ? "" : "none";
      });
    }

    const currentModule = (location.hash || "#dashboard").replace(/^#/, "").split("?")[0];
    if (!adminAccount && permissions[currentModule]?.view === false) {
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
    const centralWorkplace = selectedSite === "central";

    // 央廚 is a site context, not only a job title.
    if (centralOnlyRole) {
      document.querySelector(".sidebar-summary")?.setAttribute("hidden", "");
      if (!location.hash.startsWith("#inventory")) location.hash = "#inventory";
    }

    if (centralWorkplace && location.hash.startsWith("#inventory")) {
      // The mutation observer also sees the DOM written by centralPage(). Do not
      // render it again here or async operation panels are replaced in a loop
      // before their controls finish loading.
      if (!document.querySelector("[data-central-kitchen-shell]")) centralPage(user);
    } else if (location.hash.startsWith("#inventory")) {
      const heading = document.querySelector(".page-heading");
      if (heading && !heading.querySelector(".warehouse-switch")) {
        heading.insertAdjacentHTML("beforeend", branchSwitcher(user,selectedSite));
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
window.addEventListener("shitu:auth-expired", scheduleAccess);
window.addEventListener("shitu:vps-auth-ready", scheduleAccess);
window.addEventListener("shitu:inventory-cloud-updated", (event) => {
  if (event.detail?.site !== "central" || !location.hash.startsWith("#inventory")) return;
  if (preserveInventoryEditor(document.querySelector('[data-central-editor-form]'))) return;
  const user = session();
  if (activeInventorySite()==="central") centralPage(user);
});
window.addEventListener("shitu:inventory-cloud-status", (event) => {
  if (event.detail?.status === "synced") return;
  if (!location.hash.startsWith("#inventory") || !document.querySelector("[data-central-kitchen-shell]")) return;
  if (preserveInventoryEditor(document.querySelector('[data-central-editor-form]'))) return;
  const user = session();
  if (activeInventorySite()==="central") centralPage(user);
});
scheduleAccess();
