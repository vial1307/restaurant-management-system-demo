import { mountInventoryOperations } from "./inventory-operations.js";
import { localeFor, SECONDARY, translate } from "./i18n.js";
import { preserveInventoryEditor, watchInventoryEditor } from "./inventory-editor-refresh.js";
import { prepareSearchCorpus, prepareSearchNeedle, preparedSearchMatches, searchMatches } from "./search-utils.js";
import { accountCan as accountCanPermission, currentAccountSession } from "./account-permissions.js";
import {
  buildGeneratedTasks,
  buildInventoryAlerts,
  calendarDays,
  calculateProcurementPlan,
  calculateReservations,
  calculateRice,
  completionSummary,
  formatDateKey,
  inventoryRestock,
  inventorySources,
  inventoryStatus,
  shiftDate,
  shiftMonth,
  summarizeReserveInventory,
} from "./rules.js";
import { createStore } from "./store.js";
import {
  inventorySite,
  inventoryUiGroups,
  inventoryWorkLocation,
  isBranchInventorySite,
} from "./inventory-master-data.js";
import { assessShiftCapacity, currentStaff, roleLabel } from "./operations.js";
import { createManagement } from "./management.js";
import { attachBusinessStateSync } from "./business-state-sync.js";
import { defineLazyDerivedProperties } from "./lazy-derived-context.js";
import { createTaskDerivationCache } from "./task-derivation-cache.js";
import {
  activeInventorySite,
  branchItemKey,
  branchLocationCode,
  branchWorkLocationCode,
  canDirectInventoryAdjust,
  canInventoryAction,
  canManageBranchCatalog,
  canManageReceiveDefault,
  canViewBranchCatalogManagement,
  canInventoryEdit,
  cloudAdjustQuantity,
  cloudArchiveBranchItem,
  cloudRelocateStorage,
  cloudRelocateWorkArea,
  cloudSetMinimum,
  cloudSetQuantity,
  cloudSetReceiveDefault,
  cloudSyncBranchCatalogItem,
  cloudTransferInventory,
  getCloudInventoryHistory,
  inventoryBranchSnapshot,
  inventoryCatalogMasters,
  inventoryCatalogKey,
  inventoryCloudState,
  refreshInventoryCloudState,
  syncInventoryNow,
} from "./inventory-cloud.js";

const store = createStore();
attachBusinessStateSync(store);
const taskDerivationCache = createTaskDerivationCache({
  deriveTasks: (state, date) => {
    const record = state.records[date];
    return [...buildGeneratedTasks(state, date, inventoryStorageGroups(activeInventorySite())), ...(record.customTasks ?? [])];
  },
  summarizeProgress: completionSummary,
});
const root = document.querySelector("#app");
const view = {
  inventoryView: "storage",
  inventoryOpsMode: "overview",
  inventoryAlertFilter: "all",
  workArea: "all",
  zone: "all",
  search: "",
  taskFilter: "all",
  modal: null,
  editingStockKey: null,
  inventoryDetailStockKey: null,
  calendarOpen: false,
  calendarMonth: null,
  calendarYear: null,
  sopArea: "",
  menuFilter: "all",
  menuStaff: "all",
  skillsArea: "",
  skillsPanel: "overview",
  skillsStaffId: null,
  sopSelected: "sop-handmade-noodles",
  sopService: "dine",
  sopPanel: "standards",
  sopDraft: null,
  sopCreating: false,
  managementModal: null,
  mobileMenuOpen: false,
  settingsSaveStatus: "",
  editingStaffId: null,
  switchStaffId: null,
  switchError: false,
  editingAttendanceId: null,
  checkPhoto: null,
  checkNote: "",
  reportType: "inventory",
  reportScope: "all",
  reportTarget: "all",
  reportCategory: "all",
  reportFrom: null,
  reportTo: null,
  scheduleMonth: null,
  scheduleShift: "evening",
  editingScheduleId: null,
  editingJobId: null,
};

const ICONS = {
  dashboard: "M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z",
  inventory: "M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Zm-9 2.5L4.3 6.8M12 10.5l7.7-3.7M12 10.5v11",
  reservations: "M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2m3 10h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01",
  preparation: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  procurement: "M3 4h2l2.4 10.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.6L21 8H7m3 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm7 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
  sop: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Zm3.5 6h6m-6 4h6",
  menu: "M4 4h16v16H4zM8 8h8M8 12h8m-8 4h5",
  skills: "M9 3h6l1 2h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3l1-2Zm0 7 2 2 4-4m-6 9h6",
  attendance: "M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  schedule: "M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2m3 10h8m-8 4h5",
  reports: "M3 3v18h18M8 15v-4m5 4V7m5 8v-7",
  remote: "M12 5a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM5 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm14 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8 11l4-5 4 5M8 13h8M5 15v4h14v-4",
  settings: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm8.2-2a1.7 1.7 0 0 0 .35 1.87l.06.06a2.06 2.06 0 0 1-2.91 2.91l-.06-.06a1.7 1.7 0 0 0-1.87-.35 1.7 1.7 0 0 0-1.03 1.56v.18a2.06 2.06 0 1 1-4.12 0v-.09a1.7 1.7 0 0 0-1.12-1.65 1.7 1.7 0 0 0-1.87.35l-.06.06a2.06 2.06 0 1 1-2.91-2.91l.06-.06a1.7 1.7 0 0 0 .35-1.87A1.7 1.7 0 0 0 3.5 12.5h-.18a2.06 2.06 0 1 1 0-4.12h.09a1.7 1.7 0 0 0 1.65-1.12 1.7 1.7 0 0 0-.35-1.87l-.06-.06a2.06 2.06 0 1 1 2.91-2.91l.06.06a1.7 1.7 0 0 0 1.87.35A1.7 1.7 0 0 0 10.53 1.3v-.18a2.06 2.06 0 1 1 4.12 0v.09a1.7 1.7 0 0 0 1.12 1.65 1.7 1.7 0 0 0 1.87-.35l.06-.06a2.06 2.06 0 1 1 2.91 2.91l-.06.06a1.7 1.7 0 0 0-.35 1.87 1.7 1.7 0 0 0 1.56 1.03h.18a2.06 2.06 0 1 1 0 4.12h-.09a1.7 1.7 0 0 0-1.65 1.12Z",
  chevronLeft: "m15 18-6-6 6-6",
  chevronRight: "m9 18 6-6-6-6",
  arrowRight: "M5 12h14m-7-7 7 7-7 7",
  alert: "M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
  check: "m20 6-11 11-5-5",
  plus: "M12 5v14m-7-7h14",
  minus: "M5 12h14",
  search: "m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
  bowl: "M3 11h18a9 9 0 0 1-18 0Zm2 10h14M8 3v4m4-5v5m4-4v4",
  close: "m18 6-12 12M6 6l12 12",
  edit: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L9 17l-4 1 1-4 10.5-10.5Z",
  trash: "M3 6h18m-2 0-1 14H6L5 6m4 0V4h6v2m-5 4v6m4-6v6",
  spark: "M12 3 9.5 9.5 3 12l6.5 2.5L12 21l2.5-6.5L21 12l-6.5-2.5L12 3Z",
  qr: "M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm12 0h2m3 0h1m-6 4h1m3 0h2m-6 3h2m3 0h1",
  clock: "M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  print: "M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2m-12-4h12v8H6z",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4m4-5 5 5 5-5m-5 5V3",
  menuBars: "M4 6h16M4 12h16M4 18h16",
};

const ROUTES = ["dashboard", "inventory", "procurement", "reservations", "preparation", "menu", "sop", "skills", "attendance", "schedule", "reports", "remote", "settings"];

const AUTH_KEY = "shitu-kitchen-auth-v1";
const MANAGEMENT_ACTION_EDIT_MODULE = {
  "skill-add":"skills",
  "skill-toggle":"skills",
  "skill-delete":"skills",
  "skill-approve":"skills",
  "sop-add":"sop",
  "sop-edit":"sop",
  "sop-add-utensil":"sop",
  "sop-remove-utensil":"sop",
  "sop-remove-photo":"sop",
  "sop-delete":"sop",
  "sop-approve":"sop",
  "sop-restore":"sop",
  "schedule-add":"schedule",
  "schedule-edit":"schedule",
  "schedule-delete":"schedule",
  "job-add":"remote",
  "job-edit":"remote",
  "job-delete":"remote",
  "staff-add":"settings",
  "staff-edit":"settings",
  "clock-in-open":"attendance",
  "clock-out":"attendance",
  "attendance-edit":"attendance",
};
const FIELD_EDIT_MODULE = {
  reservation:"reservations",
  remaining:"reservations",
  riceRemaining:"reservations",
  procurement:"procurement",
  procurementOrderDate:"procurement",
  payroll:"attendance",
  "training-status":"skills",
  "skill-status":"skills",
  "sop-photos":"sop",
  "inspection-photo":"sop",
  setting:"settings",
  task:"preparation",
};
const FORM_EDIT_MODULE = {
  "save-general-settings":"settings",
  "add-task":"preparation",
  "save-skill-assessment":"skills",
  "save-custom-skill":"skills",
  "save-sop":"sop",
  "save-staff":"settings",
  "clock-in":"attendance",
  "edit-attendance":"attendance",
  "save-schedule":"schedule",
  "save-job":"remote",
  "save-inspection":"sop",
};

function accountSession() {
  return currentAccountSession();
}

function accountCan(moduleKey, action = "view") {
  return accountCanPermission(accountSession(), moduleKey, action);
}

const QUICK_ADJUST_DEBOUNCE_MS = 120;
const branchQuickAdjustments = new Map();

function branchQuantityInput(kind, id) {
  return root.querySelector(
    `[data-field="${kind}"][data-key="quantity"][data-id="${CSS.escape(String(id || ""))}"]`
  );
}

function patchBranchQuickAdjustment(entry, status = "saving") {
  const input = branchQuantityInput(entry.kind,entry.id);
  if (!input) return;
  input.value = String(Math.max(0,Number(entry.visibleQuantity) || 0));
  const control = input.closest(".quantity-control");
  if (!control) return;
  control.dataset.syncState = status;
  control.setAttribute("aria-busy",status === "saving" ? "true" : "false");
  const live = control.querySelector("[data-quantity-sync-status]");
  if (live) live.textContent = status === "saving"
    ? "Đang lưu… · 儲存中…"
    : status === "error" ? "Lưu thất bại · 儲存失敗" : "Đã lưu · 已儲存";
}

async function flushBranchQuickAdjustment(key) {
  const entry = branchQuickAdjustments.get(key);
  if (!entry || entry.inFlight || entry.reconciling) return;
  const delta = Number(entry.queuedDelta || 0);
  if (!delta) {
    branchQuickAdjustments.delete(key);
    patchBranchQuickAdjustment(entry,"saved");
    return;
  }

  entry.queuedDelta = 0;
  entry.inFlight = true;
  patchBranchQuickAdjustment(entry,"saving");
  const result = await cloudAdjustQuantity({
    itemId:entry.cloudItemId,
    locationId:entry.cloudLocationId,
    site:entry.site,
    itemKey:entry.itemKey,
    locationCode:entry.locationCode,
    direction:delta > 0 ? "in" : "out",
    amount:Math.abs(delta),
    note:entry.note,
    sync:false,
  });
  entry.inFlight = false;

  if (!result.ok) {
    entry.queuedDelta = 0;
    entry.failed = true;
    patchBranchQuickAdjustment(entry,"error");
    window.shituNotify?.({
      type:"error",
      title:"Không thể cập nhật tồn kho · 庫存更新失敗",
      body:"Database chưa xác nhận thay đổi; hệ thống đang tải lại số lượng thật. · 資料庫尚未確認，系統正重新載入實際數量。",
    });
    await syncInventoryNow(entry.site,{reloadBranch:false,force:true});
    if (branchQuickAdjustments.get(key) === entry) branchQuickAdjustments.delete(key);
    return;
  }

  entry.confirmedQuantity = Number(result.data?.after ?? (entry.confirmedQuantity + delta));
  entry.visibleQuantity = Math.max(0,entry.confirmedQuantity + Number(entry.queuedDelta || 0));
  patchBranchQuickAdjustment(entry,entry.queuedDelta ? "saving" : "saved");

  if (entry.queuedDelta) {
    void flushBranchQuickAdjustment(key);
    return;
  }

  entry.reconciling = true;
  await syncInventoryNow(entry.site,{reloadBranch:false,force:true});
  entry.reconciling = false;
  if (branchQuickAdjustments.get(key) !== entry) return;
  if (entry.queuedDelta) {
    patchBranchQuickAdjustment(entry,"saving");
    void flushBranchQuickAdjustment(key);
    return;
  }
  branchQuickAdjustments.delete(key);
  patchBranchQuickAdjustment(entry,"saved");
}

function queueBranchQuickAdjustment({ site, item, kind, delta }) {
  const locationCode = kind === "workItem"
    ? branchWorkLocationCode(site,item.workArea)
    : branchLocationCode(site,item.zone);
  const itemKey = branchItemKey(site,item.stockKey);
  if (!site || !itemKey || !locationCode || !Number.isFinite(delta) || !delta) return false;

  const key = `${itemKey}|${locationCode}`;
  let entry = branchQuickAdjustments.get(key);
  if (!entry) {
    entry = {
      site,itemKey,locationCode,kind,id:item.id,
      cloudItemId:item.cloudItemId||"",cloudLocationId:item.cloudLocationId||"",
      confirmedQuantity:Math.max(0,Number(item.quantity) || 0),
      visibleQuantity:Math.max(0,Number(item.quantity) || 0),
      queuedDelta:0,inFlight:false,reconciling:false,failed:false,timer:0,
      note:kind === "workItem"
        ? "工作區數量調整 / Điều chỉnh số lượng khu làm việc"
        : "庫存快速調整 / Điều chỉnh nhanh tồn kho",
    };
    branchQuickAdjustments.set(key,entry);
  }

  if (entry.failed) return false;

  const next = Math.max(0,entry.visibleQuantity + delta);
  const actualDelta = next - entry.visibleQuantity;
  if (!actualDelta) return false;
  entry.visibleQuantity = next;
  entry.queuedDelta += actualDelta;
  patchBranchQuickAdjustment(entry,"saving");
  if (!entry.inFlight && !entry.reconciling) {
    clearTimeout(entry.timer);
    entry.timer = window.setTimeout(() => { void flushBranchQuickAdjustment(key); },QUICK_ADJUST_DEBOUNCE_MS);
  }
  return true;
}

function applyAccountEditState() {
  const scope = root;
  if (!scope) return;

  for (const [field, moduleKey] of Object.entries(FIELD_EDIT_MODULE)) {
    if (accountCan(moduleKey, "edit")) continue;
    scope.querySelectorAll(`[data-field="${CSS.escape(field)}"]`).forEach((control) => {
      if ("disabled" in control) control.disabled = true;
      control.setAttribute("aria-disabled", "true");
    });
  }

  for (const [action, moduleKey] of Object.entries(MANAGEMENT_ACTION_EDIT_MODULE)) {
    if (accountCan(moduleKey, "edit")) continue;
    scope.querySelectorAll(`[data-action="${CSS.escape(action)}"]`).forEach((control) => {
      if ("disabled" in control) control.disabled = true;
      control.setAttribute("aria-disabled", "true");
      control.classList.add("account-readonly-control");
    });
  }

  for (const [formName, moduleKey] of Object.entries(FORM_EDIT_MODULE)) {
    if (accountCan(moduleKey, "edit")) continue;
    scope.querySelectorAll(`form[data-form="${CSS.escape(formName)}"]`).forEach((form) => {
      form.querySelectorAll("input,select,textarea,button").forEach((control) => {
        control.disabled = true;
        control.setAttribute("aria-disabled", "true");
      });
      form.classList.add("account-readonly-form");
    });
  }
}

function icon(name, className = "") {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[name]}"></path></svg>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function route() {
  const current = window.location.hash.replace(/^#\/?/, "").split("?")[0] || "dashboard";
  return ROUTES.includes(current) ? current : "dashboard";
}

function dateLabel(date, language) {
  return new Intl.DateTimeFormat(localeFor(language), {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${date}T12:00:00`));
}

function compactNumber(value, language = "vi") {
  return new Intl.NumberFormat(localeFor(language)).format(value);
}

function inventoryStorageGroups(site = activeInventorySite()) {
  return inventoryUiGroups(site).storage;
}

function inventoryWorkAreaGroups(site = activeInventorySite()) {
  return inventoryUiGroups(site).workAreas;
}

function inventoryPrimaryStorageIds(site = activeInventorySite()) {
  return inventoryStorageGroups(site)
    .filter((group) => group.storageGroup === "primary")
    .map((group) => group.id);
}

function operationalWorkAreas(state = store.getState(), site = activeInventorySite()) {
  const databaseAreas = site ? inventoryWorkAreaGroups(site) : [];
  if (databaseAreas.length) return databaseAreas;

  // Before master-data hydration, only reuse explicit business-state identities.
  // Never infer an area from an ingredient/menu name or a source-coded area list.
  const ids = new Set();
  for (const sop of state?.operations?.sops || []) {
    const id = String(sop?.area || "").trim();
    if (id) ids.add(id);
  }
  for (const record of state?.operations?.trainingRecords || []) {
    const id = String(record?.area || "").trim();
    if (id) ids.add(id);
  }
  for (const member of state?.operations?.staff || []) {
    const id = String(member?.area || "").trim();
    if (id && !["service","cashier"].includes(id)) ids.add(id);
  }
  return [...ids].map((id) => ({ id, zh:id, vi:id }));
}

function inventoryUnitSuggestions(record, current = "") {
  return [...new Set([
    current,
    ...(record?.inventory || []).map((item) => item.unit),
    ...(record?.workInventory || []).map((item) => item.unit),
  ].map((unit) => String(unit || "").trim()).filter(Boolean))].sort((a,b) => a.localeCompare(b,"zh-Hant"));
}

function zoneLabel(id, language, site = activeInventorySite()) {
  const zone = inventoryStorageGroups(site).find((item) => item.id === id);
  return zone ? zone[language] : id;
}

function workAreaLabel(id, language, site = activeInventorySite()) {
  const area = inventoryWorkAreaGroups(site).find((item) => item.id === id);
  return area ? area[language] : id;
}

function itemName(item, language) {
  return language === "zh" ? item.label : item.labelVi || item.label;
}

function itemSecondary(item, language) {
  return language === "zh" ? item.labelVi || "" : item.label;
}

function inventoryItemSearchText(item, { site=activeInventorySite(), extra=[] } = {}) {
  const zone = String(item?.zone || "");
  const workArea = String(item?.workArea || "");
  return [
    item?.label,
    item?.labelVi,
    item?.stockKey,
    item?.catalogKey,
    item?.unit,
    item?.unitCode,
    item?.categoryCode,
    zone,
    zone ? zoneLabel(zone,"zh",site) : "",
    zone ? zoneLabel(zone,"vi",site) : "",
    workArea,
    workArea ? workAreaLabel(workArea,"zh",site) : "",
    workArea ? workAreaLabel(workArea,"vi",site) : "",
    ...extra,
  ].filter(Boolean).join(" ");
}

function inventoryProductSearchText(product, site=activeInventorySite()) {
  const locationTerms=(product?.locations || []).flatMap((location)=>[
    location.zone,
    location.workArea,
    location.labelZh,
    location.labelVi,
    location.zone ? zoneLabel(location.zone,"zh",site) : "",
    location.zone ? zoneLabel(location.zone,"vi",site) : "",
    location.workArea ? workAreaLabel(location.workArea,"zh",site) : "",
    location.workArea ? workAreaLabel(location.workArea,"vi",site) : "",
  ]);
  return [
    product?.label,
    product?.labelVi,
    product?.stockKey,
    product?.catalogKey,
    product?.unit,
    product?.unitCode,
    product?.categoryCode,
    product?.workArea,
    product?.receiveZone,
    ...locationTerms,
  ].filter(Boolean).join(" ");
}

function heading(title, subtitle, action = "") {
  return `<div class="page-heading"><div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></div>${action}</div>`;
}

function cardHeading(title, action = "", extra = "") {
  return `<div class="card-heading"><div><h2>${escapeHtml(title)}</h2>${extra}</div>${action}</div>`;
}

function numberInput(value, attributes = "", className = "number-input") {
  return `<input class="${className}" type="number" min="0" inputmode="numeric" value="${escapeHtml(value)}" ${attributes} />`;
}

function statCard({ label, value, unit, note, tone, iconName }) {
  return `<article class="stat-card ${tone ? `stat-${tone}` : ""}">
    <div class="stat-top"><span>${escapeHtml(label)}</span><span class="stat-icon">${icon(iconName)}</span></div>
    <div class="stat-value">${escapeHtml(value)}<span>${escapeHtml(unit || "")}</span></div>
    <p>${escapeHtml(note || "")}</p>
  </article>`;
}

function authoritativeBranchRecord(state, site = activeInventorySite()) {
  const record = state?.records?.[state.selectedDate];
  if (!record) return record;
  if (!isBranchInventorySite(site) || state.selectedDate !== formatDateKey()) return record;

  const snapshot = inventoryBranchSnapshot(site);
  if (!snapshot) {
    return { ...record, inventory:[], workInventory:[], inventorySite:site };
  }
  return {
    ...record,
    inventory:snapshot.inventory,
    workInventory:snapshot.workInventory,
    inventorySite:site,
  };
}

function branchInventoryMutationRecord(state, site = activeInventorySite()) {
  const record = state?.records?.[state.selectedDate];
  if (!record || !isBranchInventorySite(site)) return record;

  // Catalog/storage/Work Area edits are current master-data mutations even if
  // the operator is viewing a historical service date. Use the same live VPS
  // snapshot that the inventory page renders so event handlers never pair a
  // current dropdown with an old source Work Area/location from that date.
  const snapshot = inventoryBranchSnapshot(site);
  if (!snapshot) return authoritativeBranchRecord(state,site);
  return {
    ...record,
    inventory:snapshot.inventory,
    workInventory:snapshot.workInventory,
    inventorySite:site,
  };
}

function workAreaMutationErrorMessage(error) {
  const code = String(error?.message || error?.code || "UNKNOWN_ERROR");
  return `Không thể đổi khu làm việc trong database. Dữ liệu thật sẽ được tải lại. · 無法在資料庫中變更工作區，系統將重新載入實際資料。\n\nMã lỗi · 錯誤碼: ${code}`;
}

function inventoryControlItem(element, record, kind) {
  const id = String(element?.dataset?.id || "");
  const rows = kind === "workItem" ? record?.workInventory : record?.inventory;
  const found = rows?.find((entry) => entry.id === id);
  if (found) return found;

  const stockKey = String(element?.dataset?.stockKey || "");
  if (!stockKey) return null;
  const quantityInput = element?.matches?.('input[data-key="quantity"]')
    ? element
    : branchQuantityInput(kind,id);
  return {
    id,
    stockKey,
    zone:String(element?.dataset?.zone || element?.dataset?.currentZone || ""),
    workArea:String(element?.dataset?.workArea || element?.dataset?.currentWorkArea || ""),
    quantity:Math.max(0,Number(quantityInput?.value) || 0),
    cloudItemId:String(element?.dataset?.cloudItemId || ""),
    cloudLocationId:String(element?.dataset?.cloudLocationId || ""),
  };
}

function currentContext() {
  const state = store.getState();
  // Inventory cloud sync writes the authoritative PostgreSQL mirror without
  // mutating the long-lived application store. Always layer that live mirror
  // over today's branch record so overview controls, an already-open editor,
  // and action handlers all read the same data that was rendered.
  const record = authoritativeBranchRecord(state);
  const language = state.settings.language;
  const text = translate(language);
  const context = { state, record, language, text };
  const storageGroups = inventoryStorageGroups(activeInventorySite());
  return defineLazyDerivedProperties(context, {
    reservations:() => calculateReservations(record.reservation, state.settings.reservationBuffer),
    rice:() => calculateRice(state.selectedDate, record.riceRemaining, state.settings),
    tasks:() => taskDerivationCache.tasks(state, state.selectedDate),
    progress:() => taskDerivationCache.progress(state, state.selectedDate),
    reserves:() => summarizeReserveInventory(record, storageGroups),
    alerts:() => buildInventoryAlerts(record, storageGroups),
    workAlerts:() => context.alerts.filter((item) => item.kind === "work"),
    reserveAlerts:() => context.alerts.filter((item) => item.kind === "reserve" || item.kind === "storage"),
    capacity:() => assessShiftCapacity(state, state.selectedDate, "evening"),
  });
}

function navItem(key, active, text) {
  const allowed = accountCan(key, "view");
  const accessAttributes = allowed ? "" : ' hidden aria-hidden="true" tabindex="-1"';
  return `<a class="nav-item ${active === key ? "active" : ""}" href="#${key}" aria-current="${active === key ? "page" : "false"}"${accessAttributes}>${icon(key)}<span>${escapeHtml(text[key])}</span></a>`;
}

function sidebar(context, active) {
  const { state, text, progress, language } = context;
  const employee = currentStaff(state);
  return `<aside class="sidebar">
    <a class="brand" href="#dashboard"><span class="brand-mark">食</span><span><strong>${escapeHtml(text.brand)}</strong><small>${escapeHtml(text.brandSub)}</small></span></a>
    <div class="sidebar-label">WORKSPACE</div>
    <nav class="desktop-nav">${ROUTES.map((key) => navItem(key, active, text)).join("")}</nav>
    <div class="sidebar-summary"><span>${escapeHtml(text.completed)}</span><strong>${progress.done}/${progress.total}</strong><div class="mini-progress"><span style="width:${progress.percentage}%"></span></div></div>
    <div class="profile-card"><span class="avatar">${escapeHtml(employee.name.slice(0, 1))}</span><span><strong>${escapeHtml(employee.name)}</strong><small>${escapeHtml(roleLabel(employee.role, language))} · ${escapeHtml(workAreaLabel(employee.area, language))}</small></span><span class="online-dot ${globalThis.navigator?.onLine === false ? "offline-dot" : ""}"></span></div>
  </aside>`;
}

function dateCalendar(context) {
  const { state, text, language } = context;
  const selected = new Date(`${state.selectedDate}T12:00:00`);
  const month = view.calendarMonth ?? selected.getMonth();
  const year = view.calendarYear ?? selected.getFullYear();
  const today = formatDateKey();
  const shortcuts = [
    { id: "previous-month", label: text.previousMonth },
    { id: "yesterday", label: text.yesterday },
    { id: "today", label: text.today },
    { id: "tomorrow", label: text.tomorrow },
    { id: "next-month", label: text.nextMonth },
  ];
  const weekdayFormatter = new Intl.DateTimeFormat(localeFor(language), { weekday: "short" });
  const monthFormatter = new Intl.DateTimeFormat(localeFor(language), { month: "long" });
  const weekdays = Array.from({ length: 7 }, (_, index) => weekdayFormatter.format(new Date(2026, 7, 23 + index)));
  const months = Array.from({ length: 12 }, (_, index) => ({ index, label: monthFormatter.format(new Date(2026, index, 1)) }));
  const years = Array.from({ length: 21 }, (_, index) => year - 10 + index);

  return `<section class="calendar-popover" aria-label="${escapeHtml(text.selectDate)}"><div class="calendar-shortcuts">${shortcuts.map((shortcut) => `<button class="calendar-shortcut" data-action="calendar-shortcut" data-shortcut="${shortcut.id}">${escapeHtml(shortcut.label)}</button>`).join("")}</div>
    <div class="calendar-toolbar"><button class="icon-button calendar-arrow" data-action="calendar-nav-month" data-offset="-1" aria-label="${escapeHtml(text.previousMonth)}">${icon("chevronLeft")}</button><div class="calendar-selects"><select data-field="calendarMonth" aria-label="${escapeHtml(text.month)}">${months.map((entry) => `<option value="${entry.index}" ${entry.index === month ? "selected" : ""}>${escapeHtml(entry.label)}</option>`).join("")}</select><select data-field="calendarYear" aria-label="${escapeHtml(text.year)}">${years.map((entry) => `<option value="${entry}" ${entry === year ? "selected" : ""}>${entry}</option>`).join("")}</select></div><button class="icon-button calendar-arrow" data-action="calendar-nav-month" data-offset="1" aria-label="${escapeHtml(text.nextMonth)}">${icon("chevronRight")}</button></div>
    <div class="calendar-grid calendar-weekdays">${weekdays.map((weekday) => `<span>${escapeHtml(weekday)}</span>`).join("")}</div>
    <div class="calendar-grid calendar-dates">${calendarDays(year, month).map((entry) => `<button class="calendar-day ${entry.currentMonth ? "" : "outside-month"} ${entry.date === state.selectedDate ? "selected" : ""} ${entry.date === today ? "today" : ""}" data-action="calendar-select-day" data-date="${entry.date}">${entry.day}</button>`).join("")}</div></section>`;
}

function topbar(context) {
  const { state, text, language } = context;
  const offline = globalThis.navigator?.onLine === false;
  return `<header class="topbar"><div class="topbar-mobile-brand"><span class="brand-mark small">食</span><strong>Kitchen OS</strong><button class="icon-button mobile-menu-button" data-action="toggle-mobile-menu" aria-expanded="${view.mobileMenuOpen}" aria-label="${escapeHtml(language === "zh" ? "開啟全部功能" : "Mở tất cả chức năng")}">${icon("menuBars")}</button></div>
    <div class="date-switcher"><button class="icon-button" data-action="shift-date" data-offset="-1" aria-label="${escapeHtml(text.yesterday)}">${icon("chevronLeft")}</button>
      <button class="date-label" data-action="toggle-calendar" aria-expanded="${view.calendarOpen}" aria-label="${escapeHtml(text.selectDate)}"><span>${escapeHtml(text.serviceDate)}</span><strong>${escapeHtml(dateLabel(state.selectedDate, language))}</strong></button>
      <button class="icon-button" data-action="shift-date" data-offset="1" aria-label="${escapeHtml(text.tomorrow)}">${icon("chevronRight")}</button>${view.calendarOpen ? dateCalendar(context) : ""}</div>
    <div class="topbar-actions">${offline ? `<span class="offline-status" title="${escapeHtml(text.offlineSaved)}">${escapeHtml(text.offline)}</span>` : ""}<div class="language-switch topbar-language-switch" aria-label="${escapeHtml(text.language)}"><button class="${language === "vi" ? "active" : ""}" data-action="set-language" data-language="vi">VI</button><button class="${language === "zh" ? "active" : ""}" data-action="set-language" data-language="zh">中文</button></div></div>
  </header>`;
}

function progressRing(progress) {
  return `<div class="progress-ring" style="--progress:${progress.percentage}"><span>${progress.percentage}<small>%</small></span></div>`;
}

function alertRow(item, context) {
  const { language, record, text } = context;
  const status = inventoryStatus(item);
  const reserve = item.kind === "reserve";
  const storage = item.kind === "storage";
  const source = reserve ? null : storageSources(item, record, storage ? item.zone : "work")[0];
  const location = reserve
    ? zoneLabel(item.zone, language)
    : storage ? zoneLabel(item.zone, language) : source ? zoneLabel(source.zone, language) : text.noSource;
  const type = reserve ? text.orderFactory : storage ? text.storageShortage : text.workShortage;
  const detail = reserve
    ? `${type} · ${location}`
    : storage
      ? `${type} · ${location}${source ? ` · ${text.takeFrom} ${zoneLabel(source.zone, language)}` : ""}`
      : `${type} · ${workAreaLabel(item.workArea, language)} · ${location}`;
  return `<div class="alert-row ${reserve ? "reserve-alert" : storage ? "storage-alert" : "work-alert"}" data-alert-kind="${item.kind}" data-alert-status="${status}"><span class="alert-bullet ${status}"></span><div class="item-title"><strong>${escapeHtml(itemName(item, language))}</strong><small>${escapeHtml(detail)}</small></div><span class="alert-quantity ${status}">${item.quantity}/${item.minimum} ${escapeHtml(item.unit)}</span></div>`;
}

function portionSummary(portion, context, editable = false) {
  const { text, language } = context;
  const secondary = language === "vi" ? SECONDARY[portion.key] : "";
  return `<div class="portion-row"><div><strong>${escapeHtml(text[portion.key])}</strong>${secondary ? `<small>${escapeHtml(secondary)}</small>` : ""}</div><div class="portion-metrics"><span>${escapeHtml(text.remaining)} ${editable ? numberInput(portion.remaining, `data-field="remaining" data-key="${portion.key}"`, "inline-number") : `<strong>${portion.remaining}</strong>`}</span><span class="portion-needed">${portion.required} <small>${escapeHtml(text.portionsShort)}</small></span></div></div>`;
}

function riceCard(context, editable = false) {
  const { text, rice, language, record } = context;
  return `<article class="card rice-card">${cardHeading(text.rice, `<span class="tag tag-neutral">${escapeHtml(rice.isWeekendService ? text.weekend : text.weekday)}</span>`)}
    <div class="rice-main"><div><span>${escapeHtml(text.riceToCook)}</span><strong>${compactNumber(rice.toCook, language)} <small>g</small></strong></div><div>${editable ? numberInput(record.riceRemaining, 'data-field="riceRemaining"', "rice-remaining-input") : `<strong>${compactNumber(rice.remaining, language)} g</strong>`}<span>${escapeHtml(text.riceRemaining)}</span></div></div>
    <div class="recipe-grid"><div><span>${escapeHtml(text.water)}</span><strong>${compactNumber(rice.water, language)} g</strong></div><div><span>${escapeHtml(text.ice)}</span><strong>${rice.ice} ${escapeHtml(text.pieces)}</strong></div><div><span>${escapeHtml(text.oil)}</span><strong>${rice.oil} ${escapeHtml(text.spoons)}</strong></div></div>
    ${editable ? `<p class="helper-text">${escapeHtml(text.riceRule)}</p>` : ""}
  </article>`;
}

function dashboard(context) {
  const { text, state, reservations, progress, alerts, reserveAlerts, workAlerts, rice, tasks, record, language, capacity } = context;
  const openTasks = tasks.filter((task) => !record.completedTasks[task.id]);
  const hasCriticalAlert = alerts.some((item) => inventoryStatus(item) === "empty");
  const dashboardAction = (moduleKey, href, label) => accountCan("dashboard", "edit") && accountCan(moduleKey, "edit")
    ? `<a class="text-link" data-dashboard-edit-action="${escapeHtml(moduleKey)}" href="#${escapeHtml(href)}">${escapeHtml(label)} ${icon("arrowRight")}</a>`
    : "";
  const dashboardTaskEdit = accountCan("dashboard", "edit") && accountCan("preparation", "edit");
  return `${heading(text.dashboard, text.overviewSubtitle)}
    <section class="stats-grid">
      ${statCard({ label: text.totalTables, value: reservations.tables, unit: text.tables, note: `${text.lunch}: ${reservations.lunchTables} · ${text.dinner}: ${reservations.dinnerTables} · ${capacity.requiredInside} 內場`, tone: capacity.overloaded ? "red" : "green", iconName: "reservations" })}
      ${statCard({ label: text.lowStock, value: alerts.length, unit: text.items, note: `${workAlerts.length} ${text.workInventory} · ${reserveAlerts.length} ${text.storageInventory}`, tone: hasCriticalAlert ? "red" : alerts.length ? "amber" : "green", iconName: "inventory" })}
      ${statCard({ label: text.pending, value: progress.pending, unit: "", note: `${progress.done}/${progress.total} ${text.completed.toLowerCase()}`, tone: "blue", iconName: "preparation" })}
      ${statCard({ label: text.riceToCook, value: compactNumber(rice.toCook, language), unit: "g", note: `${text.remaining}: ${compactNumber(rice.remaining, language)} g`, tone: "slate", iconName: "bowl" })}
    </section>
    <section class="dashboard-grid"><article class="card preparation-overview">${cardHeading(text.sectionPrep, dashboardAction("reservations", "reservations", text.editReservations), `<p>${reservations.tables} ${escapeHtml(text.tables)} + ${reservations.buffer} ${escapeHtml(text.buffer.toLowerCase())}</p>`)}${reservations.portions.map((portion) => portionSummary(portion, context)).join("")}</article>
      <article class="card progress-overview">${cardHeading(text.sectionTasks)}<div class="progress-overview-body">${progressRing(progress)}<div><strong>${progress.done}/${progress.total}</strong><span>${escapeHtml(text.completed)}</span>${dashboardAction("preparation", "preparation", text.manage)}</div></div></article>
      <article class="card capacity-overview">${cardHeading(language === "zh" ? "訂位連動人力" : "Nhân sự liên kết đặt bàn", dashboardAction("schedule", "schedule", text.manage), `<p>${reservations.dinnerTables} ${escapeHtml(text.tables)} · ${capacity.fixedAreas ? (language === "zh" ? "四區固定" : "4 khu cố định") : (language === "zh" ? "可輪調" : "có thể xoay vòng")}</p>`)}<div class="capacity-summary ${capacity.overloaded ? "capacity-overloaded" : "capacity-ready"}"><strong>${capacity.inside.length}/${capacity.requiredInside} 內場</strong><span>${capacity.overloaded ? (language === "zh" ? "超載風險" : "Có nguy cơ quá tải") : (language === "zh" ? "人力足夠" : "Đủ nhân lực")}</span></div><div class="capacity-zones">${["noodles", "soup", "seafood", "meat"].map((area) => `<span class="capacity-zone ${capacity.missingAreas.includes(area) ? "missing" : "ready"}">${escapeHtml(workAreaLabel(area, language))}<small>${capacity.missingAreas.includes(area) ? (language === "zh" ? "缺 SOP 人員" : "Thiếu người đạt SOP") : (language === "zh" ? "已覆蓋" : "Đã bố trí")}</small></span>`).join("")}</div></article>
      <article class="card alert-overview">${cardHeading(text.sectionAlerts, dashboardAction("inventory", "inventory", text.updateStock))}${alerts.length ? `<div class="priority-list">${alerts.map((item) => alertRow(item, context)).join("")}</div>` : `<p class="empty-state">${escapeHtml(text.noAlert)}</p>`}</article>
      <article class="card task-overview">${cardHeading(text.sectionTasks)}${openTasks.length ? `<div class="priority-list">${openTasks.map((task) => taskRow(task, context, true, dashboardTaskEdit)).join("")}</div>` : `<p class="empty-state">${escapeHtml(text.noTasks)}</p>`}</article>
    </section>
    <p class="save-note"><span></span>${escapeHtml(text.autoSaved)} · ${escapeHtml(state.settings.employeeName)}</p>`;
}

function storageSources(item, record, destination = "work") {
  return inventorySources(record, item, destination, inventoryStorageGroups(activeInventorySite()));
}

function workRestockTransferPlan(item, record) {
  let remaining = Math.max(0, Number(item.minimum || 0) - Number(item.quantity || 0));
  const destinationLocationCode = branchWorkLocationCode(activeInventorySite(), item.workArea);
  const steps = [];
  for (const source of storageSources(item, record)) {
    if (remaining <= 0) break;
    const amount = Math.min(remaining, Math.max(0, Number(source.quantity || 0)));
    if (amount > 0) {
      steps.push({
        itemKey: branchItemKey(activeInventorySite(), item.stockKey),
        sourceLocationCode: branchLocationCode(activeInventorySite(), source.zone),
        destinationLocationCode,
        amount,
      });
      remaining -= amount;
    }
  }
  return steps.filter((step) => step.sourceLocationCode && step.destinationLocationCode);
}

function storageRestockTransferPlan(item, record) {
  let remaining = Math.max(0, Number(item.minimum || 0) - Number(item.quantity || 0));
  const destinationLocationCode = branchLocationCode(activeInventorySite(), item.zone);
  const steps = [];
  for (const source of storageSources(item, record, item.zone)) {
    if (remaining <= 0) break;
    const amount = Math.min(remaining, Math.max(0, Number(source.quantity || 0)));
    if (amount > 0) {
      steps.push({
        itemKey: branchItemKey(activeInventorySite(), item.stockKey),
        sourceLocationCode: branchLocationCode(activeInventorySite(), source.zone),
        destinationLocationCode,
        amount,
      });
      remaining -= amount;
    }
  }
  return steps.filter((step) => step.sourceLocationCode && step.destinationLocationCode);
}

async function runCloudTransferPlan(steps, note) {
  if (!steps.length) return true;
  for (const step of steps) {
    const result = await cloudTransferInventory({ ...step, note });
    if (!result.ok) {
      await syncInventoryNow(activeInventorySite(), { reloadBranch: true, force:true });
      return false;
    }
  }
  await syncInventoryNow(activeInventorySite(), { reloadBranch: true, force:true });
  return true;
}

function quantityControl(item, kind = "item", manageAdjust = false) {
  const action = kind === "workItem" ? "adjust-work-item" : "adjust-item";
  const site = activeInventorySite();
  const scope = { site, locationId:item.cloudLocationId || "", workArea:kind === "workItem" ? item.workArea || "" : "" };
  const canQuick = canInventoryAction("inventory.quantity.adjust_quick",scope);
  const canSet = canInventoryAction("inventory.quantity.set_absolute",scope);
  const manageAttribute = manageAdjust ? ' data-manage-adjust="true"' : "";
  const identityAttributes = ` data-stock-key="${escapeHtml(item.stockKey)}" ${kind === "workItem"
    ? `data-work-area="${escapeHtml(item.workArea)}"`
    : `data-zone="${escapeHtml(item.zone)}"`} data-cloud-item-id="${escapeHtml(item.cloudItemId||"")}" data-cloud-location-id="${escapeHtml(item.cloudLocationId||"")}"`;
  const value = canSet
    ? numberInput(item.quantity, `data-field="${kind}" data-key="quantity" data-id="${escapeHtml(item.id)}"${identityAttributes}${manageAttribute}`, "quantity-input")
    : `<strong class="quantity-readonly" aria-label="Current quantity">${escapeHtml(item.quantity)}</strong>`;
  const decrease = canQuick ? `<button class="quantity-button" data-action="${action}" data-id="${escapeHtml(item.id)}"${identityAttributes} data-delta="-1"${manageAttribute} aria-label="Decrease">${icon("minus")}</button>` : "";
  const increase = canQuick ? `<button class="quantity-button plus" data-action="${action}" data-id="${escapeHtml(item.id)}"${identityAttributes} data-delta="1"${manageAttribute} aria-label="Increase">${icon("plus")}</button>` : "";
  return `<div class="quantity-control">${decrease}${value}${increase}<small>${escapeHtml(item.unit)}</small><span class="quantity-sync-status" data-quantity-sync-status role="status" aria-live="polite"></span></div>`;
}

function inventoryStatusBadge(item, text) {
  const status = inventoryStatus(item);
  const statusLabel = status === "empty" ? text.outOfStock : status === "low" ? text.lowStock : text.ready;
  return `<div class="inventory-badge"><span class="tag tag-${status}">${escapeHtml(statusLabel)}</span>${status !== "ok" ? `<small>+${inventoryRestock(item)}</small>` : ""}</div>`;
}

function storageInventoryRow(item, context) {
  const { language, text, record } = context;
  const site = activeInventorySite();
  const locationId = item.cloudLocationId || "";
  const catalogManage = context.catalogManageWritable ?? canManageBranchCatalog(site);
  const catalogManageVisible = context.catalogManageVisible ?? catalogManage;
  const canMinimum = canInventoryAction("inventory.minimum.edit",{site,locationId});
  const canRelocate = canInventoryAction("inventory.product.location.detach",{site,locationId}) && canInventoryAction("inventory.product.location.attach",{site});
  const canWorkAreaEdit = canInventoryAction("inventory.work_area.edit",{site,workArea:item.workArea || ""});
  const canInternalTransfer = canInventoryAction("inventory.transfer.internal",{site,locationId});
  const canArchive = canInventoryAction("inventory.product.archive",{site});
  const status = inventoryStatus(item);
  const workAreas = inventoryWorkAreaGroups(activeInventorySite());
  const storageGroups = inventoryStorageGroups(activeInventorySite());
  const working = record.workInventory.find((entry) => entry.stockKey === item.stockKey);
  const source = storageSources(item, record, item.zone)[0];
  const canRestock = inventoryRestock(item) > 0 && source;
  const searchCorpus=prepareSearchCorpus(inventoryItemSearchText(item,{site}));
  return `<article class="inventory-row storage-row" data-inventory-search-corpus="${escapeHtml(searchCorpus)}"><div class="inventory-item-name"><span class="inventory-status-dot ${status}"></span><div><strong>${escapeHtml(itemName(item, language))}</strong><small>${escapeHtml(itemSecondary(item, language))}</small></div></div>
    <label class="inventory-work-area"><span class="mobile-field-label">${escapeHtml(text.workstation)}</span>${canWorkAreaEdit ? `<select class="inventory-select" data-field="item" data-key="workArea" data-id="${escapeHtml(item.id)}" data-stock-key="${escapeHtml(item.stockKey)}" data-current-work-area="${escapeHtml(item.workArea)}" aria-label="${escapeHtml(text.workstation)}">${workAreas.map((area) => `<option value="${area.id}" ${item.workArea === area.id ? "selected" : ""}>${escapeHtml(area[language])}</option>`).join("")}</select>` : `<span class="inventory-readonly-field">${escapeHtml(workAreas.find((area) => area.id === item.workArea)?.[language] || item.workArea)}</span>`}</label>
    <label class="inventory-zone"><span class="mobile-field-label">${escapeHtml(text.storageLocation)}</span>${canRelocate ? `<select class="inventory-select" data-field="item" data-key="zone" data-id="${escapeHtml(item.id)}" data-stock-key="${escapeHtml(item.stockKey)}" data-current-zone="${escapeHtml(item.zone)}" aria-label="${escapeHtml(text.storageLocation)}">${storageGroups.map((zone) => `<option value="${zone.id}" ${item.zone === zone.id ? "selected" : ""}>${escapeHtml(zone[language])}</option>`).join("")}</select>` : `<span class="inventory-readonly-field">${escapeHtml(zoneLabel(item.zone, language))}</span>`}</label>
    <div class="inventory-storage">${quantityControl(item, "item", Boolean(context.manageQuantityEdit))}<label class="storage-threshold"><span>${escapeHtml(text.reserveMinimum)}</span>${canMinimum ? numberInput(item.minimum, `data-field="item" data-key="minimum" data-id="${escapeHtml(item.id)}" data-stock-key="${escapeHtml(item.stockKey)}" data-zone="${escapeHtml(item.zone)}" data-cloud-item-id="${escapeHtml(item.cloudItemId||"")}" data-cloud-location-id="${escapeHtml(item.cloudLocationId||"")}" aria-label="${escapeHtml(text.reserveMinimum)}"`, "minimum-input") : `<strong class="minimum-readonly">${escapeHtml(item.minimum)}</strong>`}</label></div><div class="inventory-working"><span class="mobile-field-label">${escapeHtml(text.workingQuantity)}</span><strong>${working?.quantity ?? 0}</strong><small>${escapeHtml(item.unit)}</small></div><div class="inventory-actions">${inventoryStatusBadge(item, text)}<div class="inventory-item-tools">${canInternalTransfer && canRestock ? `<button class="inventory-action-button restock-location" data-action="restock-storage-item" data-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(text.transfer)}">${icon("plus")}</button>` : ""}${catalogManageVisible ? `<button class="inventory-action-button ${catalogManage ? "" : "sql-pending-action"}" data-action="${catalogManage ? "open-edit-item" : "inventory-edit-sql-pending"}" data-stock-key="${escapeHtml(item.stockKey)}" aria-label="${escapeHtml(text.editItem)}">${icon("edit")}</button>${canArchive ? `<button class="inventory-action-button delete-action" data-action="delete-item" data-stock-key="${escapeHtml(item.stockKey)}" aria-label="${escapeHtml(text.deleteItem)}">${icon("trash")}</button>` : ""}` : ""}</div></div></article>`;
}

function workInventoryRow(item, context) {
  const { language, text, record } = context;
  const site = activeInventorySite();
  const locationId = item.cloudLocationId || "";
  const catalogManage = canManageBranchCatalog(site);
  const canMinimum = canInventoryAction("inventory.minimum.edit",{site,locationId,workArea:item.workArea || ""});
  const canWorkAreaEdit = canInventoryAction("inventory.work_area.edit",{site,workArea:item.workArea || ""});
  const canPick = canInventoryAction("inventory.pick",{site,locationId,workArea:item.workArea || ""});
  const status = inventoryStatus(item);
  const sources = storageSources(item, record);
  const source = sources[0];
  const available = sources.reduce((total, entry) => total + entry.quantity, 0);
  const needed = inventoryRestock(item);
  const workAreas = inventoryWorkAreaGroups(activeInventorySite());
  const mainSources = inventoryPrimaryStorageIds(activeInventorySite()).map((zone) => ({
    zone,
    quantity: record.inventory
      .filter((entry) => entry.stockKey === item.stockKey && entry.zone === zone)
      .reduce((total, entry) => total + entry.quantity, 0),
  }));
  const searchCorpus=prepareSearchCorpus(inventoryItemSearchText(item,{
    site,
    extra:sources.flatMap((entry)=>[
      entry.zone,
      zoneLabel(entry.zone,"zh",site),
      zoneLabel(entry.zone,"vi",site),
    ]),
  }));
  return `<article class="inventory-row work-row" data-inventory-search-corpus="${escapeHtml(searchCorpus)}"><div class="inventory-item-name"><span class="inventory-status-dot ${status}"></span><div><strong>${escapeHtml(itemName(item, language))}</strong><small>${escapeHtml(itemSecondary(item, language))}</small></div></div>
    <label class="inventory-work-area"><span class="mobile-field-label">${escapeHtml(text.workstation)}</span>${canWorkAreaEdit ? `<select class="inventory-select" data-field="workItem" data-key="workArea" data-id="${escapeHtml(item.id)}" data-stock-key="${escapeHtml(item.stockKey)}" data-current-work-area="${escapeHtml(item.workArea)}" aria-label="${escapeHtml(text.workstation)}">${workAreas.map((area) => `<option value="${area.id}" ${item.workArea === area.id ? "selected" : ""}>${escapeHtml(area[language])}</option>`).join("")}</select>` : `<span class="inventory-readonly-field">${escapeHtml(workAreas.find((area) => area.id === item.workArea)?.[language] || item.workArea)}</span>`}</label>
    ${quantityControl(item, "workItem")}<div class="inventory-minimum">${canMinimum ? numberInput(item.minimum, `data-field="workItem" data-key="minimum" data-id="${escapeHtml(item.id)}" data-stock-key="${escapeHtml(item.stockKey)}" data-work-area="${escapeHtml(item.workArea)}" data-cloud-item-id="${escapeHtml(item.cloudItemId||"")}" data-cloud-location-id="${escapeHtml(item.cloudLocationId||"")}"`, "minimum-input") : `<strong class="minimum-readonly">${escapeHtml(item.minimum)}</strong>`}<small>${escapeHtml(item.unit)}</small></div>
    <div class="inventory-source"><div class="source-quantities">${mainSources.map((entry) => `<span class="source-quantity ${entry.quantity === 0 ? "source-empty" : ""}" data-source-zone="${entry.zone}">${escapeHtml(zoneLabel(entry.zone, language))} <strong>${entry.quantity}</strong></span>`).join("")}</div><small>${escapeHtml(source ? `${text.takeFrom} ${zoneLabel(source.zone, language)}` : text.noSource)}</small></div>
    <div class="inventory-transfer">${needed > 0 && canPick ? `<button class="restock-button" data-action="restock-work-item" data-id="${escapeHtml(item.id)}" ${available <= 0 ? "disabled" : ""}>${icon("plus")}${Math.min(needed, available) || needed}</button>` : needed > 0 ? `<span class="tag tag-low">${escapeHtml(text.restock)}</span>` : `<span class="tag tag-ok">${escapeHtml(text.ready)}</span>`}</div></article>`;
}

function inventoryGroups(items, groups, key, context, rowRenderer) {
  return groups.map((group) => {
    const entries = items.filter((item) => item[key] === group.id);
    if (!entries.length) return "";
    return `<section class="inventory-group"><div class="inventory-group-heading"><strong>${escapeHtml(group[context.language])}</strong><span>${entries.length} ${escapeHtml(context.text.items)}</span></div>${entries.map((item) => rowRenderer(item, context)).join("")}</section>`;
  }).join("");
}

function inventoryDistinctItemCount(entries) {
  return new Set((entries || []).map((item) => String(item?.stockKey || item?.id || "")).filter(Boolean)).size;
}

function inventoryTabs(entries, groups, groupKey, activeGroup, selectAction, allLabel, context) {
  const { language, text } = context;
  const attribute = groupKey === "zone" ? "zone" : "area";
  const tab = (group) => `<button class="filter-tab ${activeGroup === group.id ? "selected" : ""}" data-action="${selectAction}" data-${attribute}="${group.id}">${escapeHtml(group[language])} <span>${entries.filter((item) => item[groupKey] === group.id).length}</span></button>`;
  const allCount = groupKey === "zone" ? inventoryDistinctItemCount(entries) : entries.length;
  const all = `<button class="filter-tab ${activeGroup === "all" ? "selected" : ""}" data-action="${selectAction}" data-${attribute}="all">${escapeHtml(allLabel)} <span>${allCount}</span></button>`;

  if (groupKey !== "zone") return `<div class="zone-tabs work-area-tabs">${all}${groups.map(tab).join("")}</div>`;

  const primary = groups.filter((group) => group.storageGroup === "primary");
  const service = groups.filter((group) => group.storageGroup === "service");
  return `<div class="storage-tab-groups"><div class="storage-tab-group"><span class="storage-group-label">${escapeHtml(text.primaryStorage)}</span><div class="zone-tabs">${all}${primary.map(tab).join("")}</div></div><div class="storage-tab-group"><span class="storage-group-label">${escapeHtml(text.serviceStorage)}</span><div class="zone-tabs">${service.map(tab).join("")}</div></div></div>`;
}

function branchInventoryHistoryView(rows, language="vi", cloud=false) {
  const title=language==="zh" ? "庫存操作紀錄" : "Lịch sử thao tác kho · 庫存操作紀錄";
  const subtitle=language==="zh"
    ? "查看操作人員、時間、數量、來源與目的儲位。"
    : "Xem người thao tác, thời gian, số lượng, kho nguồn và kho đích.";
  const actionLabel={
    in:"進貨入庫", pick:"領貨", use:"使用", return:"歸位", ship:"出貨", transfer:"庫存轉撥", adjust:"盤點調整",
    minimum:language==="zh"?"標準量調整":"Điều chỉnh định mức · 標準量調整",
    out:"出庫",
  };
  const body=(rows||[]).map((entry)=>{
    if(cloud){
      const direction=entry.direction||"";
      const sign=direction==="out"?"−":direction==="in"?"+":direction==="minimum"?"Δ":"↔";
      const tone=direction==="out"?"history-out":direction==="in"?"history-in":"history-adjust";
      const actor=entry.actor?.display_name||entry.actor?.username||"—";
      const item=entry.item?.name_zh_tw||"—";
      const unit=entry.item?.unit||"";
      const location=entry.location?.name_zh_tw||"";
      const transitionPrefix=direction==="minimum"
        ? (language==="zh"?"標準量 ":"Định mức · 標準量 ")
        : "";
      return `<article><div><strong>${escapeHtml(item)}</strong><small>${escapeHtml(new Date(entry.created_at).toLocaleString("zh-TW"))} · ${escapeHtml(actor)} · ${escapeHtml(entry.note||actionLabel[direction]||direction)}</small></div><span>${escapeHtml(location)}</span><strong class="${tone}">${sign}${escapeHtml(entry.amount)} ${escapeHtml(unit)}</strong><small>${escapeHtml(transitionPrefix)}${escapeHtml(entry.before_quantity)} → ${escapeHtml(entry.after_quantity)}</small></article>`;
    }
    const action=entry.action||"";
    const source=entry.source||"";
    const destination=entry.destination||"";
    const route=[source,destination].filter(Boolean).join(" → ");
    const sign=action==="in"?"+":action==="use"||action==="ship"?"−":"↔";
    const tone=action==="in"?"history-in":action==="use"||action==="ship"?"history-out":"history-adjust";
    return `<article><div><strong>${escapeHtml(entry.item||"—")}</strong><small>${escapeHtml(new Date(entry.createdAt||Date.now()).toLocaleString("zh-TW"))} · ${escapeHtml(entry.user||"—")} · ${escapeHtml(actionLabel[action]||action)}</small></div><span>${escapeHtml(route)}</span><strong class="${tone}">${sign}${escapeHtml(entry.amount||0)} ${escapeHtml(entry.unit||"")}</strong><small>${entry.locationFixed ? "已同步目的儲位" : ""}</small></article>`;
  }).join("");
  return `<section class="central-card branch-history-card"><div class="history-title"><div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(subtitle)}</p></div><span>${rows?.length||0} ${language==="zh"?"筆":"mục"}</span></div><div class="central-history">${body||`<p class="central-empty">${language==="zh"?"目前尚無操作紀錄。":"Chưa có lịch sử thao tác."}</p>`}</div></section>`;
}


function inventoryLocationState(entry) {
  const quantity=Math.max(0,Number(entry?.quantity)||0);
  const minimum=Math.max(0,Number(entry?.minimum)||0);
  const warning=entry?.warningQuantity == null ? null : Math.max(0,Number(entry.warningQuantity)||0);
  if (quantity<=0) return "empty";
  if ((entry?.minimumEnabled || minimum>0) && quantity<=minimum) return "low";
  if (entry?.warningEnabled && warning!=null && quantity<=warning) return "near";
  return "ok";
}

function inventoryProductModels(record, site = activeInventorySite()) {
  const products=new Map();
  const ensure=(entry)=>{
    const key=String(entry?.stockKey || "");
    if(!key) return null;
    if(!products.has(key)){
      products.set(key,{
        stockKey:key,
        label:entry.label || key,
        labelVi:entry.labelVi || entry.label || key,
        unit:entry.unit || "",
        unitCode:entry.unitCode || entry.unit || "",
        categoryCode:entry.categoryCode || "",
        catalogKey:entry.catalogKey || "",
        receiveZone:entry.receiveZone || "",
        workArea:entry.workArea || "",
        cloudItemId:entry.cloudItemId || "",
        locations:[],
      });
    }
    const product=products.get(key);
    product.label=entry.label || product.label;
    product.labelVi=entry.labelVi || product.labelVi;
    product.unit=entry.unit || product.unit;
    product.unitCode=entry.unitCode || product.unitCode;
    product.categoryCode=entry.categoryCode || product.categoryCode;
    product.catalogKey=entry.catalogKey || product.catalogKey;
    product.receiveZone=entry.receiveZone || product.receiveZone;
    product.workArea=entry.workArea || product.workArea;
    product.cloudItemId=entry.cloudItemId || product.cloudItemId;
    return product;
  };

  for(const entry of record?.inventory || []){
    const product=ensure(entry);
    if(!product) continue;
    product.locations.push({
      kind:"storage",
      row:entry,
      id:entry.id,
      cloudLocationId:entry.cloudLocationId || "",
      zone:entry.zone || "",
      workArea:"",
      labelVi:zoneLabel(entry.zone,"vi",site),
      labelZh:zoneLabel(entry.zone,"zh",site),
      quantity:Math.max(0,Number(entry.quantity)||0),
      minimum:Math.max(0,Number(entry.minimum)||0),
      minimumEnabled:entry.minimumEnabled === true,
      warningEnabled:entry.warningEnabled === true,
      warningQuantity:entry.warningQuantity == null ? null : Number(entry.warningQuantity),
      isPrimary:entry.isPrimary === true,
      displayOrder:Number(entry.displayOrder || 0),
    });
  }

  for(const entry of record?.workInventory || []){
    const product=ensure(entry);
    if(!product) continue;
    product.locations.push({
      kind:"work",
      row:entry,
      id:entry.id,
      cloudLocationId:entry.cloudLocationId || "",
      zone:"",
      workArea:entry.workArea || "",
      labelVi:workAreaLabel(entry.workArea,"vi",site),
      labelZh:workAreaLabel(entry.workArea,"zh",site),
      quantity:Math.max(0,Number(entry.quantity)||0),
      minimum:Math.max(0,Number(entry.minimum)||0),
      minimumEnabled:entry.minimumEnabled === true,
      warningEnabled:entry.warningEnabled === true,
      warningQuantity:entry.warningQuantity == null ? null : Number(entry.warningQuantity),
      isPrimary:false,
      displayOrder:Number(entry.displayOrder || 0),
    });
  }

  const storageSort=new Map(inventoryStorageGroups(site).map((row,index)=>[row.id,Number(row.sortOrder ?? index)]));
  const workSort=new Map(inventoryWorkAreaGroups(site).map((row,index)=>[row.id,Number(row.sortOrder ?? index)]));
  for(const product of products.values()){
    product.locations.sort((a,b)=>{
      const priority=(row)=>row.isPrimary ? 0 : row.kind==="work" ? 1 : 2;
      return priority(a)-priority(b)
        || (a.kind==="work" ? (workSort.get(a.workArea) ?? a.displayOrder) : (storageSort.get(a.zone) ?? a.displayOrder))
          - (b.kind==="work" ? (workSort.get(b.workArea) ?? b.displayOrder) : (storageSort.get(b.zone) ?? b.displayOrder))
        || String(a.labelZh).localeCompare(String(b.labelZh),"zh-Hant");
    });
    product.total=product.locations.reduce((sum,row)=>sum+row.quantity,0);
    const states=product.locations.map(inventoryLocationState);
    product.status=product.total<=0 ? "empty"
      : states.includes("low") ? "low"
      : states.includes("near") ? "near"
      : "ok";
  }
  return [...products.values()].sort((a,b)=>String(a.label).localeCompare(String(b.label),"zh-Hant"));
}

function inventoryLocationChip(location, product, context) {
  const { language }=context;
  const label=language==="zh" ? location.labelZh : location.labelVi;
  const state=inventoryLocationState(location);
  const prefix=location.isPrimary
    ? (language==="zh" ? "主要" : "Chính")
    : location.kind==="work"
      ? "Work"
      : "";
  return `<button class="inventory-location-chip ${location.isPrimary?"primary":location.kind==="work"?"work":"storage"} state-${state}"
    type="button" data-action="open-inventory-detail" data-stock-key="${escapeHtml(product.stockKey)}"
    data-location-id="${escapeHtml(location.cloudLocationId)}">
    <span>${prefix ? `<b>${escapeHtml(prefix)}</b>` : ""}${escapeHtml(label)}</span>
    <strong>${escapeHtml(location.quantity)} <small>${escapeHtml(product.unit)}</small></strong>
  </button>`;
}

function inventoryProductActions(product, context, compact=false) {
  const { language }=context;
  const site=activeInventorySite();
  const canEdit=[
    "inventory.product.identity.edit","inventory.product.location.attach",
    "inventory.product.location.detach","inventory.product.primary_location.edit",
    "inventory.product.unit.edit","inventory.product.category.edit","inventory.work_area.edit",
  ].some((action)=>canInventoryAction(action,{site}));
  const canTransfer=canInventoryAction("inventory.transfer.internal",{site});
  const canShip=canInventoryAction("inventory.transfer.cross_site",{site});
  const canHistory=canInventoryAction("inventory.history.full",{site});
  const canArchive=canInventoryAction("inventory.product.archive",{site});
  if(!canEdit&&!canTransfer&&!canShip&&!canHistory&&!canArchive) return "";
  return `<details class="inventory-more-menu ${compact?"compact":""}">
    <summary aria-label="${language==="zh"?"更多操作":"Thêm thao tác"}">•••</summary>
    <div class="inventory-more-menu-popover">
      ${canEdit?`<button type="button" data-action="open-edit-item" data-stock-key="${escapeHtml(product.stockKey)}">${language==="zh"?"編輯品項 / 儲位":"Sửa sản phẩm / vị trí"}</button>`:""}
      ${canTransfer?`<button type="button" data-action="select-inventory-ops" data-mode="transfer">${language==="zh"?"庫存轉撥":"Điều chuyển nội bộ"}</button>`:""}
      ${canShip?`<button type="button" data-action="select-inventory-ops" data-mode="ship">${language==="zh"?"跨據點出貨":"Xuất liên chi nhánh"}</button>`:""}
      ${canHistory?`<button type="button" data-action="select-inventory-ops" data-mode="history">${language==="zh"?"操作紀錄":"Lịch sử thao tác"}</button>`:""}
      ${canArchive?`<button type="button" class="danger" data-action="delete-item" data-stock-key="${escapeHtml(product.stockKey)}">${language==="zh"?"封存品項":"Archive sản phẩm"}</button>`:""}
    </div>
  </details>`;
}

function inventoryProductRow(product, context) {
  const { language,text }=context;
  // Latest UX rule: once a product has three or more locations, keep the row
  // compact with Primary + Work/next location, then expose the rest via Xem thêm.
  const visible=product.locations.length>=3 ? product.locations.slice(0,2) : product.locations;
  const more=product.locations.length>=3
    ? `<button class="inventory-location-more" type="button" data-action="open-inventory-detail" data-stock-key="${escapeHtml(product.stockKey)}">${language==="zh"?"查看更多":"Xem thêm"} <span>+${product.locations.length-visible.length}</span></button>`
    : "";
  const statusLabel=product.status==="empty" ? text.outOfStock
    : product.status==="low" ? text.lowStock
    : product.status==="near" ? (language==="zh"?"接近不足":"Gần hết")
    : text.ready;
  const searchCorpus=prepareSearchCorpus(inventoryProductSearchText(product,activeInventorySite()));
  return `<article class="inventory-row inventory-product-row" data-stock-key="${escapeHtml(product.stockKey)}" data-inventory-search-corpus="${escapeHtml(searchCorpus)}">
    <div class="inventory-product-identity"><span class="inventory-status-dot ${product.status==="near"?"low":product.status}"></span><div><strong>${escapeHtml(language==="zh"?product.label:product.labelVi)}</strong><small>${escapeHtml(language==="zh"?product.labelVi:product.label)}${product.categoryCode?` · ${escapeHtml(product.categoryCode)}`:""}</small></div></div>
    <div class="inventory-product-unit"><span class="mobile-field-label">${language==="zh"?"單位":"Đơn vị"}</span><strong>${escapeHtml(product.unit)}</strong></div>
    <div class="inventory-product-total"><span class="mobile-field-label">${language==="zh"?"總量":"Tổng"}</span><strong>${escapeHtml(product.total)}</strong><small>${escapeHtml(product.unit)}</small></div>
    <div class="inventory-location-chips">${visible.map((row)=>inventoryLocationChip(row,product,context)).join("")}${more}</div>
    <div class="inventory-product-status"><span class="tag tag-${product.status==="near"?"low":product.status}">${escapeHtml(statusLabel)}</span>${inventoryProductActions(product,context,true)}</div>
  </article>`;
}

function inventoryAlertRows(products) {
  const rows=[];
  for(const product of products || []){
    for(const location of product.locations || []){
      const state=inventoryLocationState(location);
      if(state==="ok") continue;
      const threshold=state==="near"
        ? (location.warningQuantity == null ? 0 : Number(location.warningQuantity))
        : Number(location.minimum || 0);
      rows.push({
        product,
        location,
        state,
        threshold:Math.max(0,Number(threshold)||0),
      });
    }
  }
  const priority={empty:0,low:1,near:2};
  return rows.sort((a,b)=>
    (priority[a.state]??9)-(priority[b.state]??9)
    || Number(a.location.quantity||0)-Number(b.location.quantity||0)
    || String(a.product.label||"").localeCompare(String(b.product.label||""),"zh-Hant")
  );
}

function inventoryLowStockAlertCenter(products, context) {
  const { language }=context;
  const all=inventoryAlertRows(products);
  const filter=["all","empty","low","near"].includes(view.inventoryAlertFilter)
    ? view.inventoryAlertFilter
    : "all";
  const shown=filter==="all" ? all : all.filter((row)=>row.state===filter);
  const counts={
    empty:all.filter((row)=>row.state==="empty").length,
    low:all.filter((row)=>row.state==="low").length,
    near:all.filter((row)=>row.state==="near").length,
  };
  const statusLabel=(state)=>state==="empty"
    ? (language==="zh"?"缺貨":"Hết hàng")
    : state==="low"
      ? (language==="zh"?"低庫存":"Sắp hết")
      : (language==="zh"?"接近不足":"Gần hết");
  const thresholdLabel=(row)=>{
    if(row.state==="empty") return language==="zh"?"目前數量為 0":"Số lượng hiện tại bằng 0";
    if(row.state==="low") return `${language==="zh"?"安全量":"Minimum"}: ${row.threshold} ${row.product.unit}`;
    return `${language==="zh"?"提醒量":"Mức cảnh báo"}: ${row.threshold} ${row.product.unit}`;
  };
  const filterButton=(key,label,count)=>`<button type="button" class="${filter===key?"active":""}" data-action="select-inventory-alert-filter" data-filter="${key}"><span>${escapeHtml(label)}</span><strong>${count}</strong></button>`;
  return `<section class="inventory-alert-center">
    <div class="inventory-alert-heading">
      <div>
        <small>${language==="zh"?"庫存提醒":"Thông báo tồn kho"}</small>
        <h2>${language==="zh"?"接近不足 / 低庫存":"Gần hết / Sắp hết"}</h2>
        <p>${language==="zh"
          ?"提醒資料直接依 PostgreSQL 的安全量與提醒量計算；點選品項可開啟各儲位詳細。"
          :"Cảnh báo được tính trực tiếp từ minimum/mức cảnh báo trong PostgreSQL; mở chi tiết để xử lý từng vị trí."}</p>
      </div>
      <button class="secondary-button" type="button" data-action="select-inventory-ops" data-mode="overview">${icon("close")}${language==="zh"?"返回庫存":"Về kho"}</button>
    </div>
    <div class="inventory-alert-stats">
      <article class="critical"><small>${language==="zh"?"缺貨":"Hết hàng"}</small><strong>${counts.empty}</strong></article>
      <article class="low"><small>${language==="zh"?"低庫存":"Sắp hết"}</small><strong>${counts.low}</strong></article>
      <article class="near"><small>${language==="zh"?"接近不足":"Gần hết"}</small><strong>${counts.near}</strong></article>
    </div>
    <div class="inventory-alert-filters">
      ${filterButton("all",language==="zh"?"全部":"Tất cả",all.length)}
      ${filterButton("empty",language==="zh"?"缺貨":"Hết hàng",counts.empty)}
      ${filterButton("low",language==="zh"?"低庫存":"Sắp hết",counts.low)}
      ${filterButton("near",language==="zh"?"接近不足":"Gần hết",counts.near)}
    </div>
    <div class="inventory-alert-list">
      ${shown.length ? shown.map((row)=>{
        const product=row.product;
        const location=row.location;
        const locationLabel=language==="zh" ? location.labelZh : location.labelVi;
        const locationKind=location.isPrimary
          ? (language==="zh"?"主要儲位":"Vị trí chính")
          : location.kind==="work"
            ? "Work"
            : (language==="zh"?"儲位":"Vị trí");
        return `<article class="inventory-alert-row state-${row.state}">
          <div class="inventory-alert-product">
            <span class="inventory-status-dot ${row.state==="near"?"low":row.state}"></span>
            <div><strong>${escapeHtml(language==="zh"?product.label:product.labelVi)}</strong><small>${escapeHtml(language==="zh"?product.labelVi:product.label)}</small></div>
          </div>
          <div class="inventory-alert-location"><span>${escapeHtml(locationKind)}</span><strong>${escapeHtml(locationLabel)}</strong></div>
          <div class="inventory-alert-quantity"><span>${language==="zh"?"目前":"Hiện có"}</span><strong>${escapeHtml(location.quantity)} <small>${escapeHtml(product.unit)}</small></strong></div>
          <div class="inventory-alert-threshold"><span class="tag tag-${row.state==="near"?"low":row.state}">${escapeHtml(statusLabel(row.state))}</span><small>${escapeHtml(thresholdLabel(row))}</small></div>
          <button class="secondary-button" type="button" data-action="open-inventory-detail" data-stock-key="${escapeHtml(product.stockKey)}" data-location-id="${escapeHtml(location.cloudLocationId)}">${language==="zh"?"查看 / 處理":"Xem / xử lý"}</button>
        </article>`;
      }).join("") : `<div class="inventory-alert-empty">${icon("check")}<strong>${language==="zh"?"目前沒有此類庫存提醒":"Hiện không có cảnh báo loại này"}</strong><small>${language==="zh"?"安全量與提醒量皆由資料庫設定。":"Minimum và mức cảnh báo đều lấy từ Database."}</small></div>`}
    </div>
  </section>`;
}

function inventoryDetailQuantityControl(location, product) {
  const site=activeInventorySite();
  const workArea=location.kind==="work" ? location.workArea : "";
  const scope={site,locationId:location.cloudLocationId,workArea};
  const canQuick=canInventoryAction("inventory.quantity.adjust_quick",scope);
  const canSet=canInventoryAction("inventory.quantity.set_absolute",scope);
  const canMinimum=canInventoryAction("inventory.minimum.edit",scope);
  const kind=location.kind==="work" ? "workItem" : "item";
  const action=kind==="workItem" ? "adjust-work-item" : "adjust-item";
  const identity=kind==="workItem"
    ? `data-work-area="${escapeHtml(location.workArea)}"`
    : `data-zone="${escapeHtml(location.zone)}"`;
  const qty=canSet
    ? numberInput(location.quantity,`data-field="${kind}" data-key="quantity" data-id="${escapeHtml(location.id)}" data-stock-key="${escapeHtml(product.stockKey)}" ${identity} data-cloud-item-id="${escapeHtml(product.cloudItemId)}" data-cloud-location-id="${escapeHtml(location.cloudLocationId)}"`,"quantity-input")
    : `<strong class="quantity-readonly">${escapeHtml(location.quantity)}</strong>`;
  const minus=canQuick?`<button class="quantity-button" type="button" data-action="${action}" data-id="${escapeHtml(location.id)}" data-stock-key="${escapeHtml(product.stockKey)}" ${identity} data-cloud-item-id="${escapeHtml(product.cloudItemId)}" data-cloud-location-id="${escapeHtml(location.cloudLocationId)}" data-delta="-1">${icon("minus")}</button>`:"";
  const plus=canQuick?`<button class="quantity-button plus" type="button" data-action="${action}" data-id="${escapeHtml(location.id)}" data-stock-key="${escapeHtml(product.stockKey)}" ${identity} data-cloud-item-id="${escapeHtml(product.cloudItemId)}" data-cloud-location-id="${escapeHtml(location.cloudLocationId)}" data-delta="1">${icon("plus")}</button>`:"";
  const minimum=canMinimum
    ? numberInput(location.minimum,`data-field="${kind}" data-key="minimum" data-id="${escapeHtml(location.id)}" data-stock-key="${escapeHtml(product.stockKey)}" ${identity} data-cloud-item-id="${escapeHtml(product.cloudItemId)}" data-cloud-location-id="${escapeHtml(location.cloudLocationId)}"`,"minimum-input")
    : `<strong>${escapeHtml(location.minimum)}</strong>`;
  return `<div class="inventory-detail-control"><div class="quantity-control">${minus}${qty}${plus}<small>${escapeHtml(product.unit)}</small><span class="quantity-sync-status" data-quantity-sync-status></span></div><label><span>Minimum</span>${minimum}</label></div>`;
}

function inventoryProductDetailOverlay(context, record) {
  const key=String(view.inventoryDetailStockKey || "");
  if(!key) return "";
  const product=inventoryProductModels(record,activeInventorySite()).find((row)=>row.stockKey===key);
  if(!product) return "";
  const { language }=context;
  return `<div class="inventory-detail-backdrop"><section class="inventory-detail-sheet" role="dialog" aria-modal="true" aria-label="${escapeHtml(language==="zh"?"品項詳細":"Chi tiết sản phẩm")}">
    <header><div><small>${language==="zh"?"品項詳細":"Chi tiết sản phẩm"}</small><h2>${escapeHtml(language==="zh"?product.label:product.labelVi)}</h2><p>${escapeHtml(language==="zh"?product.labelVi:product.label)} · ${escapeHtml(product.total)} ${escapeHtml(product.unit)}</p></div><button class="icon-button" type="button" data-action="close-inventory-detail">${icon("close")}</button></header>
    <div class="inventory-detail-locations">
      ${product.locations.map((location)=>{
        const label=language==="zh"?location.labelZh:location.labelVi;
        const state=inventoryLocationState(location);
        const badge=location.isPrimary?(language==="zh"?"主要儲位":"Vị trí chính"):location.kind==="work"?"Work":"";
        return `<article class="inventory-detail-location state-${state}"><div class="inventory-detail-location-head"><div><strong>${badge?`<span>${escapeHtml(badge)}</span>`:""}${escapeHtml(label)}</strong><small>${state==="empty"?(language==="zh"?"缺貨":"Hết hàng"):state==="low"?(language==="zh"?"低庫存":"Sắp hết"):state==="near"?(language==="zh"?"接近不足":"Gần hết"):(language==="zh"?"正常":"Bình thường")}</small></div></div>${inventoryDetailQuantityControl(location,product)}</article>`;
      }).join("")}
    </div>
    <footer>${inventoryProductActions(product,context)}<button class="primary-button" type="button" data-action="close-inventory-detail">${language==="zh"?"完成":"Xong"}</button></footer>
  </section></div>`;
}

function inventorySearchControl(language, text, totalCount) {
  const placeholder = language === "zh"
    ? "搜尋品項、拼音/注音、縮寫或儲位…"
    : "Tìm tên, Pinyin/注音, viết tắt hoặc vị trí…";
  const label = language === "zh" ? "搜尋庫存" : "Tìm kiếm tồn kho";
  const clearLabel = language === "zh" ? "清除" : "Xóa";
  const initialMeta = language === "zh" ? `${totalCount} 筆` : `${totalCount} sản phẩm`;
  return `<div class="inventory-search-control" data-inventory-search-control>
    <label class="search-box inventory-search-box">${icon("search")}<input type="search" value="${escapeHtml(view.search)}" placeholder="${escapeHtml(placeholder)}" aria-label="${escapeHtml(label)}" data-field="inventorySearch" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" enterkeyhint="search" /></label>
    <div class="inventory-search-status"><span data-inventory-search-meta aria-live="polite">${escapeHtml(initialMeta)}</span><button type="button" class="inventory-search-clear" data-action="clear-inventory-search" aria-label="${escapeHtml(clearLabel)}" hidden>${icon("close")}<span>${escapeHtml(clearLabel)}</span></button></div>
  </div>`;
}

function inventory(context) {
  const { text, record, reserveAlerts, workAlerts, language, state } = context;
  const site = activeInventorySite();
  const cloudState = inventoryCloudState();
  const cloudReady = cloudState === "ready";
  const branchSite = isBranchInventorySite(site);
  const branchSnapshot = branchSite ? inventoryBranchSnapshot(site) : null;
  const isolatedCloudRecord = branchSite
    ? branchSnapshot
      ? { ...record, inventory:branchSnapshot.inventory, workInventory:branchSnapshot.workInventory, inventorySite:site }
      : record?.inventorySite === site
        ? record
        : { ...record, inventory:[], workInventory:[], inventorySite:site }
    : record;
  const effectiveRecord = isolatedCloudRecord;
  const rowContext = effectiveRecord === record ? context : { ...context, record: effectiveRecord };
  const products=inventoryProductModels(effectiveRecord,site);
  const storageView = view.inventoryView === "storage";
  const entries = storageView ? effectiveRecord.inventory : effectiveRecord.workInventory;
  const draftAlerts = effectiveRecord === record ? null : buildInventoryAlerts(effectiveRecord, inventoryStorageGroups(site));
  const activeAlerts = draftAlerts
    ? draftAlerts.filter((item)=>storageView ? item.kind !== "work" : item.kind === "work")
    : storageView ? reserveAlerts : workAlerts;
  const filtered = entries.filter((item) => storageView
    ? view.zone === "all" || item.zone === view.zone
    : view.workArea === "all" || item.workArea === view.workArea
  );
  const uiGroups = inventoryUiGroups(site);
  const groups = storageView ? uiGroups.storage : uiGroups.workAreas;
  const groupKey = storageView ? "zone" : "workArea";
  const activeGroup = storageView ? view.zone : view.workArea;
  const selectAction = storageView ? "select-zone" : "select-work-area";
  const allLabel = storageView ? text.allStorageLocations : text.allWorkAreas;
  const groupRows = inventoryGroups(filtered, groups, groupKey, rowContext, storageView ? storageInventoryRow : workInventoryRow);
  const columns = storageView
    ? [text.inventory, text.workstation, text.storageLocation, text.storageQuantity, text.workingQuantity, text.restock]
    : [text.inventory, text.workstation, text.current, text.standard, text.restockSource, text.transfer];
  const editable = canInventoryEdit();
  const catalogManage = canManageBranchCatalog(site);
  const catalogManageVisible = canViewBranchCatalogManagement(site);
  // The rendered store state is authoritative for the selected service date.
  // Reading the persisted copy here can briefly lag behind a date click and
  // makes mobile render the wrong set of inventory operations.
  const historical = state.selectedDate !== formatDateKey();
  const vpsBackend = accountSession()?.provider === "vps";
  const cloudNotice = vpsBackend
    ? (cloudReady
      ? `<div class="inventory-sql-status inventory-sql-ready"><strong>VPS PostgreSQL · 已連線</strong><small>Dữ liệu kho đang đọc/ghi trực tiếp trên VPS Singapore và được backup tự động. · 庫存資料目前直接讀寫 VPS PostgreSQL，並由伺服器自動備份。</small></div>`
      : cloudState === "checking"
        ? `<div class="inventory-cloud-notice"><strong>Đang kết nối VPS database · 正在連線 VPS 資料庫</strong><small>Hệ thống đang tự kiểm tra API và PostgreSQL. · 系統正在自動檢查 API 與 PostgreSQL。</small></div>`
        : `<div class="inventory-cloud-notice inventory-fallback-notice"><strong>Không kết nối được VPS database · VPS 資料庫連線失敗</strong><small>Thao tác ghi kho tạm khóa để tránh sai lệch dữ liệu. · 為避免資料分歧，暫時鎖定庫存寫入。</small></div>`)
    : `<div class="inventory-cloud-notice inventory-fallback-notice"><strong>Chỉ hỗ trợ VPS database · 僅支援 VPS 資料庫</strong><small>Vui lòng mở website từ máy chủ VPS. · 請從 VPS 伺服器開啟網站。</small></div>`;
  const opsAvailable = catalogManageVisible && cloudReady && globalThis.navigator?.onLine !== false && isBranchInventorySite(site);
  const opsEnabled = opsAvailable && !historical;
  const canViewHistory = canInventoryAction("inventory.history.full",{site});
  const tabsEnabled = (opsAvailable || canViewHistory || catalogManageVisible) && isBranchInventorySite(site);
  if (view.inventoryOpsMode === "receive") view.inventoryOpsMode = "overview";
  if (view.inventoryOpsMode === "out") view.inventoryOpsMode = "pick";
  if (view.inventoryOpsMode === "history" && !canViewHistory) view.inventoryOpsMode = "overview";
  if (view.inventoryOpsMode === "manage" && !catalogManageVisible) view.inventoryOpsMode = "overview";
  const opsMode = view.inventoryOpsMode === "alerts"
    ? "alerts"
    : view.inventoryOpsMode === "history" && canViewHistory
      ? "history"
      : view.inventoryOpsMode === "manage" && catalogManageVisible
        ? "manage"
        : opsEnabled ? view.inventoryOpsMode : "overview";
  const opLabel = {
    overview: language === "zh" ? "庫存總覽" : "Tổng quan · 庫存總覽",
    alerts: language === "zh" ? "庫存提醒" : "Cảnh báo · 庫存提醒",
    in: language === "zh" ? "進貨入庫" : "Nhập kho · 進貨入庫",
    pick: language === "zh" ? "領貨" : "Lấy hàng · 領貨",
    transfer: language === "zh" ? "庫存轉撥" : "Điều chuyển · 庫存轉撥",
    ship: language === "zh" ? "出貨" : "Xuất hàng · 出貨",
    manage: language === "zh" ? "庫存管理" : "Quản lý kho · 庫存管理",
    history: language === "zh" ? "操作紀錄" : "Lịch sử · 操作紀錄",
  };
  const opGuide = {
    overview: language === "zh"
      ? "查看各儲位的實際庫存、標準量與工作區數量；此頁主要用於確認庫存狀態。"
      : "Xem tồn thực tế theo từng vị trí, định mức và số lượng ở khu sử dụng; mục này chủ yếu để kiểm tra tình trạng kho.",
    alerts: language === "zh"
      ? "依各儲位在 Database 設定的安全量與提醒量顯示缺貨、低庫存及接近不足。"
      : "Hiển thị Hết hàng, Sắp hết và Gần hết theo minimum/mức cảnh báo được cấu hình trong Database cho từng vị trí.",
    in: language === "zh"
      ? "新到貨時使用：選擇要入庫的儲位、輸入數量後按「進貨入庫」，數量只會增加到所選儲位。"
      : "Dùng khi có hàng mới: chọn đúng vị trí nhập, nhập số lượng rồi bấm 進貨入庫; hàng chỉ được cộng vào vị trí đã chọn.",
    pick: language === "zh"
      ? "從儲位領到此品項在資料庫設定的工作區；實際用掉請按「使用」，剩餘品項請選擇「歸位儲位」後歸位。"
      : "Lấy hàng từ kho vào khu làm việc đã cấu hình cho nguyên liệu trong Database; phần đã dùng bấm 使用, phần còn thừa chọn đúng 歸位儲位 rồi cất lại.",
    transfer: language === "zh"
      ? "同一據點內換儲位時使用；選擇來源與目的儲位後轉撥，來源扣除、目的同步增加。"
      : "Dùng để chuyển giữa các vị trí trong cùng cơ sở; kho nguồn bị trừ và kho đích được cộng đồng thời.",
    ship: language === "zh"
      ? "跨據點出貨時使用：選擇來源庫存、收貨據點及對方實際存放儲位，完成後兩邊庫存同步更新。"
      : "Dùng khi xuất sang cơ sở khác: chọn kho nguồn, nơi nhận và vị trí cất thực tế bên nhận; tồn hai bên được cập nhật đồng thời.",
    manage: language === "zh"
      ? "用於新增、編輯食材與設定儲位、標準量及單位；日常領貨、轉撥或出貨請使用前面的操作頁。"
      : "Dùng để thêm/sửa nguyên liệu, vị trí lưu, định mức và đơn vị; thao tác lấy/chuyển/xuất hàng hằng ngày dùng các mục phía trước.",
    history: language === "zh"
      ? "查看此據點的庫存操作人員、時間、數量與前後變化；資料與雲端庫存紀錄連動。"
      : "Xem người thao tác, thời gian, số lượng và thay đổi tồn tại cơ sở này; dữ liệu liên kết trực tiếp với lịch sử trên database.",
  };
  const opsTabs = tabsEnabled ? `<div class="central-tabs branch-ops-tabs"><button data-action="select-inventory-ops" data-mode="overview" class="${opsMode==="overview"?"active":""}">${escapeHtml(opLabel.overview)}</button><button data-action="select-inventory-ops" data-mode="alerts" class="${opsMode==="alerts"?"active":""}">${escapeHtml(opLabel.alerts)}</button>${opsAvailable ? `<button data-action="select-inventory-ops" data-mode="in" ${historical ? 'data-switch-to-today="true"' : ""} class="${opsMode==="in"?"active":""}">${escapeHtml(opLabel.in)}</button><button data-action="select-inventory-ops" data-mode="pick" ${historical ? 'data-switch-to-today="true"' : ""} class="${opsMode==="pick"?"active":""}">${escapeHtml(opLabel.pick)}</button><button data-action="select-inventory-ops" data-mode="transfer" ${historical ? 'data-switch-to-today="true"' : ""} class="${opsMode==="transfer"?"active":""}">${escapeHtml(opLabel.transfer)}</button><button data-action="select-inventory-ops" data-mode="ship" ${historical ? 'data-switch-to-today="true"' : ""} class="${opsMode==="ship"?"active":""}">${escapeHtml(opLabel.ship)}</button>` : ""}${catalogManageVisible ? `<button data-action="select-inventory-ops" data-mode="manage" class="${opsMode==="manage"?"active":""}">${escapeHtml(opLabel.manage)}</button>` : ""}${canViewHistory ? `<button data-action="select-inventory-ops" data-mode="history" class="${opsMode==="history"?"active":""}">${escapeHtml(opLabel.history)}</button>` : ""}</div>` : "";
  const opsGuide = tabsEnabled ? `<div class="inventory-op-guide"><strong>${language === "zh" ? "使用說明" : "Hướng dẫn · 使用說明"}</strong><span>${escapeHtml(opGuide[opsMode] || "")}</span></div>` : "";
  if (opsMode === "manage") {
    const manageEntries = effectiveRecord.inventory;
    const manageFiltered = manageEntries.filter((item) => view.zone === "all" || item.zone === view.zone);
    const manageRowContext = { ...rowContext, catalogManageVisible, catalogManageWritable: catalogManage, manageQuantityEdit:canDirectInventoryAdjust() };
    const manageRows = inventoryGroups(manageFiltered, uiGroups.storage, "zone", manageRowContext, storageInventoryRow);
    const manageColumns = [text.inventory, text.workstation, text.storageLocation, text.storageQuantity, text.workingQuantity, text.restock];
    const manageSubtitle = language === "zh"
      ? "新增、編輯或刪除食材，並設定工作區、存放位置、現有量與標準量。"
      : "Thêm, sửa hoặc xóa nguyên liệu; thiết lập khu làm việc, nơi lưu, tồn hiện tại và định mức.";
    const editHint = language === "zh"
      ? "點選鉛筆可使用與新增食材相同的表單修改品項。"
      : "Nhấn biểu tượng bút chì để chỉnh bằng đúng biểu mẫu giống khi thêm nguyên liệu.";
    const manageAction = catalogManageVisible
      ? `<button class="primary-button ${catalogManage ? "" : "sql-pending-action"}" data-action="${catalogManage ? "open-add-item" : "inventory-edit-sql-pending"}">${icon("plus")}${escapeHtml(text.addItem)}</button>`
      : "";
    const manageDbNotice = catalogManage
      ? ""
      : !cloudReady
        ? (vpsBackend
          ? (cloudState === "checking"
            ? `<div class="inventory-readonly-notice"><strong>${language==="zh"?"正在連線 VPS 資料庫":"Đang kết nối VPS database"}</strong><small>${language==="zh"?"系統會自動確認 API 與資料庫。":"Hệ thống tự kiểm tra API và database."}</small></div>`
            : `<div class="inventory-readonly-notice"><strong>${language==="zh"?"VPS 資料庫尚未連線":"VPS database chưa kết nối"}</strong><small>${language==="zh"?"請檢查 VPS/API 狀態。":"Hãy kiểm tra trạng thái VPS/API."}</small></div>`)
          : (cloudState === "checking"
            ? `<div class="inventory-readonly-notice"><strong>${language==="zh"?"正在確認 SQL v11":"Đang xác minh SQL v11"}</strong><small>${language==="zh"?"請稍候，系統會自動確認資料庫版本，不需重新執行 SQL。":"Hệ thống đang tự kiểm tra database, không cần chạy lại SQL."}</small></div>`
            : `<div class="inventory-readonly-notice"><strong>${language==="zh"?"SQL schema v11 尚未確認":"Chưa xác nhận SQL schema v11"}</strong><small>${language==="zh"?"請確認資料庫已執行 Master v11。":"Hãy xác nhận database đã chạy Master v11."}</small></div>`))
        : `<div class="inventory-readonly-notice"><strong>${language==="zh"?"目前帳號無法編輯此據點":"Tài khoản hiện tại không được chỉnh sửa cơ sở này"}</strong><small>${language==="zh"?"資料庫已連線；請檢查帳號據點與庫存編輯權限。":"Database đã kết nối; hãy kiểm tra cơ sở và quyền chỉnh sửa kho của tài khoản."}</small></div>`;
    return `${heading(text.inventory, manageSubtitle, manageAction)}${cloudNotice}${opsTabs}${opsGuide}${manageDbNotice}
      <div class="inventory-summary"><span class="summary-pill"><span class="summary-dot green"></span>${new Set(manageEntries.map((item) => item.stockKey)).size} ${escapeHtml(text.items)}</span></div>
      ${inventoryTabs(manageEntries, uiGroups.storage, "zone", view.zone, "select-zone", text.allStorageLocations, rowContext)}
      <div class="filters-row"><p class="inventory-view-description">${escapeHtml(editHint)}</p>
        ${inventorySearchControl(language, text, manageFiltered.length)}</div>
      <section class="inventory-table storage-table"><div class="inventory-table-head">${manageColumns.map((column) => `<span>${escapeHtml(column)}</span>`).join("")}</div>${manageFiltered.length ? manageRows : `<p class="empty-state">${escapeHtml(text.noItems)}</p>`}<p class="empty-state" data-inventory-search-empty hidden>${escapeHtml(text.noItems)}</p></section>`;
  }
  if (opsMode === "alerts") {
    return `${heading(text.inventory, text.inventorySubtitle)}${cloudNotice}${opsTabs}${opsGuide}${inventoryLowStockAlertCenter(products,rowContext)}`;
  }
  if (opsMode === "history") {
    return `${heading(text.inventory, text.inventorySubtitle)}${cloudNotice}${opsTabs}${opsGuide}<section data-branch-inventory-history data-site="${escapeHtml(site)}">${branchInventoryHistoryView([],language,false)}</section>`;
  }
  if (opsMode !== "overview") {
    return `${heading(text.inventory, text.inventorySubtitle)}${cloudNotice}${opsTabs}${opsGuide}<section class="inventory-operations-host" data-branch-inventory-operations data-site="${escapeHtml(site)}" data-mode="${escapeHtml(opsMode)}"></section>`;
  }
  const productFiltered=products.filter((product)=>{
    if(storageView){
      return view.zone==="all" || product.locations.some((row)=>row.kind==="storage" && row.zone===view.zone);
    }
    return view.workArea==="all" || product.locations.some((row)=>row.kind==="work" && row.workArea===view.workArea);
  });
  const nearLowCount=products.filter((product)=>["near","low","empty"].includes(product.status)).length;
  const canCreate=canInventoryAction("inventory.product.create",{site});
  const productColumns=language==="zh"
    ? ["品項","單位","總量","位置分配","狀態 / 操作"]
    : ["Sản phẩm","Đơn vị","Tổng","Phân bổ vị trí","Trạng thái / thao tác"];
  return `${heading(text.inventory, text.inventorySubtitle, canCreate ? `<button class="primary-button" data-action="open-add-item">${icon("plus")}${escapeHtml(text.addItem)}</button>` : "")}${cloudNotice}${historical ? `<div class="inventory-readonly-notice inventory-history-notice"><span>Ảnh chụp tồn kho theo ngày · 歷史庫存快照：僅供查看。Các thao tác nhập/lấy/chuyển/xuất sẽ tự mở ngày hôm nay. · 庫存操作會自動切回今天。</span><button class="secondary-button" data-action="inventory-go-today">Về hôm nay · 回到今天</button></div>` : ""}${opsTabs}${opsGuide}
    <div class="inventory-summary"><span class="summary-pill"><span class="summary-dot green"></span>${products.length} ${escapeHtml(text.items)}</span><button type="button" class="summary-pill inventory-alert-shortcut" data-action="select-inventory-ops" data-mode="alerts"><span class="summary-dot amber"></span>${nearLowCount} ${language==="zh"?"庫存提醒":"cảnh báo tồn kho"}</button></div>
    <div class="inventory-view-switch"><button class="inventory-view-button ${storageView ? "selected" : ""}" data-action="select-inventory-view" data-view="storage">${icon("inventory")}${escapeHtml(text.storageInventory)}</button><button class="inventory-view-button ${storageView ? "" : "selected"}" data-action="select-inventory-view" data-view="work">${icon("preparation")}${escapeHtml(text.workInventory)}</button></div>
    ${inventoryTabs(entries, groups, groupKey, activeGroup, selectAction, allLabel, context)}
    <div class="filters-row"><p class="inventory-view-description">${language==="zh"?"每個品項只顯示一列；位置依主要儲位 → Work → 其他儲位排序。":"Mỗi sản phẩm chỉ hiện một dòng; vị trí sắp xếp Chính → Work → vị trí khác."}</p>
      ${inventorySearchControl(language, text, productFiltered.length)}</div>
    <section class="inventory-table inventory-product-table"><div class="inventory-table-head inventory-product-head">${productColumns.map((column)=>`<span>${escapeHtml(column)}</span>`).join("")}</div>${productFiltered.length ? productFiltered.map((product)=>inventoryProductRow(product,rowContext)).join("") : `<p class="empty-state">${escapeHtml(text.noItems)}</p>`}<p class="empty-state" data-inventory-search-empty hidden>${escapeHtml(text.noItems)}</p></section>`;
}

function reservationsPage(context) {
  const { text, reservations, state, record } = context;
  return `${heading(text.reservations, text.reservationsSubtitle)}<section class="reservations-layout"><article class="card reservation-input-card">${cardHeading(text.totalTables)}<div class="shift-inputs"><label><span>${escapeHtml(text.lunch)}</span>${numberInput(record.reservation.lunchTables, 'data-field="reservation" data-key="lunchTables"', "shift-number")}<small>${escapeHtml(text.tables)}</small></label><span class="shift-plus">+</span><label><span>${escapeHtml(text.dinner)}</span>${numberInput(record.reservation.dinnerTables, 'data-field="reservation" data-key="dinnerTables"', "shift-number")}<small>${escapeHtml(text.tables)}</small></label></div>
      <div class="reservation-result"><span>${escapeHtml(text.totalTables)}</span><strong>${reservations.tables} <small>${escapeHtml(text.tables)}</small></strong></div><div class="reservation-buffer"><span>${escapeHtml(text.buffer)}</span><strong>+${state.settings.reservationBuffer} ${escapeHtml(text.tables)}</strong></div><div class="reservation-target"><span>${escapeHtml(text.target)}</span><strong>${reservations.target} <small>${escapeHtml(text.portions)}</small></strong></div></article>
    <article class="card portions-card">${cardHeading(text.sectionPrep)}<p class="helper-text">${escapeHtml(text.reservationRule)}</p>${reservations.tables ? reservations.portions.map((portion) => portionSummary(portion, context, true)).join("") : `<p class="empty-state">${escapeHtml(text.zeroReservations)}</p>`}</article>${riceCard(context, true)}</section>`;
}

function procurementDateLabel(date, language) {
  return new Intl.DateTimeFormat(localeFor(language), { weekday: "short", month: "numeric", day: "numeric" }).format(new Date(`${date}T12:00:00`));
}

const PROCUREMENT_WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const PROCUREMENT_WEEKDAY_LABELS = {
  vi: { mon: "T2", tue: "T3", wed: "T4", thu: "T5", fri: "T6", sat: "T7", sun: "CN" },
  zh: { mon: "一", tue: "二", wed: "三", thu: "四", fri: "五", sat: "六", sun: "日" },
};

function procurementScheduleEditor(category, coverage, context) {
  const { language } = context;
  const closed = new Set(coverage.closedDays);
  const coverageDates = coverage.dates.map((date) => procurementDateLabel(date, language)).join(" + ");
  const restLabel = closed.size
    ? PROCUREMENT_WEEKDAYS.filter((day) => closed.has(day)).map((day) => PROCUREMENT_WEEKDAY_LABELS[language][day]).join("、")
    : (language === "zh" ? "尚未設定" : "Chưa thiết lập");
  return `<div class="supplier-schedule ${coverage.orderable ? "" : "schedule-closed"}">
    <label class="supplier-order-date"><span>${language === "zh" ? "叫貨日期" : "Ngày gọi hàng"}</span><input type="date" value="${escapeHtml(coverage.orderDate)}" data-field="procurementOrderDate" data-category="${escapeHtml(category)}"/></label>
    <div class="supplier-rest-days"><span>${language === "zh" ? "休息日" : "Ngày nghỉ"} · <strong>${escapeHtml(restLabel)}</strong></span><div>${PROCUREMENT_WEEKDAYS.map((day) => `<button class="${closed.has(day) ? "closed" : ""}" type="button" data-action="procurement-toggle-closed" data-category="${escapeHtml(category)}" data-day="${day}" aria-pressed="${closed.has(day)}">${PROCUREMENT_WEEKDAY_LABELS[language][day]}</button>`).join("")}</div></div>
    <div class="supplier-coverage"><span>${language === "zh" ? "本次涵蓋" : "Lần này bao phủ"}</span>${coverage.orderable ? `<strong>${escapeHtml(coverageDates || "—")}</strong>` : `<strong class="closed-message">${language === "zh" ? "叫貨日為休息日" : "Ngày gọi trùng ngày nghỉ"}</strong>`}</div>
  </div>`;
}

function procurementBalance(line, language) {
  if (line.shortage > 0) return `<span class="procurement-gap">${language === "zh" ? "叫貨前缺" : "Thiếu trước khi gọi"} ${compactNumber(line.shortage, language)} ${escapeHtml(line.demandUnit)}</span>`;
  return `<span class="procurement-covered">${language === "zh" ? "現有庫存足夠" : "Tồn hiện tại đủ dùng"}</span>`;
}

function procurementRow(line, context, factory = false) {
  const { language } = context;
  const name = language === "zh" ? line.label : line.labelVi;
  const secondary = language === "zh" ? line.labelVi : line.label;
  const packageRule = line.orderSize === 1 && line.orderUnit === line.demandUnit
    ? `${language === "zh" ? "依" : "Tính theo"} ${line.orderUnit}`
    : `1 ${line.orderUnit} = ${compactNumber(line.orderSize, language)} ${line.demandUnit}`;
  const orderStatus = line.orderUnits > 0
    ? `<strong>${line.orderUnits} ${escapeHtml(line.orderUnit)}</strong><small>= ${compactNumber(line.orderQuantity, language)} ${escapeHtml(line.demandUnit)}</small>`
    : `<strong class="order-none">${language === "zh" ? "不用叫貨" : "Chưa cần gọi"}</strong>`;
  return `<article class="procurement-row" data-procurement-id="${escapeHtml(line.id)}">
    <div class="procurement-product"><strong>${escapeHtml(name)}</strong><small>${escapeHtml(secondary)} · ${escapeHtml(packageRule)}</small></div>
    <div class="procurement-current"><span>${language === "zh" ? "現有庫存" : "Tồn hiện tại"}</span><strong>${compactNumber(line.current, language)} ${escapeHtml(line.demandUnit)}</strong></div>
    <label class="procurement-input"><span>${factory ? (language === "zh" ? "目標庫存" : "Mức cần có") : (language === "zh" ? "預計用量" : "Dự kiến sử dụng")}</span>${factory ? `<strong>${compactNumber(line.demand, language)} ${escapeHtml(line.demandUnit)}</strong>` : `<input type="number" min="0" step="0.5" value="${escapeHtml(line.demand)}" data-field="procurement" data-key="planned" data-id="${escapeHtml(line.id)}"/><small>${escapeHtml(line.demandUnit)}</small>`}</label>
    <label class="procurement-input"><span>${language === "zh" ? "已叫待到貨" : "Đã gọi, chờ giao"}</span><input type="number" min="0" step="1" value="${escapeHtml(line.incomingUnits)}" data-field="procurement" data-key="incoming" data-id="${escapeHtml(line.id)}"/><small>${escapeHtml(line.orderUnit)}</small></label>
    <div class="procurement-result">${procurementBalance(line, language)}${orderStatus}<small class="procurement-after ${line.balance < 0 ? "negative" : ""}">${language === "zh" ? "叫貨後預計剩" : "Dự kiến dư sau khi gọi"} ${compactNumber(Math.max(0, line.balance), language)} ${escapeHtml(line.demandUnit)}</small></div>
  </article>`;
}

function procurementSection(title, subtitle, lines, context, category, coverage, factory = false) {
  const { language } = context;
  return `<section class="card procurement-card">${cardHeading(title, `<span class="tag tag-neutral">${lines.length} ${language === "zh" ? "品項" : "mặt hàng"}</span>`, `<p>${escapeHtml(subtitle)}</p>`)}${procurementScheduleEditor(category, coverage, context)}<div class="procurement-table-head"><span>${language === "zh" ? "品項 / 叫貨規格" : "Mặt hàng / quy cách"}</span><span>${language === "zh" ? "現有" : "Hiện có"}</span><span>${language === "zh" ? "需求" : "Nhu cầu"}</span><span>${language === "zh" ? "待到貨" : "Đang giao"}</span><span>${language === "zh" ? "建議叫貨" : "Đề xuất gọi"}</span></div>${lines.map((line) => procurementRow(line, context, factory)).join("") || `<p class="empty-state">${language === "zh" ? "目前沒有品項。" : "Chưa có mặt hàng."}</p>`}</section>`;
}

function procurementPage(context) {
  const { state, record, language } = context;
  const plan = calculateProcurementPlan(state.selectedDate, record, state.settings, inventoryStorageGroups(activeInventorySite()));
  const noodles = plan.lines.filter((line) => line.category === "noodles");
  const vegetables = plan.lines.filter((line) => line.category === "vegetables");
  const totalOrders = [...plan.lines, ...plan.factory].filter((line) => line.orderUnits > 0).length;
  const title = language === "zh" ? "叫貨中心" : "Trung tâm gọi hàng";
  const subtitle = language === "zh" ? "依交貨範圍、現有庫存與待到貨量計算建議叫貨。" : "Tính lượng cần gọi từ lịch cung ứng, tồn hiện tại và hàng đang chờ giao.";
  const schedule = `<div class="procurement-schedule"><div><span>${language === "zh" ? "計算方式" : "Cách tính"}</span><strong>${language === "zh" ? "需求 − 現有 − 待到貨" : "Nhu cầu − tồn − đang giao"}</strong></div><div><span>${language === "zh" ? "需叫貨品項" : "Mặt hàng cần gọi"}</span><strong>${totalOrders}</strong></div><div><span>${language === "zh" ? "週五規則" : "Quy tắc thứ Sáu"}</span><strong>${language === "zh" ? "涵蓋週六＋週日" : "Bao phủ T7 + Chủ nhật"}</strong></div></div>`;
  return `${heading(title, subtitle, `<a class="secondary-button" href="#inventory">${icon("inventory")}${language === "zh" ? "更新庫存" : "Cập nhật tồn kho"}</a>`)}${schedule}<div class="procurement-stack">${procurementSection(language === "zh" ? "麵區叫貨" : "Gọi hàng khu mì", language === "zh" ? "粗麵 5斤/包、細麵 2.5斤/包、冷凍麵 30片/箱；週末需求預設 3 箱，再扣現有庫存。" : "Mì to 5 cân/bao, mì nhỏ 2,5 cân/bao, mì đông lạnh 30 miếng/thùng; nhu cầu cuối tuần mặc định 3 thùng rồi mới trừ tồn.", noodles, context, "noodles", plan.coverages.noodles)}${procurementSection(language === "zh" ? "蔬菜叫貨" : "Gọi rau", language === "zh" ? "顆白菜平日 4斤、假日每日 6斤，每包 2斤；高麗菜依顆數輸入。" : "Cải thìa ngày thường 4 cân, cuối tuần 6 cân/ngày, mỗi bao 2 cân; bắp cải nhập theo cây.", vegetables, context, "vegetables", plan.coverages.vegetables)}${procurementSection(language === "zh" ? "工廠叫貨" : "Gọi hàng xưởng", language === "zh" ? "依 Database 設定為「工廠叫貨」的儲位庫存補到各品項標準；休息日請依工廠實際排程設定。" : "Dựa trên tồn tại các vị trí được Database đặt là “Gọi xưởng” để bổ sung đến định mức; hãy đặt ngày nghỉ theo lịch thực tế của xưởng.", plan.factory, context, "factory", plan.coverages.factory, true)}</div>`;
}

function taskLabel(task, context) {
  const { language, text } = context;
  if (task.kind === "reservation") return `${text.taskPrep} ${text[task.key]}`;
  if (task.kind === "inventory") return `${text.taskRestock} ${language === "zh" ? task.label : task.labelVi}`;
  if (task.kind === "inventory-blocked") return `${task.awaitingFactory ? text.waitFactory : text.checkSupply} · ${language === "zh" ? task.label : task.labelVi}`;
  if (task.kind === "storage-restock") return `${text.restockAt} ${zoneLabel(task.zone, language)} · ${language === "zh" ? task.label : task.labelVi}`;
  if (task.kind === "procurement") return `${text.orderFactory} · ${language === "zh" ? task.label : task.labelVi}`;
  if (task.kind === "rice") return text.taskCookRice;
  if (task.kind === "checklist") return task[language];
  return task.title;
}

function taskDetail(task, context) {
  const { language, text } = context;
  if (task.kind === "reservation") return `${task.amount} ${text.portionsShort} · ${SECONDARY[task.key]}`;
  if (task.kind === "inventory") return `${task.amount} ${task.unit} · ${workAreaLabel(task.workArea, language)} · ${task.zone ? zoneLabel(task.zone, language) : text.noSource}`;
  if (task.kind === "inventory-blocked") return `${task.amount} ${task.unit} · ${workAreaLabel(task.workArea, language)} · ${text.noSource}`;
  if (task.kind === "storage-restock") return `${task.amount} ${task.unit} · ${task.sourceZone ? `${text.takeFrom} ${zoneLabel(task.sourceZone, language)}` : text.checkSupply}`;
  if (task.kind === "procurement") return `${task.amount} ${task.unit} · ${zoneLabel(task.zone, language)} · ${text.reserveTotal}: ${task.quantity}/${task.minimum}`;
  if (task.kind === "rice") return `${compactNumber(task.amount, language)} g`;
  if (task.kind === "checklist") return language === "vi" ? task.zh : task.vi;
  if (task.kind === "custom") {
    const details = [];
    if (task.quantity) details.push(`${task.quantity} ${task.unit || "mục"}`);
    if (task.area) details.push(workAreaLabel(task.area, language));
    if (task.assigneeName) details.push(task.assigneeName);
    if (task.dueAt) details.push(new Intl.DateTimeFormat(localeFor(language), { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(task.dueAt)));
    return details.join(" · ") || text.customTask;
  }
  return text.customTask;
}

function taskRow(task, context, compact = false, editable = accountCan("preparation", "edit")) {
  const { record, text } = context;
  const checked = Boolean(record.completedTasks[task.id]);
  const priority = task.priority === "high" && !checked
    ? compact ? '<span class="task-priority-dot" aria-hidden="true"></span>' : `<span class="tag tag-empty">${escapeHtml(text.urgent)}</span>`
    : "";
  return `<label class="task-row ${compact ? "compact" : ""} ${checked ? "task-done" : ""} ${task.kind === "procurement" ? "procurement-task" : ""}" data-task-kind="${escapeHtml(task.kind)}" data-priority="${escapeHtml(task.priority ?? "normal")}"><input type="checkbox" data-field="task" data-id="${escapeHtml(task.id)}" ${checked ? "checked" : ""} ${editable ? "" : 'disabled aria-disabled="true"'} /><span class="custom-checkbox">${icon("check")}</span><span class="task-copy"><strong>${escapeHtml(taskLabel(task, context))}</strong><small>${escapeHtml(taskDetail(task, context))}</small></span>${priority}</label>`;
}

function preparationPage(context) {
  const { text, tasks, progress, record, state, language } = context;
  const filtered = tasks.filter((task) => {
    const done = Boolean(record.completedTasks[task.id]);
    return view.taskFilter === "all" || (view.taskFilter === "open" && !done) || (view.taskFilter === "done" && done);
  });
  const filters = [{ id: "all", label: text.allTasks, count: progress.total }, { id: "open", label: text.openTasks, count: progress.pending }, { id: "done", label: text.doneTasks, count: progress.done }];
  const canAssign = accountCan("preparation", "edit");
  const assignmentFields = canAssign ? `<div class="task-assignment-grid"><label><span>${language === "zh" ? "數量" : "Số lượng"}</span><input name="quantity" type="number" min="0" value="1" /></label><label><span>${language === "zh" ? "工作區" : "Khu vực"}</span><select name="area"><option value="">—</option>${operationalWorkAreas(state).map((area) => `<option value="${area.id}">${escapeHtml(area[language])}</option>`).join("")}</select></label><label><span>${language === "zh" ? "指派給" : "Phân cho"}</span><select name="assigneeId"><option value="">${language === "zh" ? "整個區域" : "Cả khu vực"}</option>${state.operations.staff.filter((member) => member.active).map((member) => `<option value="${escapeHtml(member.id)}">${escapeHtml(member.name)}</option>`).join("")}</select></label><label><span>${language === "zh" ? "完成期限" : "Hạn hoàn thành"}</span><input name="dueAt" type="datetime-local" value="${state.selectedDate}T17:00" /></label></div>` : "";
  return `${heading(text.preparation, text.preparationSubtitle)}<section class="preparation-layout"><article class="card task-progress-card"><div><span>${escapeHtml(text.completed)}</span><strong>${progress.done}/${progress.total}</strong><small>${progress.percentage}%</small></div><div class="wide-progress"><span style="width:${progress.percentage}%"></span></div></article>
    <article class="card tasks-card"><div class="task-filters">${filters.map((filter) => `<button class="filter-tab ${view.taskFilter === filter.id ? "selected" : ""}" data-action="select-task-filter" data-filter="${filter.id}">${escapeHtml(filter.label)} <span>${filter.count}</span></button>`).join("")}</div>${filtered.length ? filtered.map((task) => taskRow(task, context)).join("") : `<p class="empty-state">${escapeHtml(text.noTasks)}</p>`}<form class="add-task-form expanded-task-form" data-form="add-task"><input required name="title" placeholder="${escapeHtml(text.taskPlaceholder)}" />${assignmentFields}<button class="primary-button" type="submit">${icon("plus")}<span>${escapeHtml(text.addTask)}</span></button></form></article></section>`;
}

function settingsField(label, value, key, suffix = "", type = "number") {
  return `<label class="setting-row"><span>${escapeHtml(label)}</span><span class="setting-control"><input name="${escapeHtml(key)}" type="${type}" ${type === "number" ? 'min="0" inputmode="numeric"' : ""} value="${escapeHtml(value)}" />${suffix ? `<small>${escapeHtml(suffix)}</small>` : ""}</span></label>`;
}

function settingsPersistenceStatus(text) {
  const status = view.settingsSaveStatus;
  if (!status) return "";
  const label = status === "saved" ? text.settingsSavedVps
    : ["pending", "saving"].includes(status) ? text.settingsSaving
      : status === "error" ? text.settingsSaveError
        : status === "local" ? text.settingsLocalSaved
          : text.settingsNoChanges;
  return `<span class="settings-save-status settings-save-status-${escapeHtml(status)}" role="status">${status === "saved" ? icon("check") : ""}${escapeHtml(label)}</span>`;
}

function settingsPage(context) {
  const { state, text, language } = context;
  const history = Object.keys(state.records).sort().reverse();
  const canManage = accountCan("settings", "edit");
  const site = activeInventorySite();
  const siteRow = inventorySite(site);
  const defaultBranchName = language === "vi"
    ? (siteRow?.name_vi || siteRow?.name_zh_tw || siteRow?.code || "")
    : (siteRow?.name_zh_tw || siteRow?.name_vi || siteRow?.code || "");
  const branchName = state.settings.branchName || defaultBranchName;
  const general = canManage
    ? `<form data-form="save-general-settings">${settingsField(text.organizationName, state.settings.organizationName || "食徒", "organizationName", "", "text")}${settingsField(text.branchName, branchName, "branchName", "", "text")}${settingsField(text.employee, state.settings.employeeName, "employeeName", "", "text")}${settingsField(text.workstation, state.settings.workstation, "workstation", "", "text")}<div class="setting-row"><span>${escapeHtml(text.language)}</span><div class="language-switch"><button type="button" class="${language === "vi" ? "active" : ""}" data-action="set-language" data-language="vi">Tiếng Việt</button><button type="button" class="${language === "zh" ? "active" : ""}" data-action="set-language" data-language="zh">繁體中文</button></div></div><div class="settings-section-title">${escapeHtml(text.operationalRules)}</div>${settingsField(text.reservationBuffer, state.settings.reservationBuffer, "reservationBuffer", text.tables)}${settingsField(text.weekdaysRice, state.settings.riceWeekday, "riceWeekday", "g")}${settingsField(text.weekendRice, state.settings.riceWeekend, "riceWeekend", "g")}${settingsField(text.skipRiceAbove, state.settings.riceSkipAbove, "riceSkipAbove", "g")}<p class="helper-text">${escapeHtml(text.riceRule)}</p><div class="settings-save-row"><button class="primary-button" type="submit" data-settings-save>${icon("check")}${escapeHtml(text.saveChanges)}</button>${settingsPersistenceStatus(text)}</div></form>`
    : `<div class="settings-readonly"><p>${escapeHtml(text.settingsReadOnly)}</p><dl><div><dt>${escapeHtml(text.organizationName)}</dt><dd>${escapeHtml(state.settings.organizationName || "食徒")}</dd></div><div><dt>${escapeHtml(text.branchName)}</dt><dd>${escapeHtml(branchName)}</dd></div><div><dt>${escapeHtml(text.employee)}</dt><dd>${escapeHtml(state.settings.employeeName)}</dd></div><div><dt>${escapeHtml(text.workstation)}</dt><dd>${escapeHtml(state.settings.workstation)}</dd></div></dl></div>`;
  return `${heading(text.settings, text.settingsSubtitle)}<section class="settings-layout"><article class="card settings-card general-settings-card">${cardHeading(text.generalSettings)}${general}</article>
    <article class="card settings-card">${cardHeading(text.history, `<span class="tag tag-neutral">${history.length} ${escapeHtml(text.savedDays)}</span>`)}<div class="history-list">${history.slice(0, 14).map((date) => `<button class="history-item ${date === state.selectedDate ? "active" : ""}" data-action="select-date" data-date="${date}"><span>${escapeHtml(dateLabel(date, language))}</span>${date === formatDateKey() ? `<small>${escapeHtml(text.today)}</small>` : ""}${icon("chevronRight")}</button>`).join("")}</div></article>
    ${management.staffCard(context)}<article class="card settings-card danger-zone">${cardHeading(text.data)}<p>${escapeHtml(text.autoSaved)}</p><button class="danger-button" data-action="reset">${escapeHtml(text.resetData)}</button></article></section>`;
}

function addItemModal(context) {
  const { text, language, record } = context;
  const editing = Boolean(view.editingStockKey);
  const existing = editing ? record.inventory.filter((item) => item.stockKey === view.editingStockKey) : [];
  const item = existing[0] ?? {};
  const working = editing ? record.workInventory.find((entry) => entry.stockKey === view.editingStockKey) : null;
  const site = activeInventorySite();
  const uiGroups = inventoryUiGroups(site);
  const storageGroups = uiGroups.storage;
  const workAreas = uiGroups.workAreas;
  const masters=inventoryCatalogMasters(site);
  const activeZone = view.zone !== "all" && storageGroups.some((zone) => zone.id === view.zone) ? view.zone : storageGroups[0]?.id || "";
  const selectedPrimaryZone=existing.find((entry)=>entry.isPrimary)?.zone || existing[0]?.zone || activeZone;
  const selectedWorkArea = item.workArea || (view.workArea !== "all" && workAreas.some((area) => area.id === view.workArea) ? view.workArea : workAreas[0]?.id || "");

  const canIdentity=editing
    ? canInventoryAction("inventory.product.identity.edit",{site})
    : canInventoryAction("inventory.product.create",{site});
  const canUnit=canInventoryAction("inventory.product.unit.edit",{site});
  const canCategory=canInventoryAction("inventory.product.category.edit",{site});
  const canWorkArea=canInventoryAction("inventory.work_area.edit",{site,workArea:selectedWorkArea});
  const canPrimary=canInventoryAction("inventory.product.primary_location.edit",{site});
  const selectedWorkLocation=inventoryWorkLocation(site,selectedWorkArea);
  const workMinimumLocationId=String(working?.cloudLocationId || selectedWorkLocation?.id || "");
  const canWorkMinimum=workMinimumLocationId
    ? canInventoryAction("inventory.minimum.edit",{site,locationId:workMinimumLocationId,workArea:selectedWorkArea})
    : canInventoryAction("inventory.minimum.edit",{site,workArea:selectedWorkArea});
  const receiveDefaultEditable = canManageReceiveDefault(site);

  const unitRows=(masters.units||[]);
  const currentUnit=item.unit || "";
  const unitSuggestions=[...new Set([
    currentUnit,
    ...unitRows.flatMap((row)=>[row.symbol,row.code]).filter(Boolean),
  ].map((value)=>String(value||"").trim()).filter(Boolean))];
  const selectedUnit=currentUnit || unitSuggestions[0] || "";
  const categoryRows=masters.categories||[];
  const selectedCategory=item.categoryCode || "";

  const locations = storageGroups.map((zone,index) => {
    const stored = existing.find((entry) => entry.zone === zone.id);
    const checked = editing ? Boolean(stored) : zone.id === activeZone;
    const locationId=stored?.cloudLocationId || zone.locationId || "";
    const canAttach=canInventoryAction("inventory.product.location.attach",{site,locationId});
    const canDetach=stored ? canInventoryAction("inventory.product.location.detach",{site,locationId}) : canAttach;
    const canToggle=stored ? canDetach : canAttach;
    const canQuantity=canInventoryAction("inventory.quantity.set_absolute",{site,locationId});
    const canMinimum=canInventoryAction("inventory.minimum.edit",{site,locationId});
    const primaryChecked=(checked && zone.id===selectedPrimaryZone);
    return `<div class="modal-location-row inventory-location-config" data-location-zone="${escapeHtml(zone.id)}">
      <label class="modal-location-choice">
        <input type="checkbox" name="zones" value="${escapeHtml(zone.id)}" ${checked ? "checked" : ""} ${canToggle ? "" : "disabled"} />
        <span>${escapeHtml(zone[language])}</span>
      </label>
      <label class="inventory-primary-choice" title="${language==="zh"?"主要儲位":"Vị trí chính"}">
        <input type="radio" name="primaryZone" value="${escapeHtml(zone.id)}" ${primaryChecked?"checked":""} ${canPrimary && checked ? "" : "disabled"} ${canPrimary ? "" : 'data-permission-denied="true"'} />
        <span>${language==="zh"?"主要":"Chính"}</span>
      </label>
      <label><span>${escapeHtml(text.current)}</span><input type="number" min="0" name="quantity:${escapeHtml(zone.id)}" value="${stored?.quantity ?? 0}" ${canQuantity ? "" : 'readonly aria-readonly="true"'} /></label>
      <label><span>${language==="zh"?"最低量":"Minimum"}</span><input type="number" min="0" name="minimum:${escapeHtml(zone.id)}" value="${stored?.minimum ?? 0}" ${canMinimum ? "" : 'readonly aria-readonly="true"'} /></label>
      <input type="hidden" name="displayOrder:${escapeHtml(zone.id)}" value="${Number(stored?.displayOrder ?? zone.sortOrder ?? index)}" />
    </div>`;
  }).join("");

  const receiveZone=item.receiveZone||"";
  const receiveOptions=[`<option value="">${language==="zh"?"自動（只有一個儲位）／每次選擇":"Tự động nếu chỉ có 1 vị trí · nếu nhiều vị trí sẽ hỏi"}</option>`]
    .concat(storageGroups.map((zone)=>`<option value="${escapeHtml(zone.id)}" ${receiveZone===zone.id?"selected":""}>${escapeHtml(zone[language])}</option>`))
    .join("");
  const categoryOptions=[`<option value="">${language==="zh"?"未分類":"Chưa phân loại"}</option>`]
    .concat(categoryRows.map((row)=>`<option value="${escapeHtml(row.code)}" ${selectedCategory===row.code?"selected":""}>${escapeHtml(language==="zh"?(row.name_zh_tw||row.code):(row.name_vi||row.name_zh_tw||row.code))}</option>`))
    .join("");

  const saveLabel = editing ? "Lưu thay đổi · 儲存變更" : "Lưu sản phẩm · 儲存品項";
  return `<div class="modal-backdrop" data-action="close-modal"><section class="modal-card ingredient-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <div class="card-heading"><h2 id="modal-title">${escapeHtml(editing ? text.editItem : text.addItem)}</h2><div class="modal-heading-actions"><button class="secondary-button modal-header-save" type="submit" form="ingredient-product-form" data-save-item>${icon("check")}<span>${escapeHtml(saveLabel)}</span></button><button class="icon-button" type="button" data-action="close-modal">${icon("close")}</button></div></div>
    <form id="ingredient-product-form" data-form="${editing ? "edit-item" : "add-item"}">
      <div class="modal-grid modal-identity-grid">
        <label>中文<input required name="label" placeholder="牛肉" value="${escapeHtml(item.label ?? "")}" ${canIdentity?"":'readonly aria-readonly="true"'} /></label>
        <label>Tiếng Việt<input required name="labelVi" placeholder="Thịt bò" value="${escapeHtml(item.labelVi ?? "")}" ${canIdentity?"":'readonly aria-readonly="true"'} /></label>
      </div>
      <div class="modal-grid modal-meta-grid">
        <label>${language==="zh"?"分類":"Danh mục · 分類"}<select name="categoryCode" ${canCategory?"":'disabled aria-disabled="true"'}>${categoryOptions}</select>${canCategory?"":`<input type="hidden" name="categoryCode" value="${escapeHtml(selectedCategory)}" />`}</label>
        <label>${escapeHtml(text.quantity)}
          <input name="unit" list="inventory-unit-suggestions" required value="${escapeHtml(selectedUnit)}" placeholder="包 / 盒 / kg" ${canUnit?"":'readonly aria-readonly="true"'} />
          <datalist id="inventory-unit-suggestions">${unitSuggestions.map((unit)=>`<option value="${escapeHtml(unit)}"></option>`).join("")}</datalist>
          <small class="ingredient-form-guide">${canUnit ? (language==="zh"?"可選既有單位，也可輸入新單位；新單位會寫入資料庫。":"Có thể chọn hoặc tự nhập đơn vị mới; đơn vị mới sẽ được lưu vào Database.") : (language==="zh"?"此帳號沒有編輯單位權限。":"Tài khoản này không có quyền sửa đơn vị.")}</small>
        </label>
      </div>
      <label>${escapeHtml(text.workstation)}
        <select name="workArea" required ${canWorkArea || !editing ? "" : 'disabled aria-disabled="true"'}>${workAreas.map((area) => `<option value="${escapeHtml(area.id)}" ${selectedWorkArea === area.id ? "selected" : ""}>${escapeHtml(area[language])}</option>`).join("")}</select>
        ${canWorkArea || !editing ? "" : `<input type="hidden" name="workArea" value="${escapeHtml(selectedWorkArea)}" />`}
        <small class="ingredient-form-guide">${language === "zh" ? "工作區依據點獨立設定，不會強制與其他據點相同。" : "Work Area được cấu hình riêng theo từng chi nhánh, không ép giống site khác."}</small>
      </label>
      <fieldset class="modal-locations"><legend>${escapeHtml(text.selectLocations)}</legend>
        <p class="ingredient-form-guide">${language === "zh" ? "勾選實際存放位置並設定主要儲位。位置排序：主要 → Work → 其他。" : "Chọn nơi thực tế lưu hàng và đặt Vị trí chính. Thứ tự hiển thị: Chính → Work → vị trí khác."}</p>
        ${locations}
      </fieldset>
      <div class="modal-grid modal-meta-grid">
        <label>${escapeHtml(text.workInventory)} · Minimum<input type="number" min="0" name="workMinimum" value="${working?.minimum ?? 0}" ${canWorkMinimum ? "" : 'readonly aria-readonly="true"'} /><small class="ingredient-form-guide">${language === "zh" ? "可留 0；設定後用於工作區低庫存提醒。" : "Có thể để 0; nếu đặt sẽ dùng cho cảnh báo thiếu tại Work Area."}</small></label>
        <label>${language==="zh"?"預設收貨儲位":"Vị trí nhận hàng mặc định · 預設收貨儲位"}<select name="receiveZone" ${receiveDefaultEditable ? "" : 'disabled aria-disabled="true"'}>${receiveOptions}</select>${receiveDefaultEditable ? "" : `<input type="hidden" name="receiveZone" value="${escapeHtml(receiveZone)}" />`}<small class="ingredient-form-guide">${language==="zh"?"只有一個儲位時可自動；多個儲位若有預設就自動入該位置，若沒有則收貨／跨店調撥時必須選擇目的儲位。":"Nếu chỉ có 1 vị trí hệ thống tự chọn; nếu có nhiều vị trí và đặt mặc định thì hàng đến sẽ vào đó, còn chưa đặt thì khi nhận/chuyển liên chi nhánh phải chọn vị trí đích."}</small></label>
      </div>
      <div class="modal-submit-bar"><button class="primary-button modal-submit" type="submit" data-save-item>${icon("check")}${escapeHtml(saveLabel)}</button></div>
    </form>
  </section></div>`;
}

function syncReceiveZoneOptions(form) {
  if(!form?.matches?.('[data-form="add-item"],[data-form="edit-item"]')) return;
  const selected=new Set([...form.querySelectorAll('input[name="zones"]:checked')].map((input)=>input.value));
  const receive=form.querySelector('select[name="receiveZone"]');
  if(receive){
    for(const option of receive.options){
      if(!option.value){ option.disabled=false; continue; }
      option.disabled=!selected.has(option.value);
    }
    if(receive.value && !selected.has(receive.value)) receive.value="";
  }

  const primaryRadios=[...form.querySelectorAll('input[name="primaryZone"]')];
  for(const radio of primaryRadios){
    const permitted=!radio.hasAttribute("data-permission-denied");
    radio.disabled=!selected.has(radio.value) || !permitted;
    radio.closest(".inventory-primary-choice")?.classList.toggle("is-disabled",radio.disabled);
  }
  const checked=primaryRadios.find((radio)=>radio.checked && !radio.disabled);
  if(!checked){
    const fallback=primaryRadios.find((radio)=>selected.has(radio.value) && !radio.disabled);
    if(fallback) fallback.checked=true;
  }
}

async function persistCatalogStocktakeFields({ site, stockKey, locations, workArea, workMinimum }) {
  const itemKey=branchItemKey(site,stockKey);
  if (!itemKey) return { ok:false, fallback:false, error:new Error("CATALOG_ITEM_NOT_FOUND") };

  const storageByZone=new Map(inventoryUiGroups(site).storage.map((row)=>[row.id,row]));
  let wrote=false;
  for (const location of locations) {
    const master=storageByZone.get(location.zone);
    const locationCode=master?.code || branchLocationCode(site,location.zone);
    const locationId=master?.locationId || "";
    if (!locationCode) return { ok:false, fallback:false, error:new Error("INVALID_LOCATION") };

    if (location.quantityEditable === true) {
      const quantityResult=await cloudSetQuantity({
        itemKey,
        locationCode,
        quantity:location.quantity,
        note:"品項表單盤點調整 / Điều chỉnh kiểm kê từ biểu mẫu sản phẩm",
        sync:false,
      });
      if (!quantityResult.ok) return quantityResult;
      wrote=true;
    }

    if (location.minimumEditable === true) {
      const minimumResult=await cloudSetMinimum({
        itemKey,
        locationCode,
        minimum:location.minimum,
        sync:false,
      });
      if (!minimumResult.ok) return minimumResult;
      wrote=true;
    }
  }

  const workMaster=inventoryWorkLocation(site,workArea);
  const workLocationCode=workMaster?.code || branchWorkLocationCode(site,workArea);
  const workLocationId=String(workMaster?.id || "");
  const workMinimumInput=root.querySelector('#ingredient-product-form input[name="workMinimum"]');
  if (workLocationCode && workMinimumInput && !workMinimumInput.readOnly && !workMinimumInput.disabled) {
    const workMinimumResult=await cloudSetMinimum({
      itemKey,
      locationCode:workLocationCode,
      minimum:workMinimum,
      sync:false,
    });
    if (!workMinimumResult.ok) return workMinimumResult;
    wrote=true;
  }

  return { ok:true,skipped:!wrote };
}

function render() {
  const context = currentContext();
  const active = route();
  const pages = { dashboard, inventory, procurement: procurementPage, reservations: reservationsPage, preparation: preparationPage, menu: management.menuPage, sop: management.sopPage, skills: management.skillsPage, attendance: management.attendancePage, schedule: management.schedulePage, reports: management.reportsPage, remote: management.remotePage, settings: settingsPage };
  document.documentElement.lang = context.language === "zh" ? "zh-Hant" : "vi";
  document.title = `${context.text[active]} · 食徒 Kitchen OS`;
  const mobileMenu = view.mobileMenuOpen ? `<div class="mobile-menu-backdrop" data-action="close-mobile-menu"><nav class="mobile-menu" aria-label="${escapeHtml(context.language === "zh" ? "全部功能" : "Tất cả chức năng")}"><div class="mobile-menu-heading"><strong>${escapeHtml(context.language === "zh" ? "全部功能" : "Tất cả chức năng")}</strong><button class="icon-button" data-action="close-mobile-menu" aria-label="${escapeHtml(context.text.cancel)}">${icon("close")}</button></div><div class="mobile-menu-grid">${ROUTES.map((key) => navItem(key, active, context.text)).join("")}</div></nav></div>` : "";
  const sidebarMarkup = sidebar(context, active);
  const topbarMarkup = topbar(context);
  const pageMarkup = `<main class="page-content">${pages[active](context)}</main>`;
  const mobileNavMarkup = `<nav class="mobile-nav">${ROUTES.map((key) => navItem(key, active, context.text)).join("")}</nav>`;
  const overlaysMarkup = `${mobileMenu}${view.modal === "add-item" ? addItemModal(context) : ""}${view.managementModal ? management.managementModal(context) : ""}${route()==="inventory" ? inventoryProductDetailOverlay(context,context.record) : ""}`;
  if (typeof root.renderSections === "function") {
    root.renderSections({ sidebar: sidebarMarkup, topbar: topbarMarkup, page: pageMarkup, mobileNav: mobileNavMarkup, overlays: overlaysMarkup });
  } else root.innerHTML = `<div class="app-shell">${sidebarMarkup}<div class="main-shell">${topbarMarkup}${pageMarkup}</div>${mobileNavMarkup}</div>${overlaysMarkup}`;
  applyAccountEditState();
  syncReceiveZoneOptions(root.querySelector('[data-form="add-item"],[data-form="edit-item"]'));
  watchInventoryEditor(root.querySelector('#ingredient-product-form'));
  const inventorySearchInput = root.querySelector('[data-field="inventorySearch"]');
  const inventorySearchNeedle = prepareSearchNeedle(inventorySearchInput?.value || "");
  if (inventorySearchInput && inventorySearchNeedle) applyInventorySearchDom(inventorySearchInput);
  const opsHost=root.querySelector("[data-branch-inventory-operations]");
  const historyHost=root.querySelector("[data-branch-inventory-history]");
  if (historyHost && inventoryCloudState()==="ready") {
    const site=historyHost.dataset.site;
    void getCloudInventoryHistory(site,300).then((rows)=>{
      if (!historyHost.isConnected) return;
      historyHost.innerHTML=branchInventoryHistoryView(rows,context.language,true);
    }).catch(()=>{});
  }
  if (opsHost && inventoryCloudState()==="ready") {
    const site=opsHost.dataset.site;
    void mountInventoryOperations(opsHost,{
      site,
      mode:opsHost.dataset.mode,
      language:context.language,
      initialSearch:view.search,
      onSearchChange:(query)=>{ view.search=query; },
      onUpdated:()=>{ void syncInventoryNow(site,{reloadBranch:false}); },
    });
  }
}

function renderWhenAuthorized() {
  if (document.documentElement.dataset.vpsAuthReady !== "true") return;
  if (!accountSession()) {
    root.replaceChildren();
    return;
  }
  render();
}

function selectServiceDate(date) {
  const sameDate = store.getState().selectedDate === date;
  store.selectDate(date);
  if (sameDate) renderWhenAuthorized();
  if (date === formatDateKey() && route() === "inventory") {
    void syncInventoryNow(activeInventorySite(), { reloadBranch: false });
  }
}

const management = createManagement({ store, view, root, icon, heading, cardHeading, escapeHtml, workAreaLabel, zoneLabel, compactNumber, render, workAreas: operationalWorkAreas });

root.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const state = store.getState();
  const action = target.dataset.action;
  const requiredEditModule = MANAGEMENT_ACTION_EDIT_MODULE[action];
  if (requiredEditModule && !accountCan(requiredEditModule, "edit")) {
    event.preventDefault();
    return;
  }
  if (action === "procurement-toggle-closed" && !accountCan("procurement", "edit")) return;
  if (action === "reset" && !accountCan("settings", "edit")) return;
  if (management.handleClick(target, event, currentContext())) return;

  if (action === "toggle-mobile-menu") { view.mobileMenuOpen = !view.mobileMenuOpen; render(); return; }
  if (action === "close-mobile-menu" && (target === event.target || target.closest(".icon-button"))) { view.mobileMenuOpen = false; render(); return; }
  if (action === "shift-date") { view.calendarOpen = false; selectServiceDate(shiftDate(state.selectedDate, Number(target.dataset.offset))); }
  if (action === "select-date" || action === "calendar-select-day") { view.calendarOpen = false; selectServiceDate(target.dataset.date); }
  if (action === "toggle-calendar") {
    const selected = new Date(`${state.selectedDate}T12:00:00`);
    view.calendarOpen = !view.calendarOpen;
    view.calendarMonth = selected.getMonth();
    view.calendarYear = selected.getFullYear();
    render();
  }
  if (action === "calendar-nav-month") {
    const current = new Date(view.calendarYear, view.calendarMonth + Number(target.dataset.offset), 1);
    view.calendarMonth = current.getMonth();
    view.calendarYear = current.getFullYear();
    render();
  }
  if (action === "calendar-shortcut") {
    const today = formatDateKey();
    const dates = {
      "previous-month": shiftMonth(state.selectedDate, -1),
      yesterday: shiftDate(today, -1),
      today,
      tomorrow: shiftDate(today, 1),
      "next-month": shiftMonth(state.selectedDate, 1),
    };
    view.calendarOpen = false;
    selectServiceDate(dates[target.dataset.shortcut]);
  }
  if (action === "toggle-language") store.updateSetting("language", state.settings.language === "vi" ? "zh" : "vi");
  if (action === "set-language") store.updateSetting("language", target.dataset.language);
  if (action === "select-inventory-view") { view.inventoryView = target.dataset.view; view.search = ""; render(); }
  if (action === "clear-inventory-search") {
    const page = target.closest(".page-content") || root;
    const input = page.querySelector('[data-field="inventorySearch"]');
    if (input) {
      input.value = "";
      applyInventorySearchDom(input);
      input.focus({ preventScroll:true });
    } else {
      view.search = "";
      render();
    }
    return;
  }
  if (action === "inventory-go-today") {
    view.inventoryOpsMode = "overview";
    selectServiceDate(formatDateKey());
    return;
  }
  if (action === "select-inventory-alert-filter") {
    view.inventoryAlertFilter = ["all","empty","low","near"].includes(target.dataset.filter) ? target.dataset.filter : "all";
    render();
    return;
  }
  if (action === "select-inventory-ops") {
    view.inventoryOpsMode = target.dataset.mode || "overview";
    if (target.dataset.switchToToday === "true") {
      selectServiceDate(formatDateKey());
      return;
    }
    render();
  }
  if (action === "open-inventory-detail") { view.inventoryDetailStockKey = target.dataset.stockKey || ""; render(); return; }
  if (action === "close-inventory-detail") { view.inventoryDetailStockKey = null; render(); return; }
  if (action === "select-work-area") { view.workArea = target.dataset.area; render(); }
  if (action === "select-zone") { view.zone = target.dataset.zone; render(); }
  if (action === "select-task-filter") { view.taskFilter = target.dataset.filter; render(); }
  if (action === "procurement-toggle-closed") store.toggleProcurementClosedDay(target.dataset.category, target.dataset.day);
  if (action === "adjust-item") {
    const site=activeInventorySite();
    const item = inventoryControlItem(target,branchInventoryMutationRecord(state,site),"item");
    if (item && canInventoryAction("inventory.quantity.adjust_quick",{
      site,locationId:item.cloudLocationId
    })) {
      const delta = Number(target.dataset.delta);
      queueBranchQuickAdjustment({site,item,kind:"item",delta});
    }
  }
  if (action === "adjust-work-item") {
    const site=activeInventorySite();
    const item = inventoryControlItem(target,branchInventoryMutationRecord(state,site),"workItem");
    if (item && canInventoryAction("inventory.quantity.adjust_quick",{
      site,locationId:item.cloudLocationId,workArea:item.workArea
    })) {
      const delta = Number(target.dataset.delta);
      queueBranchQuickAdjustment({site,item,kind:"workItem",delta});
    }
  }
  if (action === "restock-work-item" && !target.disabled) {
    if (!canInventoryEdit()) return;
    const record = authoritativeBranchRecord(state);
    const item = record?.workInventory.find((entry) => entry.id === target.dataset.id);
    if (item) {
      const steps = workRestockTransferPlan(item, record);
      void runCloudTransferPlan(steps, "補工作區 / Bổ sung khu làm việc");
    }
  }
  if (action === "restock-storage-item" && !target.disabled) {
    if (!canInventoryEdit()) return;
    const record = authoritativeBranchRecord(state);
    const item = record?.inventory.find((entry) => entry.id === target.dataset.id);
    if (item) {
      const steps = storageRestockTransferPlan(item, record);
      void runCloudTransferPlan(steps, "儲位補貨 / Bổ sung vị trí kho");
    }
  }
  if (action === "inventory-edit-sql-pending") {
    target.disabled = true;
    void refreshInventoryCloudState().then((ready) => {
      target.disabled = false;
      if (ready && canManageBranchCatalog(activeInventorySite())) {
        view.editingStockKey = target.dataset.stockKey || null;
        view.modal = "add-item";
        render();
        return;
      }
      const isVps = accountSession()?.provider === "vps";
      window.alert(state.settings.language === "zh"
        ? (isVps ? "目前無法連線 VPS 資料庫，請檢查 VPS/API 狀態後再試。" : "目前無法確認 SQL schema v11 連線，請檢查網路後再試。")
        : (isVps ? "Chưa kết nối được VPS database. Hãy kiểm tra VPS/API rồi thử lại." : "Chưa xác nhận được kết nối SQL schema v11. Hãy kiểm tra mạng rồi thử lại."));
    });
    return;
  }
  if (action === "open-add-item") {
    const site=activeInventorySite();
    if (!canInventoryAction("inventory.product.create",{site})) return;
    view.editingStockKey = null; view.modal = "add-item"; render();
  }
  if (action === "open-edit-item") {
    const site=activeInventorySite();
    const canEditProduct=[
      "inventory.product.identity.edit","inventory.product.unit.edit","inventory.product.category.edit",
      "inventory.product.location.attach","inventory.product.location.detach",
      "inventory.product.primary_location.edit","inventory.work_area.edit","inventory.receive_default.edit"
    ].some((key)=>canInventoryAction(key,{site}));
    if (!canEditProduct) return;
    view.editingStockKey = target.dataset.stockKey; view.modal = "add-item"; render();
  }
  if (action === "delete-item" && canInventoryAction("inventory.product.archive",{site:activeInventorySite()}) && window.confirm(translate(state.settings.language).deleteConfirm)) {
    const stockKey = target.dataset.stockKey;
    void cloudArchiveBranchItem(stockKey,activeInventorySite()).then((result) => {
      if (result.ok) {
        store.removeIngredient(stockKey);
        return;
      }
      const message = result.error?.message === "ITEM_HAS_STOCK"
        ? "Không thể xóa mặt hàng khi vẫn còn tồn kho. Hãy điều chỉnh về 0 trước. · 品項仍有庫存，請先盤點調整為 0。"
        : "Không thể xóa mặt hàng khỏi dữ liệu cloud. · 無法從雲端刪除品項。";
      window.alert(message);
      void syncInventoryNow(activeInventorySite(), { reloadBranch: true });
    });
  }
  if (action === "close-modal" && (target === event.target || target.closest(".icon-button"))) { view.modal = null; view.editingStockKey = null; render(); }
  if (action === "reset" && window.confirm(translate(state.settings.language).resetConfirm)) store.reset();
});

// Capture changes before feature overlays or compatibility layers can stop
// bubbling. Inventory controls are rendered inside the stable app root and
// must always reach the PostgreSQL mutation handler.
root.addEventListener("change", (event) => {
  const element = event.target;
  const state = store.getState();
  if(element.matches?.('input[name="zones"]')){
    syncReceiveZoneOptions(element.closest("form"));
    return;
  }
  const { field, key, id } = element.dataset;
  if (!field) return;
  const requiredEditModule = FIELD_EDIT_MODULE[field];
  if (requiredEditModule && !accountCan(requiredEditModule, "edit")) {
    render();
    return;
  }
  if (field === "task" && route() === "dashboard" && !accountCan("dashboard", "edit")) {
    render();
    return;
  }
  if (["payroll", "menu-staff", "training-status", "skill-status", "skills-staff", "sop-photos", "inspection-photo", "schedule-month", "schedule-shift", "report-scope", "report-target", "report-category", "report-from", "report-to"].includes(field)) { void management.handleChange(element); return; }
  if (field === "reservation") store.updateReservation(key, element.value);
  if (field === "remaining") store.updateRemaining(key, element.value);
  if (field === "riceRemaining") store.updateRice(element.value);
  if (field === "procurement") store.updateProcurementLine(id, key, element.value);
  if (field === "procurementOrderDate") store.updateProcurementOrderDate(element.dataset.category, element.value);
  if (field === "item") {
    const site = activeInventorySite();
    const record = branchInventoryMutationRecord(state,site);
    const item = inventoryControlItem(element,record,"item");
    if (!item) return;
    if (key === "quantity" && !canInventoryAction("inventory.quantity.set_absolute",{
      site,locationId:item.cloudLocationId
    })) { render(); return; }
    if (key === "minimum" && !canInventoryAction("inventory.minimum.edit",{
      site,locationId:item.cloudLocationId
    })) { render(); return; }
    if (key === "zone" && !(
      canInventoryAction("inventory.product.location.detach",{site,locationId:item.cloudLocationId})
      && canInventoryAction("inventory.product.location.attach",{site})
    )) { render(); return; }
    if (key === "workArea" && !canInventoryAction("inventory.work_area.edit",{
      site,workArea:String(element.value || "")
    })) { render(); return; }
    if (key === "zone") {
      const previousZone = String(item.zone || "");
      const nextZone = String(element.value || "");
      if (!previousZone || !nextZone || previousZone === nextZone) { render(); return; }
      const sourceLocationCode = branchLocationCode(site,previousZone);
      const destinationLocationCode = branchLocationCode(site,nextZone);
      if (!sourceLocationCode || !destinationLocationCode) { render(); return; }
      element.disabled = true;
      void cloudRelocateStorage({
        itemKey:branchItemKey(site,item.stockKey),
        sourceLocationCode,
        destinationLocationCode,
        note:"儲位移動 / Chuyển vị trí lưu",
      }).then((result) => {
        if (result.ok) {
          window.shituNotify?.({type:"success",title:"Đã lưu vị trí cất · 儲位已儲存",body:"Database và giao diện đã được đồng bộ. · 資料庫與畫面已同步。"});
          return;
        }
        window.alert(
          result.error?.message === "SOURCE_STORAGE_NOT_CONFIGURED"
            ? "Vị trí nguồn không còn trong database. Dữ liệu sẽ được tải lại. · 來源儲位已不在資料庫，系統將重新載入。"
            : "Không thể chuyển vị trí trong database. Dữ liệu đã được giữ nguyên. · 無法在資料庫中移動儲位，原資料已保留。"
        );
        void syncInventoryNow(site,{reloadBranch:false});
        render();
      });
      return;
    }
    if (key === "workArea") {
      const previousArea = String(item.workArea || "");
      const nextArea = String(element.value || "");
      if (!previousArea || !nextArea || previousArea === nextArea) { render(); return; }
      const workItem = record.workInventory.find((entry) => entry.stockKey === item.stockKey);
      if (workItem) {
        const sourceLocationCode = branchWorkLocationCode(site,previousArea);
        const destinationLocationCode = branchWorkLocationCode(site,nextArea);
        if (!sourceLocationCode || !destinationLocationCode) { render(); return; }
        element.disabled = true;
        void cloudRelocateWorkArea({
          itemKey:branchItemKey(site,item.stockKey),
          sourceLocationCode,
          destinationLocationCode,
          note:"工作區移動 / Chuyển khu làm việc",
        }).then((result) => {
          if (result.ok) {
            window.shituNotify?.({type:"success",title:"Đã lưu khu làm việc · 工作區已儲存",body:"Database và giao diện đã được đồng bộ. · 資料庫與畫面已同步。"});
            return;
          }
          window.alert(workAreaMutationErrorMessage(result.error));
          void syncInventoryNow(site,{reloadBranch:false,force:true});
        });
        return;
      }
    }
    if (key === "quantity") {
      const next = Math.max(0, Number(element.value) || 0);
      element.disabled = true;
      void cloudSetQuantity({
        itemId:item.cloudItemId,
        locationId:item.cloudLocationId,
        site,
        itemKey: branchItemKey(site, item.stockKey),
        locationCode: branchLocationCode(site, item.zone),
        quantity: next,
        note: "盤點調整 / Điều chỉnh kiểm kê",
        allowInventoryEditor:true,
        sync:false,
      }).then(async(result) => {
        await syncInventoryNow(site,{reloadBranch:false,force:true});
        if (!result.ok) window.alert("Không lưu được số lượng vào database. · 數量無法儲存至資料庫。");
        else window.shituNotify?.({type:"success",title:"Đã lưu số lượng · 數量已儲存",body:"Database và menu chỉnh sửa đã được đồng bộ. · 資料庫與編輯選單已同步。"});
      });
      return;
    }
    if (key === "minimum") {
      const next = Math.max(0, Number(element.value) || 0);
      element.disabled = true;
      void cloudSetMinimum({
        itemId:item.cloudItemId,
        locationId:item.cloudLocationId,
        site,
        itemKey: branchItemKey(site, item.stockKey),
        locationCode: branchLocationCode(site, item.zone),
        minimum: next,
        sync:false,
      }).then(async(result) => {
        await syncInventoryNow(site,{reloadBranch:false,force:true});
        if (!result.ok) window.alert("Không lưu được định mức vào database. · 標準量無法儲存至資料庫。");
        else window.shituNotify?.({type:"success",title:"Đã lưu định mức · 標準量已儲存",body:"Database và menu chỉnh sửa đã được đồng bộ. · 資料庫與編輯選單已同步。"});
      });
      return;
    }
    const previous = item[key];
    store.updateItem(id, key, element.value);
    void cloudSyncBranchCatalogItem(item.stockKey,activeInventorySite()).then((result) => {
      if (!result.ok) {
        store.updateItem(id, key, previous);
        void syncInventoryNow(activeInventorySite(), { reloadBranch: true });
        return;
      }
      window.shituNotify?.({type:"success",title:"Đã lưu nguyên liệu · 品項已儲存",body:"Database và giao diện đã được đồng bộ. · 資料庫與畫面已同步。"});
    });
  }
  if (field === "workItem") {
    const site = activeInventorySite();
    const item = inventoryControlItem(element,branchInventoryMutationRecord(state,site),"workItem");
    if (!item) return;
    if (key === "quantity" && !canInventoryAction("inventory.quantity.set_absolute",{
      site,locationId:item.cloudLocationId,workArea:item.workArea
    })) { render(); return; }
    if (key === "minimum" && !canInventoryAction("inventory.minimum.edit",{
      site,locationId:item.cloudLocationId,workArea:item.workArea
    })) { render(); return; }
    if (key === "workArea" && !canInventoryAction("inventory.work_area.edit",{
      site,workArea:String(element.value || "")
    })) { render(); return; }
    if (key === "workArea") {
      const previousArea = String(item.workArea || "");
      const nextArea = String(element.value || "");
      if (!previousArea || !nextArea || previousArea === nextArea) { render(); return; }
      const sourceLocationCode = branchWorkLocationCode(site,previousArea);
      const destinationLocationCode = branchWorkLocationCode(site,nextArea);
      if (!sourceLocationCode || !destinationLocationCode) { render(); return; }
      element.disabled = true;
      void cloudRelocateWorkArea({
        itemKey:branchItemKey(site,item.stockKey),
        sourceLocationCode,
        destinationLocationCode,
        note:"工作區移動 / Chuyển khu làm việc",
      }).then((result) => {
        if (result.ok) {
          window.shituNotify?.({type:"success",title:"Đã lưu khu làm việc · 工作區已儲存",body:"Database và giao diện đã được đồng bộ. · 資料庫與畫面已同步。"});
          return;
        }
        window.alert(workAreaMutationErrorMessage(result.error));
        void syncInventoryNow(site,{reloadBranch:false,force:true});
      });
      return;
    }
    if (key === "quantity") {
      const next = Math.max(0, Number(element.value) || 0);
      element.disabled = true;
      void cloudSetQuantity({
        itemId:item.cloudItemId,
        locationId:item.cloudLocationId,
        site,
        itemKey: branchItemKey(site, item.stockKey),
        locationCode: branchWorkLocationCode(site, item.workArea),
        quantity: next,
        note: "工作區盤點調整 / Điều chỉnh kiểm kê khu làm việc",
        sync:false,
      }).then(async(result) => {
        await syncInventoryNow(site,{reloadBranch:false,force:true});
        if (!result.ok) window.alert("Không lưu được số lượng khu làm việc vào database. · 工作區數量無法儲存至資料庫。");
        else window.shituNotify?.({type:"success",title:"Đã lưu số lượng · 數量已儲存",body:"Database và menu chỉnh sửa đã được đồng bộ. · 資料庫與編輯選單已同步。"});
      });
      return;
    }
    if (key === "minimum") {
      const next = Math.max(0, Number(element.value) || 0);
      element.disabled = true;
      void cloudSetMinimum({
        itemId:item.cloudItemId,
        locationId:item.cloudLocationId,
        site,
        itemKey: branchItemKey(site, item.stockKey),
        locationCode: branchWorkLocationCode(site, item.workArea),
        minimum: next,
        sync:false,
      }).then(async(result) => {
        await syncInventoryNow(site,{reloadBranch:false,force:true});
        if (!result.ok) window.alert("Không lưu được định mức khu làm việc vào database. · 工作區標準量無法儲存至資料庫。");
        else window.shituNotify?.({type:"success",title:"Đã lưu định mức · 標準量已儲存",body:"Database và menu chỉnh sửa đã được đồng bộ. · 資料庫與編輯選單已同步。"});
      });
      return;
    }
    const previous = item[key];
    store.updateWorkItem(id, key, element.value);
    void cloudSyncBranchCatalogItem(item.stockKey,activeInventorySite()).then((result) => {
      if (!result.ok) {
        store.updateWorkItem(id, key, previous);
        void syncInventoryNow(activeInventorySite(), { reloadBranch: true });
        return;
      }
      window.shituNotify?.({type:"success",title:"Đã lưu nguyên liệu · 品項已儲存",body:"Database và giao diện đã được đồng bộ. · 資料庫與畫面已同步。"});
    });
  }
  if (field === "calendarMonth") { view.calendarMonth = Number(element.value); render(); }
  if (field === "calendarYear") { view.calendarYear = Number(element.value); render(); }
  if (field === "setting") store.updateSetting(key, element.value);
  if (field === "task") store.toggleTask(id);
}, true);

const inventorySearchCorpusCache = new WeakMap();

function inventoryRowSearchCorpus(row) {
  if (inventorySearchCorpusCache.has(row)) return inventorySearchCorpusCache.get(row);
  const corpus = row.dataset.inventorySearchCorpus || prepareSearchCorpus(row.textContent || "");
  inventorySearchCorpusCache.set(row, corpus);
  return corpus;
}

function inventoryProductIdentitySearchText(record, stockKey, site=activeInventorySite()) {
  if (!record || !stockKey) return "";
  const products=inventoryProductModels(record,site);
  const product=products.find((entry)=>String(entry.stockKey||"")===String(stockKey||""));
  return product ? inventoryProductSearchText(product,site) : "";
}

function primeInventoryRowSearchCorpus(row, record, site=activeInventorySite()) {
  if (!row || inventorySearchCorpusCache.has(row)) return;
  const stockKey=String(row.dataset.stockKey || row.dataset.inventoryStockKey || "");
  const productText=inventoryProductIdentitySearchText(record,stockKey,site);
  if (!productText) return;
  inventorySearchCorpusCache.set(row,prepareSearchCorpus([
    row.dataset.inventorySearchCorpus || row.textContent || "",
    productText,
  ].join(" ")));
}

function applyInventorySearchDom(input) {
  if (!input?.isConnected) return;
  const query = input.value || "";
  const needle = prepareSearchNeedle(query);
  view.search = query;

  const page = input.closest(".page-content") || root;
  const table = page.querySelector(".inventory-table");
  if (!table) return;
  const itemsLabel = currentContext().text.items;
  const language = document.documentElement.lang.startsWith("zh") ? "zh" : "vi";
  const totalRows = table.querySelectorAll(".inventory-row").length;
  const site=activeInventorySite();
  const record=authoritativeBranchRecord(store.getState());

  let visibleTotal = 0;
  table.querySelectorAll(".inventory-group").forEach((group) => {
    let visibleInGroup = 0;
    group.querySelectorAll(".inventory-row").forEach((row) => {
      primeInventoryRowSearchCorpus(row,record,site);
      const visible = !needle || preparedSearchMatches(inventoryRowSearchCorpus(row), needle);
      row.hidden = !visible;
      row.toggleAttribute("data-search-hidden", !visible);
      if (visible) visibleInGroup += 1;
    });
    group.hidden = visibleInGroup === 0;
    group.toggleAttribute("data-search-hidden", visibleInGroup === 0);
    visibleTotal += visibleInGroup;

    const count = group.querySelector(".inventory-group-heading span");
    if (count) count.textContent = `${visibleInGroup} ${itemsLabel}`;
  });

  const looseRows = [...table.querySelectorAll(":scope > .inventory-row")];
  looseRows.forEach((row) => {
    primeInventoryRowSearchCorpus(row,record,site);
      const visible = !needle || preparedSearchMatches(inventoryRowSearchCorpus(row), needle);
    row.hidden = !visible;
    row.toggleAttribute("data-search-hidden", !visible);
    if (visible) visibleTotal += 1;
  });

  const empty = table.querySelector("[data-inventory-search-empty]");
  if (empty) empty.hidden = !needle || visibleTotal > 0;

  const control = input.closest("[data-inventory-search-control]");
  const clear = control?.querySelector("[data-action='clear-inventory-search']");
  if (clear) clear.hidden = !query;
  const meta = control?.querySelector("[data-inventory-search-meta]");
  if (meta) {
    meta.textContent = language === "zh"
      ? (needle ? `${visibleTotal} / ${totalRows} 筆` : `${totalRows} 筆`)
      : (needle ? `${visibleTotal} / ${totalRows} kết quả` : `${totalRows} sản phẩm`);
  }
}

function handleInventorySearchEvent(event) {
  const input = event.target;
  if (input?.dataset?.field !== "inventorySearch") return;
  if (event.isComposing) return;
  applyInventorySearchDom(input);
}

root.addEventListener("input", handleInventorySearchEvent);
root.addEventListener("search", handleInventorySearchEvent);
root.addEventListener("compositionend", (event) => {
  if (event.target?.dataset?.field === "inventorySearch") applyInventorySearchDom(event.target);
});

root.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const state = store.getState();
  const formName = form.dataset.form || "";
  const requiredEditModule = FORM_EDIT_MODULE[formName];
  if (requiredEditModule && !accountCan(requiredEditModule, "edit")) return;
  const data = new FormData(form);
  if (management.handleSubmit(form, data)) return;
  if (form.dataset.form === "save-general-settings") {
    const current = store.getState().settings;
    const input = Object.fromEntries(["organizationName", "branchName", "employeeName", "workstation", "reservationBuffer", "riceWeekday", "riceWeekend", "riceSkipAbove"].map((key) => [key, data.get(key)]));
    const normalizedShared = {
      organizationName: String(input.organizationName ?? "").trim(),
      branchName: String(input.branchName ?? "").trim(),
      reservationBuffer: Math.max(0, Number(input.reservationBuffer) || 0),
      riceWeekday: Math.max(0, Number(input.riceWeekday) || 0),
      riceWeekend: Math.max(0, Number(input.riceWeekend) || 0),
      riceSkipAbove: Math.max(0, Number(input.riceSkipAbove) || 0),
    };
    const sharedChanged = Object.entries(normalizedShared).some(([key, value]) => current[key] !== value);
    const personalChanged = String(input.employeeName ?? "").trim() !== current.employeeName || String(input.workstation ?? "").trim() !== current.workstation;
    view.settingsSaveStatus = sharedChanged ? "pending" : personalChanged ? "local" : "unchanged";
    store.saveGeneralSettings(input);
    if (!sharedChanged) renderWhenAuthorized();
    return;
  }
  if (form.dataset.form === "add-task") {
    const title = String(data.get("title") ?? "").trim();
    const assigneeId = String(data.get("assigneeId") ?? "");
    const assignee = store.getState().operations.staff.find((member) => member.id === assigneeId);
    if (title) store.addTask({ title, quantity: data.get("quantity"), area: data.get("area"), assigneeId, assigneeName: assignee?.name || "", dueAt: data.get("dueAt") });
  }
  if (["add-item", "edit-item"].includes(form.dataset.form)) {
    const site = activeInventorySite();
    const requiredCatalogAction=form.dataset.form==="add-item"
      ? "inventory.product.create"
      : "inventory.product.identity.edit";
    if (!canInventoryAction(requiredCatalogAction,{site})
        && !canManageBranchCatalog(site)) { view.modal = null; render(); return; }
    const inventoryRecord = branchInventoryMutationRecord(state,site);
    const locations = data.getAll("zones").map((zone,index) => {
      const zoneKey=String(zone);
      const quantityInput=form.elements.namedItem(`quantity:${zoneKey}`);
      const minimumInput=form.elements.namedItem(`minimum:${zoneKey}`);
      return {
        zone:zoneKey,
        quantity:Number(data.get(`quantity:${zoneKey}`)),
        minimum:Number(data.get(`minimum:${zoneKey}`)),
        displayOrder:Number(data.get(`displayOrder:${zoneKey}`) ?? index),
        quantityEditable:Boolean(quantityInput && !quantityInput.readOnly && !quantityInput.disabled),
        minimumEditable:Boolean(minimumInput && !minimumInput.readOnly && !minimumInput.disabled),
      };
    });
    if (!locations.length) {
      window.alert("Hãy chọn ít nhất một vị trí lưu. · 請至少選擇一個存放位置。");
      return;
    }
    const stockKey = view.editingStockKey;
    const existingItem=stockKey ? inventoryRecord?.inventory.find((entry)=>entry.stockKey===stockKey) : null;
    const receiveZone=String(data.get("receiveZone")||"");
    if(receiveZone && !locations.some((entry)=>entry.zone===receiveZone)){
      window.alert("Vị trí nhận cố định phải là một vị trí đang được chọn cho nguyên liệu. · 固定收貨儲位必須是此食材已勾選的存放位置。");
      return;
    }
    const label=String(data.get("label") ?? "").trim();
    const catalogKey=existingItem?.catalogKey || inventoryCatalogKey(label);
    const requestedPrimary=String(data.get("primaryZone") || "");
    const primaryZone=locations.some((entry)=>entry.zone===requestedPrimary)
      ? requestedPrimary
      : locations[0]?.zone || "";
    const item = {
      label,
      labelVi: String(data.get("labelVi") ?? "").trim(),
      catalogKey,
      receiveZone,
      categoryCode:String(data.get("categoryCode") || "").trim(),
      workArea: String(data.get("workArea")),
      unit: String(data.get("unit") || "").trim(),
      unitCode:String(data.get("unit") || "").trim(),
      primaryZone,
      workMinimum: Number(data.get("workMinimum")),
      workMinimumEditable:Boolean(
        form.elements.namedItem("workMinimum")
        && !form.elements.namedItem("workMinimum").readOnly
        && !form.elements.namedItem("workMinimum").disabled
      ),
      storageOnly: Boolean(existingItem?.storageOnly),
      locations,
    };
    const existingRows = stockKey
      ? inventoryRecord.inventory.filter((entry) => entry.stockKey === stockKey)
      : [];
    const selectedZones = new Set(locations.map((entry) => entry.zone));
    const existingZones = new Set(existingRows.map((entry) => entry.zone));
    const removedLocations = existingRows.filter((entry) => !selectedZones.has(entry.zone));
    const addedLocations = locations.filter((entry) => !existingZones.has(entry.zone));
    const protectedRemovedLocations = removedLocations.filter((entry) =>
      Number(entry.quantity || 0) > 0 || Number(entry.minimum || 0) > 0
    );
    let storageRelocation = null;
    if (protectedRemovedLocations.length) {
      if (removedLocations.length !== 1 || addedLocations.length !== 1) {
        window.alert("Khi vị trí cũ còn tồn/định mức, hãy đổi một vị trí cũ sang đúng một vị trí mới trong mỗi lần lưu để hệ thống chuyển dữ liệu an toàn. · 舊儲位仍有庫存／標準量時，每次請只將一個舊儲位改為一個新儲位，以便安全移動資料。");
        return;
      }
      const source = removedLocations[0];
      const destination = addedLocations[0];
      destination.quantity = Number(source.quantity || 0);
      destination.minimum = Math.max(Number(destination.minimum || 0),Number(source.minimum || 0));
      storageRelocation = { sourceZone:source.zone, destinationZone:destination.zone };
    }
    const existingWorkItem = stockKey
      ? inventoryRecord.workInventory.find((entry) => entry.stockKey === stockKey)
      : null;
    const previousWorkArea = String(existingWorkItem?.workArea || existingItem?.workArea || "");
    const workAreaChanged = Boolean(existingWorkItem && previousWorkArea && previousWorkArea !== item.workArea);
    if (storageRelocation && workAreaChanged) {
      window.alert("Để tránh lưu dở dang, hãy đổi khu cất và khu làm việc thành hai lần lưu riêng. · 為避免部分儲存，請分兩次變更儲位與工作區。");
      return;
    }
    if (form.dataset.saving === "true") return;
    form.dataset.saving = "true";
    const saveButtons = form.closest(".ingredient-modal")?.querySelectorAll("[data-save-item]") || [];
    const saveButtonLabels = new Map([...saveButtons].map((button) => [button,button.textContent]));
    const restoreSaveButtons = () => {
      form.dataset.saving = "false";
      for (const button of saveButtons) { button.disabled=false; button.textContent=saveButtonLabels.get(button); }
    };
    for (const button of saveButtons) {
      button.disabled = true;
      button.textContent = "Đang lưu vào database… · 正在儲存…";
    }
    if (form.dataset.form === "edit-item") {
      if (storageRelocation) {
        const relocation = await cloudRelocateStorage({
          itemKey:branchItemKey(site,stockKey),
          sourceLocationCode:branchLocationCode(site,storageRelocation.sourceZone),
          destinationLocationCode:branchLocationCode(site,storageRelocation.destinationZone),
          note:"品項儲位變更 / Đổi vị trí cất của nguyên liệu",
          sync:false,
        });
        if (!relocation.ok) {
          restoreSaveButtons();
          window.alert("Không thể chuyển vị trí cất trong database; biểu mẫu vẫn được giữ để kiểm tra. · 儲位無法在資料庫中移動，表單已保留供檢查。");
          await syncInventoryNow(site,{reloadBranch:false,force:true});
          return;
        }
      }
      if (workAreaChanged) {
        const relocation = await cloudRelocateWorkArea({
          itemKey:branchItemKey(site,stockKey),
          sourceLocationCode:branchWorkLocationCode(site,previousWorkArea),
          destinationLocationCode:branchWorkLocationCode(site,item.workArea),
          note:"品項工作區變更 / Đổi khu làm việc của nguyên liệu",
          sync:false,
        });
        if (!relocation.ok) {
          restoreSaveButtons();
          window.alert(workAreaMutationErrorMessage(relocation.error));
          await syncInventoryNow(site,{reloadBranch:false,force:true});
          return;
        }
      }
      const result = await cloudSyncBranchCatalogItem(stockKey, site, { sync:false, draft:item });
      if (result.ok) {
        const stockResult=await persistCatalogStocktakeFields({
          site,
          stockKey,
          locations,
          workArea:item.workArea,
          workMinimum:item.workMinimum,
        });
        const receiveResult = stockResult.ok && canManageReceiveDefault(site)
          ? await cloudSetReceiveDefault({
              site,
              catalogKey,
              locationCode:receiveZone ? branchLocationCode(site,receiveZone) : "",
            })
          : {ok:stockResult.ok,skipped:true};
        view.modal = null;
        view.editingStockKey = null;
        await syncInventoryNow(site, { reloadBranch: false, force:true });
        if (!stockResult.ok) {
          window.alert("Thông tin sản phẩm đã lưu, nhưng tồn kho/định mức chưa lưu hoàn tất. Dữ liệu thật từ database đã được tải lại; hãy kiểm tra và thử lại phần tồn kho. · 品項資料已儲存，但庫存／標準量尚未完整寫入；系統已重新載入資料庫實際資料，請確認後再試。");
        } else if (!receiveResult.ok) {
          window.alert("Sản phẩm đã lưu, nhưng cấu hình vị trí nhận hàng chưa lưu được vào database. Hãy mở lại sản phẩm và thử lưu vị trí nhận. · 品項已儲存，但固定收貨儲位尚未寫入資料庫，請重新開啟品項後再儲存收貨儲位。");
        }
      } else {
        const message = result.error?.message === "LOCATION_HAS_STOCK"
          ? "Không thể bỏ vị trí còn tồn kho hoặc định mức. Hãy chuyển/điều chỉnh tồn và định mức về 0 trước. · 儲位仍有庫存或標準量，請先轉撥／盤點並將標準量設為 0。"
          : "Không thể lưu chỉnh sửa vào database. · 品項修改無法儲存至資料庫。";
        restoreSaveButtons();
        window.alert(message);
      }
    } else {
      const createdStockKey=`custom-${globalThis.crypto?.randomUUID?.() || Date.now().toString(36)}`;
      const result=await cloudSyncBranchCatalogItem(createdStockKey,site,{sync:false,draft:item});
      if(result.ok){
        const stockResult=await persistCatalogStocktakeFields({
          site,
          stockKey:createdStockKey,
          locations,
          workArea:item.workArea,
          workMinimum:item.workMinimum,
        });
        const receiveResult = stockResult.ok && canManageReceiveDefault(site)
          ? await cloudSetReceiveDefault({
              site,
              catalogKey,
              locationCode:receiveZone ? branchLocationCode(site,receiveZone) : "",
            })
          : {ok:stockResult.ok,skipped:true};
        view.modal = null;
        view.editingStockKey = null;
        await syncInventoryNow(site, { reloadBranch: false, force:true });
        if (!stockResult.ok) {
          window.alert("Sản phẩm đã được tạo, nhưng tồn kho/định mức chưa lưu hoàn tất. Dữ liệu thật từ database đã được tải lại; hãy mở sản phẩm và thử lại phần tồn kho. · 品項已建立，但庫存／標準量尚未完整寫入；系統已重新載入資料庫實際資料，請重新開啟品項再試。");
        } else if (!receiveResult.ok) {
          window.alert("Sản phẩm đã lưu, nhưng cấu hình vị trí nhận hàng chưa lưu được vào database. Hãy mở lại sản phẩm và thử lưu vị trí nhận. · 品項已儲存，但固定收貨儲位尚未寫入資料庫，請重新開啟品項後再儲存收貨儲位。");
        }
      }else{
        restoreSaveButtons();
        window.alert("Không thể lưu sản phẩm vào database. · 無法儲存品項至資料庫。");
      }
    }
  }
});

window.addEventListener("hashchange", () => {
  view.calendarOpen = false;
  view.mobileMenuOpen = false;
  const hash = window.location.hash.replace(/^#\/?/, "");
  const [, query = ""] = hash.split("?");
  const params = new URLSearchParams(query);
  const area = params.get("zone");
  if (route() === "sop" && operationalWorkAreas().some((entry) => entry.id === area)) { view.sopArea = area; view.sopSelected = null; }
  if (route() === "sop" && params.get("sop")) view.sopSelected = params.get("sop");
  if (route() === "skills" && operationalWorkAreas().some((entry) => entry.id === area)) view.skillsArea = area;
  if (route() === "skills" && ["overview", "catalog", "assessment"].includes(params.get("panel"))) view.skillsPanel = params.get("panel");
  renderWhenAuthorized();
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && view.inventoryDetailStockKey) { view.inventoryDetailStockKey = null; render(); return; }
  if (event.key === "Escape" && view.modal) { view.modal = null; view.editingStockKey = null; render(); }
  if (event.key === "Escape" && view.managementModal) { view.managementModal = null; render(); }
  if (event.key === "Escape" && view.calendarOpen) { view.calendarOpen = false; render(); }
  if (event.key === "Escape" && view.mobileMenuOpen) { view.mobileMenuOpen = false; render(); }
});
window.addEventListener("shitu:business-persistence-status", (event) => {
  const modules = Array.isArray(event.detail?.modules) ? event.detail.modules : [];
  if (!modules.includes("settings")) return;
  const status = String(event.detail?.status || "");
  if (!["pending", "saving", "saved", "error"].includes(status)) return;
  view.settingsSaveStatus = status;
  if (route() === "settings") renderWhenAuthorized();
});
window.addEventListener("offline", renderWhenAuthorized);
window.addEventListener("online", () => { if (store.getState().operations.pendingSync) store.clearPendingSync(); else renderWhenAuthorized(); });
window.addEventListener("shitu:auth-synced", renderWhenAuthorized);
window.addEventListener("shitu:auth-expired", renderWhenAuthorized);
window.addEventListener("shitu:vps-auth-ready", renderWhenAuthorized);
window.addEventListener("shitu:active-site-changed", () => {
  taskDerivationCache.clear();
  renderWhenAuthorized();
});
const INVENTORY_REACTIVE_ROUTES = new Set(["dashboard","inventory","procurement","preparation"]);
function inventoryRouteNeedsLiveRender(activeRoute = route()) {
  return INVENTORY_REACTIVE_ROUTES.has(String(activeRoute || ""));
}

window.addEventListener("shitu:inventory-sites-changed", () => {
  taskDerivationCache.clear();
  // Site-registry changes affect Inventory-derived operational pages and the
  // branch label in Settings. Do not replace unrelated interactive workspaces
  // such as Schedule/Workforce while a background Inventory hydration finishes.
  if (inventoryRouteNeedsLiveRender() || route() === "settings") renderWhenAuthorized();
});
window.addEventListener("shitu:inventory-cloud-updated", (event) => {
  // Invalidate derived Inventory tasks for every route so a later navigation
  // never reuses stale replenishment decisions. Rendering is isolated below.
  taskDerivationCache.clear();
  const activeRoute=route();
  if (activeRoute === "inventory" && document.querySelector("[data-central-kitchen-shell]")) return;
  if (!inventoryRouteNeedsLiveRender(activeRoute)) {
    // Inventory realtime is independent from Workforce/Attendance/SOP forms.
    // Re-rendering those pages here can discard an in-progress form between
    // pointer down and submit when Inventory access/master-data hydration returns.
    return;
  }
  const site = activeInventorySite();
  if (event.detail?.site && event.detail.site !== site) return;
  if (activeRoute === "inventory" && view.modal === "add-item" && preserveInventoryEditor(root.querySelector('#ingredient-product-form'))) return;
  renderWhenAuthorized();
});
window.addEventListener("shitu:inventory-cloud-status", (event) => {
  if (event.detail?.status === "synced") return;
  if (route() === "inventory" && !document.querySelector("[data-central-kitchen-shell]")) renderWhenAuthorized();
});
// The former offline worker is retired so every VPS session loads one release.
store.subscribe(renderWhenAuthorized);
renderWhenAuthorized();
