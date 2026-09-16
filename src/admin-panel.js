import { apiRequest, vpsHealth, vpsInventorySites, vpsListUsers, vpsMe } from "./vps-api.js";

const root = document.querySelector("#admin-app");
const state = {
  me: null,
  health: null,
  overview: null,
  users: [],
  sites: [],
  site: "",
  master: null,
  loading: true,
  saving: false,
  error: "",
  success: "",
};

const COPY = {
  vi: {
    title: "Admin Panel",
    subtitle: "Quản trị dữ liệu nền tảng · PostgreSQL là nguồn dữ liệu chuẩn",
    back: "Về Kitchen OS",
    accounts: "Quản lý tài khoản",
    refresh: "Làm mới",
    users: "Tài khoản hoạt động",
    sites: "Chi nhánh",
    locations: "Vị trí kho",
    workAreas: "Khu làm việc",
    items: "Mặt hàng kho",
    transactions: "Giao dịch kho",
    system: "Tình trạng hệ thống",
    release: "Phiên bản",
    schema: "Database schema",
    database: "Database",
    latestBackup: "Backup gần nhất",
    noBackup: "Chưa có bản ghi backup",
    masterData: "Dữ liệu nền tảng",
    masterSubtitle: "Chỉnh sửa tên hiển thị, trạng thái và cấu trúc dùng chung của chi nhánh.",
    addLocation: "Thêm vị trí",
    addWorkArea: "Thêm khu làm việc",
    code: "Mã cố định",
    zh: "Tên tiếng Hoa",
    vi: "Tên tiếng Việt",
    kind: "Loại",
    department: "Bộ phận",
    order: "Thứ tự",
    status: "Trạng thái",
    actions: "Thao tác",
    storage: "Kho / tủ",
    work: "Khu sử dụng",
    active: "Đang dùng",
    inactive: "Ngừng dùng",
    edit: "Sửa",
    archive: "Ngừng dùng",
    save: "Lưu vào Database",
    cancel: "Hủy",
    close: "Đóng",
    locationEditor: "Vị trí kho",
    workAreaEditor: "Khu làm việc",
    createCodeHint: "Mã chỉ tạo một lần và không thể đổi sau khi lưu.",
    archiveConfirm: "Xác nhận ngừng sử dụng mục này? Dữ liệu lịch sử sẽ được giữ lại.",
    forbidden: "Tài khoản này không có quyền mở Admin Panel.",
    loginRequired: "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại Kitchen OS.",
    loadFailed: "Không thể tải dữ liệu quản trị.",
    saved: "Đã lưu vào PostgreSQL và tải lại dữ liệu xác nhận.",
    archived: "Đã ngừng sử dụng và dữ liệu lịch sử vẫn được giữ lại.",
    empty: "Chưa có dữ liệu.",
    healthOk: "Hoạt động bình thường",
    healthBad: "Có lỗi",
    allDataNote: "Các site hiển thị ở đây được đọc trực tiếp từ PostgreSQL và quyền truy cập của tài khoản.",
  },
  "zh-TW": {
    title: "系統管理後台",
    subtitle: "主資料管理 · PostgreSQL 為唯一共享資料來源",
    back: "返回 Kitchen OS",
    accounts: "帳號管理",
    refresh: "重新整理",
    users: "啟用帳號",
    sites: "據點",
    locations: "庫存儲位",
    workAreas: "工作區",
    items: "庫存品項",
    transactions: "庫存異動",
    system: "系統狀態",
    release: "版本",
    schema: "資料庫 Schema",
    database: "資料庫",
    latestBackup: "最近備份",
    noBackup: "尚無備份紀錄",
    masterData: "主資料",
    masterSubtitle: "管理分店共用的顯示名稱、啟用狀態與結構。",
    addLocation: "新增儲位",
    addWorkArea: "新增工作區",
    code: "固定代碼",
    zh: "中文名稱",
    vi: "越文名稱",
    kind: "類型",
    department: "部門",
    order: "排序",
    status: "狀態",
    actions: "操作",
    storage: "倉儲 / 冰箱",
    work: "使用區",
    active: "啟用",
    inactive: "停用",
    edit: "編輯",
    archive: "停用",
    save: "儲存至資料庫",
    cancel: "取消",
    close: "關閉",
    locationEditor: "庫存儲位",
    workAreaEditor: "工作區",
    createCodeHint: "代碼建立後即固定，不可透過一般編輯修改。",
    archiveConfirm: "確定停用此項目？歷史資料會保留。",
    forbidden: "此帳號沒有管理後台權限。",
    loginRequired: "登入已失效，請重新登入 Kitchen OS。",
    loadFailed: "無法載入管理資料。",
    saved: "已寫入 PostgreSQL，並重新讀取資料確認。",
    archived: "已停用，歷史資料仍保留。",
    empty: "目前沒有資料。",
    healthOk: "運作正常",
    healthBad: "異常",
    allDataNote: "此處據點直接來自 PostgreSQL，並依目前帳號權限顯示。",
  },
};

function locale() {
  return state.me?.preferredLanguage === "zh-TW" ? "zh-TW" : "vi";
}

function t(key) {
  return COPY[locale()]?.[key] || COPY.vi[key] || key;
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function siteLabel(siteCode) {
  const row = state.sites.find((site) => site.code === siteCode);
  if (!row) return siteCode;
  return locale() === "zh-TW"
    ? (row.name_zh_tw || row.code)
    : `${row.name_vi || row.code} · ${row.name_zh_tw || row.code}`;
}

function capability(name) {
  return Boolean(state.me?.capabilities?.[name]);
}

function canOpenAdmin() {
  return state.me?.role === "admin" || capability("system.master_data.manage");
}

function fmtDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return esc(value);
  return new Intl.DateTimeFormat(locale() === "zh-TW" ? "zh-TW" : "vi-VN", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(date);
}

async function masterData(site = state.site) {
  return apiRequest(`/api/master-data/${encodeURIComponent(site)}?includeInactive=true`);
}

async function adminOverview() {
  return apiRequest("/api/admin/overview");
}

async function saveLocation(body) {
  return apiRequest("/api/master-data/locations", { method: "POST", body });
}

async function saveWorkArea(body) {
  return apiRequest("/api/master-data/work-areas", { method: "POST", body });
}

function errorText(error) {
  const code = error?.code || error?.message || "UNKNOWN_ERROR";
  const map = {
    LOCATION_HAS_POSITIVE_STOCK: "Không thể ngừng dùng: vị trí vẫn còn tồn kho > 0. / 無法停用：此儲位仍有庫存。",
    LOCATION_IS_RECEIVE_DEFAULT: "Không thể ngừng dùng: vị trí đang là nơi nhận hàng mặc định. / 無法停用：此儲位仍是預設收貨位置。",
    LOCATION_KIND_IN_USE: "Không thể đổi loại vì vị trí đã được sử dụng. / 儲位已被使用，無法變更類型。",
    LOCATION_CODE_EXISTS: "Mã vị trí đã tồn tại. / 儲位代碼已存在。",
    LOCATION_CODE_IMMUTABLE: "Không thể thay đổi mã vị trí sau khi tạo. / 建立後不可修改儲位代碼。",
    WORK_AREA_DEPARTMENT_NOT_FOUND: "Bộ phận không hợp lệ cho chi nhánh này. / 此部門不屬於目前據點。",
    LOCATION_MANAGE_NOT_ALLOWED: "Không có quyền chỉnh sửa vị trí kho. / 無儲位管理權限。",
    WORK_AREA_MANAGE_NOT_ALLOWED: "Không có quyền chỉnh sửa khu làm việc. / 無工作區管理權限。",
    SITE_NOT_ALLOWED: "Không có quyền truy cập chi nhánh này. / 無此據點權限。",
    AUTH_REQUIRED: t("loginRequired"),
  };
  return map[code] || `${code}`;
}

function renderOverviewCards() {
  const c = state.overview?.counts || {};
  const rows = [
    [t("users"), c.active_users ?? state.users.length ?? 0],
    [t("sites"), c.active_sites ?? state.sites.length ?? 0],
    [t("locations"), c.active_locations ?? 0],
    [t("workAreas"), c.active_work_areas ?? 0],
    [t("items"), c.active_inventory_items ?? 0],
    [t("transactions"), c.inventory_transactions ?? 0],
  ];
  return `<section class="admin-grid">${rows.map(([label, value]) => `
    <article class="admin-stat"><small>${esc(label)}</small><strong>${esc(value)}</strong></article>
  `).join("")}</section>`;
}

function renderSystemCard() {
  const ok = state.health?.app === "ok" && state.health?.database === "ok";
  const latestBackup = state.overview?.latestBackup;
  return `<article class="admin-card">
    <div class="admin-card-head"><div><h2>${esc(t("system"))}</h2><p>${esc(t("subtitle"))}</p></div></div>
    <div class="admin-meta">
      <div><small>${esc(t("database"))}</small><strong class="${ok ? "admin-health-ok" : "admin-health-bad"}">${esc(ok ? t("healthOk") : t("healthBad"))}</strong></div>
      <div><small>${esc(t("release"))}</small><strong>${esc(state.overview?.release || state.health?.release || "—")}</strong></div>
      <div><small>${esc(t("schema"))}</small><strong>${esc(state.overview?.schema?.version || state.health?.schema || "—")}</strong></div>
      <div><small>${esc(t("latestBackup"))}</small><strong>${esc(latestBackup?.backup_key || t("noBackup"))}</strong>${latestBackup ? `<br><span class="admin-footnote">${esc(fmtDate(latestBackup.completed_at || latestBackup.started_at))} · ${esc(latestBackup.status || "")}</span>` : ""}</div>
    </div>
  </article>`;
}

function renderLocationRows() {
  const rows = state.master?.locations || [];
  if (!rows.length) return `<div class="admin-empty">${esc(t("empty"))}</div>`;
  return `<div class="admin-table-wrap"><table class="admin-table"><thead><tr>
    <th>${esc(t("code"))}</th><th>${esc(t("zh"))}</th><th>${esc(t("vi"))}</th><th>${esc(t("kind"))}</th><th>${esc(t("order"))}</th><th>${esc(t("status"))}</th><th>${esc(t("actions"))}</th>
  </tr></thead><tbody>${rows.map((row) => `<tr>
    <td class="admin-code">${esc(row.code)}</td><td>${esc(row.name_zh_tw)}</td><td>${esc(row.name_vi)}</td>
    <td>${esc(row.kind === "work" ? t("work") : t("storage"))}</td><td>${esc(row.sort_order)}</td>
    <td><span class="admin-status ${row.active ? "on" : "off"}">${esc(row.active ? t("active") : t("inactive"))}</span></td>
    <td><div class="admin-row-actions"><button class="admin-btn" type="button" data-edit-location="${esc(row.id)}">${esc(t("edit"))}</button>${row.active ? `<button class="admin-btn danger" type="button" data-archive-location="${esc(row.id)}">${esc(t("archive"))}</button>` : ""}</div></td>
  </tr>`).join("")}</tbody></table></div>`;
}

function renderWorkAreaRows() {
  const rows = state.master?.workAreas || [];
  if (!rows.length) return `<div class="admin-empty">${esc(t("empty"))}</div>`;
  return `<div class="admin-table-wrap"><table class="admin-table"><thead><tr>
    <th>${esc(t("code"))}</th><th>${esc(t("zh"))}</th><th>${esc(t("vi"))}</th><th>${esc(t("department"))}</th><th>${esc(t("order"))}</th><th>${esc(t("status"))}</th><th>${esc(t("actions"))}</th>
  </tr></thead><tbody>${rows.map((row) => `<tr>
    <td class="admin-code">${esc(row.code)}</td><td>${esc(row.name_zh_tw)}</td><td>${esc(row.name_vi)}</td><td class="admin-code">${esc(row.department_code || "—")}</td><td>${esc(row.sort_order)}</td>
    <td><span class="admin-status ${row.active ? "on" : "off"}">${esc(row.active ? t("active") : t("inactive"))}</span></td>
    <td><div class="admin-row-actions"><button class="admin-btn" type="button" data-edit-work-area="${esc(row.code)}">${esc(t("edit"))}</button>${row.active ? `<button class="admin-btn danger" type="button" data-archive-work-area="${esc(row.code)}">${esc(t("archive"))}</button>` : ""}</div></td>
  </tr>`).join("")}</tbody></table></div>`;
}

function render() {
  if (!root) return;
  document.documentElement.lang = locale() === "zh-TW" ? "zh-Hant" : "vi";
  if (state.loading) {
    root.className = "admin-loading";
    root.textContent = "Kitchen OS · Admin Panel…";
    return;
  }
  if (!state.me) {
    root.className = "admin-loading";
    root.innerHTML = `<div><h1>${esc(t("loginRequired"))}</h1><a class="admin-btn primary" href="./">${esc(t("back"))}</a></div>`;
    return;
  }
  if (!canOpenAdmin()) {
    root.className = "admin-loading";
    root.innerHTML = `<div><h1>${esc(t("forbidden"))}</h1><a class="admin-btn primary" href="./">${esc(t("back"))}</a></div>`;
    return;
  }

  root.className = "admin-shell";
  root.innerHTML = `
    <header class="admin-topbar">
      <div class="admin-brand"><h1>Kitchen OS · ${esc(t("title"))}</h1><p>${esc(t("subtitle"))}</p></div>
      <div class="admin-actions"><a class="admin-btn" href="./#settings">${esc(t("accounts"))}</a><a class="admin-btn" href="./">${esc(t("back"))}</a><button class="admin-btn primary" type="button" data-refresh>${esc(t("refresh"))}</button></div>
    </header>
    ${state.error ? `<div class="admin-error">${esc(state.error)}</div>` : ""}
    ${state.success ? `<div class="admin-success">${esc(state.success)}</div>` : ""}
    ${renderOverviewCards()}
    ${renderSystemCard()}
    <section class="admin-layout">
      <aside class="admin-sidebar">${state.sites.map((site) => `<button type="button" class="admin-site-button ${state.site === site.code ? "active" : ""}" data-site="${esc(site.code)}">${esc(siteLabel(site.code))}</button>`).join("")}</aside>
      <main>
        <article class="admin-card">
          <div class="admin-card-head"><div><h2>${esc(t("masterData"))}${state.site ? ` · ${esc(siteLabel(state.site))}` : ""}</h2><p>${esc(t("masterSubtitle"))}</p></div><span class="admin-footnote">${esc(t("allDataNote"))}</span></div>
        </article>
        <article class="admin-card">
          <div class="admin-card-head"><div><h2>${esc(t("locations"))}</h2><p>${esc(state.master?.permissions?.manageLocations ? t("saved") : t("allDataNote"))}</p></div>${state.master?.permissions?.manageLocations ? `<button class="admin-btn primary" type="button" data-add-location>＋ ${esc(t("addLocation"))}</button>` : ""}</div>
          ${renderLocationRows()}
        </article>
        <article class="admin-card">
          <div class="admin-card-head"><div><h2>${esc(t("workAreas"))}</h2><p>${esc(t("masterSubtitle"))}</p></div>${state.master?.permissions?.manageWorkAreas ? `<button class="admin-btn primary" type="button" data-add-work-area>＋ ${esc(t("addWorkArea"))}</button>` : ""}</div>
          ${renderWorkAreaRows()}
        </article>
      </main>
    </section>`;
  bind();
}

async function loadAll({ keepMessage = false } = {}) {
  if (!keepMessage) {
    state.error = "";
    state.success = "";
  }
  try {
    const siteResult = await vpsInventorySites();
    state.sites = Array.isArray(siteResult?.sites) ? siteResult.sites : [];
    if (!state.sites.some((site) => site.code === state.site)) {
      state.site = state.sites[0]?.code || "";
    }
    const [health, overview, users, master] = await Promise.all([
      vpsHealth(),
      adminOverview(),
      vpsListUsers(),
      state.site ? masterData(state.site) : Promise.resolve(null),
    ]);
    state.health = health;
    state.overview = overview;
    state.users = users?.users || [];
    state.master = master;
  } catch (error) {
    state.error = `${t("loadFailed")} ${errorText(error)}`;
  }
  render();
}

function modalShell(title, body) {
  const host = document.createElement("div");
  host.className = "admin-modal-backdrop";
  host.innerHTML = `<section class="admin-modal" role="dialog" aria-modal="true"><div class="admin-modal-head"><h2>${esc(title)}</h2><button class="admin-btn" type="button" data-modal-close>×</button></div>${body}</section>`;
  document.body.append(host);
  host.querySelectorAll("[data-modal-close]").forEach((button) => button.addEventListener("click", () => host.remove()));
  host.addEventListener("click", (event) => { if (event.target === host) host.remove(); });
  return host;
}

function openLocationEditor(id = "") {
  const row = id ? state.master?.locations?.find((entry) => entry.id === id) : null;
  const sitePrefix = state.site ? `${state.site}-` : "";
  const host = modalShell(t("locationEditor"), `<form data-location-form>
    <div class="admin-form-grid">
      <label class="admin-field wide"><span>${esc(t("code"))}</span><input name="code" required pattern="[a-z][a-z0-9._-]{1,39}" value="${esc(row?.code || sitePrefix)}" ${row ? "readonly" : ""}><small class="admin-footnote">${esc(t("createCodeHint"))}</small></label>
      <label class="admin-field"><span>${esc(t("zh"))}</span><input name="name_zh_tw" required value="${esc(row?.name_zh_tw || "")}"></label>
      <label class="admin-field"><span>${esc(t("vi"))}</span><input name="name_vi" required value="${esc(row?.name_vi || "")}"></label>
      <label class="admin-field"><span>${esc(t("kind"))}</span><select name="kind"><option value="storage" ${row?.kind !== "work" ? "selected" : ""}>${esc(t("storage"))}</option><option value="work" ${row?.kind === "work" ? "selected" : ""}>${esc(t("work"))}</option></select></label>
      <label class="admin-field"><span>${esc(t("order"))}</span><input name="sort_order" type="number" step="1" value="${esc(row?.sort_order ?? 0)}"></label>
      <label class="admin-checkbox"><input name="active" type="checkbox" ${row?.active !== false ? "checked" : ""}><span>${esc(t("active"))}</span></label>
    </div><p class="admin-form-message" data-form-message></p><div class="admin-form-actions"><button class="admin-btn" type="button" data-modal-close>${esc(t("cancel"))}</button><button class="admin-btn primary" type="submit">${esc(t("save"))}</button></div>
  </form>`);
  const form = host.querySelector("[data-location-form]");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const submit = form.querySelector('button[type="submit"]');
    const message = form.querySelector("[data-form-message]");
    submit.disabled = true;
    message.textContent = "";
    try {
      await saveLocation({
        action: "save", id: row?.id || undefined, site: state.site,
        code: String(data.get("code") || "").trim(), name_zh_tw: String(data.get("name_zh_tw") || "").trim(), name_vi: String(data.get("name_vi") || "").trim(),
        kind: String(data.get("kind") || "storage"), sort_order: Number(data.get("sort_order") || 0), active: data.has("active"), metadata: row?.metadata || {},
      });
      host.remove();
      state.success = t("saved"); state.error = "";
      await loadAll({ keepMessage: true });
    } catch (error) {
      message.textContent = errorText(error);
      submit.disabled = false;
    }
  });
}

function openWorkAreaEditor(code = "") {
  const row = code ? state.master?.workAreas?.find((entry) => entry.code === code) : null;
  const departments = state.master?.departments || [];
  const host = modalShell(t("workAreaEditor"), `<form data-work-area-form>
    <div class="admin-form-grid">
      <label class="admin-field wide"><span>${esc(t("code"))}</span><input name="code" required pattern="[a-z][a-z0-9._-]{1,39}" value="${esc(row?.code || "")}" ${row ? "readonly" : ""}><small class="admin-footnote">${esc(t("createCodeHint"))}</small></label>
      <label class="admin-field"><span>${esc(t("zh"))}</span><input name="name_zh_tw" required value="${esc(row?.name_zh_tw || "")}"></label>
      <label class="admin-field"><span>${esc(t("vi"))}</span><input name="name_vi" required value="${esc(row?.name_vi || "")}"></label>
      <label class="admin-field"><span>${esc(t("department"))}</span><select name="department_code"><option value="">—</option>${departments.map((department) => `<option value="${esc(department.code)}" ${row?.department_code === department.code ? "selected" : ""}>${esc(locale() === "zh-TW" ? department.name_zh_tw : `${department.name_vi} · ${department.name_zh_tw}`)}</option>`).join("")}</select></label>
      <label class="admin-field"><span>${esc(t("order"))}</span><input name="sort_order" type="number" step="1" value="${esc(row?.sort_order ?? 0)}"></label>
      <label class="admin-checkbox"><input name="active" type="checkbox" ${row?.active !== false ? "checked" : ""}><span>${esc(t("active"))}</span></label>
    </div><p class="admin-form-message" data-form-message></p><div class="admin-form-actions"><button class="admin-btn" type="button" data-modal-close>${esc(t("cancel"))}</button><button class="admin-btn primary" type="submit">${esc(t("save"))}</button></div>
  </form>`);
  const form = host.querySelector("[data-work-area-form]");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const submit = form.querySelector('button[type="submit"]');
    const message = form.querySelector("[data-form-message]");
    submit.disabled = true;
    message.textContent = "";
    try {
      await saveWorkArea({
        action: "save", site: state.site, code: String(data.get("code") || "").trim(),
        name_zh_tw: String(data.get("name_zh_tw") || "").trim(), name_vi: String(data.get("name_vi") || "").trim(),
        department_code: String(data.get("department_code") || "").trim(), sort_order: Number(data.get("sort_order") || 0), active: data.has("active"), metadata: row?.metadata || {},
      });
      host.remove();
      state.success = t("saved"); state.error = "";
      await loadAll({ keepMessage: true });
    } catch (error) {
      message.textContent = errorText(error);
      submit.disabled = false;
    }
  });
}

async function archiveLocation(id) {
  if (!confirm(t("archiveConfirm"))) return;
  try {
    await saveLocation({ action: "archive", id, site: state.site });
    state.success = t("archived"); state.error = "";
    await loadAll({ keepMessage: true });
  } catch (error) {
    state.error = errorText(error); state.success = ""; render();
  }
}

async function archiveWorkArea(code) {
  if (!confirm(t("archiveConfirm"))) return;
  try {
    await saveWorkArea({ action: "archive", code, site: state.site });
    state.success = t("archived"); state.error = "";
    await loadAll({ keepMessage: true });
  } catch (error) {
    state.error = errorText(error); state.success = ""; render();
  }
}

function bind() {
  root.querySelector("[data-refresh]")?.addEventListener("click", () => void loadAll());
  root.querySelectorAll("[data-site]").forEach((button) => button.addEventListener("click", async () => {
    state.site = button.dataset.site;
    state.master = null; state.error = ""; state.success = ""; render();
    try { state.master = await masterData(state.site); } catch (error) { state.error = errorText(error); }
    render();
  }));
  root.querySelector("[data-add-location]")?.addEventListener("click", () => openLocationEditor());
  root.querySelector("[data-add-work-area]")?.addEventListener("click", () => openWorkAreaEditor());
  root.querySelectorAll("[data-edit-location]").forEach((button) => button.addEventListener("click", () => openLocationEditor(button.dataset.editLocation)));
  root.querySelectorAll("[data-edit-work-area]").forEach((button) => button.addEventListener("click", () => openWorkAreaEditor(button.dataset.editWorkArea)));
  root.querySelectorAll("[data-archive-location]").forEach((button) => button.addEventListener("click", () => void archiveLocation(button.dataset.archiveLocation)));
  root.querySelectorAll("[data-archive-work-area]").forEach((button) => button.addEventListener("click", () => void archiveWorkArea(button.dataset.archiveWorkArea)));
}

async function boot() {
  try {
    const me = await vpsMe();
    state.me = me?.user || null;
  } catch (error) {
    state.loading = false;
    state.error = errorText(error);
    render();
    return;
  }
  state.loading = false;
  if (!canOpenAdmin()) {
    render();
    return;
  }
  await loadAll();
}

void boot();
