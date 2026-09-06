import { currentAccountSession } from "./account-permissions.js";

const ACTIVE_SITE_KEY = "shitu-admin-active-site-v1";
const KNOWN_SITES = new Set(["central", "fuxing", "yongji"]);
const SAVED_VISIBLE_MS = 2800;

const scopeStates = new Map();
const hideTimers = new Map();
let scheduled = false;

function language() {
  return document.documentElement.lang === "zh-Hant" ? "zh" : "vi";
}

function currentSite(session = currentAccountSession()) {
  if (KNOWN_SITES.has(session?.location)) return session.location;
  if (session?.location === "all") {
    const saved = localStorage.getItem(ACTIVE_SITE_KEY);
    return KNOWN_SITES.has(saved) ? saved : "fuxing";
  }
  return "";
}

function currentScope() {
  const session = currentAccountSession();
  const site = currentSite(session);
  return session?.id && site ? `${session.id}:${site}` : "";
}

function detailScope(detail) {
  const userId = String(detail?.userId || "");
  const site = String(detail?.site || "");
  return userId && KNOWN_SITES.has(site) ? `${userId}:${site}` : "";
}

function clearHideTimer(scope) {
  const timer = hideTimers.get(scope);
  if (timer) clearTimeout(timer);
  hideTimers.delete(scope);
}

function scheduleSavedHide(scope, state) {
  clearHideTimer(scope);
  const timer = window.setTimeout(() => {
    if (scopeStates.get(scope) !== state || state.status !== "saved") return;
    scopeStates.delete(scope);
    hideTimers.delete(scope);
    scheduleRender();
  }, SAVED_VISIBLE_MS);
  hideTimers.set(scope, timer);
}

function statusCopy(state, lang) {
  const base = {
    pending: lang === "zh"
      ? { title: "有變更尚未由 VPS 確認", body: "系統會自動嘗試儲存；完成前請勿視為已寫入 PostgreSQL。" }
      : { title: "Có thay đổi chưa được xác nhận trên VPS", body: "Hệ thống sẽ tự lưu; trước khi được xác nhận, chưa được coi là đã ghi vào PostgreSQL." },
    saving: lang === "zh"
      ? { title: "正在將變更儲存至 VPS…", body: "正在等待 PostgreSQL 確認。" }
      : { title: "Đang lưu thay đổi lên VPS…", body: "Đang chờ PostgreSQL xác nhận." },
    saved: lang === "zh"
      ? { title: "變更已儲存至 VPS", body: "PostgreSQL 已確認此次變更。" }
      : { title: "Đã lưu thay đổi vào VPS", body: "PostgreSQL đã xác nhận thay đổi này." },
    error: lang === "zh"
      ? { title: "變更尚未成功儲存至 VPS", body: "PostgreSQL 尚未確認此資料；系統再次成功儲存前，請勿視為已保存。" }
      : { title: "Chưa lưu được thay đổi vào VPS", body: "Dữ liệu này chưa được PostgreSQL xác nhận; chưa được coi là đã lưu cho tới khi hệ thống lưu thành công." },
  };
  const copy = base[state.status] || base.error;
  if (state.status !== "error") return copy;

  const code = String(state.error || "");
  const known = {
    BUSINESS_STATE_OFFLINE: lang === "zh" ? "目前離線；重新連線後系統會再嘗試儲存。" : "Hiện đang mất mạng; khi có mạng hệ thống sẽ thử lưu lại.",
    BUSINESS_STATE_NOT_READY: lang === "zh" ? "VPS 驗證尚未就緒；系統稍後會再嘗試。" : "Kết nối/xác thực VPS chưa sẵn sàng; hệ thống sẽ thử lại.",
    BUSINESS_STATE_PARTIAL_SAVE: lang === "zh" ? "VPS 僅確認部分模組，尚未視為完整儲存。" : "VPS mới chỉ xác nhận một phần dữ liệu, chưa được coi là lưu hoàn tất.",
    BUSINESS_STATE_SAVE_CONFIRMATION_MISSING: lang === "zh" ? "VPS 未回傳完整儲存確認。" : "VPS không trả về xác nhận lưu đầy đủ.",
    REQUEST_TIMEOUT: lang === "zh" ? "連線逾時，尚未取得儲存確認。" : "Kết nối hết thời gian chờ, chưa có xác nhận lưu.",
    API_UNREACHABLE: lang === "zh" ? "目前無法連線 VPS API。" : "Hiện không kết nối được VPS API.",
    SITE_NOT_ALLOWED: lang === "zh" ? "目前帳號已無此據點的寫入權限。" : "Tài khoản hiện không còn quyền ghi tại cơ sở này.",
    BUSINESS_STATE_EDIT_NOT_ALLOWED: lang === "zh" ? "目前帳號已無此資料的編輯權限。" : "Tài khoản hiện không còn quyền chỉnh sửa dữ liệu này.",
  };
  return { ...copy, detail: known[code] || (lang === "zh" ? "系統尚未取得有效的 VPS 儲存確認。" : "Hệ thống chưa nhận được xác nhận lưu hợp lệ từ VPS.") };
}

function signature(state, lang) {
  return JSON.stringify({
    status: state.status,
    userId: state.userId,
    site: state.site,
    modules: state.modules,
    error: state.status === "error" ? String(state.error || "") : "",
    lang,
  });
}

function buildNotice(state, lang) {
  const node = document.createElement("section");
  node.className = `business-persistence-status business-persistence-${state.status}`;
  node.dataset.businessPersistenceStatus = "";
  node.dataset.persistenceSignature = signature(state, lang);
  node.setAttribute("role", state.status === "error" ? "alert" : "status");
  node.setAttribute("aria-live", state.status === "error" ? "assertive" : "polite");

  const marker = document.createElement("span");
  marker.className = "business-persistence-marker";
  marker.setAttribute("aria-hidden", "true");
  marker.textContent = state.status === "saved" ? "✓" : state.status === "error" ? "!" : "•";

  const content = document.createElement("div");
  content.className = "business-persistence-copy";
  const copy = statusCopy(state, lang);
  const title = document.createElement("strong");
  title.textContent = copy.title;
  const body = document.createElement("span");
  body.textContent = copy.body;
  content.append(title, body);
  if (copy.detail) {
    const detail = document.createElement("small");
    detail.textContent = copy.detail;
    content.append(detail);
  }

  node.append(marker, content);
  return node;
}

function ensureNotice() {
  const page = document.querySelector(".page-content");
  const existing = document.querySelector("[data-business-persistence-status]");
  const scope = currentScope();
  const state = scope ? scopeStates.get(scope) : null;

  if (!page || !state) {
    existing?.remove();
    return;
  }

  const lang = language();
  const nextSignature = signature(state, lang);
  if (existing?.dataset.persistenceSignature === nextSignature && existing.parentElement === page) return;

  const notice = buildNotice(state, lang);
  const recovery = page.querySelector("[data-business-recovery-banner]");
  if (existing) existing.replaceWith(notice);
  else if (recovery) recovery.after(notice);
  else page.prepend(notice);
}

function scheduleRender() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    ensureNotice();
  });
}

function handlePersistenceStatus(event) {
  const detail = event.detail || {};
  if (!["pending", "saving", "saved", "error"].includes(detail.status)) return;
  const scope = detailScope(detail);
  if (!scope) return;

  const state = {
    status: detail.status,
    userId: String(detail.userId),
    site: String(detail.site),
    modules: Array.isArray(detail.modules) ? detail.modules.map(String).filter(Boolean) : [],
    error: detail.status === "error" ? String(detail.error || "") : "",
  };
  clearHideTimer(scope);
  scopeStates.set(scope, state);
  if (state.status === "saved") scheduleSavedHide(scope, state);
  scheduleRender();
}

window.addEventListener("shitu:business-persistence-status", handlePersistenceStatus);
window.addEventListener("shitu:active-site-changed", scheduleRender);
window.addEventListener("shitu:auth-synced", scheduleRender);
window.addEventListener("shitu:vps-auth-ready", scheduleRender);
window.addEventListener("shitu:auth-expired", () => {
  for (const scope of hideTimers.keys()) clearHideTimer(scope);
  scopeStates.clear();
  scheduleRender();
});
window.addEventListener("storage", (event) => {
  if ([ACTIVE_SITE_KEY, "shitu-kitchen-auth-v1"].includes(event.key)) scheduleRender();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") scheduleRender();
});

const appRoot = document.querySelector("#app");
if (appRoot) {
  const observer = new MutationObserver(scheduleRender);
  observer.observe(appRoot, { childList: true, subtree: true });
}

scheduleRender();
