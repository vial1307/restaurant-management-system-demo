// Finance Sheet: an editable planning grid, never an editable accounting ledger.
// Linked debt/goal rows represent monthly allocations; their master records stay intact.
export function createFinancePlanSheet({api,safe,notify,refresh,getMonth,getRows,getCurrencies,open}){
 const state={month:null,drafts:new Map(),added:[],deleted:new Set(),selected:new Set(),
  query:"",type:"all",sort:"date",paste:false,saving:false,error:null};
 const s=x=>safe(String(x??""));
 const kindName={income:"Thu",expense:"Chi",debt:"Quỹ nợ",goal:"Tiết kiệm"};
 const key=r=>r.source+":"+r.id;
 const day=r=>r.date?.slice(8,10)||"10";
 const versionOf=r=>r.version||"";
 const nativeAmount=v=>String(v??"").replace(/(\.\d*?)0+$/,"$1").replace(/\.$/,"");
 const showNativeAmount=v=>{const [whole,fraction]=nativeAmount(v).split(".");return whole.replace(/\B(?=(\d{3})+(?!\d))/g,".")+(fraction?","+fraction:"");};
 const writable=r=>r.source==="item"||r.source==="debt"||r.source==="goal";
 const editable=r=>r.source==="item"||(r.source==="debt"||r.source==="goal")&&!r.unallocated;
 const existing=()=>getRows().filter(r=>r.source!=="debt"||!r.unallocated); // include unallocated goals
 const fieldValues=r=>({kind:r.kind,label:r.name||"",day:r.source==="item"&&r.estimated?"":String(Number(day(r))),
  amount:nativeAmount(r.native),currency:r.code||"TWD",memo:r.source==="item"?(r.detail||""):""});
 function draft(r){const k=key(r);return state.drafts.get(k)||fieldValues(r);}
 function changes(){return state.drafts.size+state.added.length+state.deleted.size;}
 function reset(){state.drafts.clear();state.added=[];state.deleted.clear();state.selected.clear();state.error=null;}
 function monthChanged(){
  const m=getMonth();
  if(state.month!==m){reset();state.month=m;state.query="";state.type="all";state.paste=false;}
 }
 function hasChanges(){return changes()>0;}
 function selectionHtml(r){
  if(r.unallocated)return '<input type="checkbox" class="sheet-row-check" disabled aria-label="Chưa lập quỹ, không thể xóa tại bảng kế hoạch" title="Đây là công nợ/mục tiêu gốc chưa có phân bổ tháng. Hãy dùng Lập quỹ hoặc chỉnh ở Công nợ & mục tiêu.">';
  return '<input type="checkbox" class="sheet-row-check" data-sheet-key="'+s(key(r))+'" aria-label="Chọn '+s(r.name)+'"'+(state.selected.has(key(r))?" checked":"")+'>';
 }
 function editor(r,column,contents,cls="",readonly=false){
  const k=key(r),d=draft(r);
  if(readonly)return '<span class="sheet-readonly" title="Chỉnh sửa điều khoản tại Công nợ & mục tiêu">'+contents+'</span>';
  if(column==="kind"){
   return '<select data-sheet-field="kind" data-sheet-key="'+s(k)+'" aria-label="Loại kế hoạch">'+
    ["income","expense"].map(t=>'<option value="'+t+'"'+(d.kind===t?" selected":"")+'>'+kindName[t]+'</option>').join("")+'</select>';
  }
  if(column==="currency"){
   return '<select data-sheet-field="currency" data-sheet-key="'+s(k)+'" aria-label="Ngoại tệ">'+
    getCurrencies().map(t=>'<option value="'+s(t.code)+'"'+(d.currency===t.code?" selected":"")+'>'+s(t.code)+'</option>').join("")+'</select>';
  }
  return '<input data-sheet-field="'+s(column)+'" data-sheet-key="'+s(k)+'" type="'+
    (column==="day"?"number":"text")+'" '+(column==="day"?'min="1" max="31" step="1" placeholder="Chưa rõ"':"")+
    'value="'+s(d[column]??"")+'" aria-label="'+s(column)+" · "+s(r.name)+
    '" maxlength="'+(column==="label"?"140":column==="memo"?"250":"50")+'">';
 }
 function oneRow(r,idx){
  const k=key(r),isDeleted=state.deleted.has(k),linked=!!r.unallocated,isFund=r.source!=="item";
  const td=(label,body,cls="")=>'<td data-label="'+s(label)+'" class="'+cls+'">'+body+'</td>';
  const original=editable(r)?editor(r,"amount",s(r.native)):
   '<span class="sheet-readonly" title="Dư nợ/mục tiêu tham khảo, chưa phải số tiền phân bổ tháng này">'+
    s(showNativeAmount(r.native))+" "+s(r.code)+"</span>";
  const label=r.source==="item"?editor(r,"label",s(r.name)):
   '<strong>'+s(r.name)+'</strong>'+(isFund?'<small class="sheet-linked">'+
     (linked?"Nợ/mục tiêu gốc · Chưa lập quỹ":"Liên kết công nợ/mục tiêu")+'</small>':"");
  const actions=r.source==="item"?
   '<button type="button" class="btn small ghost" data-action="editPlan" data-id="'+s(r.id)+'">Chi tiết / Sửa</button>':
   '<button type="button" class="btn small ghost" data-sheet-action="linked" data-sheet-key="'+s(k)+'">'+
    (linked?"Lập quỹ":"Điều khoản")+'</button>';
  const converted=linked?'<span class="sheet-missing-allocation">Chưa lập quỹ</span>':
    r.twd===null?"Chưa có tỷ giá":s(r.twd?.toLocaleString?.("vi-VN")||r.twd);
  return '<tr data-sheet-key="'+s(k)+'" class="'+(isDeleted?"sheet-deleted ":"")+
    (linked?"sheet-reference ":"")+(state.selected.has(k)?"sheet-selected ":"")+(idx%2?"sheet-alt":"")+'">'+
    td("Chọn dòng",selectionHtml(r),"sheet-selector")+
    td("Ngày",r.source==="item"?editor(r,"day",s(day(r))):'<span>'+s(r.date)+'</span>',"sheet-date")+
    td("Loại",editor(r,"kind",s(kindName[r.kind]),"",r.source!=="item"),"sheet-kind")+
    td("Nội dung",label,"sheet-label")+
    td("Số tiền gốc",original,"sheet-amount")+
    td("Tiền tệ",editor(r,"currency",s(r.code),"",r.source!=="item"),"sheet-currency")+
    td("Quy đổi TWD",converted,"sheet-base num")+
    td("Ghi chú",r.source==="item"?editor(r,"memo",s(r.detail)):
      '<span class="sheet-readonly">'+s(r.detail||"Quỹ được đồng bộ với Công nợ / Mục tiêu")+'</span>',"sheet-memo")+
    td("Thao tác",actions,"sheet-actions")+'</tr>';
 }

 function getAllRows(){
  const original=getRows();
  const q=state.query.trim().toLocaleLowerCase("vi-VN");
  return original.filter(r=>!q||(r.name+" "+r.code+" "+(r.detail||"")).toLocaleLowerCase("vi-VN").includes(q))
    .filter(r=>state.type==="all"||r.kind===state.type)
    .sort((a,b)=>state.sort==="name"?a.name.localeCompare(b.name):
      state.sort==="amount"?(Number(b.native)||0)-(Number(a.native)||0):
      String(a.date||"").localeCompare(String(b.date||""))||a.name.localeCompare(b.name));
 }
 function html(){
  monthChanged();
  const all=getAllRows(),pending=changes();
  const toolbar='<div class="sheet-toolbar">'+
   '<div class="sheet-tool-main">'+
    '<button type="button" class="btn small primary" data-sheet-action="add">+ Thêm dòng</button>'+
    '<button type="button" class="btn small soft" data-sheet-action="save"'+(!pending||state.saving?" disabled":"")+'>'+(state.saving?"Đang lưu…":"Lưu "+pending+" thay đổi")+'</button>'+
    '<button type="button" class="btn small ghost" data-sheet-action="cancel"'+(!pending?" disabled":"")+'>Hủy chưa lưu</button>'+
    '<button type="button" class="btn small ghost" data-sheet-action="remove"'+(!state.selected.size?" disabled":"")+'>Xóa dòng đã chọn</button>'+
    '<button type="button" class="btn small ghost" data-sheet-action="copy">Sao chép</button>'+
    '<button type="button" class="btn small ghost" data-sheet-action="togglePaste">Dán từ Excel/Sheets</button>'+
   '</div><div class="sheet-tool-filter">'+
    '<input type="search" id="sheet-filter" placeholder="Tìm nội dung..." aria-label="Tìm dòng kế hoạch" value="'+s(state.query)+'">'+
    '<select id="sheet-kind-filter" aria-label="Lọc loại"><option value="all">Tất cả</option>'+
     ["income","expense","debt","goal"].map(k=>'<option value="'+k+'"'+(state.type===k?" selected":"")+'>'+kindName[k]+'</option>').join("")+'</select>'+
    '<select id="sheet-sort" aria-label="Sắp xếp">'+[
     ["date","Ngày"],["name","Tên A–Z"],["amount","Số tiền giảm dần"]].map(([v,t])=>
      '<option value="'+v+'"'+(state.sort===v?" selected":"")+'>'+t+'</option>').join("")+'</select>'+
   '</div></div>';
  const selectable=all.filter(r=>!r.unallocated);
  const selectBar='<div class="sheet-selection-bar"><label class="sheet-select-mobile">'+
   '<input type="checkbox" id="sheet-select-visible" aria-label="Chọn các dòng có thể chỉnh hoặc xóa đang hiển thị">'+
   '<span>Chọn dòng đang hiển thị</span></label><span class="sheet-selection-summary" aria-live="polite">'+
    state.selected.size+' dòng được chọn · '+selectable.length+' dòng có thể chỉnh/xóa</span></div>';
  const guide='<div class="sheet-intro"><div><strong>Chỉnh sửa trực tiếp · Tất cả khoản trong tháng</strong>'+
    '<p>Chọn ô để sửa · chỉ các khoản phân bổ đã lưu mới có thể xóa. Công nợ chưa lập quỹ chỉ để tham khảo.</p></div>'+
    '<span>Đồng bộ qua Finance PostgreSQL sau khi lưu</span></div>';
  const paste=state.paste?'<div class="sheet-paste"><label>Dán các dòng Excel/Sheets (cột: Ngày, Loại, Nội dung, Số tiền, Ngoại tệ, Ghi chú)</label>'+
    '<textarea id="sheet-paste-area" rows="4" placeholder="10\tChi\tTiền nhà\t6000\tTWD\tTiền nhà tháng này"></textarea>'+
    '<div class="tools"><button type="button" class="btn small primary" data-sheet-action="paste">Thêm các dòng vào bảng</button>'+
    '<button type="button" class="btn small ghost" data-sheet-action="togglePaste">Đóng</button></div></div>':"";
  const hdr='<div class="sheet-scroller" tabindex="0" aria-label="Bảng tính kế hoạch tài chính"><table class="sheet-table"><thead><tr>'+
   '<th><input type="checkbox" id="sheet-select-all" aria-label="Chọn tất cả dòng"></th>'+
   '<th>Ngày</th><th>Loại</th><th>Nội dung</th><th>Số tiền gốc</th><th>Tiền tệ</th>'+
   '<th class="num">Quy đổi TWD</th><th>Ghi chú</th><th>Thao tác</th></tr></thead><tbody>';
  const rendered=all.map(oneRow).join("");
  const added=state.added.map((a,i)=>'<tr class="sheet-new" data-sheet-key="'+s(a.key)+'">'+
   '<td class="sheet-selector" data-label="Dòng mới">+</td><td class="sheet-date" data-label="Ngày"><input type="number" min="1" max="31" value="'+s(a.day)+'" data-sheet-field="day" data-sheet-key="'+s(a.key)+'"></td>'+
   '<td class="sheet-kind" data-label="Loại"><select data-sheet-field="kind" data-sheet-key="'+s(a.key)+'">'+["expense","income"].map(k=>
    '<option value="'+k+'"'+(a.kind===k?" selected":"")+'>'+kindName[k]+'</option>').join("")+'</select></td>'+
   '<td class="sheet-label" data-label="Nội dung"><input data-sheet-field="label" data-sheet-key="'+s(a.key)+'" value="'+s(a.label)+'" placeholder="Nhập nội dung" maxlength="140"></td>'+
   '<td class="sheet-amount" data-label="Số tiền gốc"><input data-sheet-field="amount" data-sheet-key="'+s(a.key)+'" value="'+s(a.amount)+'" placeholder="Số tiền"></td>'+
   '<td class="sheet-currency" data-label="Tiền tệ"><select data-sheet-field="currency" data-sheet-key="'+s(a.key)+'">'+getCurrencies().map(c=>
    '<option value="'+s(c.code)+'"'+(a.currency===c.code?" selected":"")+'>'+s(c.code)+'</option>').join("")+'</select></td>'+
   '<td class="sheet-base sheet-readonly num" data-label="Quy đổi TWD">Tự tính sau lưu</td><td class="sheet-memo" data-label="Ghi chú"><input data-sheet-field="memo" data-sheet-key="'+s(a.key)+'" value="'+s(a.memo)+'" maxlength="250"></td>'+
   '<td class="sheet-actions" data-label="Thao tác"><button type="button" class="btn small ghost" data-sheet-action="dropNew" data-sheet-key="'+s(a.key)+'">Bỏ dòng</button></td></tr>').join("");
  const footer='</tbody></table></div><div class="sheet-status"><span>Đang xem '+all.length+' dòng đã lưu · '+
    state.added.length+' dòng mới</span><span>'+pending+' chỉnh sửa chưa lưu · Ctrl/Cmd+S để lưu · Enter/Tab để di chuyển</span></div>';
  return '<div class="finance-sheet">'+guide+toolbar+selectBar+paste+hdr+(rendered+added||'<tr><td colspan="9" class="empty">Chưa có dữ liệu. Chọn “Thêm dòng”.</td></tr>')+
    footer+(state.error?'<div class="notice warn">'+s(state.error)+'</div>':"")+
    '<div class="notice">Chỉ sửa kế hoạch, không sửa số dư ví hoặc lịch sử đã thanh toán. Xóa “Quỹ nợ/Mục tiêu” chỉ xóa phần phân bổ trong tháng, không xóa khoản nợ/mục tiêu gốc.</div></div>';
 }
 const getRow=k=>getRows().find(r=>key(r)===k);
 const buildItem=(r,d,op)=>({op,id:r?.id,version:r?.version,kind:d.kind,label:d.label,
  originalAmount:String(d.amount).trim(),currencyCode:d.currency,dueDay:String(d.day??"").trim()===""?null:Number(d.day),memo:d.memo||""});
 function collect(){
  const ops=[];
  for(const k of state.deleted){const r=getRow(k);if(!r||r.unallocated)continue;ops.push(
   {op:r.source==="item"?"deleteItem":"deleteFund",id:r.id,version:versionOf(r),
    ...(r.source==="item"?{}:{fundType:r.kind})});}
  for(const [k,d] of state.drafts){if(state.deleted.has(k))continue;const r=getRow(k);if(!r||r.unallocated)continue;
   if(r.source==="item")ops.push({...buildItem(r,d,"updateItem"),version:d._version||r.version});
   else if(r.source==="debt"||r.source==="goal")ops.push({op:"updateFund",fundType:r.source,
    id:r.id,version:d._version||versionOf(r),plannedAmount:String(d.amount).trim()});
  }
  for(const n of state.added)ops.push(buildItem(null,n,"createItem"));
  return ops;
 }
 function validate(ops){
  if(ops.length>80)throw Error("Chỉ được lưu tối đa 80 thay đổi mỗi lần.");
  for(const op of ops){
   if(op.op==="createItem"||op.op==="updateItem"){
    if(!op.label?.trim()||op.label.length>140||(op.dueDay!==null&&(!Number.isInteger(op.dueDay)||op.dueDay<1||op.dueDay>31))||
      !/^(?:0|[1-9]\d{0,14})(?:\.\d{1,6})?$/.test(op.originalAmount)||
      Number(op.originalAmount)<=0)throw Error("Dòng thu/chi cần nội dung, ngày 1–31 và số tiền dương hợp lệ.");
   }
   if(op.op==="updateFund"&&!/^(?:0|[1-9]\d{0,14})(?:\.\d{1,6})?$/.test(op.plannedAmount))
      throw Error("Quỹ nợ/mục tiêu phải là số tiền hợp lệ, có thể bằng 0.");
   if(op.op!=="createItem"&&!op.version)
      throw Error("Dữ liệu cũ thiếu phiên bản. Hãy tải lại trang trước khi chỉnh.");
  }
 }
 async function save(){
  if(state.saving)return;
  const ops=collect();if(!ops.length){notify("Không có thay đổi để lưu.");return;}
  try{validate(ops);}catch(e){state.error=e.message;notify(e.message);render();return;}
  if(ops.some(o=>o.op.startsWith("delete"))&&!confirm("Xóa "+ops.filter(o=>o.op.startsWith("delete")).length+
      " dòng phân bổ/kế hoạch? Nợ gốc, mục tiêu và giao dịch đã thực hiện vẫn được giữ nguyên."))return;
  state.saving=true;state.error=null;render();
  try{
   const result=await api("/cashflow/sheet/batch",{month:getMonth(),operations:ops},"POST");
   if(result?.saved!==ops.length||result?.ledgerPosted!==false)throw Error("Phản hồi lưu không hợp lệ.");
   reset();notify("Đã lưu "+result.saved+" thay đổi vào Finance Database.");await refresh();
  }catch(e){state.error=e?.message==="SHEET_STALE_RELOAD"?
   "Dữ liệu đã thay đổi ở một nơi khác. Bảng chưa lưu thay đổi nào; hãy sao chép phần đang sửa, sau đó tải lại.":String(e.message||e);
   notify(state.error);render();
  }finally{state.saving=false;render();}
 }
 function setField(el){
  const k=el.dataset.sheetKey,field=el.dataset.sheetField;
  if(!k||!field)return;
  const added=state.added.find(x=>x.key===k);
  if(added){added[field]=el.value;return;}
  const r=getRow(k);if(!r||!editable(r)||state.deleted.has(k))return;
  if(r.source!=="item"&&field!=="amount")return;
  const d={...draft(r),[field]:el.value,_version:state.drafts.get(k)?._version||r.version};
  state.drafts.set(k,d);
 }
 function add(count=1,templates=[]){
  for(let i=0;i<count;i++){
   const d=templates[i]||{};
   state.added.push({key:"new:"+(globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2)),
    kind:d.kind||"expense",label:d.label||"",day:String(d.day||10),amount:d.amount||"",
    currency:d.currency||"TWD",memo:d.memo||""});
  }
  render();
 }
 function parsePaste(text){
  const data=String(text||"").trim().split(/\r?\n/).map(s=>s.split("\t"));
  if(!data.length||data.length>60)throw Error("Dán tối đa 60 dòng mỗi lần.");
  const templates=[];
  for(const cells of data){
   if(cells.length<4)throw Error("Mỗi dòng phải có các cột: Ngày, Loại, Nội dung, Số tiền.");
   const [rawDay,rawKind,label,amount,code="TWD",memo=""]=cells.map(s=>s.trim());
   if(["Ngày","Date"].includes(rawDay))continue;
   if(/^\d{4}-\d{2}-\d{2}$/.test(rawDay)&&rawDay.slice(0,7)!==getMonth())throw Error("Không thể dán ngày thuộc tháng khác vào bảng kế hoạch đang xem.");
   const day=/^\d{4}-\d{2}-\d{2}$/.test(rawDay)?Number(rawDay.slice(-2)):Number(rawDay);
   const kind=({Thu:"income",Chi:"expense",income:"income",expense:"expense"})[rawKind];
   if(!kind||!Number.isInteger(day)||day<1||day>31||!label||!getCurrencies().some(x=>x.code===code))
    throw Error("Có dòng sai ngày, loại (Thu/Chi), nội dung hoặc tiền tệ. Không có dữ liệu nào được dán.");
   templates.push({day,kind,label,amount,currency:code,memo});
  }
  if(!templates.length)throw Error("Không có dòng mới để thêm.");
  if(templates.length+changes()>80)throw Error("Tối đa 80 thay đổi mỗi lần lưu.");
  return templates;
 }
 async function copy(){
  const chosen=getRows().filter(r=>state.selected.has(key(r)));
  const rows=chosen.length?chosen:getAllRows();
  const lines=rows.map(r=>[r.date,r.kind==="income"?"Thu":r.kind==="expense"?"Chi":kindName[r.kind],
    r.name,nativeAmount(r.native),r.code,r.detail||""].join("\t")).join("\n");
  try{await navigator.clipboard.writeText(lines);notify("Đã sao chép "+rows.length+" dòng để dán sang Excel/Sheets.");}
  catch{notify("Không thể truy cập Clipboard. Hãy kiểm tra quyền clipboard của trình duyệt.");}
 }
 async function handle(action,k){
  if(action==="add")return add();
  if(action==="save")return save();
  if(action==="cancel"){if(!hasChanges()||confirm("Hủy tất cả thay đổi chưa lưu?")){reset();render();}return;}
  if(action==="copy")return copy();
  if(action==="togglePaste"){state.paste=!state.paste;render();return;}
  if(action==="paste"){try{const templates=parsePaste(document.querySelector("#sheet-paste-area")?.value);
    state.paste=false;add(templates.length,templates);
   }catch(e){notify(e.message);}return;}
  if(action==="remove"){
   const targets=[...state.selected];if(!targets.length)return;
   if(!confirm("Đánh dấu xóa "+targets.length+" dòng? Bạn cần bấm Lưu thay đổi để xác nhận với Database."))return;
   for(const x of targets){
    if(x.startsWith("new:")){state.added=state.added.filter(a=>a.key!==x);continue;}
    const r=getRow(x);
    if(r?.unallocated){notify("Đây là nghĩa vụ gốc chưa lập quỹ. Không thể xóa tại bảng kế hoạch; hãy dùng nút Lập quỹ hoặc mục Công nợ & mục tiêu.");continue;}
    if(state.deleted.has(x))state.deleted.delete(x);else{state.deleted.add(x);state.drafts.delete(x);}
   }
   state.selected.clear();render();return;
  }
  if(action==="dropNew"){state.added=state.added.filter(a=>a.key!==k);render();return;}
  if(action==="linked"){
   const r=getRow(k);if(!r)return;
   open(r.kind==="debt"?"fundDebt":"fundGoal",r.ref);
   return;
  }
 }
 function syncToolbar(){
  const host=document.querySelector(".finance-sheet");if(!host)return;
  const amount=changes(),save=host.querySelector('[data-sheet-action="save"]'),cancel=host.querySelector('[data-sheet-action="cancel"]');
  if(save){save.disabled=!amount||state.saving;save.textContent=state.saving?"Đang lưu…":"Lưu "+amount+" thay đổi";}
  if(cancel)cancel.disabled=!amount;
  const status=host.querySelector(".sheet-status span:last-child");
  if(status)status.textContent=amount+" chỉnh sửa chưa lưu · Ctrl/Cmd+S để lưu · Enter/Tab để di chuyển";
 }
 function syncSelection(){
  const host=document.querySelector(".finance-sheet");if(!host)return;
  const rows=getAllRows().filter(r=>!r.unallocated);
  for(const input of host.querySelectorAll(".sheet-row-check[data-sheet-key]"))
    input.checked=state.selected.has(input.dataset.sheetKey);
  const selectAll=host.querySelector("#sheet-select-all");
  if(selectAll){
    const checked=rows.filter(r=>state.selected.has(key(r))).length;
    selectAll.checked=!!rows.length&&checked===rows.length;
    selectAll.indeterminate=checked>0&&checked<rows.length;
    selectAll.disabled=!rows.length;
  }
  const mobile=host.querySelector("#sheet-select-visible");
  if(mobile){
    const checked=rows.filter(r=>state.selected.has(key(r))).length;
    mobile.checked=!!rows.length&&checked===rows.length;
    mobile.indeterminate=checked>0&&checked<rows.length;
    mobile.disabled=!rows.length;
  }
  const summary=host.querySelector(".sheet-selection-summary");
  if(summary)summary.textContent=state.selected.size+" dòng được chọn · "+rows.length+" dòng có thể chỉnh/xóa";
  for(const tr of host.querySelectorAll(".sheet-table tbody tr[data-sheet-key]"))
    tr.classList.toggle("sheet-selected",state.selected.has(tr.dataset.sheetKey));
  const remove=host.querySelector('[data-sheet-action="remove"]');
  if(remove)remove.disabled=state.selected.size===0;
 }
 function render(){
  const host=document.querySelector(".finance-sheet");
  if(host){host.outerHTML=html();syncSelection();}
 }
 const targetRoot=()=>document.getElementById("finance-content");
 targetRoot()?.addEventListener("click",e=>{
  const btn=e.target.closest("[data-sheet-action]");
  if(btn){e.preventDefault();void handle(btn.dataset.sheetAction,btn.dataset.sheetKey||"");}
 });
 targetRoot()?.addEventListener("input",e=>{
  if(e.target.matches("[data-sheet-field]")){setField(e.target);syncToolbar();}
 });
 targetRoot()?.addEventListener("change",e=>{
  if(e.target.matches("[data-sheet-field]")){setField(e.target);syncToolbar();return;}
  if(e.target.matches("[data-sheet-key].sheet-row-check")){
   if(e.target.disabled)return;
   const k=e.target.dataset.sheetKey;
   if(e.target.checked)state.selected.add(k);else state.selected.delete(k);
   syncSelection();return;
  }
  if(e.target.id==="sheet-select-all"||e.target.id==="sheet-select-visible"){
   const checked=e.target.checked;
   for(const r of getAllRows()){if(r.unallocated)continue;if(checked)state.selected.add(key(r));else state.selected.delete(key(r));}
   syncSelection();return;
  }
  if(e.target.id==="sheet-kind-filter"){state.type=e.target.value;render();return;}
  if(e.target.id==="sheet-sort"){state.sort=e.target.value;render();return;}
  if(e.target.id==="sheet-filter"){state.query=e.target.value;render();}
 });
 targetRoot()?.addEventListener("keydown",e=>{
  if(e.ctrlKey||e.metaKey){
   if(e.key.toLowerCase()==="s"&&document.querySelector(".finance-sheet")){
    e.preventDefault();void save();return;
   }
  }
  if(e.target.matches("[data-sheet-field]")&&e.key==="Enter"){
   e.preventDefault();
   const cells=[...document.querySelectorAll(".finance-sheet [data-sheet-field]")];
   const idx=cells.indexOf(e.target);
   cells[Math.max(0,Math.min(cells.length-1,idx+(e.shiftKey?-1:1)))]?.focus();
  }
 });
 return {html,hasChanges,reset,save};
}
