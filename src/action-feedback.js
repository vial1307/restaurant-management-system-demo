const TOAST_VISIBLE_MS = 2600;
const ERROR_VISIBLE_MS = 5200;
const PENDING_TTL_MS = 15000;

const BUSINESS_FORM_MODULES = new Map([
  ["save-skill-assessment", "skills"],
  ["save-custom-skill", "skills"],
  ["save-sop", "sop"],
  ["save-staff", "settings"],
  ["clock-in", "attendance"],
  ["edit-attendance", "attendance"],
  ["save-schedule", "schedule"],
  ["save-job", "remote"],
  ["save-inspection", "sop"],
]);

const BUSINESS_ACTION_MODULES = new Map([
  ["skill-toggle", "skills"],
  ["skill-delete", "skills"],
  ["skill-approve", "skills"],
  ["sop-remove-utensil", "sop"],
  ["sop-remove-photo", "sop"],
  ["sop-delete", "sop"],
  ["sop-approve", "sop"],
  ["sop-restore", "sop"],
  ["schedule-delete", "schedule"],
  ["job-delete", "remote"],
  ["clock-out", "attendance"],
]);

const INVENTORY_ACTION_SELECTOR = [
  "[data-op-submit]",
  "[data-op-use]",
  "[data-op-return]",
  '[data-action="restock-storage-item"]',
  '[data-action="restock-work-item"]',
  '[data-action="delete-item"]',
].join(",");

const pendingActions = new Set();
const pendingByElement = new WeakMap();
let toastSequence = 0;
let lastToastSignature = "";
let lastToastAt = 0;

export function feedbackLanguage() {
  return document.documentElement.lang === "zh-Hant" ? "zh" : "vi";
}

export function feedbackCopy(kind, language = feedbackLanguage()) {
  const zh = language === "zh";
  if (kind === "inventory-success") return {
    title: zh ? "庫存已更新" : "Đã cập nhật tồn kho",
    body: zh ? "VPS 已確認此次庫存變更。" : "VPS đã xác nhận thay đổi tồn kho này.",
  };
  if (kind === "account-success") return {
    title: zh ? "帳號已儲存" : "Đã lưu tài khoản",
    body: zh ? "帳號資料已由 VPS 確認。" : "Dữ liệu tài khoản đã được VPS xác nhận.",
  };
  if (kind === "error") return {
    title: zh ? "操作尚未完成" : "Thao tác chưa thành công",
    body: zh ? "資料尚未由 VPS 確認，視窗會保留供你檢查或重試。" : "Dữ liệu chưa được VPS xác nhận; popup được giữ lại để kiểm tra hoặc thử lại.",
  };
  return {
    title: zh ? "操作成功" : "Thao tác thành công",
    body: zh ? "資料已由 VPS 確認儲存。" : "Dữ liệu đã được VPS xác nhận và lưu thành công.",
  };
}

export function businessFormModule(formName = "") {
  return BUSINESS_FORM_MODULES.get(String(formName)) || "";
}

export function businessActionModule(action = "") {
  return BUSINESS_ACTION_MODULES.get(String(action)) || "";
}

export function modulesMatch(expectedModule, modules = []) {
  return Boolean(expectedModule) && Array.isArray(modules) && modules.map(String).includes(expectedModule);
}

function ensureToastHost() {
  let host = document.querySelector("[data-action-feedback-host]");
  if (host) return host;
  host = document.createElement("div");
  host.className = "action-feedback-host";
  host.dataset.actionFeedbackHost = "";
  host.setAttribute("aria-live", "polite");
  host.setAttribute("aria-atomic", "false");
  document.body.append(host);
  return host;
}

export function showActionFeedback({ type = "success", title = "", body = "", duration } = {}) {
  const copy = title ? { title, body } : feedbackCopy(type === "error" ? "error" : "success");
  const signature = `${type}|${copy.title}|${copy.body}`;
  const now = Date.now();
  if (signature === lastToastSignature && now - lastToastAt < 700) return null;
  lastToastSignature = signature;
  lastToastAt = now;

  const host = ensureToastHost();
  const toast = document.createElement("button");
  toast.type = "button";
  toast.className = `action-feedback-toast action-feedback-${type === "error" ? "error" : "success"}`;
  toast.dataset.actionFeedbackToast = String(++toastSequence);
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  toast.setAttribute("aria-label", copy.title);

  const marker = document.createElement("span");
  marker.className = "action-feedback-marker";
  marker.setAttribute("aria-hidden", "true");
  marker.textContent = type === "error" ? "!" : "✓";

  const text = document.createElement("span");
  text.className = "action-feedback-copy";
  const strong = document.createElement("strong");
  strong.textContent = copy.title;
  const detail = document.createElement("small");
  detail.textContent = copy.body || "";
  text.append(strong, detail);
  toast.append(marker, text);

  const dismiss = () => {
    if (!toast.isConnected || toast.dataset.dismissing === "true") return;
    toast.dataset.dismissing = "true";
    toast.classList.add("is-leaving");
    window.setTimeout(() => toast.remove(), 180);
  };
  toast.addEventListener("click", dismiss);
  host.append(toast);
  while (host.children.length > 3) host.firstElementChild?.remove();
  window.setTimeout(dismiss, Number(duration) > 0 ? Number(duration) : type === "error" ? ERROR_VISIBLE_MS : TOAST_VISIBLE_MS);
  return toast;
}

function modalFor(element) {
  return element?.closest?.("[data-account-modal], .account-modal-backdrop, .modal-backdrop") || null;
}

export function closeSuccessfulPopup(modal) {
  if (!modal?.isConnected) return false;
  const close = modal.querySelector(
    '[data-action="close-modal"], [data-central-editor-close], [data-account-close], [data-action="close-management-modal"]'
  );
  if (close instanceof HTMLElement) {
    close.click();
    queueMicrotask(() => { if (modal.isConnected) modal.remove(); });
  } else {
    modal.remove();
  }
  return true;
}

function clearPending(entry) {
  if (!entry) return;
  pendingActions.delete(entry);
  if (entry.element && pendingByElement.get(entry.element) === entry) pendingByElement.delete(entry.element);
  if (entry.timer) clearTimeout(entry.timer);
}

function trackPending({ kind, module = "", element = null, modal = null }) {
  if (element) clearPending(pendingByElement.get(element));
  const entry = {
    kind,
    module,
    element,
    modal,
    startedAt: Date.now(),
    timer: 0,
  };
  entry.timer = window.setTimeout(() => clearPending(entry), PENDING_TTL_MS);
  pendingActions.add(entry);
  if (element) pendingByElement.set(element, entry);
  return entry;
}

function resolveEntry(entry, copyKind = "success") {
  if (!entry) return;
  clearPending(entry);
  if (entry.modal?.isConnected) closeSuccessfulPopup(entry.modal);
  const copy = feedbackCopy(copyKind);
  showActionFeedback({ type: "success", ...copy });
}

function failEntry(entry) {
  if (!entry) return;
  clearPending(entry);
  const copy = feedbackCopy("error");
  showActionFeedback({ type: "error", ...copy });
}

function latestPending(kind) {
  return [...pendingActions]
    .filter((entry) => entry.kind === kind && Date.now() - entry.startedAt <= PENDING_TTL_MS)
    .sort((a, b) => b.startedAt - a.startedAt)[0] || null;
}

function handleSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;

  if (form.matches("[data-account-form]")) {
    trackPending({ kind: "account", element: form, modal: modalFor(form) });
    return;
  }

  if (form.matches('[data-form="add-item"], [data-form="edit-item"], [data-central-editor-form]')) {
    trackPending({ kind: "inventory", element: form, modal: modalFor(form) });
    return;
  }

  const module = businessFormModule(form.dataset.form || "");
  if (module) trackPending({ kind: "business", module, element: form, modal: modalFor(form) });
}

function handleClick(event) {
  const accountDelete = event.target.closest?.("[data-account-delete]");
  if (accountDelete) {
    trackPending({ kind: "account", element: accountDelete, modal: modalFor(accountDelete) });
    return;
  }

  const inventoryAction = event.target.closest?.(INVENTORY_ACTION_SELECTOR);
  if (inventoryAction) {
    trackPending({ kind: "inventory", element: inventoryAction, modal: modalFor(inventoryAction) });
    return;
  }

  const actionTarget = event.target.closest?.("[data-action]");
  const module = businessActionModule(actionTarget?.dataset?.action || "");
  if (module) trackPending({ kind: "business", module, element: actionTarget, modal: modalFor(actionTarget) });
}

function handleBusinessStatus(event) {
  const detail = event.detail || {};
  const status = String(detail.status || "");
  const modules = Array.isArray(detail.modules) ? detail.modules : [];
  const matches = [...pendingActions].filter((entry) => entry.kind === "business" && modulesMatch(entry.module, modules));
  if (!matches.length) return;
  if (status === "saved") matches.forEach((entry) => resolveEntry(entry, "success"));
  else if (status === "error") matches.forEach(failEntry);
}

function handleInventoryStatus(event) {
  const entry = latestPending("inventory");
  if (!entry) return;
  const status = String(event.detail?.status || "");
  if (status === "synced") resolveEntry(entry, "inventory-success");
  else if (status === "error" || status === "migration-needed") failEntry(entry);
}

function handleAccountsSynced() {
  const entry = latestPending("account");
  if (entry) resolveEntry(entry, "account-success");
}

function handleInlineMessages() {
  for (const entry of [...pendingActions]) {
    if (!entry.element?.isConnected) continue;
    const form = entry.element instanceof HTMLFormElement ? entry.element : entry.element.closest?.("form");
    const message = form?.querySelector?.("[data-account-form-message], [data-account-self-message]");
    const value = String(message?.textContent || "").trim();
    if (!value) continue;
    if (/Đã đổi mật khẩu|密碼已更新/.test(value)) {
      clearPending(entry);
      showActionFeedback({ type: "success", title: feedbackLanguage() === "zh" ? "密碼已更新" : "Đã đổi mật khẩu", body: value });
    } else if (entry.kind === "account") {
      failEntry(entry);
    }
  }
}

function handlePasswordSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.matches("[data-account-self-password]")) return;
  trackPending({ kind: "account-password", element: form, modal: null });
}

window.addEventListener("shitu:notify", (event) => {
  const detail = event.detail || {};
  showActionFeedback({
    type: detail.type === "error" ? "error" : "success",
    title: String(detail.title || ""),
    body: String(detail.body || ""),
    duration: Number(detail.duration) || undefined,
  });
});
window.addEventListener("shitu:business-persistence-status", handleBusinessStatus);
window.addEventListener("shitu:inventory-cloud-status", handleInventoryStatus);
window.addEventListener("shitu:accounts-synced", handleAccountsSynced);

document.addEventListener("submit", handlePasswordSubmit, true);
document.addEventListener("submit", handleSubmit, true);
document.addEventListener("click", handleClick, true);

const feedbackObserver = new MutationObserver(handleInlineMessages);
feedbackObserver.observe(document.documentElement, { subtree: true, childList: true, characterData: true });

window.shituNotify = (detail = {}) => window.dispatchEvent(new CustomEvent("shitu:notify", { detail }));
