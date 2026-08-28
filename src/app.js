import { localeFor, SECONDARY, translate } from "./i18n.js";
import {
  buildGeneratedTasks,
  buildInventoryAlerts,
  calendarDays,
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
import { createStore, PRIMARY_ZONES, WORK_AREAS, ZONES } from "./store.js";
import { assessShiftCapacity, currentStaff, roleCan, roleLabel } from "./operations.js";
import { createManagement } from "./management.js";

const store = createStore();
const root = document.querySelector("#app");
const view = {
  inventoryView: "storage",
  workArea: "all",
  zone: "all",
  search: "",
  taskFilter: "all",
  modal: null,
  editingStockKey: null,
  calendarOpen: false,
  calendarMonth: null,
  calendarYear: null,
  sopArea: "noodles",
  sopSelected: "sop-handmade-noodles",
  sopService: "dine",
  sopPanel: "standards",
  sopDraft: null,
  sopCreating: false,
  managementModal: null,
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
  sop: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Zm3.5 6h6m-6 4h6",
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
};

const ROUTES = ["dashboard", "inventory", "reservations", "preparation", "sop", "attendance", "schedule", "reports", "remote", "settings"];

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

function zoneLabel(id, language) {
  const zone = ZONES.find((item) => item.id === id);
  return zone ? zone[language] : id;
}

function workAreaLabel(id, language) {
  const area = WORK_AREAS.find((item) => item.id === id);
  return area ? area[language] : id;
}

function itemName(item, language) {
  return language === "zh" ? item.label : item.labelVi || item.label;
}

function itemSecondary(item, language) {
  return language === "zh" ? item.labelVi || "" : item.label;
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

function currentContext() {
  const state = store.getState();
  const record = state.records[state.selectedDate];
  const language = state.settings.language;
  const text = translate(language);
  const reservations = calculateReservations(record.reservation, state.settings.reservationBuffer);
  const rice = calculateRice(state.selectedDate, record.riceRemaining, state.settings);
  const tasks = [...buildGeneratedTasks(state, state.selectedDate), ...record.customTasks];
  const progress = completionSummary(tasks, record.completedTasks);
  const reserves = summarizeReserveInventory(record);
  const alerts = buildInventoryAlerts(record);
  const workAlerts = alerts.filter((item) => item.kind === "work");
  const reserveAlerts = alerts.filter((item) => item.kind === "reserve" || item.kind === "storage");
  const capacity = assessShiftCapacity(state, state.selectedDate, "evening");
  return { state, record, language, text, reservations, rice, tasks, progress, alerts, reserves, workAlerts, reserveAlerts, capacity };
}

function navItem(key, active, text) {
  return `<a class="nav-item ${active === key ? "active" : ""}" href="#${key}" aria-current="${active === key ? "page" : "false"}">${icon(key)}<span>${escapeHtml(text[key])}</span></a>`;
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
  return `<header class="topbar"><div class="topbar-mobile-brand"><span class="brand-mark small">食</span><strong>Kitchen OS</strong></div>
    <div class="date-switcher"><button class="icon-button" data-action="shift-date" data-offset="-1" aria-label="${escapeHtml(text.yesterday)}">${icon("chevronLeft")}</button>
      <button class="date-label" data-action="toggle-calendar" aria-expanded="${view.calendarOpen}" aria-label="${escapeHtml(text.selectDate)}"><span>${escapeHtml(text.serviceDate)}</span><strong>${escapeHtml(dateLabel(state.selectedDate, language))}</strong></button>
      <button class="icon-button" data-action="shift-date" data-offset="1" aria-label="${escapeHtml(text.tomorrow)}">${icon("chevronRight")}</button>${view.calendarOpen ? dateCalendar(context) : ""}</div>
    <div class="topbar-actions">${offline ? `<span class="offline-status" title="${escapeHtml(text.offlineSaved)}">${escapeHtml(text.offline)}</span>` : ""}<button class="language-button" data-action="toggle-language">${language === "vi" ? "中文" : "VI"}</button></div>
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
  return `${heading(text.dashboard, text.overviewSubtitle)}
    <section class="stats-grid">
      ${statCard({ label: text.totalTables, value: reservations.tables, unit: text.tables, note: `${text.lunch}: ${reservations.lunchTables} · ${text.dinner}: ${reservations.dinnerTables} · ${capacity.requiredInside} 內場`, tone: capacity.overloaded ? "red" : "green", iconName: "reservations" })}
      ${statCard({ label: text.lowStock, value: alerts.length, unit: text.items, note: `${workAlerts.length} ${text.workInventory} · ${reserveAlerts.length} ${text.storageInventory}`, tone: hasCriticalAlert ? "red" : alerts.length ? "amber" : "green", iconName: "inventory" })}
      ${statCard({ label: text.pending, value: progress.pending, unit: "", note: `${progress.done}/${progress.total} ${text.completed.toLowerCase()}`, tone: "blue", iconName: "preparation" })}
      ${statCard({ label: text.riceToCook, value: compactNumber(rice.toCook, language), unit: "g", note: `${text.remaining}: ${compactNumber(rice.remaining, language)} g`, tone: "slate", iconName: "bowl" })}
    </section>
    <section class="dashboard-grid"><article class="card preparation-overview">${cardHeading(text.sectionPrep, `<a class="text-link" href="#reservations">${escapeHtml(text.editReservations)} ${icon("arrowRight")}</a>`, `<p>${reservations.tables} ${escapeHtml(text.tables)} + ${reservations.buffer} ${escapeHtml(text.buffer.toLowerCase())}</p>`)}${reservations.portions.map((portion) => portionSummary(portion, context)).join("")}</article>
      <article class="card progress-overview">${cardHeading(text.sectionTasks)}<div class="progress-overview-body">${progressRing(progress)}<div><strong>${progress.done}/${progress.total}</strong><span>${escapeHtml(text.completed)}</span><a class="text-link" href="#preparation">${escapeHtml(text.manage)} ${icon("arrowRight")}</a></div></div></article>
      <article class="card capacity-overview">${cardHeading(language === "zh" ? "訂位連動人力" : "Nhân sự liên kết đặt bàn", `<a class="text-link" href="#schedule">${escapeHtml(text.manage)} ${icon("arrowRight")}</a>`, `<p>${reservations.dinnerTables} ${escapeHtml(text.tables)} · ${capacity.fixedAreas ? (language === "zh" ? "四區固定" : "4 khu cố định") : (language === "zh" ? "可輪調" : "có thể xoay vòng")}</p>`)}<div class="capacity-summary ${capacity.overloaded ? "capacity-overloaded" : "capacity-ready"}"><strong>${capacity.inside.length}/${capacity.requiredInside} 內場</strong><span>${capacity.overloaded ? (language === "zh" ? "超載風險" : "Có nguy cơ quá tải") : (language === "zh" ? "人力足夠" : "Đủ nhân lực")}</span></div><div class="capacity-zones">${["noodles", "soup", "seafood", "meat"].map((area) => `<span class="capacity-zone ${capacity.missingAreas.includes(area) ? "missing" : "ready"}">${escapeHtml(workAreaLabel(area, language))}<small>${capacity.missingAreas.includes(area) ? (language === "zh" ? "缺 SOP 人員" : "Thiếu người đạt SOP") : (language === "zh" ? "已覆蓋" : "Đã bố trí")}</small></span>`).join("")}</div></article>
      <article class="card alert-overview">${cardHeading(text.sectionAlerts, `<a class="text-link" href="#inventory">${escapeHtml(text.updateStock)} ${icon("arrowRight")}</a>`)}${alerts.length ? `<div class="priority-list">${alerts.map((item) => alertRow(item, context)).join("")}</div>` : `<p class="empty-state">${escapeHtml(text.noAlert)}</p>`}</article>
      <article class="card task-overview">${cardHeading(text.sectionTasks)}${openTasks.length ? `<div class="priority-list">${openTasks.map((task) => taskRow(task, context, true)).join("")}</div>` : `<p class="empty-state">${escapeHtml(text.noTasks)}</p>`}</article>
    </section>
    <p class="save-note"><span></span>${escapeHtml(text.autoSaved)} · ${escapeHtml(state.settings.employeeName)}</p>`;
}

function storageSources(item, record, destination = "work") {
  return inventorySources(record, item, destination);
}

function quantityControl(item, kind = "item") {
  const action = kind === "workItem" ? "adjust-work-item" : "adjust-item";
  return `<div class="quantity-control"><button class="quantity-button" data-action="${action}" data-id="${escapeHtml(item.id)}" data-delta="-1" aria-label="Decrease">${icon("minus")}</button>${numberInput(item.quantity, `data-field="${kind}" data-key="quantity" data-id="${escapeHtml(item.id)}"`, "quantity-input")}<button class="quantity-button plus" data-action="${action}" data-id="${escapeHtml(item.id)}" data-delta="1" aria-label="Increase">${icon("plus")}</button><small>${escapeHtml(item.unit)}</small></div>`;
}

function inventoryStatusBadge(item, text) {
  const status = inventoryStatus(item);
  const statusLabel = status === "empty" ? text.outOfStock : status === "low" ? text.lowStock : text.ready;
  return `<div class="inventory-badge"><span class="tag tag-${status}">${escapeHtml(statusLabel)}</span>${status !== "ok" ? `<small>+${inventoryRestock(item)}</small>` : ""}</div>`;
}

function storageInventoryRow(item, context) {
  const { language, text, record } = context;
  const status = inventoryStatus(item);
  const working = record.workInventory.find((entry) => entry.stockKey === item.stockKey);
  const source = item.zone === "large-freezer" ? null : storageSources(item, record, item.zone)[0];
  const canRestock = inventoryRestock(item) > 0 && source;
  return `<article class="inventory-row storage-row"><div class="inventory-item-name"><span class="inventory-status-dot ${status}"></span><div><strong>${escapeHtml(itemName(item, language))}</strong><small>${escapeHtml(itemSecondary(item, language))}</small></div></div>
    <label class="inventory-work-area"><span class="mobile-field-label">${escapeHtml(text.workstation)}</span><select class="inventory-select" data-field="item" data-key="workArea" data-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(text.workstation)}">${WORK_AREAS.map((area) => `<option value="${area.id}" ${item.workArea === area.id ? "selected" : ""}>${escapeHtml(area[language])}</option>`).join("")}</select></label>
    <label class="inventory-zone"><span class="mobile-field-label">${escapeHtml(text.storageLocation)}</span><select class="inventory-select" data-field="item" data-key="zone" data-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(text.storageLocation)}">${ZONES.map((zone) => `<option value="${zone.id}" ${item.zone === zone.id ? "selected" : ""}>${escapeHtml(zone[language])}</option>`).join("")}</select></label>
    <div class="inventory-storage">${quantityControl(item)}<label class="storage-threshold"><span>${escapeHtml(text.reserveMinimum)}</span>${numberInput(item.minimum, `data-field="item" data-key="minimum" data-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(text.reserveMinimum)}"`, "minimum-input")}</label></div><div class="inventory-working"><span class="mobile-field-label">${escapeHtml(text.workingQuantity)}</span><strong>${working?.quantity ?? 0}</strong><small>${escapeHtml(item.unit)}</small></div><div class="inventory-actions">${inventoryStatusBadge(item, text)}${canRestock ? `<button class="inventory-action-button restock-location" data-action="restock-storage-item" data-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(text.transfer)}">${icon("plus")}</button>` : ""}<button class="inventory-action-button" data-action="open-edit-item" data-stock-key="${escapeHtml(item.stockKey)}" aria-label="${escapeHtml(text.editItem)}">${icon("edit")}</button><button class="inventory-action-button delete-action" data-action="delete-item" data-stock-key="${escapeHtml(item.stockKey)}" aria-label="${escapeHtml(text.deleteItem)}">${icon("trash")}</button></div></article>`;
}

function workInventoryRow(item, context) {
  const { language, text, record } = context;
  const status = inventoryStatus(item);
  const sources = storageSources(item, record);
  const source = sources[0];
  const available = sources.reduce((total, entry) => total + entry.quantity, 0);
  const needed = inventoryRestock(item);
  const mainSources = PRIMARY_ZONES.map((zone) => ({
    zone,
    quantity: record.inventory
      .filter((entry) => entry.stockKey === item.stockKey && entry.zone === zone)
      .reduce((total, entry) => total + entry.quantity, 0),
  }));
  return `<article class="inventory-row work-row"><div class="inventory-item-name"><span class="inventory-status-dot ${status}"></span><div><strong>${escapeHtml(itemName(item, language))}</strong><small>${escapeHtml(itemSecondary(item, language))}</small></div></div>
    <label class="inventory-work-area"><span class="mobile-field-label">${escapeHtml(text.workstation)}</span><select class="inventory-select" data-field="workItem" data-key="workArea" data-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(text.workstation)}">${WORK_AREAS.map((area) => `<option value="${area.id}" ${item.workArea === area.id ? "selected" : ""}>${escapeHtml(area[language])}</option>`).join("")}</select></label>
    ${quantityControl(item, "workItem")}<div class="inventory-minimum">${numberInput(item.minimum, `data-field="workItem" data-key="minimum" data-id="${escapeHtml(item.id)}"`, "minimum-input")}<small>${escapeHtml(item.unit)}</small></div>
    <div class="inventory-source"><div class="source-quantities">${mainSources.map((entry) => `<span class="source-quantity ${entry.quantity === 0 ? "source-empty" : ""}" data-source-zone="${entry.zone}">${escapeHtml(entry.zone === "large-freezer" ? text.freezerShort : text.fridgeShort)} <strong>${entry.quantity}</strong></span>`).join("")}</div><small>${escapeHtml(source ? `${text.takeFrom} ${zoneLabel(source.zone, language)}` : text.noSource)}</small></div>
    <div class="inventory-transfer">${needed > 0 ? `<button class="restock-button" data-action="restock-work-item" data-id="${escapeHtml(item.id)}" ${available <= 0 ? "disabled" : ""}>${icon("plus")}${Math.min(needed, available) || needed}</button>` : `<span class="tag tag-ok">${escapeHtml(text.ready)}</span>`}</div></article>`;
}

function inventoryGroups(items, groups, key, context, rowRenderer) {
  return groups.map((group) => {
    const entries = items.filter((item) => item[key] === group.id);
    if (!entries.length) return "";
    return `<section class="inventory-group"><div class="inventory-group-heading"><strong>${escapeHtml(group[context.language])}</strong><span>${entries.length} ${escapeHtml(context.text.items)}</span></div>${entries.map((item) => rowRenderer(item, context)).join("")}</section>`;
  }).join("");
}

function inventoryTabs(entries, groups, groupKey, activeGroup, selectAction, allLabel, context) {
  const { language, text } = context;
  const attribute = groupKey === "zone" ? "zone" : "area";
  const tab = (group) => `<button class="filter-tab ${activeGroup === group.id ? "selected" : ""}" data-action="${selectAction}" data-${attribute}="${group.id}">${escapeHtml(group[language])} <span>${entries.filter((item) => item[groupKey] === group.id).length}</span></button>`;
  const all = `<button class="filter-tab ${activeGroup === "all" ? "selected" : ""}" data-action="${selectAction}" data-${attribute}="all">${escapeHtml(allLabel)} <span>${entries.length}</span></button>`;

  if (groupKey !== "zone") return `<div class="zone-tabs work-area-tabs">${all}${groups.map(tab).join("")}</div>`;

  const primary = groups.filter((group) => PRIMARY_ZONES.includes(group.id));
  const service = groups.filter((group) => !PRIMARY_ZONES.includes(group.id));
  return `<div class="storage-tab-groups"><div class="storage-tab-group"><span class="storage-group-label">${escapeHtml(text.primaryStorage)}</span><div class="zone-tabs">${all}${primary.map(tab).join("")}</div></div><div class="storage-tab-group"><span class="storage-group-label">${escapeHtml(text.serviceStorage)}</span><div class="zone-tabs">${service.map(tab).join("")}</div></div></div>`;
}

function inventory(context) {
  const { text, record, reserveAlerts, workAlerts, language } = context;
  const storageView = view.inventoryView === "storage";
  const entries = storageView ? record.inventory : record.workInventory;
  const activeAlerts = storageView ? reserveAlerts : workAlerts;
  const filtered = entries.filter((item) => {
    const matchesGroup = storageView
      ? view.zone === "all" || item.zone === view.zone
      : view.workArea === "all" || item.workArea === view.workArea;
    const haystack = `${item.label} ${item.labelVi}`.toLowerCase();
    return matchesGroup && haystack.includes(view.search.toLowerCase());
  });
  const groups = storageView ? ZONES : WORK_AREAS;
  const groupKey = storageView ? "zone" : "workArea";
  const activeGroup = storageView ? view.zone : view.workArea;
  const selectAction = storageView ? "select-zone" : "select-work-area";
  const allLabel = storageView ? text.allStorageLocations : text.allWorkAreas;
  const groupRows = inventoryGroups(filtered, groups, groupKey, context, storageView ? storageInventoryRow : workInventoryRow);
  const columns = storageView
    ? [text.inventory, text.workstation, text.storageLocation, text.storageQuantity, text.workingQuantity, text.restock]
    : [text.inventory, text.workstation, text.current, text.standard, text.restockSource, text.transfer];
  return `${heading(text.inventory, text.inventorySubtitle, `<button class="primary-button" data-action="open-add-item">${icon("plus")}${escapeHtml(text.addItem)}</button>`)}
    <div class="inventory-summary"><span class="summary-pill"><span class="summary-dot green"></span>${entries.length} ${escapeHtml(text.items)}</span><span class="summary-pill"><span class="summary-dot amber"></span>${activeAlerts.length} ${escapeHtml(text.lowStock.toLowerCase())}</span></div>
    <div class="inventory-view-switch"><button class="inventory-view-button ${storageView ? "selected" : ""}" data-action="select-inventory-view" data-view="storage">${icon("inventory")}${escapeHtml(text.storageInventory)}</button><button class="inventory-view-button ${storageView ? "" : "selected"}" data-action="select-inventory-view" data-view="work">${icon("preparation")}${escapeHtml(text.workInventory)}</button></div>
    ${inventoryTabs(entries, groups, groupKey, activeGroup, selectAction, allLabel, context)}
    <div class="filters-row"><p class="inventory-view-description">${escapeHtml(storageView ? text.storageReport : text.workReport)}</p>
      <label class="search-box">${icon("search")}<input type="search" value="${escapeHtml(view.search)}" placeholder="${escapeHtml(text.search)}" data-field="inventorySearch" /></label></div>
    <section class="inventory-table ${storageView ? "storage-table" : "work-table"}"><div class="inventory-table-head">${columns.map((column) => `<span>${escapeHtml(column)}</span>`).join("")}</div>${filtered.length ? groupRows : `<p class="empty-state">${escapeHtml(text.noItems)}</p>`}</section>`;
}

function reservationsPage(context) {
  const { text, reservations, state, record } = context;
  return `${heading(text.reservations, text.reservationsSubtitle)}<section class="reservations-layout"><article class="card reservation-input-card">${cardHeading(text.totalTables)}<div class="shift-inputs"><label><span>${escapeHtml(text.lunch)}</span>${numberInput(record.reservation.lunchTables, 'data-field="reservation" data-key="lunchTables"', "shift-number")}<small>${escapeHtml(text.tables)}</small></label><span class="shift-plus">+</span><label><span>${escapeHtml(text.dinner)}</span>${numberInput(record.reservation.dinnerTables, 'data-field="reservation" data-key="dinnerTables"', "shift-number")}<small>${escapeHtml(text.tables)}</small></label></div>
      <div class="reservation-result"><span>${escapeHtml(text.totalTables)}</span><strong>${reservations.tables} <small>${escapeHtml(text.tables)}</small></strong></div><div class="reservation-buffer"><span>${escapeHtml(text.buffer)}</span><strong>+${state.settings.reservationBuffer} ${escapeHtml(text.tables)}</strong></div><div class="reservation-target"><span>${escapeHtml(text.target)}</span><strong>${reservations.target} <small>${escapeHtml(text.portions)}</small></strong></div></article>
    <article class="card portions-card">${cardHeading(text.sectionPrep)}<p class="helper-text">${escapeHtml(text.reservationRule)}</p>${reservations.tables ? reservations.portions.map((portion) => portionSummary(portion, context, true)).join("") : `<p class="empty-state">${escapeHtml(text.zeroReservations)}</p>`}</article>${riceCard(context, true)}</section>`;
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

function taskRow(task, context, compact = false) {
  const { record, text } = context;
  const checked = Boolean(record.completedTasks[task.id]);
  const priority = task.priority === "high" && !checked
    ? compact ? '<span class="task-priority-dot" aria-hidden="true"></span>' : `<span class="tag tag-empty">${escapeHtml(text.urgent)}</span>`
    : "";
  return `<label class="task-row ${compact ? "compact" : ""} ${checked ? "task-done" : ""} ${task.kind === "procurement" ? "procurement-task" : ""}" data-task-kind="${escapeHtml(task.kind)}" data-priority="${escapeHtml(task.priority ?? "normal")}"><input type="checkbox" data-field="task" data-id="${escapeHtml(task.id)}" ${checked ? "checked" : ""} /><span class="custom-checkbox">${icon("check")}</span><span class="task-copy"><strong>${escapeHtml(taskLabel(task, context))}</strong><small>${escapeHtml(taskDetail(task, context))}</small></span>${priority}</label>`;
}

function preparationPage(context) {
  const { text, tasks, progress, record, state, language } = context;
  const filtered = tasks.filter((task) => {
    const done = Boolean(record.completedTasks[task.id]);
    return view.taskFilter === "all" || (view.taskFilter === "open" && !done) || (view.taskFilter === "done" && done);
  });
  const filters = [{ id: "all", label: text.allTasks, count: progress.total }, { id: "open", label: text.openTasks, count: progress.pending }, { id: "done", label: text.doneTasks, count: progress.done }];
  const canAssign = roleCan(currentStaff(state).role, "tasks:assign");
  const assignmentFields = canAssign ? `<div class="task-assignment-grid"><label><span>${language === "zh" ? "數量" : "Số lượng"}</span><input name="quantity" type="number" min="0" value="1" /></label><label><span>${language === "zh" ? "工作區" : "Khu vực"}</span><select name="area"><option value="">—</option>${WORK_AREAS.map((area) => `<option value="${area.id}">${escapeHtml(area[language])}</option>`).join("")}</select></label><label><span>${language === "zh" ? "指派給" : "Phân cho"}</span><select name="assigneeId"><option value="">${language === "zh" ? "整個區域" : "Cả khu vực"}</option>${state.operations.staff.filter((member) => member.active).map((member) => `<option value="${escapeHtml(member.id)}">${escapeHtml(member.name)}</option>`).join("")}</select></label><label><span>${language === "zh" ? "完成期限" : "Hạn hoàn thành"}</span><input name="dueAt" type="datetime-local" value="${state.selectedDate}T17:00" /></label></div>` : "";
  return `${heading(text.preparation, text.preparationSubtitle)}<section class="preparation-layout"><article class="card task-progress-card"><div><span>${escapeHtml(text.completed)}</span><strong>${progress.done}/${progress.total}</strong><small>${progress.percentage}%</small></div><div class="wide-progress"><span style="width:${progress.percentage}%"></span></div></article>
    <article class="card tasks-card"><div class="task-filters">${filters.map((filter) => `<button class="filter-tab ${view.taskFilter === filter.id ? "selected" : ""}" data-action="select-task-filter" data-filter="${filter.id}">${escapeHtml(filter.label)} <span>${filter.count}</span></button>`).join("")}</div>${filtered.length ? filtered.map((task) => taskRow(task, context)).join("") : `<p class="empty-state">${escapeHtml(text.noTasks)}</p>`}<form class="add-task-form expanded-task-form" data-form="add-task"><input required name="title" placeholder="${escapeHtml(text.taskPlaceholder)}" />${assignmentFields}<button class="primary-button" type="submit">${icon("plus")}<span>${escapeHtml(text.addTask)}</span></button></form></article></section>`;
}

function settingsField(label, value, key, suffix = "", type = "number") {
  return `<label class="setting-row"><span>${escapeHtml(label)}</span><span class="setting-control"><input type="${type}" ${type === "number" ? 'min="0" inputmode="numeric"' : ""} value="${escapeHtml(value)}" data-field="setting" data-key="${key}" />${suffix ? `<small>${escapeHtml(suffix)}</small>` : ""}</span></label>`;
}

function settingsPage(context) {
  const { state, text, language } = context;
  const history = Object.keys(state.records).sort().reverse();
  return `${heading(text.settings, text.settingsSubtitle)}<section class="settings-layout"><article class="card settings-card">${cardHeading(text.appearance)}${settingsField(text.employee, state.settings.employeeName, "employeeName", "", "text")}${settingsField(text.workstation, state.settings.workstation, "workstation", "", "text")}<div class="setting-row"><span>${escapeHtml(text.language)}</span><div class="language-switch"><button class="${language === "vi" ? "active" : ""}" data-action="set-language" data-language="vi">Tiếng Việt</button><button class="${language === "zh" ? "active" : ""}" data-action="set-language" data-language="zh">繁體中文</button></div></div></article>
    <article class="card settings-card">${cardHeading(text.operationalRules)}${settingsField(text.reservationBuffer, state.settings.reservationBuffer, "reservationBuffer", text.tables)}${settingsField(text.weekdaysRice, state.settings.riceWeekday, "riceWeekday", "g")}${settingsField(text.weekendRice, state.settings.riceWeekend, "riceWeekend", "g")}${settingsField(text.skipRiceAbove, state.settings.riceSkipAbove, "riceSkipAbove", "g")}<p class="helper-text">${escapeHtml(text.riceRule)}</p></article>
    <article class="card settings-card">${cardHeading(text.history, `<span class="tag tag-neutral">${history.length} ${escapeHtml(text.savedDays)}</span>`)}<div class="history-list">${history.slice(0, 14).map((date) => `<button class="history-item ${date === state.selectedDate ? "active" : ""}" data-action="select-date" data-date="${date}"><span>${escapeHtml(dateLabel(date, language))}</span>${date === formatDateKey() ? `<small>${escapeHtml(text.today)}</small>` : ""}${icon("chevronRight")}</button>`).join("")}</div></article>
    ${management.staffCard(context)}<article class="card settings-card danger-zone">${cardHeading(text.data)}<p>${escapeHtml(text.autoSaved)}</p><button class="danger-button" data-action="reset">${escapeHtml(text.resetData)}</button></article></section>`;
}

function addItemModal(context) {
  const { text, language, record } = context;
  const editing = Boolean(view.editingStockKey);
  const existing = editing ? record.inventory.filter((item) => item.stockKey === view.editingStockKey) : [];
  const item = existing[0] ?? {};
  const working = editing ? record.workInventory.find((entry) => entry.stockKey === view.editingStockKey) : null;
  const activeZone = view.zone !== "all" ? view.zone : "large-freezer";
  const units = ["盒", "包", "塊", "條", "kg"];
  const locations = ZONES.map((zone) => {
    const stored = existing.find((entry) => entry.zone === zone.id);
    const checked = editing ? Boolean(stored) : zone.id === activeZone;
    return `<div class="modal-location-row"><label class="modal-location-choice"><input type="checkbox" name="zones" value="${zone.id}" ${checked ? "checked" : ""} /><span>${escapeHtml(zone[language])}</span></label><label><span>${escapeHtml(text.current)}</span><input type="number" min="0" name="quantity:${zone.id}" value="${stored?.quantity ?? 0}" /></label><label><span>${escapeHtml(text.standard)}</span><input type="number" min="0" name="minimum:${zone.id}" value="${stored?.minimum ?? 1}" /></label></div>`;
  }).join("");

  return `<div class="modal-backdrop" data-action="close-modal"><section class="modal-card ingredient-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="card-heading"><h2 id="modal-title">${escapeHtml(editing ? text.editItem : text.addItem)}</h2><button class="icon-button" data-action="close-modal">${icon("close")}</button></div><form data-form="${editing ? "edit-item" : "add-item"}"><label>中文<input required name="label" placeholder="牛肉" value="${escapeHtml(item.label ?? "")}" /></label><label>Tiếng Việt<input required name="labelVi" placeholder="Thịt bò" value="${escapeHtml(item.labelVi ?? "")}" /></label><label>${escapeHtml(text.workstation)}<select name="workArea">${WORK_AREAS.map((area) => `<option value="${area.id}" ${(item.workArea ?? view.workArea) === area.id ? "selected" : ""}>${escapeHtml(area[language])}</option>`).join("")}</select></label><fieldset class="modal-locations"><legend>${escapeHtml(text.selectLocations)}</legend>${locations}</fieldset><div class="modal-grid modal-meta-grid"><label>${escapeHtml(text.workInventory)} · ${escapeHtml(text.standard)}<input type="number" min="0" name="workMinimum" value="${working?.minimum ?? 1}" /></label><label>${escapeHtml(text.quantity)}<select name="unit">${units.map((unit) => `<option ${item.unit === unit ? "selected" : ""}>${unit}</option>`).join("")}</select></label></div><button class="primary-button modal-submit" type="submit">${icon(editing ? "check" : "plus")}${escapeHtml(editing ? text.saveChanges : text.addItem)}</button></form></section></div>`;
}

function render() {
  const context = currentContext();
  const active = route();
  const pages = { dashboard, inventory, reservations: reservationsPage, preparation: preparationPage, sop: management.sopPage, attendance: management.attendancePage, schedule: management.schedulePage, reports: management.reportsPage, remote: management.remotePage, settings: settingsPage };
  document.documentElement.lang = context.language === "zh" ? "zh-Hant" : "vi";
  document.title = `${context.text[active]} · 食徒 Kitchen OS`;
  root.innerHTML = `<div class="app-shell">${sidebar(context, active)}<div class="main-shell">${topbar(context)}<main class="page-content">${pages[active](context)}</main></div><nav class="mobile-nav">${ROUTES.map((key) => navItem(key, active, context.text)).join("")}</nav></div>${view.modal === "add-item" ? addItemModal(context) : ""}${view.managementModal ? management.managementModal(context) : ""}`;
}

const management = createManagement({ store, view, root, icon, heading, cardHeading, escapeHtml, workAreaLabel, zoneLabel, compactNumber, render });

root.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const state = store.getState();
  const action = target.dataset.action;
  if (management.handleClick(target, event, currentContext())) return;

  if (action === "shift-date") { view.calendarOpen = false; store.selectDate(shiftDate(state.selectedDate, Number(target.dataset.offset))); }
  if (action === "select-date" || action === "calendar-select-day") { view.calendarOpen = false; store.selectDate(target.dataset.date); }
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
    store.selectDate(dates[target.dataset.shortcut]);
  }
  if (action === "toggle-language") store.updateSetting("language", state.settings.language === "vi" ? "zh" : "vi");
  if (action === "set-language") store.updateSetting("language", target.dataset.language);
  if (action === "select-inventory-view") { view.inventoryView = target.dataset.view; view.search = ""; render(); }
  if (action === "select-work-area") { view.workArea = target.dataset.area; render(); }
  if (action === "select-zone") { view.zone = target.dataset.zone; render(); }
  if (action === "select-task-filter") { view.taskFilter = target.dataset.filter; render(); }
  if (action === "adjust-item") {
    const item = state.records[state.selectedDate].inventory.find((entry) => entry.id === target.dataset.id);
    if (item) store.updateItem(item.id, "quantity", item.quantity + Number(target.dataset.delta));
  }
  if (action === "adjust-work-item") {
    const item = state.records[state.selectedDate].workInventory.find((entry) => entry.id === target.dataset.id);
    if (item) store.updateWorkItem(item.id, "quantity", item.quantity + Number(target.dataset.delta));
  }
  if (action === "restock-work-item" && !target.disabled) store.restockWorkItem(target.dataset.id);
  if (action === "restock-storage-item" && !target.disabled) store.restockStorageItem(target.dataset.id);
  if (action === "open-add-item") { view.editingStockKey = null; view.modal = "add-item"; render(); }
  if (action === "open-edit-item") { view.editingStockKey = target.dataset.stockKey; view.modal = "add-item"; render(); }
  if (action === "delete-item" && window.confirm(translate(state.settings.language).deleteConfirm)) store.removeIngredient(target.dataset.stockKey);
  if (action === "close-modal" && (target === event.target || target.closest(".icon-button"))) { view.modal = null; view.editingStockKey = null; render(); }
  if (action === "reset" && window.confirm(translate(state.settings.language).resetConfirm)) store.reset();
});

root.addEventListener("change", (event) => {
  const element = event.target;
  const { field, key, id } = element.dataset;
  if (!field) return;
  if (["payroll", "sop-photos", "inspection-photo", "schedule-month", "schedule-shift", "report-scope", "report-target", "report-category", "report-from", "report-to"].includes(field)) { void management.handleChange(element); return; }
  if (field === "reservation") store.updateReservation(key, element.value);
  if (field === "remaining") store.updateRemaining(key, element.value);
  if (field === "riceRemaining") store.updateRice(element.value);
  if (field === "item") store.updateItem(id, key, element.value);
  if (field === "workItem") store.updateWorkItem(id, key, element.value);
  if (field === "calendarMonth") { view.calendarMonth = Number(element.value); render(); }
  if (field === "calendarYear") { view.calendarYear = Number(element.value); render(); }
  if (field === "setting") store.updateSetting(key, element.value);
  if (field === "task") store.toggleTask(id);
});

root.addEventListener("input", (event) => {
  if (event.target.dataset.field !== "inventorySearch") return;
  const input = event.target;
  const start = input.selectionStart;
  view.search = input.value;
  render();
  const replacement = root.querySelector('[data-field="inventorySearch"]');
  replacement.focus();
  replacement.setSelectionRange(start, start);
});

root.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);
  if (management.handleSubmit(form, data)) return;
  if (form.dataset.form === "add-task") {
    const title = String(data.get("title") ?? "").trim();
    const assigneeId = String(data.get("assigneeId") ?? "");
    const assignee = store.getState().operations.staff.find((member) => member.id === assigneeId);
    if (title) store.addTask({ title, quantity: data.get("quantity"), area: data.get("area"), assigneeId, assigneeName: assignee?.name || "", dueAt: data.get("dueAt") });
  }
  if (["add-item", "edit-item"].includes(form.dataset.form)) {
    const locations = data.getAll("zones").map((zone) => ({
      zone: String(zone),
      quantity: Number(data.get(`quantity:${zone}`)),
      minimum: Number(data.get(`minimum:${zone}`)),
    }));
    if (!locations.length) return;
    const stockKey = view.editingStockKey;
    const item = {
      label: String(data.get("label") ?? "").trim(),
      labelVi: String(data.get("labelVi") ?? "").trim(),
      workArea: String(data.get("workArea")),
      unit: String(data.get("unit")),
      workMinimum: Number(data.get("workMinimum")),
      locations,
    };
    view.modal = null;
    view.editingStockKey = null;
    if (form.dataset.form === "edit-item") store.updateIngredient(stockKey, item);
    else store.addItem(item);
  }
});

window.addEventListener("hashchange", () => {
  view.calendarOpen = false;
  const hash = window.location.hash.replace(/^#\/?/, "");
  const [, query = ""] = hash.split("?");
  const area = new URLSearchParams(query).get("zone");
  if (route() === "sop" && WORK_AREAS.some((entry) => entry.id === area)) { view.sopArea = area; view.sopSelected = null; }
  render();
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && view.modal) { view.modal = null; view.editingStockKey = null; render(); }
  if (event.key === "Escape" && view.managementModal) { view.managementModal = null; render(); }
  if (event.key === "Escape" && view.calendarOpen) { view.calendarOpen = false; render(); }
});
window.addEventListener("offline", render);
window.addEventListener("online", () => { if (store.getState().operations.pendingSync) store.clearPendingSync(); else render(); });
if (globalThis.navigator?.serviceWorker && window.location.protocol !== "file:") {
  globalThis.navigator.serviceWorker.register("./sw.js").catch(() => {});
}
store.subscribe(render);
render();
