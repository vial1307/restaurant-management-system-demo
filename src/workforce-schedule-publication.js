import { accountCan, currentAccountSession } from "./account-permissions.js";
import { apiRequest } from "./vps-api.js";

const STATE_KEY = "shitu-kitchen-os-v1";
const ACTIVE_SITE_KEY = "shitu-admin-active-site-v1";
let cacheSite = "";
let cache = null;
let loadInFlight = null;
let renderQueued = false;
let publishing = false;

function zh() {
  return document.documentElement.lang === "zh-Hant";
}

function copy() {
  return zh() ? {
    publish:"發布班表",
    publishing:"發布中…",
    draft:"草稿尚有未發布變更",
    published:"已發布",
    compatibility:"尚未建立發布版本，目前沿用既有班表相容模式。",
    employeeCompatibility:"目前班表仍使用相容模式，主管尚未建立第一個發布版本。",
    clean:"草稿與已發布版本一致",
    stale:"草稿尚未完成同步到 VPS，請等儲存完成後再發布。",
    success:"班表已發布",
    error:"班表發布失敗",
    count:"筆排班",
    by:"發布者",
  } : {
    publish:"Publish lịch làm",
    publishing:"Đang publish…",
    draft:"Draft có thay đổi chưa publish",
    published:"Đã publish",
    compatibility:"Chưa có phiên bản publish; hệ thống đang giữ chế độ tương thích với lịch hiện tại.",
    employeeCompatibility:"Lịch hiện tại đang ở chế độ tương thích; quản lý chưa tạo phiên bản publish đầu tiên.",
    clean:"Draft đang trùng với bản đã publish",
    stale:"Draft chưa đồng bộ xong lên VPS. Hãy chờ lưu hoàn tất rồi publish lại.",
    success:"Đã publish lịch làm",
    error:"Không publish được lịch làm",
    count:"ca",
    by:"Người publish",
  };
}

function notify(type, title, body) {
  window.dispatchEvent(new CustomEvent("shitu:notify", { detail:{ type, title, body } }));
}

function session() {
  return currentAccountSession();
}

function managerAccount() {
  const user = session();
  const role = String(user?.accountRole || user?.role || "");
  return Boolean(user && ["admin", "manager"].includes(role) && accountCan(user, "schedule", "edit"));
}

function activeSite() {
  const user = session();
  if (["central", "fuxing", "yongji"].includes(user?.location)) return user.location;
  if (user?.location === "all") {
    const saved = localStorage.getItem(ACTIVE_SITE_KEY);
    return ["central", "fuxing", "yongji"].includes(saved) ? saved : "fuxing";
  }
  return "";
}

function localSchedules() {
  try {
    const state = JSON.parse(localStorage.getItem(STATE_KEY) || "null");
    return Array.isArray(state?.operations?.schedules) ? state.operations.schedules : [];
  } catch {
    return [];
  }
}

function sameJson(a, b) {
  try { return JSON.stringify(a) === JSON.stringify(b); }
  catch { return false; }
}

function formatTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat(zh() ? "zh-TW" : "vi-VN", {
    month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hour12:false,
  }).format(date);
}

function normalizeRemote(state = {}) {
  const module = state?.modules?.schedule && typeof state.modules.schedule === "object"
    ? state.modules.schedule
    : {};
  const publication = module.publication && typeof module.publication === "object" && !Array.isArray(module.publication)
    ? module.publication
    : null;
  const schedules = Array.isArray(module.schedules) ? module.schedules : [];
  const publishedSchedules = Array.isArray(module.publishedSchedules) ? module.publishedSchedules : null;
  return {
    publication,
    schedules,
    publishedSchedules,
    draftChanged:managerAccount()
      ? !publication || !publishedSchedules || !sameJson(schedules, publishedSchedules)
      : null,
    moduleRevision:Number.isInteger(Number(state?.moduleRevisions?.schedule)) ? Number(state.moduleRevisions.schedule) : null,
  };
}

async function loadPublication(force = false) {
  const site = activeSite();
  if (!site) {
    cacheSite = "";
    cache = null;
    return null;
  }
  if (!force && cacheSite === site && cache) return cache;
  if (loadInFlight) return loadInFlight;
  loadInFlight = apiRequest(`/api/business-state/${encodeURIComponent(site)}`)
    .then((state) => {
      cacheSite = site;
      cache = normalizeRemote(state);
      return cache;
    })
    .catch(() => {
      cacheSite = site;
      cache = null;
      return null;
    })
    .finally(() => { loadInFlight = null; });
  return loadInFlight;
}

function statusMarkup() {
  const c = copy();
  if (!cache?.publication) {
    return `<section class="workforce-publication-status compatibility" data-workforce-publication-status><strong>${managerAccount() ? c.compatibility : c.employeeCompatibility}</strong></section>`;
  }
  const publication = cache.publication;
  const changed = cache.draftChanged === true;
  const detail = [
    `v${Math.max(1, Number(publication.version) || 1)}`,
    formatTimestamp(publication.publishedAt),
    publication.publishedByName ? `${c.by}: ${publication.publishedByName}` : "",
    Number.isFinite(Number(publication.scheduleCount)) ? `${Number(publication.scheduleCount)} ${c.count}` : "",
  ].filter(Boolean).join(" · ");
  return `<section class="workforce-publication-status ${changed ? "draft" : "published"}" data-workforce-publication-status><span><strong>${changed ? c.draft : c.published}</strong><small>${detail}</small></span>${managerAccount() && !changed ? `<span class="workforce-publication-clean">${c.clean}</span>` : ""}</section>`;
}

function ensureStyles() {
  if (document.querySelector("#workforce-schedule-publication-style")) return;
  const style = document.createElement("style");
  style.id = "workforce-schedule-publication-style";
  style.textContent = `
    .workforce-publication-status{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:12px 0;padding:11px 14px;border:1px solid var(--border-color,#d8dedc);border-radius:14px;background:var(--card-background,#fff)}
    .workforce-publication-status>span:first-child{display:grid;gap:3px}.workforce-publication-status small{opacity:.72}.workforce-publication-status.draft{border-style:dashed}.workforce-publication-status.published strong{font-weight:700}.workforce-publication-status.compatibility{opacity:.84}.workforce-publication-clean{font-size:.86rem;opacity:.72}.workforce-schedule-publish{white-space:nowrap}
    @media(max-width:760px){.workforce-publication-status{align-items:flex-start;flex-direction:column}.workforce-schedule-publish{width:auto}}
  `;
  document.head.append(style);
}

function decorate() {
  if (String(location.hash || "").replace(/^#\/?/, "").split("?")[0] !== "schedule") return;
  const root = document.querySelector("#app");
  if (!root) return;
  ensureStyles();

  const toolbar = root.querySelector(".schedule-toolbar");
  if (toolbar && cache) {
    root.querySelector("[data-workforce-publication-status]")?.remove();
    toolbar.insertAdjacentHTML("afterend", statusMarkup());
  }

  const add = root.querySelector('[data-action="schedule-add"]');
  if (managerAccount() && add) {
    let button = root.querySelector("[data-workforce-schedule-publish]");
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "secondary-button workforce-schedule-publish";
      button.dataset.workforceSchedulePublish = "";
      add.insertAdjacentElement("beforebegin", button);
    }
    button.textContent = publishing ? copy().publishing : copy().publish;
    button.disabled = publishing || !cache || cache.draftChanged === false;
  } else {
    root.querySelector("[data-workforce-schedule-publish]")?.remove();
  }
}

async function publishSchedule() {
  if (!managerAccount() || publishing) return;
  const site = activeSite();
  if (!site) return;
  publishing = true;
  decorate();
  try {
    const latest = await loadPublication(true);
    if (!latest) throw new Error("WORKFORCE_SCHEDULE_PUBLICATION_LOAD_FAILED");
    const local = localSchedules();
    if (!sameJson(local, latest.schedules)) {
      notify("warning", copy().draft, copy().stale);
      return;
    }
    const result = await apiRequest(`/api/workforce/${encodeURIComponent(site)}/schedule-publish`, { method:"POST", body:{} });
    cache = {
      ...latest,
      publication:result?.publication || latest.publication,
      publishedSchedules:structuredClone(latest.schedules),
      draftChanged:false,
      moduleRevision:Number.isInteger(Number(result?.moduleRevision)) ? Number(result.moduleRevision) : latest.moduleRevision,
    };
    notify("success", copy().success, `v${cache.publication?.version || 1}`);
    window.dispatchEvent(new CustomEvent("shitu:business-state-updated", { detail:{ site, modules:["schedule"], reason:"schedule-published" } }));
    // The dedicated schedule-state event is consumed by business-state-sync.
    // Publishing increments the schedule module revision outside the generic save
    // path, so force a canonical reload before the next manager edit can save.
    window.dispatchEvent(new CustomEvent("shitu:workforce-schedule-state", { detail:{ site, reason:"schedule-published" } }));
  } catch (cause) {
    notify("error", copy().error, String(cause?.code || cause?.message || "ERROR"));
  } finally {
    publishing = false;
    decorate();
  }
}

function queueDecorate(forceLoad = false) {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(async () => {
    renderQueued = false;
    if (String(location.hash || "").replace(/^#\/?/, "").split("?")[0] !== "schedule") return;
    await loadPublication(forceLoad);
    decorate();
  });
}

document.addEventListener("click", (event) => {
  const button = event.target.closest?.("[data-workforce-schedule-publish]");
  if (!button) return;
  event.preventDefault();
  void publishSchedule();
}, true);

window.addEventListener("hashchange", () => queueDecorate(false));
window.addEventListener("shitu:accounts-synced", () => { cache = null; queueDecorate(true); });
window.addEventListener("shitu:auth-synced", () => { cache = null; queueDecorate(true); });
window.addEventListener("shitu:active-site-changed", () => { cache = null; queueDecorate(true); });
window.addEventListener("shitu:business-state-updated", (event) => {
  const modules = Array.isArray(event.detail?.modules) ? event.detail.modules : [];
  if (!modules.length || modules.includes("schedule")) {
    cache = null;
    queueDecorate(true);
  }
});
window.addEventListener("shitu:business-persistence-status", (event) => {
  const modules = Array.isArray(event.detail?.modules) ? event.detail.modules : [];
  if (modules.includes("schedule") && event.detail?.status === "saved") {
    cache = null;
    queueDecorate(true);
  }
});

const observer = new MutationObserver((mutations) => {
  if (mutations.some((mutation) => [...mutation.addedNodes, ...mutation.removedNodes].some((node) => (
    node instanceof Element && (node.matches?.(".schedule-toolbar,[data-action='schedule-add']") || node.querySelector?.(".schedule-toolbar,[data-action='schedule-add']"))
  )))) queueDecorate(false);
});
observer.observe(document.querySelector("#app") || document.body, { childList:true, subtree:true });
queueDecorate(false);
