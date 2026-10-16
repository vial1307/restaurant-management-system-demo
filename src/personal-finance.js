// Private Finance OS: all user data comes from authenticated VPS APIs, never fixtures/localStorage.
const root=document.querySelector("#finance-content");
const loginView=document.querySelector("#finance-login");
const layout=document.querySelector("#finance-layout");
const logoutButton=document.querySelector("#finance-logout");
const loginForm=document.querySelector("#finance-login-form");
const loginError=document.querySelector("#finance-login-error");
const dialog=document.querySelector("#finance-dialog");
const toast=document.querySelector("#finance-toast");
const fieldRoot=document.querySelector("#finance-fields");
const form=document.querySelector("#finance-form");
const tabs=[...document.querySelectorAll(".fin-nav [data-tab]")];
const nowMonth=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit"}).format(new Date()).slice(0,7);
const state={tab:"overview",month:nowMonth,period:"month",data:null,overview:null,year:null,loading:true,problem:null,busy:false};
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const num=(v,dec=0)=>Number(v||0).toLocaleString("vi-VN",{minimumFractionDigits:0,maximumFractionDigits:Math.max(0,Math.min(6,dec))});
const moneyLabel=(v,c="TWD")=>(c==="TWD"?"NT$":c+" ")+num(v,c==="USD"||c==="EUR"||c==="CNY"?2:0);
const monthText=m=>"Tháng "+Number(m.slice(5,7))+"/"+m.slice(0,4);
const safeRate=v=>v==null||v===""?"Chưa nhập":num(v,6);
const accountName=a=>a.name+" · "+a.currency_code;
let toastTimer=0;
function flash(message){toast.textContent=message;toast.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{toast.hidden=true;},5500);} 
function note(message){return '<p class="fin-note">'+esc(message)+'</p>';}
async function api(path,body,method="GET"){
  const write=method!=="GET";
  const response=await fetch("/api/finance"+path,{method,credentials:"same-origin",
    headers:{"Accept":"application/json",...(write?{"Content-Type":"application/json","X-Finance-Write":"1"}:{})},
    body:write?JSON.stringify(body):undefined});
  let data;
  try{data=await response.json();}catch{data={error:"INVALID_SERVER_RESPONSE"};}
  if(!response.ok){const err=new Error(data?.error||"Lỗi kết nối");err.status=response.status;throw err;}
  return data;
}
function failure(error){
  if(error?.status===401)return "Vui lòng đăng nhập tài khoản được cấp quyền.";
  if(error?.status===403)return "Tài khoản hiện tại không được cấp quyền xem tài chính cá nhân.";
  if(error?.status===503)return "Finance Database chưa được kích hoạt hoặc đang không thể kết nối. Dữ liệu nhà hàng không bị ảnh hưởng.";
  const errors={
    INVALID_AMOUNT:"Số tiền không hợp lệ với số chữ số thập phân của ngoại tệ.",
    INVALID_EXCHANGE_AMOUNT:"Số tiền nhận hoặc phí đổi ngoại tệ không hợp lệ.",
    INVALID_FX_PLAN:"Kiểm tra ngày và cặp ngoại tệ.",
    INVALID_FX_AMOUNT:"Số tiền hoặc phí không hợp lệ.",
    USE_FX_FOR_CROSS_CURRENCY:"Chuyển giữa hai ngoại tệ phải ghi nhận dưới dạng đổi ngoại tệ.",
    TWD_RATE_REQUIRED:"Giao dịch ngoài TWD cần nhập tỷ giá quy đổi sang TWD để báo cáo chính xác.",
    FINANCE_DUPLICATE_REQUEST:"Yêu cầu này đã được ghi nhận. Hãy tải lại giao dịch, không gửi lại cùng mã.",
    FINANCE_WRITE_HEADER_REQUIRED:"Yêu cầu ghi dữ liệu bị chặn vì thiếu xác thực chống gửi từ trang ngoài.",
  };
  return errors[error?.message]||("Không lưu được: "+(error?.message||"Lỗi hệ thống"));
}
async function refresh(){
  const [data,overview]=await Promise.all([api("/bootstrap"),api("/overview?month="+encodeURIComponent(state.month))]);
  state.data=data;state.overview=overview;state.problem=null;state.loading=false;render();
}
function heading(title,subtitle,extra=""){
  return '<div class="fin-title-row"><div><h1>'+esc(title)+'</h1><p class="fin-sub">'+esc(subtitle)+'</p></div>'+extra+'</div>';
}
function button(text,action,secondary=false){
  return '<button class="fin-btn'+(secondary?' secondary':'')+'" type="button" data-open="'+esc(action)+'">'+esc(text)+'</button>';
}
function panel(title,body,subtitle=""){return '<section class="fin-card"><h2>'+esc(title)+'</h2>'+(subtitle?'<p class="fin-sub">'+esc(subtitle)+'</p>':'')+body+'</section>';}
function row(title,sub,right,rightSmall=""){
  return '<div class="fin-row"><div><strong>'+esc(title)+'</strong>'+(sub?'<small>'+esc(sub)+'</small>':'')+'</div><div class="fin-amount">'+esc(right)+(rightSmall?'<small>'+esc(rightSmall)+'</small>':'')+'</div></div>';
}
function periodInput(){return '<label for="fin-month" class="fin-muted">Chọn tháng <input id="fin-month" class="fin-date" type="month" value="'+esc(state.month)+'"></label>';}
function balances(){
  const list=state.data.accounts||[];
  return list.length?list.map(a=>row(a.name,a.kind+" · "+a.currency_code,moneyLabel(a.balance,a.currency_code))).join(""):'<div class="fin-list-empty">Chưa có tài khoản. Hãy thêm ví tiền mặt hoặc tài khoản ngân hàng để bắt đầu.</div>';
}
function renderOverview(){
  const flow=Object.fromEntries((state.overview.flow||[]).map(x=>[x.kind,x.total_twd]));
  const twd=state.data.accounts.filter(a=>a.currency_code==="TWD").reduce((s,a)=>s+Number(a.balance||0),0);
  const counts=state.data.accounts.length;
  let upcoming=state.data.plans.filter(p=>p.status==="planned").sort((a,b)=>a.plan_date.localeCompare(b.plan_date)).slice(0,5);
  return heading("Tổng quan tài chính",monthText(state.month)+" · Báo cáo theo TWD",periodInput())+
    '<div class="fin-kpis">'+
    '<section class="fin-card fin-highlight"><div class="fin-muted">Số dư TWD đã ghi sổ</div><div class="fin-kpi-value">'+moneyLabel(twd)+'</div><div class="fin-muted">Không cộng chung ngoại tệ khi thiếu tỷ giá</div></section>'+
    '<section class="fin-card"><div class="fin-muted">Thu nhập đã ghi</div><div class="fin-kpi-value">'+moneyLabel(flow.income||0)+'</div></section>'+
    '<section class="fin-card"><div class="fin-muted">Chi tiêu đã ghi</div><div class="fin-kpi-value">'+moneyLabel(flow.expense||0)+'</div></section></div>'+
    '<div class="fin-grid"><div class="fin-stack">'+
    panel("Ví & tài khoản",balances(),counts+" tài khoản · Có thể có nhiều loại ngoại tệ")+
    panel("Dòng tiền sắp tới",upcoming.length?upcoming.map(p=>row(p.from_currency+" → "+p.to_currency,p.plan_date+" · "+(p.plan_kind==="remittance"?"Gửi tiền":"Đổi tiền"),moneyLabel(p.source_amount,p.from_currency),'Kế hoạch, chưa ghi sổ')).join(""):'<div class="fin-list-empty">Chưa có lịch đổi tiền hoặc gửi tiền.</div>')+
    '</div><div class="fin-stack">'+
    panel("Thao tác nhanh",'<div class="fin-toolbar">'+button("+ Tài khoản","account")+button("+ Số dư đầu kỳ","opening",true)+button("+ Thu nhập","income",true)+button("+ Chi tiêu","expense",true)+button("+ Danh mục","category",true)+'</div>')+
    '<div class="fin-advice"><strong>Financial Advisor</strong><p style="margin:7px 0 0">Số dư được tính từ các giao dịch đã xác nhận. Kế hoạch chuyển tiền và đổi ngoại tệ chưa được trừ khỏi tài sản cho đến khi bạn ghi nhận thực tế.</p></div>'+
    '</div></div>';
}
function renderBudget(){
  const rows=(state.overview.budget||[]).filter(c=>c.kind==="expense");
  const body=rows.length?rows.map(c=>{
    const budget=Number(c.budget_twd),actual=Number(c.actual_twd);
    const pct=budget>0?Math.round(actual/budget*100):0;
    return '<div class="fin-row"><div style="flex:1"><div class="fin-stat"><strong>'+esc(c.name)+'</strong><span class="fin-tag '+(pct>100?"warn":"neutral")+'">'+(budget?pct+"%":"Chưa lập")+'</span></div>'+
     '<div class="fin-progress"><span style="width:'+Math.min(100,pct)+'%"></span></div>'+
     '<small>Đã chi '+esc(moneyLabel(actual))+' / Ngân sách '+esc(moneyLabel(budget))+'</small></div></div>';
  }).join(""):'<div class="fin-list-empty">Chưa có danh mục chi tiêu. Tạo danh mục trước khi lập ngân sách.</div>';
  return heading("Kế hoạch tháng / năm","Ngân sách kế hoạch so với chi tiêu đã ghi nhận",periodInput())+
   '<div class="fin-toolbar" style="margin-bottom:16px"><button type="button" class="fin-btn '+(state.period==="month"?"":"secondary")+'" data-period="month">Theo tháng</button><button type="button" class="fin-btn '+(state.period==="year"?"":"secondary")+'" data-period="year">Theo năm</button></div>'+
   (state.period==="year"?renderYearBudget():panel("Ngân sách "+monthText(state.month),body,"Mỗi khoản dựa vào danh mục và tháng trong Database"))+
   '<div style="margin-top:16px">'+panel("Điều chỉnh kế hoạch",'<div class="fin-toolbar">'+button("+ Ngân sách","budget")+button("+ Danh mục","category",true)+'</div>'+note("Giao dịch chuyển tiền giữa ví và đổi ngoại tệ không được tự tính là chi tiêu."))+'</div>';
}
function renderYearBudget(){
  if(!state.year||state.year.year!==Number(state.month.slice(0,4)))return panel("Kế hoạch năm",'<div class="fin-list-empty">Đang tải kế hoạch năm...</div>');
  const lines=state.year.months||[];
  return panel("Tổng hợp năm "+state.year.year,lines.map(m=>row("Tháng "+m.month.slice(5,7),"Ngân sách "+moneyLabel(m.budget_twd),"Chi "+moneyLabel(m.expense_twd),"Thu "+moneyLabel(m.income_twd))).join("")||'<div class="fin-list-empty">Chưa có số liệu năm.</div>',"Tổng ngân sách, thu nhập và chi phí theo tháng; không bao gồm chuyển khoản nội bộ.");
}
function renderFx(){
  const cs=state.data.currencies||[];
  const currencyCards=cs.map(c=>'<span class="fin-currency">'+esc(c.code)+' · '+esc(c.name_vi)+'</span>').join(" ");
  const plans=state.data.plans||[];
  return heading("Ngoại tệ & chuyển tiền","Lập kế hoạch và ghi nhận các giao dịch đã thực hiện")+
   '<div class="fin-grid"><div class="fin-stack">'+
    panel("Đổi ngoại tệ",'<div class="fin-toolbar">'+button("+ Lên lịch đổi tiền","fxPlan")+button("Ghi nhận đã đổi","fxPost",true)+'</div>'+note("Hỗ trợ mọi đồng tiền đang được bật trong Database. Hoạt động trên trang chỉ ghi sổ; không tự chuyển tiền qua ngân hàng."))+
    panel("Kế hoạch chuyển tiền",plans.length?plans.map(p=>row(p.from_currency+" → "+p.to_currency,p.plan_date+" · "+(p.plan_kind==="remittance"?"Chuyển ra ngoài":"Chuyển đổi"),moneyLabel(p.source_amount,p.from_currency),p.status==="planned"?"Dự kiến · "+safeRate(p.expected_rate):p.status)).join(""):'<div class="fin-list-empty">Chưa có lịch. Có thể lên kế hoạch đổi TWD → VND hàng tháng.</div>')+
   '</div><div class="fin-stack">'+
    panel("Các loại ngoại tệ hỗ trợ",'<div style="display:flex;flex-wrap:wrap;gap:8px">'+currencyCards+'</div>')+
    '<div class="fin-warning"><strong>Tỷ giá không phải dữ liệu live</strong><div class="fin-note">Chưa kết nối nhà cung cấp tỷ giá. Bạn nhập tỷ giá và phí tại thời điểm đổi tiền; không dùng con số ví dụ để ghi sổ.</div></div>'+
    panel("Ví đa ngoại tệ",balances())+
   '</div></div>';
}
function renderLedger(){
 const events=state.overview.events||[];
 const kinds={income:"Thu nhập",expense:"Chi tiêu",transfer:"Chuyển giữa ví",fx:"Đổi ngoại tệ",remittance:"Chuyển ra ngoài",adjustment:"Điều chỉnh",reversal:"Đảo bút toán"};
 return heading("Lịch sử giao dịch","Những giao dịch đã ghi vào Database",periodInput())+
  panel("Ghi sổ",'<div class="fin-toolbar">'+button("+ Thu nhập","income")+button("+ Chi tiêu","expense",true)+button("Chuyển giữa ví","transfer",true)+button("Đổi ngoại tệ","fxPost",true)+'</div>')+
  '<div style="margin-top:16px">'+panel("Giao dịch "+monthText(state.month),events.length?events.map(e=>{
    const detail=(e.entries||[]).map(a=>(Number(a.amount)>0?"+":"")+moneyLabel(a.amount,a.currency)).join(" · ");
    return row(kinds[e.kind]||e.kind,new Date(e.occurred_at).toLocaleDateString("vi-VN",{timeZone:"Asia/Taipei"})+" · "+(e.description||""),detail);
  }).join(""):'<div class="fin-list-empty">Chưa có giao dịch trong tháng.</div>')+'</div>';
}
function render(){
  const showLogin=!state.loading&&state.problem?.status===401;
  loginView.hidden=!showLogin;
  layout.hidden=showLogin;
  logoutButton.hidden=showLogin || state.loading;
  if(showLogin)return;
  tabs.forEach(b=>{const active=b.dataset.tab===state.tab;b.classList.toggle("active",active);b.setAttribute("aria-current",active?"page":"false");});
  if(state.loading){root.innerHTML='<div class="fin-state"><div class="fin-spinner"></div>Đang đọc dữ liệu được bảo vệ...</div>';return;}
  if(state.problem){root.innerHTML='<div class="fin-card"><h2>Không thể mở tài chính</h2><p class="fin-error">'+esc(failure(state.problem))+'</p><p class="fin-note">Nếu bạn vừa đăng nhập sai tài khoản, hãy đăng xuất và đăng nhập bằng tài khoản được cấp quyền.</p></div>';return;}
  root.innerHTML=state.tab==="overview"?renderOverview():state.tab==="budget"?renderBudget():state.tab==="fx"?renderFx():renderLedger();
}
function selectField(name,label,options,placeholder="Chọn"){
 return '<label>'+esc(label)+'<select name="'+esc(name)+'" required><option value="">'+esc(placeholder)+'</option>'+options.map(o=>'<option value="'+esc(o.value)+'">'+esc(o.label)+'</option>').join("")+'</select></label>';
}
function input(name,label,type="text",value="",placeholder="",required=true){
 return '<label>'+esc(label)+'<input name="'+esc(name)+'" type="'+esc(type)+'" value="'+esc(value)+'" placeholder="'+esc(placeholder)+'" '+(required?"required":"")+' autocomplete="off"></label>';
}
const choices=list=>list.map(x=>({value:x.id,label:accountName(x)}));
const currencyChoices=()=>state.data.currencies.map(c=>({value:c.code,label:c.code+" · "+c.name_vi}));
function showForm(kind){
 if(!state.data){return;}
 const accounts=state.data.accounts,categories=state.data.categories;
 const expense=categories.filter(c=>c.kind==="expense").map(c=>({value:c.id,label:c.name}));
 const categoryChoices=type=>categories.filter(c=>c.kind===type).map(c=>({value:c.id,label:c.name}));
 const allAccounts=choices(accounts),date=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()).slice(0,10);
 let fields="",title="";
 if(kind==="account"){
  title="Thêm tài khoản / ví";fields=input("name","Tên tài khoản","text","","Ví tiền mặt / ngân hàng")+
   selectField("kind","Loại tài khoản",[{value:"cash",label:"Tiền mặt"},{value:"bank",label:"Ngân hàng"},{value:"ewallet",label:"Ví điện tử"},{value:"other",label:"Khác"}])+
   selectField("currencyCode","Đơn vị tiền tệ",currencyChoices());
 }else if(kind==="category"){
  title="Thêm danh mục";fields=input("name","Tên danh mục")+
   selectField("kind","Loại danh mục",[{value:"expense",label:"Chi tiêu"},{value:"income",label:"Thu nhập"}]);
 }else if(kind==="budget"){
  title="Ngân sách tháng";fields=selectField("categoryId","Danh mục chi tiêu",expense)+input("month","Tháng","month",state.month)+input("amountTwd","Ngân sách (TWD)","number","","0");
 }else if(kind==="fxPlan"){
  title="Lập lịch ngoại tệ";fields=input("planDate","Ngày dự kiến","date",date)+
   selectField("planKind","Mục đích",[{value:"remittance",label:"Gửi tiền / chuyển ra ngoài"},{value:"fx",label:"Đổi ngoại tệ"}])+
   selectField("fromCurrency","Tiền gửi",currencyChoices())+selectField("toCurrency","Tiền nhận",currencyChoices())+
   input("sourceAmount","Số tiền dự kiến đổi","text","","10000")+
   input("expectedRate","Tỷ giá dự kiến (không bắt buộc)","text","","Ví dụ: 785",false)+
   input("expectedFee","Phí dự kiến trong đơn vị tiền gửi","text","0")+
   input("memo","Ghi chú","text","","Dự kiến chuyển tiền tháng này",false)+
   note("Lịch đổi tiền không làm thay đổi số dư ví. Đây không phải lệnh chuyển tiền ngân hàng.");
 }else if(kind==="income"||kind==="expense"){
  title=kind==="income"?"Ghi nhận thu nhập":"Ghi nhận chi tiêu";
  fields=selectField("accountId","Tài khoản",allAccounts)+selectField("categoryId","Danh mục",categoryChoices(kind))+
   input("amount","Số tiền","text","","1000")+
   input("toTwdRate","Tỷ giá sang TWD (tiền khác TWD)","text","","1 ngoại tệ = ? TWD",false)+
   input("description","Ghi chú","text","","",false);
 }else if(kind==="opening"){
  title="Nhập số dư đầu kỳ";fields=selectField("accountId","Tài khoản chưa có giao dịch",allAccounts)+input("amount","Số dư hiện có","text","","1000")+input("description","Ghi chú","text","Số dư ban đầu",false)+note("Chỉ nhập một lần trước khi phát sinh giao dịch. Khoản này không được tính là thu nhập trong tháng.");
 }else if(kind==="transfer"){
  title="Chuyển giữa tài khoản";fields=selectField("accountId","Từ tài khoản",allAccounts)+selectField("targetAccountId","Đến tài khoản (cùng ngoại tệ)",allAccounts)+
   input("amount","Số tiền","text","","1000")+input("description","Ghi chú","text","","",false)+note("Chuyển nội bộ không được tính là chi tiêu.");
 }else if(kind==="fxPost"){
  title="Ghi nhận đã đổi ngoại tệ";fields=selectField("accountId","Tài khoản nguồn",allAccounts)+selectField("targetAccountId","Tài khoản nhận (ngoại tệ khác)",allAccounts)+
   input("amount","Số tiền đã đổi (nguồn)","text","","10000")+
   input("receivedAmount","Số tiền thực nhận","text","","7850000")+
   input("feeAmount","Phí trả bằng tiền nguồn","text","0")+
   input("description","Ghi chú","text","","",false)+
   note("Chỉ bấm lưu sau khi tiền thực sự chuyển giữa các tài khoản thuộc sở hữu của bạn. Đây là ghi sổ, không phải lệnh chuyển tiền.");
 }
 if(!fields)return;
 dialog.dataset.formKind=kind;
 document.querySelector("#finance-dialog-title").textContent=title;
 fieldRoot.innerHTML=fields;form.reset();
 // Restore prepopulated values after reset; reset defaults are retained by browser.
 dialog.showModal();
 fieldRoot.querySelector("input,select")?.focus();
}
async function submitForm(event){
 event.preventDefault();
 if(state.busy)return;
 const kind=dialog.dataset.formKind;
 const data=Object.fromEntries(new FormData(form));
 const path={
  account:"/accounts",category:"/categories",budget:"/budgets",fxPlan:"/fx-plans",
  income:"/transactions",expense:"/transactions",transfer:"/transactions",fxPost:"/transactions",opening:"/transactions"
 }[kind];
 if(!path)return;
 let body=data;
 if(["income","expense","transfer","fxPost","opening"].includes(kind)){
   body={...data,kind:kind==="fxPost"?"fx":kind==="opening"?"adjustment":kind,idempotencyKey:crypto.randomUUID(),occurredAt:new Date().toISOString()};
   if(!data.toTwdRate)delete body.toTwdRate;
 }
 state.busy=true;
 const submit=document.querySelector("#finance-submit");submit.disabled=true;submit.textContent="Đang lưu...";
 try{
   await api(path,body,kind==="budget"?"PUT":"POST");
   dialog.close();
   await refresh();
   flash("Đã lưu và đọc lại từ Database thành công.");
 }catch(error){
   flash(failure(error));
 }finally{state.busy=false;submit.disabled=false;submit.textContent="Lưu vào Database";}
}
document.querySelector("#finance-dialog-close").addEventListener("click",()=>dialog.close());
document.querySelector("#finance-dialog-cancel").addEventListener("click",()=>dialog.close());
form.addEventListener("submit",submitForm);
loginForm.addEventListener("submit",async(event)=>{
  event.preventDefault();
  const fields=new FormData(loginForm);const button=loginForm.querySelector('button[type="submit"]');
  loginError.hidden=true;button.disabled=true;
  try{
    const response=await fetch("/api/auth/login",{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:fields.get("username"),password:fields.get("password")})});
    if(!response.ok){loginError.textContent="Tài khoản hoặc mật khẩu không đúng.";loginError.hidden=false;return;}
    loginForm.reset();state.loading=true;state.problem=null;render();await refresh();
  }catch(error){state.problem=error;state.loading=false;render();loginError.textContent=failure(error);loginError.hidden=false;}
  finally{button.disabled=false;}
});
logoutButton.addEventListener("click",async()=>{
  await fetch("/api/auth/logout",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:"{}"}).catch(()=>{});
  state.data=null;state.overview=null;state.loading=false;
  const error=new Error("AUTH_REQUIRED");error.status=401;state.problem=error;render();
});
tabs.forEach(b=>b.addEventListener("click",()=>{state.tab=b.dataset.tab;render();}));
root.addEventListener("click",event=>{
 const act=event.target.closest("[data-open]");if(act){showForm(act.dataset.open);return;}
 const period=event.target.closest("[data-period]");if(period){
   state.period=period.dataset.period;render();
   if(state.period==="year")loadYear();
 }
});
root.addEventListener("change",async event=>{
 if(event.target.id!=="fin-month")return;
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value))return;
 state.month=event.target.value;state.loading=true;render();
 try{await refresh();if(state.period==="year")loadYear();}catch(error){state.loading=false;state.problem=error;render();}
});
async function loadYear(){
 try{
  const year=Number(state.month.slice(0,4));
  const result=await api("/year?year="+year);
  state.year=result;if(state.period==="year"&&state.tab==="budget")render();
 }catch(error){flash(failure(error));}
}
(async()=>{
 try{await refresh();}catch(error){state.problem=error;state.loading=false;render();}
})();
