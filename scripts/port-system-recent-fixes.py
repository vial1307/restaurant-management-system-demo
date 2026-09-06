from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def write(path, content):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def replace_once(path, old, new):
    content = read(path)
    if new in content:
        return False
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one replacement anchor, found {count}")
    write(path, content.replace(old, new, 1))
    return True


# 1) Canonical SDD specification first.
replace_once(
    "docs/SYSTEM_SPECIFICATION.md",
    """## 19. Settings and language\n\nSupported language modes:\n""",
    """## 19. Settings and language\n\nGeneral settings are a site-scoped business module. Users with `settings:edit` may edit the complete general-settings form and commit it explicitly with one Save action. Shared restaurant/site rules must be persisted through the VPS API into PostgreSQL; the UI may show a successful shared save only after the VPS confirms the `settings` module write.\n\nCurrent shared general settings include:\n\n- restaurant/organization name\n- current site/branch display name\n- reservation preparation buffer\n- weekday/weekend rice standards\n- rice skip threshold\n\nLanguage, current operator display name and workstation selection are local presentation/profile state and must not overwrite another user's shared settings. Users without `settings:edit` receive a read-only general-settings summary.\n\nMobile navigation must expose every application module that the signed-in account can access, including Settings, without relying on a long horizontal bottom strip as the only discovery mechanism. Desktop and mobile must preserve equivalent module access.\n\nSupported language modes:\n""",
)

# 2) Preserve the built-in operations-manager record. This is not the VPS auth admin;
#    it is the shared staff record used by SOP/attendance/skills business modules.
replace_once(
    "src/operations.js",
    """export const STAFFING_SHIFTS = [\n""",
    """const PERMANENT_MANAGER_ID = \"staff-manager\";\nconst OPERATIONS_MANAGER_RECOVERY_VERSION = 1;\n\nexport const STAFFING_SHIFTS = [\n""",
)
replace_once(
    "src/operations.js",
    """    staff: [{ id: \"staff-manager\", name: String(settings.employeeName || \"阿南\"), role: \"manager\", area: \"noodles\", hourlyRate: 230, active: true, pin: \"\" }],\n    activeStaffId: \"staff-manager\",\n    learning: [],\n""",
    """    staff: [{ id: PERMANENT_MANAGER_ID, name: String(settings.employeeName || \"阿南\"), role: \"manager\", area: \"noodles\", hourlyRate: 230, active: true, pin: \"\" }],\n    activeStaffId: PERMANENT_MANAGER_ID,\n    operationsManagerRecoveryVersion: OPERATIONS_MANAGER_RECOVERY_VERSION,\n    learning: [],\n""",
)
replace_once(
    "src/operations.js",
    """  const staff = Array.isArray(input.staff) && input.staff.length\n    ? input.staff.map((item) => ({ id: String(item.id), name: String(item.name || \"員工\"), role: STAFF_ROLES.some((role) => role.id === item.role) ? item.role : \"employee\", area: item.area || \"noodles\", hourlyRate: Math.max(0, Number(item.hourlyRate) || 0), active: item.active !== false, pin: String(item.pin ?? \"\") }))\n    : fallback.staff;\n  const sops = Array.isArray(input.sops)\n""",
    """  const staff = Array.isArray(input.staff) && input.staff.length\n    ? input.staff.map((item) => ({ id: String(item.id), name: String(item.name || \"員工\"), role: STAFF_ROLES.some((role) => role.id === item.role) ? item.role : \"employee\", area: item.area || \"noodles\", hourlyRate: Math.max(0, Number(item.hourlyRate) || 0), active: item.active !== false, pin: String(item.pin ?? \"\") }))\n    : fallback.staff;\n  const priorManagerRecoveryVersion = Math.max(0, Number(input.operationsManagerRecoveryVersion) || 0);\n  let permanentManager = staff.find((item) => item.id === PERMANENT_MANAGER_ID);\n  if (!permanentManager) {\n    permanentManager = { ...fallback.staff[0] };\n    staff.unshift(permanentManager);\n  } else {\n    permanentManager.role = \"manager\";\n    permanentManager.active = true;\n  }\n  if (priorManagerRecoveryVersion < OPERATIONS_MANAGER_RECOVERY_VERSION) permanentManager.pin = \"\";\n  const activeStaffId = priorManagerRecoveryVersion < OPERATIONS_MANAGER_RECOVERY_VERSION\n    ? PERMANENT_MANAGER_ID\n    : staff.some((item) => item.id === input.activeStaffId && item.active)\n      ? input.activeStaffId\n      : PERMANENT_MANAGER_ID;\n  const sops = Array.isArray(input.sops)\n""",
)
replace_once(
    "src/operations.js",
    """    staff,\n    activeStaffId: staff.some((item) => item.id === input.activeStaffId && item.active) ? input.activeStaffId : staff.find((item) => item.active)?.id || staff[0].id,\n    learning: Array.isArray(input.learning) ? input.learning : [],\n""",
    """    staff,\n    activeStaffId,\n    operationsManagerRecoveryVersion: OPERATIONS_MANAGER_RECOVERY_VERSION,\n    learning: Array.isArray(input.learning) ? input.learning : [],\n""",
)

# 3) General settings transaction in the current store-core architecture.
replace_once(
    "src/store-core.js",
    """export const DEFAULT_SETTINGS = {\n  language: \"vi\",\n  employeeName: \"阿南\",\n""",
    """export const DEFAULT_SETTINGS = {\n  language: \"vi\",\n  organizationName: \"食徒\",\n  branchName: \"\",\n  employeeName: \"阿南\",\n""",
)
replace_once(
    "src/store-core.js",
    """    updateSetting(key, value) {\n      const next = [\"language\", \"employeeName\", \"workstation\"].includes(key) ? value : clampNumber(value);\n      if (state.settings[key] === next) return state;\n      return update((draft) => { draft.settings[key] = next; });\n    },\n    updateReservation(key, value) {\n""",
    """    updateSetting(key, value) {\n      const next = [\"language\", \"employeeName\", \"workstation\"].includes(key) ? value : clampNumber(value);\n      if (state.settings[key] === next) return state;\n      return update((draft) => { draft.settings[key] = next; });\n    },\n    saveGeneralSettings(input = {}) {\n      const next = {\n        organizationName: String(input.organizationName ?? state.settings.organizationName ?? \"\").trim(),\n        branchName: String(input.branchName ?? state.settings.branchName ?? \"\").trim(),\n        employeeName: String(input.employeeName ?? state.settings.employeeName ?? \"\").trim(),\n        workstation: String(input.workstation ?? state.settings.workstation ?? \"\").trim(),\n        reservationBuffer: clampNumber(input.reservationBuffer ?? state.settings.reservationBuffer),\n        riceWeekday: clampNumber(input.riceWeekday ?? state.settings.riceWeekday),\n        riceWeekend: clampNumber(input.riceWeekend ?? state.settings.riceWeekend),\n        riceSkipAbove: clampNumber(input.riceSkipAbove ?? state.settings.riceSkipAbove),\n      };\n      const keys = Object.keys(next);\n      if (keys.every((key) => state.settings[key] === next[key])) return state;\n      return update((draft) => {\n        for (const key of keys) draft.settings[key] = next[key];\n        audit(draft, \"settings-update\", next.branchName || \"site\", next.organizationName);\n      });\n    },\n    updateReservation(key, value) {\n""",
)
replace_once(
    "src/store-core.js",
    """        const member = {\n          id: existing?.id || globalThis.crypto?.randomUUID?.() || `staff-${Date.now()}`,\n          name,\n          role: [\"manager\", \"supervisor\", \"employee\", \"parttime\"].includes(input.role) ? input.role : \"employee\",\n          area: [\"noodles\", \"soup\", \"seafood\", \"meat\"].includes(input.area) ? input.area : \"noodles\",\n          hourlyRate: clampNumber(input.hourlyRate),\n          active: input.active !== false,\n          pin: String(input.pin ?? existing?.pin ?? \"\"),\n        };\n        if (existing) Object.assign(existing, member);\n""",
    """        const member = {\n          id: existing?.id || globalThis.crypto?.randomUUID?.() || `staff-${Date.now()}`,\n          name,\n          role: [\"manager\", \"supervisor\", \"employee\", \"parttime\"].includes(input.role) ? input.role : \"employee\",\n          area: [\"noodles\", \"soup\", \"seafood\", \"meat\"].includes(input.area) ? input.area : \"noodles\",\n          hourlyRate: clampNumber(input.hourlyRate),\n          active: input.active !== false,\n          pin: String(input.pin ?? existing?.pin ?? \"\"),\n        };\n        if (member.id === \"staff-manager\") {\n          member.role = \"manager\";\n          member.active = true;\n        }\n        if (existing) Object.assign(existing, member);\n""",
)

# 4) Translation catalog for the new UI and persistence states.
replace_once(
    "src/i18n.js",
    """    autoSaved: \"Tự động lưu trên thiết bị này\",\n    history: \"Lịch sử đã lưu\",\n""",
    """    autoSaved: \"Tự động lưu trên thiết bị này\",\n    generalSettings: \"Cài đặt tổng quát\",\n    organizationName: \"Tên nhà hàng\",\n    branchName: \"Chi nhánh hiện tại\",\n    settingsReadOnly: \"Tài khoản này chỉ có quyền xem cài đặt chung.\",\n    settingsSaving: \"Đang lưu vào VPS/PostgreSQL...\",\n    settingsSavedVps: \"Đã lưu vào VPS/PostgreSQL\",\n    settingsSaveError: \"Không lưu được cài đặt chung. Kiểm tra kết nối rồi thử lại.\",\n    settingsLocalSaved: \"Thông tin phụ trách/khu làm việc đã lưu trên thiết bị này; không có thay đổi chung cần ghi VPS.\",\n    settingsNoChanges: \"Không có thay đổi mới cần lưu.\",\n    history: \"Lịch sử đã lưu\",\n""",
)
replace_once(
    "src/i18n.js",
    """    autoSaved: \"資料自動儲存在此裝置\",\n    history: \"已儲存日期\",\n""",
    """    autoSaved: \"資料自動儲存在此裝置\",\n    generalSettings: \"一般設定\",\n    organizationName: \"餐廳名稱\",\n    branchName: \"目前門市\",\n    settingsReadOnly: \"此帳號只有一般設定檢視權限。\",\n    settingsSaving: \"正在儲存至 VPS/PostgreSQL...\",\n    settingsSavedVps: \"已儲存至 VPS/PostgreSQL\",\n    settingsSaveError: \"一般設定儲存失敗，請檢查連線後再試。\",\n    settingsLocalSaved: \"負責人／工作區已儲存在此裝置；沒有共同設定需要寫入 VPS。\",\n    settingsNoChanges: \"目前沒有新的變更需要儲存。\",\n    history: \"已儲存日期\",\n""",
)

# 5) Mobile full-menu + explicit settings form, adapted to account permissions and VPS persistence.
replace_once(
    "src/app.js",
    """  managementModal: null,\n  editingStaffId: null,\n""",
    """  managementModal: null,\n  mobileMenuOpen: false,\n  settingsSaveStatus: \"\",\n  editingStaffId: null,\n""",
)
replace_once(
    "src/app.js",
    """  download: \"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4m4-5 5 5 5-5m-5 5V3\",\n};\n""",
    """  download: \"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4m4-5 5 5 5-5m-5 5V3\",\n  menuBars: \"M4 6h16M4 12h16M4 18h16\",\n};\n""",
)
replace_once(
    "src/app.js",
    """const FORM_EDIT_MODULE = {\n  \"add-task\":\"preparation\",\n""",
    """const FORM_EDIT_MODULE = {\n  \"save-general-settings\":\"settings\",\n  \"add-task\":\"preparation\",\n""",
)
replace_once(
    "src/app.js",
    """  return `<header class=\"topbar\"><div class=\"topbar-mobile-brand\"><span class=\"brand-mark small\">食</span><strong>Kitchen OS</strong></div>\n""",
    """  return `<header class=\"topbar\"><div class=\"topbar-mobile-brand\"><span class=\"brand-mark small\">食</span><strong>Kitchen OS</strong><button class=\"icon-button mobile-menu-button\" data-action=\"toggle-mobile-menu\" aria-expanded=\"${view.mobileMenuOpen}\" aria-label=\"${escapeHtml(language === \"zh\" ? \"開啟全部功能\" : \"Mở tất cả chức năng\")}\">${icon(\"menuBars\")}</button></div>\n""",
)
old_settings = r'''function settingsField(label, value, key, suffix = "", type = "number") {
  return `<label class="setting-row"><span>${escapeHtml(label)}</span><span class="setting-control"><input type="${type}" ${type === "number" ? 'min="0" inputmode="numeric"' : ""} value="${escapeHtml(value)}" data-field="setting" data-key="${key}" />${suffix ? `<small>${escapeHtml(suffix)}</small>` : ""}</span></label>`;
}

function settingsPage(context) {
  const { state, text, language } = context;
  const history = Object.keys(state.records).sort().reverse();
  return `${heading(text.settings, text.settingsSubtitle)}<section class="settings-layout"><article class="card settings-card">${cardHeading(text.appearance)}${settingsField(text.employee, state.settings.employeeName, "employeeName", "", "text")}${settingsField(text.workstation, state.settings.workstation, "workstation", "", "text")}<div class="setting-row"><span>${escapeHtml(text.language)}</span><div class="language-switch"><button class="${language === "vi" ? "active" : ""}" data-action="set-language" data-language="vi">Tiếng Việt</button><button class="${language === "zh" ? "active" : ""}" data-action="set-language" data-language="zh">繁體中文</button></div></div></article>
    <article class="card settings-card">${cardHeading(text.operationalRules)}${settingsField(text.reservationBuffer, state.settings.reservationBuffer, "reservationBuffer", text.tables)}${settingsField(text.weekdaysRice, state.settings.riceWeekday, "riceWeekday", "g")}${settingsField(text.weekendRice, state.settings.riceWeekend, "riceWeekend", "g")}${settingsField(text.skipRiceAbove, state.settings.riceSkipAbove, "riceSkipAbove", "g")}<p class="helper-text">${escapeHtml(text.riceRule)}</p></article>
    <article class="card settings-card">${cardHeading(text.history, `<span class="tag tag-neutral">${history.length} ${escapeHtml(text.savedDays)}</span>`)}<div class="history-list">${history.slice(0, 14).map((date) => `<button class="history-item ${date === state.selectedDate ? "active" : ""}" data-action="select-date" data-date="${date}"><span>${escapeHtml(dateLabel(date, language))}</span>${date === formatDateKey() ? `<small>${escapeHtml(text.today)}</small>` : ""}${icon("chevronRight")}</button>`).join("")}</div></article>
    ${management.staffCard(context)}<article class="card settings-card danger-zone">${cardHeading(text.data)}<p>${escapeHtml(text.autoSaved)}</p><button class="danger-button" data-action="reset">${escapeHtml(text.resetData)}</button></article></section>`;
}
'''
new_settings = r'''function settingsField(label, value, key, suffix = "", type = "number") {
  return `<label class="setting-row"><span>${escapeHtml(label)}</span><span class="setting-control"><input name="${escapeHtml(key)}" type="${type}" ${type === "number" ? 'min="0" inputmode="numeric"' : ""} value="${escapeHtml(value)}" />${suffix ? `<small>${escapeHtml(suffix)}</small>` : ""}</span></label>`;
}

function settingsPersistenceStatus(text) {
  const status = view.settingsSaveStatus;
  if (!status) return "";
  const label = status === "saved" ? text.settingsSavedVps
    : ["pending", "saving"].includes(status) ? text.settingsSaving
      : status === "error" ? text.settingsSaveError
        : status === "local" ? text.settingsLocalSaved
          : text.settingsNoChanges;
  return `<span class="settings-save-status settings-save-status-${escapeHtml(status)}" role="status">${status === "saved" ? icon("check") : ""}${escapeHtml(label)}</span>`;
}

function settingsPage(context) {
  const { state, text, language } = context;
  const history = Object.keys(state.records).sort().reverse();
  const canManage = accountCan("settings", "edit");
  const site = activeInventorySite();
  const defaultBranchName = { central: "央廚", fuxing: "復興店", yongji: "永吉店" }[site] || "";
  const branchName = state.settings.branchName || defaultBranchName;
  const general = canManage
    ? `<form data-form="save-general-settings">${settingsField(text.organizationName, state.settings.organizationName || "食徒", "organizationName", "", "text")}${settingsField(text.branchName, branchName, "branchName", "", "text")}${settingsField(text.employee, state.settings.employeeName, "employeeName", "", "text")}${settingsField(text.workstation, state.settings.workstation, "workstation", "", "text")}<div class="setting-row"><span>${escapeHtml(text.language)}</span><div class="language-switch"><button type="button" class="${language === "vi" ? "active" : ""}" data-action="set-language" data-language="vi">Tiếng Việt</button><button type="button" class="${language === "zh" ? "active" : ""}" data-action="set-language" data-language="zh">繁體中文</button></div></div><div class="settings-section-title">${escapeHtml(text.operationalRules)}</div>${settingsField(text.reservationBuffer, state.settings.reservationBuffer, "reservationBuffer", text.tables)}${settingsField(text.weekdaysRice, state.settings.riceWeekday, "riceWeekday", "g")}${settingsField(text.weekendRice, state.settings.riceWeekend, "riceWeekend", "g")}${settingsField(text.skipRiceAbove, state.settings.riceSkipAbove, "riceSkipAbove", "g")}<p class="helper-text">${escapeHtml(text.riceRule)}</p><div class="settings-save-row"><button class="primary-button" type="submit" data-settings-save>${icon("check")}${escapeHtml(text.saveChanges)}</button>${settingsPersistenceStatus(text)}</div></form>`
    : `<div class="settings-readonly"><p>${escapeHtml(text.settingsReadOnly)}</p><dl><div><dt>${escapeHtml(text.organizationName)}</dt><dd>${escapeHtml(state.settings.organizationName || "食徒")}</dd></div><div><dt>${escapeHtml(text.branchName)}</dt><dd>${escapeHtml(branchName)}</dd></div><div><dt>${escapeHtml(text.employee)}</dt><dd>${escapeHtml(state.settings.employeeName)}</dd></div><div><dt>${escapeHtml(text.workstation)}</dt><dd>${escapeHtml(state.settings.workstation)}</dd></div></dl></div>`;
  return `${heading(text.settings, text.settingsSubtitle)}<section class="settings-layout"><article class="card settings-card general-settings-card">${cardHeading(text.generalSettings)}${general}</article>
    <article class="card settings-card">${cardHeading(text.history, `<span class="tag tag-neutral">${history.length} ${escapeHtml(text.savedDays)}</span>`)}<div class="history-list">${history.slice(0, 14).map((date) => `<button class="history-item ${date === state.selectedDate ? "active" : ""}" data-action="select-date" data-date="${date}"><span>${escapeHtml(dateLabel(date, language))}</span>${date === formatDateKey() ? `<small>${escapeHtml(text.today)}</small>` : ""}${icon("chevronRight")}</button>`).join("")}</div></article>
    ${management.staffCard(context)}<article class="card settings-card danger-zone">${cardHeading(text.data)}<p>${escapeHtml(text.autoSaved)}</p><button class="danger-button" data-action="reset">${escapeHtml(text.resetData)}</button></article></section>`;
}
'''
replace_once("src/app.js", old_settings, new_settings)
replace_once(
    "src/app.js",
    """  root.innerHTML = `<div class=\"app-shell\">${sidebar(context, active)}<div class=\"main-shell\">${topbar(context)}<main class=\"page-content\">${pages[active](context)}</main></div><nav class=\"mobile-nav\">${ROUTES.map((key) => navItem(key, active, context.text)).join(\"\")}</nav></div>${view.modal === \"add-item\" ? addItemModal(context) : \"\"}${view.managementModal ? management.managementModal(context) : \"\"}`;\n""",
    """  const mobileMenu = view.mobileMenuOpen ? `<div class=\"mobile-menu-backdrop\" data-action=\"close-mobile-menu\"><nav class=\"mobile-menu\" aria-label=\"${escapeHtml(context.language === \"zh\" ? \"全部功能\" : \"Tất cả chức năng\")}\"><div class=\"mobile-menu-heading\"><strong>${escapeHtml(context.language === \"zh\" ? \"全部功能\" : \"Tất cả chức năng\")}</strong><button class=\"icon-button\" data-action=\"close-mobile-menu\" aria-label=\"${escapeHtml(context.text.cancel)}\">${icon(\"close\")}</button></div><div class=\"mobile-menu-grid\">${ROUTES.map((key) => navItem(key, active, context.text)).join(\"\")}</div></nav></div>` : \"\";\n  root.innerHTML = `<div class=\"app-shell\">${sidebar(context, active)}<div class=\"main-shell\">${topbar(context)}<main class=\"page-content\">${pages[active](context)}</main></div><nav class=\"mobile-nav\">${ROUTES.map((key) => navItem(key, active, context.text)).join(\"\")}</nav></div>${mobileMenu}${view.modal === \"add-item\" ? addItemModal(context) : \"\"}${view.managementModal ? management.managementModal(context) : \"\"}`;\n""",
)
replace_once(
    "src/app.js",
    """  if (management.handleClick(target, event, currentContext())) return;\n\n  if (action === \"shift-date\") { view.calendarOpen = false; selectServiceDate(shiftDate(state.selectedDate, Number(target.dataset.offset))); }\n""",
    """  if (management.handleClick(target, event, currentContext())) return;\n\n  if (action === \"toggle-mobile-menu\") { view.mobileMenuOpen = !view.mobileMenuOpen; render(); return; }\n  if (action === \"close-mobile-menu\" && (target === event.target || target.closest(\".icon-button\"))) { view.mobileMenuOpen = false; render(); return; }\n  if (action === \"shift-date\") { view.calendarOpen = false; selectServiceDate(shiftDate(state.selectedDate, Number(target.dataset.offset))); }\n""",
)
replace_once(
    "src/app.js",
    """  const data = new FormData(form);\n  if (management.handleSubmit(form, data)) return;\n  if (form.dataset.form === \"add-task\") {\n""",
    """  const data = new FormData(form);\n  if (management.handleSubmit(form, data)) return;\n  if (form.dataset.form === \"save-general-settings\") {\n    const current = store.getState().settings;\n    const input = Object.fromEntries([\"organizationName\", \"branchName\", \"employeeName\", \"workstation\", \"reservationBuffer\", \"riceWeekday\", \"riceWeekend\", \"riceSkipAbove\"].map((key) => [key, data.get(key)]));\n    const normalizedShared = {\n      organizationName: String(input.organizationName ?? \"\").trim(),\n      branchName: String(input.branchName ?? \"\").trim(),\n      reservationBuffer: Math.max(0, Number(input.reservationBuffer) || 0),\n      riceWeekday: Math.max(0, Number(input.riceWeekday) || 0),\n      riceWeekend: Math.max(0, Number(input.riceWeekend) || 0),\n      riceSkipAbove: Math.max(0, Number(input.riceSkipAbove) || 0),\n    };\n    const sharedChanged = Object.entries(normalizedShared).some(([key, value]) => current[key] !== value);\n    const personalChanged = String(input.employeeName ?? \"\").trim() !== current.employeeName || String(input.workstation ?? \"\").trim() !== current.workstation;\n    view.settingsSaveStatus = sharedChanged ? \"pending\" : personalChanged ? \"local\" : \"unchanged\";\n    store.saveGeneralSettings(input);\n    if (!sharedChanged) renderWhenAuthorized();\n    return;\n  }\n  if (form.dataset.form === \"add-task\") {\n""",
)
replace_once(
    "src/app.js",
    """window.addEventListener(\"hashchange\", () => {\n  view.calendarOpen = false;\n""",
    """window.addEventListener(\"hashchange\", () => {\n  view.calendarOpen = false;\n  view.mobileMenuOpen = false;\n""",
)
replace_once(
    "src/app.js",
    """  if (event.key === \"Escape\" && view.calendarOpen) { view.calendarOpen = false; render(); }\n});\nwindow.addEventListener(\"offline\", renderWhenAuthorized);\n""",
    """  if (event.key === \"Escape\" && view.calendarOpen) { view.calendarOpen = false; render(); }\n  if (event.key === \"Escape\" && view.mobileMenuOpen) { view.mobileMenuOpen = false; render(); }\n});\nwindow.addEventListener(\"shitu:business-persistence-status\", (event) => {\n  const modules = Array.isArray(event.detail?.modules) ? event.detail.modules : [];\n  if (!modules.includes(\"settings\")) return;\n  const status = String(event.detail?.status || \"\");\n  if (![\"pending\", \"saving\", \"saved\", \"error\"].includes(status)) return;\n  view.settingsSaveStatus = status;\n  if (route() === \"settings\") renderWhenAuthorized();\n});\nwindow.addEventListener(\"offline\", renderWhenAuthorized);\n""",
)

# 6) Responsive styling.
replace_once(
    "src/styles.css",
    ".topbar-mobile-brand { display: none; }\n",
    ".topbar-mobile-brand { display: none; }\n.mobile-menu-button { display: none; margin-left: auto; }\n",
)
replace_once(
    "src/styles.css",
    ".settings-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }\n",
    """.settings-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }\n.general-settings-card { grid-row: span 2; }\n.settings-section-title { margin-top: 18px; padding: 15px 0 7px; border-top: 1px solid var(--line); font-size: 12px; font-weight: 700; }\n.settings-save-row { display: flex; min-height: 44px; align-items: center; flex-wrap: wrap; gap: 12px; margin-top: 18px; }\n.settings-save-status { display: inline-flex; align-items: center; gap: 5px; max-width: 100%; font-size: 11px; font-weight: 650; line-height: 1.45; }\n.settings-save-status .icon { width: 15px; height: 15px; }\n.settings-save-status-saved { color: var(--green); }\n.settings-save-status-error { color: var(--red); }\n.settings-save-status-pending, .settings-save-status-saving, .settings-save-status-local, .settings-save-status-unchanged { color: var(--muted); }\n.settings-readonly > p { margin: 0 0 12px; color: var(--muted); font-size: 11px; }\n.settings-readonly dl { display: grid; gap: 0; margin: 0; }\n.settings-readonly dl > div { display: flex; justify-content: space-between; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--line); }\n.settings-readonly dt { color: var(--muted); font-size: 11px; }\n.settings-readonly dd { margin: 0; overflow-wrap: anywhere; font-size: 12px; font-weight: 650; text-align: right; }\n.mobile-menu-backdrop, .mobile-menu { display: none; }\n""",
)
replace_once(
    "src/styles.css",
    """  .topbar-mobile-brand { display: flex; align-items: center; gap: 9px; }\n  .topbar-mobile-brand > strong { font-size: 13px; }\n""",
    """  .topbar-mobile-brand { display: flex; flex: 1; align-items: center; gap: 9px; }\n  .mobile-menu-button { display: grid; }\n  .topbar-mobile-brand > strong { font-size: 13px; }\n""",
)
replace_once(
    "src/styles.css",
    """  .mobile-nav > .nav-item.active { background: transparent; color: var(--green); }\n  .mobile-nav > .nav-item.active > .icon { color: var(--green); }\n  .modal-card { padding: 17px; }\n""",
    """  .mobile-nav > .nav-item.active { background: transparent; color: var(--green); }\n  .mobile-nav > .nav-item.active > .icon { color: var(--green); }\n  .mobile-menu-backdrop { position: fixed; z-index: 20; inset: 0; display: flex; align-items: flex-end; background: rgb(17 39 36 / 42%); backdrop-filter: blur(2px); }\n  .mobile-menu { display: block; width: 100%; max-height: min(82vh, 650px); overflow-y: auto; padding: 16px 15px calc(20px + env(safe-area-inset-bottom)); border-radius: 20px 20px 0 0; background: #fff; box-shadow: 0 -16px 50px rgb(17 39 36 / 18%); }\n  .mobile-menu-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 13px; }\n  .mobile-menu-heading > strong { font-size: 15px; }\n  .mobile-menu-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }\n  .mobile-menu-grid .nav-item { min-width: 0; min-height: 78px; flex-direction: column; justify-content: center; gap: 7px; padding: 8px 5px; border: 1px solid var(--line); background: #fff; color: #53625d; text-align: center; }\n  .mobile-menu-grid .nav-item > span { overflow-wrap: anywhere; font-size: 10px; }\n  .mobile-menu-grid .nav-item.active { border-color: #b9dece; background: var(--green-soft); color: var(--green); }\n  .settings-save-row > .primary-button { flex: 0 0 auto; }\n  .settings-save-status { flex: 1 1 180px; }\n  .modal-card { padding: 17px; }\n""",
)

# 7) Permanent regression coverage, executed by the existing static-regression gate.
regression = r'''import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createStore } from "../src/store-core.js";
import { hydrateOperations } from "../src/operations.js";
import { businessModulesFromState } from "../src/business-state-sync.js";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const source = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const memoryStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
};

const storage = memoryStorage();
const store = createStore(storage);
store.saveGeneralSettings({
  organizationName: "食徒",
  branchName: "永吉店",
  employeeName: "成南",
  workstation: "麵台",
  reservationBuffer: "3",
  riceWeekday: "2100",
  riceWeekend: "3200",
  riceSkipAbove: "1800",
});
assert.equal(store.getState().settings.branchName, "永吉店");
assert.equal(store.getState().settings.riceWeekend, 3200);
const modules = businessModulesFromState(store.getState());
assert.equal(modules.settings.organizationName, "食徒");
assert.equal(modules.settings.branchName, "永吉店");
assert.equal(Object.hasOwn(modules.settings, "employeeName"), false, "operator name must remain local/profile state");
assert.equal(Object.hasOwn(modules.settings, "workstation"), false, "workstation must remain local/profile state");

store.saveStaff({ id: "staff-manager", name: "Default manager", role: "parttime", area: "soup", hourlyRate: 230, active: false });
const permanent = store.getState().operations.staff.find((member) => member.id === "staff-manager");
assert.equal(permanent.role, "manager");
assert.equal(permanent.active, true);

const recovered = hydrateOperations({
  staff: [{ id: "staff-manager", name: "Recovered", role: "parttime", area: "noodles", hourlyRate: 230, active: false, pin: "1234" }],
  activeStaffId: "staff-manager",
  operationsManagerRecoveryVersion: 0,
}, { employeeName: "阿南" });
assert.equal(recovered.staff[0].role, "manager");
assert.equal(recovered.staff[0].active, true);
assert.equal(recovered.staff[0].pin, "");

const app = source("src/app.js");
assert.match(app, /data-action="toggle-mobile-menu"/);
assert.match(app, /data-form="save-general-settings"/);
assert.match(app, /shitu:business-persistence-status/);
assert.match(app, /modules\.includes\("settings"\)/);
assert.match(source("src/styles.css"), /\.mobile-menu-grid/);
assert.match(source("docs/SYSTEM_SPECIFICATION.md"), /successful shared save only after the VPS confirms/);
'''
write("tests/system-port-regression.mjs", regression)
replace_once(
    "tests/static-regression.mjs",
    """import { searchMatches } from \"../src/search-utils.js\";\n\n""",
    """import { searchMatches } from \"../src/search-utils.js\";\nimport \"./system-port-regression.mjs\";\n\n""",
)

print("Recent system fixes port prepared successfully.")
