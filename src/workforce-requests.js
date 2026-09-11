import { accountCan, currentAccountSession } from "./account-permissions.js";
import { apiRequest, vpsBusinessState } from "./vps-api.js";

const STATE_KEY = "shitu-kitchen-os-v1";
const ACTIVE_SITE_KEY = "shitu-admin-active-site-v1";
const MANAGER_ROLES = new Set(["admin", "manager"]);
const SELF_SERVICE_ROLES = new Set(["employee", "parttime"]);
let remoteKey = "";
let remoteSchedule = null;
let loadPending = null;
let renderPending = false;
let actionPending = false;

function copy() {
  const zh = document.documentElement.lang === "zh-Hant";
  return zh ? {
    title:"排班申請",
    subtitle:"請假與更改班次由 VPS 留存並由管理者審核，不會自動改變薪資規則。",
    newRequest:"新增申請",
    requestType:"申請類型",
    leave:"請假",
    change:"更改班次",
    date:"日期",
    start:"新開始時間",
    end:"新結束時間",
    reason:"原因",
    reasonPlaceholder:"請填寫申請原因",
    submit:"送出申請",
    pending:"待審核",
    approved:"已核准",
    rejected:"已拒絕",
    cancelled:"已取消",
    cancel:"取消申請",
    queue:"待審核申請",
    history:"申請紀錄",
    approve:"核准",
    reject:"拒絕",
    decisionNote:"審核備註",
    decisionPlaceholder:"拒絕時請填寫原因",
    noPending:"目前沒有待審核申請。",
    noHistory:"目前沒有申請紀錄。",
    effective:"本日排班例外",
    leaveEffective:"本日已核准請假，不計入排定班次。",
    overrideEffective:"本日已核准更改班次",
    loading:"正在讀取 VPS 排班申請…",
    saved:"排班申請已更新",
    saveError:"無法更新排班申請",
    requestRequired:"申請原因至少需要 3 個字元。",
    decisionRequired:"拒絕原因至少需要 3 個字元。",
    pendingExists:"同一天已有待審核申請。",
    scheduleRequired:"更改班次需要先有一筆可唯一辨識的原排班。",
    scheduleChanged:"原排班已變更，請取消舊申請後重新提出。",
    exceptionExists:"此員工當天已有核准的排班例外。",
    scheduleAmbiguous:"原排班不唯一，請先由管理者整理排班。",
    invalidTime:"請填寫有效且不同的開始與結束時間。",
    ownOnly:"只能操作自己的待審核申請。",
    notPending:"此申請已處理，不能再次變更。",
    payrollBoundary:"請假核准只影響排班，不代表有薪／無薪假，也不會自動產生扣款或加班費。",
  } : {
    title:"Yêu cầu lịch làm",
    subtitle:"Đơn nghỉ và đổi ca được lưu trên VPS, quản lý duyệt; không tự thay đổi quy tắc tính lương.",
    newRequest:"Tạo yêu cầu",
    requestType:"Loại yêu cầu",
    leave:"Xin nghỉ",
    change:"Đổi ca",
    date:"Ngày",
    start:"Giờ bắt đầu mới",
    end:"Giờ kết thúc mới",
    reason:"Lý do",
    reasonPlaceholder:"Nhập lý do yêu cầu",
    submit:"Gửi yêu cầu",
    pending:"Chờ duyệt",
    approved:"Đã duyệt",
    rejected:"Từ chối",
    cancelled:"Đã hủy",
    cancel:"Hủy yêu cầu",
    queue:"Yêu cầu chờ duyệt",
    history:"Lịch sử yêu cầu",
    approve:"Duyệt",
    reject:"Từ chối",
    decisionNote:"Ghi chú duyệt",
    decisionPlaceholder:"Khi từ chối cần nhập lý do",
    noPending:"Hiện không có yêu cầu chờ duyệt.",
    noHistory:"Chưa có lịch sử yêu cầu.",
    effective:"Ngoại lệ lịch làm hôm nay",
    leaveEffective:"Đã duyệt nghỉ ngày này; ca gốc không tính vào lịch dự kiến.",
    overrideEffective:"Đã duyệt đổi ca ngày này",
    loading:"Đang đọc yêu cầu lịch làm từ VPS…",
    saved:"Đã cập nhật yêu cầu lịch làm",
    saveError:"Không cập nhật được yêu cầu lịch làm",
    requestRequired:"Lý do yêu cầu phải có ít nhất 3 ký tự.",
    decisionRequired:"Lý do từ chối phải có ít nhất 3 ký tự.",
    pendingExists:"Ngày này đã có một yêu cầu đang chờ duyệt.",
    scheduleRequired:"Đổi ca cần có đúng một lịch gốc có thể xác định.",
    scheduleChanged:"Lịch gốc đã thay đổi; hãy hủy yêu cầu cũ và gửi lại.",
    exceptionExists:"Nhân viên đã có ngoại lệ lịch được duyệt cho ngày này.",
    scheduleAmbiguous:"Lịch gốc không duy nhất; quản lý cần chỉnh lại lịch trước.",
    invalidTime:"Hãy nhập giờ bắt đầu/kết thúc hợp lệ và khác nhau.",
    ownOnly:"Chỉ có thể thao tác yêu cầu đang chờ của chính mình.",
    notPending:"Yêu cầu này đã được xử lý nên không thể thay đổi lại.",
    payrollBoundary:"Duyệt nghỉ chỉ thay đổi lịch làm; không mặc định là nghỉ có lương/không lương và không tự tạo khấu trừ hay OT.",
  };
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function loadState() {
  try { return JSON.parse(localStorage.getItem(STATE_KEY) || "null"); }
  catch { return null; }
}

function session() {
  return currentAccountSession();
}

function role(user = session()) {
  return String(user?.accountRole || user?.role || "");
}

function scheduleVisible(user = session()) {
  return Boolean(user && (role(user) === "admin" || accountCan(user, "schedule", "view")));
}

function managerAccount(user = session()) {
  return Boolean(user && MANAGER_ROLES.has(role(user)) && (role(user) === "admin" || accountCan(user, "schedule", "edit")));
}

function selfServiceAccount(user = session()) {
  return Boolean(user && SELF_SERVICE_ROLES.has(String(user.role || role(user))) && scheduleVisible(user));
}

function activeSite(user = session()) {
  if (["central", "fuxing", "yongji"].includes(user?.location)) return user.location;
  if (user?.location === "all") {
    const saved = localStorage.getItem(ACTIVE_SITE_KEY);
    return ["central", "fuxing", "yongji"].includes(saved) ? saved : "fuxing";
  }
  return "";
}

function onSchedulePanel() {
  return String(location.hash || "").replace(/^#\/?/, "").split("?")[0] === "schedule";
}

function statusLabel(status, c = copy()) {
  if (status === "approved") return c.approved;
  if (status === "rejected") return c.rejected;
  if (status === "cancelled") return c.cancelled;
  return c.pending;
}

function typeLabel(type, c = copy()) {
  return type === "change" ? c.change : c.leave;
}

function notify(type, title, body) {
  window.dispatchEvent(new CustomEvent("shitu:notify", { detail:{ type, title, body } }));
}

function errorMessage(error) {
  const c = copy();
  const code = String(error?.code || error?.message || "");
  if (code === "WORKFORCE_REQUEST_REASON_REQUIRED") return c.requestRequired;
  if (code === "WORKFORCE_REQUEST_DECISION_NOTE_REQUIRED") return c.decisionRequired;
  if (code === "WORKFORCE_REQUEST_PENDING_EXISTS") return c.pendingExists;
  if (code === "WORKFORCE_REQUEST_SCHEDULE_REQUIRED") return c.scheduleRequired;
  if (code === "WORKFORCE_REQUEST_SCHEDULE_CHANGED") return c.scheduleChanged;
  if (code === "WORKFORCE_REQUEST_EXCEPTION_EXISTS") return c.exceptionExists;
  if (code === "WORKFORCE_REQUEST_SCHEDULE_AMBIGUOUS") return c.scheduleAmbiguous;
  if (code === "WORKFORCE_REQUEST_TIME_INVALID") return c.invalidTime;
  if (code === "WORKFORCE_REQUEST_NOT_OWN") return c.ownOnly;
  if (code === "WORKFORCE_REQUEST_NOT_PENDING") return c.notPending;
  return code || c.saveError;
}

function publishRemoteSchedule(site, module) {
  remoteSchedule = module && typeof module === "object" ? module : { schedules:[], requests:[], exceptions:[] };
  globalThis.__shituWorkforceScheduleModule = {
    site,
    module:remoteSchedule,
    loadedAt:new Date().toISOString(),
  };
  window.dispatchEvent(new CustomEvent("shitu:workforce-schedule-state", { detail:{ site } }));
}

async function refreshRemote(force = false) {
  const user = session();
  const site = activeSite(user);
  if (!user?.id || !site || !scheduleVisible(user)) return null;
  const key = `${user.id}:${site}`;
  if (!force && remoteKey === key && remoteSchedule) return remoteSchedule;
  if (!force && loadPending) return loadPending;

  remoteKey = key;
  const pending = vpsBusinessState(site)
    .then((result) => {
      if (`${session()?.id || ""}:${activeSite()}` !== key) return null;
      const module = result?.modules?.schedule && typeof result.modules.schedule === "object"
        ? result.modules.schedule
        : { schedules:[], requests:[], exceptions:[] };
      publishRemoteSchedule(site, module);
      requestDecorate();
      return module;
    })
    .catch((error) => {
      if (force) notify("error", copy().saveError, errorMessage(error));
      return null;
    })
    .finally(() => {
      if (loadPending === pending) loadPending = null;
    });
  loadPending = pending;
  return pending;
}

function requestCard(item, { manager = false, selfService = false } = {}) {
  const c = copy();
  const status = String(item?.status || "pending");
  const change = item?.type === "change";
  const timing = change ? `<span>${esc(item.requestedStart || "—")} → ${esc(item.requestedEnd || "—")}</span>` : "";
  const source = item?.sourceSnapshot
    ? `<small>${esc(item.sourceSnapshot.start || "—")} → ${esc(item.sourceSnapshot.end || "—")}</small>`
    : "";
  const decision = item?.decisionNote ? `<p class="workforce-request-decision">${esc(item.decisionNote)}</p>` : "";
  const pendingActions = status === "pending" && manager
    ? `<div class="workforce-request-manager-actions">
        <button type="button" class="primary-button" data-workforce-request-approve="${esc(item.id)}">${esc(c.approve)}</button>
        <form data-workforce-request-reject-form data-request-id="${esc(item.id)}">
          <input name="note" minlength="3" required placeholder="${esc(c.decisionPlaceholder)}">
          <button type="submit" class="secondary-button">${esc(c.reject)}</button>
        </form>
      </div>`
    : status === "pending" && selfService
      ? `<button type="button" class="secondary-button workforce-request-cancel" data-workforce-request-cancel="${esc(item.id)}">${esc(c.cancel)}</button>`
      : "";
  return `<article class="workforce-request-row" data-request-status="${esc(status)}">
    <div class="workforce-request-main">
      <div class="workforce-request-heading"><strong>${esc(item.staffName || "")}</strong><span class="workforce-request-status" data-status="${esc(status)}">${esc(statusLabel(status, c))}</span></div>
      <div class="workforce-request-meta"><span>${esc(typeLabel(item.type, c))}</span><span>${esc(item.date || "")}</span>${timing}</div>
      <p>${esc(item.reason || "")}</p>${source}${decision}
    </div>
    ${pendingActions}
  </article>`;
}

function effectiveExceptionMarkup(module, date) {
  const c = copy();
  const rows = (Array.isArray(module?.exceptions) ? module.exceptions : []).filter((entry) => String(entry?.date || "") === date);
  if (!rows.length) return "";
  const body = rows.map((entry) => {
    const label = entry.kind === "override"
      ? `${c.overrideEffective}: ${entry.start || "—"} → ${entry.end || "—"}`
      : c.leaveEffective;
    return `<div class="workforce-effective-row"><strong>${esc(entry.staffName || "")}</strong><span>${esc(label)}</span></div>`;
  }).join("");
  return `<section class="workforce-effective-exceptions"><h3>${esc(c.effective)}</h3>${body}</section>`;
}

function selfServiceMarkup(module, selectedDate) {
  const c = copy();
  const requests = [...(Array.isArray(module?.requests) ? module.requests : [])]
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, 30);
  return `<div class="workforce-request-grid">
    <form class="card workforce-request-form" data-workforce-request-form>
      <div class="card-heading"><div><h2>${esc(c.newRequest)}</h2><p>${esc(c.subtitle)}</p></div></div>
      <div class="workforce-request-form-grid">
        <label><span>${esc(c.requestType)}</span><select name="type" data-workforce-request-type><option value="leave">${esc(c.leave)}</option><option value="change">${esc(c.change)}</option></select></label>
        <label><span>${esc(c.date)}</span><input type="date" name="date" required value="${esc(selectedDate)}"></label>
        <label data-workforce-change-field hidden><span>${esc(c.start)}</span><input type="time" name="requestedStart"></label>
        <label data-workforce-change-field hidden><span>${esc(c.end)}</span><input type="time" name="requestedEnd"></label>
        <label class="workforce-request-reason"><span>${esc(c.reason)}</span><textarea name="reason" required minlength="3" maxlength="240" placeholder="${esc(c.reasonPlaceholder)}"></textarea></label>
      </div>
      <p class="workforce-request-boundary">${esc(c.payrollBoundary)}</p>
      <button type="submit" class="primary-button">${esc(c.submit)}</button>
    </form>
    <article class="card workforce-request-history"><div class="card-heading"><div><h2>${esc(c.history)}</h2></div></div>${requests.length ? requests.map((item) => requestCard(item, { selfService:true })).join("") : `<p class="empty-state">${esc(c.noHistory)}</p>`}</article>
  </div>
  ${effectiveExceptionMarkup(module, selectedDate)}`;
}

function managerMarkup(module, selectedDate) {
  const c = copy();
  const requests = [...(Array.isArray(module?.requests) ? module.requests : [])]
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const pending = requests.filter((entry) => entry.status === "pending");
  const history = requests.filter((entry) => entry.status !== "pending").slice(0, 40);
  return `<div class="workforce-request-grid manager">
    <article class="card workforce-request-queue"><div class="card-heading"><div><h2>${esc(c.queue)}</h2><p>${esc(c.subtitle)}</p></div><span class="workforce-request-count">${pending.length}</span></div>${pending.length ? pending.map((item) => requestCard(item, { manager:true })).join("") : `<p class="empty-state">${esc(c.noPending)}</p>`}</article>
    <article class="card workforce-request-history"><div class="card-heading"><div><h2>${esc(c.history)}</h2></div></div>${history.length ? history.map((item) => requestCard(item)).join("") : `<p class="empty-state">${esc(c.noHistory)}</p>`}</article>
  </div>
  ${effectiveExceptionMarkup(module, selectedDate)}
  <p class="workforce-request-boundary manager-boundary">${esc(c.payrollBoundary)}</p>`;
}

function loadingMarkup() {
  return `<article class="card workforce-request-loading"><p>${esc(copy().loading)}</p></article>`;
}

function updateChangeFields(form) {
  if (!(form instanceof HTMLFormElement)) return;
  const change = form.querySelector('[name="type"]')?.value === "change";
  form.querySelectorAll("[data-workforce-change-field]").forEach((field) => {
    field.hidden = !change;
    const input = field.querySelector("input");
    if (input) input.required = change;
  });
}

function decorate() {
  renderPending = false;
  if (!onSchedulePanel()) return;
  const user = session();
  if (!scheduleVisible(user)) return;
  const root = document.querySelector("#app");
  const tabs = root?.querySelector("[data-workforce-tabs]");
  if (!root || !tabs) return;
  const state = loadState();
  const selectedDate = String(state?.selectedDate || new Date().toISOString().slice(0, 10));
  const site = activeSite(user);
  const key = `${user?.id || ""}:${site}`;

  let panel = root.querySelector("[data-workforce-request-workspace]");
  if (!panel) {
    panel = document.createElement("section");
    panel.className = "workforce-request-workspace";
    panel.dataset.workforceRequestWorkspace = "";
    const anchor = root.querySelector("[data-workforce-schedule-reconciliation]") || tabs;
    anchor.after(panel);
  }

  if (remoteKey !== key || !remoteSchedule) {
    panel.innerHTML = loadingMarkup();
    void refreshRemote();
    return;
  }

  const manager = managerAccount(user);
  const selfService = selfServiceAccount(user);
  const signature = JSON.stringify({
    key,
    selectedDate,
    manager,
    selfService,
    requests:remoteSchedule.requests || [],
    exceptions:remoteSchedule.exceptions || [],
  });
  if (panel.dataset.signature === signature) return;
  panel.dataset.signature = signature;
  panel.innerHTML = manager
    ? managerMarkup(remoteSchedule, selectedDate)
    : selfService
      ? selfServiceMarkup(remoteSchedule, selectedDate)
      : `${effectiveExceptionMarkup(remoteSchedule, selectedDate)}<p class="workforce-request-boundary manager-boundary">${esc(copy().payrollBoundary)}</p>`;
  updateChangeFields(panel.querySelector("[data-workforce-request-form]"));
}

function requestDecorate() {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(decorate);
}

async function postAction(path, body = {}) {
  if (actionPending) return false;
  actionPending = true;
  document.querySelectorAll("[data-workforce-request-workspace] button").forEach((button) => { button.disabled = true; });
  try {
    await apiRequest(path, { method:"POST", body });
    await refreshRemote(true);
    notify("success", copy().saved, "VPS OK");
    return true;
  } catch (error) {
    notify("error", copy().saveError, errorMessage(error));
    return false;
  } finally {
    actionPending = false;
    requestDecorate();
  }
}

document.addEventListener("change", (event) => {
  if (event.target instanceof HTMLSelectElement && event.target.matches("[data-workforce-request-type]")) {
    updateChangeFields(event.target.closest("form"));
  }
}, true);

document.addEventListener("submit", (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (form.matches("[data-workforce-request-form]")) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!selfServiceAccount()) return;
    const data = new FormData(form);
    const type = String(data.get("type") || "leave");
    const reason = String(data.get("reason") || "").trim();
    if (reason.length < 3) {
      notify("error", copy().saveError, copy().requestRequired);
      return;
    }
    const body = {
      type,
      date:String(data.get("date") || ""),
      reason,
      requestedStart:type === "change" ? String(data.get("requestedStart") || "") : "",
      requestedEnd:type === "change" ? String(data.get("requestedEnd") || "") : "",
    };
    void postAction(`/api/workforce/${encodeURIComponent(activeSite())}/schedule-requests`, body).then((ok) => {
      if (ok) form.reset();
    });
    return;
  }

  if (form.matches("[data-workforce-request-reject-form]")) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!managerAccount()) return;
    const note = String(new FormData(form).get("note") || "").trim();
    if (note.length < 3) {
      notify("error", copy().saveError, copy().decisionRequired);
      return;
    }
    const id = String(form.dataset.requestId || "");
    void postAction(`/api/workforce/${encodeURIComponent(activeSite())}/schedule-requests/${encodeURIComponent(id)}/reject`, { note });
  }
}, true);

document.addEventListener("click", (event) => {
  const approve = event.target.closest?.("[data-workforce-request-approve]");
  if (approve) {
    event.preventDefault();
    if (!managerAccount()) return;
    const id = String(approve.dataset.workforceRequestApprove || "");
    void postAction(`/api/workforce/${encodeURIComponent(activeSite())}/schedule-requests/${encodeURIComponent(id)}/approve`, {});
    return;
  }

  const cancel = event.target.closest?.("[data-workforce-request-cancel]");
  if (cancel) {
    event.preventDefault();
    if (!selfServiceAccount()) return;
    const id = String(cancel.dataset.workforceRequestCancel || "");
    void postAction(`/api/workforce/${encodeURIComponent(activeSite())}/schedule-requests/${encodeURIComponent(id)}/cancel`, {});
  }
}, true);

function invalidateAndRefresh() {
  remoteKey = "";
  remoteSchedule = null;
  globalThis.__shituWorkforceScheduleModule = null;
  requestDecorate();
  if (onSchedulePanel()) void refreshRemote(true);
}

window.addEventListener("hashchange", requestDecorate);
window.addEventListener("shitu:accounts-synced", invalidateAndRefresh);
window.addEventListener("shitu:auth-synced", invalidateAndRefresh);
window.addEventListener("shitu:active-site-changed", invalidateAndRefresh);
window.addEventListener("shitu:business-state-updated", invalidateAndRefresh);

const observer = new MutationObserver(requestDecorate);
observer.observe(document.documentElement, { childList:true, subtree:true });
requestDecorate();
