import {financeMonthlyTrend,financeLiquidityForecast,financeDonut} from "./finance-visuals.js";
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
const state={tab:"overview",month:nowMonth,period:"month",data:null,overview:null,cashflow:null,year:null,yearCashflow:null,loading:true,problem:null,busy:false,advisor:null,advisorBusy:false,advisorError:null,advisorDays:30,advisorBuffer:"0",advisorRequestId:0};
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
    FINANCE_DUPLICATE:"Dữ liệu có thể đã được lưu. Kiểm tra lịch sử trước khi tạo yêu cầu mới.",
    ACCOUNT_ALREADY_HAS_LEDGER:"Tài khoản đã có giao dịch; không thể ghi lại số dư đầu kỳ.",
    INVALID_GOAL:"Kiểm tra tên, ngoại tệ, số tiền mục tiêu và ngày.",
    INVALID_GOAL_AMOUNT:"Số tiền mục tiêu không hợp lệ với ngoại tệ.",
    INVALID_GOAL_UPDATE:"Giá trị tiến độ mục tiêu không hợp lệ.",
    INVALID_DEBT:"Kiểm tra số nợ, lãi suất năm (0–100%) và ngày đến hạn.",
    INVALID_DEBT_AMOUNT:"Số nợ không hợp lệ với ngoại tệ.",
    PLAN_NOT_FOUND_OR_NOT_PLANNED:"Kế hoạch không còn ở trạng thái có thể hủy.",
    INVALID_CASHFLOW_ITEM:"Dòng thu/chi dự kiến cần có tên, tháng và số TWD hợp lệ.",
    CASHFLOW_ITEM_NOT_FOUND:"Dòng kế hoạch không tồn tại hoặc không thuộc tài khoản.",
    INVALID_DEBT_FUND:"Số tiền quỹ nợ không hợp lệ với ngoại tệ.",
    DEBT_FUND_RATE_REQUIRED:"Nhập tỷ giá giả định TWD cho mỗi đơn vị ngoại tệ của khoản nợ.",
    INVALID_DEBT_PAYMENT:"Kiểm tra ví nguồn, ngày trả và các khoản gốc/lãi/phí.",
    INVALID_DEBT_PAYMENT_AMOUNT:"Số tiền trả nợ phải dương và đúng số thập phân ngoại tệ.",
    DEBT_CURRENCY_MISMATCH:"Ví trả nợ phải dùng cùng ngoại tệ với khoản nợ. Hãy đổi tiền trước nếu cần.",
    DEBT_PRINCIPAL_EXCEEDS_OUTSTANDING:"Khoản gốc trả vượt số dư nợ hiện tại.",
    DEBT_PAYMENT_RATE_REQUIRED:"Nhập tỷ giá TWD thực tế để đối chiếu lần trả nợ bằng ngoại tệ.",
    DEBT_PAYMENT_INSUFFICIENT_FUNDS:"Ví không đủ số dư đã ghi sổ để thanh toán.",
    INVALID_ADVISOR_RANGE:"Thời gian dự báo phải là 30, 60 hoặc 90 ngày.",
    INVALID_ADVISOR_BUFFER:"Mức dự trữ TWD nhập không hợp lệ.",
    INVALID_GOAL_FUND:"Số tiền quỹ mục tiêu không hợp lệ với ngoại tệ.",
    GOAL_FUND_RATE_REQUIRED:"Nhập tỷ giá TWD giả định cho mục tiêu bằng ngoại tệ.",
    GOAL_NOT_FOUND:"Mục tiêu đã bị xóa hoặc bạn không có quyền truy cập.",
    INVALID_FINANCE_SCENARIO:"Kịch bản chưa hợp lệ. Kiểm tra ngày, số tiền, thời hạn và khoản vay/hoàn trả.",
    INVALID_SCENARIO_ROW:"Kiểm tra ngày và số tiền lớn hơn 0 của từng dòng kịch bản.",
    LOAN_REPAYMENT_PAIR_REQUIRED:"Khoản vay giả định phải có đúng một dòng nhận tiền và một dòng hoàn trả.",
    INVALID_LOAN_REPAYMENT:"Ngày hoàn vay phải sau/ngang ngày nhận, tổng hoàn trả không thấp hơn tiền vay.",
    SCENARIO_DATE_OUTSIDE_WINDOW:"Có dòng kịch bản nằm ngoài phạm vi dự báo 3, 6 hoặc 12 tháng.",
    SCENARIO_LIMIT_REACHED:"Tối đa 20 kịch bản. Xóa bản không dùng trước khi tạo tiếp.",
    INVALID_SCENARIO_GOAL:"Nhập đủ hạn hoàn thành mục tiêu và số tiền cần tích lũy.",
    SCENARIO_NOT_FOUND:"Kịch bản không còn tồn tại hoặc không thuộc tài khoản của bạn.",

  };
  return errors[error?.message]||("Không lưu được: "+(error?.message||"Lỗi hệ thống"));
}
async function refresh(){
  const [data,overview,cashflow]=await Promise.all([api("/bootstrap"),api("/overview?month="+encodeURIComponent(state.month)),api("/cashflow?month="+encodeURIComponent(state.month))]);
  state.data=data;state.overview=overview;state.cashflow=cashflow;state.problem=null;state.loading=false;
  state.advisor=null;state.advisorError=null;render();
  void loadAdvice();
  if(state.tab==="workbench"&&workbookState.loaded)void loadWorkbench();
  if(["budget","report"].includes(state.tab)&&state.year?.year!==Number(state.month.slice(0,4)))void loadYear();
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
function renderFinanceControlCenter(){
 const plan=state.advisor;
 const steps='<div class="fin-guide-steps">'+
   '<p><strong>1. Số tiền thật:</strong> Tổng quan → Tài khoản → Số dư đầu kỳ, rồi ghi nhận thu/chi khi đã phát sinh.</p>'+
   '<p><strong>2. Lịch tiền:</strong> Kế hoạch → Thu dự kiến (lương) và Chi dự kiến (tiền nhà, sinh hoạt); nhập đúng ngày 1–31 cho từng tháng.</p>'+
   '<p><strong>3. Nghĩa vụ:</strong> Mục tiêu & Nợ → khai báo dư nợ, hạn trả, phân bổ quỹ từng tháng; ghi trả nợ khi đã chuyển thật.</p>'+
   '<p><strong>4. Kiểm tra:</strong> Tư vấn dòng tiền → mức dự trữ → xem ngày thiếu tiền và thứ tự khoản cần xử lý.</p></div>';
 const shortcuts='<div class="fin-toolbar"><button type="button" class="fin-btn" data-go-finance-tab="budget">Nhập ngày lương & khoản chi</button>'+
   '<button type="button" class="fin-btn secondary" data-go-finance-tab="goals">Khai báo công nợ</button>'+
   '<button type="button" class="fin-btn secondary" data-go-finance-tab="advisor">Xem lịch xoay vòng</button></div>';
 if(!plan)return panel("Điều phối thu nhập → thanh toán",'<p class="fin-muted">Đang đối chiếu lịch với dữ liệu Finance Database...</p>'+steps+shortcuts,
   "Cần nhập các khoản theo từng tháng; hệ thống không tự đoán ngày nhận lương.");
 const cycle=plan.cycles?.[0],alerts=(plan.alerts||[]).filter(x=>x.severity!=="info");
 const first=cycle?'<div class="fin-control-summary"><div><small>Đến ngày</small><strong>'+esc(cycle.endDate)+'</strong></div>'+
   '<div><small>Nghĩa vụ & chi dự kiến</small><strong>'+esc(moneyLabel(cycle.obligationsTwd))+'</strong></div>'+
   '<div><small>Dự trữ có thể thiếu</small><strong class="'+(Number(cycle.reserveGapTwd)>0?'fin-negative':'')+'">'+esc(moneyLabel(cycle.reserveGapTwd))+'</strong></div></div>'+
   '<p class="fin-note">Chu kỳ hiện tại tính tới trước lần thu dự kiến kế tiếp. Ngày này không phải ngày trả lương thật nếu lịch thu chưa được khai báo.</p>':'';
 const notices=alerts.length?alerts.slice(0,4).map(x=>'<div class="fin-alert-line '+esc(x.severity)+'"><strong>'+esc(x.title)+'</strong><span>'+esc(x.message)+'</span></div>').join(""):
   '<p class="fin-muted">Chưa có cảnh báo từ các lịch đã nhập; không đồng nghĩa mọi khoản phải trả đã được khai báo.</p>';
 return panel("Điều phối thu nhập → thanh toán",first+'<div class="fin-divider"></div>'+notices+shortcuts+
   '<details class="fin-howto"><summary>Hướng dẫn nhập dữ liệu lần đầu</summary>'+steps+'</details>',
   "Cảnh báo hiển thị khi bạn mở website; chưa phải thông báo đẩy khi đóng trình duyệt.");
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
    renderFinanceControlCenter()+
    '<div class="fin-grid"><div class="fin-stack">'+
    panel("Ví & tài khoản",balances(),counts+" tài khoản · Có thể có nhiều loại ngoại tệ")+
    panel("Dòng tiền sắp tới",upcoming.length?upcoming.map(p=>row(p.from_currency+" → "+p.to_currency,p.plan_date+" · "+(p.plan_kind==="remittance"?"Gửi tiền":"Đổi tiền"),moneyLabel(p.source_amount,p.from_currency),'Kế hoạch, chưa ghi sổ')).join(""):'<div class="fin-list-empty">Chưa có lịch đổi tiền hoặc gửi tiền.</div>')+
    '</div><div class="fin-stack">'+
    panel("Thao tác nhanh",'<div class="fin-toolbar">'+button("+ Tài khoản","account")+button("+ Số dư đầu kỳ","opening",true)+button("+ Thu nhập","income",true)+button("+ Chi tiêu","expense",true)+button("+ Danh mục","category",true)+'</div>')+
    '<div class="fin-advice"><strong>Financial Advisor</strong><p style="margin:7px 0 0">Số dư được tính từ các giao dịch đã xác nhận. Kế hoạch chuyển tiền và đổi ngoại tệ chưa được trừ khỏi tài sản cho đến khi bạn ghi nhận thực tế.</p></div>'+
    '</div></div>';
}

function renderCashflow(){
 const cf=state.cashflow||{},items=cf.items||[],funds=cf.debtFunds||[],goalFunds=cf.goalFunds||[],summary=cf.summary||{};
 const plannedNet=Number(summary.planned_net_twd||0);
 const actualNet=Number(summary.actual_net_twd||0);
 const cards='<div class="fin-kpis fin-plan-kpis">'+
  '<section class="fin-card"><div class="fin-muted">Thu dự kiến</div><div class="fin-kpi-value">'+esc(moneyLabel(summary.planned_income_twd||0))+'</div></section>'+
  '<section class="fin-card"><div class="fin-muted">Chi dự kiến</div><div class="fin-kpi-value">'+esc(moneyLabel(summary.planned_expense_twd||0))+'</div></section>'+
  '<section class="fin-card"><div class="fin-muted">Quỹ trả nợ dự kiến</div><div class="fin-kpi-value">'+esc(moneyLabel(summary.planned_debt_fund_twd||0))+'</div></section>'+
  '<section class="fin-card"><div class="fin-muted">Quỹ mục tiêu dự kiến</div><div class="fin-kpi-value">'+esc(moneyLabel(summary.planned_goal_fund_twd||0))+'</div></section></div>';
 const plannedRows=items.length?items.map(x=>
  '<div class="fin-row fin-action-row"><div><strong>'+esc(x.label)+'</strong><small>'+esc(x.kind==="income"?"Thu dự kiến":"Chi dự kiến")+
  (x.due_day?' · Ngày '+esc(x.due_day):'')+(x.memo?' · '+esc(x.memo):'')+'</small></div>'+
  '<div class="fin-action-end"><strong>'+esc(moneyLabel(x.amount_twd))+'</strong><button type="button" class="fin-btn secondary fin-small-action" data-edit-cashflow="'+esc(x.id)+'">Sửa</button>'+
  '<button type="button" class="fin-btn secondary fin-small-action" data-delete-cashflow="'+esc(x.id)+'">Xóa</button></div></div>').join(""):'<div class="fin-list-empty">Chưa có khoản thu/chi dự kiến. Thêm kế hoạch theo tháng để tính dòng tiền.</div>';
 const fundText=(funds.length||goalFunds.length)?
   '<p class="fin-muted">Đã đánh dấu dành dụm: quỹ nợ '+esc(moneyLabel(summary.earmarked_debt_fund_twd||0))+
   ', quỹ mục tiêu '+esc(moneyLabel(summary.earmarked_goal_fund_twd||0))+' — chỉ để theo dõi, không phải tiền đã chuyển ví.</p>':"";
 const debts=state.data?.debts||[],goals=state.data?.goals||[];
 const allocationRows=goals.map(g=>{
   const fund=goalFunds.find(x=>x.goal_id===g.id);
   return '<div class="fin-row fin-action-row"><div><strong>'+esc(g.name)+' · Mục tiêu</strong><small>'+
     (fund?'Kế hoạch '+esc(moneyLabel(fund.planned_amount,g.currency_code))+' · Đã đánh dấu '+esc(moneyLabel(fund.earmarked_amount,g.currency_code)):
       'Chưa phân bổ tiền tháng này')+'</small></div><button class="fin-btn secondary fin-small-action" type="button" data-goal-fund="'+esc(g.id)+'">'+(fund?'Sửa quỹ':'Phân bổ')+'</button></div>';
 }).concat(debts.map(d=>{
   const fund=funds.find(x=>x.debt_id===d.id);
   return '<div class="fin-row fin-action-row"><div><strong>'+esc(d.name)+' · Nợ</strong><small>'+
     (fund?'Kế hoạch '+esc(moneyLabel(fund.planned_amount,d.currency_code))+' · Đã đánh dấu '+esc(moneyLabel(fund.earmarked_amount,d.currency_code)):
       'Chưa phân bổ tiền tháng này')+'</small></div><button class="fin-btn secondary fin-small-action" type="button" data-fund-debt="'+esc(d.id)+'">'+(fund?'Sửa quỹ':'Phân bổ')+'</button></div>';
 })).join("");
 return '<div class="fin-stack fin-cashflow-section">'+
  panel("Dự báo dòng tiền · "+monthText(state.month),cards+
   '<div class="fin-cashflow-totals"><div><span>Còn lại theo kế hoạch</span><strong class="'+(plannedNet<0?"fin-negative":"")+'">'+esc(moneyLabel(plannedNet))+'</strong></div>'+
   '<div><span>Thu thực tế − chi thực tế − nợ đã trả</span><strong class="'+(actualNet<0?"fin-negative":"")+'">'+esc(moneyLabel(actualNet))+'</strong></div></div>'+
   note("Còn lại = Thu dự kiến − Chi dự kiến − Quỹ nợ − Quỹ mục tiêu. Chỉ số phân bổ dự kiến, không trừ số dư ví. Không nhập lại quỹ vào Chi dự kiến để tránh trừ hai lần.")+fundText)+
  panel("Phân bổ từ Mục tiêu & Nợ",allocationRows||'<div class="fin-list-empty">Chưa tạo mục tiêu hoặc khoản nợ. Tạo trong tab Mục tiêu & Nợ trước khi phân bổ.</div>',"Sửa quỹ ở đây hoặc ở tab Mục tiêu & Nợ đều cập nhật cùng một Database.")+
  panel("Lịch thu/chi dự kiến",'<div class="fin-toolbar">'+button("+ Thu dự kiến","cashIncome")+button("+ Chi dự kiến","cashExpense",true)+'</div>'+plannedRows,
    "Bạn có thể sửa, xóa các khoản trong tháng. Chỉ ghi dữ liệu kế hoạch, không tự tạo giao dịch.")+
 '</div>';
}

function fMonthEnd(month){return new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);}
function financePlanRows(){
 const cf=state.cashflow||{},items=cf.items||[],funds=cf.debtFunds||[],goals=cf.goalFunds||[];
 const rows=items.map(i=>({id:i.id,kind:i.kind,title:i.label,category:i.kind==="income"?"Thu nhập":"Chi tiêu",
  due:i.due_day?state.month+"-"+String(Math.min(Number(i.due_day),Number(fMonthEnd(state.month).slice(-2)))).padStart(2,"0"):fMonthEnd(state.month),
  guessed:!i.due_day,value:Number(i.amount_twd)||0,source:"plan",memo:i.memo||"",priority:i.kind==="income"?"Thường":"Cần kiểm tra"}));
 for(const x of funds)rows.push({id:x.id,kind:"debt",title:x.debt_name||"Quỹ nợ",category:"Công nợ",
  due:x.due_date?.startsWith(state.month)?x.due_date:fMonthEnd(state.month),
  guessed:!x.due_date?.startsWith(state.month),value:Number(x.planned_amount)*Number(x.fx_rate_to_twd||0),
  source:"debt",memo:x.currency_code&&x.currency_code!=="TWD"?"Quỹ bằng "+x.currency_code+", tỷ giá kế hoạch":"" ,priority:"Cần kiểm tra",
  missingFx:x.fx_rate_to_twd==null});
 for(const x of goals)rows.push({id:x.id,kind:"goal",title:x.goal_name||"Quỹ mục tiêu",category:"Mục tiêu",
  due:x.target_date?.startsWith(state.month)?x.target_date:fMonthEnd(state.month),
  guessed:!x.target_date?.startsWith(state.month),value:Number(x.planned_amount)*Number(x.fx_rate_to_twd||0),
  source:"goal",memo:x.currency_code&&x.currency_code!=="TWD"?"Quỹ bằng "+x.currency_code:"",priority:"Linh hoạt",
  missingFx:x.fx_rate_to_twd==null});
 return rows.sort((a,b)=>a.due.localeCompare(b.due)||(a.kind==="income"?-1:1));
}
function finMoneyCell(value,sign){
 if(!Number.isFinite(value))return '<span class="fin-txt-soft">Chưa có tỷ giá</span>';
 return '<span class="'+(sign?"fin-number-out":"fin-number-in")+'">'+esc(moneyLabel(value))+'</span>';
}
function renderFinancePlanTable(){
 const all=financePlanRows();const advisor=state.advisor;
 const entries=advisor?.entries?.filter(e=>e.date.startsWith(state.month))||[];
 const byPlan=new Map();
 for(const e of entries){
  const key=e.source+"|"+e.label+"|"+e.date;
  byPlan.set(key,e.projectedBalanceTwd);
 }
 const body=all.map((i,j)=>{
  const kind=i.kind==="income"?"Thu nhập":i.kind==="debt"?"Công nợ":i.kind==="goal"?"Mục tiêu":"Chi tiêu";
  const tag=i.kind==="income"?"income":i.kind==="debt"?"debt":i.kind==="goal"?"goal":"expense";
  const past=advisor&&i.due<advisor.asOf;
  // No fabricated balance for past rows, unknown FX or outside loaded advisor horizon.
  const sourceLabel=i.kind==="income"||i.kind==="expense"?i.title:i.kind==="debt"?"Quỹ nợ · "+i.title:"Quỹ mục tiêu · "+i.title;
  const sourceType=i.source==="plan"?"cashflow":i.source==="debt"?"debt_fund":"goal_fund";
  const key=sourceType+"|"+sourceLabel+"|"+i.due;
  const knownBalance=!past&&byPlan.has(key)?moneyLabel(byPlan.get(key)):"—";
  return '<tr><td class="fin-index">'+(j+1)+'</td><td><span class="fin-plan-kind '+tag+'">'+kind+'</span></td>'+
   '<td>'+esc(i.due.slice(8)+"/"+i.due.slice(5,7))+(i.guessed?' <small class="fin-approx">ước tính</small>':'')+'</td>'+
   '<td><strong>'+esc(i.title)+'</strong></td><td>'+esc(i.category)+'</td>'+
   '<td class="fin-right">'+(i.kind==="income"?finMoneyCell(i.value,false):"—")+'</td>'+
   '<td class="fin-right">'+(i.kind!=="income"?finMoneyCell(i.value,true):"—")+'</td>'+
   '<td class="fin-right">'+esc(knownBalance)+'</td>'+
   '<td><span class="fin-priority '+(i.priority==="Linh hoạt"?"optional":"")+'">'+esc(i.priority)+'</span></td>'+
   '<td class="fin-plan-memo">'+esc(i.memo||"—")+'</td>'+
   '<td><div class="fin-inline-actions">'+(i.source==="plan"?
    '<button type="button" class="fin-icon-button" aria-label="Sửa '+esc(i.title)+'" data-edit-cashflow="'+esc(i.id)+'">✎</button>'+
    '<button type="button" class="fin-icon-button" aria-label="Xóa '+esc(i.title)+'" data-delete-cashflow="'+esc(i.id)+'">×</button>':
    '<button type="button" class="fin-icon-button" data-go-finance-tab="goals" aria-label="Điều chỉnh quỹ '+esc(i.title)+'">✎</button>')+'</div></td></tr>';
 }).join("");
 return '<div class="fin-table-scroll"><table class="fin-data-table fin-plan-table"><thead><tr>'+
   '<th>#</th><th>Loại</th><th>Ngày</th><th>Nội dung</th><th>Danh mục</th><th>Thu (TWD)</th><th>Chi (TWD)</th>'+
   '<th>Số dư sau dòng *</th><th>Ưu tiên</th><th>Ghi chú</th><th></th></tr></thead><tbody>'+
   (body||'<tr><td colspan="11" class="fin-table-empty">Chưa có lịch tiền. Thêm dòng thu/chi hoặc phân bổ quỹ nợ, mục tiêu.</td></tr>')+
   '</tbody></table></div><div class="fin-table-footer"><small>* Số dư chỉ hiện với dòng dự báo khớp lịch Finance; các khoản quá khứ, ngoài phạm vi hoặc chưa đủ thông tin hiển thị “—”. Không trừ các khoản đã ghi sổ lần nữa.</small>'+
   '<button type="button" class="fin-table-add" data-open="cashIncome">+ Thu dự kiến</button>'+
   '<button type="button" class="fin-table-add" data-open="cashExpense">+ Chi dự kiến</button></div>';
}
function finMetric(label,value,color="blue",subtitle=""){
 return '<div class="fin-metric fin-metric-'+color+'"><div><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong>'+
   (subtitle?'<small>'+esc(subtitle)+'</small>':'')+'</div><span class="fin-metric-orb" aria-hidden="true">'+
   ({blue:"▣",green:"↥",orange:"↧",purple:"◔"}[color]||"●")+'</span></div>';
}
function renderPlanAlertSummary(){
 const a=state.advisor,warning=a?.earliestRisk;
 const alerts=warning?'<div class="fin-alert-box danger"><strong>Thiếu dự trữ từ '+esc(warning.date)+'</strong><p>Chênh lệch '+
  esc(moneyLabel(warning.gapTwd))+' ở khoản '+esc(warning.label)+'. Cần kiểm tra trước ngày thanh toán.</p></div>':
  '<div class="fin-alert-box info"><strong>Chưa phát hiện ngày hụt dự trữ trong lịch đã nhập</strong><p>Nếu thiếu khoản chi, kế hoạch vẫn có thể sai.</p></div>';
 const future=(a?.alerts||[]).slice(0,3).map(x=>'<div class="fin-alert-box '+(x.severity==="danger"?"danger":"warning")+'"><strong>'+
   esc(x.title)+'</strong><p>'+esc(x.message)+'</p></div>').join("");
 return '<div class="fin-dash-side">'+panel("Cảnh báo dòng tiền",alerts+future+
   '<button class="fin-text-link" type="button" data-go-finance-tab="advisor">Xem tư vấn chi tiết →</button>')+
   panel("Phân bổ mục tiêu",((state.data?.goals||[]).length?state.data.goals.map(g=>{
      const target=Number(g.target_amount),saved=Number(g.current_amount);const pct=target>0?Math.min(100,Math.round(saved/target*100)):0;
      return '<div class="fin-goal-small"><div class="fin-stat"><strong>'+esc(g.name)+'</strong><small>'+pct+'%</small></div>'+
       '<div class="fin-progress"><span style="width:'+pct+'%"></span></div><small>'+esc(moneyLabel(g.current_amount,g.currency_code))+
       ' / '+esc(moneyLabel(g.target_amount,g.currency_code))+'</small></div>';
   }).join(""):'<p class="fin-muted">Chưa thiết lập mục tiêu.</p>'))+
   panel("Gợi ý hành động",renderAdvisorActionsCompact(a));
}
function renderAdvisorActionsCompact(advisor){
 const recs=(advisor?.recommendations||[]).slice(0,3);
 const list=recs.map((x,i)=>'<div class="fin-action-tip"><span class="fin-action-count">'+(i+1)+'</span><p><strong>'+esc(x.title)+'</strong><small>'+
   esc(x.detail)+'</small></p></div>').join("");
 return (list||'<p class="fin-muted">Đang lấy lịch dòng tiền hoặc chưa có khuyến nghị.</p>')+
  '<button type="button" class="fin-text-link" data-go-finance-tab="workbench">Thử phương án →</button>';
}
function renderBudget(){
 if(state.period==="year"){
  return heading("Kế hoạch tài chính · Theo năm","Đối chiếu tổng ngân sách thực chi và phân bổ quỹ từng tháng từ dữ liệu đã ghi.",periodInput())+
    '<div class="fin-toolbar fin-page-toolbar"><button class="fin-btn secondary" type="button" data-period="month">← Về kế hoạch tháng</button>'+
    button("+ Ngân sách","budget")+button("+ Danh mục","category",true)+'</div>'+
    renderYearBudget()+renderYearCashflow();
 }
 const s=state.cashflow?.summary||{},planned=Number(s.planned_net_twd)||0;
 const debt=Number(s.planned_debt_fund_twd)||0,goal=Number(s.planned_goal_fund_twd)||0;
 const twd=(state.data?.accounts||[]).filter(x=>x.currency_code==="TWD").reduce((n,a)=>n+Number(a.balance||0),0);
 const charts=state.advisor?financeLiquidityForecast(state.advisor):
  '<div class="fin-list-empty">Đang tải dự báo theo ngày từ Finance Database...</div>';
 const yearRows=state.yearCashflow?.months||[];
 const firstIndex=yearRows.findIndex(x=>x.month===state.month);
 const next=firstIndex>=0?yearRows.slice(firstIndex,firstIndex+3):[];
 const threeMonth=next.length?'<div class="fin-table-scroll"><table class="fin-data-table fin-three-month"><thead><tr><th>Khoản</th>'+
  next.map(x=>'<th>'+esc(monthText(x.month))+'</th>').join("")+'</tr></thead><tbody>'+
  [["Thu nhập","planned_income_twd"],["Chi bắt buộc dự kiến","planned_expense_twd"],["Quỹ nợ","debt_fund_twd"],["Quỹ mục tiêu","goal_fund_twd"]].map(([name,key])=>
   '<tr><td>'+name+'</td>'+next.map(x=>'<td>'+esc(moneyLabel(x[key]||0))+'</td>').join("")+'</tr>').join("")+
   '<tr><td><strong>Dòng tiền còn phân bổ</strong></td>'+next.map(x=>'<td><strong>'+
   esc(moneyLabel(Number(x.planned_income_twd||0)-Number(x.planned_expense_twd||0)-Number(x.debt_fund_twd||0)-Number(x.goal_fund_twd||0)))+'</strong></td>').join("")+'</tr>'+
   '</tbody></table></div>':
   '<p class="fin-muted">Đang tải kế hoạch 3 tháng từ Finance Database. Các tháng chưa lập lịch không được tự giả định bằng tháng trước.</p>';
 return heading("Kế hoạch tài chính","Lập lịch thu/chi và nghĩa vụ theo ngày; chỉnh sửa kế hoạch mà không động vào giao dịch thật.",periodInput())+
  '<div class="fin-toolbar fin-page-toolbar">'+
  '<label class="fin-search-label"><span>⌕</span><input type="search" data-fin-table-filter placeholder="Tìm trong bảng kế hoạch" aria-label="Tìm trong bảng kế hoạch"></label>'+
  '<button type="button" class="fin-btn secondary" data-period="year">Kế hoạch năm</button>'+
  '<button type="button" class="fin-btn secondary" data-go-finance-tab="report">Báo cáo</button>'+
  button("+ Thêm khoản thu","cashIncome")+button("+ Thêm khoản chi","cashExpense",true)+'</div>'+
  '<div class="fin-metrics-4">'+
   finMetric("Số dư TWD thực hiện có",moneyLabel(twd),"blue","Không cộng ngoại tệ chưa định giá")+
   finMetric("Thu nhập dự kiến",moneyLabel(s.planned_income_twd||0),"green","Theo lịch đã nhập trong tháng")+
   finMetric("Chi dự kiến + quỹ nợ",moneyLabel(Number(s.planned_expense_twd||0)+debt),"orange","Chưa gồm quỹ mục tiêu")+
   finMetric("Còn phân bổ theo kế hoạch",moneyLabel(planned),"purple","Thu - Chi - Nợ - Mục tiêu")+'</div>'+
  '<div class="fin-dash-layout">'+
   '<div class="fin-dash-main">'+
    panel("Bảng kế hoạch theo tháng",renderFinancePlanTable(),"Có thể sửa các ô kế hoạch; các khoản công nợ & mục tiêu điều chỉnh từ mục tương ứng.")+
    '<div class="fin-dash-bottom">'+
     panel("Dòng tiền "+esc(state.advisor?.days||30)+" ngày tới",'<div class="fin-chart-legend"><span class="blue">Số dư</span><span class="green">Thu dự kiến</span><span class="coral">Chi & quỹ</span><span class="orange">Mức dự trữ</span></div>'+charts)+
     panel("Gợi ý xoay vòng",renderAdvisorActionsCompact(state.advisor))+'</div>'+
    panel("Kế hoạch 3 tháng tới",threeMonth)+
    panel("Ngân sách theo danh mục",renderBudgetCategories())+
   '</div>'+renderPlanAlertSummary()+
   '</div>';
}
function renderBudgetCategories(){
 const rows=(state.overview?.budget||[]).filter(c=>c.kind==="expense");
 return rows.length?rows.map(c=>{
  const planned=Number(c.budget_twd)||0,actual=Number(c.actual_twd)||0,pct=planned>0?Math.round(actual/planned*100):0;
  return '<div class="fin-budget-inline"><div class="fin-stat"><strong>'+esc(c.name)+'</strong><small>'+
   esc(moneyLabel(actual))+' / '+esc(moneyLabel(planned))+'</small></div><div class="fin-progress"><span style="width:'+Math.min(100,pct)+'%;background:'+(pct>100?'#ec6674':'#1bb992')+'"></span></div></div>';
 }).join(""):'<p class="fin-muted">Chưa có ngân sách danh mục, có thể thêm trong phần kế hoạch.</p>';
}
function renderReport(){
 const flow=Object.fromEntries((state.overview?.flow||[]).map(x=>[x.kind,Number(x.total_twd)||0]));
 const income=flow.income||0,expenses=flow.expense||0,net=income-expenses;
 const rows=(state.overview?.budget||[]).filter(x=>x.kind==="expense");
 const categories=rows.map(x=>({name:x.name,value:Number(x.actual_twd)||0})).filter(x=>x.value>0);
 const total=categories.reduce((s,x)=>s+x.value,0),maxSpend=Math.max(0,...categories.map(x=>x.value));
 const spending=rows.map(x=>{
  const budget=Number(x.budget_twd)||0,actual=Number(x.actual_twd)||0,diff=budget-actual;
  return '<tr><td>'+esc(x.name)+'</td><td class="fin-right">'+esc(moneyLabel(budget))+'</td><td class="fin-right">'+esc(moneyLabel(actual))+
   '</td><td class="fin-right '+(diff<0?'fin-number-out':'fin-number-in')+'">'+esc(moneyLabel(diff))+'</td>'+
   '<td><div class="fin-ratio"><span>'+esc(budget>0?Math.round(actual/budget*100)+"%":"Chưa lập")+'</span>'+
   '<div class="fin-progress"><span style="width:'+Math.min(100,budget>0?actual/budget*100:0)+'%;background:'+(actual>budget?'#f17678':'#24b891')+'"></span></div></div></td></tr>';
 }).join("");
 const history=(state.overview?.events||[]).filter(e=>["income","expense","remittance","fx","transfer"].includes(e.kind));
 const ledger=history.map(e=>{
  const t=new Date(e.occurred_at).toLocaleDateString("vi-VN",{timeZone:"Asia/Taipei"});
  const twdEntries=(e.entries||[]).filter(x=>x.currency==="TWD");
  const credit=twdEntries.filter(x=>Number(x.amount)>0).reduce((n,x)=>n+Number(x.amount),0);
  const debit=twdEntries.filter(x=>Number(x.amount)<0).reduce((n,x)=>n+Math.abs(Number(x.amount)),0);
  return '<tr><td>'+esc(t)+'</td><td><strong>'+esc(e.description||e.kind)+'</strong></td><td>'+
   esc(({income:"Thu nhập",expense:"Chi tiêu",remittance:"Chuyển ra ngoài",fx:"Ngoại tệ",transfer:"Chuyển nội bộ"})[e.kind])+'</td>'+
   '<td class="fin-right">'+(credit?finMoneyCell(credit,false):"—")+'</td><td class="fin-right">'+(debit?finMoneyCell(debit,true):"—")+
   '</td><td><small>'+esc(e.kind==="transfer"?"Không phải chi tiêu":e.kind==="fx"?"Đổi ngoại tệ, không phải chi tiêu":"Đã ghi sổ")+'</small></td></tr>';
 }).join("");
 const warnings=rows.filter(x=>Number(x.actual_twd)>Number(x.budget_twd)&&Number(x.budget_twd)>0).sort((a,b)=>
  (Number(b.actual_twd)-Number(b.budget_twd))-(Number(a.actual_twd)-Number(a.budget_twd))).slice(0,4);
 const notice=warnings.map(x=>'<div class="fin-alert-box danger"><strong>'+esc(x.name)+' vượt ngân sách '+
   esc(moneyLabel(Number(x.actual_twd)-Number(x.budget_twd)))+'</strong><p>Chi '+
   esc(moneyLabel(x.actual_twd))+' so với kế hoạch '+esc(moneyLabel(x.budget_twd))+'.</p></div>').join("")||
   '<div class="fin-alert-box info"><strong>Không có danh mục vượt ngân sách đã nhập</strong><p>Kiểm tra danh mục chưa lập ngân sách trước khi đánh giá.</p></div>';
 return heading("Dòng tiền & Báo cáo","Thu chi thực tế, cơ cấu chi phí, chênh lệch ngân sách và lịch sử giao dịch.",periodInput())+
   '<div class="fin-toolbar fin-page-toolbar"><label class="fin-search-label"><span>⌕</span><input type="search" data-fin-table-filter placeholder="Tìm giao dịch và danh mục" aria-label="Tìm giao dịch và danh mục"></label><button class="fin-btn secondary" type="button" data-go-finance-tab="budget">Kế hoạch ↗</button>'+
   '<button class="fin-btn secondary" type="button" data-report-export="csv">Xuất CSV</button>'+
   '<button class="fin-btn secondary" type="button" data-report-print="1">In / Lưu PDF</button></div>'+
   '<div class="fin-metrics-4">'+
    finMetric("Tổng thu đã ghi",moneyLabel(income),"green","Không gồm chuyển nội bộ")+
    finMetric("Tổng chi đã ghi",moneyLabel(expenses),"orange","Không gồm đổi ngoại tệ")+
    finMetric("Thu − chi đã ghi",moneyLabel(net),"blue","Không đồng nghĩa số tiền khả dụng")+
    finMetric("Tỷ lệ dư sau chi",income?Math.round(net/income*100)+"%":"—","purple","Không bao gồm nghĩa vụ chưa trả")+'</div>'+
   '<div class="fin-report-charts">'+
    panel("Xu hướng thu/chi trong năm "+esc(state.month.slice(0,4)),
      '<div class="fin-chart-legend"><span class="green">Thu</span><span class="coral">Chi</span><span class="blue">Chênh lệch</span></div>'+
      (state.year?.year===Number(state.month.slice(0,4))?financeMonthlyTrend(state.year.months):'<div class="fin-list-empty">Đang đọc báo cáo năm...</div>'),
      "Số thực tế đã ghi sổ, không dùng dự kiến.")+
    panel("Cơ cấu chi tiêu trong tháng",financeDonut(categories),"Theo danh mục chi thực tế trong Finance Database.")+
   '</div>'+
   '<div class="fin-report-detail">'+
    panel("Báo cáo theo danh mục",'<div class="fin-table-scroll"><table class="fin-data-table"><thead><tr><th>Danh mục</th><th>Ngân sách</th><th>Thực chi</th><th>Còn / vượt</th><th>Tỷ lệ</th></tr></thead><tbody>'+
      (spending||'<tr><td colspan="5" class="fin-table-empty">Chưa có dữ liệu chi tiêu theo danh mục.</td></tr>')+'</tbody></table></div>')+
    panel("Điểm cần chú ý",notice)+
   '</div>'+
   panel("Giao dịch chi tiết đã ghi",'<div class="fin-table-scroll"><table class="fin-data-table"><thead><tr>'+
     '<th>Ngày</th><th>Nội dung</th><th>Loại</th><th>Tiền vào TWD</th><th>Tiền ra TWD</th><th>Ghi chú</th></tr></thead><tbody>'+
     (ledger||'<tr><td colspan="6" class="fin-table-empty">Chưa có giao dịch trong kỳ.</td></tr>')+'</tbody></table></div>',
     "Báo cáo giao dịch chỉ hiển thị phần liên quan TWD; chuyển nội bộ và đổi tiền không bị nhầm thành chi tiêu.");
}

function renderYearBudget(){
  if(!state.year||state.year.year!==Number(state.month.slice(0,4)))return panel("Kế hoạch năm",'<div class="fin-list-empty">Đang tải kế hoạch năm...</div>');
  const lines=state.year.months||[];
  return panel("Tổng hợp năm "+state.year.year,lines.map(m=>row("Tháng "+m.month.slice(5,7),"Ngân sách "+moneyLabel(m.budget_twd),"Chi "+moneyLabel(m.expense_twd),"Thu "+moneyLabel(m.income_twd))).join("")||'<div class="fin-list-empty">Chưa có số liệu năm.</div>',"Tổng ngân sách, thu nhập và chi phí theo tháng; không bao gồm chuyển khoản nội bộ.");
}

function renderYearCashflow(){
 const y=state.yearCashflow,year=Number(state.month.slice(0,4));
 if(!y||y.year!==year)return panel("Dự báo dòng tiền năm",'<div class="fin-list-empty">Đang tải kế hoạch dòng tiền năm...</div>');
 return '<div style="margin-top:16px">'+panel("Dòng tiền dự kiến năm "+year,(y.months||[]).map(m=>{
  const net=Number(m.planned_income_twd)-Number(m.planned_expense_twd)-Number(m.debt_fund_twd)-Number(m.goal_fund_twd||0);
  return row("Tháng "+m.month.slice(5,7),
    "Thu "+moneyLabel(m.planned_income_twd)+" · Chi "+moneyLabel(m.planned_expense_twd)+" · Quỹ nợ "+moneyLabel(m.debt_fund_twd)+" · Quỹ mục tiêu "+moneyLabel(m.goal_fund_twd||0),
    moneyLabel(net),"Trả nợ thực tế "+moneyLabel(m.debt_paid_twd));
 }).join(""),"Tổng dự kiến không mặc nhiên trở thành thu/chi thực tế.")+'</div>';
}

function renderAdvice(){
 const data=state.advisor,problem=state.advisorError;
 const header=heading("Tư vấn dòng tiền","Dự báo số dư và sắp xếp lịch thu/chi dựa trên dữ liệu Finance PostgreSQL")+
   '<div class="fin-advisor-controls"><label>Khoảng dự báo<select id="fin-advice-days" aria-label="Số ngày dự báo">'+
   [30,60,90].map(n=>'<option value="'+n+'"'+(n===state.advisorDays?" selected":"")+'>'+n+' ngày</option>').join("")+
   '</select></label><label>Mức dự trữ TWD<input id="fin-advice-buffer" type="number" min="0" step="1" max="99999999999" value="'+esc(state.advisorBuffer)+'"></label>'+
   '<button class="fin-btn" type="button" data-advice-refresh'+(state.advisorBusy?' disabled':'')+'>Phân tích dòng tiền</button></div>';
 if(state.advisorBusy)return header+'<div class="fin-state"><div class="fin-spinner"></div>Đang tính theo dữ liệu đã ghi sổ và lịch thu/chi...</div>';
 if(problem)return header+panel("Chưa thể tính lịch",'<p class="fin-error">'+esc(failure(problem))+'</p><p class="fin-note">Không sử dụng dự báo cũ nếu Database không phản hồi.</p>');
 if(!data)return header+panel("Chọn khoảng dự báo",'<p class="fin-list-empty">Chọn 30/60/90 ngày để xem lịch dòng tiền, rủi ro và các phương án cân đối.</p>');
 const shortfall=data.earliestRisk;
 const stats='<div class="fin-kpis fin-advisor-kpis">'+
   '<section class="fin-card"><div class="fin-muted">Số dư TWD hiện có</div><div class="fin-kpi-value">'+esc(moneyLabel(data.startingBalanceTwd))+'</div></section>'+
   '<section class="fin-card"><div class="fin-muted">Dự kiến cuối kỳ</div><div class="fin-kpi-value">'+esc(moneyLabel(data.projectedEndingTwd))+'</div></section>'+
   '<section class="fin-card"><div class="fin-muted">Số dư thấp nhất</div><div class="fin-kpi-value">'+esc(moneyLabel(data.minimumBalanceTwd))+'</div><small>'+esc(data.minimumDate||"")+'</small></section>'+
   '<section class="fin-card"><div class="fin-muted">Mức dự trữ</div><div class="fin-kpi-value">'+esc(moneyLabel(data.bufferTwd))+'</div></section></div>';
 const risk=shortfall?
   '<div class="fin-advice-risk"><strong>Thiếu hụt dự kiến: '+esc(shortfall.date)+'</strong><p>Khoảng thiếu '+esc(moneyLabel(shortfall.gapTwd))+' so với mức dự trữ. Nguyên nhân gần nhất: '+esc(shortfall.label)+'.</p></div>':
   '<p class="fin-advice-ok">Chưa phát hiện ngày số dư TWD xuống dưới mức dự trữ trong các lịch đã nhập.</p>';
 const totals='<div class="fin-cashflow-totals fin-advice-summary">'+
   '<div><span>Thu dự kiến</span><strong>'+esc(moneyLabel(data.totals.income))+'</strong></div>'+
   '<div><span>Chi dự kiến + quỹ nợ/mục tiêu + chuyển ra ngoài</span><strong>'+
   esc(moneyLabel(data.totalOutflowTwd))+'</strong></div></div>';
 const cycles=(data.cycles||[]).map((cycle,i)=>'<div class="fin-cycle-row"><div class="fin-stat"><strong>'+
   esc('Kỳ '+String(i+1)+' · '+cycle.startDate+' → '+cycle.endDate)+'</strong><span class="fin-tag '+
   (Number(cycle.reserveGapTwd)>0?'warn':'neutral')+'">'+(Number(cycle.reserveGapTwd)>0?'Có nguy cơ hụt tiền':'Theo lịch đã nhập')+'</span></div>'+
   '<small>Thu dự kiến: '+esc(moneyLabel(cycle.incomeTwd))+' · Chi & nghĩa vụ: '+esc(moneyLabel(cycle.obligationsTwd))+
   ' · Quỹ mục tiêu: '+esc(moneyLabel(cycle.goalAllocationsTwd))+'</small>'+
   '<small>Số dư thấp nhất: '+esc(moneyLabel(cycle.minimumBalanceTwd))+
   ' · Chênh lệch dưới dự trữ: '+esc(moneyLabel(cycle.reserveGapTwd))+'</small>'+
   (cycle.nextIncomeDate?'<small>Kỳ thu tiếp theo: '+esc(cycle.nextIncomeDate)+'</small>':'<small>Chưa có kỳ thu nhập tiếp theo trong giai đoạn dự báo</small>')+
   '</div>').join("");
 const alerts=(data.alerts||[]).map(x=>'<div class="fin-alert-line '+esc(x.severity)+'"><strong>'+esc(x.title)+'</strong>'+
   '<span>'+esc(x.message)+'</span></div>').join("");
 const guidance=(data.recommendations||[]).map((rec,i)=>
   '<div class="fin-advisor-suggestion"><strong>'+esc(String(i+1)+". "+rec.title)+'</strong><p>'+esc(rec.detail)+'</p></div>').join("");
 const warnings=(data.warnings||[]).map(w=>'<div class="fin-advisor-warning"><strong>'+esc(w.code.replace(/_/g," "))+'</strong><p>'+esc(w.message)+'</p></div>').join("");
 const icons={income:"+",expense:"−",debt:"−",goal:"−",remittance:"−"};
 const timeline=(data.entries||[]).map(item=>{
   const inc=item.kind==="income";
   return '<div class="fin-advice-event"><div class="fin-advice-event-date">'+esc(item.date)+'</div>'+
    '<div class="fin-advice-event-info"><strong>'+esc(item.label)+'</strong><small>'+
     esc(({income:"Thu",expense:"Chi",goal:"Quỹ mục tiêu",debt:"Quỹ trả nợ",remittance:"Chuyển tiền ra ngoài"})[item.kind]||item.kind)+
     (item.estimatedDate?' · Ngày tạm tính':'')+'</small></div>'+
    '<div class="fin-advice-event-money '+(inc?'positive':'negative')+'">'+esc(icons[item.kind]||"")+
      esc(moneyLabel(item.amountTwd).replace("-",""))+
      '<small>Còn '+esc(moneyLabel(item.projectedBalanceTwd))+'</small></div></div>';
 }).join("")||'<div class="fin-list-empty">Chưa có khoản thu/chi nào được lên lịch trong giai đoạn này. Xem lại Kế hoạch để thêm dữ liệu.</div>';
 return header+
   panel("Thanh khoản "+esc(data.asOf)+" → "+esc(data.through),
      stats+risk+totals+
      note("Bắt đầu từ số dư ví TWD đã ghi sổ; thu nhập đã nhận không được cộng thêm lần nữa. Các khoản dự kiến chỉ là lịch tham khảo, chưa tự thanh toán."))+
   panel("Kỳ thu nhập → nghĩa vụ đến hạn",cycles||'<p class="fin-list-empty">Chưa có kỳ thu nhập rõ ngày.</p>',
     "Chi tiêu chưa ghi ngày và khoản trả nợ chưa phân bổ có thể làm sai dự báo; phần chênh lệch không phải số tiền được khuyến nghị tiêu.")+
   panel("Cảnh báo cần kiểm tra",alerts||'<p class="fin-muted">Chưa có cảnh báo trong lịch đã khai báo.</p>',
     "Cảnh báo này chỉ hiển thị trong Finance OS khi bạn đang sử dụng website.")+
   '<div class="fin-grid"><div class="fin-stack">'+
     panel("Gợi ý xoay vòng và giữ dự trữ",guidance||'<p class="fin-list-empty">Chưa có gợi ý.</p>')+
     panel("Cập nhật lịch",'<div class="fin-toolbar"><button class="fin-btn secondary" type="button" data-go-finance-tab="budget">Sửa lịch thu/chi</button>'+
       '<button class="fin-btn secondary" type="button" data-go-finance-tab="goals">Quỹ mục tiêu & nợ</button>'+
       '<button class="fin-btn secondary" type="button" data-go-finance-tab="fx">Lịch chuyển tiền</button></div>')+
   '</div><div class="fin-stack">'+
     panel("Dữ liệu cần kiểm tra",warnings||'<p class="fin-list-empty">Không có cảnh báo thiếu dữ liệu hiện tại.</p>')+
     (data.foreignWallets?.length?panel("Ví ngoại tệ chưa quy đổi",data.foreignWallets.map(x=>row(x.name,x.currency,moneyLabel(x.balance,x.currency))).join(""),
       "Không dùng tỷ giá ước đoán để cộng vào thanh khoản TWD."):'' )+
   '</div></div>'+
   panel("Lịch dòng tiền và số dư sau mỗi khoản",'<div class="fin-advice-timeline">'+timeline+'</div>',
     "Thu dự kiến ghi nhận trước chi dự kiến cùng ngày. Lịch chưa có ngày chính xác được tạm xếp cuối tháng.");
}
async function loadAdvice(){
 if(state.advisorBusy)return;
 const requestId=++state.advisorRequestId;
 state.advisorBusy=true;state.advisorError=null;state.advisor=null;
 if(state.tab==="advisor"||state.tab==="overview")render();
 try{
   const data=await api("/advisor?days="+state.advisorDays+"&bufferTwd="+encodeURIComponent(state.advisorBuffer));
   if(requestId!==state.advisorRequestId)return;
   state.advisor=data;
 }catch(error){if(requestId===state.advisorRequestId)state.advisorError=error;}
 finally{if(requestId===state.advisorRequestId){state.advisorBusy=false;if(state.tab==="advisor"||state.tab==="overview")render();}}
}
function renderFx(){
  const cs=state.data.currencies||[];
  const currencyCards=cs.map(c=>'<span class="fin-currency">'+esc(c.code)+' · '+esc(c.name_vi)+'</span>').join(" ");
  const plans=state.data.plans||[];
  return heading("Ngoại tệ & chuyển tiền","Lập kế hoạch và ghi nhận các giao dịch đã thực hiện")+
   '<div class="fin-grid"><div class="fin-stack">'+
    panel("Đổi ngoại tệ",'<div class="fin-toolbar">'+button("+ Lên lịch đổi tiền","fxPlan")+button("Ghi nhận đã đổi","fxPost",true)+'</div>'+note("Hỗ trợ mọi đồng tiền đang được bật trong Database. Hoạt động trên trang chỉ ghi sổ; không tự chuyển tiền qua ngân hàng."))+
    panel("Kế hoạch chuyển tiền",plans.length?plans.map(p=>row(p.from_currency+" → "+p.to_currency,p.plan_date+" · "+(p.plan_kind==="remittance"?"Chuyển ra ngoài":"Chuyển đổi"),moneyLabel(p.source_amount,p.from_currency),p.status==="planned"?"Dự kiến · "+safeRate(p.expected_rate):"Đã "+p.status)+(p.status==="planned"?'<button class="fin-btn secondary fin-cancel-plan" type="button" data-cancel-plan="'+esc(p.id)+'">Hủy kế hoạch</button>':"")).join(""):'<div class="fin-list-empty">Chưa có lịch. Có thể lên kế hoạch đổi TWD → VND hàng tháng.</div>')+
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

function renderGoals(){
 const goals=state.data.goals||[],debts=state.data.debts||[];
 const goalFunds=state.cashflow?.goalFunds||[],debtFunds=state.cashflow?.debtFunds||[];
 const goalRows=goals.length?goals.map(g=>{
  const percent=Number(g.target_amount)>0?Math.round(Number(g.current_amount)/Number(g.target_amount)*100):0;
  return '<div class="fin-row"><div style="flex:1;min-width:0"><div class="fin-stat"><strong>'+esc(g.name)+'</strong><span class="fin-tag neutral">'+esc(g.status)+'</span></div>'+
   '<div class="fin-progress"><span style="width:'+Math.min(100,Math.max(0,percent))+'%"></span></div>'+
   '<small>'+esc(moneyLabel(g.current_amount,g.currency_code))+' / '+esc(moneyLabel(g.target_amount,g.currency_code))+(g.target_date?' · '+esc(g.target_date):'')+'</small>'+
   '<small>'+((goalFunds.find(f=>f.goal_id===g.id))?
     'Phân bổ tháng: '+esc(moneyLabel(goalFunds.find(f=>f.goal_id===g.id).planned_amount,g.currency_code)):
     'Chưa phân bổ quỹ tháng này')+'</small>'+
   '</div><div class="fin-action-end"><button class="fin-btn secondary fin-small-action" type="button" data-goal-update="'+esc(g.id)+'">Tiến độ</button>'+
   '<button class="fin-btn secondary fin-small-action" type="button" data-goal-fund="'+esc(g.id)+'">Quỹ mục tiêu</button></div></div>';
 }).join(""):'<div class="fin-list-empty">Chưa có mục tiêu. Nhấn “Thêm mục tiêu” để bắt đầu.</div>';
 const debtRows=debts.length?debts.map(d=>'<div class="fin-row fin-action-row"><div><strong>'+esc(d.name)+'</strong><small>'+(d.due_date?'Đến hạn '+esc(d.due_date):'Chưa có ngày đến hạn')+'</small><small>'+
   (debtFunds.find(f=>f.debt_id===d.id)?'Phân bổ tháng: '+esc(moneyLabel(debtFunds.find(f=>f.debt_id===d.id).planned_amount,d.currency_code)):'Chưa phân bổ quỹ tháng này')+'</small></div><div class="fin-action-end"><strong>'+esc(moneyLabel(d.outstanding_amount,d.currency_code))+'</strong><small>Dư nợ gốc</small><button type="button" class="fin-btn secondary fin-small-action" data-pay-debt="'+esc(d.id)+'">Trả nợ</button><button type="button" class="fin-btn secondary fin-small-action" data-fund-debt="'+esc(d.id)+'">Quỹ nợ</button></div></div>').join(""):'<div class="fin-list-empty">Chưa có khoản nợ nào được nhập.</div>';
 return heading("Mục tiêu & khoản nợ","Theo dõi kế hoạch riêng, không tự trừ tiền trong tài khoản",periodInput())+
  '<div class="fin-grid"><div class="fin-stack">'+panel("Mục tiêu tiết kiệm",goalRows)+
  panel("Tạo mục tiêu",button("+ Thêm mục tiêu","goal")+note("Tạo mục tiêu xong, bấm Quỹ mục tiêu để phân bổ theo tháng. Tiến độ nhập thủ công không làm thay đổi số dư ví."))+
  '</div><div class="fin-stack">'+panel("Danh sách khoản nợ",debtRows)+
  panel("Theo dõi nghĩa vụ",button("+ Thêm khoản nợ","debt")+note("Quỹ nợ chỉ là số tiền dự kiến hoặc đánh dấu dành dụm, không phải tài khoản ngân hàng. Trả nợ thực tế phải chọn ví, ghi gốc/lãi/phí và được xác nhận trong Database."))+
  '</div></div>'+
  '<div class="fin-grid"><div class="fin-stack">'+
  panel("Quỹ trả nợ · "+monthText(state.month),(state.cashflow?.debtFunds||[]).length?(state.cashflow.debtFunds.map(f=>row(f.debt_name,
   "Dự kiến "+moneyLabel(f.planned_amount,f.currency_code)+" · Tỷ giá TWD "+safeRate(f.fx_rate_to_twd),
   moneyLabel(f.earmarked_amount,f.currency_code),"Đánh dấu đã dành, chưa chuyển ví")).join("")):
   '<div class="fin-list-empty">Chưa phân bổ quỹ nợ tháng này.</div>')+
  '</div><div class="fin-stack">'+
  panel("Các khoản trả nợ đã ghi sổ",(state.cashflow?.debtPayments||[]).length?
   state.cashflow.debtPayments.map(p=>row(p.debt_name,p.payment_date,
   moneyLabel(Number(p.principal_paid)+Number(p.interest_paid)+Number(p.fee_paid),p.currency_code),
   "Gốc "+moneyLabel(p.principal_paid,p.currency_code)+" · Lãi/phí "+moneyLabel(Number(p.interest_paid)+Number(p.fee_paid),p.currency_code))).join(""):
   '<div class="fin-list-empty">Chưa có khoản trả nợ thực tế trong tháng.</div>')+
  '</div></div>';
}

// Finance scenario workbench: visually spreadsheet-like, financially isolated from ledger.
// Saved workbooks are persisted via authenticated, audited Finance PostgreSQL only.
const workbookState={loaded:false,loading:false,book:null,saved:[],id:null,preview:null,error:null,busy:false,request:0,methodologyOpen:false};
const newWorkbook=()=>({name:"Kịch bản mới",months:12,salaryDay:10,bufferTwd:"0",
  monthlyExtraIncomeTwd:"0",rows:[],goal:null});
const wbKinds={income:"Thu thêm",income_loss:"Thu nhập giảm",expense:"Chi phát sinh",debt:"Trả nợ thêm",goal:"Để dành",borrow:"Vay tạm",repay:"Hoàn trả vay"};
function workbenchMoney(v){return moneyLabel(v??"0");}
function workbookField(name,value,type="text",hint=""){
 return '<label class="fin-wb-field"><span>'+esc(hint||name)+'</span><input data-wb-field="'+esc(name)+'" type="'+type+'" '+(type==="number"?'min="0" step="1"':'')+
   ' value="'+esc(value??"")+'" autocomplete="off"></label>';
}
function workbenchRow(row,index){
 return '<tr><td class="fin-wb-row-num">'+(index+1)+'</td>'+
   '<td><select data-wb-row="'+index+'" data-wb-prop="kind" aria-label="Loại dòng '+(index+1)+'">'+
   Object.entries(wbKinds).map(([key,label])=>'<option value="'+key+'"'+(row.kind===key?' selected':'')+'>'+label+'</option>').join("")+'</select></td>'+
   '<td><input data-wb-row="'+index+'" data-wb-prop="label" aria-label="Tên dòng '+(index+1)+'" value="'+esc(row.label)+'"></td>'+
   '<td><input data-wb-row="'+index+'" data-wb-prop="date" aria-label="Ngày dòng '+(index+1)+'" type="date" value="'+esc(row.date)+'"></td>'+
   '<td><input data-wb-row="'+index+'" data-wb-prop="amountTwd" aria-label="Số tiền dòng '+(index+1)+'" inputmode="numeric" value="'+esc(row.amountTwd)+'"></td>'+
   '<td><button type="button" class="fin-btn secondary fin-wb-remove" data-wb-remove="'+index+'" aria-label="Xóa dòng '+(index+1)+'">×</button></td></tr>';
}

function renderWorkbenchMethodology(){
 const blocks=[
  ["01","Dòng tiền thực và giả định",
    "Bắt đầu từ số dư ví TWD đã ghi sổ trong Finance Database. Cộng các khoản thu có ngày nhận; trừ chi phí, quỹ nợ, quỹ mục tiêu và tiền chuyển ra ngoài theo ngày dự kiến. Dòng mô phỏng được cộng/trừ riêng, không biến thành tiền thật.",
    "Đang tính trong bản mô phỏng"],
  ["02","Thanh khoản trước tổng thu nhập",
    "Tìm số dư thấp nhất và ngày đầu tiên xuống dưới ngưỡng dự trữ. Nếu khoản chi đến hạn trước ngày nhận lương, tăng lương vào ngày sau đó không được coi là giải pháp cho khoản thiếu trước đó.",
    "Đang tính trong bản mô phỏng"],
  ["03","Ưu tiên bảo vệ cuộc sống và nợ bắt buộc",
    "Về nguyên tắc: chi phí thiết yếu → nghĩa vụ đúng hạn → quỹ dự trữ → trả nợ thêm → mục tiêu tùy chọn. Hiện tại công cụ kiểm tra lịch và cảnh báo; chưa tự xác định hay tự dời khoản nợ bắt buộc khi thiếu thông tin kỳ hạn.",
    "Quy tắc tư vấn; chưa tự tối ưu"],
  ["04","Tiền dư và chiến lược trả nợ",
    "Chỉ xem xét trả nợ thêm bằng phần dư vượt dự trữ trước kỳ thu tiếp theo, không lấy toàn bộ số dư cuối tháng. Nếu đủ dữ liệu lãi suất, gợi ý xem xét khoản nợ TWD có lãi suất cao trước; chưa tính bảng trả góp và lãi/phí phát sinh thực tế.",
    "Giới hạn thận trọng; cần đối chiếu"],
  ["05","Xoay vòng thiếu hụt và vay ngắn hạn",
    "So sánh ngày cần tiền với ngày có tiền về. Một khoản vay thử phải có đúng dòng nhận tiền và dòng hoàn trả, bao gồm chi phí vay. Mốc hoàn gốc do công cụ đề xuất chỉ là phép thử không tính phí, không phải cam kết vay hay bảo đảm trả được.",
    "Mô phỏng có điều kiện"],
  ["06","Mục tiêu và độ trễ",
    "Chọn chia đều hoặc phân bổ linh hoạt vào các kỳ còn khả năng giữ dự trữ. Khi lịch chi cao điểm khiến mọi kỳ đều không đủ, công cụ báo khoản thiếu và không mặc định tăng vay.",
    "Đã tính hai cách phân bổ theo lịch dự kiến"],
  ["07","Khi có biến động",
    "Sửa khoản thu, chi, ngày nhận lương, tiền vay hoặc ngày mục tiêu rồi chọn Tính lại để đánh giá toàn bộ lịch mới. Chỉ khi dữ liệu nguồn Finance được tải lại mới phản ánh thay đổi ở những phần khác; chưa có cảnh báo nền tự động hay đồng bộ sự kiện tức thời.",
    "Tính lại theo yêu cầu; chưa tự theo dõi nền"]
 ];
 return '<details class="fin-wb-methodology" data-fin-methodology'+(workbookState.methodologyOpen?' open':'')+'>'+
   '<summary><span><strong>Phương pháp tính & nguyên tắc tư vấn dòng tiền</strong>'+
   '<small>7 quy tắc · Giải thích rõ phần đã tính và phần chưa tự động</small></span><span class="fin-wb-methodology-chevron" aria-hidden="true">⌄</span></summary>'+
   '<div class="fin-wb-equation"><strong>Số dư theo ngày = số dư TWD đã ghi sổ + thu dự kiến − chi/nghĩa vụ dự kiến − phân bổ mục tiêu.</strong>'+
   '<small>Mỗi khoản được tính theo ngày phát sinh; dự báo không phải số tiền đã thực nhận hoặc đã trả.</small></div>'+
   '<div class="fin-wb-methodology-list">'+blocks.map(([n,title,description,status])=>
      '<section class="fin-wb-methodology-item"><span class="fin-wb-methodology-index">'+n+'</span>'+
      '<div><strong>'+esc(title)+'</strong><p>'+esc(description)+'</p>'+
      '<small class="fin-wb-methodology-status">'+esc(status)+'</small></div></section>').join("")+'</div>'+
   '<p class="fin-wb-methodology-foot">Dữ liệu còn thiếu (lịch trả góp định kỳ, đối soát tiền đã thanh toán, tỷ giá TWD của nợ ngoại tệ, tiền lãi/phí) khiến kết quả chỉ mang tính điều kiện. Không tự vay, đảo nợ, hoãn thanh toán hay ghi giao dịch.</p>'+
   '</details>';
}

function renderWorkbench(){
 const b=workbookState,book=b.book||newWorkbook();
 const head=heading("Mô phỏng & Tư vấn","Thử các biến động thu nhập, khoản nợ, kế hoạch chi và mục tiêu theo lịch dòng tiền. Mỗi đề xuất đều có điều kiện và giới hạn rõ ràng.");
 if(b.loading)return head+'<div class="fin-state">Đang tải kịch bản đã lưu từ Database...</div>';
 if(b.error&&!b.book)return head+panel("Không đọc được kịch bản",'<p class="fin-error">'+esc(failure(b.error))+'</p>');
 const choices='<select id="fin-wb-saved" aria-label="Chọn kịch bản đã lưu"><option value="">Kịch bản chưa lưu</option>'+
    b.saved.map(x=>'<option value="'+esc(x.id)+'"'+(x.id===b.id?' selected':'')+'>'+esc(x.name)+'</option>').join("")+'</select>';
 const controls='<div class="fin-wb-menu"><label><span>Kịch bản</span>'+choices+'</label>'+
   '<button type="button" class="fin-btn secondary" data-wb-action="new">Tạo mới</button>'+
   '<button type="button" class="fin-btn secondary" data-wb-action="clone">Nhân bản</button>'+
   '<button type="button" class="fin-btn" data-wb-action="save"'+(b.busy?' disabled':'')+'>Lưu kịch bản</button>'+
   (b.id?'<button type="button" class="fin-btn secondary" data-wb-action="delete">Xóa</button>':'')+'</div>';
 const settings='<div class="fin-wb-settings">'+
   workbookField("name",book.name,"text","Tên kế hoạch")+
   '<label class="fin-wb-field"><span>Thời gian dự báo</span><select data-wb-field="months">'+
     [3,6,12].map(n=>'<option value="'+n+'"'+(Number(book.months)===n?' selected':'')+'>'+n+' tháng</option>').join("")+'</select></label>'+
   workbookField("bufferTwd",book.bufferTwd,"number","Tiền dự trữ tối thiểu (NT$)")+
   '<label class="fin-wb-field"><span>Ngày nhận khoản thu thêm mỗi tháng</span><input data-wb-field="salaryDay" type="number" min="1" max="31" step="1" value="'+esc(book.salaryDay)+'"></label>'+
   workbookField("monthlyExtraIncomeTwd",book.monthlyExtraIncomeTwd,"number","Thu nhập tăng thêm / tháng (NT$)")+
   '</div>';
 const p=b.preview,stats=p?'<div class="fin-wb-metrics">'+
   '<div><small>Tiền đầu kỳ</small><strong>'+esc(workbenchMoney(p.startingBalanceTwd))+'</strong></div>'+
   '<div><small>Đáy thanh khoản</small><strong class="'+(Number(p.minimumTwd)<Number(p.bufferTwd)?'fin-negative':'')+'">'+esc(workbenchMoney(p.minimumTwd))+'</strong></div>'+
   '<div><small>Có thể trả nợ thêm ngay (theo lịch đã nhập)</small><strong>'+esc(workbenchMoney(p.safeExtraDebtTwd))+'</strong></div>'+
   '<div><small>Cần tăng thu nhập mỗi kỳ lương</small><strong>'+
   (p.minimumAdditionalIncomePerPaydayTwd===null?'Không thể bù chỉ bằng lương':esc(workbenchMoney(p.minimumAdditionalIncomePerPaydayTwd)))+'</strong></div></div>':
   '<p class="fin-muted">Nhập ngày và số tiền, sau đó chọn “Tính lại” để xem kết quả thực tế theo Database.</p>';
 const risk=p?.earliestRisk?'<div class="fin-wb-risk"><strong>Nguy cơ thiếu tiền: '+esc(p.earliestRisk.date)+'</strong><p>'+
   'Thiếu '+esc(workbenchMoney(p.earliestRisk.gapTwd))+' so với dự trữ, gần khoản '+esc(p.earliestRisk.label)+
   '. Lương về sau ngày này không xử lý được thiếu hụt trước đó.</p></div>':
   (p?'<p class="fin-wb-safe">Theo các khoản đã khai báo, chưa phát hiện ngày xuống dưới mức dự trữ.</p>':'');
 const summary=p?'<div class="fin-wb-tablewrap"><table class="fin-wb-grid"><thead><tr>'+
   '<th>Tháng</th><th>Thu dự kiến</th><th>Chi & nợ</th><th>Quỹ mục tiêu</th><th>Vay tạm</th><th>Hoàn vay</th><th>Số dư cuối</th><th>Biên dự trữ *</th></tr></thead><tbody>'+
   p.months.map(m=>'<tr><th>'+esc(m.month)+'</th><td>'+esc(workbenchMoney(m.incomeTwd))+'</td>'+
   '<td>'+esc(workbenchMoney(m.costTwd))+'</td><td>'+esc(workbenchMoney(m.goalTwd))+'</td>'+
   '<td>'+esc(workbenchMoney(m.borrowedTwd))+'</td><td>'+esc(workbenchMoney(m.repaymentTwd))+'</td>'+
   '<td class="'+(Number(m.endingTwd)<0?'fin-negative':'')+'">'+esc(workbenchMoney(m.endingTwd))+'</td>'+
   '<td>'+esc(workbenchMoney(m.surplusTwd))+'</td></tr>').join("")+
   '</tbody></table></div><p class="fin-note">* Biên dự trữ chỉ là mức thấp nhất trong tháng so với ngưỡng đã chọn; không phải số tiền chắc chắn có thể chi nếu thiếu lịch tháng sau.</p>':'';
 const goal=book.goal||{label:"",totalTwd:"",targetDate:""};
 const goalUi='<div class="fin-wb-settings">'+workbookField("goal.label",goal.label,"text","Mục tiêu (chuyến đi, học phí…)")+
   workbookField("goal.totalTwd",goal.totalTwd,"number","Cần tích lũy thêm (NT$)")+
   workbookField("goal.targetDate",goal.targetDate,"date","Hạn cần đạt")+
   '<label class="fin-wb-field"><span>Cách phân bổ</span><select data-wb-field="goal.mode">'+
   '<option value="adaptive"'+((goal.mode||"even")==="adaptive"?' selected':'')+'>Linh hoạt · ưu tiên giữ dự trữ</option>'+
   '<option value="even"'+(goal.mode==="even"?' selected':'')+'>Chia đều theo các kỳ thu</option></select></label></div>'+
   '<p class="fin-note">Linh hoạt phân bổ quỹ ở những kỳ còn đủ tiền sau nghĩa vụ; nếu không thể đạt mục tiêu trong dự trữ, hệ thống báo khoản thiếu. Đây vẫn là khoản giả định, không chuyển tiền thật.</p>'+
   (p?.goalSchedule?.length?'<div class="fin-scenario-goal-schedule"><strong>Phân bổ theo kỳ</strong><div class="fin-table-scroll"><table class="fin-data-table"><thead><tr><th>Ngày dự kiến</th><th>Số tiền dành</th></tr></thead><tbody>'+
     p.goalSchedule.map(x=>'<tr><td>'+esc(x.date)+'</td><td class="fin-right">'+esc(workbenchMoney(x.amountTwd))+'</td></tr>').join("")+
   '</tbody></table></div></div>':'')+
   (p&&Number(p.goalFundingGapTwd)>0?'<p class="fin-wb-risk"><strong>Chưa đủ quỹ mục tiêu theo dòng tiền hiện tại: '+esc(workbenchMoney(p.goalFundingGapTwd))+'</strong></p>':'');
 const items='<div class="fin-wb-tablewrap"><table class="fin-wb-grid fin-wb-editor"><thead><tr>'+
   '<th>#</th><th>Loại</th><th>Tên / bên cho vay</th><th>Ngày dự kiến</th><th>NT$</th><th>Xóa</th></tr></thead><tbody>'+
   (book.rows.length?book.rows.map(workbenchRow).join(""):'<tr><td colspan="6" class="fin-wb-empty">Chưa có điều chỉnh. Dữ liệu thật đã được tính từ nguồn Finance Database.</td></tr>')+
   '</tbody></table></div>';
 const add='<div class="fin-toolbar fin-wb-add">'+
   '<button class="fin-btn secondary" type="button" data-wb-action="add-income">+ Thu nhập</button>'+
   '<button class="fin-btn secondary" type="button" data-wb-action="add-income_loss">− Thu nhập giảm</button>'+
   '<button class="fin-btn secondary" type="button" data-wb-action="add-expense">+ Chi lớn</button>'+
   '<button class="fin-btn secondary" type="button" data-wb-action="add-debt">+ Trả nợ thêm</button>'+
   '<button class="fin-btn secondary" type="button" data-wb-action="loan">+ Vay & hoàn trả</button>'+
   '<button class="fin-btn secondary" type="button" data-wb-action="payoff">+ Tất toán gốc TWD</button>'+
   '<button class="fin-btn" type="button" data-wb-action="preview"'+(b.busy?' disabled':'')+'>Tính lại</button></div>';
 const warnings=p?.warnings?.length?'<details open class="fin-wb-warnings"><summary>Cảnh báo & dữ liệu chưa chắc chắn ('+p.warnings.length+')</summary>'+
   p.warnings.map(w=>'<p>'+esc(w)+'</p>').join("")+'</details>':'';
 const bridge=p?.bridgeWindow?
   '<p>Thiếu thanh khoản từ <strong>'+esc(p.bridgeWindow.neededBy)+'</strong>. Để kiểm tra phương án tạm bù đến kỳ thu '+esc(p.bridgeWindow.earliestPrincipalOnlyRepayDate)+
   ', cần ít nhất <strong>'+esc(workbenchMoney(p.bridgeWindow.minimumPrincipalTwd))+
   '</strong> tiền bắc cầu theo các lịch đã khai báo, chưa tính lãi/phí.</p>'+
   '<p class="fin-note">Đây là phép thử hoàn gốc không có chi phí vay, KHÔNG phải đề xuất một bên cho vay hay cam kết có thể trả. Nhập lãi/phí và ngày hoàn trả trong cặp dòng vay–hoàn trả để kiểm tra thực tế.</p>':
   (p?.earliestRisk?'<p>Hiện chưa tìm được ngày thu nhập đủ an toàn để hoàn gốc tạm vay trong kỳ dự báo. Không nên coi vay mới là cách xử lý đã khả thi.</p>':
   '<p>Chưa có khoảng thiếu dự trữ được phát hiện từ những khoản đã khai báo.</p>');
 const recommended=p?.debtRanking?.length&&Number(p.safeExtraDebtTwd)>0?
   '<p>Số tiền trả nợ thêm có thể cân nhắc ngay: <strong>'+esc(workbenchMoney(p.safeExtraDebtTwd))+
   '</strong>, nếu mọi nghĩa vụ đã được khai báo đầy đủ. Nếu ưu tiên tiết kiệm lãi, rà soát khoản <strong>'+
   esc(p.debtRanking[0].name)+'</strong> trước, vì lãi suất được nhập cao nhất trong các khoản nợ TWD.</p>':
   '<p>Chưa xác định được phần tiền dư an toàn để tăng trả nợ trước kỳ lương tiếp theo. Không dùng nguyên số dư cuối tháng để tất toán.</p>';
 const actionOptions=p?'<div class="fin-action-options">'+
   '<div class="fin-action-option"><div><strong>1. Bảo vệ tiền sống và nghĩa vụ bắt buộc</strong><small>'+
   (p.earliestRisk?'Ngày rủi ro gần nhất '+esc(p.earliestRisk.date)+'; kiểm tra lịch chi trước ngày này.':
    'Chưa có ngày thủng mức dự trữ trong những khoản đã nhập.')+'</small></div>'+
   '<button type="button" class="fin-btn secondary" data-go-finance-tab="budget">Sửa kế hoạch</button></div>'+
   '<div class="fin-action-option"><div><strong>2. Phân bổ mục tiêu sang kỳ còn dư</strong><small>'+
   (p.goal?.totalTwd?'Chọn Linh hoạt để kiểm tra khả năng góp quỹ theo mức dự trữ.':
   'Nhập số tiền và hạn mục tiêu để so sánh chia đều với phân bổ linh hoạt.')+'</small></div>'+
   '<button type="button" class="fin-btn secondary" data-wb-action="adaptive-goal">Thử phân bổ</button></div>'+
   '<div class="fin-action-option"><div><strong>3. Xử lý thiếu tiền trước kỳ lương</strong><small>'+
   (p.bridgeWindow?'Khoảng bù cần kiểm tra '+esc(workbenchMoney(p.bridgeWindow.minimumPrincipalTwd))+
    ', kỳ thu để thử hoàn gốc '+esc(p.bridgeWindow.earliestPrincipalOnlyRepayDate)+'. Chưa tính phí vay.':
    'Chưa xác minh được kỳ hoàn gốc an toàn; không coi vay mới là giải pháp mặc định.')+
   '</small></div><button type="button" class="fin-btn secondary" data-wb-action="loan">Thử vay & trả</button></div>'+
   '<div class="fin-action-option"><div><strong>4. Dùng tiền dư giảm nợ</strong><small>'+
   'Ước tính dư trên dự trữ trước kỳ thu tiếp theo: '+esc(workbenchMoney(p.safeExtraDebtTwd))+
   '. Cần đối chiếu nợ ngoại tệ, lãi/phí và lịch còn thiếu.</small></div>'+
   '<button type="button" class="fin-btn secondary" data-wb-action="add-debt">Thử trả nợ</button></div>'+
   '</div>':'<p class="fin-muted">Chọn Tính lại để xem phương án dựa trên lịch đã khai báo.</p>';
 const payments=p?.loans?.length?p.loans.map(x=>'<div class="fin-row"><div><strong>'+esc(x.label)+'</strong>'+
   '<small>Vay '+esc(x.borrowDate)+' → Hoàn '+esc(x.repayDate)+' · '+esc(x.daysToRepay)+' ngày</small></div>'+
   '<div class="fin-amount">Nhận '+esc(workbenchMoney(x.borrowedTwd))+
   '<small>Trả '+esc(workbenchMoney(x.repayTwd))+' · Chi phí '+esc(workbenchMoney(x.financingCostTwd))+'</small></div></div>').join("")+
   '<p class="fin-note">Phải có kế hoạch trả nợ mới đúng ngày, đúng số tiền. Không khuyến nghị vay để đảo nợ nếu tổng chi phí và lịch thanh toán không khả thi.</p>':'<p class="fin-muted">Chưa mô phỏng khoản vay ngắn hạn.</p>';
 const events=p?'<div class="fin-wb-tablewrap"><table class="fin-wb-grid"><thead><tr><th>Ngày</th><th>Nội dung</th><th>Loại nguồn</th><th>Thu/Chi</th><th>Số dư sau khoản</th></tr></thead><tbody>'+
   p.timeline.map(x=>'<tr><td>'+esc(x.date)+'</td><td>'+esc(x.label)+(x.estimatedDate?' <small>Ngày ước tính</small>':'')+'</td>'+
   '<td>'+esc(x.source==="scenario"?"Giả định":x.source==="assumption"?"Lương tăng thêm":x.source==="scenario_goal"?"Phân bổ mục tiêu":"Database")+'</td>'+
   '<td class="'+(Number(x.amountTwd)<0?'fin-negative':'')+'">'+(Number(x.amountTwd)>=0?'+':'')+esc(workbenchMoney(x.amountTwd))+'</td>'+
   '<td class="'+(Number(x.balanceTwd)<0?'fin-negative':'')+'">'+esc(workbenchMoney(x.balanceTwd))+'</td></tr>').join("")+
   '</tbody></table></div>':'';
 return head+
   renderWorkbenchMethodology()+
   panel("Kịch bản lưu trong Database",controls,'Mỗi kịch bản độc lập; thay đổi bản mô phỏng không làm thay đổi giao dịch hay dư nợ thật.')+
   panel("Thông số đầu vào",settings)+
   '<p class="fin-wb-stale" data-wb-unsynced hidden>Đang sửa bảng: số liệu bên dưới chưa tính lại. Rời vùng chỉnh sửa hoặc bấm “Tính lại”.</p>'+
   panel("Sức chịu đựng dòng tiền",stats+risk+
    (p?.firstPayday?'<p class="fin-note">Kỳ thu tăng thêm gần nhất: '+esc(p.firstPayday)+'</p>':'<p class="fin-note">Không tìm thấy kỳ thu tăng thêm trong giai đoạn dự báo.</p>'))+
   panel("Xoay vòng tiền & lịch hoàn vay sơ bộ",bridge)+
   panel("Phân bổ tiền dư để giảm nợ",recommended)+
   panel("Gợi ý hành động có điều kiện",actionOptions,"Chọn thử sẽ chỉ thay đổi kịch bản, không tự thanh toán hoặc vay tiền.")+
   panel("Bảng tháng (giống spreadsheet)",summary)+
   panel("Dòng điều chỉnh / kịch bản",items+add+
    '<p class="fin-note">Dòng vay và hoàn trả phải đi theo một cặp, nhập đầy đủ số tiền nhận và tổng tiền trả gồm lãi/phí. Khoản vay chỉ là giả định; không tự ghi nhận là thu nhập.</p>')+
   panel("Mục tiêu cần tiền trước ngày cụ thể",goalUi)+
   panel("Chi phí vay tạm",payments)+
   warnings+
   panel("Sổ dòng tiền theo ngày",events,'Khoản thực tế lấy từ Database; các dòng kịch bản chỉ phục vụ tính toán, chưa ghi sổ.')+
   (b.error?'<p class="fin-error">'+esc(failure(b.error))+'</p>':'');
}
let workbookRecalcTimer=0;
function scheduleWorkbookRecalculation(){
  workbookState.preview=null;
  clearTimeout(workbookRecalcTimer);
  workbookRecalcTimer=setTimeout(()=>{
    if(state.tab!=="workbench")return;
    // Never replace spreadsheet inputs while keyboard focus is editing a cell.
    // Re-run automatically once focus has left the editable area.
    const editing=document.activeElement?.closest?.(".fin-wb-editor,.fin-wb-settings");
    if(editing){scheduleWorkbookRecalculation();return;}
    void previewWorkbook();
  },600);
}
function wbDate(step=0){
 const day=workbookState.book?.asOf||workbookState.asOf||new Date().toISOString().slice(0,10);
 return new Date(Date.parse(day+"T00:00:00Z")+step*86400000).toISOString().slice(0,10);
}
async function loadWorkbench(){
 if(workbookState.loading)return;
 workbookState.loading=true;workbookState.error=null;if(state.tab==="workbench")render();
 try{
  const payload=await api("/workbench");
  workbookState.saved=payload.scenarios||[];
  workbookState.asOf=payload.asOf;
  const selected=workbookState.saved.find(x=>x.id===workbookState.id)||workbookState.saved[0];
  workbookState.id=selected?.id||null;
  workbookState.book=selected?structuredClone(selected.settings):newWorkbook();
  workbookState.loaded=true;
  workbookState.loading=false;
  await previewWorkbook();
 }catch(error){workbookState.loading=false;workbookState.error=error;if(state.tab==="workbench")render();}
}
async function previewWorkbook(){
 clearTimeout(workbookRecalcTimer);
 if(!workbookState.book)return;
 const seq=++workbookState.request;
 workbookState.busy=true;workbookState.error=null;workbookState.preview=null;
 if(state.tab==="workbench")render();
 try{
  const result=await api("/workbench/preview",{scenario:workbookState.book},"POST");
  if(seq===workbookState.request)workbookState.preview=result.projection;
 }catch(error){if(seq===workbookState.request)workbookState.error=error;}
 finally{if(seq===workbookState.request){workbookState.busy=false;if(state.tab==="workbench")render();}}
}
function workBookSet(prop,value){if(workbookState.book)workbookState.book[prop]=value;}
function wbAdd(kind){
 const b=workbookState.book;if(!b||b.rows.length>=118)return;
 const date=wbDate(0);
 const key=crypto.randomUUID();
 if(kind==="loan"){
  b.rows.push({key:crypto.randomUUID(),kind:"borrow",date,label:"Nguồn vay tạm",amountTwd:"0",linkId:key},
    {key:crypto.randomUUID(),kind:"repay",date:wbDate(30),label:"Hoàn vay tạm",amountTwd:"0",linkId:key});
 }else{
  b.rows.push({key,kind,date,label:kind==="debt"?"Thanh toán nợ thêm":kind==="income"?"Thu nhập mới":kind==="income_loss"?"Thu nhập hụt so với kế hoạch":kind==="goal"?"Phân bổ quỹ":"Chi phát sinh",amountTwd:"0"});
 }
 workbookState.preview=null;render();
}
async function wbAction(action,element){
 clearTimeout(workbookRecalcTimer);
 const b=workbookState.book;
 if(action==="new"){workbookState.id=null;workbookState.book=newWorkbook();workbookState.preview=null;render();await previewWorkbook();return;}
 if(action==="clone"){workbookState.id=null;workbookState.book=structuredClone(b);workbookState.book.name+=" (bản sao)";render();return;}
 if(action.startsWith("add-")){wbAdd(action.slice(4));return;}
 if(action==="loan"){wbAdd("loan");return;}
 if(action==="adaptive-goal"){
   if(!b.goal)b.goal={label:"Mục tiêu mới",totalTwd:"0",targetDate:wbDate(90),mode:"adaptive"};
   else b.goal.mode="adaptive";
   workbookState.preview=null;render();
   root.querySelector('[data-wb-field="goal.totalTwd"]')?.focus();return;
 }
 if(action==="payoff"){
  const twd=(state.data?.debts||[]).filter(x=>x.currency_code==="TWD");
  const amount=twd.reduce((s,x)=>s+Number(x.outstanding_amount||0),0);
  if(!amount){flash("Chưa có dư nợ gốc TWD được khai báo. Ngoại tệ cần tỷ giá riêng.");return;}
  b.rows.push({key:crypto.randomUUID(),kind:"debt",date:wbDate(30),
    label:"Dự kiến tất toán gốc nợ TWD (chưa gồm lãi/phí)",amountTwd:String(amount)});
  workbookState.preview=null;render();return;
 }
 if(action==="preview"){await previewWorkbook();return;}
 if(action==="save"){
  workbookState.busy=true;workbookState.error=null;render();
  try{
   const method=workbookState.id?"PUT":"POST";
   const address="/workbench/scenarios"+(workbookState.id?"/"+encodeURIComponent(workbookState.id):"");
   const result=await api(address,{scenario:b},method);
   workbookState.id=result.scenario.id;
   await loadWorkbookListAfterSave();
   flash("Kịch bản đã lưu và đọc lại từ Finance Database.");
  }catch(error){workbookState.error=error;flash(failure(error));}
  finally{workbookState.busy=false;render();}
  return;
 }
 if(action==="delete"){
  if(!workbookState.id||!window.confirm("Xóa kịch bản giả định này? Không thay đổi giao dịch thật."))return;
  try{await api("/workbench/scenarios/"+encodeURIComponent(workbookState.id),{},"DELETE");
   workbookState.id=null;workbookState.book=newWorkbook();workbookState.preview=null;
   await loadWorkbookListAfterSave();flash("Đã xóa kịch bản, không tác động tới giao dịch thật.");
  }catch(error){workbookState.error=error;flash(failure(error));}
  return;
 }
}
async function loadWorkbookListAfterSave(){
 const fresh=await api("/workbench");workbookState.saved=fresh.scenarios||[];
 const selected=workbookState.saved.find(x=>x.id===workbookState.id);
 if(selected)workbookState.book=structuredClone(selected.settings);
 await previewWorkbook();
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
  root.innerHTML=state.tab==="overview"?renderOverview():state.tab==="budget"?renderBudget():state.tab==="fx"?renderFx():state.tab==="goals"?renderGoals():state.tab==="advisor"?renderAdvice():state.tab==="workbench"?renderWorkbench():state.tab==="report"?renderReport():renderLedger();
}
function selectField(name,label,options,placeholder="Chọn"){
 return '<label>'+esc(label)+'<select name="'+esc(name)+'" required><option value="">'+esc(placeholder)+'</option>'+options.map(o=>'<option value="'+esc(o.value)+'">'+esc(o.label)+'</option>').join("")+'</select></label>';
}
function input(name,label,type="text",value="",placeholder="",required=true){
 return '<label>'+esc(label)+'<input name="'+esc(name)+'" type="'+esc(type)+'" value="'+esc(value)+'" placeholder="'+esc(placeholder)+'" '+(required?"required":"")+' autocomplete="off"></label>';
}
const choices=list=>list.map(x=>({value:x.id,label:accountName(x)}));
const currencyChoices=()=>state.data.currencies.map(c=>({value:c.code,label:c.code+" · "+c.name_vi}));
function showForm(kind,selectedId=null){
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
 }else if(kind==="goal"){
  title="Thêm mục tiêu tiết kiệm";
  fields=input("name","Tên mục tiêu","text","","Quỹ học phí / tiết kiệm")+
   selectField("currencyCode","Ngoại tệ",currencyChoices())+
   input("targetAmount","Số tiền mục tiêu","text","","10000")+
   input("targetDate","Ngày dự kiến hoàn thành (không bắt buộc)","date","","",false)+
   note("Mục tiêu là kế hoạch. Việc tạo mục tiêu không làm thay đổi số dư ví.");
 }else if(kind==="goalProgress"){
  const goal=(state.data.goals||[]).find(g=>g.id===selectedId);
  if(!goal)return;
  form.dataset.goalId=goal.id;
  title="Cập nhật mục tiêu · "+goal.name;
  fields=input("currentAmount","Đã tích lũy ("+goal.currency_code+")","text",goal.current_amount)+
   selectField("status","Trạng thái",[{value:"active",label:"Đang thực hiện"},{value:"achieved",label:"Đã đạt"},{value:"archived",label:"Lưu trữ"}])+
   note("Tiến độ do bạn nhập và không phải số dư của tài khoản ngân hàng.");
 }else if(kind==="debt"){
  title="Thêm khoản nợ";
  fields=input("name","Tên khoản nợ","text","","Thẻ tín dụng / vay cá nhân")+
   selectField("currencyCode","Ngoại tệ",currencyChoices())+
   input("principalOriginal","Số nợ gốc","text","","10000")+
   input("annualInterestPercent","Lãi suất theo năm (%)","text","0")+
   input("dueDate","Ngày đến hạn (không bắt buộc)","date","","",false)+
   note("Khoản nợ chỉ dùng để lập kế hoạch; chưa thực hiện ghi nhận trả nợ và không thay đổi số dư tài khoản.");

 }else if(["cashIncome","cashExpense","cashEdit"].includes(kind)){
  const existing=kind==="cashEdit"?(state.cashflow?.items||[]).find(x=>x.id===selectedId):null;
  if(kind==="cashEdit"&&!existing)return;
  if(existing)form.dataset.cashflowId=existing.id;
  title=existing?"Sửa dòng tiền dự kiến":kind==="cashIncome"?"Thêm thu nhập dự kiến":"Thêm chi tiêu dự kiến";
  fields=selectField("kind","Loại dự kiến",[{value:"income",label:"Thu nhập"},{value:"expense",label:"Chi tiêu"}])+
   input("label","Tên khoản thu/chi","text",existing?.label||"","Lương / tiền thuê nhà")+
   input("amountTwd","Số tiền TWD","text",existing?.amount_twd||"","10000")+
   input("dueDay","Ngày nhận / ngày phải trả (1–31)","number",existing?.due_day||"","1–31",false)+
   input("memo","Ghi chú","text",existing?.memo||"","",false)+
   note("Nhập đúng ngày nhận lương hoặc ngày chi trả. Bỏ trống ngày sẽ bị tạm xếp cuối tháng và cảnh báo có thể trễ. Đây chỉ là dự kiến, chưa ghi tiền thật; cần lập cho từng tháng.");
 }else if(kind==="goalFund"){
  const goal=(state.data.goals||[]).find(g=>g.id===selectedId);if(!goal)return;
  form.dataset.goalId=goal.id;
  const existing=(state.cashflow?.goalFunds||[]).find(f=>f.goal_id===goal.id);
  title="Quỹ mục tiêu · "+goal.name+" · "+monthText(state.month);
  fields=input("plannedAmount","Dự kiến dành ("+goal.currency_code+")","text",existing?.planned_amount||"0")+
   input("earmarkedAmount","Đánh dấu đã dành ("+goal.currency_code+")","text",existing?.earmarked_amount||"0")+
   (goal.currency_code==="TWD"?"":input("fxRateToTwd","Tỷ giá giả định: 1 "+goal.currency_code+" = ? TWD","text",existing?.fx_rate_to_twd||"","Bắt buộc"))+
   note("Khoản dự kiến sẽ trừ trong dòng tiền kế hoạch tháng/năm. Đánh dấu đã dành chỉ để theo dõi, không đổi ví, dư nợ hoặc tiến độ tích lũy.");
 }else if(kind==="debtFund"){
  const debt=(state.data.debts||[]).find(d=>d.id===selectedId);if(!debt)return;
  form.dataset.debtId=debt.id;
  const existing=(state.cashflow?.debtFunds||[]).find(f=>f.debt_id===debt.id);
  title="Quỹ trả nợ · "+debt.name;
  fields=input("plannedAmount","Dự kiến dành ("+debt.currency_code+")","text",existing?.planned_amount||"0")+
   input("earmarkedAmount","Đánh dấu đã dành ("+debt.currency_code+")","text",existing?.earmarked_amount||"0")+
   (debt.currency_code==="TWD"?"":input("fxRateToTwd","Tỷ giá giả định: 1 "+debt.currency_code+" = ? TWD","text",existing?.fx_rate_to_twd||"","Bắt buộc"))+
   note("Đánh dấu đã dành không chuyển tiền giữa các ví, không thanh toán khoản nợ, không trừ số dư.");
 }else if(kind==="debtPayment"){
  const debt=(state.data.debts||[]).find(d=>d.id===selectedId);if(!debt)return;
  form.dataset.debtId=debt.id;
  title="Ghi nhận trả nợ thực tế · "+debt.name;
  const sameAccounts=accounts.filter(a=>a.currency_code===debt.currency_code);
  fields=selectField("accountId","Ví thanh toán ("+debt.currency_code+")",choices(sameAccounts))+
   input("paymentDate","Ngày đã trả","date",date)+
   input("principalPaid","Tiền gốc đã trả","text","","0")+
   input("interestPaid","Tiền lãi","text","0")+
   input("feePaid","Phí trả nợ","text","0")+
   (debt.currency_code==="TWD"?"":input("fxRateToTwd","Tỷ giá thực tế: 1 "+debt.currency_code+" = ? TWD","text","","Bắt buộc"))+
   input("memo","Ghi chú","text","","",false)+
   note("LƯU Ý: Chỉ lưu khi đã thực trả. Tổng gốc + lãi + phí bị trừ khỏi ví đã chọn và khoản gốc làm giảm dư nợ. Không tự chuyển tiền qua ngân hàng.");
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
 form.dataset.idempotencyKey=crypto.randomUUID();
 if(!["goalProgress","goalFund"].includes(kind))delete form.dataset.goalId;
 if(kind!=="cashEdit")delete form.dataset.cashflowId;
 if(!["debtFund","debtPayment"].includes(kind))delete form.dataset.debtId;
 document.querySelector("#finance-dialog-title").textContent=title;
 fieldRoot.innerHTML=fields;form.reset();
 if(kind==="goalProgress")fieldRoot.querySelector('[name="status"]').value=state.data.goals.find(g=>g.id===selectedId)?.status||"active";
 if(["cashIncome","cashExpense","cashEdit"].includes(kind))fieldRoot.querySelector('[name="kind"]').value=kind==="cashIncome"?"income":kind==="cashExpense"?"expense":(state.cashflow?.items||[]).find(x=>x.id===selectedId)?.kind||"expense";
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
  goal:"/goals",debt:"/debts",goalProgress:"/goals/"+form.dataset.goalId,
  cashIncome:"/cashflow/items",cashExpense:"/cashflow/items",cashEdit:"/cashflow/items/"+form.dataset.cashflowId,
  debtFund:"/debt-funds",goalFund:"/goal-funds",debtPayment:"/debt-payments",
  income:"/transactions",expense:"/transactions",transfer:"/transactions",fxPost:"/transactions",opening:"/transactions"
 }[kind];
 if(!path)return;
 let body=data;
 if(["cashIncome","cashExpense","cashEdit"].includes(kind))body={...data,month:state.month};
 if(kind==="debtFund")body={...data,month:state.month,debtId:form.dataset.debtId};
 if(kind==="goalFund")body={...data,month:state.month,goalId:form.dataset.goalId};
 if(kind==="debtPayment")body={...data,debtId:form.dataset.debtId,idempotencyKey:form.dataset.idempotencyKey};
 if(["income","expense","transfer","fxPost","opening"].includes(kind)){
   body={...data,kind:kind==="fxPost"?"fx":kind==="opening"?"adjustment":kind,idempotencyKey:form.dataset.idempotencyKey,occurredAt:new Date().toISOString()};
   if(!data.toTwdRate)delete body.toTwdRate;
 }
 state.busy=true;
 const submit=document.querySelector("#finance-submit");submit.disabled=true;submit.textContent="Đang lưu...";
 let saved=false;
 try{
   await api(path,body,["budget","goalProgress","cashEdit","debtFund","goalFund"].includes(kind)?"PUT":"POST");
   saved=true;
   dialog.close();
   try{
     await refresh();
     flash("Đã lưu và đọc lại từ Database thành công.");
   }catch(error){
     state.loading=false;state.problem=error;render();
     flash("Database đã xác nhận lưu nhưng chưa tải lại được. Không gửi lại giao dịch; hãy tải lại trang.");
   }
 }catch(error){
   if(error?.message==="FINANCE_DUPLICATE_REQUEST" || error?.message==="FINANCE_DUPLICATE"){
     try {await refresh();}catch{}
     flash("Mã giao dịch đã được dùng. Kiểm tra lịch sử; hệ thống không ghi lại lần thứ hai.");
   }else{
     flash(failure(error));
   }
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
    if(!response.ok){loginError.textContent=response.status===403?"Tài khoản này chưa được cấp quyền Finance OS.":response.status===503?"Dịch vụ đăng nhập đang tạm gián đoạn.":"Tài khoản hoặc mật khẩu không đúng.";loginError.hidden=false;return;}
    loginForm.reset();state.loading=true;state.problem=null;render();await refresh();
  }catch(error){state.problem=error;state.loading=false;render();loginError.textContent=failure(error);loginError.hidden=false;}
  finally{button.disabled=false;}
});
logoutButton.addEventListener("click",async()=>{
  await fetch("/api/auth/logout",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:"{}"}).catch(()=>{});
  state.data=null;state.overview=null;state.loading=false;
  const error=new Error("AUTH_REQUIRED");error.status=401;state.problem=error;render();
});
tabs.forEach(b=>b.addEventListener("click",()=>{state.tab=b.dataset.tab;render();if(state.tab==="advisor"&&!state.advisor&&!state.advisorBusy)void loadAdvice();if(state.tab==="workbench"&&!workbookState.loaded)void loadWorkbench();if(state.tab==="report"&&(state.year?.year!==Number(state.month.slice(0,4))))void loadYear();if(state.tab==="budget"&&state.yearCashflow?.year!==Number(state.month.slice(0,4)))void loadYear();}));
root.addEventListener("click",async event=>{
 if(event.target.closest("[data-report-print]")){
   window.print();return;
 }
 if(event.target.closest("[data-report-export]")){
   const rows=[["Ngày","Nội dung","Loại","Số tiền","Ngoại tệ"]];
   for(const e of state.overview?.events||[]){
     for(const entry of e.entries||[]){
       rows.push([new Date(e.occurred_at).toLocaleDateString("sv-SE",{timeZone:"Asia/Taipei"}),
        e.description||"",e.kind,String(entry.amount),entry.currency]);
     }
   }
   const safeCell=value=>{
     let str=String(value??"");
     if(/^[=+@\-\t\r]/.test(str))str="'"+str;
     return '"'+str.replace(/"/g,'""')+'"';
   };
   const csv="\ufeff"+rows.map(r=>r.map(safeCell).join(",")).join("\r\n");
   const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
   const link=document.createElement("a");link.href=url;link.download="finance-report-"+state.month+".csv";
   document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
   flash("Đã xuất CSV từ các giao dịch đã ghi sổ.");return;
 }

 const wb=event.target.closest("[data-wb-action]");
 if(wb){await wbAction(wb.dataset.wbAction,wb);return;}
 const remove=event.target.closest("[data-wb-remove]");
 if(remove){
   const idx=Number(remove.dataset.wbRemove);
   const item=workbookState.book?.rows?.[idx];
   if(item){
     if(item.linkId)workbookState.book.rows=workbookState.book.rows.filter(r=>r.linkId!==item.linkId);
     else workbookState.book.rows.splice(idx,1);
     workbookState.preview=null;render();
   }
   return;
 }

 const go=event.target.closest("[data-go-finance-tab]");
 if(go){state.tab=go.dataset.goFinanceTab;render();if(state.tab==="advisor"&&!state.advisor&&!state.advisorBusy)void loadAdvice();return;}
 const adviceButton=event.target.closest("[data-advice-refresh]");
 if(adviceButton){
   const days=Number(root.querySelector("#fin-advice-days")?.value);
   const buffer=String(root.querySelector("#fin-advice-buffer")?.value??"");
   if(![30,60,90].includes(days)||!/^(?:0|[1-9]\d{0,10})(?:\.\d{1,2})?$/.test(buffer)){
     flash("Chọn số ngày hợp lệ và mức dự trữ TWD không âm.");return;
   }
   state.advisorDays=days;state.advisorBuffer=buffer;await loadAdvice();return;
 }
 const act=event.target.closest("[data-open]");if(act){showForm(act.dataset.open);return;}
 const goalFundButton=event.target.closest("[data-goal-fund]");
 if(goalFundButton){showForm("goalFund",goalFundButton.dataset.goalFund);return;}
 const goalButton=event.target.closest("[data-goal-update]");
 if(goalButton){showForm("goalProgress",goalButton.dataset.goalUpdate);return;}
 const cancelButton=event.target.closest("[data-cancel-plan]");
 if(cancelButton){
   if(state.busy||!window.confirm("Hủy kế hoạch ngoại tệ này? Không có giao dịch tài chính nào bị thay đổi."))return;
   state.busy=true;cancelButton.disabled=true;
   try{
     await api("/fx-plans/"+encodeURIComponent(cancelButton.dataset.cancelPlan)+"/cancel",{},"POST");
     try{await refresh();flash("Đã hủy kế hoạch trong Database.");}
     catch{flash("Đã xác nhận hủy, nhưng tải lại bị lỗi. Vui lòng tải lại trang.");}
   }catch(error){flash(failure(error));}
   finally{state.busy=false;cancelButton.disabled=false;}
   return;
 }
 const cashEdit=event.target.closest("[data-edit-cashflow]");
 if(cashEdit){showForm("cashEdit",cashEdit.dataset.editCashflow);return;}
 const fund=event.target.closest("[data-fund-debt]");
 if(fund){showForm("debtFund",fund.dataset.fundDebt);return;}
 const payment=event.target.closest("[data-pay-debt]");
 if(payment){showForm("debtPayment",payment.dataset.payDebt);return;}
 const del=event.target.closest("[data-delete-cashflow]");
 if(del){
   if(state.busy||!window.confirm("Xóa khoản dự kiến? Không ảnh hưởng giao dịch đã ghi sổ."))return;
   state.busy=true;del.disabled=true;
   try{
     await api("/cashflow/items/"+encodeURIComponent(del.dataset.deleteCashflow),{},"DELETE");
     await refresh();flash("Đã xóa khoản dự kiến và tải lại từ Database.");
   }catch(error){flash(failure(error));}
   finally{state.busy=false;del.disabled=false;}
   return;
 }
 const period=event.target.closest("[data-period]");if(period){
   state.period=period.dataset.period;render();
   if(state.period==="year")loadYear();
 }
});
root.addEventListener("toggle",event=>{
 if(event.target.matches?.("[data-fin-methodology]"))workbookState.methodologyOpen=event.target.open;
},true);
root.addEventListener("input",event=>{
 if(event.target.matches("[data-fin-table-filter]")){
   const term=event.target.value.trim().toLocaleLowerCase("vi");
   for(const tr of root.querySelectorAll(".fin-data-table tbody tr")){
     tr.hidden=!!term&&!tr.textContent.toLocaleLowerCase("vi").includes(term);
   }
   return;
 }

 if(state.tab!=="workbench"||!workbookState.book)return;
 const node=event.target.closest("[data-wb-row],[data-wb-field]");
 if(!node)return;
 if(node.hasAttribute("data-wb-row")){
   const row=workbookState.book.rows[Number(node.dataset.wbRow)];
   if(row&&node.dataset.wbProp)row[node.dataset.wbProp]=node.value;
 }else if(node.dataset.wbField?.startsWith("goal.")){
   if(!workbookState.book.goal)workbookState.book.goal={label:"",totalTwd:"",targetDate:"",mode:"adaptive"};
   workbookState.book.goal[node.dataset.wbField.slice(5)]=node.value;
 }else if(node.dataset.wbField){
   workBookSet(node.dataset.wbField,node.value);
 }
 const stale=root.querySelector("[data-wb-unsynced]");
 if(stale)stale.hidden=false;
});
root.addEventListener("change",async event=>{
 if(event.target.id==="fin-wb-saved"){
   const selected=workbookState.saved.find(x=>x.id===event.target.value);
   workbookState.id=selected?.id||null;
   workbookState.book=selected?structuredClone(selected.settings):newWorkbook();
   await previewWorkbook();return;
 }
 const wbInput=event.target.closest("[data-wb-field]");
 if(wbInput&&workbookState.book){
   const prop=wbInput.dataset.wbField,value=wbInput.value;
   if(prop.startsWith("goal.")){
     if(!workbookState.book.goal)workbookState.book.goal={label:"",totalTwd:"",targetDate:"",mode:"adaptive"};
     workbookState.book.goal[prop.slice(5)]=value;
   }else workBookSet(prop,value);
   if(prop==="months")await previewWorkbook();
   else scheduleWorkbookRecalculation();
   return;
 }
 const wbRow=event.target.closest("[data-wb-row]");
 if(wbRow&&workbookState.book){
   const index=Number(wbRow.dataset.wbRow),prop=wbRow.dataset.wbProp;
   if(workbookState.book.rows[index])workbookState.book.rows[index][prop]=wbRow.value;
   scheduleWorkbookRecalculation();return;
 }
 if(event.target.id!=="fin-month")return;
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value))return;
 state.month=event.target.value;state.loading=true;render();
 try{await refresh();if(state.period==="year")loadYear();}catch(error){state.loading=false;state.problem=error;render();}
});
async function loadYear(){
 try{
  const year=Number(state.month.slice(0,4));
  const [result,cashflow]=await Promise.all([api("/year?year="+year),api("/cashflow/year?year="+year)]);
  state.year=result;state.yearCashflow=cashflow;
  if(state.tab==="report"||state.tab==="budget")render();
 }catch(error){flash(failure(error));}
}
(async()=>{
 try{await refresh();}catch(error){state.problem=error;state.loading=false;render();}
})();
