import { accountCan, currentAccountSession } from "./account-permissions.js";
import { calculateAttendance } from "./operations.js";
import { apiRequest } from "./vps-api.js";

const STATE_KEY = "shitu-kitchen-os-v1";
const ACTIVE_SITE_KEY = "shitu-admin-active-site-v1";
const MANAGER_ROLES = new Set(["admin", "manager"]);
let renderPending = false;
let actionPending = false;

function copy() {
  const zh = document.documentElement.lang === "zh-Hant";
  return zh ? {
    approved:"已核准",
    pending:"待核准",
    approve:"核准出勤",
    openShift:"未打下班卡",
    period:"薪資期間",
    openPeriod:"開放中",
    lockedPeriod:"已鎖定",
    lock:"鎖定薪資期間",
    reopen:"重新開啟",
    reopenReason:"重新開啟原因",
    reopenPlaceholder:"請填寫需要修正此期間的原因",
    approvedShifts:"已核准班次",
    pendingShifts:"待核准班次",
    payrollApprovedOnly:"薪資僅計算已核准且完成的出勤紀錄。",
    lockedPolicy:"此期間使用鎖定當下的薪資規則快照。",
    lockReady:"所有完成班次皆已核准，可鎖定此期間。",
    lockBlocked:"需先完成打卡並核准所有班次，才能鎖定。",
    noApproved:"此月份尚無已核准出勤。",
    shifts:"班次",
    hours:"工時",
    gross:"應計薪資",
    deductions:"扣款",
    net:"暫估實領",
    staff:"員工",
    success:"已更新薪資流程",
    error:"薪資流程更新失敗",
    lockedEdit:"此月份已鎖定；需先重新開啟才能修正出勤。",
    incomplete:"班次尚未完成，無法核准。",
    openBlocking:"仍有未完成打卡，無法鎖定。",
    approvalBlocking:"仍有完成班次尚未核准，無法鎖定。",
    emptyBlocking:"此月份沒有可鎖定的完成班次。",
    reasonRequired:"重新開啟時必須填寫原因。",
  } : {
    approved:"Đã duyệt",
    pending:"Chờ duyệt",
    approve:"Duyệt công",
    openShift:"Chưa chấm tan",
    period:"Kỳ lương",
    openPeriod:"Đang mở",
    lockedPeriod:"Đã khóa",
    lock:"Khóa kỳ lương",
    reopen:"Mở lại kỳ",
    reopenReason:"Lý do mở lại",
    reopenPlaceholder:"Nhập lý do cần sửa dữ liệu của kỳ này",
    approvedShifts:"Ca đã duyệt",
    pendingShifts:"Ca chờ duyệt",
    payrollApprovedOnly:"Bảng lương chỉ tính các ca đã hoàn tất và được quản lý duyệt.",
    lockedPolicy:"Kỳ này dùng snapshot quy tắc lương tại thời điểm khóa.",
    lockReady:"Tất cả ca hoàn tất đã được duyệt; kỳ này có thể khóa.",
    lockBlocked:"Cần hoàn tất chấm công và duyệt toàn bộ ca trước khi khóa kỳ.",
    noApproved:"Tháng này chưa có ca đã duyệt.",
    shifts:"Ca",
    hours:"Giờ làm",
    gross:"Lương trước khấu trừ",
    deductions:"Khấu trừ",
    net:"Thực nhận tạm tính",
    staff:"Nhân viên",
    success:"Đã cập nhật quy trình lương",
    error:"Không cập nhật được quy trình lương",
    lockedEdit:"Tháng này đã khóa; phải mở lại kỳ trước khi sửa chấm công.",
    incomplete:"Ca chưa hoàn tất nên chưa thể duyệt.",
    openBlocking:"Vẫn còn ca chưa chấm tan nên chưa thể khóa kỳ.",
    approvalBlocking:"Vẫn còn ca hoàn tất chưa được duyệt nên chưa thể khóa kỳ.",
    emptyBlocking:"Tháng này chưa có ca hoàn tất để khóa.",
    reasonRequired:"Phải nhập lý do khi mở lại kỳ lương.",
  };
}

function loadState() {
  try { return JSON.parse(localStorage.getItem(STATE_KEY) || "null"); }
  catch { return null; }
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
  return Boolean(session && MANAGER_ROLES.has(role) && accountCan(session, "attendance", "edit"));
}

function activeSite() {
  const session = currentAccountSession();
  if (["central", "fuxing", "yongji"].includes(session?.location)) return session.location;
  if (session?.location === "all") {
    const saved = localStorage.getItem(ACTIVE_SITE_KEY);
    return ["central", "fuxing", "yongji"].includes(saved) ? saved : "fuxing";
  }
  return "";
}

function periodFor(state, month) {
  const periods = state?.operations?.payroll?.periods;
  return periods && typeof periods === "object" && !Array.isArray(periods) ? periods[month] || null : null;
}

function policyFor(state, month) {
  const period = periodFor(state, month);
  if (period?.status === "locked" && period.policySnapshot && typeof period.policySnapshot === "object") {
    return period.policySnapshot;
  }
  return state?.operations?.payroll || {};
}

function isApproved(entry) {
  return entry?.approvalStatus === "approved";
}

function notify(type, title, body) {
  window.dispatchEvent(new CustomEvent("shitu:notify", { detail:{ type, title, body } }));
}

function errorMessage(error) {
  const c = copy();
  const code = String(error?.code || error?.message || "");
  if (code === "WORKFORCE_ATTENDANCE_INCOMPLETE") return c.incomplete;
  if (code === "WORKFORCE_PAYROLL_OPEN_SHIFTS") return c.openBlocking;
  if (code === "WORKFORCE_PAYROLL_UNAPPROVED_SHIFTS") return c.approvalBlocking;
  if (code === "WORKFORCE_PAYROLL_PERIOD_EMPTY") return c.emptyBlocking;
  if (code === "WORKFORCE_REOPEN_REASON_REQUIRED") return c.reasonRequired;
  if (code === "WORKFORCE_PAYROLL_PERIOD_LOCKED") return c.lockedEdit;
  return code || c.error;
}

async function postWorkforce(path, body) {
  if (actionPending) return;
  actionPending = true;
  document.querySelectorAll("[data-workforce-approval-action]").forEach((button) => { if ("disabled" in button) button.disabled = true; });
  try {
    await apiRequest(path, { method:"POST", body });
    notify("success", copy().success, "VPS OK");
    location.reload();
  } catch (error) {
    const message = errorMessage(error);
    notify("error", copy().error, message);
    actionPending = false;
    document.querySelectorAll("[data-workforce-approval-action]").forEach((button) => { if ("disabled" in button) button.disabled = false; });
  }
}

function attendancePeriodMarkup(state, month) {
  const c = copy();
  const period = periodFor(state, month);
  const locked = period?.status === "locked";
  return `<section class="workforce-period-banner" data-workforce-period-banner data-status="${locked ? "locked" : "open"}">
    <div><strong>${esc(c.period)} · ${esc(month)}</strong><small>${esc(locked ? c.lockedPeriod : c.openPeriod)}</small></div>
    ${locked && period.lockedByName ? `<span>${esc(period.lockedByName)}</span>` : ""}
  </section>`;
}

function decorateAttendance(root, state) {
  if (!managerAccount()) return;
  const date = String(state?.selectedDate || "");
  const month = date.slice(0, 7);
  const period = periodFor(state, month);
  const locked = period?.status === "locked";
  const managerDay = root.querySelector("[data-workforce-manager-day]");
  if (!managerDay) return;

  let banner = root.querySelector("[data-workforce-period-banner]");
  const bannerSignature = `${month}|${locked ? "locked" : "open"}|${period?.lockedAt || ""}`;
  if (!banner) {
    managerDay.insertAdjacentHTML("afterbegin", attendancePeriodMarkup(state, month));
    banner = root.querySelector("[data-workforce-period-banner]");
  } else if (banner.dataset.signature !== bannerSignature) {
    banner.outerHTML = attendancePeriodMarkup(state, month);
    banner = root.querySelector("[data-workforce-period-banner]");
  }
  if (banner) banner.dataset.signature = bannerSignature;

  const entries = (state?.operations?.attendance || []).filter((entry) => entry.date === date);
  for (const entry of entries) {
    const escapedId = globalThis.CSS?.escape ? CSS.escape(String(entry.id)) : String(entry.id).replaceAll('"', '\\"');
    const edit = root.querySelector(`[data-workforce-edit-attendance="${escapedId}"]`);
    const row = edit?.closest(".workforce-attendance-row");
    if (!row) continue;
    const wage = calculateAttendance(entry, state.operations.payroll || {});
    const actions = row.querySelector(".attendance-actions");
    if (!actions) continue;

    let badge = row.querySelector("[data-workforce-approval-status]");
    if (!badge) {
      badge = document.createElement("span");
      badge.dataset.workforceApprovalStatus = "";
      badge.className = "workforce-approval-status";
      row.querySelector(".attendance-person")?.append(badge);
    }
    const status = isApproved(entry) ? "approved" : wage.complete ? "pending" : "open";
    badge.dataset.status = status;
    badge.textContent = status === "approved" ? copy().approved : status === "pending" ? copy().pending : copy().openShift;

    if (edit) {
      edit.disabled = locked;
      edit.title = locked ? copy().lockedEdit : "";
    }
    actions.querySelector("[data-workforce-approve-attendance]")?.remove();
    if (!locked && wage.complete && !isApproved(entry)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary-button workforce-approve-button";
      button.dataset.workforceApproveAttendance = String(entry.id);
      button.dataset.workforceApprovalAction = "";
      button.textContent = copy().approve;
      actions.prepend(button);
    }
  }
}

function payrollRows(state, month) {
  const policy = policyFor(state, month);
  const all = (state?.operations?.attendance || []).filter((entry) => String(entry?.date || "").startsWith(`${month}-`));
  const complete = all.filter((entry) => calculateAttendance(entry, policy).complete);
  const approved = complete.filter(isApproved);
  const pending = complete.filter((entry) => !isApproved(entry));
  const open = all.filter((entry) => !calculateAttendance(entry, policy).complete);
  const byStaff = new Map();
  for (const entry of approved) {
    const wage = calculateAttendance(entry, policy);
    const key = String(entry.staffId || entry.staffName || "");
    const row = byStaff.get(key) || { staffName:entry.staffName || key, shifts:0, minutes:0, gross:0, deduction:0, net:0 };
    row.shifts += 1;
    row.minutes += wage.totalMinutes;
    row.gross += wage.gross;
    row.deduction += wage.deduction;
    row.net += wage.net;
    byStaff.set(key, row);
  }
  return { all, complete, approved, pending, open, rows:[...byStaff.values()].sort((a, b) => String(a.staffName).localeCompare(String(b.staffName))) };
}

function approvedPayrollMarkup(state, month) {
  const c = copy();
  const period = periodFor(state, month);
  const locked = period?.status === "locked";
  const data = payrollRows(state, month);
  const totals = data.rows.reduce((sum, row) => ({
    shifts:sum.shifts + row.shifts,
    minutes:sum.minutes + row.minutes,
    gross:sum.gross + row.gross,
    deduction:sum.deduction + row.deduction,
    net:sum.net + row.net,
  }), { shifts:0, minutes:0, gross:0, deduction:0, net:0 });
  const ready = data.complete.length > 0 && data.open.length === 0 && data.pending.length === 0;
  const tableRows = data.rows.map((row) => `<tr><td>${esc(row.staffName)}</td><td>${row.shifts}</td><td>${number(row.minutes / 60)}</td><td>NT$${number(row.gross)}</td><td>NT$${number(row.deduction)}</td><td><strong>NT$${number(row.net)}</strong></td></tr>`).join("");
  const managerControls = managerAccount()
    ? locked
      ? `<form class="workforce-period-reopen" data-workforce-reopen-form data-month="${esc(month)}"><label><span>${esc(c.reopenReason)}</span><input name="reason" required minlength="3" maxlength="240" placeholder="${esc(c.reopenPlaceholder)}"></label><button type="submit" class="secondary-button" data-workforce-approval-action>${esc(c.reopen)}</button></form>`
      : `<div class="workforce-period-lock"><p>${esc(ready ? c.lockReady : c.lockBlocked)}</p><button type="button" class="primary-button" data-workforce-lock-period="${esc(month)}" data-workforce-approval-action ${ready ? "" : "disabled"}>${esc(c.lock)}</button></div>`
    : "";
  return `<section class="workforce-approved-payroll" data-workforce-approved-payroll data-month="${esc(month)}">
    <article class="card workforce-period-card" data-status="${locked ? "locked" : "open"}">
      <div class="card-heading"><div><h2>${esc(c.period)} · ${esc(month)}</h2><p>${esc(locked ? c.lockedPeriod : c.openPeriod)} · ${esc(c.payrollApprovedOnly)}</p></div><span class="workforce-period-status">${esc(locked ? c.lockedPeriod : c.openPeriod)}</span></div>
      <div class="stats-grid attendance-stats workforce-approval-stats">
        <article class="stat-card stat-green"><div class="stat-top"><span>${esc(c.approvedShifts)}</span></div><div class="stat-value">${data.approved.length}</div><p>${esc(c.shifts)}</p></article>
        <article class="stat-card stat-amber"><div class="stat-top"><span>${esc(c.pendingShifts)}</span></div><div class="stat-value">${data.pending.length}</div><p>${data.open.length} ${esc(c.openShift)}</p></article>
        <article class="stat-card stat-blue"><div class="stat-top"><span>${esc(c.hours)}</span></div><div class="stat-value">${number(totals.minutes / 60)}</div><p>${esc(c.hours)}</p></article>
        <article class="stat-card"><div class="stat-top"><span>${esc(c.net)}</span></div><div class="stat-value">${number(totals.net)}<span>NT$</span></div><p>${esc(c.gross)} NT$${number(totals.gross)}</p></article>
      </div>
      ${locked ? `<p class="workforce-payroll-caveat">${esc(c.lockedPolicy)}</p>` : ""}
      ${managerControls}
    </article>
    <article class="card workforce-approved-payroll-card"><div class="card-heading"><div><h2>${esc(c.approvedShifts)}</h2><p>${esc(c.payrollApprovedOnly)}</p></div></div>
      <div class="report-table-wrap"><table class="report-table"><thead><tr><th>${esc(c.staff)}</th><th>${esc(c.shifts)}</th><th>${esc(c.hours)}</th><th>${esc(c.gross)}</th><th>${esc(c.deductions)}</th><th>${esc(c.net)}</th></tr></thead><tbody>${tableRows || `<tr><td colspan="6">${esc(c.noApproved)}</td></tr>`}</tbody></table></div>
    </article>
  </section>`;
}

function decoratePayroll(root, state) {
  const panel = root.querySelector("[data-workforce-payroll-panel]");
  if (!panel) return;
  const month = panel.querySelector("[data-workforce-payroll-month]")?.value || String(state?.selectedDate || "").slice(0, 7);
  const period = periodFor(state, month);
  const data = payrollRows(state, month);
  const signature = `${month}|${period?.status || "open"}|${period?.lockedAt || ""}|${period?.reopenedAt || ""}|${data.all.map((entry) => `${entry.id}:${entry.approvalStatus || ""}:${entry.clockOut || ""}`).join("|")}`;

  const legacyStats = panel.querySelector(".workforce-payroll-stats");
  const legacyCard = panel.querySelector(".workforce-payroll-card");
  if (legacyStats) legacyStats.hidden = true;
  if (legacyCard) legacyCard.hidden = true;

  let approvedPanel = panel.querySelector("[data-workforce-approved-payroll]");
  if (approvedPanel?.dataset.signature === signature) return;
  approvedPanel?.remove();
  panel.insertAdjacentHTML("beforeend", approvedPayrollMarkup(state, month));
  approvedPanel = panel.querySelector("[data-workforce-approved-payroll]");
  if (approvedPanel) approvedPanel.dataset.signature = signature;
}

function decorate() {
  renderPending = false;
  const panel = panelFromHash();
  if (!panel || panel === "schedule") return;
  const root = document.querySelector("#app");
  const state = loadState();
  if (!root || !state?.operations || !root.querySelector("[data-workforce-tabs]")) return;
  if (panel === "attendance") decorateAttendance(root, state);
  if (panel === "payroll") decoratePayroll(root, state);
}

function requestDecorate() {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(decorate);
}

document.addEventListener("click", (event) => {
  const approve = event.target.closest?.("[data-workforce-approve-attendance]");
  if (approve) {
    event.preventDefault();
    if (!managerAccount()) return;
    const site = activeSite();
    const id = String(approve.dataset.workforceApproveAttendance || "");
    if (site && id) void postWorkforce(`/api/workforce/${encodeURIComponent(site)}/attendance/${encodeURIComponent(id)}/approve`);
    return;
  }
  const lock = event.target.closest?.("[data-workforce-lock-period]");
  if (lock) {
    event.preventDefault();
    if (!managerAccount() || lock.disabled) return;
    const site = activeSite();
    const month = String(lock.dataset.workforceLockPeriod || "");
    if (site && month) void postWorkforce(`/api/workforce/${encodeURIComponent(site)}/payroll-periods/${encodeURIComponent(month)}/lock`);
  }
}, true);

document.addEventListener("submit", (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.matches("[data-workforce-reopen-form]")) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (!managerAccount()) return;
  const site = activeSite();
  const month = String(form.dataset.month || "");
  const reason = String(new FormData(form).get("reason") || "").trim();
  if (reason.length < 3) {
    notify("error", copy().error, copy().reasonRequired);
    return;
  }
  if (site && month) void postWorkforce(`/api/workforce/${encodeURIComponent(site)}/payroll-periods/${encodeURIComponent(month)}/reopen`, { reason });
}, true);

window.addEventListener("hashchange", requestDecorate);
window.addEventListener("shitu:accounts-synced", requestDecorate);
window.addEventListener("shitu:business-state-updated", requestDecorate);
document.addEventListener("change", (event) => {
  if (event.target instanceof HTMLInputElement && event.target.matches("[data-workforce-payroll-month]")) requestDecorate();
}, true);

const observer = new MutationObserver(requestDecorate);
observer.observe(document.documentElement, { childList:true, subtree:true });
requestDecorate();
