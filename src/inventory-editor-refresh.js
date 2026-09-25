import { TEXT } from "./i18n.js";

const initialValues = new WeakMap();

// Record the form after its initial options and values have been rendered.
export function watchInventoryEditor(form) {
  if (form) initialValues.set(form, JSON.stringify([...new FormData(form)]));
}

// Clean editors can consume a confirmed remote snapshot immediately. Preserve
// only user changes, and prevent that stale draft from overwriting new data.
export function preserveInventoryEditor(form) {
  if (!form) return false;
  if (JSON.stringify([...new FormData(form)]) === initialValues.get(form)) return false;
  if (!form.querySelector("[data-inventory-remote-edit]")) {
    const message = document.createElement("p");
    message.dataset.inventoryRemoteEdit = "true";
    message.setAttribute("role", "status");
    message.textContent = TEXT[document.documentElement.lang.startsWith("zh") ? "zh" : "vi"].inventoryRemoteEdit;
    form.prepend(message);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      message.scrollIntoView({ block:"nearest" });
    }, true);
  }
  return true;
}
