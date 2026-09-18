const root = document.querySelector("#admin-app");

const NAV_GROUPS = [
  { label: "System", items: [["overview", "⌂"], ["development", "⌘"], ["users", "♙"], ["logs", "≡"]] },
  { label: "Business", items: [["stores", "▦"], ["content", "◇"], ["data", "▤"]] },
  { label: "Configuration", items: [["settings", "⚙"]] },
];

let scheduled = false;
let applying = false;

function textFromKv(label) {
  for (const item of root.querySelectorAll(".sa-kv-grid > div")) {
    const key = item.querySelector("small")?.textContent?.trim();
    if (key === label) return item.querySelector("strong")?.textContent?.trim() || "—";
  }
  return "—";
}

function statValue(labelStart) {
  for (const item of root.querySelectorAll(".sa-stat-grid .sa-stat")) {
    const key = item.querySelector("small")?.textContent?.trim() || "";
    if (key.startsWith(labelStart)) return item.querySelector("strong")?.textContent?.trim() || "0";
  }
  return "0";
}

function decorateSidebar() {
  const sidebar = root.querySelector(".sa-sidebar");
  if (!sidebar || sidebar.dataset.uiV2 === "1") return;
  sidebar.dataset.uiV2 = "1";

  const brand = document.createElement("div");
  brand.className = "sa-brand";
  brand.innerHTML = `<div class="sa-brand-mark">KO</div><div><strong>Kitchen OS</strong><small>System Console</small></div>`;
  sidebar.prepend(brand);

  const owner = sidebar.querySelector(".sa-owner");
  if (owner) {
    owner.classList.add("sa-owner-v2");
    const badge = owner.querySelector(".sa-owner-badge");
    if (badge) badge.textContent = "● ROOT";
  }

  const originalNav = sidebar.querySelector(":scope > nav");
  if (!originalNav) return;
  const buttons = new Map([...originalNav.querySelectorAll("[data-section]")].map((button) => [button.dataset.section, button]));
  const fragment = document.createDocumentFragment();

  for (const group of NAV_GROUPS) {
    const wrap = document.createElement("div");
    wrap.className = "sa-nav-block";
    const label = document.createElement("div");
    label.className = "sa-nav-group-label";
    label.textContent = group.label;
    const nav = document.createElement("nav");
    nav.className = "sa-nav-group";
    for (const [section, icon] of group.items) {
      const button = buttons.get(section);
      if (!button) continue;
      const iconEl = document.createElement("span");
      iconEl.className = "sa-nav-icon";
      iconEl.textContent = icon;
      button.prepend(iconEl);
      nav.appendChild(button);
    }
    wrap.append(label, nav);
    fragment.appendChild(wrap);
  }
  originalNav.replaceWith(fragment);
}

function decorateTopbar() {
  const topbar = root.querySelector(".sa-topbar");
  if (!topbar || topbar.dataset.uiV2 === "1") return;
  topbar.dataset.uiV2 = "1";
  const actions = topbar.querySelector(".sa-top-actions");
  if (!actions) return;
  const owner = root.querySelector(".sa-owner strong")?.textContent?.trim() || "SA";
  const initials = owner.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "SA";
  const avatar = document.createElement("div");
  avatar.className = "sa-avatar";
  avatar.textContent = initials;
  actions.appendChild(avatar);
}

function quickAction(label, note, icon, section) {
  return `<button type="button" class="sa-quick-action" data-ui-section="${section}"><span class="sa-quick-icon">${icon}</span><strong>${label}</strong><small>${note}</small></button>`;
}

function decorateOverview() {
  const content = root.querySelector(".sa-content");
  const stats = content?.querySelector(".sa-stat-grid:not(.compact)");
  if (!content || !stats || content.querySelector("[data-ui-v2-overview]")) return;

  const release = textFromKv("Release");
  const schema = textFromKv("Schema");
  const uptime = textFromKv("Uptime");
  const backupTime = textFromKv("Completed");
  const nodeVersion = textFromKv("Node");
  const dbVersion = textFromKv("PostgreSQL");
  const dbName = textFromKv("Database");
  const connections = textFromKv("Connections");
  const healthy = [...content.querySelectorAll(".sa-pill.ok")].length >= 2;

  const hero = document.createElement("section");
  hero.className = "sa-dashboard-hero";
  hero.dataset.uiV2Overview = "1";
  hero.innerHTML = `
    <article class="sa-hero-card">
      <div class="sa-eyebrow">Kitchen OS Control Center</div>
      <h2>${healthy ? "Toàn bộ hệ thống đang hoạt động bình thường" : "Cần kiểm tra trạng thái hệ thống"}</h2>
      <p>Dữ liệu dưới đây lấy trực tiếp từ API Super Admin và PostgreSQL hiện tại.</p>
      <div class="sa-hero-meta">
        <div><small>Release</small><strong>${release}</strong></div>
        <div><small>Schema</small><strong>${schema}</strong></div>
        <div><small>Uptime</small><strong>${uptime}</strong></div>
        <div><small>Last backup</small><strong>${backupTime}</strong></div>
      </div>
    </article>
    <article class="sa-health-card">
      <div class="sa-health-head"><div><div class="sa-eyebrow dark">System Health</div><h3>Trạng thái dịch vụ</h3></div><span class="sa-health-state ${healthy ? "ok" : "warn"}">${healthy ? "Healthy" : "Check"}</span></div>
      <div class="sa-health-list">
        <div><span><strong>API / VPS</strong><small>${nodeVersion}</small></span><b class="sa-dot ok"></b></div>
        <div><span><strong>PostgreSQL</strong><small>${dbName} · ${dbVersion}</small></span><b class="sa-dot ok"></b></div>
        <div><span><strong>Connections</strong><small>Kết nối database hiện tại</small></span><em>${connections}</em></div>
      </div>
    </article>`;
  stats.before(hero);

  const quick = document.createElement("section");
  quick.className = "sa-dashboard-grid";
  quick.dataset.uiV2Quick = "1";
  quick.innerHTML = `
    <article class="sa-card sa-quick-card">
      <div class="sa-card-head"><div><h2>Thao tác nhanh · 快速操作</h2><p>Đi thẳng tới các module quản trị đang dùng API/database thật.</p></div></div>
      <div class="sa-quick-grid">
        ${quickAction("Users & RBAC", "Tài khoản, role, quyền", "♙", "users")}
        ${quickAction("Chi nhánh", "Site và multi-store", "▦", "stores")}
        ${quickAction("Nội dung", "SOP, media, thông báo", "◇", "content")}
        ${quickAction("Audit logs", "Theo dõi thay đổi hệ thống", "≡", "logs")}
      </div>
    </article>
    <article class="sa-card sa-live-card">
      <div class="sa-card-head"><div><h2>Live summary · 即時摘要</h2><p>Tổng hợp từ payload Overview hiện tại.</p></div></div>
      <div class="sa-live-list">
        <div><span>Users active / total</span><strong>${statValue("Users")}</strong></div>
        <div><span>Chi nhánh active / total</span><strong>${statValue("Chi nhánh")}</strong></div>
        <div><span>SOP chờ duyệt</span><strong>${statValue("SOP")}</strong></div>
        <div><span>Audit logs</span><strong>${statValue("Audit")}</strong></div>
      </div>
    </article>`;
  stats.after(quick);

  quick.querySelectorAll("[data-ui-section]").forEach((button) => {
    button.addEventListener("click", () => root.querySelector(`[data-section="${button.dataset.uiSection}"]`)?.click());
  });
}

function apply() {
  if (!root || applying) return;
  applying = true;
  try {
    decorateSidebar();
    decorateTopbar();
    decorateOverview();
    root.classList.add("sa-ui-v2-ready");
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
  schedule();
}
