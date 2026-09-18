import { apiRequest, vpsMe } from "./vps-api.js";

const root = document.querySelector("#admin-app");
let mounting = false;
let mountedHost = null;
let sourceInventory = null;
let destinationInventory = null;
let sites = [];
let catalogAudit = null;

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
  </form>
  <section class="sa-card sa-inventory-audit" data-inventory-catalog-audit>
    <div class="sa-card-head"><div><h3>Inventory Catalog Audit · 跨店品項稽核</h3><p>Đọc trực tiếp PostgreSQL; không tự thay đổi tồn kho hay catalog.</p></div><button class="sa-btn" type="button" data-catalog-audit-refresh>↻ Audit</button></div>
    <div data-catalog-audit-body><div class="sa-empty">Đang tải audit…</div></div>
  </section>`;
}

async function loadInventory(site) {
  if (!site) return null;
  return apiRequest(`/api/inventory/${encodeURIComponent(site)}`);
}
async function loadCatalogAudit() {
  return apiRequest("/api/admin/super/inventory-catalog-audit");
}

function auditIssueList(rows = [], kind = "") {
  if (!rows.length) return `<div class="sa-empty">Không có vấn đề trong nhóm này. · 此類別無異常。</div>`;
  const rendered = rows.slice(0,8).map((row) => {
    const title = row.nameVi || row.nameZhTw || row.catalogKey || row.itemKey || "—";
    let detail = "";
    if (kind === "receive") {
      detail = `${siteLabel(row.site)} · ${row.catalogKey} · ${(row.storageLocations || []).map((location)=>location.name_zh_tw || location.code).join(" / ")}`;
    } else if (kind === "identity") {
      const v = row.variants || {};
      const viOptions = (v.name_vi || []).length > 1
        ? `<label><span>VI canonical</span><select data-identity-vi>${v.name_vi.map((value)=>`<option value="${esc(value)}">${esc(value)}</option>`).join("")}</select></label>`
        : "";
      const zhOptions = (v.name_zh_tw || []).length > 1
        ? `<label><span>中文 canonical</span><select data-identity-zh>${v.name_zh_tw.map((value)=>`<option value="${esc(value)}">${esc(value)}</option>`).join("")}</select></label>`
        : "";
      return `<div class="sa-list-row sa-identity-row" data-identity-row="${esc(row.catalogKey)}">
        <div><strong>${esc(row.catalogKey)}</strong><small>VI: ${esc((v.name_vi || []).join(" / ") || "—")} · 中文: ${esc((v.name_zh_tw || []).join(" / ") || "—")}</small></div>
        <div class="sa-row-actions sa-identity-actions">${viOptions}${zhOptions}<button class="sa-btn small primary" type="button" data-identity-resolve>Resolve · 統一</button></div>
      </div>`;
    } else if (kind === "operational") {
      const v = row.variants || {};
      detail = `${row.catalogKey} · unit: ${(v.unit || []).join(" / ") || "—"} · work: ${(v.work_area || []).join(" / ") || "—"} · storage_only: ${(v.storage_only || []).join(" / ") || "—"}`;
    } else if (kind === "duplicate") {
      detail = `${siteLabel(row.site)} · ${row.catalogKey} · ${(row.items || []).map((item)=>item.itemKey).join(" / ")}`;
    } else if (kind === "storage") {
      detail = `${siteLabel(row.site)} · ${row.catalogKey} · ${row.workArea || "—"}`;
    } else {
      detail = `${row.catalogKey} · missing: ${(row.missingSites || []).map(siteLabel).join(", ") || "—"}`;
    }
    return `<div class="sa-list-row"><div><strong>${esc(title)}</strong><small>${esc(detail)}</small></div></div>`;
  }).join("");
  const remainder = rows.length > 8 ? `<div class="sa-empty">＋ ${rows.length - 8} mục khác · 另有 ${rows.length - 8} 筆</div>` : "";
  return `<div class="sa-list">${rendered}${remainder}</div>`;
}

function renderCatalogAudit(host) {
  const body = host.querySelector("[data-catalog-audit-body]");
  if (!body) return;
  if (!catalogAudit) {
    body.innerHTML = `<div class="sa-empty">Chưa có dữ liệu audit.</div>`;
    return;
  }
  const s = catalogAudit.summary || {};
  body.innerHTML = `
    <section class="sa-stat-grid compact">
      <article class="sa-stat"><small>Active items</small><strong>${esc(s.activeItems ?? 0)}</strong></article>
      <article class="sa-stat"><small>Catalog keys</small><strong>${esc(s.catalogKeys ?? 0)}</strong></article>
      <article class="sa-stat"><small>Identity drift · 名稱差異</small><strong>${esc(s.identityVariants ?? 0)}</strong></article>
      <article class="sa-stat"><small>Operational variants</small><strong>${esc(s.operationalVariants ?? 0)}</strong></article>
      <article class="sa-stat"><small>Multi-location thiếu fixed receive</small><strong>${esc(s.multiLocationMissingReceiveDefault ?? 0)}</strong></article>
      <article class="sa-stat"><small>Duplicate/site</small><strong>${esc(s.duplicatesWithinSite ?? 0)}</strong></article>
      <article class="sa-stat"><small>Không có storage</small><strong>${esc(s.unconfiguredStorage ?? 0)}</strong></article>
    </section>
    <section class="sa-two-col">
      <article class="sa-card"><div class="sa-card-head"><div><h3>固定收貨儲位 còn thiếu</h3><p>Chỉ item branch có từ 2 storage trở lên.</p></div></div>${auditIssueList(catalogAudit.multiLocationMissingReceiveDefault,"receive")}</article>
      <article class="sa-card"><div class="sa-card-head"><div><h3>Identity drift · 名稱差異</h3><p>Cùng catalog_key nhưng tên VI/中文 khác nhau; đây là nhóm ưu tiên đồng bộ identity.</p></div></div>${auditIssueList(catalogAudit.identityVariants,"identity")}</article>
      <article class="sa-card"><div class="sa-card-head"><div><h3>Operational variants</h3><p>Unit / work area / storage_only khác nhau; có thể hợp lệ theo từng site nên không tự sửa.</p></div></div>${auditIssueList(catalogAudit.operationalVariants,"operational")}</article>
      <article class="sa-card"><div class="sa-card-head"><div><h3>Duplicate trong cùng site</h3><p>Cùng site có nhiều active item chung catalog_key.</p></div></div>${auditIssueList(catalogAudit.duplicatesWithinSite,"duplicate")}</article>
      <article class="sa-card"><div class="sa-card-head"><div><h3>Item chưa có storage</h3><p>Catalog tồn tại nhưng chưa cấu hình storage hợp lệ.</p></div></div>${auditIssueList(catalogAudit.unconfiguredStorage,"storage")}</article>
    </section>
    <article class="sa-card"><div class="sa-card-head"><div><h3>Coverage giữa các site</h3><p>Thông tin tham khảo; thiếu site không tự động được coi là lỗi.</p></div><span class="sa-pill">${esc(s.partialCoverage ?? 0)}</span></div>${auditIssueList(catalogAudit.coverage,"coverage")}</article>`;
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
  host.querySelector("[data-catalog-audit-refresh]")?.addEventListener("click",async()=>{
    const body=host.querySelector("[data-catalog-audit-body]");
    if(body) body.innerHTML=`<div class="sa-empty">Đang tải audit…</div>`;
    try { catalogAudit=await loadCatalogAudit(); renderCatalogAudit(host); }
    catch(cause){ if(body) body.innerHTML=`<div class="sa-alert error">${esc(cause?.payload?.error || cause?.code || cause?.message || "INVENTORY_CATALOG_AUDIT_FAILED")}</div>`; }
  });
  host.querySelector("[data-inventory-catalog-audit]")?.addEventListener("click",async(event)=>{
    const button=event.target.closest("[data-identity-resolve]");
    if(!button) return;
    const row=button.closest("[data-identity-row]");
    const catalogKey=row?.dataset?.identityRow || "";
    if(!catalogKey) return;
    const vi=row.querySelector("[data-identity-vi]");
    const zh=row.querySelector("[data-identity-zh]");
    const body={ catalogKey };
    if(vi) body.nameVi=vi.value;
    if(zh) body.nameZhTw=zh.value;
    button.disabled=true;
    const original=button.textContent;
    button.textContent="Đang đồng bộ…";
    try {
      await apiRequest("/api/admin/super/inventory-catalog-identity",{ method:"POST",body });
      catalogAudit=await loadCatalogAudit();
      renderCatalogAudit(host);
    } catch(cause) {
      button.disabled=false;
      button.textContent=original;
      const auditBody=host.querySelector("[data-catalog-audit-body]");
      if(auditBody) {
        const notice=document.createElement("div");
        notice.className="sa-alert error";
        notice.textContent=cause?.payload?.error || cause?.code || cause?.message || "INVENTORY_IDENTITY_RESOLVE_FAILED";
        auditBody.prepend(notice);
      }
    }
  });
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
    try { catalogAudit=await loadCatalogAudit(); renderCatalogAudit(host); }
    catch (auditError) {
      const body=host.querySelector("[data-catalog-audit-body]");
      if(body) body.innerHTML=`<div class="sa-alert error">${esc(auditError?.payload?.error || auditError?.code || auditError?.message || "INVENTORY_CATALOG_AUDIT_FAILED")}</div>`;
    }
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
