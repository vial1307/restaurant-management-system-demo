import { searchMatches } from "./search-utils.js";

const GROUP_CLASS = "inventory-group";
const FAST_MARKER = "data-inventory-search-fast-group";

function groupCountSuffix(countNode) {
  const text = String(countNode?.textContent || "").trim();
  const suffix = text.replace(/^\d+(?:[.,]\d+)?\s*/, "").trim();
  return suffix || "mục";
}

function applyGroupedSearch(input) {
  if (!input?.isConnected || input.dataset.field !== "inventorySearch") return null;
  const page = input.closest(".page-content") || document.querySelector("#app");
  const table = page?.querySelector(".inventory-table");
  if (!table) return null;

  const query = input.value || "";
  const groups = [...table.querySelectorAll(`.${GROUP_CLASS}`)];
  if (!groups.length) return null;

  let visibleTotal = 0;
  for (const group of groups) {
    let visibleInGroup = 0;
    for (const row of group.querySelectorAll(".inventory-row")) {
      const visible = searchMatches(row.textContent || "", query);
      row.hidden = !visible;
      if (visible) visibleInGroup += 1;
    }
    group.hidden = visibleInGroup === 0;
    visibleTotal += visibleInGroup;

    const count = group.querySelector(".inventory-group-heading span");
    if (count) count.textContent = `${visibleInGroup} ${groupCountSuffix(count)}`;

    group.setAttribute(FAST_MARKER, "");
    group.classList.remove(GROUP_CLASS);
  }

  const restore = () => {
    for (const group of groups) {
      group.classList.add(GROUP_CLASS);
      group.removeAttribute(FAST_MARKER);
    }
    const empty = table.querySelector("[data-inventory-search-empty]");
    if (empty) empty.hidden = !query || visibleTotal > 0;
  };

  return restore;
}

function queueRestore(restore) {
  if (!restore) return;
  if (typeof queueMicrotask === "function") queueMicrotask(restore);
  else Promise.resolve().then(restore);
}

function handleSearchEvent(event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.dataset.field !== "inventorySearch") return;
  if (event.type === "input" && event.isComposing) return;
  queueRestore(applyGroupedSearch(input));
}

document.addEventListener("input", handleSearchEvent, true);
document.addEventListener("search", handleSearchEvent, true);
document.addEventListener("compositionend", handleSearchEvent, true);
