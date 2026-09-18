const root = document.querySelector("#admin-app");

const SECTION_COPY = {
  development: {
    eyebrow: "Engineering Handoff",
    title: "GitHub, release và điểm tiếp tục code",
    description: "Một nơi duy nhất để biết production đang ở SHA nào, công việc hiện tại nằm ở branch/PR nào, lỗi gần nhất và dev tiếp theo phải tiếp tục từ đâu.",
  },
  users: {
    eyebrow: "Identity & Access",
    title: "Tài khoản và phân quyền toàn hệ thống",
    description: "Quản lý account, role, phạm vi chi nhánh và quyền View/Edit. Mọi thay đổi tiếp tục được ghi qua API vào PostgreSQL.",
  },
  content: {
    eyebrow: "Content Governance",
    title: "Nội dung, SOP và dữ liệu công bố",
    description: "Theo dõi thông báo, media, menu và luồng duyệt SOP từ một bảng điều khiển thống nhất.",
  },
  data: {
    eyebrow: "Database Administration",
    title: "Data Tables & CRUD",
    description: "Chỉ thao tác các dataset và column đã được backend whitelist. Không có truy vấn SQL trực tiếp từ trình duyệt.",
  },
  stores: {
    eyebrow: "Multi-store Operations",
    title: "Quản trị chuỗi, chi nhánh và luồng dữ liệu",
    description: "Cấu hình site, đồng bộ menu/giá và điều chuyển kho bằng transaction chuẩn của Kitchen OS.",
  },
  settings: {
    eyebrow: "Platform Configuration",
    title: "Cấu hình hệ thống",
    description: "Thiết lập cấp hệ thống được lưu trong PostgreSQL và chỉ hiển thị thành công sau khi API xác nhận.",
  },
  logs: {
    eyebrow: "Audit & Compliance",
    title: "Nhật ký và báo cáo hệ thống",
    description: "Theo dõi lịch sử thao tác, lọc theo user/site/action và xuất báo cáo từ cùng phạm vi dữ liệu server-side.",
  },
};

let scheduled = false;
let applying = false;

function activeSection() {
  return root?.querySelector(".sa-nav-item.active")?.dataset.section || location.hash.replace(/^#/, "") || "overview";
}

function safeText(node) {
  return node?.textContent?.replace(/\s+/g, " ").trim() || "";
}

function metric(label, value, note = "") {
  return `<div class="sa-section-metric"><small>${label}</small><strong>${value}</strong>${note ? `<span>${note}</span>` : ""}</div>`;
}

function insertHero(section, metrics, status = "Live DB") {
  const content = root.querySelector(".sa-content");
  const copy = SECTION_COPY[section];
  if (!content || !copy || content.querySelector("[data-ui-v2-section-hero]")) return null;
  const hero = document.createElement("section");
  hero.className = "sa-section-hero-v2";
  hero.dataset.uiV2SectionHero = section;
  hero.innerHTML = `
    <div class="sa-section-hero-copy">
      <div class="sa-eyebrow">${copy.eyebrow}</div>
      <h2>${copy.title}</h2>
      <p>${copy.description}</p>
    </div>
    <div class="sa-section-status"><span class="sa-dot ok"></span><strong>${status}</strong><small>API → PostgreSQL</small></div>
    <div class="sa-section-metrics">${metrics.join("")}</div>`;
  const first = content.firstElementChild;
  if (first?.classList.contains("sa-alert")) first.after(hero);
  else content.prepend(hero);
  return hero;
}

function decorateTable(table) {
  if (!table || table.dataset.uiV2 === "1") return;
  table.dataset.uiV2 = "1";
  table.classList.add("sa-table-v2");
  const headers = [...table.querySelectorAll("thead th")].map((th) => safeText(th));
  table.querySelectorAll("tbody tr").forEach((row) => {
    row.classList.add("sa-data-row-v2");
    [...row.children].forEach((cell, index) => {
      if (headers[index]) cell.dataset.label = headers[index];
    });
  });
}

function decorateDevelopment() {
  const content = root.querySelector(".sa-content");
  if (!content || content.dataset.moduleV2 === "development") return;
  content.dataset.moduleV2 = "development";
  const status = safeText(content.querySelector(".sa-dev-summary .sa-pill")) || "UNKNOWN";
  const links = content.querySelectorAll(".sa-dev-link").length;
  const files = content.querySelectorAll(".sa-code-list code").length;
  const steps = content.querySelectorAll(".sa-dev-steps li").length;
  insertHero("development", [
    metric("Work status", status, "handoff state"),
    metric("GitHub links", links, "repo / branch / workflow / docs"),
    metric("Code focus", files, "files to resume"),
    metric("Next steps", steps, "ordered continuation"),
  ], "Handoff");
  content.querySelectorAll(":scope > .sa-card, :scope > .sa-two-col .sa-card").forEach((card) => card.classList.add("sa-module-card-v2"));
}

function decorateUsers() {
  const card = root.querySelector(".sa-content > .sa-card");
  if (!card || card.dataset.moduleV2 === "users") return;
  card.dataset.moduleV2 = "users";
  card.classList.add("sa-module-card-v2", "sa-users-card-v2");
  const rows = [...card.querySelectorAll("tbody tr")];
  const active = rows.filter((row) => row.querySelector(".sa-pill.ok")).length;
  const disabled = rows.filter((row) => row.querySelector(".sa-pill.off")).length;
  const roles = new Set(rows.map((row) => safeText(row.children[1]?.querySelector("small")) || safeText(row.children[1])).filter(Boolean));
  const scopes = new Set(rows.map((row) => safeText(row.children[2])).filter(Boolean));
  insertHero("users", [
    metric("Tổng tài khoản", rows.length, "database users"),
    metric("Đang hoạt động", active, "active"),
    metric("Đã khóa", disabled, "disabled"),
    metric("Role / scope", `${roles.size} / ${scopes.size}`, "RBAC coverage"),
  ]);
  decorateTable(card.querySelector("table"));
}

function decorateContent() {
  const content = root.querySelector(".sa-content");
  if (!content || content.dataset.moduleV2 === "content") return;
  content.dataset.moduleV2 = "content";
  const stats = [...content.querySelectorAll(".sa-stat-grid.compact .sa-stat")];
  const values = new Map(stats.map((item) => [safeText(item.querySelector("small")), safeText(item.querySelector("strong"))]));
  const read = (prefix) => [...values.entries()].find(([key]) => key.startsWith(prefix))?.[1] || "0";
  insertHero("content", [
    metric("Thông báo", read("Thông báo")),
    metric("SOP chờ duyệt", read("SOP"), "approval queue"),
    metric("Menu", read("Menu")),
    metric("Media", read("Media")),
  ]);
  content.querySelectorAll(":scope > .sa-card, :scope > .sa-two-col .sa-card").forEach((card) => card.classList.add("sa-module-card-v2"));
}

function decorateData() {
  const card = root.querySelector(".sa-content > .sa-card");
  if (!card || card.dataset.moduleV2 === "data") return;
  card.dataset.moduleV2 = "data";
  card.classList.add("sa-module-card-v2", "sa-data-card-v2");
  const dataset = safeText(card.querySelector(".sa-tab.active")) || "Dataset";
  const pagination = safeText(card.querySelector(".sa-pagination span"));
  const total = pagination.match(/([\d,]+)\s+rows/i)?.[1] || "0";
  const page = pagination.match(/page\s+([^\s]+)/i)?.[1] || "1/1";
  const filterForm = card.querySelector("[data-data-filter]");
  const activeFilters = filterForm ? [...filterForm.elements].filter((el) => el.name && String(el.value || "").trim()).length : 0;
  insertHero("data", [
    metric("Dataset", dataset, "backend whitelist"),
    metric("Rows", total, "filtered result"),
    metric("Trang", page, "pagination"),
    metric("Bộ lọc", activeFilters, activeFilters ? "đang áp dụng" : "chưa áp dụng"),
  ]);
  decorateTable(card.querySelector("table"));
}

function decorateStores() {
  const content = root.querySelector(".sa-content");
  const firstCard = content?.querySelector(":scope > .sa-card");
  if (!content || !firstCard || content.dataset.moduleV2 === "stores") return;
  content.dataset.moduleV2 = "stores";
  const rows = [...firstCard.querySelectorAll("tbody tr")];
  const active = rows.filter((row) => row.querySelector(".sa-pill.ok")).length;
  const inactive = rows.filter((row) => row.querySelector(".sa-pill.off")).length;
  const currencies = new Set(rows.map((row) => safeText(row.children[3])).filter(Boolean));
  const timezones = new Set(rows.map((row) => safeText(row.children[2])).filter(Boolean));
  insertHero("stores", [
    metric("Tổng site", rows.length),
    metric("Đang hoạt động", active, "active"),
    metric("Ngừng hoạt động", inactive, "inactive"),
    metric("Timezone / currency", `${timezones.size} / ${currencies.size}`),
  ]);
  content.querySelectorAll(":scope > .sa-card, :scope > .sa-two-col .sa-card").forEach((card) => card.classList.add("sa-module-card-v2"));
  decorateTable(firstCard.querySelector("table"));
  const transferCard = [...content.querySelectorAll(".sa-two-col .sa-card")].find((card) => safeText(card.querySelector("h2")).includes("Kho tổng"));
  transferCard?.classList.add("sa-transfer-card-v2");
}

function decorateSettings() {
  const card = root.querySelector(".sa-content > .sa-card");
  if (!card || card.dataset.moduleV2 === "settings") return;
  card.dataset.moduleV2 = "settings";
  card.classList.add("sa-module-card-v2", "sa-settings-card-v2");
  const rows = [...card.querySelectorAll("tbody tr")];
  const versions = rows.map((row) => Number(safeText(row.children[2])) || 0);
  const updated = rows.map((row) => safeText(row.children[3])).filter(Boolean)[0] || "—";
  insertHero("settings", [
    metric("Setting keys", rows.length),
    metric("Version cao nhất", versions.length ? Math.max(...versions) : 0),
    metric("Nguồn dữ liệu", "PostgreSQL", "system_settings"),
    metric("Cập nhật gần nhất", updated, "visible page"),
  ]);
  decorateTable(card.querySelector("table"));
}

function decorateLogs() {
  const card = root.querySelector(".sa-content > .sa-card");
  if (!card || card.dataset.moduleV2 === "logs") return;
  card.dataset.moduleV2 = "logs";
  card.classList.add("sa-module-card-v2", "sa-audit-card-v2");
  const rows = [...card.querySelectorAll("tbody tr")];
  const pagination = safeText(card.querySelector(".sa-pagination span"));
  const total = pagination.match(/([\d,]+)\s+logs/i)?.[1] || rows.length;
  const actors = new Set(rows.map((row) => safeText(row.children[1])).filter(Boolean));
  const actions = new Set(rows.map((row) => safeText(row.children[2])).filter(Boolean));
  const filterForm = card.querySelector("[data-audit-filter]");
  const activeFilters = filterForm ? [...filterForm.elements].filter((el) => el.name && String(el.value || "").trim()).length : 0;
  insertHero("logs", [
    metric("Audit rows", total, "server result"),
    metric("Actors trang này", actors.size),
    metric("Action types", actions.size, "visible page"),
    metric("Bộ lọc", activeFilters, activeFilters ? "đang áp dụng" : "chưa áp dụng"),
  ], "Audited");
  decorateTable(card.querySelector("table"));
  card.querySelectorAll("[data-export]").forEach((button) => button.classList.add("sa-export-btn-v2"));
}

function decorateSection() {
  const section = activeSection();
  if (section === "overview") return;
  if (section === "development") decorateDevelopment();
  else if (section === "users") decorateUsers();
  else if (section === "content") decorateContent();
  else if (section === "data") decorateData();
  else if (section === "stores") decorateStores();
  else if (section === "settings") decorateSettings();
  else if (section === "logs") decorateLogs();
}

function apply() {
  if (!root || applying) return;
  applying = true;
  try {
    decorateSection();
  } finally {
    applying = false;
  }
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    apply();
  });
}

if (root) {
  new MutationObserver(schedule).observe(root, { childList: true, subtree: true });
  window.addEventListener("hashchange", schedule);
  schedule();
}
