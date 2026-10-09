import { apiRequest, vpsInventory } from "./vps-api.js";
import { ingredientNameSearchMatches,prepareIngredientNameSearchCorpus,prepareIngredientNameSearchNeedle } from "./search-utils.js";
import { addCalendarDays, planProcurementLine } from "./procurement-planner.js";
import { procurementAddClosedDates, procurementCalendarMonth, procurementMonthCells, procurementMoveMonth, validProcurementDate } from "./procurement-calendar-picker.js";

const ui={ site:"",data:null,inventory:null,loading:false,error:"",tab:"list",supplier:"all",category:"all",
 search:"",date:"",selected:new Set(),overrides:new Map(),editingSupplier:null,editingItem:null,pending:false,notice:"",
 requestKeys:new Map(),loadVersion:0,lastSyncedAt:0,supplierDraft:null,supplierClosedDates:[],calendarMonth:"",calendarAnchor:null,calendarError:"",rangeStart:"",rangeEnd:"",ruleDraft:null };
const html=(value)=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const num=(v)=>Number(v||0).toLocaleString("en-US",{maximumFractionDigits:3});
const errorLabel=(error)=>error?.code||error?.message||String(error||"UNKNOWN_ERROR");
const identifier=()=>globalThis.crypto?.randomUUID?.()||"00000000-0000-4000-8000-"+Math.random().toString(16).slice(2).padEnd(12,"0").slice(0,12);
const guard=(site)=>ui.site===site;
const canEdit=(ctx)=>ctx.editable===true;
const icon=(id)=>({supplier:"🏭",group:"▦",list:"☷",history:"◷",settings:"⚙"}[id]||"•");
function nameOf(item,language){return language==="zh" ? item.name_zh_tw||item.name_vi : item.name_vi||item.name_zh_tw;}
function suppliers(){return (ui.data?.suppliers||[]).filter(x=>x.active);}
function items(){return (ui.inventory?.items||[]).filter(x=>x.active!==false);}
function ruleFor(itemId){return ui.data?.rules?.find(x=>x.itemId===itemId)||null;}
function supplierFor(id){return suppliers().find(x=>x.id===id);}
// Match the Inventory Report authority: only configured physical stock locations count.
function stockRowsFor(itemId){return (ui.inventory?.stock||[]).filter(x=>x.item_id===itemId&&x.configured!==false);}
function stockFor(itemId){return stockRowsFor(itemId).reduce((total,row)=>total+Number(row.quantity||0),0);}
function procurementInventoryDetail(item,lang){
 const stocks=stockRowsFor(item.id), locations=new Map((ui.inventory?.locations||[]).map(row=>[String(row.id),row]));
 const minimum=stocks.reduce((sum,row)=>sum+(row.minimum_enabled===false?0:Number(row.minimum_quantity||0)),0);
 const group=(ui.inventory?.categories||[]).find(x=>x.code===item.category_code);
 const receive=(ui.inventory?.receiveDefaults||[]).find(x=>x.site===ui.site&&x.catalog_key===item.catalog_key);
 const receivingLocation=receive?locations.get(String(receive.location_id)):null;
 return `<div class="pv2-db-reference"><h4>庫存資料庫 / Dữ liệu trực tiếp từ kho</h4>
  <div class="pv2-db-fields"><div><small>目前總庫存 / Tổng tồn</small><strong>${num(stockFor(item.id))} ${html(item.unit||"")}</strong></div>
  <div><small>庫存最低量 / Tồn tối thiểu</small><strong>${num(minimum)} ${html(item.unit||"")}</strong></div>
  <div><small>分類 / Nhóm</small><strong>${html((lang==="zh"?group?.name_zh_tw:group?.name_vi)||item.category_code||"—")}</strong></div>
  <div><small>預設收貨位置 / Vị trí nhập mặc định</small><strong>${html((lang==="zh"?receivingLocation?.name_zh_tw:receivingLocation?.name_vi)||"—")}</strong></div></div>
  <div class="pv2-db-locations">${stocks.map(row=>{
    const place=locations.get(String(row.location_id));
    return `<span>${html((lang==="zh"?place?.name_zh_tw:place?.name_vi)||place?.code||"—")}: <strong>${num(row.quantity)} ${html(item.unit||"")}</strong></span>`;
  }).join("")||"<small>尚無儲位紀錄 / Chưa có số lượng theo vị trí</small>"}</div>
  <p class="pv2-hint">數量與存放位置讀取現有庫存 API。安全庫存為另外的叫貨設定，不會更改庫存最低量。 Số tồn và vị trí lấy từ API kho; tồn an toàn cho gọi hàng không ghi đè mức tối thiểu của kho.</p>
 </div>`;
}
function incomingFor(itemId){
 return (ui.data?.orders||[]).filter(order=>order.status==="confirmed").flatMap(order=>(order.lines||[]).filter(x=>x.itemId===itemId)
 .map(line=>({expectedArrival:order.expectedArrival,baseQuantity:Number(line.baseQuantity),status:order.status})));
}
function itemMatches(item,query=ui.search){
 const needle=prepareIngredientNameSearchNeedle(query);
 return ingredientNameSearchMatches(prepareIngredientNameSearchCorpus(item.name_zh_tw,item.name_vi),needle);
}
function lines(){
 return items().map(item=>{
   const rule=ruleFor(item.id),supplier=supplierFor(rule?.supplierId),stock=stockFor(item.id);
   const plan=supplier&&rule?planProcurementLine({orderDate:ui.date,stock,rule,supplier,calendar:ui.data.calendar,incoming:incomingFor(item.id)}):null;
   const key=item.id, selected=ui.selected.has(key), override=ui.overrides.get(key);
   return {item,rule,supplier,stock,plan,selected,amount:override===undefined ? plan?.orderUnits||0:override};
 });
}
async function refresh(site,render){
 if(!site||ui.loading)return;
 const version=++ui.loadVersion;
 ui.loading=true;ui.error="";
 try{
  const [data,inventory]=await Promise.all([
    apiRequest("/api/procurement/"+encodeURIComponent(site),{retrySafeRead:true}),
    vpsInventory(site,{force:true})
  ]);
  if(guard(site)&&version===ui.loadVersion){
    ui.data=data;ui.inventory=inventory;ui.error="";ui.lastSyncedAt=Date.now();
  }
 }catch(error){if(guard(site)&&version===ui.loadVersion)ui.error=errorLabel(error);}
 finally{if(guard(site)&&version===ui.loadVersion){ui.loading=false;if(ui.editingSupplier===null&&!ui.editingItem)render();}}
}
function prepare(site,render,date){
 if(ui.site===site)return;
 ui.site=site;ui.data=null;ui.inventory=null;ui.search="";ui.supplier="all";ui.category="all";ui.tab="list";
 ui.selected.clear();ui.overrides.clear();ui.requestKeys.clear();ui.error="";ui.loading=false;ui.editingItem=null;ui.editingSupplier=null;ui.supplierDraft=null;ui.ruleDraft=null;ui.lastSyncedAt=0;
 ui.date=date||new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
 void refresh(site,render);
}
function metric(zh,vi,value){return `<div class="pv2-stat"><span>${html(zh)}<small>${html(vi)}</small></span><strong>${num(value)}</strong></div>`;}
function badge(text,color){return `<span class="pv2-badge pv2-${color}">${html(text)}</span>`;}
function tabs(language){
 const all=[["list","叫貨清單","Danh sách gọi hàng"],["supplier","依供應商","Theo nhà cung cấp"],["group","依產品分類","Theo nhóm sản phẩm"],["history","叫貨紀錄","Lịch sử gọi hàng"],["settings","叫貨設定","Cài đặt gọi hàng"]];
 return `<nav class="pv2-tabs" aria-label="Procurement views">${all.map(([key,zh,vi])=>`<button type="button" class="pv2-tab ${ui.tab===key?"active":""}" data-pv2-action="tab" data-tab="${key}"><strong>${zh}</strong><small>${vi}</small></button>`).join("")}</nav>`;
}
function filterBar(lang){
 const categories=ui.inventory?.categories||[];
 return `<div class="pv2-filters">
  <label class="pv2-search"><span>⌕</span><input type="search" data-pv2-search value="${html(ui.search)}" placeholder="${lang==="zh"?"搜尋產品名稱（中文／越文）":"Tìm đúng tên sản phẩm (Trung / Việt)"}" autocomplete="off" /><button type="button" data-pv2-action="clear-search" aria-label="Clear search">×</button></label>
  <select data-pv2-filter="supplier" aria-label="Supplier"><option value="all">${lang==="zh"?"全部供應商":"Tất cả nhà cung cấp"}</option>${suppliers().map(s=>`<option value="${s.id}" ${ui.supplier===s.id?"selected":""}>${html(s.name_zh_tw)} · ${html(s.name_vi)}</option>`).join("")}<option value="unassigned" ${ui.supplier==="unassigned"?"selected":""}>${lang==="zh"?"未設定供應商":"Chưa gán nhà cung cấp"}</option></select>
  <select data-pv2-filter="category" aria-label="Category"><option value="all">${lang==="zh"?"全部分類":"Tất cả nhóm"}</option>${categories.map(x=>`<option value="${html(x.code)}" ${ui.category===x.code?"selected":""}>${html(lang==="zh"?x.name_zh_tw:x.name_vi)}</option>`).join("")}</select>
  <input type="date" data-pv2-date value="${html(ui.date)}" aria-label="Ngày gọi hàng">
  <span class="pv2-result" data-pv2-results></span>
 </div>`;
}
function productRows(rows,lang,editable){
 if(!rows.length)return `<div class="pv2-empty">${lang==="zh"?"沒有符合條件的產品；請確認資料庫設定。":"Không có sản phẩm phù hợp. Kiểm tra cấu hình Database."}</div>`;
 return `<div class="pv2-table-head"><span></span><span>品名 / Tên sản phẩm</span><span>供應商 / Nhà cung cấp</span><span>平日 / 假日<br>Thường / Lễ</span><span>庫存 / Tồn</span><span>建議 / Đề xuất</span><span>叫貨 / Số gọi</span></div>
 <div class="pv2-product-list">${rows.map(row=>{
 const {item,rule,supplier,stock,plan,selected,amount}=row;
 const ready=Boolean(rule?.enabled&&supplier&&plan?.canOrder);
 const risk=plan?.preArrivalRisk||false;
 const name=nameOf(item,lang),sub=lang==="zh"?item.name_vi:item.name_zh_tw;
 return `<article class="pv2-product" data-pv2-id="${html(item.id)}" data-pv2-category="${html(item.category_code)}" data-pv2-supplier="${html(supplier?.id||"unassigned")}">
 <div class="pv2-cell pv2-select"><input type="checkbox" data-pv2-select="${html(item.id)}" ${selected?"checked":""} ${!ready||!editable?"disabled":""} aria-label="${html(name)}"/></div>
 <div class="pv2-cell pv2-name"><strong>${html(name)}</strong><small>${html(sub)}</small><small>${html(item.unit||"")} · ${html(item.category_code||"")}</small></div>
 <div class="pv2-cell"><span class="pv2-mobile-label">供應商 / NCC</span>${supplier?`<strong>${html(lang==="zh"?supplier.name_zh_tw:supplier.name_vi||supplier.name_zh_tw)}</strong>`:badge(lang==="zh"?"未設定":"Chưa cài đặt","warning")}</div>
 <div class="pv2-cell pv2-use"><span class="pv2-mobile-label">每日用量 / Định mức</span><strong>${rule?num(rule.weekdayDemand):"—"} / ${rule?num(rule.holidayDemand):"—"}</strong><small>${html(item.unit||"")}</small></div>
 <div class="pv2-cell pv2-stock"><span class="pv2-mobile-label">庫存 / Tồn kho</span><strong>${num(stock)}</strong><small>${html(item.unit||"")}</small></div>
 <div class="pv2-cell"><span class="pv2-mobile-label">建議 / Đề xuất</span><strong>${ready?num(plan.orderUnits):"—"}</strong><small>${ready?html(plan.arrival):"未設定 / Chưa cài"}</small>${risk?badge(lang==="zh"?"到貨前可能缺貨":"Có nguy cơ hết trước giao","danger"):""}</div>
 <label class="pv2-cell pv2-quantity"><span class="pv2-mobile-label">叫貨 / Số gọi</span><input type="number" data-pv2-qty="${html(item.id)}" min="0" step="1" value="${num(amount)}" ${!ready||!editable?"disabled":""}/><small>${html(rule?.packageUnit||item.unit||"")}</small></label>
 </article>`;
 }).join("")}</div>`;
}
function groupsOf(rows,keyFor){
 const groups=new Map();
 for(const row of rows){const key=keyFor(row);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
 return [...groups];
}
function listBody(lang,editable){
 let rows=lines().filter(row=>(ui.supplier==="all"||(row.supplier?.id||"unassigned")===ui.supplier)&&(ui.category==="all"||row.item.category_code===ui.category)&&itemMatches(row.item));
 if(ui.tab==="supplier"){
  const groups=groupsOf(rows,r=>r.supplier?.id||"unassigned");
  return groups.map(([key,subRows])=>{
   const sup=supplierFor(key);
   const label=sup?sup.name_zh_tw+" / "+(sup.name_vi||""):"未設定供應商 / Chưa gán NCC";
   return `<section class="pv2-panel"><header class="pv2-section-head"><h3>🏭 ${html(label)}</h3><small>${subRows.length} 項 / sản phẩm</small></header>${productRows(subRows,lang,editable)}</section>`;
  }).join("")||productRows([],lang,editable);
 }
 if(ui.tab==="group"){
  const groups=groupsOf(rows,r=>r.item.category_code||"uncategorized");
  return groups.map(([key,groupRows])=>{
    const group=(ui.inventory?.categories||[]).find(x=>x.code===key);
    const label=group?(lang==="zh"?group.name_zh_tw:group.name_vi):"未分類 / Chưa phân loại";
    return `<section class="pv2-panel"><header class="pv2-section-head"><h3>▦ ${html(label)}</h3><small>${groupRows.length} 項 / sản phẩm</small></header>${productRows(groupRows,lang,editable)}</section>`;
  }).join("")||productRows([],lang,editable);
 }
 return `<section class="pv2-panel">${productRows(rows,lang,editable)}</section>`;
}
function historyBody(lang,editable){
 const orders=ui.data?.orders||[];
 return `<section class="pv2-panel"><header class="pv2-section-head"><h3>叫貨紀錄 / Lịch sử gọi hàng</h3></header>
 ${orders.length?orders.map(o=>`<div class="pv2-order-row"><div><strong>${html(o.id.slice(0,8))}</strong><small>${html(supplierFor(o.supplierId)?.name_zh_tw||"供應商 / Nhà cung cấp")}</small></div><div><small>叫貨 / Đặt</small><strong>${html(o.orderDate)}</strong></div><div><small>預計到貨 / Dự kiến giao</small><strong>${html(o.expectedArrival)}</strong></div>${badge(o.status,"neutral")}${editable&&o.status==="submitted"?`<button type="button" data-pv2-action="order-status" data-id="${o.id}" data-status="confirmed">供應商已確認 / NCC đã xác nhận</button>`:""}${editable&&o.status==="confirmed"?`<button type="button" data-pv2-action="order-status" data-id="${o.id}" data-status="received">已完成進貨 / Đã nhập kho</button>`:""}</div>`).join(""):`<p class="pv2-empty">尚無叫貨紀錄 / Chưa có lịch sử gọi hàng</p>`}
 <p class="pv2-hint">叫貨單不會自動入庫；到貨後請至「進貨入庫」確認數量。 Đơn gọi hàng không tự tăng tồn kho; phải nhận hàng tại mục Nhập kho.</p></section>`;
}

function beginSupplierEdit(id){
 const saved=id==="new"?{}:suppliers().find(s=>s.id===id);
 if(id!=="new"&&!saved)return;
 ui.editingSupplier=id;
 ui.supplierDraft={
  id:saved?.id||"",revision:Number(saved?.revision||0),nameZhTw:saved?.nameZhTw||"",nameVi:saved?.nameVi||"",
  phone:saved?.phone||"",cutoffTime:saved?.cutoffTime||"12:00",leadDays:Number(saved?.leadDays??1),
  reviewDays:Number(saved?.reviewDays??1),active:saved?.active!==false,
  closedWeekdays:[...(saved?.closedWeekdays||[])]
 };
 ui.supplierClosedDates=[...new Set((saved?.closedDates||[]).filter(validProcurementDate))].sort();
 ui.calendarMonth=procurementCalendarMonth(ui.supplierClosedDates.find(x=>x>=ui.date)||ui.date);
 ui.calendarAnchor=null;ui.calendarError="";ui.rangeStart="";ui.rangeEnd="";
}
function rememberSupplierFields(root){
 const form=root.querySelector('[data-pv2-form="supplier"]');
 if(!form||!ui.supplierDraft)return;
 const data=new FormData(form);
 ui.supplierDraft={
  ...ui.supplierDraft,nameZhTw:String(data.get("nameZhTw")||""),nameVi:String(data.get("nameVi")||""),
  phone:String(data.get("phone")||""),cutoffTime:String(data.get("cutoffTime")||"12:00"),
  leadDays:Number(data.get("leadDays")),reviewDays:Number(data.get("reviewDays")),
  closedWeekdays:data.getAll("closedWeekdays").map(Number)
 };
 ui.rangeStart=String(data.get("rangeStart")||"");
 ui.rangeEnd=String(data.get("rangeEnd")||"");
}
function supplierCalendar(){
 const month=ui.calendarMonth||procurementCalendarMonth(ui.date);
 const cells=procurementMonthCells(month), dates=new Set(ui.supplierClosedDates);
 const labels=["一 / T2","二 / T3","三 / T4","四 / T5","五 / T6","六 / T7","日 / CN"];
 return `<section class="pv2-holiday-picker" aria-label="選擇休息日期 / Chọn ngày nghỉ">
 <div class="pv2-calendar-head"><strong>特別休假 / Ngày nghỉ đặc biệt</strong><div class="pv2-calendar-navigation"><button type="button" data-pv2-action="calendar-month-prev" aria-label="Tháng trước">‹</button><span>${html(month)}</span><button type="button" data-pv2-action="calendar-month-next" aria-label="Tháng sau">›</button></div></div>
 <p class="pv2-hint">點選開始日，再點選結束日，會選取整個日期區間。 Chạm ngày bắt đầu rồi ngày kết thúc để chọn cả khoảng; chọn cùng một ngày hai lần để chọn một ngày.</p>
 <div class="pv2-calendar-grid" role="group" aria-label="${html(month)}">${labels.map(x=>`<span class="pv2-weekday-label">${x}</span>`).join("")}
 ${cells.map(date=>date?`<button type="button" class="pv2-calendar-day ${dates.has(date)?"selected":""} ${ui.calendarAnchor===date?"anchor":""}" data-pv2-action="calendar-day" data-date="${date}" aria-pressed="${dates.has(date)}" aria-label="${date}" ${ui.pending?"disabled":""}>${Number(date.slice(8))}</button>`:`<span class="pv2-calendar-blank" aria-hidden="true"></span>`).join("")}</div>
 <div class="pv2-calendar-range">
  <label>開始 / Từ ngày<input type="date" name="rangeStart" value="${html(ui.rangeStart)}"></label>
  <label>結束 / Đến ngày<input type="date" name="rangeEnd" value="${html(ui.rangeEnd)}"></label>
  <button type="button" class="pv2-secondary" data-pv2-action="calendar-add-range" ${ui.pending?"disabled":""}>＋加入日期 / Thêm khoảng</button>
 </div>
 <div class="pv2-calendar-selected"><strong>已選取 ${ui.supplierClosedDates.length} 天 / Đã chọn ${ui.supplierClosedDates.length} ngày</strong><button type="button" data-pv2-action="calendar-clear" ${!ui.supplierClosedDates.length||ui.pending?"disabled":""}>清除全部 / Xóa tất cả</button></div>
 <div class="pv2-calendar-chips" aria-live="polite">${ui.supplierClosedDates.map(date=>`<button type="button" data-pv2-action="calendar-remove" data-date="${date}" class="pv2-date-chip" aria-label="Xóa ${date}" ${ui.pending?"disabled":""}>${date} ×</button>`).join("")||`<small>尚未選擇 / Chưa chọn ngày nào</small>`}</div>
 ${ui.calendarAnchor?`<p class="pv2-hint" role="status">起始日期 / Ngày bắt đầu: ${ui.calendarAnchor}. 再選擇結束日期 / Chọn ngày kết thúc.</p>`:""}
 ${ui.calendarError?`<div class="pv2-error" role="alert">${html(ui.calendarError)}</div>`:""}
 </section>`;
}
function formSupplier(lang){
 if(ui.editingSupplier===null)return "";
 const draft=ui.supplierDraft||{};
 const closed=new Set(draft.closedWeekdays||[]);
 return `<form class="pv2-panel pv2-editor" data-pv2-form="supplier"><header class="pv2-section-head"><h3>供應商設定 / Cài nhà cung cấp</h3><button type="button" data-pv2-action="close-editor" aria-label="Đóng">×</button></header>
 <input type="hidden" name="id" value="${html(draft.id||"")}"><input type="hidden" name="revision" value="${Number(draft.revision||0)}">
 <div class="pv2-form-grid"><label>中文名稱 / Tên tiếng Trung<input name="nameZhTw" required maxlength="120" value="${html(draft.nameZhTw||"")}"></label>
 <label>越文名稱 / Tên tiếng Việt<input name="nameVi" maxlength="120" value="${html(draft.nameVi||"")}"></label>
 <label>電話 / Số điện thoại<input name="phone" maxlength="60" value="${html(draft.phone||"")}"></label>
 <label>截單時間 / Giờ chốt đơn<input type="time" name="cutoffTime" required value="${html(draft.cutoffTime||"12:00")}"></label>
 <label>交貨天數 / Lead time<input type="number" name="leadDays" min="0" max="60" required value="${draft.leadDays??1}"></label>
 <label>訂貨週期 / Chu kỳ gọi<input type="number" name="reviewDays" min="1" max="30" required value="${draft.reviewDays??1}"></label></div>
 <fieldset><legend>固定休息日 / Nghỉ cố định</legend><div class="pv2-weekdays">${["日 / CN","一 / T2","二 / T3","三 / T4","四 / T5","五 / T6","六 / T7"].map((label,n)=>`<label><input type="checkbox" name="closedWeekdays" value="${n}" ${closed.has(n)?"checked":""}>${label}</label>`).join("")}</div></fieldset>
 ${supplierCalendar()}
 <div class="pv2-editor-actions"><button type="button" data-pv2-action="close-editor">取消 / Hủy</button><button class="pv2-primary" type="submit" ${ui.pending?"disabled":""}>儲存供應商 / Lưu NCC</button></div></form>`;
}

function formRule(lang){
 if(!ui.editingItem)return "";
 const item=items().find(x=>x.id===ui.editingItem);
 if(!item)return "";
 const rule=ui.ruleDraft||ruleFor(item.id)||{};
 return `<div class="pv2-dialog-backdrop" data-pv2-backdrop><div class="pv2-dialog" role="dialog" aria-modal="true" aria-labelledby="pv2-dialog-title"><form class="pv2-panel pv2-editor" data-pv2-form="rule"><header class="pv2-section-head"><h3 id="pv2-dialog-title">${html(item.name_zh_tw)} / ${html(item.name_vi)}</h3><button type="button" aria-label="Đóng cài đặt sản phẩm" data-pv2-action="close-editor">×</button></header>
 <input type="hidden" name="itemId" value="${html(item.id)}"><input type="hidden" name="revision" value="${rule.revision||0}">
 <div class="pv2-form-grid"><label>供應商 / Nhà cung cấp<select name="supplierId" required><option value="">請選擇 / Chọn NCC</option>${suppliers().map(s=>`<option value="${s.id}" ${rule.supplierId===s.id?"selected":""}>${html(s.name_zh_tw)} · ${html(s.name_vi)}</option>`).join("")}</select></label>
 ${[["weekdayDemand","平日用量 / Ngày thường"],["weekendDemand","週末用量 / Cuối tuần"],["holidayDemand","假日用量 / Ngày lễ"],["safetyStock","安全庫存 / Tồn an toàn"],["packageSize","包裝數量 / Số lượng mỗi kiện"]].map(([key,label])=>`<label>${label}<input type="number" name="${key}" min="${key==="packageSize"?"0.001":"0"}" step="0.001" required value="${rule[key]??(key==="packageSize"?1:0)}"></label>`).join("")}
 <label>叫貨單位 / Đơn vị gọi<input name="packageUnit" maxlength="32" value="${html(rule.packageUnit||item.unit||"")}"></label></div>
 ${procurementInventoryDetail(item,lang)}
 <label class="pv2-toggle"><input type="checkbox" name="enabled" ${rule.enabled?"checked":""}>啟用自動建議 / Bật đề xuất tự động</label>
 <div class="pv2-editor-actions"><button type="button" data-pv2-action="close-editor">取消 / Hủy</button><button class="pv2-primary" type="submit" ${ui.pending?"disabled":""}>儲存產品規則 / Lưu định mức</button></div></form></div></div>`;
}
function settingsBody(lang,editable){
 return `<div class="pv2-settings"><section class="pv2-panel"><header class="pv2-section-head"><h3>供應商設定 / Cấu hình nhà cung cấp</h3>${editable?`<button type="button" class="pv2-primary" data-pv2-action="new-supplier">＋新增 / Thêm</button>`:""}</header>
 <div class="pv2-supplier-grid">${suppliers().length?suppliers().map(s=>`<div class="pv2-supplier-card"><strong>${html(s.name_zh_tw)}</strong><small>${html(s.name_vi)}</small><span>休息日 / Ngày nghỉ: ${html(s.closedWeekdays.join(",")||"—")}</span><span>交期 / Giao: ${s.leadDays} 天/ngày</span>${editable?`<button type="button" data-pv2-action="edit-supplier" data-id="${s.id}">編輯 / Sửa</button>`:""}</div>`).join(""):`<p class="pv2-empty">尚未建立供應商。Nhấn Thêm để tạo nhà cung cấp thật trong Database.</p>`}</div></section>
 ${formSupplier(lang)}
 <section class="pv2-panel"><header class="pv2-section-head"><h3>產品用量設定 / Định mức sản phẩm</h3></header><label class="pv2-search pv2-settings-search"><span>⌕</span><input type="search" data-pv2-search value="${html(ui.search)}" placeholder="搜尋產品 / Tìm đúng tên sản phẩm"/><button type="button" data-pv2-action="clear-search">×</button></label><div class="pv2-settings-list">${items().filter(item=>itemMatches(item)).map(item=>{const rule=ruleFor(item.id);return `<div class="pv2-rule-line" data-pv2-id="${html(item.id)}"><div><strong>${html(nameOf(item,lang))}</strong><small>${html(lang==="zh"?item.name_vi:item.name_zh_tw)}</small></div><span>${html(supplierFor(rule?.supplierId)?.name_zh_tw||"未指定 / Chưa gán")}</span><span>平 / Lễ: ${rule?num(rule.weekdayDemand)+" / "+num(rule.holidayDemand):"—"}</span>${editable?`<button type="button" data-pv2-action="edit-rule" data-id="${html(item.id)}">設定 / Cài đặt</button>`:""}</div>`;}).join("")}</div></section>
 <section class="pv2-panel"><header class="pv2-section-head"><h3>節日與營業日 / Ngày lễ & ngày hoạt động</h3></header>
 <p class="pv2-hint">依日期逐日設定；連假可分別設定每一天。 Thiết lập từng ngày để tính đúng kỳ nghỉ liên tiếp 2–3 ngày.</p>
 <form data-pv2-form="calendar" class="pv2-calendar-form"><input name="date" type="date" required value="${html(ui.date)}"/><select name="type"><option value="normal">一般日 / Ngày thường</option><option value="holiday">假日 / Ngày lễ</option><option value="closed">店休 / Nhà hàng nghỉ</option></select><input name="description" placeholder="備註 / Ghi chú" maxlength="160"/><button class="pv2-primary" type="submit" ${!editable||ui.pending?"disabled":""}>儲存 / Lưu</button></form>
 <div class="pv2-holidays">${(ui.data?.calendar||[]).filter(x=>x.type!=="normal").slice(0,50).map(x=>`<span>${html(x.date)} · ${html(x.type==="holiday"?"假日 / Lễ":"店休 / Nghỉ")}</span>`).join("")||"—"}</div></section></div>`;
}
function summary(lang,editable,rows){
 const selected=rows.filter(x=>ui.selected.has(x.item.id)&&x.supplier&&x.amount>0);
 const count=selected.length;
 const total=selected.reduce((n,x)=>n+Number(x.amount),0);
 const supplierCount=new Set(selected.map(x=>x.supplier.id)).size;
 return `<aside class="pv2-aside"><div class="pv2-panel"><h3>叫貨摘要 / Tóm tắt gọi hàng</h3><div class="pv2-summary-num">${num(count)} <small>項 / sản phẩm</small></div><p>供應商 / Nhà cung cấp: <strong>${supplierCount}</strong></p><p>包裝單位總數 / Tổng kiện: <strong>${num(total)}</strong></p>
 <div class="pv2-note">${selected.map(x=>`<div><span>${html(nameOf(x.item,lang))}</span><strong>${num(x.amount)} ${html(x.rule.packageUnit||x.item.unit||"")}</strong></div>`).join("")||"尚未選取 / Chưa chọn sản phẩm"}</div>
 <button type="button" class="pv2-primary pv2-wide" data-pv2-action="submit" ${!editable||!count||ui.pending?"disabled":""}>${ui.pending?"儲存中… / Đang lưu…":"建立叫貨單 / Lập phiếu gọi hàng"}</button>
 <button type="button" class="pv2-secondary pv2-wide" data-pv2-action="copy" ${!count?"disabled":""}>複製清單 / Sao chép danh sách</button>
 <p class="pv2-hint">不會直接發送給供應商，也不會改變庫存。Không tự gửi cho NCC hoặc thay đổi tồn kho.</p></div>
 <div class="pv2-panel"><h3>供應商休假 / Lịch nghỉ NCC</h3>${suppliers().map(s=>`<div class="pv2-supplier-short"><strong>${html(s.name_zh_tw)}</strong><small>${html(s.name_vi)}</small><span>${html(s.closedDates.slice(0,3).join(", ")||"固定 / Cố định")}</span></div>`).join("")||"—"}</div></aside>`;
}
export function procurementV2Page(ctx,{render,site,editable}){
 prepare(site,render,ctx.state.selectedDate);
 const lang=ctx.language;
 if(ui.loading&&!ui.data)return `<section class="pv2-shell"><h2>叫貨管理 / Quản lý gọi hàng</h2><div class="pv2-panel">資料讀取中… / Đang tải dữ liệu từ Database…</div></section>`;
 if(ui.error&&!ui.data)return `<section class="pv2-shell"><h2>叫貨管理 / Quản lý gọi hàng</h2><div class="pv2-error" role="alert">Database/API: ${html(ui.error)}</div><button data-pv2-action="refresh">重新整理 / Tải lại</button></section>`;
 const all=lines(),active=all.filter(x=>x.rule?.enabled),alerts=active.filter(x=>x.plan?.preArrivalRisk||((x.plan?.shortage||0)>0));
 const rows=all.filter(row=>(ui.supplier==="all"||(row.supplier?.id||"unassigned")===ui.supplier)&&(ui.category==="all"||row.item.category_code===ui.category)&&itemMatches(row.item));
 return `<section class="pv2-shell" data-pv2-shell>
 <header class="pv2-title"><div><h2>叫貨管理 <span>Quản lý gọi hàng</span></h2><p>供應商・庫存・假日需求 / Nhà cung cấp · Tồn kho · Nhu cầu ngày lễ</p></div><div class="pv2-sync"><small>${ui.lastSyncedAt?"庫存同步 / Đồng bộ kho: "+new Date(ui.lastSyncedAt).toLocaleTimeString("zh-TW",{timeZone:"Asia/Taipei",hour:"2-digit",minute:"2-digit",second:"2-digit"}):"資料同步中 / Đang đồng bộ"}</small><button type="button" class="pv2-secondary" data-pv2-action="refresh" ${ui.pending||ui.loading?"disabled":""}>⟳ 同步 / Đồng bộ</button></div></header>
 <div class="pv2-stats">${metric("供應商","Nhà cung cấp",suppliers().length)}${metric("產品規則","Sản phẩm có định mức",active.length)}${metric("需要補貨","Cần gọi",alerts.length)}${metric("已建立訂單","Phiếu đã tạo",(ui.data?.orders||[]).length)}</div>
 ${tabs(lang)}
 ${ui.notice?`<div class="pv2-notice" role="status">${html(ui.notice)}</div>`:""}${ui.error?`<div class="pv2-error" role="alert">${html(ui.error)}</div>`:""}
 <div class="pv2-content">${ui.tab==="history"?historyBody(lang,editable):ui.tab==="settings"?settingsBody(lang,editable):`<div class="pv2-main">${filterBar(lang)}${listBody(lang,editable)}</div>`}
 ${["list","supplier","group"].includes(ui.tab)?summary(lang,editable,rows):""}</div>${ui.tab==="settings"&&ui.editingItem?formRule(lang):""}</section>`;
}
async function submitOrders(render){
 const chosen=lines().filter(x=>ui.selected.has(x.item.id)&&x.supplier&&x.rule?.enabled&&x.amount>0);
 if(!chosen.length)return;
 const groups=groupsOf(chosen,row=>row.supplier.id);
 ui.pending=true;ui.notice="處理中… / Đang lưu lên Database…";render();
 let success=0;
 try{
  for(const [supplierId,rows] of groups){
   const key=ui.requestKeys.get(supplierId)||identifier();ui.requestKeys.set(supplierId,key);
   const expected=rows.map(x=>x.plan.arrival).sort().at(-1);
   await apiRequest("/api/procurement/"+encodeURIComponent(ui.site)+"/orders",{method:"POST",
     body:{supplierId,orderDate:ui.date,expectedArrival:expected,requestKey:key,
       lines:rows.map(x=>({itemId:x.item.id,packageCount:Number(x.amount)}))}});
   rows.forEach(row=>ui.selected.delete(row.item.id));
   ui.requestKeys.delete(supplierId);success++;
  }
  await refreshAfterMutation(render);
  ui.notice="已建立 "+success+" 張叫貨單 / Đã lưu "+success+" phiếu gọi hàng vào Database.";
 }catch(error){ui.notice="儲存失敗 / Lưu thất bại: "+errorLabel(error);}
 finally{ui.pending=false;render();}
}
async function refreshAfterMutation(render){
 const site=ui.site;
 const [data,inventory]=await Promise.all([apiRequest("/api/procurement/"+encodeURIComponent(site)),vpsInventory(site,{force:true})]);
 if(guard(site)){ui.data=data;ui.inventory=inventory;ui.lastSyncedAt=Date.now();}
}
function beginRuleEdit(itemId){
 const rule=ruleFor(itemId)||{};
 if(!items().some(item=>item.id===itemId))return;
 ui.editingItem=itemId;
 ui.ruleDraft={...rule};
}
function rememberRuleFields(root){
 if(!ui.ruleDraft)return;
 const form=root.querySelector('[data-pv2-form="rule"]');
 if(!form)return;
 const d=new FormData(form);
 ui.ruleDraft={
  ...ui.ruleDraft,supplierId:String(d.get("supplierId")||""),
  weekdayDemand:d.get("weekdayDemand"),weekendDemand:d.get("weekendDemand"),holidayDemand:d.get("holidayDemand"),
  safetyStock:d.get("safetyStock"),packageSize:d.get("packageSize"),
  packageUnit:String(d.get("packageUnit")||""),enabled:d.has("enabled")
 };
}
export function mountProcurementV2(root,{render,route}){
 root.addEventListener("click",event=>{
   const el=event.target.closest("[data-pv2-action]");if(!el||route()!=="procurement")return;
   event.preventDefault();event.stopImmediatePropagation();
   const action=el.dataset.pv2Action;
   if(action==="tab"){ui.tab=el.dataset.tab;ui.notice="";ui.editingItem=null;ui.editingSupplier=null;ui.ruleDraft=null;ui.supplierDraft=null;render();}
   if(action==="refresh"){void refresh(ui.site,render);}
   if(action==="clear-search"){ui.search="";const input=root.querySelector("[data-pv2-search]");if(input){input.value="";input.dispatchEvent(new Event("input",{bubbles:true}));input.focus();}}
   if(action==="new-supplier"){beginSupplierEdit("new");render();}
   if(action==="edit-supplier"){beginSupplierEdit(el.dataset.id);render();}
   if(action==="edit-rule"){beginRuleEdit(el.dataset.id);render();root.querySelector('[data-pv2-form="rule"] select[name="supplierId"]')?.focus();}
   if(action==="close-editor"&&!ui.pending){const lastItem=ui.editingItem;ui.editingSupplier=null;ui.editingItem=null;ui.supplierDraft=null;ui.ruleDraft=null;ui.calendarAnchor=null;render();if(lastItem)root.querySelector('[data-pv2-action="edit-rule"][data-id="'+lastItem+'"]')?.focus();}

   if(action.startsWith("calendar-") && ui.editingSupplier!==null && !ui.pending){
     rememberSupplierFields(root);
     ui.calendarError="";
     try{
       if(action==="calendar-month-prev")ui.calendarMonth=procurementMoveMonth(ui.calendarMonth,-1);
       if(action==="calendar-month-next")ui.calendarMonth=procurementMoveMonth(ui.calendarMonth,1);
       if(action==="calendar-day"){
         const date=el.dataset.date;
         if(!validProcurementDate(date))throw new Error("INVALID_CALENDAR_DATE");
         if(!ui.calendarAnchor){ui.calendarAnchor=date;ui.rangeStart=date;ui.rangeEnd="";}
         else{
           ui.supplierClosedDates=procurementAddClosedDates(ui.supplierClosedDates,ui.calendarAnchor,date);
           ui.rangeStart=ui.calendarAnchor;ui.rangeEnd=date;ui.calendarAnchor=null;
         }
       }
       if(action==="calendar-add-range"){
         if(!validProcurementDate(ui.rangeStart)||!validProcurementDate(ui.rangeEnd))throw new Error("CHOOSE_START_AND_END_DATE");
         ui.supplierClosedDates=procurementAddClosedDates(ui.supplierClosedDates,ui.rangeStart,ui.rangeEnd);
         ui.calendarAnchor=null;
       }
       if(action==="calendar-remove")ui.supplierClosedDates=ui.supplierClosedDates.filter(x=>x!==el.dataset.date);
       if(action==="calendar-clear"){ui.supplierClosedDates=[];ui.calendarAnchor=null;}
     }catch(e){ui.calendarError=String(e.message||e);}
     render();
   }
   if(action==="submit"&&!ui.pending)void submitOrders(render);
   if(action==="order-status"&&!ui.pending) {
     const requested=el.dataset.status,id=el.dataset.id;
     const prompt=requested==="received"?"請先在進貨入庫完成實際入庫，再將此單標記已收貨。Bạn đã nhập kho thực tế trước khi đóng phiếu?":"供應商已明確確認接受此張訂單嗎？Nhà cung cấp đã xác nhận đơn này?";
     if(window.confirm(prompt)){
       ui.pending=true;ui.notice="處理中… / Đang cập nhật…";render();
       void apiRequest("/api/procurement/"+encodeURIComponent(ui.site)+"/orders/"+encodeURIComponent(id)+"/status",{method:"POST",body:{status:requested}})
        .then(()=>refreshAfterMutation(render))
        .then(()=>{ui.notice="狀態已更新 / Đã cập nhật trạng thái";})
        .catch(e=>{ui.notice="更新失敗 / Lỗi cập nhật: "+errorLabel(e);})
        .finally(()=>{ui.pending=false;render();});
     }
   }
   if(action==="copy"){
     const chosen=lines().filter(x=>ui.selected.has(x.item.id)&&x.amount>0);
     const text=chosen.map(x=>nameOf(x.item,"zh")+" / "+nameOf(x.item,"vi")+" — "+x.amount+" "+(x.rule?.packageUnit||x.item.unit||"")).join("\n");
     navigator.clipboard.writeText(text).then(()=>{ui.notice="已複製 / Đã sao chép";render();}).catch(()=>{ui.notice="無法複製 / Không sao chép được";render();});
   }
 });
 root.addEventListener("input",event=>{
   const el=event.target;
   if(route()!=="procurement"||event.isComposing)return;
   if(el.closest?.('[data-pv2-form="supplier"]'))rememberSupplierFields(root);
   if(el.closest?.('[data-pv2-form="rule"]'))rememberRuleFields(root);
   if(!el.matches?.("[data-pv2-search]"))return;
   ui.search=el.value;
   const needle=prepareIngredientNameSearchNeedle(ui.search);
   let visible=0;
   for(const row of root.querySelectorAll("[data-pv2-id]")){
     const item=items().find(x=>x.id===row.dataset.pv2Id);
     const match=item&&ingredientNameSearchMatches(prepareIngredientNameSearchCorpus(item.name_zh_tw,item.name_vi),needle);
     row.hidden=!match;if(match)visible++;
   }
   const counter=root.querySelector("[data-pv2-results]");if(counter)counter.textContent=visible+" / "+root.querySelectorAll("[data-pv2-id]").length;
 });
 root.addEventListener("change",event=>{
   if(route()!=="procurement")return;
   const el=event.target;
   if(el.closest?.('[data-pv2-form="supplier"]'))rememberSupplierFields(root);
   if(el.closest?.('[data-pv2-form="rule"]'))rememberRuleFields(root);
   if(el.dataset.pv2Filter){event.stopImmediatePropagation();ui[el.dataset.pv2Filter]=el.value;render();}
   if(el.dataset.pv2Date!==undefined){event.stopImmediatePropagation();ui.date=el.value;ui.selected.clear();ui.overrides.clear();render();}
   if(el.dataset.pv2Select){event.stopImmediatePropagation();if(el.checked)ui.selected.add(el.dataset.pv2Select);else ui.selected.delete(el.dataset.pv2Select);render();}
   if(el.dataset.pv2Qty){event.stopImmediatePropagation();ui.overrides.set(el.dataset.pv2Qty,Math.max(0,Math.floor(Number(el.value)||0)));render();}
 });
 root.addEventListener("submit",event=>{
  const form=event.target;if(route()!=="procurement"||!form.dataset.pv2Form)return;
  event.preventDefault();event.stopImmediatePropagation();if(ui.pending)return;
  const data=new FormData(form),type=form.dataset.pv2Form;
  let endpoint="",body={};
  if(type==="supplier"){
    endpoint="suppliers";body={ id:data.get("id")||undefined,revision:Number(data.get("revision")||0),
      nameZhTw:data.get("nameZhTw"),nameVi:data.get("nameVi"),phone:data.get("phone"),
      cutoffTime:data.get("cutoffTime"),leadDays:Number(data.get("leadDays")),reviewDays:Number(data.get("reviewDays")),
      closedWeekdays:data.getAll("closedWeekdays").map(Number),closedDates:[...ui.supplierClosedDates],active:true };
  }else if(type==="rule"){
    endpoint="rules";body={itemId:data.get("itemId"),revision:Number(data.get("revision")||0),supplierId:data.get("supplierId"),
      weekdayDemand:Number(data.get("weekdayDemand")),weekendDemand:Number(data.get("weekendDemand")),
      holidayDemand:Number(data.get("holidayDemand")),safetyStock:Number(data.get("safetyStock")),
      packageSize:Number(data.get("packageSize")),packageUnit:data.get("packageUnit"),enabled:data.has("enabled")};
  }else{
    endpoint="calendar";body={date:data.get("date"),type:data.get("type"),description:data.get("description")};
  }
  ui.pending=true;ui.notice="處理中… / Đang lưu…";
  const site=ui.site;
  void apiRequest("/api/procurement/"+encodeURIComponent(site)+"/"+endpoint,{method:"POST",body})
    .then(()=>refreshAfterMutation(render))
    .then(()=>{ui.editingItem=null;ui.editingSupplier=null;ui.ruleDraft=null;ui.supplierDraft=null;ui.notice="儲存成功 / Đã lưu vào Database";})
    .catch(error=>{ui.notice="儲存失敗 / Lưu thất bại: "+errorLabel(error);})
    .finally(()=>{ui.pending=false;render();});
 });
 window.addEventListener("shitu:inventory-cloud-updated",event=>{
  if(route()==="procurement"&&(!event.detail?.site||event.detail.site===ui.site)&&!ui.loading){
   void refresh(ui.site,render);
  }
 });
 root.addEventListener("click",event=>{
   if(route()!=="procurement"||!event.target.matches?.("[data-pv2-backdrop]")||ui.pending)return;
   ui.editingItem=null;ui.ruleDraft=null;render();
 });
 window.addEventListener("keydown",event=>{
   if(route()!=="procurement"||!ui.editingItem||ui.pending)return;
   if(event.key==="Escape"){event.preventDefault();ui.editingItem=null;ui.ruleDraft=null;render();return;}
   if(event.key==="Tab"){
     const modal=root.querySelector(".pv2-dialog");if(!modal)return;
     const targets=[...modal.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])')];
     if(!targets.length)return;
     const first=targets[0],last=targets.at(-1);
     if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
     else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
   }
 });
 // DB edits via direct SQL do not necessarily publish SSE. A forced GET keeps the
 // existing Inventory snapshot authoritative without inventing another stock DB.
 // Native inventory-cloud SSE and focus/visibility refresh remain the fast paths.
 window.setInterval(()=>{
   if(route()!=="procurement"||document.visibilityState!=="visible"||!ui.site||ui.loading||ui.pending)return;
   if(Date.now()-ui.lastSyncedAt<25000)return;
   void refresh(ui.site,render);
 },30000);
 window.addEventListener("visibilitychange",()=>{
   if(document.visibilityState==="visible"&&route()==="procurement"&&!ui.loading&&!ui.pending)void refresh(ui.site,render);
 });
 window.addEventListener("focus",()=>{if(route()==="procurement"&&!ui.loading&&!ui.pending)void refresh(ui.site,render);});
}
