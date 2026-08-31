import {
  bootstrapCentralInventory,
  canDirectInventoryAdjust,
  canInventoryEdit,
  centralItemKey,
  centralLocationCode,
  cloudAdjustQuantity,
  cloudSetQuantity,
  getCloudInventoryHistory,
  syncInventoryNow,
} from "./inventory-cloud.js";

const AUTH_KEY = "shitu-kitchen-auth-v1";
const CENTRAL_KEY = "shitu-central-kitchen-stock-v1";
const HISTORY_KEY = "shitu-central-kitchen-history-v1";


const CENTRAL_ZONES = ["央廚冷凍", "央廚4門", "央廚臥櫃", "央廚冷藏"];

const DEFAULT_PRODUCTS = [
  ["麻辣湯(3000cc/包)", "Nước lẩu mala 3000cc", "包", "央廚冷凍"],
  ["香辣湯(3000cc/包)", "Nước lẩu cay thơm 3000cc", "包", "央廚冷凍"],
  ["昆布湯(3000cc/包)", "Nước dùng kombu 3000cc", "包", "央廚冷凍"],
  ["炸芋頭(1.2K/包)", "Khoai môn chiên 1.2kg", "包", "央廚冷凍"],
  ["炸魷魚(400g/包)", "Mực chiên 400g", "包", "央廚冷凍"],
  ["排骨酥", "Sườn non chiên giòn", "包", "央廚冷凍"],
  ["虎皮雞腳", "Chân gà da hổ", "包", "央廚冷凍"],
  ["鮮肉芋丸", "Viên khoai môn nhân thịt", "顆", "央廚冷凍"],
  ["腐皮(2斤)", "Tàu hũ ky 2 cân", "斤", "央廚冷凍"],
  ["鴨肉丸", "Viên thịt vịt", "包", "央廚冷凍"],
  ["三記魚餃", "Sủi cảo cá Sanji", "包", "央廚冷凍"],
  ["魚餃", "Sủi cảo cá", "盒", "央廚冷凍"],
  ["牛肉蛋餃", "Há cảo trứng nhân bò", "盒", "央廚冷凍"],
  ["白腹豆腐", "Đậu phụ trắng", "條", "央廚冷藏"],
  ["鴨血", "Huyết vịt", "手", "央廚冷藏"],
  ["滷豆腐", "Đậu phụ kho", "手", "央廚冷藏"],
  ["鴨翅", "Cánh vịt", "盒", "央廚冷藏"],
  ["鴨舌", "Lưỡi vịt", "盒", "央廚冷藏"],
  ["豆干", "Đậu khô", "盒", "央廚冷藏"],
  ["雞腳", "Chân gà", "包", "央廚冷藏"],
  ["牛尾油汁(2000g/包)", "Sốt dầu đuôi bò 2000g", "包", "央廚4門"],
  ["辣椒油(1L/包)", "Dầu ớt 1L", "包", "央廚4門"],
  ["泡蛋汁(3K/包)", "Sốt ngâm trứng 3kg", "包", "央廚4門"],
  ["牛肉(原油)(1kg/包)", "Thịt bò 1kg", "包", "央廚臥櫃"],
  ["大骨湯(5K/包)", "Nước xương 5kg", "包", "央廚臥櫃"],
  ["牛肉燴飯", "Cơm sốt thịt bò", "包", "央廚臥櫃"],
  ["燴飯醬包(小)180g", "Gói sốt cơm nhỏ 180g", "包", "央廚臥櫃"],
  ["重麻湯包", "Gói nước dùng mala đậm", "包", "央廚冷凍"],
  ["輕麻湯包", "Gói nước dùng mala nhẹ", "包", "央廚冷凍"],
  ["川麻湯包", "Gói nước dùng mala Tứ Xuyên", "包", "央廚冷凍"],
  ["牛尾肉袋(2K/包)", "Túi thịt đuôi bò 2kg", "包", "央廚冷凍"],
  ["地獄牛肉燴飯", "Cơm sốt bò địa ngục", "包", "央廚冷凍"],
  ["燴飯汁(180g)", "Sốt cơm 180g", "包", "央廚冷凍"],
  ["地獄牛肚", "Dạ dày bò địa ngục", "包", "央廚冷凍"],
  ["舒肥牛排", "Bít tết sous-vide", "包", "央廚冷凍"],
  ["秘蒜醬", "Sốt tỏi bí truyền", "包", "央廚4門"],
  ["微辣沾醬", "Sốt chấm cay nhẹ", "包", "央廚4門"],
  ["牛尾追飯", "Cơm đuôi bò", "包", "央廚冷凍"],
  ["滷膠豆干", "Đậu khô kho", "包", "央廚冷藏"],
  ["滷膠鴨翅", "Cánh vịt kho", "包", "央廚冷藏"],
  ["滷膠鴨舌", "Lưỡi vịt kho", "包", "央廚冷藏"],
  ["滷膠鴨腸", "Lòng vịt kho", "包", "央廚冷藏"],
].map((p, index) => ({ id: `central-${index + 1}`, zh: p[0], vi: p[1], unit: p[2], zone: p[3], qty: 0 }));

function session() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY) || "null"); } catch { return null; }
}
function announceCentralStock(items) {
  queueMicrotask(() => {
    window.dispatchEvent(new CustomEvent("shitu:central-stock-ready", { detail: { items } }));
  });
}
function loadStock() {
  try {
    const saved = JSON.parse(localStorage.getItem(CENTRAL_KEY) || "null");
    if (Array.isArray(saved) && saved.length) {
      announceCentralStock(saved);
      return saved;
    }
  } catch {}
  const seeded = structuredClone(DEFAULT_PRODUCTS);
  localStorage.setItem(CENTRAL_KEY, JSON.stringify(seeded));
  announceCentralStock(seeded);
  return seeded;
}
function saveStock(items) { localStorage.setItem(CENTRAL_KEY, JSON.stringify(items)); }
function history() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { return []; }
}
function pushHistory(entry) {
  const list = history();
  list.unshift({ id: crypto.randomUUID?.() || String(Date.now()), at: new Date().toISOString(), ...entry });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 1000)));
}
function esc(v) { return String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }

function loginScreen(error = "") {
  document.body.classList.add("auth-locked");
  let host = document.querySelector("#auth-layer");
  if (!host) { host = document.createElement("div"); host.id = "auth-layer"; document.body.append(host); }
  host.innerHTML = `<div class="auth-shell"><section class="auth-card"><div class="auth-brand"><span>食</span><div><strong>食徒 Kitchen OS</strong><small>內部管理系統</small></div></div><h1>登入</h1><p>請使用管理員、央廚或復興店帳號登入。</p>${error ? `<div class="auth-error">${esc(error)}</div>` : ""}<form id="auth-login-form"><label>帳號<input name="username" autocomplete="username" required /></label><label>密碼<input type="password" name="password" autocomplete="current-password" required /></label><button type="submit">登入系統</button></form><div class="demo-account-note">Supabase Auth · 帳號與權限雲端同步</div></section></div>`;

}

function addLogout(user) {
  const top = document.querySelector(".topbar-actions");
  if (!top || top.querySelector(".auth-user-chip")) return;
  const chip = document.createElement("div");
  chip.className = "auth-user-chip";
  chip.innerHTML = `<span><strong>${esc(user.name)}</strong><small>${user.location === "central" ? "央廚" : user.location === "fuxing" ? "復興店" : "Admin"}</small></span><button type="button">登出</button>`;
  top.prepend(chip);
}

function branchSwitcher(user, active = "fuxing") {
  if (user.role !== "admin") return "";
  return `<div class="warehouse-switch"><button data-warehouse="fuxing" class="${active === "fuxing" ? "active" : ""}">復興店</button><button data-warehouse="central" class="${active === "central" ? "active" : ""}">央廚</button></div>`;
}

function centralPage(user) {
  const content = document.querySelector(".page-content");
  if (!content) return;
  const items = loadStock();
  const canEdit = user.role === "admin" || Boolean(user.permissions?.inventory?.edit);
  let mode = content.dataset.centralMode || "overview";
  if ((mode === "in" || mode === "out") && !canEdit) {
    mode = "overview";
    content.dataset.centralMode = mode;
  }
  const selectedZone = content.dataset.centralZone || "all";
  const query = content.dataset.centralSearch || "";
  const filtered = items.filter(i => (selectedZone === "all" || i.zone === selectedZone) && `${i.zh} ${i.vi}`.toLowerCase().includes(query.toLowerCase()));
  const total = items.reduce((s, i) => s + Number(i.qty || 0), 0);
  const accountRole = user.accountRole || (user.role === "admin" ? "admin" : user.role);
  const canViewHistory = ["admin", "manager", "supervisor"].includes(accountRole);
  const log = canViewHistory && mode === "history" ? history() : [];

  content.innerHTML = `<div class="central-heading"><div><div class="central-eyebrow">工作區 · 央廚</div><h1>央廚庫存</h1><p>央廚冷凍、4門、臥櫃與冷藏的總覽及進出貨。</p></div>${branchSwitcher(user, "central")}</div>
    <section class="central-stats"><article><span>品項</span><strong>${items.length}</strong><small>已建立產品</small></article><article><span>總數量</span><strong>${total}</strong><small>依各品項單位加總</small></article><article><span>儲存區</span><strong>${CENTRAL_ZONES.length}</strong><small>央廚專用</small></article></section>
    <div class="central-tabs"><button data-central-mode="overview" class="${mode === "overview" ? "active" : ""}">庫存總覽</button>${canEdit ? `<button data-central-mode="in" class="${mode === "in" ? "active" : ""}">入庫</button><button data-central-mode="out" class="${mode === "out" ? "active" : ""}">出庫</button>` : ""}${canViewHistory ? `<button data-central-mode="history" class="${mode === "history" ? "active" : ""}">操作紀錄</button>` : ""}</div>
    ${mode === "history" && canViewHistory ? historyView(log) : stockView(filtered, mode, selectedZone, query, canDirectInventoryAdjust())}
  `;
  bindCentral(user);
  void bootstrapCentralInventory(items);
  if (mode === "history" && canViewHistory) {
    void getCloudInventoryHistory("central", 300).then((cloudLog) => {
      const current = document.querySelector(".page-content");
      if (!current || current.dataset.centralMode !== "history" || !cloudLog.length) return;
      const card = current.querySelector(".central-card");
      if (card) card.outerHTML = cloudHistoryView(cloudLog);
    });
  }
}

function stockView(items, mode, selectedZone, query, directAdjust = false) {
  const editing = mode === "in" || mode === "out";
  const direct = mode === "overview" && directAdjust;
  return `<section class="central-card"><div class="central-toolbar"><div class="central-zone-tabs"><button data-central-zone="all" class="${selectedZone === "all" ? "active" : ""}">全部</button>${CENTRAL_ZONES.map(z => `<button data-central-zone="${esc(z)}" class="${selectedZone === z ? "active" : ""}">${esc(z)}</button>`).join("")}</div><input data-central-search placeholder="搜尋品項..." value="${esc(query)}" /></div>
    <div class="central-table-head"><span>品項</span><span>位置</span><span>目前數量</span>${editing ? `<span>${mode === "in" ? "入庫數量" : "出庫數量"}</span><span>操作</span>` : direct ? "<span>盤點數量</span><span>調整</span>" : ""}</div>
    <div class="central-list">${items.map(i => `<article class="central-row"><div><strong>${esc(i.zh)}</strong><small>${esc(i.vi)}</small></div><span class="zone-pill">${esc(i.zone)}</span><div class="central-current"><strong>${Number(i.qty || 0)}</strong><small>${esc(i.unit)}</small></div>${editing ? `<input type="number" min="1" value="1" data-central-qty="${esc(i.id)}"/><button class="central-action ${mode === "out" ? "out" : ""}" data-central-adjust="${esc(i.id)}" data-direction="${mode}">${mode === "in" ? "+ 入庫" : "− 出庫"}</button>` : direct ? `<input type="number" min="0" value="${Number(i.qty || 0)}" data-central-set-qty="${esc(i.id)}"/><button class="central-action adjust" data-central-set="${esc(i.id)}">盤點調整</button>` : ""}</article>`).join("") || `<p class="central-empty">沒有符合條件的品項。</p>`}</div></section>`;
}

function historyView(log) {
  return `<section class="central-card"><div class="history-title"><div><h2>央廚進出貨紀錄</h2><p>僅主管／管理員可查看。</p></div><span>${log.length} 筆</span></div><div class="central-history">${log.map(x => `<article><div><strong>${esc(x.product)}</strong><small>${new Date(x.at).toLocaleString("zh-TW")} · ${esc(x.user)}</small></div><span>${esc(x.zone)}</span><strong class="${x.direction === "out" ? "history-out" : "history-in"}">${x.direction === "out" ? "−" : "+"}${x.amount} ${esc(x.unit)}</strong><small>${x.before} → ${x.after}</small></article>`).join("") || `<p class="central-empty">目前尚無操作紀錄。</p>`}</div></section>`;
}

function cloudHistoryView(log) {
  return `<section class="central-card"><div class="history-title"><div><h2>央廚進出庫紀錄</h2><p>主管以上可查看；資料來自 Supabase。</p></div><span>${log.length} 筆</span></div><div class="central-history">${log.map(x => {
    const direction = x.direction;
    const sign = direction === "out" ? "−" : direction === "in" ? "+" : "↔";
    const tone = direction === "out" ? "history-out" : direction === "in" ? "history-in" : "history-adjust";
    return `<article><div><strong>${esc(x.item?.name_zh_tw || "—")}</strong><small>${new Date(x.created_at).toLocaleString("zh-TW")} · ${esc(x.actor?.display_name || x.actor?.username || "—")} · ${esc(x.note || "")}</small></div><span>${esc(x.location?.name_zh_tw || "")}</span><strong class="${tone}">${sign}${x.amount} ${esc(x.item?.unit || "")}</strong><small>${x.before_quantity} → ${x.after_quantity}</small></article>`;
  }).join("") || `<p class="central-empty">目前尚無操作紀錄。</p>`}</div></section>`;
}

let searchTimer = null;
function bindCentral(user) {
  const content = document.querySelector(".page-content");
  if (!content) return;
  content.querySelectorAll("[data-central-mode]").forEach(b => b.onclick = () => { content.dataset.centralMode = b.dataset.centralMode; centralPage(user); });
  content.querySelectorAll("[data-central-zone]").forEach(b => b.onclick = () => { content.dataset.centralZone = b.dataset.centralZone; centralPage(user); });
  const search = content.querySelector("[data-central-search]");
  if (search) search.oninput = () => {
    const value = search.value;
    content.dataset.centralSearch = value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      centralPage(user);
      const next = document.querySelector(".page-content [data-central-search]");
      next?.focus();
      next?.setSelectionRange(value.length, value.length);
    }, 120);
  };
  content.querySelectorAll("[data-central-adjust]").forEach(b => b.onclick = async () => {
    if (!canInventoryEdit()) return;
    const items = loadStock();
    const item = items.find(i => i.id === b.dataset.centralAdjust);
    if (!item) return;
    const amount = Math.max(1, Number(content.querySelector(`[data-central-qty="${CSS.escape(item.id)}"]`)?.value || 1));
    const before = Number(item.qty || 0);
    const direction = b.dataset.direction;
    if (direction === "out" && amount > before) { alert("出庫數量不能大於目前庫存。"); return; }

    b.disabled = true;
    const result = await cloudAdjustQuantity({
      itemKey: centralItemKey(item.id),
      locationCode: centralLocationCode(item.zone),
      direction,
      amount,
      note: direction === "in" ? "央廚進貨入庫" : "央廚領料／出庫",
    });

    if (result.ok) {
      await syncInventoryNow("central", { reloadBranch: false });
      centralPage(user);
      return;
    }
    if (result.fallback) {
      item.qty = direction === "in" ? before + amount : before - amount;
      saveStock(items);
      pushHistory({ user: user.name, userId: user.id, direction, product: item.zh, productId: item.id, zone: item.zone, unit: item.unit, amount, before, after: item.qty });
      centralPage(user);
      return;
    }
    b.disabled = false;
    alert("雲端庫存更新失敗，請重新整理後再試。");
  });

  content.querySelectorAll("[data-central-set]").forEach(b => b.onclick = async () => {
    if (!canDirectInventoryAdjust()) return;
    const items = loadStock();
    const item = items.find(i => i.id === b.dataset.centralSet);
    if (!item) return;
    const input = content.querySelector(`[data-central-set-qty="${CSS.escape(item.id)}"]`);
    const next = Math.max(0, Number(input?.value) || 0);
    const before = Number(item.qty || 0);
    if (next === before) return;

    b.disabled = true;
    const result = await cloudSetQuantity({
      itemKey: centralItemKey(item.id),
      locationCode: centralLocationCode(item.zone),
      quantity: next,
      note: "央廚盤點調整 / Điều chỉnh kiểm kê bếp trung tâm",
    });

    if (result.ok) {
      await syncInventoryNow("central", { reloadBranch: false });
      centralPage(user);
      return;
    }
    if (result.fallback) {
      item.qty = next;
      saveStock(items);
      pushHistory({ user: user.name, userId: user.id, direction: "adjust", product: item.zh, productId: item.id, zone: item.zone, unit: item.unit, amount: Math.abs(next - before), before, after: next });
      centralPage(user);
      return;
    }
    b.disabled = false;
    alert("盤點調整失敗，請重新整理後再試。");
  });
  content.querySelectorAll("[data-warehouse]").forEach(b => b.onclick = () => {
    if (b.dataset.warehouse === "fuxing") { content.dataset.centralView = "off"; location.hash = "#inventory"; setTimeout(() => location.reload(), 20); }
  });
}

let patching = false;
function applyAccess() {
  if (patching) return;
  const user = session();
  if (!user) return loginScreen();
  patching = true;
  try {
    document.body.classList.remove("auth-locked");
    document.querySelector("#auth-layer")?.remove();
    addLogout(user);

    const permissions = user.permissions || {};
    if (Object.keys(permissions).length) {
      document.querySelectorAll(".desktop-nav .nav-item, .mobile-nav .nav-item").forEach(a => {
        const moduleKey = (a.getAttribute("href") || "").replace(/^#/, "").split("?")[0];
        if (permissions[moduleKey]) a.style.display = permissions[moduleKey].view ? "" : "none";
      });
    }

    const currentModule = (location.hash || "#dashboard").replace(/^#/, "").split("?")[0];
    if (permissions[currentModule]?.view === false) {
      const firstAllowed = Object.keys(permissions).find((key) => permissions[key]?.view);
      if (firstAllowed) {
        location.hash = `#${firstAllowed}`;
        return;
      }
      const page = document.querySelector(".page-content");
      if (page) {
        page.innerHTML = '<section class="card access-empty-state"><h1>Chưa được cấp quyền · 尚未開放權限</h1><p>Hãy liên hệ quản trị viên để được cấp chức năng cần sử dụng. · 請聯絡系統管理員開放所需功能。</p></section>';
      }
      return;
    }

    const centralOnlyRole = user.accountRole === "central" || user.role === "central";
    const centralWorkplace = user.location === "central";

    // 央廚 is a site context, not only a job title:
    // any account assigned to 央廚 opens the dedicated 央廚庫存 page at #inventory.
    if (centralOnlyRole) {
      document.querySelector(".sidebar-summary")?.setAttribute("hidden", "");
      if (!location.hash.startsWith("#inventory")) location.hash = "#inventory";
    }

    if (centralWorkplace && location.hash.startsWith("#inventory")) {
      centralPage(user);
    } else if (user.role === "admin" && location.hash.startsWith("#inventory")) {
      const heading = document.querySelector(".page-heading");
      if (heading && !heading.querySelector(".warehouse-switch")) {
        heading.insertAdjacentHTML("beforeend", branchSwitcher(user));
        heading.querySelector('[data-warehouse="central"]')?.addEventListener("click", () => centralPage(user));
      }
    }
  } finally {
    patching = false;
  }
}

let accessFrame = 0;
function scheduleAccess() {
  if (accessFrame) return;
  accessFrame = requestAnimationFrame(() => {
    accessFrame = 0;
    applyAccess();
  });
}

const observer = new MutationObserver(scheduleAccess);
const appRoot = document.querySelector("#app");
if (appRoot) observer.observe(appRoot, { childList: true });
window.addEventListener("hashchange", scheduleAccess);
window.addEventListener("shitu:inventory-cloud-updated", (event) => {
  if (event.detail?.site !== "central" || !location.hash.startsWith("#inventory")) return;
  const user = session();
  if (user?.location === "central" || user?.role === "admin") centralPage(user);
});
scheduleAccess();