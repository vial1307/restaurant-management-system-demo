import {
  businessActionModule,
  businessFormModule,
  feedbackLanguage,
} from "./action-feedback.js";

const BUTTON_SELECTOR = [
  "button",
  '[role="button"]',
  'input[type="button"]',
  'input[type="submit"]',
  'input[type="reset"]',
].join(",");

const CONFIRMED_INVENTORY_SELECTOR = [
  "[data-op-submit]",
  "[data-op-use]",
  "[data-op-return]",
  '[data-action="restock-storage-item"]',
  '[data-action="restock-work-item"]',
  '[data-action="delete-item"]',
].join(",");

const CONFIRMED_FORM_SELECTOR = [
  "[data-account-form]",
  "[data-account-self-password]",
  '[data-form="add-item"]',
  '[data-form="edit-item"]',
  "[data-central-editor-form]",
].join(",");

const FLASH_MS = 1150;
let flashSequence = 0;
let flashTimer = 0;

function ensureHost() {
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

function normalizedLabel(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 88);
}

export function buttonFeedbackLabel(control) {
  if (!(control instanceof Element)) return "";
  const candidates = [
    control.getAttribute("data-feedback-label"),
    control.getAttribute("aria-label"),
    control.getAttribute("title"),
    control instanceof HTMLInputElement ? control.value : "",
    control.textContent,
    control.getAttribute("data-action"),
  ];
  return candidates.map(normalizedLabel).find(Boolean) || "";
}

function isDisabled(control) {
  if (!(control instanceof Element)) return true;
  if (control.matches(":disabled")) return true;
  return control.getAttribute("aria-disabled") === "true";
}

function formFor(control) {
  if (control instanceof HTMLButtonElement || control instanceof HTMLInputElement) {
    if (control.form) return control.form;
  }
  return control.closest?.("form") || null;
}

function isSubmitControl(control) {
  if (control instanceof HTMLInputElement) return control.type === "submit";
  if (control instanceof HTMLButtonElement) return (control.type || "submit") === "submit";
  return false;
}

export function usesConfirmedWriteFeedback(control) {
  if (!(control instanceof Element)) return false;
  if (control.closest("[data-account-delete]")) return true;
  if (control.closest(CONFIRMED_INVENTORY_SELECTOR)) return true;

  const actionTarget = control.closest("[data-action]");
  if (businessActionModule(actionTarget?.dataset?.action || "")) return true;

  if (!isSubmitControl(control)) return false;
  const form = formFor(control);
  if (!form) return false;
  if (form.matches(CONFIRMED_FORM_SELECTOR)) return true;
  return Boolean(businessFormModule(form.dataset.form || ""));
}

function removeFlash(flash) {
  if (!flash?.isConnected || flash.dataset.dismissing === "true") return;
  flash.dataset.dismissing = "true";
  flash.classList.add("is-leaving");
  window.setTimeout(() => flash.remove(), 180);
}

export function showButtonFeedback(control) {
  const host = ensureHost();
  const old = host.querySelector("[data-button-feedback]");
  if (old) old.remove();
  if (flashTimer) clearTimeout(flashTimer);

  const zh = feedbackLanguage() === "zh";
  const label = buttonFeedbackLabel(control);
  const flash = document.createElement("div");
  flash.className = "action-feedback-toast action-feedback-button";
  flash.dataset.buttonFeedback = String(++flashSequence);
  flash.setAttribute("role", "status");
  flash.setAttribute("aria-live", "polite");
  flash.style.pointerEvents = "none";

  const marker = document.createElement("span");
  marker.className = "action-feedback-marker";
  marker.setAttribute("aria-hidden", "true");
  marker.textContent = "✓";

  const text = document.createElement("span");
  text.className = "action-feedback-copy";
  const strong = document.createElement("strong");
  strong.textContent = zh ? "操作已執行" : "Đã thực hiện";
  const detail = document.createElement("small");
  detail.textContent = label
    ? (zh ? `已按下：${label}` : `Đã bấm: ${label}`)
    : (zh ? "系統已收到按鈕操作。" : "Hệ thống đã nhận thao tác nút.");
  text.append(strong, detail);
  flash.append(marker, text);
  host.append(flash);

  flashTimer = window.setTimeout(() => removeFlash(flash), FLASH_MS);
  return flash;
}

function handleAnyButtonClick(event) {
  const origin = event.target instanceof Element ? event.target : null;
  const control = origin?.closest?.(BUTTON_SELECTOR);
  if (!control) return;
  if (control.closest("[data-action-feedback-host]")) return;
  if (isDisabled(control)) return;
  if (usesConfirmedWriteFeedback(control)) return;
  showButtonFeedback(control);
}

document.addEventListener("click", handleAnyButtonClick, true);
