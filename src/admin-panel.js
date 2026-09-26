import { apiRequest, vpsListUsers, vpsMe } from "./vps-api.js";
import { createInventoryDatabase } from "./admin-inventory-database.js";
const inventoryDatabase = createInventoryDatabase();

const root = document.querySelector("#admin-app");
const SECTIONS = ["overview","development","users","content","data","stores","settings","logs"];
const DATASET_META = {
  announcements:{ label:"Thông báo · 公告", archive:"Lưu trữ · 封存", fields:[
    ["site_code","Chi nhánh · 據點","site"],["title_vi","Tiêu đề VI","text"],["title_zh_tw","中文標題","text"],
    ["body_vi","Nội dung VI","textarea"],["body_zh_tw","中文內容","textarea"],["status","Trạng thái · 狀態","announcement-status"],
    ["starts_at","Bắt đầu · 開始","datetime"],["ends_at","Kết thúc · 結束","datetime"],
  ]},
  media:{ label:"Hình ảnh / Media · 媒體", archive:"Ngừng dùng · 停用", fields:[
    ["site_code","Chi nhánh · 據點","site"],["asset_type","Loại · 類型","asset-type"],["label","Tên hiển thị · 名稱","text"],
    ["asset_url","URL","url"],["alt_vi","Alt VI","text"],["alt_zh_tw","中文 Alt","text"],
    ["entity_type","Loại liên kết · 關聯類型","text"],["entity_id","ID liên kết · 關聯 ID","text"],["active","Hoạt động · 啟用","boolean"],
    ["metadata","Metadata JSON","json"],
  ]},
  "menu-items":{ label:"Sản phẩm / Menu · 菜單品項", archive:"Ngừng dùng · 停用", fields:[
    ["site_code","Chi nhánh · 據點","site"],["item_code","Mã món · 品項代碼","text"],["name_vi","Tên VI","text"],["name_zh_tw","中文名稱","text"],
    ["category","Danh mục · 分類","text"],["work_area","Khu làm việc · 工作區","text"],["price","Giá · 售價","number"],["currency_code","Tiền tệ · 幣別","text"],
    ["active","Hoạt động · 啟用","boolean"],["metadata","Metadata JSON","json"],
  ]},
  "inventory-products":{ label:"Nguyên liệu kho · 庫存品項", archive:"Ngừng dùng · 停用", fields:[
    ["item_key","Item key","text"],["catalog_key","Catalog key","text"],["name_vi","Tên VI","text"],["name_zh_tw","中文名稱","text"],
    ["unit","Đơn vị · 單位","text"],["work_area","Khu làm việc · 工作區","text"],["storage_only","Chỉ lưu kho · 僅倉儲","boolean"],
  ]},
  "sop-documents":{ label:"SOP Documents", archive:"Ngừng dùng · 停用", fields:[
    ["site_code","Chi nhánh · 據點","site"],["sop_code","Mã SOP","text"],["menu_item_id","Menu item UUID","text"],["work_area","Khu làm việc · 工作區","text"],
    ["name_vi","Tên VI","text"],["name_zh_tw","中文名稱","text"],["active","Hoạt động · 啟用","boolean"],
  ]},
};
const LABELS = {
  overview:"Tổng quan VPS · VPS 總覽",development:"GitHub & Handoff · 開發交接",users:"Quản lý người dùng · 使用者管理",content:"Nội dung & duyệt · 內容審核",
  data:"Database · 資料庫管理",stores:"Chuỗi & chi nhánh · 多店管理",settings:"Settings · 系統設定",logs:"Logs & Reports · 日誌報表",
};

let sectionLoadSeq = 0;

const state = {
  me:null, loading:true, error:"", success:"", section:"overview",
  overview:null, systemMetrics:null, developmentStatus:null, users:[], accessModel:{roles:[],modules:[],capabilities:[]}, sites:[], settings:[], content:null,
  data:{ name:"inventory-products",q:"",site:"",status:"",page:1,pageSize:25,sort:"",direction:"desc",result:null,loading:false },
  audit:{ q:"",site:"",action:"",actor:"",page:1,pageSize:25,result:null,loading:false },
};

function esc(value) {
  return String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
function safeHref(value) {
  try {
    const url=new URL(String(value||""),location.origin);
    return ["http:","https:"].includes(url.protocol)?url.href:"#";
  } catch { return "#"; }
}
function json(value) { try { return JSON.stringify(value ?? {},null,2); } catch { return "{}"; } }
function display(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "✓" : "—";
  if (typeof value === "object") return JSON.stringify(value);
  const str = String(value); return str.length > 120 ? `${str.slice(0,117)}…` : str;
}
function fmtBytes(value) {
  let n = Number(value || 0); const units=["B","KB","MB","GB","TB"]; let i=0;
  while(n>=1024 && i<units.length-1){n/=1024;i+=1;} return `${n.toFixed(i?1:0)} ${units[i]}`;
}
function fmtRate(value) { return `${fmtBytes(value)}/s`; }
function fmtPercent(value) { const n=Number(value); return Number.isFinite(n) ? `${n.toFixed(1)}%` : "—"; }
function fmtUptime(seconds) {
  let s=Math.max(0,Number(seconds)||0); const d=Math.floor(s/86400); s%=86400; const h=Math.floor(s/3600); const m=Math.floor((s%3600)/60);
  return `${d?`${d}d `:""}${h}h ${m}m`;
}
function fmtDate(value) {
  if (!value) return "—"; const date=new Date(value); if (!Number.isFinite(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("vi-VN",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).format(date);
}
function isSuperAdmin() { return Boolean(state.me?.capabilities?.["system.super_admin"]); }
function roleByCode(code) { return state.accessModel.roles.find((role)=>role.code===code); }
function siteName(code) {
  if (!code || code==="all") return code==="all" ? "Tất cả · 全部" : "Toàn hệ thống · 全系統";
  const site=state.sites.find((row)=>row.code===code); return site ? `${site.name_vi} · ${site.name_zh_tw}` : code;
}
function currentSection() {
  const hash=location.hash.replace(/^#/,""); return SECTIONS.includes(hash) ? hash : state.section;
}
function flash(type,message) { state.error=type==="error"?message:""; state.success=type==="success"?message:""; render(); }
function errorText(error) { return error?.payload?.error || error?.code || error?.message || "UNKNOWN_ERROR"; }

async function api(path,options) { return apiRequest(path,options); }
async function loadDataset() {
  if(state.data.name==="inventory-products")return;
  state.data.loading=true; render();
  const params=new URLSearchParams({ page:String(state.data.page),pageSize:String(state.data.pageSize) });
  if(state.data.q)params.set("q",state.data.q); if(state.data.site)params.set("site",state.data.site); if(state.data.status)params.set("status",state.data.status);
  if(state.data.sort)params.set("sort",state.data.sort); if(state.data.direction)params.set("direction",state.data.direction);
  try { state.data.result=await api(`/api/admin/super/data/${encodeURIComponent(state.data.name)}?${params}`); }
  catch(error){ state.error=errorText(error); }
  state.data.loading=false; render();
}
async function loadAudit() {
  state.audit.loading=true; render();
  const params=new URLSearchParams({page:String(state.audit.page),pageSize:String(state.audit.pageSize)});
  for(const key of ["q","site","action","actor"]) if(state.audit[key])params.set(key,state.audit[key]);
  try { state.audit.result=await api(`/api/admin/super/audit?${params}`); }
  catch(error){state.error=errorText(error);} state.audit.loading=false; render();
}
async function loadCore() {
  const [overview,systemMetrics,developmentStatus,users,accessModel,sites,settings,content]=await Promise.all([
    api("/api/admin/super/overview"),api("/api/admin/super/system-metrics"),api("/api/admin/super/development-status").catch(()=>null),vpsListUsers(),api("/api/admin/access-model"),
    api("/api/admin/super/sites"),api("/api/admin/super/settings"),api("/api/admin/super/content"),
  ]);
  state.overview=overview; state.systemMetrics=systemMetrics||null; state.developmentStatus=developmentStatus||null; state.users=users?.users||[]; state.accessModel=accessModel||{roles:[],modules:[],capabilities:[]};
  state.sites=sites?.sites||[]; state.settings=settings?.settings||[]; state.content=content||null;
}
async function refreshCurrent() {
  state.error=""; state.success="";
  try { await loadCore(); if(currentSection()==="data")await loadDataset(); if(currentSection()==="logs")await loadAudit(); }
  catch(error){state.error=errorText(error);} render();
}

function nav() {
  return `<aside class="sa-sidebar"><div class="sa-owner"><span class="sa-owner-badge">SUPER</span><strong>${esc(state.me?.displayName||state.me?.username||"")}</strong><small>${esc(state.me?.username||"")}</small></div>
  <nav>${SECTIONS.map((id)=>`<button type="button" data-section="${id}" class="sa-nav-item ${state.section===id?"active":""}"><span>${esc(LABELS[id])}</span></button>`).join("")}</nav>
  <div class="sa-sidebar-foot"><a href="./">← Kitchen OS</a></div></aside>`;
}
function topbar() {
  return `<header class="sa-topbar"><div><button class="sa-menu-button" type="button" data-toggle-nav>☰</button><h1>${esc(LABELS[state.section])}</h1><p>Super Admin · Database Control Plane</p></div><div class="sa-top-actions"><button class="sa-btn" type="button" data-refresh>↻ Làm mới</button></div></header>`;
}
function notices() { return `${state.error?`<div class="sa-alert error">${esc(state.error)}</div>`:""}${state.success?`<div class="sa-alert success">${esc(state.success)}</div>`:""}`; }
function stat(label,value,note="") { return `<article class="sa-stat"><small>${esc(label)}</small><strong>${esc(value)}</strong>${note?`<span>${esc(note)}</span>`:""}</article>`; }

function renderOverview() {
  const o=state.overview||{}; const c=o.counts||{}; const db=o.database||{}; const apiInfo=o.api||{}; const backup=o.latestBackup;
  const metrics=state.systemMetrics||{}; const hostMetrics=metrics.host||{}; const host=hostMetrics.host||{}; const cpu=hostMetrics.cpu||{};
  const memory=hostMetrics.memory||{}; const disk=hostMetrics.disk||{}; const storage=hostMetrics.storage||{}; const network=hostMetrics.network||{};
  const primaryInterface=(network.interfaces||[]).find((row)=>row.primary)||(network.interfaces||[])[0]||null;
  const dbMetrics=metrics.database||{}; const serviceRows=hostMetrics.services||[]; const tableSizes=metrics.table_sizes||[];
  return `<section class="sa-stat-grid">
    ${stat("Users",`${c.active_users??0} / ${c.users??0}`,"active / total")}${stat("Chi nhánh · 據點",`${c.active_sites??0} / ${c.sites??0}`)}
    ${stat("Products",c.products??0)}${stat("SOP chờ duyệt",c.pending_sops??0)}${stat("Audit logs",c.audit_logs??0)}${stat("Thông báo đang đăng",c.announcements??0)}
  </section>
  <section class="sa-two-col">
    <article class="sa-card"><div class="sa-card-head"><div><h2>VPS / API</h2><p>Trạng thái runtime trực tiếp</p></div><span class="sa-pill ok">ONLINE</span></div>
      <div class="sa-kv-grid"><div><small>Release</small><strong>${esc(o.release||"dev")}</strong></div><div><small>Node</small><strong>${esc(apiInfo.node_version||"—")}</strong></div>
      <div><small>Uptime</small><strong>${esc(fmtUptime(apiInfo.uptime_seconds))}</strong></div><div><small>PID</small><strong>${esc(apiInfo.pid||"—")}</strong></div>
      <div><small>RAM RSS</small><strong>${esc(fmtBytes(apiInfo.memory_rss_bytes))}</strong></div><div><small>Heap</small><strong>${esc(fmtBytes(apiInfo.memory_heap_used_bytes))} / ${esc(fmtBytes(apiInfo.memory_heap_total_bytes))}</strong></div></div>
    </article>
    <article class="sa-card"><div class="sa-card-head"><div><h2>PostgreSQL</h2><p>Database authority</p></div><span class="sa-pill ok">CONNECTED</span></div>
      <div class="sa-kv-grid"><div><small>Database</small><strong>${esc(db.database_name||"—")}</strong></div><div><small>PostgreSQL</small><strong>${esc(db.server_version||"—")}</strong></div>
      <div><small>DB size</small><strong>${esc(fmtBytes(db.size_bytes))}</strong></div><div><small>Connections</small><strong>${esc(db.connections??"—")}</strong></div>
      <div><small>Schema</small><strong>${esc(o.schema?.version||"—")}</strong></div><div><small>Migration</small><strong>${esc(o.schema?.filename||"—")}</strong></div></div>
    </article>
  </section>
  <article class="sa-card"><div class="sa-card-head"><div><h2>Backup</h2><p>Bản sao gần nhất · 最近備份</p></div></div>
  ${backup?`<div class="sa-kv-grid"><div><small>Backup key</small><strong>${esc(backup.backup_key)}</strong></div><div><small>Status</small><strong>${esc(backup.status)}</strong></div><div><small>Size</small><strong>${esc(fmtBytes(backup.size_bytes))}</strong></div><div><small>Completed</small><strong>${esc(fmtDate(backup.completed_at||backup.started_at))}</strong></div></div>`:`<div class="sa-empty">Chưa có bản ghi backup.</div>`}</article>
  <section class="sa-two-col" data-system-metrics>
    <article class="sa-card"><div class="sa-card-head"><div><h2>Tài nguyên VPS · VPS 資源</h2><p>Snapshot host read-only; không cấp shell/Docker socket cho browser.</p></div><span class="sa-pill ${hostMetrics.available?"ok":"warn"}">${hostMetrics.available?"LIVE":"UNAVAILABLE"}</span></div>
      ${hostMetrics.available?`<div class="sa-kv-grid">
        <div><small>Host / OS</small><strong>${esc(host.hostname||"—")}</strong><small>${esc(host.os||"—")} · ${esc(host.arch||"—")}</small></div>
        <div><small>Host uptime</small><strong>${esc(fmtUptime(cpu.uptime_seconds))}</strong><small>snapshot ${esc(hostMetrics.age_seconds??"—")}s trước</small></div>
        <div><small>CPU</small><strong>${esc(fmtPercent(cpu.usage_percent))}</strong><small>${esc(cpu.logical||"—")} vCPU · load ${esc(cpu.load_1??"—")} / ${esc(cpu.load_5??"—")} / ${esc(cpu.load_15??"—")}</small></div>
        <div><small>RAM</small><strong>${esc(fmtBytes(memory.used_bytes))} / ${esc(fmtBytes(memory.total_bytes))}</strong><small>available ${esc(fmtBytes(memory.available_bytes))}</small></div>
        <div><small>Disk /</small><strong>${esc(fmtBytes(disk.used_bytes))} / ${esc(fmtBytes(disk.total_bytes))}</strong><small>${esc(fmtPercent(disk.used_percent))} · free ${esc(fmtBytes(disk.available_bytes))}</small></div>
        <div><small>PostgreSQL data</small><strong>${esc(fmtBytes(storage.postgres_data_bytes))}</strong><small>DB logical ${esc(fmtBytes(dbMetrics.size_bytes))}</small></div>
        <div><small>Kitchen OS</small><strong>${esc(fmtBytes(storage.app_bytes))}</strong><small>backup ${esc(fmtBytes(storage.backup_bytes))} · ${esc(storage.backup_count??0)} files</small></div>
        <div><small>Swap</small><strong>${esc(fmtBytes(memory.swap_used_bytes))} / ${esc(fmtBytes(memory.swap_total_bytes))}</strong></div>
      </div>`:`<div class="sa-empty">Host metrics snapshot chưa sẵn sàng. API/database vẫn không mở quyền host trực tiếp.</div>`}
    </article>
    <article class="sa-card"><div class="sa-card-head"><div><h2>Mạng & dịch vụ · 網路 / Services</h2><p>Băng thông hiện tại là counter/rate của host, không phải quota nhà cung cấp.</p></div></div>
      ${hostMetrics.available?`<div class="sa-kv-grid">
        <div><small>Download rate</small><strong>${esc(fmtRate(network.rx_bytes_per_second))}</strong><small>RX từ boot: ${esc(fmtBytes(network.total_rx_bytes))}</small></div>
        <div><small>Upload rate</small><strong>${esc(fmtRate(network.tx_bytes_per_second))}</strong><small>TX từ boot: ${esc(fmtBytes(network.total_tx_bytes))}</small></div>
        <div><small>Primary NIC</small><strong>${esc(primaryInterface?.name||"—")}</strong><small>${primaryInterface?.link_speed_mbps?esc(`${primaryInterface.link_speed_mbps} Mbps link`):"link speed N/A"}</small></div>
        <div><small>Provider quota</small><strong>Chưa cấu hình</strong><small>OS không biết hạn mức traffic theo gói VPS</small></div>
      </div><div class="sa-list">${serviceRows.map((service)=>`<div class="sa-list-row"><div><strong>${esc(service.name)}</strong><small>${esc(service.status||"—")}</small></div><span class="sa-pill ${service.status==="running"&&["healthy","none"].includes(service.health)?"ok":"warn"}">${esc(service.health||service.status||"—")}</span></div>`).join("")}</div>`:`<div class="sa-empty">Không có host network/service snapshot.</div>`}
    </article>
  </section>
  <article class="sa-card"><div class="sa-card-head"><div><h2>PostgreSQL storage · 表 / Index</h2><p>Top bảng theo tổng dung lượng. Connections: ${esc(dbMetrics.connections??"—")} / max ${esc(dbMetrics.max_connections??"—")}.</p></div></div>
    <div class="sa-table-wrap"><table class="sa-table"><thead><tr><th>Table</th><th>Rows est.</th><th>Table</th><th>Indexes</th><th>Total</th></tr></thead><tbody>
      ${tableSizes.slice(0,12).map((row)=>`<tr><td><strong>${esc(row.table_name)}</strong></td><td>${esc(row.estimated_rows)}</td><td>${esc(fmtBytes(row.table_bytes))}</td><td>${esc(fmtBytes(row.index_bytes))}</td><td>${esc(fmtBytes(row.total_bytes))}</td></tr>`).join("")||`<tr><td colspan="5">Chưa có số liệu.</td></tr>`}
    </tbody></table></div>
  </article>`;
}

function devLink(url,label,note="") {
  const href=safeHref(url);
  return `<a class="sa-dev-link" href="${esc(href)}" target="_blank" rel="noopener noreferrer"><strong>${esc(label)}</strong>${note?`<small>${esc(note)}</small>`:""}<span>↗</span></a>`;
}

function renderDevelopment() {
  const d=state.developmentStatus;
  if(!d)return `<article class="sa-card"><div class="sa-card-head"><div><h2>GitHub & Handoff</h2><p>Metadata bàn giao hiện chưa tải được. Các chức năng quản trị khác vẫn hoạt động bình thường.</p></div><span class="sa-pill off">UNAVAILABLE</span></div></article>`;
  const work=d.current_work||{}; const incident=work.resolved_incident||{}; const live=d.live_production||{}; const evidence=d.release_evidence||{}; const runtime=d.runtime||{}; const repo=d.repository||{};
  const liveGit=d.live_github||{}; const pr=liveGit.active_pr||work.pull_request||null; const canonical=d.canonical_handoff||{};
  const status=String(d.status||"unknown").toLowerCase();
  const liveState=liveGit.available?(liveGit.stale?"STALE":"LIVE"):"FALLBACK";
  const workflowRows=(liveGit.workflows||[]).slice(0,12);
  const commitRows=(liveGit.commits||[]).slice(0,8);
  const canonicalUrl=canonical.url||liveGit.canonical_url||"";
  return `<article class="sa-card">
    <div class="sa-card-head"><div><h2>One-link Handoff · 單一交接連結</h2><p>Dev khác hoặc chat mới chỉ cần mở link này. Trang sẽ tự tìm PR/branch/head SHA/CI hiện tại.</p></div><span class="sa-pill ${liveGit.available?"ok":"off"}">${esc(liveState)}</span></div>
    <div class="sa-row-actions">
      ${canonicalUrl?`<button class="sa-btn primary" type="button" data-copy-handoff data-handoff-url="${esc(safeHref(canonicalUrl))}">Copy handoff link</button>`:""}
      ${canonicalUrl?devLink(canonicalUrl,"Mở Live Handoff","Canonical entry / dev + chat mới"):""}
      ${repo.pulls_url?devLink(repo.pulls_url,"Open Pull Requests","Fallback nếu live feed tạm lỗi"):""}
    </div>
    <p class="sa-dev-note">${esc(canonical.purpose||"")}</p>
  </article>
  <section class="sa-two-col sa-dev-summary">
    <article class="sa-card"><div class="sa-card-head"><div><h2>Công việc hiện tại · Current work</h2><p>${esc(d.headline||"")}</p></div><span class="sa-pill ${status==="blocked"?"off":"ok"}">${esc(String(d.status||"UNKNOWN").toUpperCase())}</span></div>
      <div class="sa-kv-grid">
        <div><small>Phase</small><strong>${esc(d.phase||"—")}</strong></div>
        <div><small>GitHub refresh</small><strong>${esc(liveGit.generated_at||d.updated_at||"—")}</strong></div>
        <div><small>Branch</small><strong class="mono">${esc(work.branch||"—")}</strong></div>
        <div><small>Head SHA</small><strong class="mono">${esc(String(pr?.head_sha||"").slice(0,12)||"—")}</strong></div>
        <div><small>${status==="stable"?"Current schema":"Candidate schema"}</small><strong>${esc(work.candidate_schema||runtime.schema?.version||"—")}</strong></div>
        <div><small>PR</small><strong>${pr?.number?`#${esc(pr.number)}`:"—"}</strong></div>
      </div>
      <div class="sa-dev-link-grid">
        ${devLink(work.url,status==="stable"?"Mở main hiện tại":"Mở công việc đang làm",status==="stable"?"Production source / main":"PR/branch hiện tại")}
        ${pr?.url?devLink(pr.url,`PR #${pr.number||""}`,pr.title||"Pull request hiện tại"):""}
        ${work.baseline_main_url?devLink(work.baseline_main_url,status==="stable"?"Live commit":"Main baseline",String(work.baseline_main_sha||live.release||"").slice(0,12)):""}
        ${incident.failed_url?devLink(incident.failed_url,"Incident đã xử lý",incident.failed_run_id?`run ${incident.failed_run_id}`:""):""}
      </div>
    </article>
    <article class="sa-card"><div class="sa-card-head"><div><h2>Live production · Production hiện tại</h2><p>Release/schema lấy trực tiếp runtime; current work lấy từ GitHub live.</p></div></div>
      <div class="sa-kv-grid">
        <div><small>Live release</small><strong class="mono">${esc(live.release||runtime.release||"—")}</strong></div>
        <div><small>Live schema</small><strong>${esc(live.schema||runtime.schema?.version||"—")}</strong></div>
        <div><small>Release milestone</small><strong class="mono">${esc(String(evidence.milestone_sha||"").slice(0,12)||"—")}</strong></div>
        <div><small>Inventory audit</small><strong>${esc(evidence.inventory_audit_run_id?`run ${evidence.inventory_audit_run_id}`:"—")}</strong></div>
      </div>
      <div class="sa-dev-link-grid">
        ${live.commit_url?devLink(live.commit_url,"Live release commit",live.release||""):""}
        ${evidence.url?devLink(evidence.url,"Release evidence",evidence.workflow_run_id?`run ${evidence.workflow_run_id}`:""):""}
        ${evidence.inventory_audit_url?devLink(evidence.inventory_audit_url,"Inventory production audit",evidence.inventory_audit_run_id?`run ${evidence.inventory_audit_run_id}`:""):""}
        ${devLink(repo.actions_url,"GitHub Actions","CI / deploy / audit")}
      </div>
      <p class="sa-dev-note">${esc(live.note||evidence.note||"")}</p>
    </article>
  </section>
  <section class="sa-two-col">
    <article class="sa-card"><div class="sa-card-head"><div><h2>Fix / stopping point hiện tại</h2><p>Nội dung này lấy từ PR body khi có PR mở; không còn phải sửa branch string thủ công trên VPS.</p></div></div>
      <div class="sa-dev-stop"><strong>${esc(pr?.title||d.headline||"—")}</strong><p>${esc(work.stopping_point||"—")}</p></div>
      <div class="sa-code-list">${(work.code_focus||[]).map((path)=>`<code>${esc(path)}</code>`).join("")||"<span>—</span>"}</div>
    </article>
    <article class="sa-card"><div class="sa-card-head"><div><h2>Git commit chain</h2><p>Commit gần nhất của head PR hiện tại.</p></div></div>
      <div class="sa-list">${commitRows.map((row)=>`<div class="sa-list-row"><div><strong class="mono">${esc(row.short_sha||String(row.sha||"").slice(0,12))}</strong><small>${esc(row.message||"")}</small></div>${row.url?`<a class="sa-link" href="${esc(safeHref(row.url))}" target="_blank" rel="noreferrer">Mở</a>`:""}</div>`).join("")||`<div class="sa-empty">Không có commit chain live; dùng CURRENT_HANDOFF.md làm fallback.</div>`}</div>
    </article>
  </section>
  <section class="sa-two-col">
    <article class="sa-card"><div class="sa-card-head"><div><h2>CI của head hiện tại</h2><p>Chỉ hiển thị workflow có đúng head SHA của PR.</p></div></div>
      <div class="sa-list">${workflowRows.map((row)=>{const ok=row.status==="completed"&&row.conclusion==="success";const stateText=`${row.status||"unknown"} / ${row.conclusion||"pending"}`;return `<div class="sa-list-row"><div><strong>${esc(row.name||"workflow")} #${esc(row.run_number||"")}</strong><small>${esc(stateText)}</small></div><span class="sa-pill ${ok?"ok":row.status==="completed"?"off":""}">${esc(row.conclusion||row.status||"pending")}</span></div>`;}).join("")||`<div class="sa-empty">Chưa có CI live cho head hiện tại hoặc GitHub feed đang fallback.</div>`}</div>
    </article>
    <article class="sa-card"><div class="sa-card-head"><div><h2>Việc tiếp theo · Next steps</h2><p>Fallback workboard khi PR body chưa mô tả đủ bước kế tiếp.</p></div></div>
      <ol class="sa-dev-steps">${(d.next_steps||[]).map((step)=>`<li>${esc(step)}</li>`).join("")}</ol>
    </article>
  </section>
  <article class="sa-card"><div class="sa-card-head"><div><h2>Tài liệu bàn giao · Handoff docs</h2><p>Dev mới phải đọc handoff/rules trước khi sửa code production.</p></div></div>
    <div class="sa-dev-docs">${(d.documents||[]).map((doc)=>devLink(doc.url,doc.label,doc.purpose)).join("")}</div>
    <p class="sa-dev-note">${esc(d.security_note||"")}</p>
  </article>`;
}

function renderUsers() {
  return `<article class="sa-card"><div class="sa-card-head"><div><h2>Users & RBAC</h2><p>Role + quyền override theo từng user, đọc/ghi trực tiếp PostgreSQL.</p></div><button class="sa-btn primary" type="button" data-user-new>＋ Thêm user</button></div>
  <div class="sa-table-wrap"><table class="sa-table"><thead><tr><th>User</th><th>Vai trò</th><th>Chi nhánh</th><th>Quyền</th><th>Trạng thái</th><th></th></tr></thead><tbody>
  ${state.users.map((user)=>`<tr><td><strong>${esc(user.display_name)}</strong><small>@${esc(user.username)}</small></td><td>${esc(user.role_name_vi||user.role)}<small>${esc(user.role)}</small></td><td>${esc(siteName(user.location))}</td>
  <td><span class="sa-pill">${esc(Object.values(user.permissions||{}).filter((p)=>p?.view).length)} view</span> <span class="sa-pill">${esc(Object.values(user.permissions||{}).filter((p)=>p?.edit).length)} edit</span></td>
  <td><span class="sa-pill ${user.active?"ok":"off"}">${user.active?"Active":"Disabled"}</span></td><td><div class="sa-row-actions"><button class="sa-btn small" type="button" data-user-edit="${esc(user.id)}">Sửa</button>${user.id!==state.me?.id?`<button class="sa-btn small danger" type="button" data-user-delete="${esc(user.id)}">Archive</button>`:""}</div></td></tr>`).join("")}
  </tbody></table></div></article>`;
}

function renderContent() {
  const c=state.content||{}; const counts=c.counts||{};
  return `<section class="sa-stat-grid compact">${stat("Thông báo",counts.announcements??0)}${stat("SOP chờ duyệt",counts.pending_sops??0)}${stat("Nguyên liệu",counts.inventory_products??0)}${stat("Menu",counts.menu_items??0)}${stat("Media",counts.media_assets??0)}</section>
  <section class="sa-two-col">
    <article class="sa-card"><div class="sa-card-head"><div><h2>Thông báo · 公告</h2><p>Đăng, chỉnh sửa và lưu trữ thông báo.</p></div><button class="sa-btn primary" type="button" data-open-dataset="announcements" data-new-row>＋ Đăng</button></div>
      <div class="sa-list">${(c.announcements||[]).map((row)=>`<div class="sa-list-row"><div><strong>${esc(row.title_vi||row.title_zh_tw)}</strong><small>${esc(siteName(row.site_code))} · ${esc(row.status)} · ${esc(fmtDate(row.updated_at))}</small></div><button class="sa-btn small" data-open-dataset="announcements">Mở bảng</button></div>`).join("")||`<div class="sa-empty">Chưa có thông báo.</div>`}</div>
    </article>
    <article class="sa-card"><div class="sa-card-head"><div><h2>Media / Hình ảnh</h2><p>Metadata hình ảnh và tài liệu.</p></div><button class="sa-btn" type="button" data-open-dataset="media">Quản lý</button></div>
      <div class="sa-list">${(c.media||[]).map((row)=>`<div class="sa-list-row"><div><strong>${esc(row.label)}</strong><small>${esc(row.asset_type)} · ${esc(siteName(row.site_code))}</small></div><a class="sa-link" href="${esc(safeHref(row.asset_url))}" target="_blank" rel="noreferrer">Mở</a></div>`).join("")||`<div class="sa-empty">Chưa có media.</div>`}</div>
    </article>
  </section>
  <article class="sa-card"><div class="sa-card-head"><div><h2>Duyệt SOP · SOP 審核</h2><p>Chỉ version đang ở trạng thái draft mới có thể duyệt/từ chối.</p></div><button class="sa-btn" data-open-dataset="sop-documents">Danh sách SOP</button></div>
    <div class="sa-list">${(c.pendingSops||[]).map((row)=>`<div class="sa-list-row"><div><strong>${esc(row.name_vi)} · ${esc(row.name_zh_tw)}</strong><small>${esc(row.sop_code)} · v${esc(row.version_no)} · ${esc(siteName(row.site_code))} · ${esc(fmtDate(row.created_at))}</small></div><div class="sa-row-actions"><button class="sa-btn small primary" data-sop-review="${esc(row.version_id)}" data-decision="approved">Duyệt</button><button class="sa-btn small danger" data-sop-review="${esc(row.version_id)}" data-decision="rejected">Từ chối</button></div></div>`).join("")||`<div class="sa-empty">Không có SOP chờ duyệt.</div>`}</div>
  </article>
  <article class="sa-card"><div class="sa-card-head"><div><h2>Sản phẩm · 品項</h2><p>Menu và nguyên liệu kho là hai dataset riêng.</p></div><div class="sa-row-actions"><button class="sa-btn" data-open-dataset="menu-items">Menu / Giá</button><button class="sa-btn" data-open-dataset="inventory-products">Nguyên liệu kho</button></div></div></article>`;
}

function renderDataFilters() {
  const statusOptions=state.data.name==="announcements"
    ? `<option value="">Tất cả trạng thái</option><option value="draft">draft</option><option value="published">published</option><option value="archived">archived</option>`
    : `<option value="">Tất cả trạng thái</option><option value="active">active</option><option value="inactive">inactive</option>`;
  return `<form class="sa-filterbar" data-data-filter><input name="q" value="${esc(state.data.q)}" placeholder="Tìm kiếm…"><select name="site"><option value="">Tất cả site</option>${state.sites.map((site)=>`<option value="${esc(site.code)}" ${state.data.site===site.code?"selected":""}>${esc(siteName(site.code))}</option>`).join("")}</select><select name="status">${statusOptions.replace(`value="${esc(state.data.status)}"`,`value="${esc(state.data.status)}" selected`)}</select><button class="sa-btn" type="submit">Lọc</button></form>`;
}
function renderData() {
  if(state.data.name==="inventory-products")return `<article class="sa-card" data-module-v2="data"><div class="sa-card-head"><div><h2>Database kho · 庫存資料庫</h2><p>PostgreSQL là nguồn dữ liệu gốc. Thay đổi cấu trúc kho tại đây được đồng bộ tới Website qua API + inventory events; không cần thao tác SQL/SSH cho dữ liệu vận hành.</p></div><span class="sa-pill ok">DB AUTHORITY</span></div><div class="sa-tabs">${Object.entries(DATASET_META).map(([key,meta])=>`<button type="button" class="sa-tab ${state.data.name===key?"active":""}" data-dataset="${esc(key)}">${esc(meta.label)}</button>`).join("")}</div><div class="idb-workspace" data-inventory-database></div></article>`;
  const result=state.data.result; const rows=result?.rows||[]; const columns=result?.columns||[]; const p=result?.pagination||{page:1,pages:1,total:0};
  const allowCreate=result ? result.allowCreate!==false : state.data.name!=="inventory-products";
  const allowArchive=result ? result.allowArchive!==false : state.data.name!=="inventory-products";
  const lifecycleManaged=Boolean(result?.lifecycleManaged || state.data.name==="inventory-products");
  const lifecycleNote=lifecycleManaged
    ? `<div class="sa-empty"><strong>Inventory lifecycle được quản lý tại module Kho · 庫存模組管理生命週期</strong><br><small>Data Tables chỉ sửa metadata. Thêm mới / kích hoạt / ngừng dùng phải thực hiện trong Inventory để giữ stock, location, receive-default và audit nhất quán.</small></div>`
    : "";
  return `<article class="sa-card"><div class="sa-card-head"><div><h2>Database & CRUD · 資料庫管理</h2><p>Chỉ dữ liệu/column nằm trong whitelist backend mới được chỉnh sửa; mọi thay đổi vẫn đi qua API, quyền và audit.</p></div>${allowCreate?`<button class="sa-btn primary" type="button" data-data-new>＋ Thêm dữ liệu</button>`:""}</div>
  <div class="sa-tabs">${Object.entries(DATASET_META).map(([key,meta])=>`<button type="button" class="sa-tab ${state.data.name===key?"active":""}" data-dataset="${esc(key)}">${esc(meta.label)}</button>`).join("")}</div>
  ${lifecycleNote}
  ${renderDataFilters()}
  ${state.data.loading?`<div class="sa-empty">Đang tải…</div>`:`<div class="sa-table-wrap"><table class="sa-table data-table"><thead><tr>${columns.map((column)=>`<th><button type="button" class="sa-sort" data-sort="${esc(column)}">${esc(column)}${state.data.sort===column?(state.data.direction==="asc"?" ↑":" ↓"):""}</button></th>`).join("")}<th></th></tr></thead><tbody>${rows.map((row)=>`<tr>${columns.map((column)=>`<td title="${esc(typeof row[column]==="object"?json(row[column]):row[column])}">${esc(display(row[column]))}</td>`).join("")}<td><div class="sa-row-actions"><button class="sa-btn small" data-data-edit="${esc(row.id)}">Sửa</button>${allowArchive?`<button class="sa-btn small danger" data-data-archive="${esc(row.id)}">${esc(DATASET_META[state.data.name]?.archive||"Archive")}</button>`:""}</div></td></tr>`).join("")}</tbody></table></div>`}
  <div class="sa-pagination"><span>${esc(p.total||0)} rows · page ${esc(p.page||1)}/${esc(p.pages||1)}</span><div><button class="sa-btn small" data-page="${Math.max(1,(p.page||1)-1)}" ${(p.page||1)<=1?"disabled":""}>←</button><button class="sa-btn small" data-page="${Math.min(p.pages||1,(p.page||1)+1)}" ${(p.page||1)>=(p.pages||1)?"disabled":""}>→</button></div></div></article>`;
}

function renderStores() {
  return `<article class="sa-card"><div class="sa-card-head"><div><h2>Danh sách chi nhánh · 據點清單</h2><p>Thêm, cấu hình và bật/tắt từng cơ sở. Site code cố định sau khi tạo.</p></div><button class="sa-btn primary" data-site-new>＋ Thêm chi nhánh</button></div>
  <div class="sa-table-wrap"><table class="sa-table"><thead><tr><th>Code</th><th>Tên</th><th>Timezone</th><th>Currency</th><th>Trạng thái</th><th></th></tr></thead><tbody>${state.sites.map((site)=>`<tr><td class="mono">${esc(site.code)}</td><td><strong>${esc(site.name_vi)}</strong><small>${esc(site.name_zh_tw)}</small></td><td>${esc(site.timezone_name)}</td><td>${esc(site.currency_code)}</td><td><span class="sa-pill ${site.active?"ok":"off"}">${site.active?"Active":"Inactive"}</span></td><td><button class="sa-btn small" data-site-edit="${esc(site.code)}">Cấu hình</button></td></tr>`).join("")}</tbody></table></div></article>
  <section class="sa-two-col"><article class="sa-card"><div class="sa-card-head"><div><h2>Đồng bộ menu / giá</h2><p>Copy menu từ site nguồn sang site đích; có thể giữ giá riêng của site đích.</p></div></div>
    <form class="sa-form-grid" data-menu-sync><label><span>Nguồn</span><select name="source" required>${state.sites.filter((s)=>s.active).map((s)=>`<option value="${esc(s.code)}">${esc(siteName(s.code))}</option>`).join("")}</select></label><label><span>Đích</span><select name="destination" required>${state.sites.filter((s)=>s.active).map((s)=>`<option value="${esc(s.code)}">${esc(siteName(s.code))}</option>`).join("")}</select></label><label class="sa-check wide"><input type="checkbox" name="overwritePrices"><span>Đồng bộ cả giá / 覆蓋價格</span></label><div class="wide"><button class="sa-btn primary" type="submit">Đồng bộ</button></div></form>
  </article><article class="sa-card"><div class="sa-card-head"><div><h2>Kho tổng & điều chuyển</h2><p>Không sửa quantity trực tiếp từ bảng hệ thống. Điều chuyển phải đi qua transaction kho chuẩn để đảm bảo atomic và audit.</p></div></div><a class="sa-btn primary inline" href="./#inventory">Mở Inventory / 出貨</a></article></section>`;
}

function renderSettings() {
  return `<article class="sa-card"><div class="sa-card-head"><div><h2>Cấu hình website · 網站設定</h2><p>Giá trị lưu trong <code>system_settings</code>, version tăng sau mỗi lần lưu.</p></div><button class="sa-btn primary" data-setting-new>＋ Thêm setting</button></div>
  <div class="sa-table-wrap"><table class="sa-table"><thead><tr><th>Key</th><th>Value</th><th>Version</th><th>Updated</th><th></th></tr></thead><tbody>${state.settings.map((row)=>`<tr><td class="mono">${esc(row.setting_key)}</td><td><code>${esc(display(row.value))}</code></td><td>${esc(row.version)}</td><td>${esc(fmtDate(row.updated_at))}</td><td><button class="sa-btn small" data-setting-edit="${esc(row.setting_key)}">Sửa</button></td></tr>`).join("")}</tbody></table></div></article>`;
}

function auditParams(format="") {
  const params=new URLSearchParams(); for(const key of ["q","site","action","actor"])if(state.audit[key])params.set(key,state.audit[key]); if(format)params.set("format",format); return params;
}
function renderLogs() {
  const r=state.audit.result; const rows=r?.rows||[]; const p=r?.pagination||{page:1,pages:1,total:0};
  return `<article class="sa-card"><div class="sa-card-head"><div><h2>Audit Logs</h2><p>Lịch sử thao tác user và thay đổi hệ thống.</p></div><div class="sa-row-actions"><button class="sa-btn" data-export="excel">Excel</button><button class="sa-btn" data-export="pdf">PDF</button></div></div>
  <form class="sa-filterbar" data-audit-filter><input name="q" value="${esc(state.audit.q)}" placeholder="Search action/entity…"><input name="actor" value="${esc(state.audit.actor)}" placeholder="User…"><input name="action" value="${esc(state.audit.action)}" placeholder="Action…"><select name="site"><option value="">Tất cả site</option>${state.sites.map((s)=>`<option value="${esc(s.code)}" ${state.audit.site===s.code?"selected":""}>${esc(siteName(s.code))}</option>`).join("")}</select><button class="sa-btn" type="submit">Lọc</button></form>
  ${state.audit.loading?`<div class="sa-empty">Đang tải…</div>`:`<div class="sa-table-wrap"><table class="sa-table"><thead><tr><th>Time</th><th>User</th><th>Action</th><th>Entity</th><th>Site</th><th>Metadata</th></tr></thead><tbody>${rows.map((row)=>`<tr><td>${esc(fmtDate(row.created_at))}</td><td>${esc(row.actor_username||"system")}</td><td class="mono">${esc(row.action)}</td><td>${esc(row.entity_type)}<small>${esc(row.entity_id||"")}</small></td><td>${esc(row.site||"—")}</td><td><code>${esc(display(row.metadata))}</code></td></tr>`).join("")}</tbody></table></div>`}
  <div class="sa-pagination"><span>${esc(p.total||0)} logs · page ${esc(p.page||1)}/${esc(p.pages||1)}</span><div><button class="sa-btn small" data-audit-page="${Math.max(1,(p.page||1)-1)}" ${(p.page||1)<=1?"disabled":""}>←</button><button class="sa-btn small" data-audit-page="${Math.min(p.pages||1,(p.page||1)+1)}" ${(p.page||1)>=(p.pages||1)?"disabled":""}>→</button></div></div></article>`;
}

function sectionHtml() {
  if(state.section==="overview")return renderOverview(); if(state.section==="development")return renderDevelopment(); if(state.section==="users")return renderUsers(); if(state.section==="content")return renderContent();
  if(state.section==="data")return renderData(); if(state.section==="stores")return renderStores(); if(state.section==="settings")return renderSettings(); return renderLogs();
}
function render() {
  inventoryDatabase.detach();
  if(!root)return;
  if(state.loading){root.className="admin-loading";root.textContent="Kitchen OS · Super Admin…";return;}
  if(!state.me){root.className="admin-loading";root.innerHTML=`<div class="sa-gate"><h1>Phiên đăng nhập không hợp lệ</h1><a class="sa-btn primary" href="./">Đăng nhập Kitchen OS</a></div>`;return;}
  if(!isSuperAdmin()){root.className="admin-loading";root.innerHTML=`<div class="sa-gate"><span class="sa-owner-badge">403</span><h1>Super Admin only</h1><p>Tài khoản admin thông thường không được truy cập cổng hệ thống này.</p><a class="sa-btn primary" href="./">Về Kitchen OS</a></div>`;return;}
  root.className="sa-app"; root.innerHTML=`${nav()}<div class="sa-main">${topbar()}<main class="sa-content">${notices()}${sectionHtml()}</main></div>`; bind();
}

function modal(title,body) {
  const host=document.createElement("div"); host.className="sa-modal-backdrop"; host.innerHTML=`<section class="sa-modal" role="dialog" aria-modal="true"><div class="sa-modal-head"><h2>${esc(title)}</h2><button type="button" class="sa-icon" data-modal-close>×</button></div>${body}</section>`; document.body.append(host);
  host.addEventListener("click",(event)=>{if(event.target===host||event.target.closest?.("[data-modal-close]"))host.remove();}); return host;
}
function accountLocationChoices(role) {
  if (role?.scope_policy === "all") return [{code:"all",label:"Tất cả · 全部"}];
  if (role?.scope_policy === "central") return [{code:"central",label:siteName("central")}];
  return state.sites.filter((site)=>site.active && site.code!=="all")
    .map((site)=>({code:site.code,label:siteName(site.code)}));
}

function openUserEditor(user=null) {
  const defaultRole=roleByCode(user?.role||"employee")||state.accessModel.roles[0]; const overrides=user?.permission_overrides||{}; const effective=user?.permissions||defaultRole?.permissions||{}; const custom=Object.keys(overrides).length>0;
  const initialChoices=accountLocationChoices(defaultRole);
  const initialLocation=initialChoices.some((choice)=>choice.code===user?.location) ? user.location : initialChoices[0]?.code;
  const host=modal(user?"Sửa user · 編輯使用者":"Thêm user · 新增使用者",`<form data-user-form data-permission-mode="${custom?"custom":"default"}"><div class="sa-form-grid">
    <label><span>Username</span><input required name="username" pattern="[a-z0-9._-]{2,40}" value="${esc(user?.username||"")}"></label><label><span>Tên hiển thị · 顯示名稱</span><input required name="display_name" value="${esc(user?.display_name||"")}"></label>
    <label><span>Role</span><select name="role">${state.accessModel.roles.map((r)=>`<option value="${esc(r.code)}" ${(user?.role||defaultRole?.code)===r.code?"selected":""}>${esc(r.name_vi)} · ${esc(r.name_zh_tw)}</option>`).join("")}</select></label>
    <label><span>Chi nhánh · 據點</span><select name="location" required>${initialChoices.map((choice)=>`<option value="${esc(choice.code)}" ${initialLocation===choice.code?"selected":""}>${esc(choice.label)}</option>`).join("")}</select></label>
    <label><span>Ngôn ngữ · 語言</span><select name="preferred_language"><option value="vi" ${user?.preferred_language==="vi"?"selected":""}>Tiếng Việt</option><option value="zh-TW" ${user?.preferred_language==="zh-TW"?"selected":""}>繁體中文</option></select></label>
    <label><span>${user?"Mật khẩu mới (để trống nếu giữ nguyên)":"Mật khẩu"}</span><input name="password" type="password" ${user?"":"required"} minlength="10"></label>
    <label class="sa-check wide"><input type="checkbox" name="active" ${user?.active!==false?"checked":""}><span>Active</span></label>
  </div><div class="sa-permission-head"><div><h3>Quyền module · 模組權限</h3><p>View/Edit hiệu lực theo từng user.</p></div><button class="sa-btn small" type="button" data-role-defaults>Dùng mặc định Role</button></div>
  <div class="sa-permission-grid">${state.accessModel.modules.map((m)=>{const p=effective[m.module_key]||{};return `<div class="sa-permission-row" data-module="${esc(m.module_key)}"><div><strong>${esc(m.name_vi)}</strong><small>${esc(m.name_zh_tw)} · ${esc(m.module_key)}</small></div><label><input type="checkbox" data-perm="view" ${p.view?"checked":""}> View</label><label><input type="checkbox" data-perm="edit" ${p.edit?"checked":""}> Edit</label></div>`;}).join("")}</div>
  <p class="sa-form-error" data-form-error role="alert"></p><div class="sa-modal-actions"><button class="sa-btn" type="button" data-modal-close>Hủy</button><button class="sa-btn primary" type="submit">Lưu vào Database</button></div></form>`);
  const form=host.querySelector("[data-user-form]");
  const roleSelect=form.querySelector('[name="role"]');
  const locationSelect=form.querySelector('[name="location"]');
  let lastAssignedLocation=accountLocationChoices({scope_policy:"assigned"}).some((site)=>site.code===user?.location) ? user.location : "";
  const syncLocationChoices=()=>{
    const role=roleByCode(roleSelect.value);
    const choices=accountLocationChoices(role);
    const selected=choices.find((choice)=>choice.code===locationSelect.value)?.code
      || choices.find((choice)=>choice.code===lastAssignedLocation)?.code || choices[0]?.code || "";
    locationSelect.innerHTML=choices.map((choice)=>`<option value="${esc(choice.code)}">${esc(choice.label)}</option>`).join("");
    locationSelect.value=selected;
    locationSelect.disabled=role?.scope_policy!=="assigned" || choices.length===0;
    // Disabled controls are omitted by FormData; fixed scopes are submitted explicitly below.
    form.querySelector('[data-form-error]').textContent=choices.length ? "" : "Không có địa điểm đang hoạt động cho Role này.";
  };
  locationSelect.addEventListener("change",()=>{if(roleByCode(roleSelect.value)?.scope_policy==="assigned")lastAssignedLocation=locationSelect.value;});
  const applyRoleDefaults=()=>{const role=roleByCode(roleSelect.value);form.querySelectorAll("[data-module]").forEach((row)=>{const p=role?.permissions?.[row.dataset.module]||{};row.querySelector('[data-perm="view"]').checked=Boolean(p.view);row.querySelector('[data-perm="edit"]').checked=Boolean(p.edit);});form.dataset.permissionMode="default";};
  host.querySelector("[data-role-defaults]").addEventListener("click",applyRoleDefaults);
  roleSelect.addEventListener("change",()=>{if(roleByCode(roleSelect.value)?.scope_policy==="assigned" && accountLocationChoices(roleByCode(roleSelect.value)).some((choice)=>choice.code===locationSelect.value))lastAssignedLocation=locationSelect.value;syncLocationChoices();if(form.dataset.permissionMode==="default")applyRoleDefaults();});
  syncLocationChoices();
  form.querySelectorAll("[data-perm]").forEach((box)=>box.addEventListener("change",()=>{form.dataset.permissionMode="custom";const row=box.closest("[data-module]");const view=row.querySelector('[data-perm="view"]');const edit=row.querySelector('[data-perm="edit"]');if(box.dataset.perm==="edit"&&edit.checked)view.checked=true;if(box.dataset.perm==="view"&&!view.checked)edit.checked=false;}));
  form.addEventListener("submit",async(event)=>{event.preventDefault();const fd=new FormData(form);const permissions={};if(form.dataset.permissionMode!=="default")form.querySelectorAll("[data-module]").forEach((row)=>{permissions[row.dataset.module]={view:row.querySelector('[data-perm="view"]').checked,edit:row.querySelector('[data-perm="edit"]').checked};});const submit=form.querySelector('button[type="submit"]');const role=roleByCode(roleSelect.value);const locationCode=locationSelect.value;if(!accountLocationChoices(role).some((choice)=>choice.code===locationCode)){form.querySelector('[data-form-error]').textContent="Hãy chọn địa điểm hợp lệ cho Role này trước khi lưu.";return;}submit.disabled=true;try{await api("/api/admin/users",{method:"POST",body:{action:user?"update":"create",id:user?.id,username:String(fd.get("username")||""),display_name:String(fd.get("display_name")||""),role:String(fd.get("role")||"employee"),location:locationCode,preferred_language:String(fd.get("preferred_language")||"vi"),password:String(fd.get("password")||""),active:fd.has("active"),permissions}});host.remove();state.success="Đã lưu user và quyền vào PostgreSQL.";await loadCore();render();}catch(error){host.querySelector("[data-form-error]").textContent=errorText(error)==="INVALID_LOCATION"?"Địa điểm không hợp lệ hoặc đã ngừng hoạt động. Chọn lại rồi lưu.":errorText(error);submit.disabled=false;}});
}

function fieldControl(name,label,type,value,locked=false) {
  const lockNote=locked?`<small>Identity field · không đổi sau khi tạo</small>`:"";
  if(type==="site")return `<label><span>${esc(label)}</span><select name="${esc(name)}" ${locked?"disabled":""}><option value="">Toàn hệ thống / —</option>${state.sites.map((s)=>`<option value="${esc(s.code)}" ${value===s.code?"selected":""}>${esc(siteName(s.code))}</option>`).join("")}</select>${lockNote}</label>`;
  if(type==="announcement-status")return `<label><span>${esc(label)}</span><select name="${esc(name)}" ${locked?"disabled":""}>${["draft","published","archived"].map((v)=>`<option value="${v}" ${value===v?"selected":""}>${v}</option>`).join("")}</select>${lockNote}</label>`;
  if(type==="asset-type")return `<label><span>${esc(label)}</span><select name="${esc(name)}" ${locked?"disabled":""}>${["image","document","other"].map((v)=>`<option value="${v}" ${value===v?"selected":""}>${v}</option>`).join("")}</select>${lockNote}</label>`;
  if(type==="boolean")return `<label class="sa-check"><input type="checkbox" name="${esc(name)}" ${value!==false?"checked":""} ${locked?"disabled":""}><span>${esc(label)}</span>${lockNote}</label>`;
  if(type==="textarea"||type==="json")return `<label class="wide"><span>${esc(label)}</span><textarea name="${esc(name)}" rows="${type==="json"?5:4}" ${locked?"readonly":""}>${esc(type==="json"?json(value||{}):(value||""))}</textarea>${lockNote}</label>`;
  const val=type==="datetime"&&value?new Date(value).toISOString().slice(0,16):(value??"");return `<label><span>${esc(label)}</span><input name="${esc(name)}" type="${type==="datetime"?"datetime-local":type}" value="${esc(val)}" ${locked?"readonly":""}>${lockNote}</label>`;
}
function openDataEditor(row=null) {
  if(!row && state.data.result?.allowCreate===false)return;
  const meta=DATASET_META[state.data.name]; const createOnly=new Set(state.data.result?.createOnly||[]);
  const host=modal(`${row?"Sửa":"Thêm"} · ${meta.label}`,`<form data-data-form><div class="sa-form-grid">${meta.fields.map(([name,label,type])=>fieldControl(name,label,type,row?.[name]??(name==="currency_code"?"TWD":undefined),Boolean(row&&createOnly.has(name)))).join("")}</div><p class="sa-form-error" data-form-error></p><div class="sa-modal-actions"><button class="sa-btn" type="button" data-modal-close>Hủy</button><button class="sa-btn primary" type="submit">Lưu Database</button></div></form>`); const form=host.querySelector("[data-data-form]");
  form.addEventListener("submit",async(event)=>{event.preventDefault();const fd=new FormData(form);const values={};try{for(const [name,,type] of meta.fields){if(row&&createOnly.has(name))continue;if(type==="boolean")values[name]=form.elements[name].checked;else if(type==="number")values[name]=fd.get(name)===""?null:Number(fd.get(name));else if(type==="json")values[name]=JSON.parse(String(fd.get(name)||"{}"));else if(type==="datetime")values[name]=fd.get(name)?new Date(String(fd.get(name))).toISOString():null;else values[name]=String(fd.get(name)||"");}await api(`/api/admin/super/data/${encodeURIComponent(state.data.name)}`,{method:"POST",body:{action:"save",id:row?.id,expectedRevision:row?.row_revision||"",values}});host.remove();state.success="Đã lưu dữ liệu.";await Promise.all([loadDataset(),loadCore()]);}catch(error){host.querySelector("[data-form-error]").textContent=errorText(error)==="ADMIN_ROW_STALE"?"Dữ liệu đã được thay đổi ở phiên khác. Hãy đóng form, tải lại rồi sửa trên bản mới nhất.":errorText(error);}});
}
function openSiteEditor(site=null) {
  const host=modal(site?"Cấu hình chi nhánh":"Thêm chi nhánh",`<form data-site-form><div class="sa-form-grid"><label><span>Code</span><input required name="code" pattern="[a-z][a-z0-9._-]{1,39}" value="${esc(site?.code||"")}" ${site?"readonly":""}></label><label><span>Sort order</span><input type="number" name="sort_order" value="${esc(site?.sort_order??0)}"></label><label><span>Tên VI</span><input required name="name_vi" value="${esc(site?.name_vi||"")}"></label><label><span>中文名稱</span><input required name="name_zh_tw" value="${esc(site?.name_zh_tw||"")}"></label><label><span>Timezone</span><input name="timezone_name" value="${esc(site?.timezone_name||"Asia/Taipei")}"></label><label><span>Currency</span><input name="currency_code" maxlength="3" value="${esc(site?.currency_code||"TWD")}"></label><label class="sa-check wide"><input type="checkbox" name="active" ${site?.active!==false?"checked":""}><span>Active</span></label><label class="wide"><span>Metadata JSON</span><textarea name="metadata" rows="5">${esc(json(site?.metadata||{}))}</textarea></label></div><p class="sa-form-error" data-form-error></p><div class="sa-modal-actions"><button class="sa-btn" type="button" data-modal-close>Hủy</button><button class="sa-btn primary" type="submit">Lưu</button></div></form>`);const form=host.querySelector("[data-site-form]");form.addEventListener("submit",async(event)=>{event.preventDefault();const fd=new FormData(form);try{await api("/api/admin/super/sites",{method:"POST",body:{code:String(fd.get("code")||""),name_vi:String(fd.get("name_vi")||""),name_zh_tw:String(fd.get("name_zh_tw")||""),timezone_name:String(fd.get("timezone_name")||"Asia/Taipei"),currency_code:String(fd.get("currency_code")||"TWD"),sort_order:Number(fd.get("sort_order")||0),active:fd.has("active"),metadata:JSON.parse(String(fd.get("metadata")||"{}"))}});host.remove();state.success="Đã lưu chi nhánh.";await loadCore();render();}catch(error){host.querySelector("[data-form-error]").textContent=errorText(error);}});
}
function openSettingEditor(row=null) {
  const host=modal(row?"Sửa setting":"Thêm setting",`<form data-setting-form><div class="sa-form-grid"><label class="wide"><span>Setting key</span><input required name="setting_key" pattern="[a-z][a-z0-9._-]{1,95}" value="${esc(row?.setting_key||"")}" ${row?"readonly":""}></label><label class="wide"><span>JSON value (chuỗi có thể nhập trực tiếp)</span><textarea name="value" rows="6">${esc(typeof row?.value==="string"?row.value:json(row?.value??""))}</textarea></label></div><p class="sa-form-error" data-form-error></p><div class="sa-modal-actions"><button class="sa-btn" type="button" data-modal-close>Hủy</button><button class="sa-btn primary" type="submit">Lưu</button></div></form>`);const form=host.querySelector("[data-setting-form]");form.addEventListener("submit",async(event)=>{event.preventDefault();const fd=new FormData(form);let value=String(fd.get("value")||"");try{try{value=JSON.parse(value);}catch{}await api("/api/admin/super/settings",{method:"POST",body:{setting_key:String(fd.get("setting_key")||""),value}});host.remove();state.success="Đã lưu setting.";await loadCore();render();}catch(error){host.querySelector("[data-form-error]").textContent=errorText(error);}});
}

async function switchSection(section) {
  if(!SECTIONS.includes(section))return;
  state.section=section;
  if(location.hash.replace(/^#/,"")!==section)location.hash=section;
  state.error="";
  state.success="";
  const loadSeq=++sectionLoadSeq;
  render();
  // The dedicated inventory workspace owns its scoped reads; do not remount it
  // after another unrelated eight-request core refresh.
  if(section==="data"&&state.data.name==="inventory-products"&&state.sites.length)return;
  try {
    await loadCore();
    if(loadSeq!==sectionLoadSeq)return;
    if(section==="data")await loadDataset();
    else if(section==="logs")await loadAudit();
    if(loadSeq===sectionLoadSeq)render();
  } catch(error) {
    if(loadSeq!==sectionLoadSeq)return;
    state.error=errorText(error);
    render();
  }
}
function bind() {
  const inventoryHost=root.querySelector("[data-inventory-database]");
  if(inventoryHost)inventoryDatabase.mount(inventoryHost,{sites:state.sites,me:state.me});
  root.querySelectorAll("[data-section]").forEach((button)=>button.addEventListener("click",()=>void switchSection(button.dataset.section)));
  root.querySelector("[data-refresh]")?.addEventListener("click",()=>void refreshCurrent()); root.querySelector("[data-toggle-nav]")?.addEventListener("click",()=>root.classList.toggle("nav-open"));
  root.querySelector("[data-copy-handoff]")?.addEventListener("click",async(event)=>{const button=event.currentTarget;const url=String(button.dataset.handoffUrl||"");if(!url)return;try{await navigator.clipboard.writeText(url);button.textContent="Đã copy ✓";}catch{window.prompt("Copy handoff link:",url);}});
  root.querySelector("[data-user-new]")?.addEventListener("click",()=>openUserEditor()); root.querySelectorAll("[data-user-edit]").forEach((b)=>b.addEventListener("click",()=>openUserEditor(state.users.find((u)=>u.id===b.dataset.userEdit))));
  root.querySelectorAll("[data-user-delete]").forEach((b)=>b.addEventListener("click",async()=>{if(!confirm("Archive user này?"))return;try{await api(`/api/admin/users/${encodeURIComponent(b.dataset.userDelete)}`,{method:"DELETE"});state.success="Đã archive user.";await loadCore();render();}catch(error){flash("error",errorText(error));}}));
  root.querySelectorAll("[data-open-dataset]").forEach((b)=>b.addEventListener("click",async()=>{state.data.name=b.dataset.openDataset;state.data.page=1;state.data.result=null;await switchSection("data");await loadDataset();if(b.hasAttribute("data-new-row"))openDataEditor();}));
  root.querySelectorAll("[data-sop-review]").forEach((b)=>b.addEventListener("click",async()=>{if(!confirm(b.dataset.decision==="approved"?"Duyệt version SOP này?":"Từ chối version SOP này?"))return;try{await api(`/api/admin/super/sop-versions/${encodeURIComponent(b.dataset.sopReview)}/review`,{method:"POST",body:{decision:b.dataset.decision}});state.success="Đã cập nhật SOP.";await loadCore();render();}catch(error){flash("error",errorText(error));}}));
  root.querySelectorAll("[data-dataset]").forEach((b)=>b.addEventListener("click",async()=>{state.data.name=b.dataset.dataset;state.data.page=1;state.data.q="";state.data.site="";state.data.status="";state.data.sort="";state.data.result=null;if(state.data.name==="inventory-products")render();else await loadDataset();}));
  root.querySelector("[data-data-filter]")?.addEventListener("submit",async(event)=>{event.preventDefault();const fd=new FormData(event.currentTarget);state.data.q=String(fd.get("q")||"");state.data.site=String(fd.get("site")||"");state.data.status=String(fd.get("status")||"");state.data.page=1;await loadDataset();});
  root.querySelectorAll("[data-sort]").forEach((b)=>b.addEventListener("click",async()=>{state.data.direction=state.data.sort===b.dataset.sort&&state.data.direction==="asc"?"desc":"asc";state.data.sort=b.dataset.sort;await loadDataset();}));
  root.querySelectorAll("[data-page]").forEach((b)=>b.addEventListener("click",async()=>{state.data.page=Number(b.dataset.page)||1;await loadDataset();}));
  root.querySelector("[data-data-new]")?.addEventListener("click",()=>openDataEditor()); root.querySelectorAll("[data-data-edit]").forEach((b)=>b.addEventListener("click",()=>openDataEditor(state.data.result?.rows?.find((r)=>String(r.id)===b.dataset.dataEdit))));
  root.querySelectorAll("[data-data-archive]").forEach((b)=>b.addEventListener("click",async()=>{if(!confirm("Xác nhận archive/ngừng dùng bản ghi này?"))return;const row=state.data.result?.rows?.find((item)=>String(item.id)===b.dataset.dataArchive);try{await api(`/api/admin/super/data/${encodeURIComponent(state.data.name)}`,{method:"POST",body:{action:"archive",id:b.dataset.dataArchive,expectedRevision:row?.row_revision||""}});state.success="Đã cập nhật trạng thái bản ghi.";await Promise.all([loadDataset(),loadCore()]);}catch(error){flash("error",errorText(error));}}));
  root.querySelector("[data-site-new]")?.addEventListener("click",()=>openSiteEditor()); root.querySelectorAll("[data-site-edit]").forEach((b)=>b.addEventListener("click",()=>openSiteEditor(state.sites.find((s)=>s.code===b.dataset.siteEdit))));
  root.querySelector("[data-menu-sync]")?.addEventListener("submit",async(event)=>{event.preventDefault();const fd=new FormData(event.currentTarget);const source=String(fd.get("source")||"");const destination=String(fd.get("destination")||"");if(source===destination){flash("error","Site nguồn và site đích phải khác nhau.");return;}try{const result=await api("/api/admin/super/menu-sync",{method:"POST",body:{source,destination,overwritePrices:fd.has("overwritePrices")}});state.success=`Đã đồng bộ ${result.count||0} menu items.`;await loadCore();render();}catch(error){flash("error",errorText(error));}});
  root.querySelector("[data-setting-new]")?.addEventListener("click",()=>openSettingEditor()); root.querySelectorAll("[data-setting-edit]").forEach((b)=>b.addEventListener("click",()=>openSettingEditor(state.settings.find((s)=>s.setting_key===b.dataset.settingEdit))));
  root.querySelector("[data-audit-filter]")?.addEventListener("submit",async(event)=>{event.preventDefault();const fd=new FormData(event.currentTarget);for(const key of ["q","site","action","actor"])state.audit[key]=String(fd.get(key)||"");state.audit.page=1;await loadAudit();});
  root.querySelectorAll("[data-audit-page]").forEach((b)=>b.addEventListener("click",async()=>{state.audit.page=Number(b.dataset.auditPage)||1;await loadAudit();}));
  root.querySelectorAll("[data-export]").forEach((b)=>b.addEventListener("click",()=>{const params=auditParams(b.dataset.export);window.location.href=`/api/admin/super/audit/export?${params}`;}));
}

async function boot() {
  state.section=currentSection();
  try { const me=await vpsMe(); state.me=me?.user||null; }
  catch(error){state.error=errorText(error);state.loading=false;render();return;}
  state.loading=false; if(!isSuperAdmin()){render();return;}
  try { await loadCore(); if(state.section==="data")await loadDataset(); if(state.section==="logs")await loadAudit(); }
  catch(error){state.error=errorText(error);} render();
}
window.addEventListener("hashchange",()=>{const section=currentSection();if(section!==state.section)void switchSection(section);});
void boot();
