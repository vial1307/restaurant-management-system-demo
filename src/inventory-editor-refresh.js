import { TEXT } from "./i18n.js";

// Keep an open editor intact during a remote reconciliation. Its old values
// must not subsequently overwrite the newer snapshot without review.
export function preserveInventoryEditor(form) {
  if (!form) return false;
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
