import { apiRequest, vpsMasterData } from "./vps-api.js";

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function activeSite() {
  return document.querySelector(".admin-site-button.active")?.dataset?.site || "";
}

function currentLanguage() {
  return document.documentElement.lang === "zh-Hant" ? "zh-TW" : "vi";
}

function text(vi, zh) {
  return currentLanguage() === "zh-TW" ? zh : vi;
}

function normalizeMetadata(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
}

function workAreaOptions(master, selected = "") {
  const rows = Array.isArray(master?.workAreas) ? master.workAreas.filter((row) => row.active !== false) : [];
  return [
    `<option value="">${esc(text("— Chọn khu làm việc —", "— 選擇工作區 —"))}</option>`,
    ...rows.map((row) => {
      const label = currentLanguage() === "zh-TW"
        ? (row.name_zh_tw || row.code)
        : `${row.name_vi || row.code} · ${row.name_zh_tw || row.code}`;
      return `<option value="${esc(row.code)}" ${row.code === selected ? "selected" : ""}>${esc(label)}</option>`;
    }),
  ].join("");
}

function mountStyles() {
  if (document.querySelector("#inventory-master-admin-style")) return;
  const style = document.createElement("style");
  style.id = "inventory-master-admin-style";
  style.textContent = `
    .inventory-master-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;grid-column:1/-1;padding:12px;border:1px solid var(--bs-border-color,#ddd);border-radius:12px;background:rgba(127,127,127,.04)}
    .inventory-master-fields .wide{grid-column:1/-1}
    .inventory-master-hint{font-size:.78rem;opacity:.72;line-height:1.45;margin-top:4px}
    @media(max-width:720px){.inventory-master-fields{grid-template-columns:1fr}}
  `;
  document.head.append(style);
}

async function enhanceLocationEditor(trigger) {
  const site = activeSite();
  if (!site) return;

  await new Promise((resolve) => setTimeout(resolve, 0));
  const form = document.querySelector(".admin-modal form[data-location-form]");
  if (!form || form.dataset.inventoryMasterEnhanced === "true") return;
  form.dataset.inventoryMasterEnhanced = "true";

  const rowId = String(trigger?.dataset?.editLocation || "");
  let master;
  try {
    master = await vpsMasterData(site, { includeInactive:true });
  } catch {
    return;
  }
  const row = rowId
    ? (master?.locations || []).find((entry) => String(entry.id) === rowId) || null
    : null;
  const metadata = normalizeMetadata(row?.metadata);
  const currentKind = String(row?.kind || form.elements.kind?.value || "storage");
  const currentUiKey = String(metadata.ui_key || row?.code || "");
  const currentStorageGroup = String(metadata.storage_group || "service");
  const currentWorkArea = String(metadata.work_area || "");

  const fields = document.createElement("div");
  fields.className = "inventory-master-fields";
  fields.innerHTML = `
    <label class="admin-field wide">
      <span>${esc(text("UI key (khóa giao diện)", "UI key（介面鍵值）"))}</span>
      <input name="inventory_ui_key" value="${esc(currentUiKey)}" autocomplete="off">
      <small class="inventory-master-hint">${esc(text(
        "Được lưu trong Database. Frontend dùng key này để nhận diện vị trí; đổi tên hiển thị không cần sửa code.",
        "儲存在資料庫。前端以此鍵值識別儲位；修改顯示名稱不需要改程式。"
      ))}</small>
    </label>
    <label class="admin-field" data-inventory-storage-group>
      <span>${esc(text("Nhóm kho", "儲位群組"))}</span>
      <select name="inventory_storage_group">
        <option value="primary" ${currentStorageGroup === "primary" ? "selected" : ""}>primary · ${esc(text("Kho chính", "主要庫存"))}</option>
        <option value="service" ${currentStorageGroup !== "primary" ? "selected" : ""}>service · ${esc(text("Kho phục vụ/bổ hàng", "服務／補貨庫存"))}</option>
      </select>
    </label>
    <label class="admin-field" data-inventory-work-area>
      <span>${esc(text("Liên kết khu làm việc", "綁定工作區"))}</span>
      <select name="inventory_work_area">${workAreaOptions(master, currentWorkArea)}</select>
    </label>
  `;

  const grid = form.querySelector(".admin-form-grid");
  grid?.append(fields);
  mountStyles();

  const kindInput = form.elements.kind;
  const storageField = fields.querySelector("[data-inventory-storage-group]");
  const workField = fields.querySelector("[data-inventory-work-area]");
  const uiKeyInput = form.elements.inventory_ui_key;
  const codeInput = form.elements.code;
  let uiKeyTouched = Boolean(row);

  const updateVisibility = () => {
    const kind = String(kindInput?.value || "storage");
    if (storageField) storageField.hidden = kind !== "storage";
    if (workField) workField.hidden = kind !== "work";
  };
  updateVisibility();
  kindInput?.addEventListener("change", updateVisibility);
  uiKeyInput?.addEventListener("input", () => { uiKeyTouched = true; });
  codeInput?.addEventListener("input", () => {
    if (!uiKeyTouched && uiKeyInput) uiKeyInput.value = String(codeInput.value || "").trim();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();

    const data = new FormData(form);
    const submit = form.querySelector('button[type="submit"]');
    const message = form.querySelector("[data-form-message]");
    if (submit) submit.disabled = true;
    if (message) message.textContent = "";

    const code = String(data.get("code") || "").trim();
    const kind = String(data.get("kind") || "storage");
    const nextMetadata = normalizeMetadata(row?.metadata);
    nextMetadata.ui_key = String(data.get("inventory_ui_key") || "").trim() || code;

    if (kind === "storage") {
      nextMetadata.storage_group = String(data.get("inventory_storage_group") || "service") === "primary"
        ? "primary"
        : "service";
      delete nextMetadata.work_area;
    } else {
      const workArea = String(data.get("inventory_work_area") || "").trim();
      if (workArea) nextMetadata.work_area = workArea;
      else delete nextMetadata.work_area;
      delete nextMetadata.storage_group;
    }

    try {
      await apiRequest("/api/master-data/locations", {
        method:"POST",
        body:{
          action:"save",
          id:row?.id || undefined,
          site,
          code,
          name_zh_tw:String(data.get("name_zh_tw") || "").trim(),
          name_vi:String(data.get("name_vi") || "").trim(),
          kind,
          sort_order:Number(data.get("sort_order") || 0),
          active:data.has("active"),
          metadata:nextMetadata,
        },
      });
      location.reload();
    } catch (error) {
      if (message) message.textContent = error?.code || error?.message || "MASTER_DATA_SAVE_FAILED";
      if (submit) submit.disabled = false;
    }
  }, { capture:true });
}

document.addEventListener("click", (event) => {
  const trigger = event.target?.closest?.("[data-add-location],[data-edit-location]");
  if (!trigger) return;
  void enhanceLocationEditor(trigger);
}, true);
