import { accountCan, currentAccountSession } from "./account-permissions.js";
import { apiRequest, vpsBusinessState } from "./vps-api.js";

const STATE_KEY = "shitu-kitchen-os-v1";
const ACTIVE_SITE_KEY = "shitu-admin-active-site-v1";
const MANAGER_ROLES = new Set(["admin", "manager"]);
const SELF_SERVICE_ROLES = new Set(["employee", "parttime"]);
let remoteKey = "";
let remoteAttendance = null;
let loadPending = null;
let decoratePending = false;
let actionPending = false;

function copy() {
  const zh = document.documentElement.lang === "zh-Hant";
  return zh ? {
    request:"申請修正",
    title:"出勤修正申請",
    subtitle:"員工只能提出申請；核准後原出勤核准會失效，需重新審核後才能進入薪資。",
    current:"目前紀錄",
    correctedIn:"修正上班時間",
    correctedOut:"修正下班時間",
    reason:"修正原因",
    reasonPlaceholder:"例如：忘記打卡、打卡時間錯誤",
    submit:"送出修正申請",
    cancel:"取消申請",
    queue:"待審核修正",
    history:"修正申請紀錄",
    approve:"核准修正",
    reject:"拒絕",
    rejectReason:"拒絕原因",
    pending:"待審核",
    approved:"已核准",
    rejected:"已拒絕",
    cancelled:"已取消",
    empty:"目前沒有出勤修正申請。",
    saved:"出勤修正申請已更新",
    saveError:"無法更新出勤修正申請",
    invalid:"請填寫有效時間，且下班時間不可早於上班時間。",
    noChange:"修正時間必須與目前紀錄不同。",
    locked:"此月份薪資已鎖定，需由管理者先重新開啟薪資期間。",
    stale:"原出勤紀錄已變更，請重新提出修正申請。",
    pendingExists:"此筆出勤已有待審核修正申請。",
    reasonRequired:"原因至少需要 3 個字元。",
    decisionRequired:"拒絕原因至少需要 3 個字元。",
    reapprove:"修正核准後，此筆出勤需重新核准才能計入鎖定薪資。",
  } : {
    request:"Yêu cầu sửa công",
    title:"Yêu cầu chỉnh sửa chấm công",
    subtitle:"Nhân viên chỉ gửi yêu cầu; sau khi duyệt, lần xác nhận chấm công cũ bị hủy và phải duyệt lại trước khi vào bảng lương.",
    current:"Dữ liệu hiện tại",
    correctedIn:"Giờ vào đề nghị",
    correctedOut:"Giờ ra đề nghị",
    reason:"Lý do chỉnh sửa",
    reasonPlaceholder:"Ví dụ: quên chấm công, thời gian chấm sai",
    submit:"Gửi yêu cầu chỉnh sửa",
    cancel:"Hủy yêu cầu",
    queue:"Yêu cầu chờ duyệt",
    history:"Lịch sử yêu cầu chỉnh sửa",
    approve:"Duyệt chỉnh sửa",
    reject:"Từ chối",
    rejectReason:"Lý do từ chối",
    pending:"Chờ duyệt",
    approved:"Đã duyệt",
    rejected:"Từ chối",
    cancelled:"Đã hủy",
    empty:"Hiện chưa có yêu cầu chỉnh sửa chấm công.",
    saved:"Đã cập nhật yêu cầu chỉnh sửa chấm công",
    saveError:"Không cập nhật được yêu cầu chỉnh sửa chấm công",
    invalid:"Hãy nhập thời gian hợp lệ; giờ ra không được sớm hơn giờ vào.",
    noChange:"Thời gian đề nghị phải khác dữ liệu hiện tại.",
    locked:"Tháng lương này đã khóa; quản lý cần mở lại kỳ lương trước.",
    stale:"Dữ liệu chấm công gốc đã thay đổi; hãy gửi lại yêu cầu mới.",
    pendingExists:"Bản ghi này đã có yêu cầu chỉnh sửa đang chờ duyệt.",
    reasonRequired:"Lý do phải có ít nhất 3 ký tự.",
    decisionRequired:"Lý do từ chối phải có ít nhất 3 ký tự.",
    reapprove:"Sau khi sửa được duyệt, bản ghi chấm công này phải được duyệt lại trước khi khóa lương.",
  };
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function session() {
  return currentAccountSession();
}

function role(user = session()) {
  return String(user?.accountRole || user?.role || "");
}

function canViewAttendance(user = session()) {
  return Boolean(user && (role(user) === "admin" || accountCan(user, "attendance", "view")));
}

function managerAccount(user = session()) {
  return Boolean(user && MANAGER_ROLES.has(role(user)) && (role(user) === "admin" || accountCan(user, "attendance", "edit")));
}

function selfServiceAccount(user = session()) {
  return Boolean(user && SELF_SERVICE_ROLES.has(role(user)) && canViewAttendance(user));
}

function activeSite(user = session()) {
  if (["central", "fuxing", "yongji"].includes(user?.location)) return user.location;
  if (user?.location === "all") {
    const saved = localStorage.getItem(ACTIVE_SITE_KEY);
    return ["central", "fuxing", "yongji"].includes(saved) ? saved : "fuxing";
  }
  return "";
}

function onAttendancePanel() {
  const value = String(location.hash || "").replace(/^#\/?/, "");
  const [route, query = ""] = value.split("?");
  return route === "attendance" && new URLSearchParams(query).get("workforce") !== "payroll";
}

function loadState() {
  try { return JSON.parse(localStorage.getItem(STATE_KEY) || "null"); }
  catch { return null; }
}

function toLocalDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function displayDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat(document.documentElement.lang === "zh-Hant" ? "zh-TW" : "vi-VN", {
    month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hour12:false,
  }).format(date);
}

function statusLabel(status, c = copy()) {
  if (status === "approved") return c.approved;
  if (status === "rejected") return c.rejected;
  if (status === "cancelled") return c.cancelled;
  return c.pending;
}

function notify(type, title, body) {
  window.dispatchEvent(new CustomEvent("shitu:notify", { detail:{ type, title, body } }));
}

function errorMessage(error) {
  const c = copy();
  const code = String(error?.code || error?.message || "");
  if (code === "WORKFORCE_CORRECTION_REASON_REQUIRED") return c.reasonRequired;
  if (code === "WORKFORCE_CORRECTION_DECISION_NOTE_REQUIRED") return c.decisionRequired;
  if (code === "WORKFORCE_CORRECTION_TIME_INVALID") return c.invalid;
  if (code === "WORKFORCE_CORRECTION_NO_CHANGE") return c.noChange;
  if (code === "WORKFORCE_CORRECTION_PENDING_EXISTS") return c.pendingExists;
  if (code === "WORKFORCE_CORRECTION_SOURCE_CHANGED") return c.stale;
  if (code === "WORKFORCE_PAYROLL_PERIOD_LOCKED") return c.locked;
  return code || c.saveError;
}

async function refreshRemote(force = false) {
  const user = session();
  const site = activeSite(user);
  if (!user?.id || !site || !canViewAttendance(user)) return null;
  const key = `${user.id}:${site}`;
  if (!force && remoteKey === key && remoteAttendance) return remoteAttendance;
  if (!force && loadPending) return loadPending;
  remoteKey = key;
  const pending = vpsBusinessState(site)
    .then((result) => {
      if (`${session()?.id || ""}:${activeSite()}` !== key) return null;
      remoteAttendance = result?.modules?.attendance && typeof result.modules.attendance === "object"
        ? result.modules.attendance
        : { attendance:[], correctionRequests:[], payroll:{} };
      requestDecorate();
      return remoteAttendance;
    })
    .catch(() => null)
    .finally(() => { if (loadPending === pending) loadPending = null; });
  loadPending = pending;
  return pending;
}

function requests(module = remoteAttendance) {
  return Array.isArray(module?.correctionRequests) ? module.correctionRequests : [];
}

function attendanceRows(module = remoteAttendance) {
  return Array.isArray(module?.attendance) ? module.attendance : [];
}

function requestCard(item, { manager = false, selfService = false } = {}) {
  const c = copy();
  const status = String(item?.status || "pending");
  const before = item?.sourceSnapshot || {};
  const pendingActions = status === "pending" && manager
    ? `<div class="attendance-correction-manager-actions">
        <button type="button" class="primary-button" data-attendance-correction-approve="${esc(item.id)}">${esc(c.approve)}</button>
        <form data-attendance-correction-reject data-request-id="${esc(item.id)}">
          <input name="note" minlength="3" required placeholder="${esc(c.rejectReason)}">
          <button type="submit" class="secondary-button">${esc(c.reject)}</button>
        </form>
      </div>`
    : status === "pending" && selfService
      ? `<button type="button" class="secondary-button" data-attendance-correction-cancel="${esc(item.id)}">${esc(c.cancel)}</button>`
      : "";
  return `<article class="attendance-correction-row" data-correction-status="${esc(status)}">
    <div class="attendance-correction-main">
      <div class="attendance-correction-heading"><strong>${esc(item.staffName || "")}</strong><span class="workforce-request-status" data-status="${esc(status)}">${esc(statusLabel(status, c))}</span></div>
      <small>${esc(item.date || "")} · ${esc(displayDateTime(before.clockIn))} → ${esc(displayDateTime(before.clockOut))}</small>
      <div class="attendance-correction-arrow">→ ${esc(displayDateTime(item.requestedClockIn))} → ${esc(displayDateTime(item.requestedClockOut))}</div>
      <p>${esc(item.reason || "")}</p>
      ${item.decisionNote ? `<p class="attendance-correction-decision">${esc(item.decisionNote)}</p>` : ""}
    </div>${pendingActions}
  </article>`;
}

function decorateSelfService(state, module) {
  const c = copy();
  const date = String(state?.selectedDate || "");
  const dayEntries = attendanceRows(module).filter((entry) => String(entry?.date || "") === date);
  const pendingByAttendance = new Set(requests(module).filter((item) => item?.status === "pending").map((item) => String(item.attendanceId || "")));
  const rows = [...document.querySelectorAll(".attendance-list-card .attendance-list .attendance-row")];
  rows.forEach((row, index) => {
    row.querySelector("[data-attendance-correction-open]")?.remove();
    const entry = dayEntries[index];
    if (!entry?.id || pendingByAttendance.has(String(entry.id))) return;
    const actions = row.querySelector(".attendance-actions");
    if (!actions) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-button attendance-correction-request-button";
    button.dataset.attendanceCorrectionOpen = String(entry.id);
    button.textContent = c.request;
    actions.append(button);
  });

  document.querySelector("[data-attendance-correction-panel]")?.remove();
  const ownRequests = [...requests(module)].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const host = document.createElement("section");
  host.dataset.attendanceCorrectionPanel = "";
  host.className = "card attendance-correction-panel";
  host.innerHTML = `<div class="card-heading"><div><h2>${esc(c.history)}</h2><p>${esc(c.subtitle)}</p></div><span class="tag tag-neutral">${ownRequests.length}</span></div>
    <div class="attendance-correction-list">${ownRequests.map((item) => requestCard(item, { selfService:true })).join("") || `<p class="empty-state">${esc(c.empty)}</p>`}</div>`;
  const layout = document.querySelector(".attendance-layout");
  const tabs = document.querySelector("[data-workforce-tabs]");
  (layout || tabs)?.insertAdjacentElement("afterend", host);
}

function decorateManager(module) {
  const c = copy();
  document.querySelector("[data-attendance-correction-panel]")?.remove();
  const all = [...requests(module)].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const pending = all.filter((item) => item?.status === "pending");
  const history = all.filter((item) => item?.status !== "pending").slice(0, 50);
  const host = document.createElement("section");
  host.dataset.attendanceCorrectionPanel = "";
  host.className = "attendance-correction-manager-grid";
  host.innerHTML = `<article class="card attendance-correction-panel"><div class="card-heading"><div><h2>${esc(c.queue)}</h2><p>${esc(c.reapprove)}</p></div><span class="tag ${pending.length ? "tag-low" : "tag-ok"}">${pending.length}</span></div>
      <div class="attendance-correction-list">${pending.map((item) => requestCard(item, { manager:true })).join("") || `<p class="empty-state">${esc(c.empty)}</p>`}</div></article>
    <article class="card attendance-correction-panel"><div class="card-heading"><div><h2>${esc(c.history)}</h2><p>${esc(c.subtitle)}</p></div><span class="tag tag-neutral">${history.length}</span></div>
      <div class="attendance-correction-list">${history.map((item) => requestCard(item)).join("") || `<p class="empty-state">${esc(c.empty)}</p>`}</div></article>`;
  const managerDay = document.querySelector("[data-workforce-manager-day]");
  const tabs = document.querySelector("[data-workforce-tabs]");
  (managerDay || tabs)?.insertAdjacentElement("afterend", host);
}

function openCorrectionModal(id) {
  if (!selfServiceAccount()) return;
  const entry = attendanceRows().find((item) => String(item?.id || "") === String(id || ""));
  if (!entry) return;
  const c = copy();
  document.querySelector("[data-attendance-correction-modal]")?.remove();
  const host = document.createElement("div");
  host.className = "modal-backdrop attendance-correction-modal-backdrop";
  host.dataset.attendanceCorrectionModal = "";
  host.innerHTML = `<section class="modal-card attendance-correction-modal" role="dialog" aria-modal="true">
    <div class="card-heading"><div><h2>${esc(c.title)}</h2><p>${esc(entry.staffName)} · ${esc(entry.date)}</p></div><button type="button" class="icon-button" data-attendance-correction-close>×</button></div>
    <form data-attendance-correction-form data-attendance-id="${esc(entry.id)}">
      <p class="helper-text"><strong>${esc(c.current)}:</strong> ${esc(displayDateTime(entry.clockIn))} → ${esc(displayDateTime(entry.clockOut))}</p>
      <div class="management-form-grid">
        <label class="management-field"><span>${esc(c.correctedIn)}</span><input type="datetime-local" name="clockIn" required value="${esc(toLocalDateTime(entry.clockIn))}"></label>
        <label class="management-field"><span>${esc(c.correctedOut)}</span><input type="datetime-local" name="clockOut" value="${esc(toLocalDateTime(entry.clockOut))}"></label>
        <label class="management-field full-width"><span>${esc(c.reason)}</span><textarea name="reason" minlength="3" required rows="3" placeholder="${esc(c.reasonPlaceholder)}"></textarea></label>
      </div>
      <p class="account-form-message" data-attendance-correction-error></p>
      <div class="account-form-actions"><button type="button" class="secondary-button" data-attendance-correction-close>${esc(c.cancel)}</button><button type="submit" class="primary-button">${esc(c.submit)}</button></div>
    </form>
  </section>`;
  document.body.append(host);
}

async function createCorrection(form) {
  if (actionPending || !selfServiceAccount()) return;
  const c = copy();
  const data = new FormData(form);
  const clockInRaw = String(data.get("clockIn") || "");
  const clockOutRaw = String(data.get("clockOut") || "");
  const clockInDate = new Date(clockInRaw);
  const clockOutDate = clockOutRaw ? new Date(clockOutRaw) : null;
  const error = form.querySelector("[data-attendance-correction-error]");
  if (!clockInRaw || !Number.isFinite(clockInDate.getTime()) || (clockOutDate && (!Number.isFinite(clockOutDate.getTime()) || clockOutDate < clockInDate))) {
    if (error) error.textContent = c.invalid;
    return;
  }
  const reason = String(data.get("reason") || "").trim();
  if (reason.length < 3) {
    if (error) error.textContent = c.reasonRequired;
    return;
  }
  const entry = attendanceRows().find((item) => String(item?.id || "") === String(form.dataset.attendanceId || ""));
  if (!entry) return;
  const requestedClockIn = clockInDate.toISOString();
  const requestedClockOut = clockOutDate ? clockOutDate.toISOString() : null;
  if (requestedClockIn === entry.clockIn && requestedClockOut === (entry.clockOut ?? null)) {
    if (error) error.textContent = c.noChange;
    return;
  }
  actionPending = true;
  const submit = form.querySelector('button[type="submit"]');
  if (submit) submit.disabled = true;
  try {
    await apiRequest(`/api/workforce/${encodeURIComponent(activeSite())}/attendance-corrections`, {
      method:"POST",
      body:{ attendanceId:entry.id, requestedClockIn, requestedClockOut, reason },
    });
    document.querySelector("[data-attendance-correction-modal]")?.remove();
    await refreshRemote(true);
    notify("success", c.saved, c.reapprove);
  } catch (err) {
    if (error) error.textContent = errorMessage(err);
    if (submit) submit.disabled = false;
  } finally {
    actionPending = false;
  }
}

async function mutateRequest(id, action, body) {
  if (actionPending) return;
  const c = copy();
  actionPending = true;
  try {
    await apiRequest(`/api/workforce/${encodeURIComponent(activeSite())}/attendance-corrections/${encodeURIComponent(id)}/${action}`, {
      method:"POST", body,
    });
    await refreshRemote(true);
    notify("success", c.saved, c.reapprove);
  } catch (error) {
    notify("error", c.saveError, errorMessage(error));
  } finally {
    actionPending = false;
  }
}

function decorate() {
  decoratePending = false;
  if (!onAttendancePanel() || !canViewAttendance()) {
    document.querySelector("[data-attendance-correction-panel]")?.remove();
    return;
  }
  const state = loadState();
  if (!state?.operations) return;
  if (!remoteAttendance) {
    void refreshRemote(false);
    return;
  }
  if (managerAccount()) decorateManager(remoteAttendance);
  else if (selfServiceAccount()) decorateSelfService(state, remoteAttendance);
  else document.querySelector("[data-attendance-correction-panel]")?.remove();
}

function requestDecorate() {
  if (decoratePending) return;
  decoratePending = true;
  requestAnimationFrame(decorate);
}

document.addEventListener("click", (event) => {
  const open = event.target.closest?.("[data-attendance-correction-open]");
  if (open) {
    event.preventDefault();
    event.stopImmediatePropagation();
    openCorrectionModal(open.dataset.attendanceCorrectionOpen || "");
    return;
  }
  if (event.target.closest?.("[data-attendance-correction-close]")) {
    event.preventDefault();
    document.querySelector("[data-attendance-correction-modal]")?.remove();
    return;
  }
  const cancel = event.target.closest?.("[data-attendance-correction-cancel]");
  if (cancel) {
    event.preventDefault();
    void mutateRequest(cancel.dataset.attendanceCorrectionCancel || "", "cancel");
    return;
  }
  const approve = event.target.closest?.("[data-attendance-correction-approve]");
  if (approve) {
    event.preventDefault();
    void mutateRequest(approve.dataset.attendanceCorrectionApprove || "", "approve", {});
  }
}, true);

document.addEventListener("submit", (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (form.matches("[data-attendance-correction-form]")) {
    event.preventDefault();
    event.stopImmediatePropagation();
    void createCorrection(form);
    return;
  }
  if (form.matches("[data-attendance-correction-reject]")) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const note = String(new FormData(form).get("note") || "").trim();
    if (note.length < 3) {
      notify("error", copy().saveError, copy().decisionRequired);
      return;
    }
    void mutateRequest(form.dataset.requestId || "", "reject", { note });
  }
}, true);

window.addEventListener("hashchange", requestDecorate);
window.addEventListener("shitu:accounts-synced", () => { remoteAttendance = null; remoteKey = ""; requestDecorate(); });
window.addEventListener("shitu:vps-auth-ready", () => { remoteAttendance = null; remoteKey = ""; requestDecorate(); });
window.addEventListener("shitu:business-state-updated", () => { remoteAttendance = null; requestDecorate(); });
const observer = new MutationObserver(requestDecorate);
observer.observe(document.documentElement, { childList:true, subtree:true });
requestDecorate();
