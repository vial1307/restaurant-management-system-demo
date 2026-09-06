import { currentAccountSession } from "./account-permissions.js";
import { businessRecoveryMetadataForUser } from "./business-state-sync.js";

const RECOVERY_STORAGE_KEY = "shitu-business-recovery-v1";
const AUTH_STORAGE_KEY = "shitu-kitchen-auth-v1";

const SITE_LABELS = {
  central: { vi: "Bếp trung tâm · 央廚", zh: "央廚 · Bếp trung tâm" },
  fuxing: { vi: "Fuxing · 復興", zh: "復興 · Fuxing" },
  yongji: { vi: "Yongji · 永吉", zh: "永吉 · Yongji" },
};

function language() {
  return document.documentElement.lang === "zh-Hant" ? "zh" : "vi";
}

function siteLabel(site, lang) {
  return SITE_LABELS[site]?.[lang] || String(site || "—");
}

function capturedLabel(value, lang) {
  if (!value) return lang === "zh" ? "時間未知" : "Không rõ thời gian";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  try {
    return new Intl.DateTimeFormat(lang === "zh" ? "zh-TW" : "vi-VN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function signatureFor(drafts, lang) {
  return JSON.stringify({
    lang,
    drafts: drafts.map((draft) => ({
      site: draft.site,
      capturedAt: draft.capturedAt,
      changedModules: draft.changedModules,
      reason: draft.reason,
    })),
  });
}

function buildBanner(drafts, lang, signature) {
  const section = document.createElement("section");
  section.className = "business-recovery-banner";
  section.dataset.businessRecoveryBanner = "";
  section.dataset.recoverySignature = signature;
  section.setAttribute("role", "status");
  section.setAttribute("aria-live", "polite");

  const heading = document.createElement("div");
  heading.className = "business-recovery-heading";
  const marker = document.createElement("span");
  marker.className = "business-recovery-marker";
  marker.setAttribute("aria-hidden", "true");
  marker.textContent = "!";
  const title = document.createElement("strong");
  title.textContent = lang === "zh" ? "有尚未同步的復原資料" : "Có dữ liệu phục hồi chưa đồng bộ";
  heading.append(marker, title);

  const copy = document.createElement("p");
  copy.className = "business-recovery-copy";
  copy.textContent = lang === "zh"
    ? "因權限或工作據點已變更，仍有資料尚未同步。復原副本已保留在此裝置；管理者處理前請勿清除瀏覽器資料。"
    : "Có dữ liệu chưa thể đồng bộ do quyền hoặc nơi làm việc đã thay đổi. Bản phục hồi đang được giữ trên thiết bị; không xóa dữ liệu trình duyệt trước khi quản lý xử lý.";

  const list = document.createElement("div");
  list.className = "business-recovery-list";
  for (const draft of drafts) {
    const row = document.createElement("div");
    row.className = "business-recovery-row";

    const site = document.createElement("span");
    site.className = "business-recovery-site";
    site.textContent = siteLabel(draft.site, lang);

    const modules = document.createElement("span");
    modules.className = "business-recovery-modules";
    const names = Array.isArray(draft.changedModules) ? draft.changedModules.filter(Boolean) : [];
    modules.textContent = `${lang === "zh" ? "模組" : "Module"}: ${names.join(", ") || "—"}`;

    const time = document.createElement("time");
    time.className = "business-recovery-time";
    if (draft.capturedAt) time.dateTime = String(draft.capturedAt);
    time.textContent = capturedLabel(draft.capturedAt, lang);

    row.append(site, modules, time);
    list.append(row);
  }

  section.append(heading, copy, list);
  return section;
}

function ensureRecoveryNotice() {
  const page = document.querySelector(".page-content");
  const existing = document.querySelector("[data-business-recovery-banner]");
  const session = currentAccountSession();

  if (!page || !session?.id) {
    existing?.remove();
    return;
  }

  const drafts = businessRecoveryMetadataForUser(session.id);
  if (!drafts.length) {
    existing?.remove();
    return;
  }

  const lang = language();
  const signature = signatureFor(drafts, lang);
  if (existing?.dataset.recoverySignature === signature && existing.parentElement === page) return;

  const banner = buildBanner(drafts, lang, signature);
  if (existing) existing.replaceWith(banner);
  else page.prepend(banner);
}

let scheduled = false;
function scheduleRecoveryNotice() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    ensureRecoveryNotice();
  });
}

const appRoot = document.querySelector("#app");
if (appRoot) {
  const observer = new MutationObserver(scheduleRecoveryNotice);
  observer.observe(appRoot, { childList: true, subtree: true });
}

for (const eventName of [
  "shitu:business-state-status",
  "shitu:auth-synced",
  "shitu:auth-expired",
  "shitu:vps-auth-ready",
  "shitu:active-site-changed",
]) {
  window.addEventListener(eventName, scheduleRecoveryNotice);
}

window.addEventListener("storage", (event) => {
  if ([RECOVERY_STORAGE_KEY, AUTH_STORAGE_KEY].includes(event.key)) scheduleRecoveryNotice();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") scheduleRecoveryNotice();
});

scheduleRecoveryNotice();
