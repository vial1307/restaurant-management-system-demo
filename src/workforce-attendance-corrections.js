import { accountCan, currentAccountSession } from "./account-permissions.js";
import { apiRequest, vpsBusinessState } from "./vps-api.js";

const ACTIVE_SITE_KEY = "shitu-admin-active-site-v1";
const MANAGER_ROLES = new Set(["admin", "manager"]);
const SELF_SERVICE_ROLES = new Set(["employee", "parttime"]);
let remoteKey = "";
let remoteAttendance = null;
let loading = null;
let actionPending = false;
let decoratePending = false;

function copy() {
  const zh = document.documentElement.lang === "zh-Hant";
  return zh ? {
    title:"出勤修正申請",
    subtitle:"員工提出修正後，由管理者審核；核准後原出勤核准會失效，需重新核准才能鎖定薪資月份。",
    newRequest:"提出修正",
    attendance:"出勤紀錄",
    clockIn:"上班時間",
    clockOut:"下班時間",
    breakMinutes:"休息分鐘",
    note:"備註",
    reason:"修正原因",
    reasonPlaceholder:"請說明為什麼需要修正",
    submit:"送出申請",
    queue:"待審核修正",
    history:"修正紀錄",
    current:"目前",
    requested:"申請值",
    pending:"待審核",
    approved:"已核准",
    rejected:"已拒絕",
    cancelled:"已取消",
    cancel:"取消申請",
    approve:"核准並套用",
    reject:"拒絕",
    rejectReason:"拒絕原因",
    rejectPlaceholder:"拒絕時請填寫原因",
    noRows:"目前沒有可申請修正的出勤紀錄。",
    noPending:"目前沒有待審核修正。",
    noHistory:"目前沒有修正紀錄。",
    saved:"出勤修正申請已更新",
    saveError:"無法更新出勤修正申請",
    invalidReason:"原因至少需要 3 個字元。",
    invalidRange:"下班時間不可早於上班時間。",
    locked:"此月份已鎖定，請先由管理者重新開啟薪資月份。",
    stale:"出勤紀錄已變更，請取消舊申請後重新提出。",
    pendingExists:"這筆出勤已有待審核修正。",
    notPending:"此申請已處理，不能再次變更。",
    ownOnly:"只能操作自己的待審核申請。",
  } : {
    title:"Yêu cầu sửa chấm công",
    subtitle:"Nhân viên gửi yêu cầu, quản lý duyệt. Khi áp dụng sửa, phê duyệt chấm công cũ bị hủy và phải duyệt lại trước khi khóa kỳ lương.",
    newRequest:"Tạo yêu cầu sửa",
    attendance:"Bản ghi chấm công",
    clockIn:"Giờ vào",
    clockOut:"Giờ ra",
    breakMinutes:"Phút nghỉ",
    note:"Ghi chú",
    reason:"Lý do sửa",
    reasonPlaceholder:"Mô tả lý do cần sửa",
    submit:"Gửi yêu cầu",
    queue:"Yêu cầu chờ duyệt",
    history:"Lịch sử sửa chấm công",
    current:"Hiện tại",
    requested:"Yêu cầu",
    pending:"Chờ duyệt",
    approved:"Đã duyệt",
    rejected:"Từ chối",
    cancelled:"Đã hủy",
    cancel:"Hủy yêu cầu",
    approve:"Duyệt và áp dụng",
    reject:"Từ chối",
    rejectReason:"Lý do từ chối",
    rejectPlaceholder:"Khi từ chối cần nhập lý do",
    noRows:"Hiện chưa có bản ghi chấm công có thể yêu cầu sửa.",
    noPending:"Không có yêu cầu sửa đang chờ duyệt.",
    noHistory:"Chưa có lịch sử sửa chấm công.",
    saved:"Đã cập nhật yêu cầu sửa chấm công",
    saveError:"Không cập nhật được yêu cầu sửa chấm công",
    invalidReason:"Lý do phải có ít nhất 3 ký tự.",
    invalidRange:"Giờ ra không được sớm hơn giờ vào.",
    locked:"Kỳ lương đã khóa; quản lý cần mở lại kỳ trước khi sửa.",
    stale:"Bản ghi chấm công đã thay đổi; hãy hủy yêu cầu cũ và gửi lại.",
    pendingExists:"Bản ghi này đã có yêu cầu sửa đang chờ duyệt.",
    notPending:"Yêu cầu này đã được xử lý.",
    ownOnly:"Chỉ có thể thao tác yêu cầu đang chờ của chính mình.",
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

function visible(user = session()) {
  return Boolean(user && (role(user) === "admin" || accountCan(user, "attendance", "view")));
}

function manager(user = session()) {
  return Boolean(user && MANAGER_ROLES.has(role(user)) && (role(user) === "admin" || accountCan(user, "attendance", "edit")));
}

function selfService(user = session()) {
  return Boolean(user && SELF_SERVICE_ROLES.has(role(user)) && visible(user));
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
  if (route !== "attendance") return false;
  return new URLSearchParams(query).get("workforce") !== "payroll";
}

function notify(type, title, body) {
  window.dispatchEvent(new CustomEvent("shitu:notify", { detail:{ type, title, body } }));
}

function statusLabel(status, c = copy()) {
  if (status === "approved") return c.approved;
  if (status === "rejected") return c.rejected;
  if (status === "cancelled") return c.cancelled;
  return c.pending;
}

function errorMessage(error) {
  const c = copy();
  const code = String(error?.code || error?.message || "");
  if (code === "WORKFORCE_ATTENDANCE_CORRECTION_REASON_REQUIRED") return c.invalidReason;
  if (code === "WORKFORCE_ATTENDANCE_CORRECTION_RANGE_INVALID") return c.invalidRange;
  if (code === "WORKFORCE_PAYROLL_PERIOD_LOCKED") return c.locked;
  if (code === "WORKFORCE_ATTENDANCE_CORRECTION_STALE") return c.stale;
  if (code === "WORKFORCE_ATTENDANCE_CORRECTION_PENDING_EXISTS") return c.pendingExists;
  if (code === "WORKFORCE_ATTENDANCE_CORRECTION_NOT_PENDING") return c.notPending;
  if (code === "WORKFORCE_ATTENDANCE_CORRECTION_NOT_OWN") return c.ownOnly;
  return code || c.saveError;
}

function localDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function isoFromLocal(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function formatValue(key, value) {
  if (value === null || value === undefined || value === "") return "—";
  if (["clockIn", "clockOut"].includes(key)) {
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) {
      return new Intl.DateTimeFormat(document.documentElement.lang === "zh-Hant" ? "zh-TW" : "vi-VN", {
        month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hour12:false,
      }).format(date);
    }
  }
  return String(value);
}

function publish(site, module) {
  remoteAttendance = module && typeof module === "object" ? module : { attendance:[], correctionRequests:[], payroll:{} };
  globalThis.__shituWorkforceAttendanceCorrectionModule = { site, module:remoteAttendance, loadedAt:new Date().toISOString() };
}

async function refresh(force = false) {
  const user = session();
  const site = activeSite(user);
  if (!user?.id || !site || !visible(user)) return null;
  const key = `${user.id}:${site}`;
  if (!force && remoteKey === key && remoteAttendance) return remoteAttendance;
  if (!force && loading) return loading;
  remoteKey = key;
  const pending = vpsBusinessState(site)
    .then((result) => {
      if (`${session()?.id || ""}:${activeSite()}` !== key) return null;
      const module = result?.modules?.attendance && typeof result.modules.attendance === "object"
        ? result.modules.attendance
        : { attendance:[], correctionRequests:[], payroll:{} };
      publish(site, module);
      requestDecorate();
      return module;
    })
    .catch((error) => {
      if (force) notify("error", copy().saveError, errorMessage(error));
      return null;
    })
    .finally(() => {
      if (loading === pending) loading = null;
    });
  loading = pending;
  return pending;
}

function deltaMarkup(item) {
  const c = copy();
  const source = item?.sourceSnapshot || {};
  const labels = { clockIn:c.clockIn, clockOut:c.clockOut, breakMinutes:c.breakMinutes, note:c.note, scheduledStart:"scheduledStart" };
  return Object.entries(item?.changes || {}).map(([key, value]) => `<div class="attendance-correction-delta">
    <strong>${esc(labels[key] || key)}</strong>
    <span><small>${esc(c.current)}</small>${esc(formatValue(key, source[key]))}</span>
    <span><small>${esc(c.requested)}</small>${esc(formatValue(key, value))}</span>
  </div>`).join("");
}

function requestCard(item, { canManage = false, canCancel = false } = {}) {
  const c = copy();
  const status = String(item?.status || "pending");
  const actions = status === "pending" && canManage
    ? `<div class="attendance-correction-actions">
        <button type="button" class="primary-button" data-attendance-correction-approve="${esc(item.id)}">${esc(c.approve)}</button>
        <form data-attendance-correction-reject data-request-id="${esc(item.id)}">
          <input name="note" minlength="3" required placeholder="${esc(c.rejectPlaceholder)}">
          <button type="submit" class="secondary-button">${esc(c.reject)}</button>
        </form>
      </div>`
    : status === "pending" && canCancel
      ? `<button type="button" class="secondary-button" data-attendance-correction-cancel="${esc(item.id)}">${esc(c.cancel)}</button>`
      : "";
  return `<article class="attendance-correction-request" data-status="${esc(status)}">
    <div class="attendance-correction-request-head"><strong>${esc(item.staffName || "")}</strong><span>${esc(statusLabel(status, c))}</span></div>
    <div class="attendance-correction-meta"><span>${esc(item.date || "")}</span><span>${esc(item.reason || "")}</span></div>
    <div class="attendance-correction-deltas">${deltaMarkup(item)}</div>
    ${item.decisionNote ? `<p class="attendance-correction-decision">${esc(item.decisionNote)}</p>` : ""}
    ${actions}
  </article>`;
}

function selfServiceMarkup(module) {
  const c = copy();
  const rows = Array.isArray(module?.attendance) ? module.attendance : [];
  const requests = Array.isArray(module?.correctionRequests) ? module.correctionRequests : [];
  const pendingAttendanceIds = new Set(requests.filter((item) => item?.status === "pending").map((item) => String(item.attendanceId || "")));
  const options = rows.map((entry) => `<option value="${esc(entry.id)}" ${pendingAttendanceIds.has(String(entry.id)) ? "disabled" : ""}>${esc(entry.date || "")} · ${esc(entry.staffName || "")} · ${esc(formatValue("clockIn", entry.clockIn))} → ${esc(formatValue("clockOut", entry.clockOut))}</option>`).join("");
  const history = requests.map((item) => requestCard(item, { canCancel:true })).join("");
  return `<section class="attendance-correction-panel" data-attendance-correction-panel>
    <div class="card-heading"><div><h2>${esc(c.title)}</h2><p>${esc(c.subtitle)}</p></div></div>
    <div class="attendance-correction-grid">
      <form class="attendance-correction-form" data-attendance-correction-create>
        <h3>${esc(c.newRequest)}</h3>
        <label><span>${esc(c.attendance)}</span><select name="attendanceId" required>${options}</select></label>
        <div class="attendance-correction-fields">
          <label><span>${esc(c.clockIn)}</span><input type="datetime-local" name="clockIn"></label>
          <label><span>${esc(c.clockOut)}</span><input type="datetime-local" name="clockOut"></label>
          <label><span>${esc(c.breakMinutes)}</span><input type="number" name="breakMinutes" min="0" step="1"></label>
          <label><span>${esc(c.note)}</span><input type="text" name="note"></label>
        </div>
        <label><span>${esc(c.reason)}</span><textarea name="reason" minlength="3" required placeholder="${esc(c.reasonPlaceholder)}"></textarea></label>
        <button type="submit" class="primary-button" ${rows.length ? "" : "disabled"}>${esc(c.submit)}</button>
        ${rows.length ? "" : `<p class="empty-state">${esc(c.noRows)}</p>`}
      </form>
      <div class="attendance-correction-history"><h3>${esc(c.history)}</h3>${history || `<p class="empty-state">${esc(c.noHistory)}</p>`}</div>
    </div>
  </section>`;
}

function managerMarkup(module) {
  const c = copy();
  const requests = Array.isArray(module?.correctionRequests) ? module.correctionRequests : [];
  const pending = requests.filter((item) => item?.status === "pending");
  const history = requests.filter((item) => item?.status !== "pending").slice(0, 30);
  return `<section class="attendance-correction-panel" data-attendance-correction-panel>
    <div class="card-heading"><div><h2>${esc(c.title)}</h2><p>${esc(c.subtitle)}</p></div></div>
    <div class="attendance-correction-manager-grid">
      <div><h3>${esc(c.queue)}</h3>${pending.map((item) => requestCard(item, { canManage:true })).join("") || `<p class="empty-state">${esc(c.noPending)}</p>`}</div>
      <div><h3>${esc(c.history)}</h3>${history.map((item) => requestCard(item)).join("") || `<p class="empty-state">${esc(c.noHistory)}</p>`}</div>
    </div>
  </section>`;
}

function decorate() {
  decoratePending = false;
  const existing = document.querySelector("[data-attendance-correction-panel]");
  if (!onAttendancePanel() || !visible()) {
    existing?.remove();
    return;
  }
  const tabs = document.querySelector("[data-workforce-tabs]");
  if (!tabs) return;
  if (!remoteAttendance) {
    refresh();
    return;
  }
  const html = manager() ? managerMarkup(remoteAttendance) : selfService() ? selfServiceMarkup(remoteAttendance) : "";
  if (!html) {
    existing?.remove();
    return;
  }
  existing?.remove();
  tabs.insertAdjacentHTML("afterend", html);
}

function requestDecorate() {
  if (decoratePending) return;
  decoratePending = true;
  requestAnimationFrame(decorate);
}

async function mutate(path, body) {
  if (actionPending) return null;
  actionPending = true;
  try {
    const result = await apiRequest(path, { method:"POST", body });
    await refresh(true);
    notify("success", copy().saved, copy().title);
    return result;
  } catch (error) {
    notify("error", copy().saveError, errorMessage(error));
    return null;
  } finally {
    actionPending = false;
  }
}

document.addEventListener("submit", async (event) => {
  const createForm = event.target.closest?.("[data-attendance-correction-create]");
  if (createForm) {
    event.preventDefault();
    const site = activeSite();
    if (!site || !selfService()) return;
    const form = new FormData(createForm);
    const changes = {};
    const clockIn = String(form.get("clockIn") || "").trim();
    const clockOut = String(form.get("clockOut") || "").trim();
    const breakMinutes = String(form.get("breakMinutes") || "").trim();
    const note = String(form.get("note") || "").trim();
    if (clockIn) {
      const value = isoFromLocal(clockIn);
      if (!value) return notify("error", copy().saveError, copy().invalidRange);
      changes.clockIn = value;
    }
    if (clockOut) {
      const value = isoFromLocal(clockOut);
      if (!value) return notify("error", copy().saveError, copy().invalidRange);
      changes.clockOut = value;
    }
    if (breakMinutes !== "") changes.breakMinutes = Number(breakMinutes);
    if (note !== "") changes.note = note;
    const reason = String(form.get("reason") || "").trim();
    if (reason.length < 3) return notify("error", copy().saveError, copy().invalidReason);
    await mutate(`/api/workforce/${site}/attendance-correction-requests`, {
      attendanceId:String(form.get("attendanceId") || ""),
      reason,
      changes,
    });
    return;
  }

  const rejectForm = event.target.closest?.("[data-attendance-correction-reject]");
  if (rejectForm) {
    event.preventDefault();
    const site = activeSite();
    if (!site || !manager()) return;
    const note = String(new FormData(rejectForm).get("note") || "").trim();
    if (note.length < 3) return notify("error", copy().saveError, copy().invalidReason);
    await mutate(`/api/workforce/${site}/attendance-correction-requests/${encodeURIComponent(rejectForm.dataset.requestId || "")}/reject`, { note });
  }
});

document.addEventListener("click", async (event) => {
  const approve = event.target.closest?.("[data-attendance-correction-approve]");
  if (approve) {
    const site = activeSite();
    if (site && manager()) await mutate(`/api/workforce/${site}/attendance-correction-requests/${encodeURIComponent(approve.dataset.attendanceCorrectionApprove || "")}/approve`);
    return;
  }
  const cancel = event.target.closest?.("[data-attendance-correction-cancel]");
  if (cancel) {
    const site = activeSite();
    if (site && selfService()) await mutate(`/api/workforce/${site}/attendance-correction-requests/${encodeURIComponent(cancel.dataset.attendanceCorrectionCancel || "")}/cancel`);
  }
});

window.addEventListener("hashchange", () => { remoteKey = ""; remoteAttendance = null; refresh(); requestDecorate(); });
window.addEventListener("storage", requestDecorate);
window.addEventListener("shitu:auth-changed", () => { remoteKey = ""; remoteAttendance = null; refresh(); requestDecorate(); });
window.addEventListener("shitu:business-state-synced", () => { remoteKey = ""; remoteAttendance = null; refresh(); });
new MutationObserver(requestDecorate).observe(document.documentElement, { childList:true, subtree:true });

refresh();
requestDecorate();
