import { accountCan, currentAccountSession } from "./account-permissions.js";
import { calculateAttendance } from "./operations.js";

const STATE_KEY = "shitu-kitchen-os-v1";
const MANAGER_ROLES = new Set(["admin", "manager"]);
let decoratePending = false;

function copy() {
  const zh = document.documentElement.lang === "zh-Hant";
  return zh ? {
    scheduled:"排班",
    actual:"實際",
    complete:"完成",
    late:"遲到",
    open:"未打下班卡",
    exceptions:"異常對帳",
    exceptionHint:"只顯示出勤異常，不會另外產生扣款。",
    staff:"員工",
    scheduleSummary:"排班對帳",
    mySchedule:"我的排班",
    plannedEntries:"排定班次",
    plannedStaff:"排定人數",
    plannedHours:"排定時數",
    inside:"內場",
    outside:"外場",
    payrollEstimate:"薪資為已由 VPS 確認之出勤資料的暫估；目前不包含未明確設定的加班、國定假日倍率、獎金、勞健保或稅額。",
    noExceptions:"本月沒有遲到或未完成打卡紀錄。",
  } : {
    scheduled:"Lịch dự kiến",
    actual:"Thực tế",
    complete:"Hoàn tất",
    late:"Đi muộn",
    open:"Chưa chấm tan",
    exceptions:"Đối soát ngoại lệ",
    exceptionHint:"Chỉ hiển thị ngoại lệ chấm công, không tự tạo thêm khoản khấu trừ.",
    staff:"Nhân viên",
    scheduleSummary:"Đối soát lịch làm",
    mySchedule:"Lịch làm của tôi",
    plannedEntries:"Ca đã xếp",
    plannedStaff:"Người đã xếp",
    plannedHours:"Giờ dự kiến",
    inside:"Nội trường",
    outside:"Ngoại trường",
    payrollEstimate:"Lương là số tạm tính từ dữ liệu chấm công đã được VPS xác nhận; hiện chưa áp dụng OT, hệ số ngày lễ, thưởng, bảo hiểm hoặc thuế nếu các quy tắc đó chưa được cấu hình rõ ràng.",
    noExceptions:"Tháng này không có ca đi muộn hoặc ca chưa chấm tan.",
  };
}

function loadState() {
  try { return JSON.parse(localStorage.getItem(STATE_KEY) || "null"); }
  catch { return null; }
}

function panelFromHash() {
  const value = String(location.hash || "").replace(/^#\/?/, "");
  const [route, query = ""] = value.split("?");
  if (route === "schedule") return "schedule";
  if (route !== "attendance") return "";
  return new URLSearchParams(query).get("workforce") === "payroll" ? "payroll" : "attendance";
}

function managerAccount() {
  const session = currentAccountSession();
  const role = String(session?.accountRole || session?.role || "");
  return Boolean(session && MANAGER_ROLES.has(role));
}

function canView(panel) {
  const session = currentAccountSession();
  if (!session) return false;
  return panel === "schedule"
    ? accountCan(session, "schedule", "view")
    : accountCan(session, "attendance", "view");
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function number(value) {
  return new Intl.NumberFormat(document.documentElement.lang === "zh-Hant" ? "zh-TW" : "vi-VN", { maximumFractionDigits:2 }).format(Number(value) || 0);
}

function clock(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat(document.documentElement.lang === "zh-Hant" ? "zh-TW" : "vi-VN", { hour:"2-digit", minute:"2-digit", hour12:false }).format(date);
}

function statusFor(entry, payroll) {
  const wage = calculateAttendance(entry, payroll || {});
  if (!wage.complete) return { kind:"open", label:copy().open, wage };
  if (wage.lateMinutes > 0) return { kind:"late", label:`${copy().late} ${wage.lateMinutes} min`, wage };
  return { kind:"complete", label:copy().complete, wage };
}

function applicableSchedules(operations, date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return [];
  const month = date.slice(0, 7);
  const weekday = new Date(`${date}T12:00:00`).getDay();
  return (operations?.schedules || []).filter((entry) => entry?.applyMode === "month"
    ? entry.month === month && Number(entry.weekday) === weekday
    : entry?.date === date);
}

function plannedMinutes(entry) {
  const parse = (value) => {
    const match = /^(\d{2}):(\d{2})$/.exec(String(value || ""));
    if (!match) return NaN;
    return Number(match[1]) * 60 + Number(match[2]);
  };
  const start = parse(entry?.start);
  let end = parse(entry?.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  if (end < start) end += 24 * 60;
  return Math.max(0, end - start);
}

function scheduleForAttendance(state, entry) {
  const candidates = applicableSchedules(state?.operations, entry?.date)
    .filter((item) => item.staffId === entry.staffId);
  return candidates.find((item) => item.start === entry.scheduledStart) || candidates[0] || null;
}

function decorateAttendance(root, state) {
  const c = copy();
  const payroll = state?.operations?.payroll || {};
  const rows = (state?.operations?.attendance || []).filter((entry) => entry.date === state.selectedDate);
  let late = 0;
  let open = 0;

  for (const entry of rows) {
    const status = statusFor(entry, payroll);
    if (status.kind === "late") late += 1;
    if (status.kind === "open") open += 1;
    const row = root.querySelector(`[data-workforce-edit-attendance="${CSS.escape(String(entry.id))}"]`)?.closest(".workforce-attendance-row");
    if (!row) continue;

    const planned = scheduleForAttendance(state, entry);
    const plannedLabel = planned
      ? `${planned.start || entry.scheduledStart || "—"} → ${planned.end || "—"}`
      : (entry.scheduledStart || "—");
    const actualLabel = `${clock(entry.clockIn)} → ${clock(entry.clockOut)}`;
    const timeStrong = row.querySelector(".attendance-times strong");
    const timeSmall = row.querySelector(".attendance-times small");
    const nextStrong = `${c.actual}: ${actualLabel}`;
    const nextSmall = `${c.scheduled}: ${plannedLabel}`;
    if (timeStrong && timeStrong.textContent !== nextStrong) timeStrong.textContent = nextStrong;
    if (timeSmall && timeSmall.textContent !== nextSmall) timeSmall.textContent = nextSmall;

    const person = row.querySelector(".attendance-person");
    let badge = person?.querySelector("[data-workforce-status]");
    if (person && !badge) {
      badge = document.createElement("span");
      badge.dataset.workforceStatus = "";
      badge.className = "workforce-status";
      person.append(badge);
    }
    if (badge) {
      if (badge.dataset.kind !== status.kind) badge.dataset.kind = status.kind;
      if (badge.textContent !== status.label) badge.textContent = status.label;
    }
  }

  const stats = root.querySelector(".workforce-day-stats");
  if (!stats) return;
  const signature = `${state.selectedDate}|${late}|${open}`;
  let card = stats.querySelector("[data-workforce-daily-exceptions]");
  if (!card) {
    card = document.createElement("article");
    card.className = "stat-card stat-amber workforce-exception-card";
    card.dataset.workforceDailyExceptions = "";
    stats.append(card);
  }
  if (card.dataset.signature === signature) return;
  card.dataset.signature = signature;
  card.innerHTML = `<div class="stat-top"><span>${esc(c.exceptions)}</span></div><div class="stat-value">${late}</div><p>${esc(c.late)} · ${open} ${esc(c.open)}</p>`;
}

function monthlyExceptionRows(state, month) {
  const payroll = state?.operations?.payroll || {};
  const groups = new Map();
  for (const entry of state?.operations?.attendance || []) {
    if (!String(entry?.date || "").startsWith(`${month}-`)) continue;
    const status = statusFor(entry, payroll);
    const key = String(entry.staffId || entry.staffName || "");
    const group = groups.get(key) || { staffName:entry.staffName || key, late:0, open:0 };
    if (status.kind === "late") group.late += 1;
    if (status.kind === "open") group.open += 1;
    groups.set(key, group);
  }
  return [...groups.values()]
    .filter((row) => row.late > 0 || row.open > 0)
    .sort((a, b) => String(a.staffName).localeCompare(String(b.staffName)));
}

function decoratePayroll(root, state) {
  const c = copy();
  const month = root.querySelector("[data-workforce-payroll-month]")?.value || String(state.selectedDate || "").slice(0, 7);
  const rows = monthlyExceptionRows(state, month);
  const late = rows.reduce((sum, row) => sum + row.late, 0);
  const open = rows.reduce((sum, row) => sum + row.open, 0);
  const signature = `${month}|${rows.map((row) => `${row.staffName}:${row.late}:${row.open}`).join("|")}`;
  let card = root.querySelector("[data-workforce-monthly-reconciliation]");
  const payrollCard = root.querySelector(".workforce-payroll-card");
  if (!payrollCard) return;
  if (!card) {
    card = document.createElement("article");
    card.className = "card workforce-reconciliation-card";
    card.dataset.workforceMonthlyReconciliation = "";
    payrollCard.before(card);
  }
  if (card.dataset.signature === signature) return;
  card.dataset.signature = signature;
  const body = rows.map((row) => `<tr><td>${esc(row.staffName)}</td><td>${row.late}</td><td>${row.open}</td></tr>`).join("");
  card.innerHTML = `<div class="card-heading"><div><h2>${esc(c.exceptions)}</h2><p>${esc(c.exceptionHint)}</p></div><div class="workforce-exception-total">${late} ${esc(c.late)} · ${open} ${esc(c.open)}</div></div>
    <div class="report-table-wrap"><table class="report-table"><thead><tr><th>${esc(c.staff)}</th><th>${esc(c.late)}</th><th>${esc(c.open)}</th></tr></thead><tbody>${body || `<tr><td colspan="3">${esc(c.noExceptions)}</td></tr>`}</tbody></table></div>
    <p class="workforce-payroll-caveat">${esc(c.payrollEstimate)}</p>`;
}

function decorateSchedule(root, state) {
  const c = copy();
  const date = String(state.selectedDate || "");
  const entries = applicableSchedules(state.operations, date);
  const staffCount = new Set(entries.map((entry) => entry.staffId).filter(Boolean)).size;
  const inside = entries.filter((entry) => entry.department === "inside").length;
  const outside = entries.filter((entry) => entry.department === "outside").length;
  const hours = entries.reduce((sum, entry) => sum + plannedMinutes(entry), 0) / 60;
  const signature = `${date}|${entries.map((entry) => `${entry.id}:${entry.start}:${entry.end}:${entry.department}`).join("|")}`;
  let panel = root.querySelector("[data-workforce-schedule-reconciliation]");
  const tabs = root.querySelector("[data-workforce-tabs]");
  if (!tabs) return;
  if (!panel) {
    panel = document.createElement("section");
    panel.className = "workforce-schedule-reconciliation";
    panel.dataset.workforceScheduleReconciliation = "";
    tabs.after(panel);
  }
  if (panel.dataset.signature === signature) return;
  panel.dataset.signature = signature;
  panel.innerHTML = `<div class="card-heading workforce-reconciliation-heading"><div><h2>${esc(managerAccount() ? c.scheduleSummary : c.mySchedule)}</h2><p>${esc(date)}</p></div></div>
    <div class="stats-grid workforce-schedule-stats">
      <article class="stat-card"><div class="stat-top"><span>${esc(c.plannedEntries)}</span></div><div class="stat-value">${entries.length}</div><p>${esc(date)}</p></article>
      <article class="stat-card stat-blue"><div class="stat-top"><span>${esc(c.plannedStaff)}</span></div><div class="stat-value">${staffCount}</div><p>${esc(c.inside)} ${inside} · ${esc(c.outside)} ${outside}</p></article>
      <article class="stat-card stat-green"><div class="stat-top"><span>${esc(c.plannedHours)}</span></div><div class="stat-value">${number(hours)}</div><p>h</p></article>
    </div>`;
}

function decorate() {
  decoratePending = false;
  const panel = panelFromHash();
  if (!panel || !canView(panel)) return;
  const root = document.querySelector("#app");
  const state = loadState();
  if (!root || !state?.operations || !root.querySelector("[data-workforce-tabs]")) return;

  if (panel === "attendance") decorateAttendance(root, state);
  if (panel === "payroll") decoratePayroll(root, state);
  if (panel === "schedule") decorateSchedule(root, state);
}

function requestDecorate() {
  if (decoratePending) return;
  decoratePending = true;
  requestAnimationFrame(decorate);
}

document.addEventListener("change", (event) => {
  if (event.target instanceof HTMLInputElement && event.target.matches("[data-workforce-payroll-month]")) requestDecorate();
}, true);
window.addEventListener("hashchange", requestDecorate);
window.addEventListener("shitu:accounts-synced", requestDecorate);
window.addEventListener("shitu:business-state-updated", requestDecorate);

const observer = new MutationObserver(requestDecorate);
observer.observe(document.documentElement, { childList:true, subtree:true });
requestDecorate();
