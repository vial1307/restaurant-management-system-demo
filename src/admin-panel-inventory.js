import { apiRequest, vpsMe } from "./vps-api.js";

const root = document.querySelector("#admin-app");
let mounting = false;
let mountedHost = null;
let sourceInventory = null;
let destinationInventory = null;
let sites = [];

function esc(value) {
  return String(value ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function itemMap(inventory) {
  return new Map((inventory?.items || []).map((item) => [item.id,item]));
}

function locationMap(inventory) {
  return new Map((inventory?.locations || []).map((location) => [location.id,location]));
}

function sourceChoices(inventory) {
  const items = itemMap(inventory);
  const locations = locationMap(inventory);
  return (inventory?.stock || [])
    .map((stock) => ({ stock,item:items.get(stock.item_id),location:locations.get(stock.location_id) }))
    .filter((entry) => entry.item && entry.location?.kind === "storage" && number(entry.stock.quantity) > 0)
    .sort((a,b) => String(a.item.name_zh_tw || a.item.name_vi).localeCompare(String(b.item.name_zh_tw || b.item.name_vi)) || Number(a.location.sort_order || 0)-Number(b.location.sort_order || 0));
}

function storageLocations(inventory) {
  return (inventory?.locations || []).filter((location) => location.kind === "storage" && location.active !== false);
}

function destinationRouting(sourceItem, destination) {
  if (!sourceItem || !destination) return { choices:[],locked:true,message:"Chọn sản phẩm nguồn trước. · 請先選來源品項。" };
  const destinationItem = (destination.items || []).find((item) => item.catalog_key === sourceItem.catalog_key && item.active !== false);
  const locations = storageLocations(destination);
  if (!destinationItem) {
    return {
      choices:locations,
      locked:false,
      message:"Chi nhánh đích chưa có sản phẩm: Super Admin chọn vị trí nhận cho lần tạo đầu tiên. · 目的店尚無此品項，請選首次收貨位置。",
    };
  }
  const configuredIds = new Set((destination.stock || []).filter((row) => row.item_id === destinationItem.id).map((row) => row.location_id));
  const configured = locations.filter((location) => configuredIds.has(location.id));
  if (configured.length === 1) {
    return { choices:configured,locked:true,message:"Tự động dùng vị trí duy nhất đã cấu hình. · 自動使用唯一已設定儲位。" };
  }
  if (configured.length > 1) {
    const fixed = (destination.receiveDefaults || []).find((row) => row.catalog_key === sourceItem.catalog_key);
    const fixedLocation = configured.find((location) => location.id === fixed?.location_id);
    if (fixedLocation) {
      return { choices:[fixedLocation],locked:true,message:"Dùng vị trí nhận cố định do chi nhánh đích sở hữu. · 使用目的店設定的固定收貨儲位。" };
    }
    return { choices:[],locked:true,message:"Chi nhánh đích có nhiều vị trí nhưng chưa đặt vị trí nhận cố định. Hãy cấu hình sản phẩm trước. · 目的店有多個儲位但尚未設定固定收貨位置。" };
  }
  return { choices:[],locked:true,message:"Sản phẩm đích chưa có storage được cấu hình. · 目的品項尚未設定儲位。" };
}

function sumStock(inventory) {
  return (inventory?.stock || []).reduce((total,row) => total + number(row.quantity),0);
}

function siteLabel(code) {
  const site = sites.find((entry) => entry.code === code);
  return site ? `${site.name_vi} · ${site.name_zh_tw}` : code;
}

function panelHtml() {
  const activeSites = sites.filter((site) => site.active !== false);
  return `<div class="sa-card-head"><div><h2>Kho tổng & điều chuyển · 總庫存與跨店調撥</h2><p>Super Admin thao tác ngay tại đây; mutation vẫn đi qua transaction API chuẩn để giữ atomic, receiving policy và audit.</p></div><button class="sa-btn" type="button" data-super-inventory-refresh>↻ Refresh</button></div>
  <section class="sa-stat-grid compact" data-super-inventory-stats>
    <article class="sa-stat"><small>Site nguồn</small><strong data-source-total>—</strong><span>Tổng quantity</span></article>
    <article class="sa-stat"><small>Site đích</small><strong data-destination-total>—</strong><span>Tổng quantity</span></article>
    <article class="sa-stat"><small>Source products</small><strong data-source-products>—</strong></article>
    <article class="sa-stat"><small>Destination products</small><strong data-destination-products>—</strong></article>
    <article class="sa-stat"><small>Mode</small><strong>Atomic</strong><span>1 transaction</span></article>
  </section>
  <form class="sa-form-grid" data-super-transfer-form>
    <label><span>Kho / chi nhánh nguồn · 來源據點</span><select name="sourceSite" required>${activeSites.map((site,index)=>`<option value="${esc(site.code)}" ${index===0?"selected":""}>${esc(siteLabel(site.code))}</option>`).join("")}</select></label>
    <label><span>Kho / chi nhánh đích · 目的據點</span><select name="destinationSite" required>${activeSites.map((site,index)=>`<option value="${esc(site.code)}" ${index===1?"selected":""}>${esc(siteLabel(site.code))}</option>`).join("")}</select></label>
    <label class="wide"><span>Sản phẩm + vị trí nguồn · 來源品項與儲位</span><select name="sourceStock" required><option value="">Đang tải…</option></select></label>
    <label><span>Vị trí nhận · 收貨儲位</span><select name="destinationLocation" required><option value="">Chọn sản phẩm nguồn trước</option></select></label>
    <label><span>Số lượng · 數量</span><input name="quantity" type="number" min="0.001" step="0.001" required value="1"></label>
    <label class="wide"><span>Ghi chú · 備註</span><input name="note" maxlength="300" placeholder="Super Admin transfer"></label>
    <div class="wide"><p class="sa-alert" data-routing-message style="margin:0 0 10px"></p><p class="sa-form-error" data-transfer-error></p><button class="sa-btn primary" type="submit">Điều chuyển nguyên liệu · 調撥庫存</button></div>
  </form>`;
}

async function loadInventory(site) {
  if (!site) return null;
  return apiRequest(`/api/inventory/${encodeURIComponent(site)}`);
}

function renderSourceOptions(host) {
  const select = host.querySelector('select[name="sourceStock"]');
  if (!select) return;
  const choices = sourceChoices(sourceInventory);
  select.innerHTML = `<option value="">Chọn sản phẩm / vị trí nguồn</option>${choices.map((entry) => {
    const value = `${entry.item.id}|${entry.location.id}`;
    const label = `${entry.item.name_vi || entry.item.name_zh_tw} · ${entry.item.name_zh_tw || ""} — ${entry.location.name_vi || entry.location.name_zh_tw} (${number(entry.stock.quantity)} ${entry.item.unit || ""})`;
    return `<option value="${esc(value)}">${esc(label)}</option>`;
  }).join("")}`;
}

function renderRouting(host) {
  const form = host.querySelector("[data-super-transfer-form]");
  if (!form) return;
  const [itemId] = String(form.sourceStock.value || "").split("|");
  const item = (sourceInventory?.items || []).find((row) => row.id === itemId);
  const routing = destinationRouting(item,destinationInventory);
  form.destinationLocation.innerHTML = routing.choices.length
    ? routing.choices.map((location) => `<option value="${esc(location.id)}">${esc(location.name_vi || location.name_zh_tw)} · ${esc(location.name_zh_tw || "")}</option>`).join("")
    : `<option value="">Không có vị trí hợp lệ</option>`;
  form.destinationLocation.disabled = routing.choices.length === 0 || routing.locked;
  if (routing.choices.length === 1) form.destinationLocation.value = routing.choices[0].id;
  host.querySelector("[data-routing-message]").textContent = routing.message;
}

function renderStats(host) {
  const set = (selector,value) => { const node=host.querySelector(selector); if(node)node.textContent=String(value); };
  set("[data-source-total]",sourceInventory ? sumStock(sourceInventory).toFixed(2).replace(/\.00$/,'') : "—");
  set("[data-destination-total]",destinationInventory ? sumStock(destinationInventory).toFixed(2).replace(/\.00$/,'') : "—");
  set("[data-source-products]",sourceInventory?.items?.length ?? "—");
  set("[data-destination-products]",destinationInventory?.items?.length ?? "—");
}

async function refreshInventories(host) {
  const form = host.querySelector("[data-super-transfer-form]");
  if (!form) return;
  const sourceSite = form.sourceSite.value;
  const destinationSite = form.destinationSite.value;
  const error = host.querySelector("[data-transfer-error]");
  error.textContent = "";
  if (!sourceSite || !destinationSite || sourceSite === destinationSite) {
    sourceInventory = null;
    destinationInventory = null;
    renderSourceOptions(host);
    renderStats(host);
    error.textContent = "Site nguồn và site đích phải khác nhau. · 來源與目的據點必須不同。";
    return;
  }
  try {
    [sourceInventory,destinationInventory] = await Promise.all([loadInventory(sourceSite),loadInventory(destinationSite)]);
    renderSourceOptions(host);
    renderStats(host);
    renderRouting(host);
  } catch (cause) {
    error.textContent = cause?.payload?.error || cause?.code || cause?.message || "INVENTORY_LOAD_FAILED";
  }
}

function bindPanel(host) {
  const form = host.querySelector("[data-super-transfer-form]");
  form.sourceSite.addEventListener("change",()=>void refreshInventories(host));
  form.destinationSite.addEventListener("change",()=>void refreshInventories(host));
  form.sourceStock.addEventListener("change",()=>renderRouting(host));
  host.querySelector("[data-super-inventory-refresh]").addEventListener("click",()=>void refreshInventories(host));
  form.addEventListener("submit",async(event)=>{
    event.preventDefault();
    const error = host.querySelector("[data-transfer-error]");
    error.textContent = "";
    const [itemId,sourceLocationId] = String(form.sourceStock.value || "").split("|");
    const destinationLocationId = form.destinationLocation.value;
    const quantity = Number(form.quantity.value);
    if (!itemId || !sourceLocationId || !destinationLocationId || !Number.isFinite(quantity) || quantity <= 0) {
      error.textContent = "Dữ liệu điều chuyển chưa đầy đủ. · 調撥資料不完整。";
      return;
    }
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      const result = await apiRequest("/api/inventory/direct-transfer", {
        method:"POST",
        body:{ itemId,sourceLocationId,destinationLocationId,quantity,note:String(form.note.value || "Super Admin transfer") },
      });
      await refreshInventories(host);
      form.quantity.value = "1";
      form.note.value = "";
      error.textContent = `OK · ${result.from_site} → ${result.to_site} · ${result.quantity}`;
    } catch (cause) {
      error.textContent = cause?.payload?.error || cause?.code || cause?.message || "DIRECT_TRANSFER_FAILED";
    } finally {
      submit.disabled = false;
    }
  });
  void refreshInventories(host);
}

async function mount() {
  if (!root || mounting) return;
  const legacyLink = root.querySelector('a[href="./#inventory"]');
  const host = legacyLink?.closest("article.sa-card");
  if (!host || host === mountedHost) return;
  mounting = true;
  try {
    const me = await vpsMe();
    if (!me?.user?.capabilities?.["system.super_admin"]) return;
    const siteResult = await apiRequest("/api/admin/super/sites");
    sites = (siteResult?.sites || []).filter((site) => site.active !== false);
    if (sites.length < 2) {
      host.innerHTML = `<div class="sa-card-head"><div><h2>Kho tổng & điều chuyển</h2><p>Cần ít nhất 2 site đang hoạt động để điều chuyển liên chi nhánh.</p></div></div>`;
      mountedHost = host;
      return;
    }
    host.innerHTML = panelHtml();
    mountedHost = host;
    bindPanel(host);
  } catch (error) {
    host.innerHTML = `<div class="sa-card-head"><div><h2>Kho tổng & điều chuyển</h2><p>${esc(error?.payload?.error || error?.code || error?.message || "LOAD_FAILED")}</p></div></div>`;
    mountedHost = host;
  } finally {
    mounting = false;
  }
}

if (root) {
  const observer = new MutationObserver(() => { void mount(); });
  observer.observe(root,{childList:true,subtree:true});
  void mount();
}
