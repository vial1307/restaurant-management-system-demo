import { accountCan, currentAccountSession } from "./account-permissions.js";
import { calculateAttendance } from "./operations.js";
import { vpsBusinessState, vpsSaveBusinessState } from "./vps-api.js";

const STATE_KEY = "shitu-kitchen-os-v1";
const ACTIVE_SITE_KEY = "shitu-admin-active-site-v1";
const WORKFORCE_ROLES = new Set(["admin", "manager"]);
let payrollMonth = "";
let renderPending = false;
let forceRender = false;

function copy() {
  const zh = document.documentElement.lang === "zh-Hant";
  return zh ? {
    title:"出勤 · 排班 · 薪資",
    subtitle:"集中查看打卡、排班與薪資；主管以上可修正實際上下班時間。",
    attendance:"出勤",
    schedule:"排班",
    payroll:"薪資",
    monthlyPayroll:"月薪資試算",
    month:"月份",
    shifts:"完成班次",
    hours:"工作時數",
    gross:"應計薪資",
    deductions:"扣款",
    net:"暫估實領",
    unfinished:"未完成打卡",
    editTime:"修正工時",
    clockIn:"實際上班時間",
    clockOut:"實際下班時間",
    scheduledStart:"預定上班時間",
    breakMinutes:"休息分鐘",
    hourlyRate:"時薪",
    note:"備註",
    save:"儲存",
    cancel:"取消",
    staff:"員工",
    noData:"此月份尚無出勤紀錄。",
    invalidRange:"下班時間不可早於上班時間。",
    saveSuccess:"工時已更新",
    saveSuccessBody:"VPS 已確認新的上下班時間與薪資計算資料。",
    saveError:"工時更新失敗",
    saveErrorBody:"資料尚未由 VPS 確認，請檢查後再試。",
    daySummary:"當日出勤",
    managerHint:"主管以上可修正實際上班、下班、休息時間與時薪。",
  } : {
    title:"Chấm công · Lịch làm · Lương",
    subtitle:"Gộp chấm công, lịch làm và tính lương; quản lý trở lên được sửa giờ vào/ra thực tế.",
    attendance:"Chấm công",
    schedule:"Lịch làm",
    payroll:"Tính lương",
    monthlyPayroll:"Tính lương theo tháng",
    month:"Tháng",
    shifts:"Ca hoàn thành",
    hours:"Giờ làm",
    gross:"Lương trước khấu trừ",
    deductions:"Khấu trừ",
    net:"Thực nhận tạm tính",
    unfinished:"Ca chưa chấm tan",
    editTime:"Sửa giờ làm",
    clockIn:"Giờ vào thực tế",
    clockOut:"Giờ tan ca thực tế",
    scheduledStart:"Giờ bắt đầu dự kiến",
    breakMinutes:"Phút nghỉ",
    hourlyRate:"Lương theo giờ",
    note:"Ghi chú",
    save:"Lưu",
    cancel:"Hủy",
    staff:"Nhân viên",
    noData:"Tháng này chưa có dữ liệu chấm công.",
    invalidRange:"Giờ tan ca không được sớm hơn giờ vào ca.",
    saveSuccess:"Đã cập nhật giờ làm",
    saveSuccessBody:"VPS đã xác nhận giờ vào/ra và dữ liệu dùng để tính lương.",
    saveError:"Không cập nhật được giờ làm",
    saveErrorBody:"Dữ liệu chưa được VPS xác nhận; hãy kiểm tra rồi thử lại.",
    daySummary:"Chấm công trong ngày",
    managerHint:"Quản lý trở lên có thể sửa giờ vào, giờ tan ca, thời gian nghỉ và lương theo giờ.",
  };
}

function loadState() {
  try { return JSON.parse(localStorage.getItem(STATE_KEY) || "null"); }
  catch { return null; }
}

function accountRole() {
  const session = currentAccountSession();
  return String(session?.accountRole || session?.role || "");
}

function canManageTime() {
  const session = currentAccountSession();
  return Boolean(session && (session.role === "admin" || WORKFORCE_ROLES.has(accountRole())) && accountCan(session, "attendance", "edit"));
}

function workforceVisible() {
  const session = currentAccountSession();
  return Boolean(session && (accountCan(session, "attendance", "view") || accountCan(session, "schedule", "view")));
}

function panelFromHash() {
  const value = String(location.hash || "").replace(/^#\/?/, "");
  const [route, query = ""] = value.split("?");
  if (route === "schedule") return "schedule";
  if (route !== "attendance") return "";
  const params = new URLSearchParams(query);
  return params.get("workforce") === "payroll" ? "payroll" : "attendance";
}

function activeSite() {
  const session = currentAccountSession();
  if (["central", "fuxing", "yongji"].includes(session?.location)) return session.location;
  if (session?.location === "all") {
    const value = localStorage.getItem(ACTIVE_SITE_KEY);
    return ["central", "fuxing", "yongji"].includes(value) ? value : "fuxing";
  }
  return "";
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

function toLocalDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function notify(type, title, body) {
  window.dispatchEvent(new CustomEvent("shitu:notify", { detail:{ type, title, body } }));
}

function permissionGridRole(grid) {
  const form = grid.closest?.("[data-account-form]");
  return String(form?.querySelector?.('select[name="role"]')?.value || "employee");
}

function syncPermissionGrid(grid, initialize = false) {
  const attendanceRow = grid.querySelector('[data-permission-module="attendance"]');
  const scheduleRow = grid.querySelector('[data-permission-module="schedule"]');
  if (!attendanceRow || !scheduleRow) return;
  const attendanceView = attendanceRow.querySelector('input[name="perm:attendance:view"]');
  const attendanceEdit = attendanceRow.querySelector('input[name="perm:attendance:edit"]');
  const scheduleView = scheduleRow.querySelector('input[name="perm:schedule:view"]');
  const scheduleEdit = scheduleRow.querySelector('input[name="perm:schedule:edit"]');
  if (![attendanceView, attendanceEdit, scheduleView, scheduleEdit].every((item) => item instanceof HTMLInputElement)) return;
  const managerRole = ["admin", "manager"].includes(permissionGridRole(grid));
  if (initialize && grid.dataset.workforcePermissionsMerged !== "true") {
    attendanceView.checked = attendanceView.checked || scheduleView.checked;
    attendanceEdit.checked = attendanceEdit.checked || (managerRole && scheduleEdit.checked);
    grid.dataset.workforcePermissionsMerged = "true";
  }
  if (!attendanceView.checked) attendanceEdit.checked = false;
  scheduleView.checked = attendanceView.checked;
  scheduleEdit.checked = managerRole && attendanceEdit.checked;
  scheduleRow.hidden = true;
  scheduleRow.setAttribute("aria-hidden", "true");
}

function decoratePermissionRows() {
  const c = copy();
  document.querySelectorAll(".permission-grid").forEach((grid) => {
    const attendanceRow = grid.querySelector('[data-permission-module="attendance"]');
    const label = attendanceRow?.querySelector(":scope > span:first-child");
    if (label && label.textContent !== c.title) label.textContent = c.title;
    syncPermissionGrid(grid, true);
  });
}

function decorateNavigation(panel) {
  const c = copy();
  decoratePermissionRows();
  document.querySelectorAll('a.nav-item[href="#schedule"]').forEach((node) => {
    node.hidden = true;
    node.setAttribute("aria-hidden", "true");
    node.tabIndex = -1;
    node.style.display = "none";
  });
  document.querySelectorAll('a.nav-item[href="#attendance"]').forEach((node) => {
    const label = node.querySelector("span");
    if (label && label.textContent !== c.title) label.textContent = c.title;
    if (panel) {
      node.classList.add("active");
      node.setAttribute("aria-current", "page");
    }
  });
}

function workforceTabs(panel) {
  const c = copy();
  return `<nav class="workforce-tabs" data-workforce-tabs aria-label="${esc(c.title)}">
    <a href="#attendance" class="${panel === "attendance" ? "active" : ""}">${esc(c.attendance)}</a>
    <a href="#schedule" class="${panel === "schedule" ? "active" : ""}">${esc(c.schedule)}</a>
    <a href="#attendance?workforce=payroll" class="${panel === "payroll" ? "active" : ""}">${esc(c.payroll)}</a>
  </nav>`;
}

function rowsForDay(state) {
  const selectedDate = String(state?.selectedDate || "");
  return (state?.operations?.attendance || []).filter((entry) => entry.date === selectedDate);
}

function managerAttendanceMarkup(state) {
  const c = copy();
  const rows = rowsForDay(state);
  const totals = rows.reduce((sum, entry) => {
    const wage = calculateAttendance(entry, state.operations.payroll || {});
    sum.minutes += wage.totalMinutes;
    sum.net += wage.net;
    sum.open += wage.complete ? 0 : 1;
    return sum;
  }, { minutes:0, net:0, open:0 });
  const body = rows.map((entry) => {
    const wage = calculateAttendance(entry, state.operations.payroll || {});
    return `<article class="attendance-row workforce-attendance-row">
      <div class="attendance-person"><strong>${esc(entry.staffName)}</strong><small>${esc(entry.date)} · NT$${number(entry.hourlyRate)}/h</small></div>
      <div class="attendance-times"><strong>${esc(clock(entry.clockIn))} → ${esc(clock(entry.clockOut))}</strong><small>${esc(entry.scheduledStart || "—")}</small></div>
      <div class="attendance-hours"><strong>${number(wage.hours)} h</strong><small>${entry.breakMinutes ? `−${number(entry.breakMinutes)} min` : ""}</small></div>
      <div class="attendance-wages"><strong>NT$${number(wage.net)}</strong><small>${wage.complete ? esc(c.net) : esc(c.unfinished)}</small></div>
      <div class="attendance-actions"><button type="button" class="inventory-action-button" data-workforce-edit-attendance="${esc(entry.id)}" aria-label="${esc(c.editTime)}">✎</button></div>
    </article>`;
  }).join("");
  return `<section class="workforce-manager-day" data-workforce-manager-day>
    <div class="stats-grid attendance-stats workforce-day-stats">
      <article class="stat-card"><div class="stat-top"><span>${esc(c.daySummary)}</span></div><div class="stat-value">${rows.length}</div><p>${esc(state.selectedDate || "")}</p></article>
      <article class="stat-card stat-blue"><div class="stat-top"><span>${esc(c.hours)}</span></div><div class="stat-value">${number(totals.minutes / 60)}</div><p>${esc(c.hours)}</p></article>
      <article class="stat-card stat-green"><div class="stat-top"><span>${esc(c.net)}</span></div><div class="stat-value">${number(totals.net)}<span>NT$</span></div><p>${totals.open} ${esc(c.unfinished)}</p></article>
    </div>
    <article class="card attendance-list-card"><div class="card-heading"><div><h2>${esc(c.daySummary)}</h2><p>${esc(c.managerHint)}</p></div></div>${body || `<p class="empty-state">${esc(c.noData)}</p>`}</article>
  </section>`;
}

function payrollMarkup(state) {
  const c = copy();
  const manager = canManageTime();
  const currentMonth = payrollMonth || String(state?.selectedDate || "").slice(0, 7);
  payrollMonth = currentMonth;
  const ownId = state?.operations?.activeStaffId || "";
  const entries = (state?.operations?.attendance || []).filter((entry) => String(entry.date || "").startsWith(`${currentMonth}-`) && (manager || entry.staffId === ownId));
  const byStaff = new Map();
  let open = 0;
  for (const entry of entries) {
    const wage = calculateAttendance(entry, state.operations.payroll || {});
    if (!wage.complete) open += 1;
    const row = byStaff.get(entry.staffId) || { staffName:entry.staffName || entry.staffId, shifts:0, minutes:0, gross:0, deduction:0, net:0 };
    if (wage.complete) row.shifts += 1;
    row.minutes += wage.totalMinutes;
    row.gross += wage.gross;
    row.deduction += wage.deduction;
    row.net += wage.net;
    byStaff.set(entry.staffId, row);
  }
  const rows = [...byStaff.values()].sort((a, b) => String(a.staffName).localeCompare(String(b.staffName)));
  const totals = rows.reduce((sum, row) => ({
    shifts:sum.shifts + row.shifts,
    minutes:sum.minutes + row.minutes,
    gross:sum.gross + row.gross,
    deduction:sum.deduction + row.deduction,
    net:sum.net + row.net,
  }), { shifts:0, minutes:0, gross:0, deduction:0, net:0 });
  const tableRows = rows.map((row) => `<tr><td>${esc(row.staffName)}</td><td>${row.shifts}</td><td>${number(row.minutes / 60)}</td><td>NT$${number(row.gross)}</td><td>NT$${number(row.deduction)}</td><td><strong>NT$${number(row.net)}</strong></td></tr>`).join("");
  return `<section class="workforce-payroll-panel" data-workforce-payroll-panel>
    <div class="workforce-payroll-toolbar"><label><span>${esc(c.month)}</span><input type="month" value="${esc(currentMonth)}" data-workforce-payroll-month></label></div>
    <div class="stats-grid attendance-stats workforce-payroll-stats">
      <article class="stat-card"><div class="stat-top"><span>${esc(c.shifts)}</span></div><div class="stat-value">${totals.shifts}</div><p>${open} ${esc(c.unfinished)}</p></article>
      <article class="stat-card stat-blue"><div class="stat-top"><span>${esc(c.hours)}</span></div><div class="stat-value">${number(totals.minutes / 60)}</div><p>${esc(currentMonth)}</p></article>
      <article class="stat-card stat-amber"><div class="stat-top"><span>${esc(c.deductions)}</span></div><div class="stat-value">${number(totals.deduction)}<span>NT$</span></div><p>${esc(c.gross)} NT$${number(totals.gross)}</p></article>
      <article class="stat-card stat-green"><div class="stat-top"><span>${esc(c.net)}</span></div><div class="stat-value">${number(totals.net)}<span>NT$</span></div><p>${rows.length} ${esc(c.staff)}</p></article>
    </div>
    <article class="card workforce-payroll-card"><div class="card-heading"><div><h2>${esc(c.monthlyPayroll)}</h2><p>${esc(currentMonth)}</p></div></div>
      <div class="report-table-wrap"><table class="report-table"><thead><tr><th>${esc(c.staff)}</th><th>${esc(c.shifts)}</th><th>${esc(c.hours)}</th><th>${esc(c.gross)}</th><th>${esc(c.deductions)}</th><th>${esc(c.net)}</th></tr></thead><tbody>${tableRows || `<tr><td colspan="6">${esc(c.noData)}</td></tr>`}</tbody></table></div>
    </article>
  </section>`;
}

function enforceRoleBoundary() {
  if (canManageTime()) return;
  document.querySelectorAll('[data-action="attendance-edit"], [data-action="schedule-add"], [data-action="schedule-edit"], [data-action="schedule-delete"]').forEach((control) => {
    control.hidden = true;
    control.setAttribute("aria-hidden", "true");
    if ("disabled" in control) control.disabled = true;
  });
}

function decorateWorkforce() {
  renderPending = false;
  const panel = panelFromHash();
  decorateNavigation(panel);
  if (!panel || !workforceVisible()) return;

  const root = document.querySelector("#app");
  const heading = root?.querySelector(".page-heading");
  if (!root || !heading) return;
  const manager = canManageTime();
  const existingTabs = root.querySelector("[data-workforce-tabs]");
  const ready = existingTabs?.dataset?.workforcePanel === panel
    && (panel !== "attendance" || !manager || Boolean(root.querySelector("[data-workforce-manager-day]")))
    && (panel !== "payroll" || Boolean(root.querySelector("[data-workforce-payroll-panel]")));
  if (ready && !forceRender) { enforceRoleBoundary(); return; }
  forceRender = false;
  const c = copy();
  const title = heading.querySelector("h1");
  const subtitle = heading.querySelector("p");
  if (title && title.textContent !== c.title) title.textContent = c.title;
  if (subtitle && subtitle.textContent !== c.subtitle) subtitle.textContent = c.subtitle;
  document.title = `${c.title} · 食徒 Kitchen OS`;

  root.querySelector("[data-workforce-tabs]")?.remove();
  heading.insertAdjacentHTML("afterend", workforceTabs(panel));
  const tabs = root.querySelector("[data-workforce-tabs]");
  if (tabs) tabs.dataset.workforcePanel = panel;
  enforceRoleBoundary();

  const state = loadState();
  if (!state?.operations) return;
  root.querySelector("[data-workforce-manager-day]")?.remove();
  root.querySelector("[data-workforce-payroll-panel]")?.remove();

  const stats = root.querySelector(".attendance-stats");
  const layout = root.querySelector(".attendance-layout");
  const listCard = root.querySelector(".attendance-list-card");
  if (stats) stats.hidden = false;
  if (layout) layout.hidden = false;
  if (listCard) listCard.hidden = false;
  const policy = root.querySelector(".payroll-policy-card");
  if (policy) policy.hidden = panel !== "payroll";

  if (panel === "attendance" && canManageTime()) {
    if (stats) stats.hidden = true;
    if (layout) layout.hidden = true;
    root.querySelector("[data-workforce-tabs]")?.insertAdjacentHTML("afterend", managerAttendanceMarkup(state));
  }

  if (panel === "payroll") {
    if (stats) stats.hidden = true;
    if (layout) layout.hidden = false;
    if (listCard) listCard.hidden = true;
    if (policy) policy.hidden = !canManageTime();
    const first = heading.children[1];
    if (first instanceof HTMLElement) first.hidden = true;
    root.querySelector("[data-workforce-tabs]")?.insertAdjacentHTML("afterend", payrollMarkup(state));
  }
}

function scheduleDecorate() {
  const panel = panelFromHash();
  if (panel !== "schedule") return;
  const root = document.querySelector("#app");
  const heading = root?.querySelector(".page-heading");
  if (!heading) return;
  const c = copy();
  const title = heading.querySelector("h1");
  const subtitle = heading.querySelector("p");
  if (title && title.textContent !== c.title) title.textContent = c.title;
  if (subtitle && subtitle.textContent !== c.subtitle) subtitle.textContent = c.subtitle;
}

function requestDecorate() {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(() => {
    decorateWorkforce();
    scheduleDecorate();
  });
}

function openTimeEditor(id) {
  if (!canManageTime()) return;
  const state = loadState();
  const entry = state?.operations?.attendance?.find((item) => item.id === id);
  if (!entry) return;
  const c = copy();
  document.querySelector("[data-workforce-time-modal]")?.remove();
  const host = document.createElement("div");
  host.className = "modal-backdrop workforce-time-modal-backdrop";
  host.dataset.workforceTimeModal = "";
  host.innerHTML = `<section class="modal-card workforce-time-modal" role="dialog" aria-modal="true">
    <div class="card-heading"><div><h2>${esc(c.editTime)}</h2><p>${esc(entry.staffName)}</p></div><button type="button" class="icon-button" data-workforce-time-close>×</button></div>
    <form data-workforce-time-form data-id="${esc(entry.id)}">
      <div class="management-form-grid">
        <label class="management-field"><span>${esc(c.clockIn)}</span><input type="datetime-local" name="clockIn" required value="${esc(toLocalDateTime(entry.clockIn))}"></label>
        <label class="management-field"><span>${esc(c.clockOut)}</span><input type="datetime-local" name="clockOut" value="${esc(toLocalDateTime(entry.clockOut))}"></label>
        <label class="management-field"><span>${esc(c.scheduledStart)}</span><input type="time" name="scheduledStart" value="${esc(entry.scheduledStart || "")}"></label>
        <label class="management-field"><span>${esc(c.breakMinutes)}</span><input type="number" min="0" name="breakMinutes" value="${esc(entry.breakMinutes || 0)}"></label>
        <label class="management-field"><span>${esc(c.hourlyRate)}</span><input type="number" min="0" name="hourlyRate" value="${esc(entry.hourlyRate || 0)}"></label>
        <label class="management-field full-width"><span>${esc(c.note)}</span><input type="text" name="note" value="${esc(entry.note || "")}"></label>
      </div>
      <p class="account-form-message workforce-time-error" data-workforce-time-error></p>
      <div class="account-form-actions"><button type="button" class="secondary-button" data-workforce-time-close>${esc(c.cancel)}</button><button type="submit" class="primary-button">${esc(c.save)}</button></div>
    </form>
  </section>`;
  document.body.append(host);
}

async function saveTimeForm(form) {
  if (!canManageTime()) return;
  const c = copy();
  const errorBox = form.querySelector("[data-workforce-time-error]");
  const submit = form.querySelector('button[type="submit"]');
  const data = new FormData(form);
  const id = String(form.dataset.id || "");
  const clockInValue = String(data.get("clockIn") || "");
  const clockOutValue = String(data.get("clockOut") || "");
  const clockIn = clockInValue ? new Date(clockInValue).toISOString() : "";
  const clockOut = clockOutValue ? new Date(clockOutValue).toISOString() : null;
  if (!clockIn || (clockOut && new Date(clockOut).getTime() < new Date(clockIn).getTime())) {
    if (errorBox) errorBox.textContent = c.invalidRange;
    return;
  }

  const site = activeSite();
  if (!site) {
    if (errorBox) errorBox.textContent = c.saveErrorBody;
    return;
  }
  if (submit) submit.disabled = true;
  if (errorBox) errorBox.textContent = "";
  try {
    const state = loadState();
    const result = await vpsBusinessState(site);
    const module = result?.modules?.attendance && typeof result.modules.attendance === "object"
      ? structuredClone(result.modules.attendance)
      : { attendance:structuredClone(state?.operations?.attendance || []), payroll:structuredClone(state?.operations?.payroll || {}) };
    const records = Array.isArray(module.attendance) ? module.attendance : [];
    const entry = records.find((item) => item.id === id);
    if (!entry) throw new Error("ATTENDANCE_RECORD_NOT_FOUND");
    entry.clockIn = clockIn;
    entry.clockOut = clockOut;
    entry.scheduledStart = String(data.get("scheduledStart") || "");
    entry.breakMinutes = Math.max(0, Number(data.get("breakMinutes") || 0));
    entry.hourlyRate = Math.max(0, Number(data.get("hourlyRate") || 0));
    entry.note = String(data.get("note") || "");
    if (!module.payroll) module.payroll = structuredClone(state?.operations?.payroll || {});
    const expected = Number(result?.moduleRevisions?.attendance);
    if (!Number.isInteger(expected) || expected < 0) throw new Error("ATTENDANCE_REVISION_REQUIRED");
    await vpsSaveBusinessState(site, { attendance:module }, { attendance:expected });
    document.querySelector("[data-workforce-time-modal]")?.remove();
    notify("success", c.saveSuccess, c.saveSuccessBody);
    window.setTimeout(() => location.reload(), 450);
  } catch (error) {
    if (errorBox) errorBox.textContent = `${c.saveErrorBody} (${String(error?.code || error?.message || "ERROR")})`;
    notify("error", c.saveError, c.saveErrorBody);
    if (submit) submit.disabled = false;
  }
}

document.addEventListener("click", (event) => {
  const edit = event.target.closest?.("[data-workforce-edit-attendance]");
  if (edit) {
    event.preventDefault();
    openTimeEditor(edit.dataset.workforceEditAttendance || "");
    return;
  }
  const close = event.target.closest?.("[data-workforce-time-close]");
  if (close) {
    event.preventDefault();
    document.querySelector("[data-workforce-time-modal]")?.remove();
    return;
  }
  if (!canManageTime()) {
    const forbidden = event.target.closest?.('[data-action="attendance-edit"], [data-action="schedule-add"], [data-action="schedule-edit"], [data-action="schedule-delete"]');
    if (forbidden) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }
}, true);

document.addEventListener("submit", (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.matches("[data-workforce-time-form]")) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void saveTimeForm(form);
}, true);

document.addEventListener("change", (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.name?.startsWith("perm:attendance:")) {
    const grid = target.closest(".permission-grid");
    if (grid) syncPermissionGrid(grid, false);
    return;
  }
  if (target instanceof HTMLSelectElement && target.name === "role" && target.closest("[data-account-form]")) {
    queueMicrotask(requestDecorate);
    return;
  }
  if (!(target instanceof HTMLInputElement) || !target.matches("[data-workforce-payroll-month]")) return;
  payrollMonth = target.value;
  forceRender = true;
  requestDecorate();
}, true);

window.addEventListener("hashchange", requestDecorate);
window.addEventListener("shitu:accounts-synced", requestDecorate);
const observer = new MutationObserver(requestDecorate);
observer.observe(document.documentElement, { childList:true, subtree:true });
requestDecorate();
