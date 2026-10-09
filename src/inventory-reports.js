import { apiRequest } from "./vps-api.js";
import {
  ingredientNameSearchMatches,
  prepareIngredientNameSearchCorpus,
  prepareIngredientNameSearchNeedle,
} from "./search-utils.js";

const state = {
  host:null,
  language:"vi",
  canExport:true,
  sites:[],
  site:"",
  area:"all",
  category:"all",
  search:"",
  selected:new Set(),
  inventory:null,
  master:null,
  loading:false,
  error:"",
  loadedAt:null,
};

function esc(value){
  return String(value ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}

function t(vi,zh){ return state.language === "zh" ? zh : vi; }

function siteName(site){
  if(!site) return "";
  return state.language === "zh"
    ? (site.name_zh_tw || site.name_vi || site.code)
    : (site.name_vi || site.name_zh_tw || site.code);
}

function categoryName(code){
  const row=(state.inventory?.categories || []).find((entry)=>String(entry.code)===String(code));
  if(!row) return code || t("Chưa phân loại","未分類");
  return state.language === "zh"
    ? (row.name_zh_tw || row.name_vi || row.code)
    : (row.name_vi || row.name_zh_tw || row.code);
}

function areaName(code){
  const row=(state.master?.workAreas || []).find((entry)=>String(entry.code)===String(code));
  if(!row) return code || t("Không gán khu vực","未指定區域");
  return state.language === "zh"
    ? (row.name_zh_tw || row.name_vi || row.code)
    : (row.name_vi || row.name_zh_tw || row.code);
}

function unitName(item){
  const code=String(item?.unit_code || "");
  const row=(state.inventory?.units || []).find((entry)=>String(entry.code)===code);
  return String(row?.symbol || item?.unit || code || "—");
}

function statusOf(quantity,minimum){
  const qty=Number(quantity)||0;
  const min=Number(minimum)||0;
  if(qty<=0) return "empty";
  if(min>0 && qty<=min) return "low";
  return "ok";
}

function statusLabel(status){
  if(status==="empty") return t("Hết hàng","缺貨");
  if(status==="low") return t("Sắp hết","低庫存");
  return t("Còn hàng","庫存正常");
}

function locationName(location){
  if(!location) return "";
  return state.language === "zh"
    ? (location.name_zh_tw || location.name_vi || location.code)
    : (location.name_vi || location.name_zh_tw || location.code);
}

function buildRows(){
  const inventory=state.inventory;
  if(!inventory) return [];
  const locations=new Map((inventory.locations||[]).map((row)=>[String(row.id),row]));
  const stockByItem=new Map();
  for(const stock of inventory.stock||[]){
    const key=String(stock.item_id||"");
    if(!stockByItem.has(key)) stockByItem.set(key,[]);
    stockByItem.get(key).push(stock);
  }

  return (inventory.items||[]).filter((item)=>item.active!==false).map((item)=>{
    const stocks=(stockByItem.get(String(item.id))||[]).filter((entry)=>entry.configured!==false);
    const quantity=stocks.reduce((sum,row)=>sum+(Number(row.quantity)||0),0);
    const minimum=stocks.reduce((sum,row)=>sum+(row.minimum_enabled===false?0:(Number(row.minimum_quantity)||0)),0);
    const locationLabels=stocks
      .filter((row)=>Number(row.quantity)!==0 || Number(row.minimum_quantity)!==0 || row.is_primary)
      .map((row)=>locationName(locations.get(String(row.location_id))))
      .filter(Boolean);
    return {
      id:String(item.id),
      zh:String(item.name_zh_tw||""),
      vi:String(item.name_vi||""),
      unit:unitName(item),
      category:String(item.category_code||""),
      workArea:String(item.work_area||""),
      quantity,
      minimum,
      status:statusOf(quantity,minimum),
      locations:[...new Set(locationLabels)],
      searchCorpus:prepareIngredientNameSearchCorpus(item.name_zh_tw,item.name_vi),
      updatedAt:item.updated_at || null,
    };
  });
}

function visibleRows(){
  const needle=prepareIngredientNameSearchNeedle(state.search);
  return buildRows().filter((row)=>{
    if(state.area!=="all" && row.workArea!==state.area) return false;
    if(state.category!=="all" && row.category!==state.category) return false;
    return !needle || ingredientNameSearchMatches(row.searchCorpus,needle);
  });
}

function selectedRows(){
  return visibleRows().filter((row)=>state.selected.has(row.id));
}

function reportText(){
  const rows=selectedRows();
  const site=state.sites.find((entry)=>entry.code===state.site);
  const now=state.loadedAt ? new Date(state.loadedAt) : new Date();
  const stamp=new Intl.DateTimeFormat(state.language==="zh"?"zh-TW":"vi-VN",{
    year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false,
  }).format(now);
  const lines=[
    t("【BÁO CÁO TỒN KHO / 庫存報表】","【庫存報表 / BÁO CÁO TỒN KHO】"),
    `${t("Chi nhánh","據點")}: ${siteName(site)}`,
    `${t("Cập nhật","更新")}: ${stamp}`,
    `${t("Nguồn dữ liệu","資料來源")}: PostgreSQL / Super Admin`,
    `${t("Sản phẩm đã chọn","已選品項")}: ${rows.length}`,
    "",
  ];
  rows.forEach((row,index)=>{
    const name=row.vi && row.zh ? `${row.vi} / ${row.zh}` : (row.vi||row.zh);
    const loc=row.locations.length ? row.locations.join(", ") : "—";
    lines.push(`${index+1}. ${name} - ${row.quantity} ${row.unit} - ${statusLabel(row.status)} - ${loc}`);
  });
  if(!rows.length) lines.push(t("(Chưa chọn sản phẩm)","（尚未選擇品項）"));
  return lines.join("\n");
}

function download(name,type,content){
  const blob=new Blob([content],{type});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement("a");
  anchor.href=url;
  anchor.download=name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function downloadTxt(){
  download(`inventory-report-${state.site||"site"}.txt`,"text/plain;charset=utf-8",reportText());
}

function csvCell(value){
  const text=String(value??"");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"','""')}"` : text;
}

function downloadCsv(){
  const rows=selectedRows();
  const header=["name_vi","name_zh_tw","category","work_area","unit","quantity","minimum","status","locations"];
  const body=rows.map((row)=>[
    row.vi,row.zh,categoryName(row.category),areaName(row.workArea),row.unit,row.quantity,row.minimum,statusLabel(row.status),row.locations.join(" | "),
  ]);
  const csv="\ufeff"+[header,...body].map((line)=>line.map(csvCell).join(",")).join("\r\n");
  download(`inventory-report-${state.site||"site"}.csv`,"text/csv;charset=utf-8",csv);
}

async function copyText(){
  const text=reportText();
  try{
    await navigator.clipboard.writeText(text);
  }catch{
    const area=document.createElement("textarea");
    area.value=text;
    area.style.position="fixed";
    area.style.opacity="0";
    document.body.append(area);
    area.select();
    document.execCommand?.("copy");
    area.remove();
  }
  window.shituNotify?.({
    type:"success",
    title:t("Đã copy báo cáo","報表已複製"),
    body:t("Có thể dán trực tiếp vào tin nhắn nhóm.","可直接貼到群組訊息。"),
  });
}

function printPdf(){
  const host=state.host;
  const selected=state.selected;
  const rows=[...(host?.querySelectorAll("[data-report-row]") || [])];
  rows.forEach((row)=>row.toggleAttribute(
    "data-report-print-hidden",
    !selected.has(String(row.dataset.reportRow || ""))
  ));
  document.body.classList.add("inventory-report-printing");
  const cleanup=()=>{
    document.body.classList.remove("inventory-report-printing");
    rows.forEach((row)=>row.removeAttribute("data-report-print-hidden"));
  };
  window.addEventListener("afterprint",cleanup,{once:true});
  window.print?.();
  window.setTimeout(cleanup,1500);
}

function summary(rows){
  return rows.reduce((acc,row)=>{
    acc[row.status]=(acc[row.status]||0)+1;
    return acc;
  },{ok:0,low:0,empty:0});
}

function renderLoading(){
  if(!state.host) return;
  state.host.innerHTML=`<div class="inventory-report-loading"><span class="inventory-report-spinner"></span><strong>${esc(t("Đang tải báo cáo trực tiếp từ PostgreSQL…","正在從 PostgreSQL 載入庫存報表…"))}</strong></div>`;
}

function renderError(){
  if(!state.host) return;
  state.host.innerHTML=`<section class="card inventory-report-error"><strong>${esc(t("Không thể tải báo cáo tồn kho","無法載入庫存報表"))}</strong><p>${esc(state.error||"UNKNOWN_ERROR")}</p><button type="button" class="primary-button" data-report-action="retry">${esc(t("Thử lại","重試"))}</button></section>`;
}

function render(){
  const host=state.host;
  if(!host) return;
  if(state.loading){ renderLoading(); return; }
  if(state.error){ renderError(); return; }
  if(!state.inventory){ renderLoading(); return; }

  const rows=visibleRows();
  const selected=selectedRows();
  const stats=summary(rows);
  const categories=(state.inventory.categories||[]).filter((entry)=>entry.active!==false);
  const areas=(state.master?.workAreas||[]).filter((entry)=>entry.active!==false);
  const allVisibleSelected=rows.length>0 && rows.every((row)=>state.selected.has(row.id));
  const canExport=state.canExport;

  const siteOptions=state.sites.map((site)=>`<option value="${esc(site.code)}" ${site.code===state.site?"selected":""}>${esc(siteName(site))}</option>`).join("");
  const areaOptions=areas.map((area)=>`<option value="${esc(area.code)}" ${area.code===state.area?"selected":""}>${esc(areaName(area.code))}</option>`).join("");
  const categoryOptions=categories.map((category)=>`<option value="${esc(category.code)}" ${category.code===state.category?"selected":""}>${esc(categoryName(category.code))}</option>`).join("");

  const tableRows=rows.map((row,index)=>{
    const checked=state.selected.has(row.id);
    const primaryName=state.language==="zh" ? (row.zh||row.vi) : (row.vi||row.zh);
    const secondaryName=state.language==="zh" ? row.vi : row.zh;
    return `<tr data-report-row="${esc(row.id)}">
      <td class="report-check-cell"><input type="checkbox" data-report-select="${esc(row.id)}" ${checked?"checked":""} aria-label="${esc(primaryName)}"></td>
      <td class="report-index-cell">${index+1}</td>
      <td class="report-product-cell"><strong>${esc(primaryName)}</strong><small>${esc(secondaryName||"")}</small></td>
      <td data-label="${esc(t("Danh mục","類別"))}">${esc(categoryName(row.category))}</td>
      <td data-label="${esc(t("Khu vực","區域"))}">${esc(areaName(row.workArea))}</td>
      <td data-label="${esc(t("Đơn vị","單位"))}">${esc(row.unit)}</td>
      <td data-label="${esc(t("Tồn hiện tại","現有庫存"))}"><strong>${esc(row.quantity)}</strong></td>
      <td data-label="${esc(t("Tồn tối thiểu","最低庫存"))}">${esc(row.minimum)}</td>
      <td data-label="${esc(t("Trạng thái","狀態"))}"><span class="report-status status-${row.status}">${esc(statusLabel(row.status))}</span></td>
      <td data-label="${esc(t("Vị trí","儲位"))}">${esc(row.locations.join(", ")||"—")}</td>
    </tr>`;
  }).join("");

  const preview=reportText();

  host.innerHTML=`
    <div class="inventory-report-shell">
      <section class="inventory-report-filter-card">
        <div class="inventory-report-filter-grid">
          <label><span>${esc(t("Chi nhánh","據點"))}</span><select data-report-field="site">${siteOptions}</select></label>
          <label><span>${esc(t("Khu vực làm việc","工作區"))}</span><select data-report-field="area"><option value="all">${esc(t("Tất cả khu vực","全部工作區"))}</option>${areaOptions}</select></label>
          <label><span>${esc(t("Danh mục","類別"))}</span><select data-report-field="category"><option value="all">${esc(t("Tất cả danh mục","全部類別"))}</option>${categoryOptions}</select></label>
          <label class="inventory-report-search"><span>${esc(t("Sản phẩm","產品"))}</span><div><span>⌕</span><input type="search" data-report-field="search" value="${esc(state.search)}" placeholder="${esc(t("Tìm đúng tên sản phẩm…","依產品名稱搜尋…"))}" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false"></div></label>
        </div>
        <div class="inventory-report-source"><span class="source-dot"></span><strong>PostgreSQL</strong><span>${esc(t("Dữ liệu trực tiếp; thay đổi từ Super Admin được phản ánh khi làm mới.","即時資料；Super Admin 變更會在重新整理後反映。"))}</span><button type="button" data-report-action="refresh">↻ ${esc(t("Làm mới","重新整理"))}</button></div>
      </section>

      <section class="inventory-report-stats">
        <article><small>${esc(t("Tổng sản phẩm","品項總數"))}</small><strong>${rows.length}</strong></article>
        <article class="stat-ok"><small>${esc(t("Còn hàng","庫存正常"))}</small><strong>${stats.ok}</strong></article>
        <article class="stat-low"><small>${esc(t("Sắp hết","低庫存"))}</small><strong>${stats.low}</strong></article>
        <article class="stat-empty"><small>${esc(t("Hết hàng","缺貨"))}</small><strong>${stats.empty}</strong></article>
      </section>

      <section class="inventory-report-workspace">
        <div class="inventory-report-table-card">
          <div class="inventory-report-actions">
            <button type="button" class="${allVisibleSelected?"active":""}" data-report-action="select-all">✓ ${esc(t("Chọn tất cả","全選"))}</button>
            <button type="button" data-report-action="clear-selection">${esc(t("Bỏ chọn tất cả","全部取消"))}</button>
            <span>${esc(t("Đã chọn","已選"))}: <strong>${selected.length}</strong> / ${rows.length}</span>
            <div class="report-export-inline">
              <button type="button" data-report-action="txt" ${canExport?"":"disabled"}>TXT</button>
              <button type="button" data-report-action="pdf" ${canExport?"":"disabled"}>PDF</button>
              <button type="button" data-report-action="csv" ${canExport?"":"disabled"}>CSV / Excel</button>
              <button type="button" class="copy-action" data-report-action="copy" ${canExport?"":"disabled"}>▣ ${esc(t("Copy dữ liệu","複製資料"))}</button>
            </div>
          </div>
          <div class="inventory-report-table-wrap">
            <table class="inventory-report-table">
              <thead><tr>
                <th><input type="checkbox" data-report-action="toggle-all" ${allVisibleSelected?"checked":""}></th>
                <th>STT</th>
                <th>${esc(t("Sản phẩm","產品名稱"))}</th>
                <th>${esc(t("Danh mục","類別"))}</th>
                <th>${esc(t("Khu vực","區域"))}</th>
                <th>${esc(t("Đơn vị","單位"))}</th>
                <th>${esc(t("Tồn hiện tại","現有庫存"))}</th>
                <th>${esc(t("Tồn tối thiểu","最低庫存"))}</th>
                <th>${esc(t("Trạng thái","狀態"))}</th>
                <th>${esc(t("Vị trí","儲位"))}</th>
              </tr></thead>
              <tbody>${tableRows || `<tr><td colspan="10" class="inventory-report-empty">${esc(t("Không có sản phẩm khớp tên đã nhập.","沒有符合輸入名稱的品項。"))}</td></tr>`}</tbody>
            </table>
          </div>
          <div class="inventory-report-mobile-export">
            <button type="button" data-report-action="txt" ${canExport?"":"disabled"}>TXT</button>
            <button type="button" data-report-action="pdf" ${canExport?"":"disabled"}>PDF</button>
            <button type="button" data-report-action="csv" ${canExport?"":"disabled"}>CSV</button>
            <button type="button" class="copy-action" data-report-action="copy" ${canExport?"":"disabled"}>▣ ${esc(t("Copy nội dung","複製文字"))}</button>
          </div>
        </div>

        <aside class="inventory-report-preview">
          <div class="preview-heading"><div><strong>${esc(t("Xem trước nội dung","內容預覽"))}</strong><small>${esc(t("Dùng để gửi nhóm hoặc xuất file","可用於群組訊息或匯出檔案"))}</small></div><span>${selected.length}</span></div>
          <pre>${esc(preview)}</pre>
          <button type="button" class="copy-preview" data-report-action="copy" ${canExport?"":"disabled"}>▣ ${esc(t("Sao chép toàn bộ văn bản","複製全部文字"))}</button>
        </aside>
      </section>
    </div>`;

  bind();
}

function bind(){
  const host=state.host;
  if(!host) return;
  host.querySelectorAll("[data-report-field]").forEach((control)=>{
    const eventName=control.dataset.reportField==="search" ? "input" : "change";
    control.addEventListener(eventName,async(event)=>{
      const field=event.currentTarget.dataset.reportField;
      const value=event.currentTarget.value;
      if(field==="site"){
        state.site=value;
        state.area="all";
        state.category="all";
        state.search="";
        state.selected=new Set();
        await loadSite();
        return;
      }
      state[field]=value;
      render();
    });
  });
  host.querySelectorAll("[data-report-select]").forEach((checkbox)=>{
    checkbox.addEventListener("change",(event)=>{
      const id=event.currentTarget.dataset.reportSelect;
      if(event.currentTarget.checked) state.selected.add(id);
      else state.selected.delete(id);
      render();
    });
  });
  host.querySelectorAll("[data-report-action]").forEach((button)=>{
    button.addEventListener("click",async(event)=>{
      const action=event.currentTarget.dataset.reportAction;
      if(action==="retry"||action==="refresh"){ await loadSite(true); return; }
      if(action==="select-all"){
        visibleRows().forEach((row)=>state.selected.add(row.id));
        render(); return;
      }
      if(action==="clear-selection"){
        visibleRows().forEach((row)=>state.selected.delete(row.id));
        render(); return;
      }
      if(action==="toggle-all"){
        const rows=visibleRows();
        const shouldSelect=!rows.every((row)=>state.selected.has(row.id));
        rows.forEach((row)=>shouldSelect?state.selected.add(row.id):state.selected.delete(row.id));
        render(); return;
      }
      if(action==="txt"){ downloadTxt(); return; }
      if(action==="csv"){ downloadCsv(); return; }
      if(action==="pdf"){ printPdf(); return; }
      if(action==="copy"){ await copyText(); }
    });
  });
}

async function loadSite(force=false){
  if(!state.host) return;
  state.loading=true;
  state.error="";
  renderLoading();
  try{
    if(!state.sites.length || force){
      const siteData=await apiRequest("/api/inventory/sites");
      state.sites=Array.isArray(siteData?.sites)?siteData.sites:[];
    }
    if(!state.sites.length) throw new Error("NO_VISIBLE_INVENTORY_SITES");

    const saved=String(localStorage.getItem("shitu-admin-active-site-v1")||"");
    if(!state.site || !state.sites.some((entry)=>entry.code===state.site)){
      state.site=state.sites.some((entry)=>entry.code===saved) ? saved : state.sites[0].code;
    }

    const [inventory,master]=await Promise.all([
      apiRequest(`/api/inventory/${encodeURIComponent(state.site)}`),
      apiRequest(`/api/master-data/${encodeURIComponent(state.site)}`),
    ]);
    state.inventory=inventory;
    state.master=master;
    state.loadedAt=Date.now();
    state.error="";
    const ids=new Set((inventory?.items||[]).filter((item)=>item.active!==false).map((item)=>String(item.id)));
    if(!state.selected.size) state.selected=new Set(ids);
    else state.selected=new Set([...state.selected].filter((id)=>ids.has(id)));
  }catch(error){
    state.error=String(error?.code||error?.message||error||"REPORT_LOAD_FAILED");
  }finally{
    state.loading=false;
    render();
  }
}

export async function mountInventoryReport(host,{language="vi"}={}){
  if(!host) return;
  state.host=host;
  state.language=language==="zh"?"zh":"vi";
  state.canExport=host.dataset.reportExport!=="0";
  renderLoading();
  await loadSite();
}
