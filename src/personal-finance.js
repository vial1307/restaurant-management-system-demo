import {financeMonthlyTrend,financeLiquidityForecast,financeDonut} from "./finance-visuals.js";
import {createFinanceMentorUI} from "./finance-mentor-ui.js";
import {createFinancePlanSheet} from "./finance-plan-sheet.js";
// Finance OS V2 is an entirely new, owner-only interface. All records remain in Finance PostgreSQL.
const $=s=>document.querySelector(s);
const root=$("#finance-content"),dlg=$("#finance-dialog"),form=$("#finance-form"),fields=$("#finance-fields");
const nowDate=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const state={tab:"overview",month:nowDate().slice(0,7),user:null,data:null,overview:null,cashflow:null,year:null,yearPlan:null,fx:null,advice:null,payoff:null,progress:null,days:90,buffer:"0",scenarioList:[],scenarioId:null,preview:null,baseline:null,baselineBusy:false,baselineError:null,analysisVersion:0,busy:false,ready:false,partial:[],error:null,editing:null,
 sim:{name:"Kế hoạch của tôi",months:3,salaryDay:10,bufferTwd:"0",monthlyExtraIncomeTwd:"0",rows:[]}};
const safe=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const number=(v,d=0)=>Number(v||0).toLocaleString("vi-VN",{maximumFractionDigits:d});
const val=v=>Number(v||0);
const money=(v,c="TWD")=>(c==="TWD"?"NT$":c+" ")+number(v,["USD","EUR","CNY"].includes(c)?2:0);
const amt=v=>String(v??"").replace(/(\.\d*?)0+$/,"$1").replace(/\.$/,"");
const fmtMonth=m=>"Tháng "+Number(m.slice(5,7))+"/"+m.slice(0,4);
const lastDay=m=>new Date(Date.UTC(+m.slice(0,4),+m.slice(5,7),0)).toISOString().slice(0,10);
const dayOf=n=>state.month+"-"+String(Math.min(Math.max(1,+n||31),+lastDay(state.month).slice(-2))).padStart(2,"0");
const due=(d,month=state.month)=>d&&String(d).slice(0,7)===month?String(d).slice(0,10):lastDay(month);
const escOption=(v,label,selected)=>'<option value="'+safe(v)+'"'+(selected?" selected":"")+'>'+safe(label)+'</option>';
const uuid=()=>crypto.randomUUID();
const currencies=()=>state.data?.currencies||[{code:"TWD",minor_units:0},{code:"VND",minor_units:0}];
const options=(items,valueField,labelFn,selected)=>items.map(x=>escOption(x[valueField],labelFn(x),String(x[valueField])===String(selected))).join("");
const quote=code=>code==="TWD"?{status:"base",rateToTwd:"1"}:
 state.fx?.quotes?.[code]?.status==="fresh"&&state.fx.quotes[code].rateToTwd?state.fx.quotes[code]:null;
const estimate=(amount,currency)=>{const q=quote(currency);return q&&Number.isFinite(+amount)?Number(amount)*Number(q.rateToTwd):null;};
const errorText=err=>{
 const m=String(err?.message||err||"");
 const known={FINANCE_OWNER_REQUIRED:"Tài khoản này không có quyền dùng Finance OS.",FX_RATE_UNAVAILABLE:"Chưa có tỷ giá cập nhật. Giữ nguyên số tiền gốc và thử lại khi có tỷ giá.",BALANCE_CHANGED_RELOAD:"Số dư vừa thay đổi từ nơi khác. Hãy tải lại trước khi chỉnh.",FINANCE_DUPLICATE_REQUEST:"Giao dịch này đã được nhận. Hãy tải lại lịch sử, không gửi hai lần.",TWD_RATE_REQUIRED:"Cần tỷ giá ngoại tệ mới trước khi lưu.",DEBT_FUND_RATE_REQUIRED:"Không có tỷ giá mới cho quỹ nợ. Chưa tính TWD để tránh sai lệch.",GOAL_FUND_RATE_REQUIRED:"Không có tỷ giá mới cho quỹ mục tiêu.",SOURCE_ACCOUNT_NOT_FOUND:"Chưa có ví phù hợp. Tạo ví tại phần Tài khoản.",CATEGORY_REQUIRED:"Hãy tạo một danh mục thu/chi trước.",INVALID_CURRENCY_PRECISION:"Số tiền có quá nhiều chữ số thập phân.",BALANCE_UNCHANGED:"Số dư không thay đổi.",TRANSACTION_CURRENCY_ACCOUNT_MISMATCH:"Ví và khoản thu/chi phải cùng ngoại tệ.",DEBT_HAS_POSTED_PAYMENTS:"Nợ đã có khoản thanh toán thực tế; không thể xóa.",DEBT_HAS_POSTED_RECEIPT:"Khoản vay đã giải ngân vào ví thực tế; không thể xóa lịch sử.",LOAN_FX_RATE_REQUIRED:"Chưa có tỷ giá hợp lệ để ghi khoản vay ngoại tệ.",LOAN_ACCOUNT_CURRENCY_MISMATCH:"Ví nhận tiền phải cùng ngoại tệ với khoản vay.",INVALID_LOAN_RECEIPT:"Thông tin nhận tiền vay không hợp lệ.",ACCOUNT_HAS_POSTED_TRANSACTIONS:"Ví đã có giao dịch thực tế; không thể xóa.",CATEGORY_HAS_POSTED_TRANSACTIONS:"Danh mục đã sử dụng trong giao dịch; không thể xóa.",TRANSACTION_ALREADY_ADJUSTED:"Giao dịch đã sửa hoặc hủy trước đó.",DEBT_PAYMENT_IS_IMMUTABLE:"Thanh toán nợ không thể sửa/xóa trực tiếp.",TRANSACTION_NOT_CORRECTABLE:"Chỉ hỗ trợ sửa/hủy giao dịch thu và chi thông thường."};
 return known[m]|| (err?.status===503?"Finance Database đang gián đoạn; dữ liệu không bị xóa.":m);
};
async function api(path,body,method="GET"){
 const write=method!=="GET";const res=await fetch("/api/finance"+path,{method,credentials:"same-origin",cache:"no-store",headers:{"Accept":"application/json",...(write?{"Content-Type":"application/json","X-Finance-Write":"1"}:{})},body:write?JSON.stringify(body??{}):undefined});
 let data={};try{data=await res.json();}catch{}
 if(!res.ok){const e=new Error(data.error||"SERVER_ERROR");e.status=res.status;throw e;}
 return data;
}
function notify(message){const el=$("#finance-toast");el.textContent=message;el.hidden=false;clearTimeout(notify.timer);notify.timer=setTimeout(()=>el.hidden=true,4200);}
function title(t,sub,actions=""){return '<div class="page-head"><div><h1>'+safe(t)+'</h1><p>'+safe(sub)+'</p></div><div class="page-actions">'+actions+'</div></div>';}
function btn(name,action,css="soft",attrs=""){return '<button type="button" class="btn '+css+'" data-action="'+safe(action)+'" '+attrs+'>'+safe(name)+'</button>';}
function card(t,body,extra="",subtitle=""){return '<section class="card"><div class="section-title"><div><h2>'+safe(t)+'</h2>'+(subtitle?'<p class="section-sub">'+safe(subtitle)+'</p>':"")+'</div>'+extra+'</div>'+body+'</section>';}
function tag(kind){return '<span class="tag '+safe(kind)+'">'+({income:"Thu",expense:"Chi",debt:"Công nợ",goal:"Tiết kiệm",borrowing:"Thu từ khoản vay"}[kind]||"Khác")+'</span>';}
function empty(t){return '<div class="empty">'+safe(t)+'</div>';}
const mentorUI=createFinanceMentorUI({api,safe,card,title,money,notify,onChange:()=>render(),getBuffer:()=>state.buffer});
const sheet=createFinancePlanSheet({api,safe,notify,refresh,getMonth:()=>state.month,getRows:planRows,getCurrencies:currencies,getDebts:()=>state.data?.debts||[],getDebtFunds:()=>state.cashflow?.debtFunds||[],open});
function nav(tab){if(state.tab==="plan"&&tab!=="plan"&&sheet.hasChanges()&&!confirm("Có thay đổi chưa lưu trong bảng kế hoạch. Chuyển trang và giữ bản nháp?"))return;state.tab=tab;render();window.scrollTo(0,0);if(tab==="mentor")void mentorUI.load();}
function quoteCards(){
 const used=[...new Set([...(state.data?.accounts||[]).map(x=>x.currency_code),...(state.data?.debts||[]).map(x=>x.currency_code),...(state.data?.goals||[]).map(x=>x.currency_code),"VND","USD"])].filter(c=>c!=="TWD");
 const html=used.map(c=>{const q=quote(c);return '<span class="rate-pill"><b>'+safe(c)+'</b> · '+(q?number(q.rateToTwd,10)+" TWD":"Chưa có tỷ giá")+'</span>';}).join("");
 return '<div class="rate-line">'+html+'</div><div class="notice">Tỷ giá tham chiếu do <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer">Rates By Exchange Rate API</a> cung cấp. TWD là đơn vị tổng hợp. Không tự động đổi tiền, không coi ví VND là TWD có thể chi ngay.</div>';
}
function planRows(){
 const cf=state.cashflow||{};const rows=[];
 for(const i of cf.items||[])rows.push({id:i.id,kind:i.kind,name:i.label,date:i.due_day?dayOf(i.due_day):lastDay(state.month),
  estimated:!i.due_day,native:i.original_amount||i.amount_twd,code:i.original_currency||"TWD",twd:val(i.amount_twd),
  rate:i.fx_rate_to_twd,debtId:i.debt_id,received:!!i.received,detail:(i.received?"Đã nhận · đã cộng vào ví thực · ":"")+(i.memo||""),source:"item",version:i.updated_at});
 const addFund=(items,kind)=>{
  for(const x of items||[]){
   const code=x.currency_code||"TWD",q=quote(code);
   const twd=x.planned_twd!==undefined&&x.planned_twd!==null?val(x.planned_twd):estimate(x.planned_amount,code);
   rows.push({id:x.id,ref:kind==="debt"?x.debt_id:x.goal_id,kind,name:x.debt_name||x.goal_name||"Quỹ",
    date:due(kind==="debt"?x.due_date:x.target_date),estimated:!(kind==="debt"?x.due_date:x.target_date)?.startsWith(state.month),
    native:x.planned_amount,code,twd:twd===null?null:twd,
    rate:q?.rateToTwd||null,detail:code!=="TWD"?"Quỹ "+number(x.planned_amount)+" "+code+" · tỷ giá tham chiếu":"",source:kind,version:x.updated_at});
  }
 };
 addFund(cf.debtFunds,"debt");addFund(cf.goalFunds,"goal");
 // A debt or goal is never duplicated as a planned expense. Missing allocation
 // is visible but is not counted in TWD cashflow until the owner sets its fund.
 for(const d of state.data?.debts||[]){
  if(val(d.outstanding_amount)<=0||!d.due_date?.startsWith(state.month)||
     (cf.debtFunds||[]).some(x=>x.debt_id===d.id))continue;
  rows.push({id:d.id,ref:d.id,kind:"debt",name:d.name,date:d.due_date,
   native:d.outstanding_amount,code:d.currency_code,twd:null,unallocated:true,
   detail:"Đến hạn · Lãi "+number(val(d.annual_interest_rate)*100,2)+"%/năm · Chưa lập quỹ",source:"debt"});
 }
 for(const g of state.data?.goals||[]){
  if(g.status!=="active"||!g.target_date?.startsWith(state.month)||
     (cf.goalFunds||[]).some(x=>x.goal_id===g.id))continue;
  rows.push({id:g.id,ref:g.id,kind:"goal",name:g.name,date:g.target_date,
   native:Math.max(0,val(g.target_amount)-val(g.current_amount)),code:g.currency_code,
   twd:null,unallocated:true,detail:"Đến hạn mục tiêu · Chưa phân bổ quỹ",source:"goal"});
 }
 return rows.sort((a,b)=>a.date.localeCompare(b.date)||
  ({income:-2,borrowing:-1,debt:0,expense:1,goal:2}[a.kind]??9)-({income:-2,borrowing:-1,debt:0,expense:1,goal:2}[b.kind]??9));
}

function forecastMonths(){
 const current=nowDate().slice(0,7),offset=(+state.month.slice(0,4)-+current.slice(0,4))*12+
   (+state.month.slice(5)-+current.slice(5))+1;
 return offset<=3?3:offset<=6?6:12;
}
function linkedMonth(){
 // This is a reference forecast from saved Finance DB records, NOT transaction history.
 if(state.month<nowDate().slice(0,7))return {status:"past",events:[]};
 const b=state.baseline;
 if(!b)return {status:state.baselineBusy?"loading":"unavailable",events:[]};
 if(state.month>b.through.slice(0,7))return {status:"outside",events:[]};
 const before=b.timeline.filter(x=>x.date<state.month+"-01");
 const start=before.length?val(before.at(-1).balanceTwd):val(b.startingBalanceTwd);
 const events=b.timeline.filter(x=>x.date.startsWith(state.month));
 const closing=events.length?val(events.at(-1).balanceTwd):start;
 const low=Math.min(start,...events.map(x=>val(x.balanceTwd)));
 const missing=events.filter(x=>val(x.balanceTwd)<val(b.bufferTwd));
 const income=events.filter(x=>val(x.amountTwd)>0).reduce((n,x)=>n+val(x.amountTwd),0);
 const outgo=events.filter(x=>val(x.amountTwd)<0).reduce((n,x)=>n-Math.abs(val(x.amountTwd)),0);
 return {status:"ready",events,opening:start,closing,minimum:low,income,expense:-outgo,
   firstGap:missing[0]||null,buffer:val(b.bufferTwd),
   incomplete:(state.cashflow?.unconvertedFunds||[]).length>0};
}
function linkedCashTable(limit=50){
 const m=linkedMonth();
 if(m.status==="loading")return empty("Đang đọc lịch thu/chi từ Database để tính số dư dự kiến…");
 if(m.status==="past")return '<div class="notice">Tháng đã qua: xem các giao dịch thực tế bên dưới. Hệ thống không giả lập lại số dư lịch sử.</div>';
 if(m.status==="outside")return '<div class="notice warn">Tháng được chọn nằm ngoài 12 tháng dự báo. Chọn tháng gần hơn để có lịch chi tiết; không tự điền số dư ước đoán.</div>';
 if(m.status!=="ready")return '<div class="notice warn">Chưa nhận được kết quả phân tích tự động. '+safe(state.baselineError||"Hãy tải lại dữ liệu.")+'</div>';
 if(!m.events.length)return empty("Trong tháng này chưa có lịch tương lai hợp lệ. Hãy kiểm tra ngày hoặc dữ liệu đã nhập.");
 return '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Ngày</th><th>Nguồn dữ liệu</th><th>Nội dung</th><th class="num">Thu / chi TWD</th><th class="num">Số dư dự kiến</th></tr></thead><tbody>'+
 m.events.slice(0,limit).map(e=>'<tr><td>'+safe(e.date.slice(8)+"/"+e.date.slice(5,7))+'</td><td>'+
 '<span class="tag '+(e.source==="scenario"?"goal":e.kind==="income"?"income":e.kind==="debt"?"debt":"expense")+'">'+
 safe(e.source==="scenario"?"Mô phỏng":e.source==="debt_fund"?"Quỹ nợ":e.source==="goal_fund"?"Quỹ mục tiêu":"Kế hoạch")+'</span></td>'+
 '<td><strong>'+safe(e.label)+'</strong></td><td class="num '+(val(e.amountTwd)<0?"negative":"positive")+'">'+
 safe(money(e.amountTwd))+'</td><td class="num '+(val(e.balanceTwd)<m.buffer?"negative":"")+'">'+
 safe(money(e.balanceTwd))+'</td></tr>').join("")+
 '</tbody></table></div>';
}
function linkedInsights(){
 const p=planSummary(),m=linkedMonth(),wallet=walletTwd();
 const status=m.status==="ready";
 const headline=status?
  '<div class="mini-list"><div><small>Số dư dự kiến đầu '+safe(fmtMonth(state.month))+'</small><strong>'+money(m.opening)+'</strong></div>'+
  '<div><small>Cuối tháng sau kế hoạch</small><strong class="'+(m.closing<0?"negative":"")+'">'+money(m.closing)+'</strong></div>'+
  '<div><small>Số dư thấp nhất</small><strong class="'+(m.minimum<0?"negative":"")+'">'+money(m.minimum)+'</strong></div></div>':
  '<div class="notice warn">Dự báo theo ngày chưa khả dụng cho tháng này. '+(m.status==="loading"?"Đang đồng bộ tự động…":"Kiểm tra phạm vi dự báo hoặc kết nối.")+'</div>';
 const conclusions=[];
 if(status&&m.firstGap)conclusions.push({urgent:true,label:"Cần xử lý trước "+m.firstGap.date,
  detail:"Số dư dự kiến xuống "+money(m.firstGap.balanceTwd)+
   " sau khoản “"+m.firstGap.label+"”. Kiểm tra thời điểm tiền về hoặc điều chỉnh chi linh hoạt, không tự trì hoãn nợ đến hạn."});
 if(p.net<0)conclusions.push({urgent:true,label:"Chi vượt thu dự kiến trong "+fmtMonth(state.month),
  detail:"Các khoản đã lập kế hoạch có chênh lệch "+money(p.net)+". Rà soát khoản bắt buộc, ưu tiên và số dư khả dụng đầu kỳ."});
 if(wallet===0)conclusions.push({urgent:true,label:"Chưa ghi nhận số dư TWD khả dụng",
  detail:"Số dư các ví TWD đang bằng 0. Nếu chưa đối soát ví thật, kết quả dự báo thiếu đầu vào quan trọng."});
 const currenciesInPlan=planRows().filter(x=>x.code!=="TWD");
 if(currenciesInPlan.length)conclusions.push({urgent:false,label:"Đã tính kế hoạch ngoại tệ vào TWD tham chiếu",
  detail:currenciesInPlan.length+" khoản VND/ngoại tệ đang được định giá theo tỷ giá tham chiếu. Tỷ giá ngân hàng, phí đổi và ngày thanh toán thực tế có thể khác."});
 if(state.cashflow?.unconvertedFunds?.length||p.incomplete)conclusions.push({urgent:true,label:"Có quỹ chưa định giá được",
  detail:"Chưa có tỷ giá hợp lệ. Tổng dòng tiền và khả năng thanh toán chưa đầy đủ; không tự thay giá trị bị thiếu bằng 0."});
 if(!conclusions.length)conclusions.push({urgent:false,label:"Chưa thấy chênh lệch lớn trong tháng được chọn",
  detail:"Dự báo dựa trên các khoản đã lưu; số tiền chưa khai báo và thay đổi thu nhập sau này chưa được tính."});
 return '<div class="stack">'+headline+
  conclusions.map((x,i)=>'<div class="alert-row"'+(!x.urgent?' style="background:#f3f8ff"':'')+'>'+
  '<div><strong>'+(i+1)+". "+safe(x.label)+'</strong><p>'+safe(x.detail)+'</p></div></div>').join("")+
  '<div class="notice">Phân tích đọc từ Finance Database theo ngày. Thu/chi dự kiến chưa phải giao dịch đã ghi sổ. Quỹ nợ chỉ được tính một lần trong mô hình và khoản đã trả được đối chiếu riêng.</div></div>';
}

function priorityRibbon(){
 return '<div class="notice finance-priority"><strong>Ưu tiên phân bổ:</strong> '+
  '<span class="tag debt">1 · Nợ đến hạn</span> <span class="tag expense">2 · Chi thiết yếu</span> '+
  '<span class="tag goal">3 · Tiết kiệm</span>'+
  ' <small>Vẫn bảo vệ tiền chi thiết yếu và số dư tối thiểu trước khi đề xuất trả nợ thêm.</small></div>';
}
function payoffSchedule(){
 const p=state.payoff;
 if(!p)return '<div class="notice warn">Chưa tải được lịch phân bổ nợ tự động. Hãy kiểm tra Finance Database và thử tải lại.</div>';
 const rows=p.months||[],months=rows.map(r=>'<tr><td>'+safe(fmtMonth(r.month))+'</td>'+
  '<td class="num positive">'+safe(money(r.incomeTwd))+'</td>'+
  '<td class="num negative">'+safe(money(val(r.essentialOutgoTwd)+val(r.existingDebtTwd)))+'</td>'+
  '<td class="num">'+safe(money(r.suggestedExtraTwd))+'</td>'+
  '<td class="num">'+safe(money(r.endingAfterSuggestionsTwd))+'</td></tr>').join("");
 const actions=(p.suggestions||[]).slice(0,12).map(x=>'<div class="rowitem"><div><strong>'+
   safe(x.name)+' · '+safe(fmtMonth(x.month))+'</strong>'+
   '<p>Dự kiến trả thêm '+money(x.extraNative,x.currency)+
   ' (≈ '+money(x.extraTwd)+') · Hạn '+safe(x.dueDate||"chưa ghi")+'</p>'+
   '<small>Đã tính quỹ đang lập, không nhân đôi khoản chi.</small></div>'+
   btn("Điền vào quỹ","suggestDebtFund","small soft",'data-id="'+safe(x.debtId)+'" data-month="'+safe(x.month)+'"')+'</div>').join("");
 return '<div class="notice">Các tháng sau tự đọc lịch lương mới, khoản chi và quỹ nợ đã lưu; không tự nhận lương tháng sau nếu bạn chưa lập kế hoạch. Trả thêm chỉ là gợi ý, không ghi sổ.</div>'+
  '<div class="tbl-wrap" style="margin-top:12px"><table class="tbl"><thead><tr><th>Tháng</th><th class="num">Nguồn thu dự kiến</th><th class="num">Chi + quỹ đã lập</th><th class="num">Có thể trả thêm</th><th class="num">Còn lại sau gợi ý</th></tr></thead><tbody>'+
  (months||'<tr><td colspan="5">Chưa có dữ liệu đủ để phân bổ.</td></tr>')+'</tbody></table></div>'+
  (actions?'<h3 style="margin-top:16px">Các bước đề xuất — xác nhận từng quỹ trước khi lưu</h3>'+actions:'<div class="notice" style="margin-top:12px">Chưa có số dư an toàn để đề xuất trả thêm. Kiểm tra nguồn lương và lịch chi của các tháng tới.</div>')+
  (p.remaining?.length?'<h3 style="margin-top:16px">Dư nợ ước tính sau kỳ dự báo</h3>'+
   p.remaining.map(d=>'<div class="rowitem"><div><strong>'+safe(d.name)+'</strong><p>'+
    safe(d.currency)+' · '+(d.missingRate?'Chưa có tỷ giá':money(d.remainingNative,d.currency))+
    '</p></div></div>').join(""):'')+
  (p.warnings||[]).slice(0,4).map(x=>'<div class="notice warn" style="margin-top:8px">'+safe(x)+'</div>').join("");
}
function planSummary(){
 const r=planRows(),income=r.filter(x=>x.kind==="income").reduce((n,x)=>n+(x.twd||0),0);
 const borrowing=r.filter(x=>x.kind==="borrowing"&&!x.received).reduce((n,x)=>n+(x.twd||0),0);
 const expenses=r.filter(x=>!["income","borrowing"].includes(x.kind)).reduce((n,x)=>n+(x.twd||0),0);
 return {income,borrowing,inflow:income+borrowing,expenses,net:income+borrowing-expenses,
  incomplete:r.some(x=>x.twd===null&&!x.unallocated),unallocated:r.filter(x=>x.unallocated&&x.kind==="debt").length};
}
function walletTwd(){return (state.data?.accounts||[]).filter(x=>x.currency_code==="TWD").reduce((n,x)=>n+val(x.balance),0);}
function goalPercent(g){return Math.max(0,Math.min(100,val(g.current_amount)/Math.max(1,val(g.target_amount))*100));}
function walletList(){
 const accounts=state.data?.accounts||[];
 return accounts.length?accounts.map(a=>'<div class="rowitem"><div><strong>'+safe(a.name)+'</strong><p>'+safe(a.currency_code)+' · '+safe(a.kind)+'</p></div><div class="right"><strong>'+safe(money(a.balance,a.currency_code))+'</strong><div class="tools">'+
 btn("Đối soát","reconcile","small soft",'data-id="'+safe(a.id)+'"')+
 btn("Sửa","editAccount","small ghost",'data-id="'+safe(a.id)+'"')+
 btn("Xóa","deleteAccount","small danger",'data-id="'+safe(a.id)+'"')+
 '</div></div></div>').join(""):empty("Chưa có ví. Hãy thêm ví hoặc tài khoản ngân hàng.");
}
function archivedFinanceList(kind){
 const types={
  debt:{items:state.data?.archivedDebts||[],title:"Khoản nợ đã xóa khỏi quản lý",restore:"restoreDebt",desc:x=>x.currency_code+" · gốc ban đầu "+money(x.principal_original,x.currency_code)},
  account:{items:state.data?.archivedAccounts||[],title:"Ví đã xóa khỏi quản lý",restore:"restoreAccount",desc:x=>x.currency_code+" · số dư sổ cái vẫn còn "+money(x.balance,x.currency_code)},
  category:{items:state.data?.archivedCategories||[],title:"Danh mục đã xóa khỏi quản lý",restore:"restoreCategory",desc:x=>x.kind==="income"?"Danh mục thu nhập":"Danh mục chi tiêu"}
 };
 const o=types[kind];if(!o.items.length)return "";
 return '<details class="finance-archived"><summary>'+safe(o.title)+' ('+o.items.length+')</summary>'+
  '<div class="notice">Các mục có bút toán thực tế được lưu trữ để bảo toàn số liệu. Khôi phục không tự tạo lại kế hoạch đã xóa.</div>'+
  o.items.map(x=>'<div class="rowitem"><div><strong>'+safe(x.name)+'</strong><p>'+safe(o.desc(x))+'</p></div>'+
   btn("Khôi phục",o.restore,"small soft",'data-id="'+safe(x.id)+'"')+'</div>').join("")+'</details>';
}
function goalList(limit=99){
 const goals=(state.data?.goals||[]).filter(x=>x.status==="active").slice(0,limit);
 return goals.length?goals.map(g=>'<div class="goal-card"><div class="goal-head"><strong>'+safe(g.name)+'</strong><b>'+Math.round(goalPercent(g))+'%</b></div><small>'+money(g.current_amount,g.currency_code)+' / '+money(g.target_amount,g.currency_code)+'</small><div class="progress"><i style="width:'+goalPercent(g)+'%"></i></div></div>').join(""):empty("Chưa có mục tiêu. Tạo mục tiêu đầu tiên.");
}
function warningList(limit=5){
 const a=state.advice;const hits=[];
 if(a?.earliestRisk)hits.push({title:"Nguy cơ thiếu tiền ngày "+a.earliestRisk.date,body:"Thiếu khoảng "+money(a.earliestRisk.gapTwd)+" so với khoản dự trữ đã chọn."});
 for(const w of a?.warnings||[])hits.push({title:"Cần kiểm tra kế hoạch",body:typeof w==="string"?w:w.message||String(w)});
 const funds=state.cashflow?.unconvertedFunds||[];for(const x of funds)hits.push({title:"Chưa quy đổi được quỹ "+x.currency,body:"Khoản "+x.name+" chưa có tỷ giá mới, nên chưa thể tính đúng TWD."});
 return hits.length?hits.slice(0,limit).map(w=>'<div class="alert-row"><div><strong>'+safe(w.title)+'</strong><p>'+safe(w.body)+'</p></div></div>').join(""):'<div class="notice">Không có cảnh báo lớn theo những dữ liệu đã nhập. Các khoản chưa khai báo vẫn chưa được tính.</div>';
}
function planTable(limit=100){
 const rows=planRows().slice(0,limit);
 if(!rows.length)return empty("Chưa có kế hoạch trong tháng này. Chọn “Thêm thu/chi dự kiến” để bắt đầu.");
 return '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Ngày</th><th>Loại</th><th>Nội dung</th><th>Giá trị gốc</th><th class="num">Thu (TWD)</th><th class="num">Chi (TWD)</th><th>Ghi chú</th><th></th></tr></thead><tbody>'+rows.map(r=>
  '<tr><td>'+safe(r.date.slice(8)+"/"+r.date.slice(5,7))+(r.estimated?' <small>ước tính</small>':'')+'</td><td>'+tag(r.kind)+'</td><td><strong>'+safe(r.name)+'</strong></td>'+
  '<td>'+safe(money(r.native,r.code))+'</td><td class="num positive">'+(["income","borrowing"].includes(r.kind)?(r.received?"Đã nhận vào ví":safe(money(r.twd))):"—")+'</td>'+
  '<td class="num negative">'+(!["income","borrowing"].includes(r.kind)?(r.unallocated?"Chưa lập quỹ":r.twd===null?"Chưa có tỷ giá":safe(money(r.twd))):"—")+'</td>'+
  '<td>'+safe(r.detail||"—")+'</td><td>'+
  (r.kind==="borrowing"&&!r.received?btn("Đã nhận tiền","borrow","small primary",'data-id="'+safe(r.debtId)+'"'):"")+
  btn("Sửa",r.source==="item"?"editPlan":r.source==="debt"?"fundDebt":"fundGoal","small soft",'data-id="'+safe(r.source==="item"?r.id:r.ref)+'"')+'</td></tr>').join("")+
  '</tbody></table></div>';
}
function actualIncome(){return (state.overview?.flow||[]).filter(x=>x.kind==="income").reduce((n,x)=>n+val(x.total_twd),0);}
function actualExpense(){return (state.overview?.flow||[]).filter(x=>x.kind==="expense").reduce((n,x)=>n+val(x.total_twd),0);}
function metrics(){
 const p=planSummary();const risks=(state.advice?.earliestRisk?1:0)+(state.cashflow?.unconvertedFunds?.length||0);
 const goals=state.data?.goals||[];const completion=goals.filter(x=>x.status==="active").length?
 goals.filter(x=>x.status==="active").reduce((n,g)=>n+goalPercent(g),0)/goals.filter(x=>x.status==="active").length:null;
 const parts=[{label:"Số dư TWD hiện tại",value:money(walletTwd()),color:"blue",ico:"◈"},{label:"Dòng tiền dự kiến trong tháng",value:money(p.net),color:"green",ico:"↗"},{label:"Cảnh báo cần theo dõi",value:String(risks)+" mục",color:"orange",ico:"◷"},{label:"Tiến độ mục tiêu",value:completion===null?"Chưa có":Math.round(completion)+"%",color:"purple",ico:"◎"}];
 return '<div class="metrics">'+parts.map(x=>'<div class="metric '+x.color+'"><small>'+safe(x.label)+'</small><span class="metric-icon">'+x.ico+'</span><strong>'+safe(x.value)+'</strong></div>').join("")+'</div>';
}
function reportDonut(){return financeDonut((state.overview?.budget||[]).filter(x=>x.kind==="expense").map(x=>({name:x.name,value:val(x.actual_twd)})));}
function overview(){
 const p=planSummary();
 return title("Tổng quan tài chính","Tất cả dòng tiền, nghĩa vụ và kế hoạch trong một nơi.",btn("+ Thu / chi thật","transaction","primary")+btn("+ Nhận tiền vay","borrow","soft")+btn("+ Kế hoạch","newPlan","soft"))+
 metrics()+'<div class="layout-2"><div class="stack">'+
 card("Kế hoạch dòng tiền theo ngày",planTable(18),btn("Xem tất cả →","goPlan","small soft"),"Số tiền kế hoạch bằng ngoại tệ được quy đổi theo tỷ giá tham chiếu.")+
 card("Dòng tiền 90 ngày tới",'<div class="chart-box">'+financeLiquidityForecast(state.advice)+'</div>',btn("Xem tư vấn","goSim","small soft"))+
 '</div><div class="stack">'+
 card("Nghĩa vụ cần nhớ",mentorUI.brief(),'<button type="button" class="btn small soft" data-tab="mentor">Mở AI Mentor</button>')+
 card("Cảnh báo quan trọng",warningList(4))+
 card("Phân bổ chi tiêu tháng này",reportDonut())+
 '</div></div>'+
 '<div class="layout-2 equal">'+card("Gợi ý hành động",linkedInsights()+(state.advice?.recommendations||[]).slice(0,2).map((r,i)=>
 '<div class="rowitem"><div><strong>'+(i+1)+". "+safe(r.title)+'</strong><p>'+safe(r.detail)+'</p></div></div>').join("")||empty("Đang phân tích dòng tiền theo ngày."))+
 card("Mục tiêu tài chính của bạn",goalList(4),btn("Quản lý mục tiêu →","goCommit","small soft"))+'</div>'+
 card("Tài khoản và số dư",walletList(),btn("+ Thêm ví","account","small soft"));
}
function planning(){
 const sum=planSummary();const incomplete=sum.incomplete;
 return title("Kế hoạch tài chính",fmtMonth(state.month)+" · Quy đổi TWD cho dự báo, giữ nguyên số tiền gốc.",btn("+ Thêm thu/chi dự kiến","newPlan","primary"))+
 '<div class="mini-list"><div><small>Thu dự kiến · thu nhập (không gồm tiền vay)</small><strong class="positive">'+money(sum.income)+'</strong></div><div><small>Thu từ khoản vay dự kiến</small><strong class="positive">'+money(sum.borrowing)+'</strong></div><div><small>Tổng tiền vào dự kiến</small><strong>'+money(sum.inflow)+'</strong></div><div><small>Chi & quỹ dự kiến</small><strong class="negative">'+money(sum.expenses)+'</strong></div><div><small>Chênh lệch trong tháng</small><strong>'+money(sum.net)+'</strong></div></div><div style="height:14px"></div>'+
 (incomplete?'<div class="notice warn">Có khoản ngoại tệ thiếu tỷ giá cập nhật; tổng TWD phía trên chưa bao gồm những khoản đó.</div><div style="height:12px"></div>':"")+
 priorityRibbon()+card("Bảng kế hoạch theo tháng",sheet.html(),"","Nhập trực tiếp trên ô, chọn nhiều dòng, dán từ Excel/Google Sheets và lưu đồng bộ PostgreSQL.")+
 card("Phân tích dòng tiền theo tháng đã chọn",linkedInsights(),btn("Xem mô phỏng đầy đủ","goSim","small soft"))+
 card("Mốc cần chuẩn bị tiền trả nợ",datedDebtAgenda(),btn("Xem công nợ","goCommit","small soft"))+
 card("Lịch số dư sau từng khoản",linkedCashTable(),btn("Mô phỏng thêm","goSim","small soft"),"Đọc trực tiếp kế hoạch đang lưu; chưa ghi chi tiêu thực tế.")+
 '<div class="layout-2 equal">'+card("Số dư và các ví",walletList(),btn("Tạo ví","account","small soft"))+
 card("Tỷ giá đang sử dụng",quoteCards(),btn("Cập nhật","reloadFx","small soft"))+'</div>';
}
function debtProgressPanels(){
 const progress=state.progress;
 if(!progress)return '<div class="notice warn">Chưa tải được lịch sử trả nợ theo tháng từ Finance Database. Hãy tải lại để đối chiếu.</div>';
 if(!progress.debts?.length)return empty("Chưa khai báo khoản nợ để theo dõi.");
 const rows=progress.debts.map(d=>{
  const paidYear=d.months.reduce((n,m)=>n+val(m.paidTotalNative),0);
  const active=d.months.filter(m=>m.month===state.month||val(m.plannedNative)>0||m.paymentCount>0||
   m.month===nowDate().slice(0,7));
  const details=active.length?active.map(m=>{
   const paid=m.paymentCount>0?money(m.paidTotalNative,d.currency):"Chưa có bút toán";
   const planned=money(m.plannedNative,d.currency);
   const note=m.status==="unreconciled"?
    '<small class="negative">Chưa đối chiếu khoản trả của tháng đã qua</small>':
    m.status==="planned"?'<small>Kế hoạch, chưa xác nhận thanh toán</small>':
    m.status==="posted"?'<small class="positive">Đã ghi nhận '+m.paymentCount+' giao dịch</small>':
    '<small>Chưa lập quỹ / chưa ghi trả</small>';
   return '<tr><td>'+safe(m.month)+'</td>'+
    '<td class="num">'+planned+'</td>'+
    '<td class="num positive">'+paid+'</td>'+
    '<td class="num">'+money(m.paidPrincipalNative,d.currency)+'</td>'+
    '<td class="num">'+money(m.paidInterestNative,d.currency)+'</td>'+
    '<td class="num">'+money(m.closingPrincipalNative,d.currency)+'</td>'+
    '<td>'+note+(m.plannedPaymentDate?'<small>Ngày tự chọn: '+safe(m.plannedPaymentDate)+'</small>':"")+'</td></tr>';
  }).join(""):'<tr><td colspan="7">Không có kế hoạch hay thanh toán trong năm được chọn.</td></tr>';
  const dueLabel=d.dueDate?
    ((d.obligationType==="fixed")?"Hạn đã khai báo: ":"Ngày ghi trong hồ sơ (chưa xác minh cam kết): ")+d.dueDate:
    "Chưa có hạn cố định · chủ động lập lịch trả";
  return '<details class="finance-debt-progress"><summary><strong>'+safe(d.name)+'</strong>'+
   ' · Đã trả năm '+progress.year+': '+money(paidYear,d.currency)+
   ' · Dư nợ hiện ghi: '+money(d.months.at(-1)?.closingPrincipalNative||d.principalOriginal,d.currency)+
   '</summary><div class="notice">'+safe(dueLabel)+
   '. Quỹ dự kiến KHÔNG phải tiền đã trả. Dư nợ sau tháng chỉ giảm theo bút toán thực tế.</div>'+
   '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Tháng</th><th class="num">Quỹ dự kiến</th>'+
   '<th class="num">Đã trả thật</th><th class="num">Gốc trả</th><th class="num">Lãi trả</th>'+
   '<th class="num">Dư gốc thực</th><th>Đối chiếu</th></tr></thead><tbody>'+details+
   '</tbody></table></div></details>';
 }).join("");
 return '<div class="notice">Đọc từ PostgreSQL theo từng khoản và từng tháng. Số tiền gốc, lãi, phí đã trả chỉ lấy từ giao dịch “Đã trả nợ” được xác nhận. Nếu trước đây bạn chỉ nhập số tiền vào Kế hoạch, hệ thống chưa thể khẳng định đã trả.</div>'+
  rows+(progress.warnings||[]).slice(0,5).map(w=>'<div class="notice warn">'+safe(w)+'</div>').join("");
}
function datedDebtAgenda(){
 const advice=state.advice;
 if(!advice)return '<div class="notice">Đang tải lịch phân tích theo ngày từ dòng tiền thực và kế hoạch.</div>';
 const actions=(advice.debtActions||[]).slice(0,15);
 const gap=advice.earliestRisk;
 const overview=gap?'<div class="notice warn"><strong>Cần chuẩn bị trước '+safe(gap.date)+'</strong> · Dự báo thiếu '+money(gap.gapTwd)+
  ' so với mức dự trữ. Kiểm tra ngày lương về và khoản bắt buộc trước mốc này.</div>':
  '<div class="notice">Chưa thấy điểm hụt quỹ dự trữ trong phạm vi dự báo. Điều này chỉ đúng nếu các ngày thu, chi đã nhập được thực hiện.</div>';
 if(!actions.length)return overview+
  '<div class="notice">Chưa có quỹ trả nợ được lập cho các ngày sắp tới. Với khoản vay bạn bè không cố định, hãy chọn một tháng, lập quỹ và nhập ngày tự dự kiến trả.</div>';
 return overview+actions.map(x=>{
  const isGap=val(x.gapToBufferTwd)>0;
  const dateLabel=x.dateType==="owner_target"?"Ngày tự chọn":x.dateType==="recorded_due_date"?"Ngày nợ đã khai báo":"Cuối tháng tạm tính";
  return '<div class="rowitem"><div><strong>'+safe(x.name)+'</strong>'+
   '<p>Chuẩn bị từ '+safe(x.reviewBy)+' · '+dateLabel+': '+safe(x.plannedDate)+
   ' · Khoản dự kiến '+money(x.amountTwd)+'</p>'+
   '<small>Số dư sau kế hoạch: '+money(x.projectedBalanceAfterTwd)+
   (isGap?' · Thiếu dự trữ '+money(x.gapToBufferTwd):' · Không hụt mức dự trữ theo dữ liệu đang có')+'</small>'+
   (x.nextIncomeAfterDate?'<small>Nguồn thu tiếp theo ngày '+safe(x.nextIncomeAfterDate)+' đến SAU mốc trả dự kiến.</small>':"")+
   '<small>'+(x.estimatedDate?"Ngày này chỉ tạm tính; chưa được coi là hạn trả bắt buộc. ":"")+
   safe(x.message)+'</small></div></div>';
 }).join("");
}
function commitments(){
 const debts=state.data?.debts||[];const funds=state.cashflow?.debtFunds||[];
 const debtHtml=debts.length?debts.map(d=>{const f=funds.find(x=>x.debt_id===d.id),rate=quote(d.currency_code);
 return '<div class="rowitem"><div><strong>'+safe(d.name)+'</strong><p>'+(val(d.planned_borrowing_twd)>0&&val(d.received_amount)===0?'Khoản vay DỰ KIẾN (chưa thực nhận): ':'Dư nợ: ')+safe(money(d.outstanding_amount,d.currency_code))+
  (d.due_date?' · Hạn '+safe(d.due_date):' · Chưa có hạn')+' · Lãi '+number(val(d.annual_interest_rate)*100,2)+'%/năm'+(val(d.received_amount)>0?' · Đã nhận vào ví '+money(d.received_amount,d.currency_code):' · Chưa có chứng từ giải ngân lưu trong hệ thống')+'</p><small>'+(f?'Quỹ tháng: '+money(f.planned_amount,d.currency_code)+(f.planned_twd!==null?' (≈ '+money(f.planned_twd)+')':' · chưa có tỷ giá'):'Chưa có quỹ tháng này')+'</small></div>'+
  '<div class="tools">'+(val(d.planned_borrowing_twd)>0&&val(d.received_amount)===0?btn("Đã nhận tiền","borrow","small primary",'data-id="'+safe(d.id)+'"'):"")+btn("Lập quỹ","fundDebt","small soft",'data-id="'+safe(d.id)+'"')+btn("Sửa hạn/lãi","editDebt","small ghost",'data-id="'+safe(d.id)+'"')+btn("Đã trả nợ","payDebt","small ghost",'data-id="'+safe(d.id)+'"')+btn("Xóa","deleteDebt","small danger",'data-id="'+safe(d.id)+'"')+'</div></div>';}).join(""):empty("Chưa khai báo công nợ.");
 const goals=state.data?.goals||[];const gf=state.cashflow?.goalFunds||[];
 const goalHtml=goals.length?goals.map(g=>{const f=gf.find(x=>x.goal_id===g.id);
 return '<div class="rowitem"><div style="flex:1"><strong>'+safe(g.name)+'</strong><p>'+money(g.current_amount,g.currency_code)+" / "+money(g.target_amount,g.currency_code)+(g.target_date?" · "+safe(g.target_date):"")+'</p><div class="progress"><i style="width:'+goalPercent(g)+'%"></i></div>'+(f?'<small>Quỹ tháng: '+money(f.planned_amount,g.currency_code)+'</small>':"")+'</div>'+
 '<div class="tools">'+btn("Phân bổ","fundGoal","small soft",'data-id="'+safe(g.id)+'"')+btn("Sửa","editGoal","small ghost",'data-id="'+safe(g.id)+'"')+btn("Xóa","deleteGoal","small danger",'data-id="'+safe(g.id)+'"')+'</div></div>';}).join(""):empty("Chưa có mục tiêu.");
 return title("Công nợ & mục tiêu","Quản lý khoản cần trả và mục tiêu tích lũy trong cùng một trang.",btn("+ Nhận tiền vay","borrow","primary")+btn("+ Khoản nợ chưa giải ngân","debt","soft")+btn("+ Mục tiêu","goal","soft"))+
 priorityRibbon()+'<div class="layout-2 equal">'+card("Danh sách khoản nợ",debtHtml)+card("Mục tiêu và quỹ tích lũy",goalHtml)+'</div>'+
 card("Tiến độ trả nợ theo tháng · "+state.month.slice(0,4),debtProgressPanels())+
 archivedFinanceList("debt")+
 card("Lịch cần xoay tiền và dự kiến trả",datedDebtAgenda(),btn("Xem mô phỏng","goSim","small soft"))+
 card("Phân bổ nguồn lương để trả nợ trong 12 tháng",payoffSchedule(),btn("Mở mô phỏng","goSim","small soft"))+
 card("Quỹ trong kế hoạch tháng",planTable(),btn("Xem kế hoạch","goPlan","small soft"))+
 '<div class="notice">“Nhận tiền vay” ghi nhận đồng thời tiền thực nhận vào ví và công nợ; KHÔNG ghi vào thu nhập. “Khoản nợ chưa giải ngân” chỉ tạo công nợ, không thêm tiền vào ví. Quỹ nợ và mục tiêu vẫn chỉ là kế hoạch.</div>';
}
function reportRows(){
 const records=state.overview?.events||[];
 if(!records.length)return empty("Chưa có giao dịch thực tế trong tháng.");
 return '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Ngày</th><th>Loại</th><th>Nội dung</th><th>Ví</th><th class="num">Số tiền gốc</th><th>Thao tác</th></tr></thead><tbody>'+
 records.map(e=>{const first=e.entries?.[0]||{},wallet=(state.data?.accounts||[]).find(a=>a.id===first.accountId);
  const editable=["income","expense"].includes(e.kind)&&!e.reversed&&!e.debt_payment;
  return '<tr><td>'+safe(String(e.occurred_at||"").slice(0,10))+'</td><td>'+tag(e.kind)+(e.reversed?' <span class="tag">Đã hủy/sửa</span>':'')+
   '</td><td>'+safe(e.description||"Giao dịch")+'</td><td>'+safe(wallet?.name||"—")+'</td><td class="num">'+safe(money(first.amount,first.currency||"TWD"))+
   '</td><td><div class="tools">'+(editable?
   btn("Sửa","editTransaction","small soft",'data-id="'+safe(e.id)+'"')+
   btn("Hủy","reverseTransaction","small danger",'data-id="'+safe(e.id)+'"'):
   '<span class="sheet-readonly">'+(e.reversed?"Đã điều chỉnh":e.debt_payment?"Thanh toán không thể sửa":"Bút toán hệ thống")+'</span>')+
   '</div></td></tr>';
 }).join("")+'</tbody></table></div>';
}
function reporting(){
 const year=state.year?.months||[];const inc=actualIncome(),out=actualExpense(),planned=planSummary();
 const projectedMonths=(state.yearPlan?.months||[]).map(m=>({
  month:m.month,income_twd:m.planned_income_twd,borrowing_twd:m.planned_borrowing_twd,
  expense_twd:val(m.planned_expense_twd)+val(m.debt_fund_twd)+val(m.goal_fund_twd),
  missing:!!m.fx_estimate_incomplete
 }));
 const incompleteYear=projectedMonths.some(m=>m.missing);
 const annualTable=projectedMonths.length?'<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Tháng</th><th class="num">Thu nhập</th><th class="num">Tiền vay</th><th class="num">Chi & quỹ dự kiến</th><th class="num">Chênh lệch</th></tr></thead><tbody>'+
 projectedMonths.map(m=>'<tr><td>'+safe(fmtMonth(m.month))+(m.missing?' <span class="tag expense">Thiếu tỷ giá</span>':'')+'</td><td class="num positive">'+money(m.income_twd)+
 '</td><td class="num positive">'+money(m.borrowing_twd)+'</td><td class="num negative">'+money(m.expense_twd)+'</td><td class="num">'+(m.missing?'Chưa đủ số liệu':money(val(m.income_twd)+val(m.borrowing_twd)-val(m.expense_twd)))+'</td></tr>').join("")+
 '</tbody></table></div>':empty("Chưa có dữ liệu kế hoạch năm.");

 const categories=(state.overview?.budget||[]).filter(x=>x.kind==="expense");
 const received=val(state.overview?.financing?.borrowing_twd),paid=val(state.overview?.financing?.debt_paid_twd);
 return title("Dòng tiền & báo cáo","Kế hoạch và phát sinh thực được đối chiếu riêng theo "+fmtMonth(state.month)+".",btn("+ Thu / chi","transaction","primary")+btn("Xuất CSV","export","ghost"))+
 '<div class="metrics">'+[{color:"green",label:"Đã thu tháng này",value:money(inc)},{color:"orange",label:"Đã chi tháng này",value:money(out)},{color:"blue",label:"Ròng thu/chi + vay/trả nợ",value:money(inc-out+received-paid)},{color:"purple",label:"Số giao dịch",value:String((state.overview?.events||[]).filter(x=>!x.reversed&&x.kind!=="reversal").length)}].map(x=>'<div class="metric '+x.color+'"><small>'+x.label+'</small><strong>'+x.value+'</strong></div>').join("")+'</div>'+
 card("Dòng tiền tài trợ thực tế",'<div class="mini-list"><div><small>Tiền vay thực nhận (không là thu nhập)</small><strong class="positive">'+money(received)+'</strong></div><div><small>Thanh toán nợ thực tế (gốc + lãi + phí)</small><strong class="negative">'+money(paid)+'</strong></div><div><small>Thu nhập phát sinh (không gồm tiền vay)</small><strong>'+money(inc)+'</strong></div></div><div class="notice">Ròng thu/chi + vay/trả nợ chưa bao gồm biến động do đổi ngoại tệ và điều chỉnh số dư. Ví thực tế vẫn được tính từ tất cả bút toán gốc.</div>')+
 card("Dòng tiền dự kiến từ Kế hoạch tài chính",'<div class="mini-list"><div><small>Thu dự kiến · thu nhập (không gồm tiền vay)</small><strong class="positive">'+money(planned.income)+'</strong></div><div><small>Thu từ khoản vay dự kiến</small><strong class="positive">'+money(planned.borrowing)+'</strong></div><div><small>Tổng tiền vào dự kiến</small><strong>'+money(planned.inflow)+'</strong></div><div><small>Chi và quỹ dự kiến</small><strong class="negative">'+money(planned.expenses)+'</strong></div><div><small>Chênh lệch dự kiến</small><strong>'+money(planned.net)+'</strong></div></div><div style="height:10px"></div>'+
   '<div class="notice">Kế hoạch ≠ phát sinh thực tế. Các khoản đã nhập ở tab Kế hoạch được tự đồng bộ vào đây, không yêu cầu nhập lại. Tránh cộng hai cột thành một số dư.</div>',btn("Xem kế hoạch","goPlan","small soft"))+
 '<div class="layout-2 equal">'+card("Số dư dự báo & hành động",linkedInsights())+
 card("Lịch tiền theo ngày",linkedCashTable(22))+"</div>"+
 '<div class="layout-2 equal">'+card("Xu hướng kế hoạch cả năm",
   (incompleteYear?'<div class="notice warn">Một số tháng chưa có đủ tỷ giá ngoại tệ. Biểu đồ chỉ thể hiện phần đã định giá.</div>':"")+
   '<div class="chart-box">'+financeMonthlyTrend(projectedMonths)+'</div>',
   "", "Gồm thu/chi dự kiến, quỹ nợ và mục tiêu từ Finance Database.")+
 card("Xu hướng thực tế cả năm",'<div class="chart-box">'+financeMonthlyTrend(year)+'</div>',"", "Chỉ gồm thu/chi đã thực hiện.")+'</div>'+
 card("So sánh kế hoạch 12 tháng",annualTable)+
 card("Phân bổ chi tiêu thực trong tháng",reportDonut())+
 '<div class="layout-2 equal">'+card("Ngân sách theo danh mục",categories.length?categories.map(c=>
 '<div class="rowitem"><div><strong>'+safe(c.name)+'</strong><p>Đã dùng '+money(c.actual_twd)+' / '+money(c.budget_twd)+'</p><div class="progress"><i style="width:'+Math.min(100,val(c.actual_twd)/Math.max(1,val(c.budget_twd))*100)+'%"></i></div></div>'+btn("Đặt mức","budget","small soft",'data-id="'+safe(c.category_id)+'"')+'</div>').join(""):empty("Thêm danh mục chi tiêu trước khi đặt ngân sách."),btn("+ Danh mục","category","small soft"))+
 card("Số dư các tài khoản",walletList())+'</div>'+
 card("Tiến độ trả nợ các tháng trong năm",debtProgressPanels())+
 card("Lịch sử giao dịch trong tháng",reportRows(),btn("Xuất CSV","export","small ghost"));
}
function scenario(){
 const s=state.sim,p=state.preview||state.baseline;
 const monthBreakdown=p?.months?.length?'<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Tháng</th><th class="num">Thu từ lịch</th><th class="num">Chi/Quỹ</th><th class="num">Cuối tháng</th></tr></thead><tbody>'+
  p.months.map(m=>'<tr><td>'+safe(fmtMonth(m.month))+'</td><td class="num positive">'+money(m.incomeTwd)+'</td><td class="num negative">'+money(val(m.costTwd)+val(m.goalTwd)+val(m.repaymentTwd))+
  '</td><td class="num">'+money(m.endingTwd)+'</td></tr>').join("")+'</tbody></table></div>':
  '<div class="notice">Đang tính bảng dòng tiền theo tháng.</div>';
 const compare=state.preview&&state.baseline?'<div class="notice">Chênh lệch cuối kỳ so với kế hoạch gốc: <strong>'+
  money(val(state.preview.endingTwd)-val(state.baseline.endingTwd))+
  '</strong>. Đây là tác động của giả định, chưa phải khoản tiền đã thực hiện.</div>':"";

 const preview=p?'<p class="section-sub" style="margin-bottom:10px">'+(state.preview?'Kịch bản bạn vừa phân tích':'Tự phân tích từ số liệu Kế hoạch tài chính đã lưu')+'</p><div class="mini-list"><div><small>Cuối kỳ dự báo</small><strong>'+money(p.endingTwd)+'</strong></div><div><small>Đáy số dư</small><strong>'+money(p.minimumTwd)+'</strong></div><div><small>Thu nhập cần thêm/kỳ lương</small><strong>'+(!p.minimumAdditionalIncomePerPaydayTwd?"Cần đổi lịch":money(p.minimumAdditionalIncomePerPaydayTwd))+'</strong></div></div>'+
  '<div style="height:12px"></div>'+(p.earliestRisk?'<div class="notice warn">Cần kiểm tra nguy cơ thiếu tiền từ '+safe(p.earliestRisk.date)+'</div>':'<div class="notice">Chưa phát hiện hụt so với mức dự trữ theo dữ liệu và giả định đã nhập.</div>')+
  '<div class="stack" style="margin-top:12px">'+(p.warnings||[]).slice(0,6).map(w=>'<div class="notice warn">'+safe(w)+'</div>').join("")+'</div>':(state.baselineBusy?empty("Đang tự đọc kế hoạch, quỹ nợ và dòng tiền để phân tích…"):empty("Chưa thể phân tích. "+(state.baselineError||"Kiểm tra kế hoạch và kết nối Finance Database.")));
 const row=s.rows?.[0]||{kind:"expense",date:nowDate(),amountTwd:"0",label:"Chi phát sinh"};
 const repay=s.rows?.find(x=>x.kind==="repay"&&x.linkId&&x.linkId===row.linkId);
 return title("Mô phỏng & tư vấn","Thử phương án trước khi quyết định. Mô phỏng không làm thay đổi số dư hay công nợ.")+
 '<div class="layout-2"><div class="stack">'+card("Tạo kịch bản của bạn",'<form class="form-grid" id="scenario-fields">'+
 '<label>Đặt tên kịch bản<input name="name" value="'+safe(s.name)+'"></label>'+
 '<label>Khoảng thời gian<select name="months">'+[3,6,12].map(n=>escOption(n,n+" tháng",n===s.months)).join("")+'</select></label>'+
 '<label>Ngày nhận lương (1–31)<input name="salaryDay" type="number" min="1" max="31" value="'+safe(s.salaryDay)+'"></label>'+
 '<label>Số dư tối thiểu muốn giữ (TWD)<input name="bufferTwd" inputmode="decimal" value="'+safe(s.bufferTwd)+'"></label>'+
 '<label>Thu nhập tăng thêm mỗi tháng (TWD)<input name="monthlyExtraIncomeTwd" inputmode="decimal" value="'+safe(s.monthlyExtraIncomeTwd)+'"></label>'+
 '<label>Giả định thêm<select name="kind">'+["expense","income","income_loss","debt","borrow"].map(k=>escOption(k,{expense:"Chi phí phát sinh",income:"Thu thêm",income_loss:"Giảm thu nhập",debt:"Trả nợ thêm",borrow:"Giả định vay → trả"}[k],k===row.kind)).join("")+'</select></label>'+
 '<label>Tên khoản thay đổi<input name="rowLabel" value="'+safe(row.label)+'"></label>'+
 '<label>Ngày phát sinh<input name="rowDate" type="date" value="'+safe(row.date)+'"></label>'+
 '<label>Số tiền thay đổi (TWD)<input name="rowAmount" value="'+safe(row.amountTwd)+'"></label>'+
 '<fieldset id="scenario-loan-fields" '+(row.kind==="borrow"?"":"hidden disabled")+'><label>Ngày hoàn trả khoản vay<input name="repayDate" type="date" value="'+safe(repay?.date||row.date||nowDate())+'" required></label>'+
 '<label>Tổng gốc + lãi + phí phải trả (TWD)<input name="repayAmount" value="'+safe(repay?.amountTwd||row.amountTwd||"0")+'" required></label>'+
 '<div class="notice">Đây chỉ là giả định: nguồn vay và số tiền trả được ghép cặp, không ghi vào ví hoặc công nợ. Đừng mô phỏng lại khoản đã thực nhận vì số dư ví đã tính khoản đó.</div></fieldset></form>'+
 '<div class="page-actions" style="margin-top:14px">'+btn("Phân tích dòng tiền","simulate","primary")+btn("Lưu kịch bản","saveScenario","soft")+btn("Kịch bản mới","newScenario","ghost")+'</div>',
 "", "Chỉ một khoản giả định mỗi lần, dễ hiểu, có thể thay thế để so sánh các phương án.")+
 card("Các khoản nguồn từ Database",planTable(16),btn("Sửa kế hoạch","goPlan","small soft"),"Thu/chi, công nợ và mục tiêu trong "+fmtMonth(state.month)+" đã được đưa vào mô phỏng.")+
 card("Cách hệ thống tư vấn",'<div class="rowitem"><div><strong>1. Dòng tiền thực</strong><p>Lấy số dư ví TWD và các lịch thu/chi, quỹ nợ đã nhập từ Finance Database.</p></div></div>'+
 '<div class="rowitem"><div><strong>2. Ngày phát sinh</strong><p>Kiểm tra ngày hụt trước khi lương đến; số tiền nhận sau đó không thể trả một khoản đã quá hạn.</p></div></div>'+
 '<div class="rowitem"><div><strong>3. Mô phỏng an toàn</strong><p>So với mức dự trữ và giả định tăng/giảm thu nhập. Không tạo giao dịch thật.</p></div></div>'+
 '<div class="rowitem"><div><strong>4. Căn cứ phương pháp</strong><p>Tiền vay tách khỏi thu nhập theo nguyên tắc phân loại dòng tiền tài trợ của IAS 7; lập lịch thu/chi tham khảo cách tiếp cận của CFPB. Thứ tự Nợ &gt; Chi thiết yếu &gt; Tiết kiệm là quy tắc do bạn thiết lập cho Finance OS, không phải yêu cầu của IAS 7.</p></div></div>')+'</div>'+
 '<div class="stack">'+card("Kết quả dự báo",preview)+
 card("Dòng tiền theo từng tháng",monthBreakdown+compare)+
 card("Tư vấn tự động theo tháng đã chọn",linkedInsights())+
 card("Lịch phân bổ lương và nguồn thu để trả nợ",payoffSchedule())+
 card("Ngày cần chuẩn bị trước từng khoản trả",datedDebtAgenda())+
 card("Lịch thu/chi và số dư dự kiến",linkedCashTable(24))+
 
 card("Các kịch bản đã lưu",(state.scenarioList||[]).length?state.scenarioList.map(x=>'<div class="rowitem"><div><strong>'+safe(x.name)+'</strong><p>Cập nhật '+safe(String(x.updated_at).slice(0,10))+'</p></div><div class="tools">'+btn("Mở / Sửa","openScenario","small soft",'data-id="'+safe(x.id)+'"')+btn("Xóa","deleteScenario","small danger",'data-id="'+safe(x.id)+'"')+'</div></div>').join(""):empty("Chưa lưu kịch bản nào."))+
 '</div></div>';
}
function settings(){
 return title("Tài khoản & cài đặt","Chỉ giữ những chức năng cần thiết để quản lý ví, danh mục và ngoại tệ.",btn("+ Ví mới","account","primary")+btn("+ Danh mục","category","soft"))+
 '<div class="layout-2 equal">'+card("Ví và số dư",walletList())+card("Ngoại tệ tham chiếu",quoteCards(),btn("↻ Làm mới","reloadFx","small soft"))+'</div>'+
 card("Danh mục thu / chi",(state.data?.categories||[]).map(c=>'<div class="rowitem"><div><strong>'+safe(c.name)+'</strong><p>'+safe(c.kind==="income"?"Thu nhập":"Chi tiêu")+'</p></div><div class="tools">'+btn("Sửa","editCategory","small ghost",'data-id="'+safe(c.id)+'"')+btn("Xóa","deleteCategory","small danger",'data-id="'+safe(c.id)+'"')+'</div></div>').join("")||empty("Chưa có danh mục."))+
 archivedFinanceList("account")+archivedFinanceList("category")+
 '<div class="notice">Các mục có giao dịch đã xóa khỏi danh sách được lưu trữ. Tiền trong ví lưu trữ không tính là tiền khả dụng trong tư vấn; khôi phục ví để dùng lại. Lịch sử bút toán gốc không bị xóa.</div>';
}
function render(){
 $("#finance-month").value=state.month;
 document.querySelectorAll("[data-tab]").forEach(b=>{b.classList.toggle("selected",b.dataset.tab===state.tab);b.setAttribute("aria-current",b.dataset.tab===state.tab?"page":"false");});
 if(!state.ready){root.innerHTML='<div class="card">Đang tải dữ liệu tài chính…</div>';return;}
 if(state.error){root.innerHTML='<div class="card error">'+safe(errorText(state.error))+' <button class="btn soft" data-action="reload">Thử tải lại</button></div>';return;}
 root.innerHTML=({overview,plan:planning,commitments,reports:reporting,simulator:scenario,mentor:()=>mentorUI.render(),settings})[state.tab]();
 if(state.partial.length){root.insertAdjacentHTML("afterbegin",'<div class="notice warn" style="margin-bottom:14px">Một số dữ liệu tham chiếu chưa tải được: '+safe(state.partial.join(", "))+'. Dữ liệu đã lưu không bị xóa.</div>');}
}

function advisorHorizon(){
 const days=Math.ceil((Date.parse(lastDay(state.month)+"T00:00:00Z")-Date.parse(nowDate()+"T00:00:00Z"))/86400000)+1;
 return days<=30?30:days<=60?60:days<=90?90:365;
}
async function loadLinkedAnalysis(version){
 // Always recompute from the persisted cashflow and fund allocations. No fake
 // salary row, no inferred loan, and no silent reuse of a stale projection.
 state.baselineBusy=true;state.baselineError=null;render();
 try{
  const scenario={name:"Dự báo theo kế hoạch đã lưu",months:forecastMonths(),salaryDay:10,
    bufferTwd:state.buffer,monthlyExtraIncomeTwd:"0",rows:[]};
  const r=await api("/workbench/preview",{scenario},"POST");
  if(version!==state.analysisVersion)return;
  state.baseline=r.projection;
 }catch(e){
  if(version!==state.analysisVersion)return;
  state.baselineError=errorText(e);state.baseline=null;
 }finally{
  if(version===state.analysisVersion){state.baselineBusy=false;render();}
 }
}
async function refresh(){
 const version=++state.analysisVersion;
 state.baseline=null;state.preview=null;state.baselineError=null;state.baselineBusy=false;
 state.ready=false;state.error=null;render();
 const year=+state.month.slice(0,4);
 const specs=[["data","/bootstrap"],["overview","/overview?month="+state.month],["cashflow","/cashflow?month="+state.month],["year","/year?year="+year],["yearPlan","/cashflow/year?year="+year],["fx","/fx/estimates"],["payoff","/debt-payoff-plan?months=12&bufferTwd="+encodeURIComponent(state.buffer)],["progress","/debt-progress?year="+year],["advice","/advisor?days="+advisorHorizon()+"&bufferTwd="+encodeURIComponent(state.buffer)],["scenarioData","/workbench"]];
 const res=await Promise.allSettled(specs.map(x=>api(x[1])));
 state.partial=[];
 for(let i=0;i<res.length;i++){const [k]=specs[i];if(res[i].status==="fulfilled"){if(k==="scenarioData")state.scenarioList=res[i].value.scenarios||[];else state[k]=res[i].value;}else{
  if(res[i].reason.status===401){showLogin();return;}
  if(k==="data"||k==="cashflow"){state.error=res[i].reason;break;}
  state.partial.push(k);if(k==="advice")state.advice=null;
  if(k==="payoff")state.payoff=null;
  if(k==="progress")state.progress=null;
 }}
 state.ready=true;render();
 if(!state.error){void loadLinkedAnalysis(version);void mentorUI.load({force:true});}
}
function showLogin(){state.ready=false;state.data=null;state.error=null;$("#finance-layout").hidden=true;$("#finance-login").hidden=false;}
async function initialize(){
 try{await api("/access");$("#finance-layout").hidden=false;$("#finance-login").hidden=true;await refresh();}
 catch(error){if(error.status===401){showLogin();return;}$("#finance-layout").hidden=false;$("#finance-login").hidden=true;state.ready=true;state.error=error;render();}
}
function field(name,label,type="text",value="",extra=""){
 return '<label>'+safe(label)+'<input name="'+safe(name)+'" type="'+safe(type)+'" value="'+safe(value)+'" '+extra+(label.includes("có thể để trống")?"":" required")+'></label>';
}
function select(name,label,list,extra=""){return '<label>'+safe(label)+'<select name="'+safe(name)+'" '+extra+'>'+list+'</select></label>';}
function currOpts(selected="TWD"){return currencies().map(c=>escOption(c.code,c.code,c.code===selected)).join("");}
function getAccount(id){return (state.data?.accounts||[]).find(x=>x.id===id);}
function accountOpts(code,chosen){return options((state.data?.accounts||[]).filter(a=>!code||a.currency_code===code),"id",a=>a.name+" · "+a.currency_code,chosen);}
function findFund(kind,id){return (kind==="debt"?state.cashflow?.debtFunds:state.cashflow?.goalFunds)?.find(x=>x[(kind==="debt"?"debt_id":"goal_id")]===id);}
function open(kind,id=""){
 state.editing={kind,id};form.dataset.kind=kind;form.dataset.id=id;form.dataset.key=uuid();
 const account=getAccount(id),i=(state.cashflow?.items||[]).find(x=>x.id===id),d=(state.data?.debts||[]).find(x=>x.id===id),g=(state.data?.goals||[]).find(x=>x.id===id);
 let name="Nhập dữ liệu",body="";
 if(kind==="plan"||kind==="editPlan"){
  name=kind==="plan"?"Thêm thu / chi dự kiến":"Sửa khoản dự kiến";
  body=select("kind","Loại · Ưu tiên Nợ > Chi > Tiết kiệm",escOption("expense","Chi dự kiến",!["income","borrowing"].includes(i?.kind))+escOption("income","Thu dự kiến · thu nhập (không gồm tiền vay)",i?.kind==="income")+escOption("borrowing","Thu từ khoản vay",i?.kind==="borrowing")+
   (kind==="plan"?escOption("debt","Công nợ · Tạo khoản nợ và quỹ trả tháng này")+escOption("goal","Tiết kiệm · Tạo mục tiêu và quỹ tháng này"):''))+
   field("label","Nội dung","text",i?.label||"",'maxlength="140"')+
   select("currencyCode","Ngoại tệ",currOpts(i?.original_currency||"TWD"))+
   field("originalAmount","Số tiền","text",amt(i?.original_amount||i?.amount_twd||""),'inputmode="decimal"')+
   '<div class="preview" id="finance-fx-preview">Quy đổi TWD tự động theo tỷ giá hiện có.</div>'+
   '<fieldset id="finance-plan-debt-fields" class="fin-conditional" hidden disabled>'+
   field("principalOriginal","Tổng số nợ gốc","text","",'inputmode="decimal"')+
   field("annualInterestPercent","Lãi suất năm (%)","number","0",'min="0" max="100" step="0.01"')+
   field("debtDueDate","Ngày bắt buộc phải trả","date","")+
   '<div class="notice">Số tiền ở trên là quỹ dự kiến dành trong tháng. Nợ gốc và hạn trả được ghi vào Công nợ; không tạo thêm một khoản chi trùng.</div></fieldset>'+
   '<fieldset id="finance-plan-borrow-fields" class="fin-conditional" hidden disabled>'+
   select("creditorType","Nguồn vay",[
    ["friend_family","Người quen / gia đình"],["bank_loan","Ngân hàng"],["credit_card","Thẻ tín dụng"],["installment_provider","Đơn vị trả góp"],["other","Khác"]
   ].map(([k,v])=>escOption(k,v,k==="friend_family")).join(""))+
   field("borrowDueDate","Ngày dự kiến hoàn trả khoản vay","date","")+
   field("borrowInterestPercent","Lãi suất năm (%)","number","0",'min="0" max="100" step="0.01"')+
   '<div class="notice">Ngày nhận tiền dự kiến chọn tại “Ngày trong tháng”. Tiền vay được cộng vào tổng tiền vào dự báo nhưng không tính là thu nhập. Khoản vay đồng thời liên kết với Công nợ. Hãy lập quỹ trả nợ theo cam kết, không tự coi gốc là tiền chi đã trả.</div></fieldset>'+
   '<fieldset id="finance-plan-goal-fields" class="fin-conditional" hidden disabled>'+
   field("targetAmount","Tổng số tiền muốn tiết kiệm","text","",'inputmode="decimal"')+
   field("targetDate","Ngày muốn đạt mục tiêu (có thể để trống)","date","")+
   '<div class="notice">Số tiền ở trên là quỹ tiết kiệm của tháng; mục tiêu xuất hiện đồng thời tại Công nợ & mục tiêu.</div></fieldset>'+

   field("dueDay","Ngày trong tháng (1–31)","number",i?.due_day||10,'min="1" max="31"')+
   '<label>Ghi chú <small>(không bắt buộc)</small><textarea name="memo" maxlength="250">'+safe(i?.memo||"")+'</textarea></label>'+
   '<div class="notice">Khoản này là kế hoạch, không tự cộng/trừ ví tiền thật.</div>';
 }else if(kind==="transaction"){
  name="Ghi thu / chi thực tế";
  body=select("kind","Loại",escOption("expense","Chi tiêu")+escOption("income","Thu nhập"))+
   select("currencyCode","Ngoại tệ",currOpts())+
   field("amount","Số tiền","text","",'inputmode="decimal"')+
   '<div class="preview" id="finance-fx-preview">Chọn ngoại tệ để quy đổi gần đúng.</div>'+
   select("accountId","Ví sử dụng",accountOpts("TWD"))+
   select("categoryId","Danh mục",options((state.data?.categories||[]).filter(x=>x.kind==="expense"),"id",x=>x.name))+
   '<label>Ghi chú<textarea name="description" maxlength="250"></textarea></label>'+
   '<div class="notice">Ghi vào ví đúng ngoại tệ. Không tự đổi hoặc chuyển tiền giữa các ví.</div>';
 }else if(kind==="editTransaction"){
  const ev=(state.overview?.events||[]).find(x=>x.id===id);
  if(!ev||ev.reversed||ev.debt_payment||!["income","expense"].includes(ev.kind))return;
  const old=ev.entries?.[0]||{},code=old.currency||"TWD";
  name="Sửa giao dịch thực tế";
  body='<div class="notice">Không sửa bút toán đã ghi sổ: hệ thống sẽ đảo khoản cũ và tạo giao dịch thay thế cùng một lần. Lịch sử vẫn được lưu.</div>'+
   field("occurredAt","Ngày phát sinh","date",String(ev.occurred_at).slice(0,10))+
   field("amount","Số tiền ("+code+")","text",amt(Math.abs(val(old.amount))),'inputmode="decimal"')+
   select("categoryId","Danh mục",options((state.data?.categories||[]).filter(x=>x.kind===ev.kind),"id",x=>x.name,old.categoryId))+
   '<label>Ghi chú<textarea name="description" maxlength="250">'+safe(ev.description||"")+'</textarea></label>'+
   '<div class="notice">Giữ nguyên loại thu/chi, ví và ngoại tệ. Muốn đổi ví, hủy giao dịch cũ và tạo giao dịch mới.</div>';
 }else if(kind==="account"||kind==="editAccount"){
  name=kind==="account"?"Thêm ví / tài khoản":"Sửa ví · "+(account?.name||"");
  body=field("name","Tên ví / ngân hàng","text",kind==="editAccount"?account?.name||"":"",'maxlength="120"')+
   (kind==="account"?select("currencyCode","Ngoại tệ",currOpts()):'<div class="notice">Không thay đổi ngoại tệ '+safe(account?.currency_code||"")+' để bảo toàn lịch sử.</div>')+
   select("kind","Loại ví",["cash","bank","ewallet","other"].map(k=>escOption(k,{cash:"Tiền mặt",bank:"Ngân hàng",ewallet:"Ví điện tử",other:"Khác"}[k],account?.kind===k)).join(""));
 }else if(kind==="reconcile"&&account){
  name="Chỉnh số dư · "+account.name;
  body='<div class="notice">Số dư thực tế được chỉnh bằng bút toán đối soát có lý do. Lịch sử giao dịch sẽ được giữ nguyên.</div>'+
   field("expectedBalance","Số dư đang ghi ("+account.currency_code+")","text",amt(account.balance),'readonly')+
   field("targetBalance","Số dư đúng ("+account.currency_code+")","text",amt(account.balance),'inputmode="decimal"')+
   field("reason","Lý do đối soát (ít nhất 8 ký tự)","text","Đối chiếu số dư thực tế",'minlength="8" maxlength="250"');
 }else if(kind==="borrow"){
  name=d?"Xác nhận khoản vay kế hoạch · "+d.name:"Ghi nhận tiền vay đã nhận · tạo công nợ liên kết";
  body=field("name","Người cho vay / tên khoản vay","text",d?.name||"",'maxlength="160"')+
   select("creditorType","Bạn vay từ ai?",[
    ["friend_family","Bạn bè / gia đình"],["bank_loan","Ngân hàng"],["credit_card","Thẻ tín dụng"],["installment_provider","Đơn vị trả góp"],["other","Khác"]
   ].map(([k,v])=>escOption(k,v,k==="friend_family")).join(""))+
   select("currencyCode","Ngoại tệ nhận",currOpts(d?.currency_code||"TWD"))+
   field("principalOriginal","Số tiền vay THỰC NHẬN và gốc phải trả","text",d?.principal_original||"",'inputmode="decimal"')+
   '<div class="preview" id="finance-fx-preview">Quy đổi TWD theo tỷ giá tại thời điểm ghi nhận.</div>'+
   select("accountId","Ví thực nhận",accountOpts(d?.currency_code||"TWD"))+
   field("receivedDate","Ngày đã nhận tiền","date",nowDate())+
   field("dueDate","Ngày đến hạn (có thể để trống)","date",d?.due_date||"")+
   field("annualInterestPercent","Lãi suất năm (%)","number",d?number(val(d.annual_interest_rate)*100,2):"0",'min="0" max="100" step="0.01"')+
   '<div class="notice">Chỉ xác nhận khi tiền ĐÃ vào ví, không chọn nếu chỉ dự kiến vay. Tạo nợ + tăng ví đúng một lần; không được nhập lại khoản này ở Thu nhập. Nếu gốc khác tiền thực nhận do phí khấu trừ, cần tách nghiệp vụ, không ghi sai số dư.</div>';
 }else if(kind==="debt"){
  name="Thêm khoản nợ";
  body=field("name","Tên khoản nợ","text","",'maxlength="160"')+
   select("currencyCode","Ngoại tệ",currOpts())+
   field("principalOriginal","Số tiền gốc","text","",'inputmode="decimal"')+
   field("dueDate","Ngày đến hạn (có thể để trống)","date","")+
   field("annualInterestPercent","Lãi suất năm (%)","number","0",'min="0" max="100" step="0.01"');
 }else if(kind==="editDebt"&&d){
  name="Sửa thông tin công nợ · "+d.name;
  body=field("name","Tên khoản nợ","text",d.name,'maxlength="160"')+
   '<div class="notice">Nợ gốc và tiền đã thanh toán không thay đổi. Sửa hạn trả hoặc lãi suất sẽ cập nhật kế hoạch và tư vấn.</div>'+
   field("annualInterestPercent","Lãi suất năm (%)","number",number(val(d.annual_interest_rate)*100,2),'min="0" max="100" step="0.01"')+
   field("dueDate","Ngày đến hạn (có thể để trống)","date",d.due_date||"");
 }else if(kind==="goal"){
  name="Thêm mục tiêu";
  body=field("name","Tên mục tiêu","text","",'maxlength="160"')+
   select("currencyCode","Ngoại tệ",currOpts())+
   field("targetAmount","Số tiền muốn đạt","text","",'inputmode="decimal"')+
   field("targetDate","Hạn mục tiêu (có thể để trống)","date","");
 }else if((kind==="fundDebt"&&d)||(kind==="fundGoal"&&g)){
  const obj=d||g,existing=findFund(d?"debt":"goal",id);
  name=(d?"Quỹ trả nợ · ":"Quỹ mục tiêu · ")+obj.name;
  body='<div class="notice">Bạn nhập số '+obj.currency_code+'. Giá trị quy đổi TWD được tính tự động; không trừ ví thật.</div>'+
   field("plannedAmount","Dự kiến dành ("+obj.currency_code+")","text",amt(existing?.planned_amount||"0"),'inputmode="decimal"')+
   field("earmarkedAmount","Đã dành để theo dõi ("+obj.currency_code+")","text",amt(existing?.earmarked_amount||"0"),'inputmode="decimal"')+
   (d?field("plannedPaymentDate","Ngày dự kiến trả tự chọn (có thể để trống)","date",existing?.planned_payment_date||"")+
    '<div class="notice">Đây là ngày DỰ KIẾN bạn muốn trả, không phải hạn bắt buộc. Nếu để trống, báo cáo hiển thị kế hoạch trong tháng; không tự suy diễn nợ bạn bè đã quá hạn.</div>':"")+
   '<div id="finance-fx-preview" class="preview"></div>';
 }else if(kind==="payDebt"&&d){
  name="Xác nhận đã trả nợ · "+d.name;
  body=select("accountId","Ví đã thanh toán ("+d.currency_code+")",accountOpts(d.currency_code))+
   field("paymentDate","Ngày thanh toán","date",nowDate())+
   field("principalPaid","Gốc đã trả","text","",'inputmode="decimal"')+
   field("interestPaid","Lãi đã trả","text","0",'inputmode="decimal"')+
   field("feePaid","Phí đã trả","text","0",'inputmode="decimal"')+
   '<div class="notice">Chỉ ghi nếu khoản tiền đã thực trả và chưa được ghi qua giao dịch khác. Gốc giảm dư nợ, gốc + lãi + phí trừ ví một lần. Nếu tiền đã trừ ví hoặc đã đối soát trước đó, không ghi trùng: cần kiểm tra lịch sử và số dư trước.</div>';
 }else if(kind==="editGoal"&&g){
  name="Sửa mục tiêu · "+g.name;
  body=field("name","Tên mục tiêu","text",g.name,'maxlength="160"')+
   field("targetAmount","Số tiền mục tiêu ("+g.currency_code+")","text",amt(g.target_amount),'inputmode="decimal"')+
   field("currentAmount","Đã tích lũy ("+g.currency_code+")","text",amt(g.current_amount),'inputmode="decimal"')+
   field("targetDate","Ngày đạt mục tiêu (có thể để trống)","date",g.target_date||"")+
   select("status","Trạng thái",["active","achieved","archived"].map(k=>escOption(k,{active:"Đang thực hiện",achieved:"Đã hoàn thành",archived:"Lưu trữ"}[k],g.status===k)).join(""));
 }else if(kind==="category"||kind==="editCategory"){
  const cat=(state.data?.categories||[]).find(x=>x.id===id);
  name=kind==="category"?"Thêm danh mục":"Sửa danh mục · "+(cat?.name||"");
  body=field("name","Tên danh mục","text",cat?.name||"",'maxlength="100"')+
   (kind==="category"?select("kind","Phân loại",escOption("expense","Chi tiêu")+escOption("income","Thu nhập")):
   '<div class="notice">Loại danh mục không thay đổi để giữ đúng các giao dịch.</div>');
 }else if(kind==="budget"){
  const cat=(state.data?.categories||[]).find(c=>c.id===id);
  name="Đặt ngân sách"+(cat?" · "+cat.name:"");
  body=field("amountTwd","Giới hạn chi tiêu trong tháng (TWD)","text",amt((state.data?.budgets||[]).find(b=>b.category_id===id&&b.month_date?.startsWith(state.month))?.amount_twd||"0"),'inputmode="decimal"');
 }else{return;}
 $("#finance-dialog-title").textContent=name;
 fields.innerHTML=body;dlg.showModal();updateEstimate();
}
function updateEstimate(){
 const kind=form.dataset.kind,values=Object.fromEntries(new FormData(form));
 if(kind==="plan"){
  const fs=$("#finance-plan-debt-fields"),enabled=values.kind==="debt";
  if(fs){fs.hidden=!enabled;fs.disabled=!enabled;}
  const borrowFields=$("#finance-plan-borrow-fields"),borrowing=values.kind==="borrowing";
  if(borrowFields){borrowFields.hidden=!borrowing;borrowFields.disabled=!borrowing;}
  const goalFields=$("#finance-plan-goal-fields"),savings=values.kind==="goal";
  if(goalFields){goalFields.hidden=!savings;goalFields.disabled=!savings;}
  const amountLabel=fields.querySelector('[name="originalAmount"]')?.closest("label");
  if(amountLabel){amountLabel.firstChild.textContent=enabled?"Dự kiến dành trả nợ trong tháng":savings?"Dự kiến dành tiết kiệm trong tháng":borrowing?"Tiền dự kiến nhận từ khoản vay":"Số tiền";}
 }
 const note=$("#finance-fx-preview");if(!note)return;
 let code=values.currencyCode||"TWD",amount=values.originalAmount||values.amount||values.principalOriginal||"0";
 if(["fundDebt","fundGoal"].includes(kind)){
  const obj=(kind==="fundDebt"?state.data?.debts:state.data?.goals)?.find(x=>x.id===form.dataset.id);
  code=obj?.currency_code||"TWD";amount=values.plannedAmount||"0";
 }
 if(kind==="transaction"||kind==="borrow"){
  const ac=fields.querySelector('[name="accountId"]'),matches=(state.data?.accounts||[]).filter(x=>x.currency_code===code);
  if(ac){
   const prev=ac.value;ac.innerHTML=accountOpts(code,prev);
   if(!matches.some(x=>x.id===prev))ac.value=matches[0]?.id||"";
   ac.disabled=!matches.length;
  }
  const cat=fields.querySelector('[name="categoryId"]'),categoryType=values.kind||"expense";
  if(cat){const original=cat.value;cat.innerHTML=options((state.data?.categories||[]).filter(x=>x.kind===categoryType),"id",x=>x.name,original);}
 }
 const value=estimate(amount,code),q=quote(code);
 note.textContent=value===null?"Chưa có tỷ giá mới cho "+code+"; không sử dụng số TWD giả.":"≈ "+money(Math.round(value))+" · "+(code==="TWD"?"Không cần quy đổi":"1 "+code+" = "+number(q.rateToTwd,10)+" TWD"+(q.observedAt?" · "+q.observedAt.slice(0,10):""));
}
function amountInput(value,code){
 const s=amt(value).trim();const minor=+(currencies().find(x=>x.code===code)?.minor_units||0);
 if(!/^(?:0|[1-9]\d{0,15})(?:\.\d{1,6})?$/.test(s)||s.split(".")[1]?.length>minor||!(+s>=0))throw new Error("Số tiền không hợp lệ với ngoại tệ "+code+".");
 return s;
}
async function submit(event){
 event.preventDefault();
 if(state.busy)return;
 const type=form.dataset.kind,id=form.dataset.id,b=Object.fromEntries(new FormData(form));
 let path="",body={},method="POST";
 try{
  if(type==="plan"&&b.kind==="debt"){
   if(!b.debtDueDate)throw new Error("Cần chọn ngày bắt buộc trả nợ.");
   body={month:state.month,name:b.label,currencyCode:b.currencyCode,
    principalOriginal:amountInput(b.principalOriginal,b.currencyCode),
    plannedAmount:amountInput(b.originalAmount,b.currencyCode),
    annualInterestPercent:b.annualInterestPercent||"0",dueDate:b.debtDueDate};
   path="/debt-plans";method="POST";
  }else if(type==="plan"&&b.kind==="borrowing"){
   if(!b.borrowDueDate)throw new Error("Khoản vay dự kiến phải có ngày hoàn trả.");
   const loan=amountInput(b.originalAmount,b.currencyCode);
   if(Number(loan)<=0)throw new Error("Số tiền vay phải lớn hơn 0.");
   body={month:state.month,name:b.label,currencyCode:b.currencyCode,originalAmount:loan,
    creditorType:b.creditorType,annualInterestPercent:b.borrowInterestPercent||"0",
    dueDate:b.borrowDueDate,dueDay:+b.dueDay||null,memo:b.memo||""};
   path="/loan-plans";
  }else if(type==="plan"&&b.kind==="goal"){
   body={month:state.month,name:b.label,currencyCode:b.currencyCode,
    targetAmount:amountInput(b.targetAmount,b.currencyCode),
    plannedAmount:amountInput(b.originalAmount,b.currencyCode),targetDate:b.targetDate||null};
   path="/goal-plans";method="POST";
  }else if(type==="plan"||type==="editPlan"){
   body={month:state.month,kind:b.kind,label:b.label,currencyCode:b.currencyCode,originalAmount:amountInput(b.originalAmount,b.currencyCode),dueDay:+b.dueDay||null,memo:b.memo||"",...(b.kind==="borrowing"?{debtId:state.cashflow?.items?.find(x=>x.id===id)?.debt_id}:{} )};
   path=type==="plan"?"/cashflow/items":"/cashflow/items/"+id;method=type==="plan"?"POST":"PUT";
  }else if(type==="editTransaction"){
   const ev=(state.overview?.events||[]).find(x=>x.id===id);
   const old=ev?.entries?.[0];
   if(!ev||!old)throw new Error("Không tìm thấy giao dịch. Hãy tải lại.");
   body={action:"correct",idempotencyKey:form.dataset.key,correction:{
    amount:amountInput(b.amount,old.currency||"TWD"),categoryId:b.categoryId,
    occurredAt:new Date(b.occurredAt+"T12:00:00+08:00").toISOString(),
    description:b.description||""}};
   path="/transactions/"+id+"/adjust";
  }else if(type==="transaction"){
   if(!quote(b.currencyCode))throw new Error("Chưa có tỷ giá tham chiếu hợp lệ. Hãy cập nhật trước khi ghi sổ.");
   if(!b.accountId||!b.categoryId)throw new Error("Cần tạo ví và danh mục cùng ngoại tệ trước khi ghi giao dịch thực.");
   body={kind:b.kind,currencyCode:b.currencyCode,accountId:b.accountId,categoryId:b.categoryId,
    amount:amountInput(b.amount,b.currencyCode),description:b.description||"",occurredAt:new Date().toISOString(),
    fxRateMode:"estimate",idempotencyKey:form.dataset.key};path="/transactions";
  }else if(type==="account"||type==="editAccount"){
   body={name:b.name,kind:b.kind,...(type==="account"?{currencyCode:b.currencyCode}:{})};
   path=type==="account"?"/accounts":"/accounts/"+id;method=type==="account"?"POST":"PUT";
  }else if(type==="reconcile"){
   const account=getAccount(id);body={targetBalance:amountInput(b.targetBalance,account.currency_code),
    expectedBalance:amt(b.expectedBalance),reason:b.reason,idempotencyKey:form.dataset.key};path="/accounts/"+id+"/reconcile";
  }else if(type==="borrow"){
   if(!b.accountId)throw new Error("Cần tạo ví cùng ngoại tệ để nhận tiền vay.");
   const q=quote(b.currencyCode);if(!q)throw new Error("Chưa có tỷ giá tham chiếu để ghi khoản vay này.");
   const original=amountInput(b.principalOriginal,b.currencyCode);
   if(Number(original)<=0)throw new Error("Tiền vay phải lớn hơn 0.");
   if(!confirm("Xác nhận bạn ĐÃ nhận "+money(original,b.currencyCode)+" vào ví? App sẽ tăng số dư, tạo công nợ và lưu lịch sử không thể xóa."))return;
   body={name:b.name,currencyCode:b.currencyCode,accountId:b.accountId,creditorType:b.creditorType,
    principalOriginal:original,annualInterestPercent:b.annualInterestPercent||"0",
    receivedDate:b.receivedDate,dueDate:b.dueDate||null,fxRateToTwd:q.rateToTwd||"1",
    idempotencyKey:form.dataset.key,...(id?{debtId:id}:{})};
   path="/loan-receipts";
  }else if(type==="debt"){
   body={name:b.name,currencyCode:b.currencyCode,principalOriginal:amountInput(b.principalOriginal,b.currencyCode),
    annualInterestPercent:b.annualInterestPercent||"0",dueDate:b.dueDate||null};path="/debts";
  }else if(type==="editDebt"){
   body={name:b.name,annualInterestPercent:b.annualInterestPercent||"0",dueDate:b.dueDate||null};
   path="/debts/"+id;method="PUT";
  }else if(type==="goal"){
   body={name:b.name,currencyCode:b.currencyCode,targetAmount:amountInput(b.targetAmount,b.currencyCode),targetDate:b.targetDate||null};path="/goals";
  }else if(type==="fundDebt"||type==="fundGoal"){
   const obj=(type==="fundDebt"?state.data.debts:state.data.goals).find(x=>x.id===id);
   const base={month:state.month,plannedAmount:amountInput(b.plannedAmount,obj.currency_code),
    earmarkedAmount:amountInput(b.earmarkedAmount,obj.currency_code)};
   if(!quote(obj.currency_code))throw new Error("Thiếu tỷ giá tham chiếu mới cho "+obj.currency_code+". Không thể quy đổi quỹ.");
   body={...base,...(type==="fundDebt"?{debtId:id,plannedPaymentDate:b.plannedPaymentDate||null}:{goalId:id})};
   path=type==="fundDebt"?"/debt-funds":"/goal-funds";method="PUT";
  }else if(type==="payDebt"){
   const d=state.data.debts.find(x=>x.id===id);
   if(!b.accountId)throw new Error("Bạn cần có ví "+d.currency_code+" để ghi trả nợ thực tế.");
   const q=quote(d.currency_code);if(!q)throw new Error("Chưa có tỷ giá để định giá khoản đã trả.");
   body={debtId:id,accountId:b.accountId,paymentDate:b.paymentDate,
    principalPaid:amountInput(b.principalPaid,d.currency_code),
    interestPaid:amountInput(b.interestPaid,d.currency_code),
    feePaid:amountInput(b.feePaid,d.currency_code),fxRateToTwd:q.rateToTwd||"1",
    memo:"Thanh toán đã thực hiện",idempotencyKey:form.dataset.key};path="/debt-payments";
  }else if(type==="editGoal"){
   const g=state.data.goals.find(x=>x.id===id);
   body={name:b.name,targetAmount:amountInput(b.targetAmount,g.currency_code),
     currentAmount:amountInput(b.currentAmount,g.currency_code),targetDate:b.targetDate||null,status:b.status};
   path="/goals/"+id;method="PUT";
  }else if(type==="category"||type==="editCategory"){
   body={name:b.name,...(type==="category"?{kind:b.kind}:{})};
   path=type==="category"?"/categories":"/categories/"+id;method=type==="category"?"POST":"PUT";
  }else if(type==="budget"){
   body={categoryId:id,month:state.month,amountTwd:amountInput(b.amountTwd,"TWD")};path="/budgets";method="PUT";
  }else{return;}
  state.busy=true;$("#finance-submit").disabled=true;
  await api(path,body,method);dlg.close();if(type==="borrow"||type==="plan"&&b.kind==="borrowing")mentorUI.reset();notify("Đã lưu vào Finance Database.");await refresh();
 }catch(error){notify(errorText(error));if(error.message==="BALANCE_CHANGED_RELOAD"){dlg.close();await refresh();}}
 finally{state.busy=false;$("#finance-submit").disabled=false;}
}
async function deletePlan(id){
 if(!confirm("Xóa khoản dự kiến này? Giao dịch thật và số dư ví sẽ không bị xóa."))return;
 try{await api("/cashflow/items/"+id,{},"DELETE");notify("Đã xóa kế hoạch.");await refresh();}catch(e){notify(errorText(e));}
}
function saveFile(name,text){
 const blob=new Blob([text],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob);
 const a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function exportCsv(){
 const header=["Ngày","Loại","Nội dung","Giá trị gốc","Ngoại tệ","TWD ước tính"];
 const lines=planRows().map(r=>[r.date,r.kind,r.name,r.native,r.code,r.twd??"chưa có tỷ giá"]);
 const csv=[header,...lines].map(row=>row.map(cell=>'"'+String(cell??"").replace(/"/g,'""')+'"').join(",")).join("\r\n");
 saveFile("finance-plan-"+state.month+".csv","\uFEFF"+csv);
}
async function simulate(save=false){
 const el=$("#scenario-fields");if(el){const b=Object.fromEntries(new FormData(el));state.sim={
  name:b.name,months:+b.months,salaryDay:+b.salaryDay,bufferTwd:b.bufferTwd||"0",
  monthlyExtraIncomeTwd:b.monthlyExtraIncomeTwd||"0",
  rows:+b.rowAmount>0?(b.kind==="borrow"?(()=>{
   const loanId=uuid();return [
    {key:uuid(),date:b.rowDate,kind:"borrow",label:b.rowLabel||"Vay giả định",amountTwd:b.rowAmount,linkId:loanId},
    {key:uuid(),date:b.repayDate,kind:"repay",label:"Trả "+(b.rowLabel||"khoản vay"),amountTwd:b.repayAmount,linkId:loanId}
   ];})():[{key:uuid(),date:b.rowDate,kind:b.kind,label:b.rowLabel||"Giả định",amountTwd:b.rowAmount}]):[]
 };}
 try{
  if(save){await api(state.scenarioId?"/workbench/scenarios/"+state.scenarioId:"/workbench/scenarios",
    {scenario:state.sim},state.scenarioId?"PUT":"POST");notify("Đã lưu kịch bản.");await refresh();nav("simulator");return;}
  const r=await api("/workbench/preview",{scenario:state.sim},"POST");state.preview=r.projection;render();
 }catch(e){notify(errorText(e));}
}
async function act(action,id){
 if(action==="reload"){await refresh();return;}
 if(action==="reloadFx"){try{state.fx=await api("/fx/estimates");notify("Đã cập nhật tỷ giá tham chiếu.");render();}catch(e){notify(errorText(e));}return;}
 if(action==="goPlan"){nav("plan");return;}
 if(action==="goCommit"){nav("commitments");return;}
 if(action==="goSim"){nav("simulator");return;}
 if(action==="export"){exportCsv();return;}
 if(action==="simulate"){await simulate(false);return;}
 if(action==="saveScenario"){await simulate(true);return;}
 if(action==="newScenario"){state.scenarioId=null;state.sim={name:"Kế hoạch mới",months:3,salaryDay:10,bufferTwd:"0",monthlyExtraIncomeTwd:"0",rows:[]};state.preview=null;render();return;}
 if(action==="openScenario"){
  const v=state.scenarioList.find(x=>x.id===id);if(v){state.scenarioId=id;state.sim=structuredClone(v.settings);state.preview=null;render();}return;
 }
 if(action==="newPlan")return open("plan");
 if(action==="editPlan")return open("editPlan",id);
 if(action==="suggestDebtFund"){
  const node=document.querySelector('[data-action="suggestDebtFund"][data-id="'+id+'"]');
  const x=state.payoff?.suggestions?.find(v=>v.debtId===id&&v.month===node?.dataset.month);
  if(!x)return notify("Đề xuất đã thay đổi. Hãy tải lại.");
  if(state.month!==x.month){state.month=x.month;await refresh();}
  open("fundDebt",id);
  const input=fields.querySelector('[name="plannedAmount"]');
  if(input){input.value=x.suggestedTotalNative;updateEstimate();}
  return;
 }
 if(action==="deletePlan")return deletePlan(id);
 const restore={restoreDebt:["/debts/","khoản nợ"],restoreAccount:["/accounts/","ví"],restoreCategory:["/categories/","danh mục"]};
 if(restore[action]){
  const [url,label]=restore[action];
  if(!confirm("Khôi phục "+label+" này để tiếp tục quản lý? Kế hoạch dự kiến đã xóa trước đó không tự phục hồi."))return;
  try{await api(url+id+"/restore",{},"POST");notify("Đã khôi phục "+label+".");await refresh();}
  catch(error){notify(errorText(error));}
  return;
 }
 if(action==="reverseTransaction"){
  const ev=(state.overview?.events||[]).find(x=>x.id===id);
  if(!ev||!confirm("Hủy giao dịch “"+(ev.description||"giao dịch")+"”? Hệ thống ghi bút toán đảo, giữ nguyên lịch sử gốc."))return;
  try{await api("/transactions/"+id+"/adjust",{action:"reverse",idempotencyKey:uuid()},"POST");
   notify("Đã hủy bằng bút toán đảo và tính lại số dư.");await refresh();
  }catch(e){notify(errorText(e));}return;
 }
 const removal={deleteDebt:["/debts/","khoản nợ","Nếu có thu/trả thực tế, khoản nợ sẽ được ẩn khỏi quản lý và ngừng tham gia tư vấn; lịch sử tiền thật vẫn được giữ. Các quỹ dự kiến liên quan bị xóa."],
   deleteGoal:["/goals/","mục tiêu","Quỹ phân bổ liên quan sẽ bị xóa kèm."],
   deleteAccount:["/accounts/","ví","Nếu đã có giao dịch, ví sẽ chuyển vào danh sách đã lưu trữ. Số dư còn lại không còn tính là tiền khả dụng; lịch sử vẫn được giữ và bạn có thể khôi phục."],
   deleteCategory:["/categories/","danh mục","Nếu đã sử dụng, danh mục sẽ được ẩn khỏi phần nhập mới; các giao dịch đã ghi vẫn giữ nguyên. Bạn có thể khôi phục khi cần."],
   deleteScenario:["/workbench/scenarios/","kịch bản",""]};
 if(removal[action]){
   const [route,what,note]=removal[action];
   if(!confirm("Bạn xác nhận xóa "+what+" này khỏi quản lý?\n\n"+note+"\n\nNhấn OK để tiếp tục hoặc Cancel để giữ nguyên."))return;
   try{const removed=await api(route+id,{},"DELETE");
    if(action==="deleteScenario"&&state.scenarioId===id)state.scenarioId=null;
    notify(removed.archived?"Đã ẩn "+what+" khỏi quản lý. Có thể khôi phục trong mục Đã xóa/lưu trữ.":"Đã xóa "+what+".");await refresh();
   }catch(e){notify(errorText(e));}return;
 }
 if(["transaction","editTransaction","account","editAccount","reconcile","borrow","debt","editDebt","goal","fundDebt","fundGoal","payDebt","editGoal","category","editCategory","budget"].includes(action))return open(action,id);
}
document.body.addEventListener("click",async event=>{
 const tab=event.target.closest("[data-tab]");if(tab){nav(tab.dataset.tab);return;}
 const action=event.target.closest("[data-action]");if(action)await act(action.dataset.action,action.dataset.id||"");
});
$("#finance-month").addEventListener("change",async event=>{if(/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)){if(sheet.hasChanges()&&!confirm("Bạn chưa lưu các ô vừa sửa. Đổi tháng sẽ bỏ bản nháp, tiếp tục?")){event.target.value=state.month;return;}sheet.reset();state.month=event.target.value;await refresh();}});
$("#finance-reload").addEventListener("click",refresh);
$("#finance-settings").addEventListener("click",()=>nav("settings"));
$("#finance-dialog-close").addEventListener("click",()=>dlg.close());
$("#finance-dialog-cancel").addEventListener("click",()=>dlg.close());
dlg.addEventListener("click",event=>{if(event.target===dlg)dlg.close();});
fields.addEventListener("input",updateEstimate);
fields.addEventListener("change",updateEstimate);
document.body.addEventListener("change",event=>{
 if(event.target.matches('#scenario-fields [name="kind"]')){
  const section=$("#scenario-loan-fields"),loan=event.target.value==="borrow";
  if(section){section.hidden=!loan;section.disabled=!loan;}
 }
});
form.addEventListener("submit",submit);
$("#finance-login-form").addEventListener("submit",async event=>{
 event.preventDefault();const b=Object.fromEntries(new FormData(event.target));
 const error=$("#finance-login-error");error.hidden=true;
 try{
  const res=await fetch("/api/auth/login",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});
  if(!res.ok)throw new Error("Tài khoản hoặc mật khẩu không hợp lệ.");
  $("#finance-layout").hidden=false;$("#finance-login").hidden=true;event.target.reset();await refresh();
 }catch(e){error.textContent=errorText(e);error.hidden=false;}
});
$("#finance-logout").addEventListener("click",async()=>{await fetch("/api/auth/logout",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:"{}"}).catch(()=>{});mentorUI.reset();showLogin();});
await initialize();
