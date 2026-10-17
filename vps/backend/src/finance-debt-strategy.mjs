// Finance OS solo-owner advice, read-only: debt due > known costs > optional saving.
// Existing monthly debt-fund bookings already appear in the scenario timeline.
// We NEVER post another expense, duplicate a fund or assume new income exists.
import {units,plain} from "./finance-scenario-engine.mjs";
const ZERO=0n, MICRO=1000000n, RATE=1000000000000n;
const scaledRate=r=>{
 const x=String(r??"");
 if(!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,12})?$/.test(x)||Number(x)<=0)return null;
 const [a,b=""]=x.split(".");return BigInt(a)*RATE+BigInt((b+"0".repeat(12)).slice(0,12));
};
const nativeToTwd=(amount,rate)=>(amount*rate+RATE/2n)/RATE;
const max=(a,b)=>a>b?a:b;
const min=(a,b)=>a<b?a:b;
const isoMonth=d=>String(d||"").slice(0,7);
function expectedInterest(nativeOutstanding,annualRate){
 // Informational monthly simple-interest approximation; no bank-specific
 // daily balance, compounding, fees or payment-order assumption is invented.
 return String(Math.round(Number(plain(nativeOutstanding))*Number(annualRate||"0")/12));
}
export function calculateDebtStrategy({projection,debts=[],funds=[],payments=[],quotes={}}){
 if(!projection?.months||!Array.isArray(projection.months))throw new Error("INVALID_DEBT_STRATEGY");
 const buffer=units(projection.bufferTwd||"0");
 const notices=[], debtsById=new Map();
 for(const d of debts){
  const rate=d.currency_code==="TWD"?RATE:scaledRate(quotes[d.currency_code]?.rateToTwd);
  const original=units(d.outstanding_amount??"0");
  if(!rate){notices.push("Nợ "+d.name+" ("+d.currency_code+") chưa có tỷ giá hợp lệ: không thể đề xuất mức trả bằng TWD.");continue;}
  debtsById.set(d.id,{id:d.id,name:d.name,currency:d.currency_code,dueDate:d.due_date||null,
   annualInterestRate:d.annual_interest_rate||"0",rate,remainingNative:original});
 }
 const postedByFund=new Map();
 for(const p of payments){
  const key=p.debt_id+"|"+isoMonth(p.payment_date);
  postedByFund.set(key,(postedByFund.get(key)||ZERO)+units(p.base_amount_twd||"0"));
 }
 // Same units as currently planned timeline: funds already paid inside the
 // month have been removed from the forecast by sourceEvents().
 const fundsByMonth=new Map();
 for(const f of funds){
  const debt=debtsById.get(f.debt_id);if(!debt)continue;
  const k=isoMonth(f.month_date),key=f.debt_id+"|"+k;
  const scheduled=max(ZERO,units(f.planned_twd||"0")-(postedByFund.get(key)||ZERO));
  if(!fundsByMonth.has(k))fundsByMonth.set(k,[]);
  fundsByMonth.get(k).push({debt,scheduled});
 }
 let suggestedExtra=ZERO;
 const months=[];
 const priorityOrder=[...debtsById.values()].sort((a,b)=>
  (a.dueDate||"9999-12-31").localeCompare(b.dueDate||"9999-12-31")||
  Number(b.annualInterestRate)-Number(a.annualInterestRate)||a.name.localeCompare(b.name));
 for(let i=0;i<projection.months.length;i++){
  const m=projection.months[i],start=isoMonth(m.month);
  const booked=(fundsByMonth.get(start)||[]);
  let reserved=ZERO;
  for(const {debt,scheduled} of booked){
   const applied=min(debt.remainingNative,nativeToTwd(debt.remainingNative,debt.rate)>ZERO?
      // Reverse conversion of the booked TWD amount; guard overpayment.
      scheduled*RATE/debt.rate:ZERO);
   debt.remainingNative=max(ZERO,debt.remainingNative-applied);
   reserved+=scheduled;
  }
  const later=projection.months.slice(i);
  // Protect the lowest *future* day balance, not merely a post-payday month-end.
  let trough=units(m.minimumTwd||m.endingTwd||"0");
  for(const x of later){const n=units(x.minimumTwd||x.endingTwd||"0");if(n<trough)trough=n;}
  let budget=max(ZERO,trough-buffer-suggestedExtra);
  const added=[];
  for(const d of priorityOrder){
   if(!budget||!d.remainingNative)continue;
   const owedTwd=nativeToTwd(d.remainingNative,d.rate);
   const extra=min(owedTwd,budget);
   if(extra<=ZERO)continue;
   const native=min(d.remainingNative,(extra*RATE+d.rate-1n)/d.rate);
   d.remainingNative=max(ZERO,d.remainingNative-native);
   suggestedExtra+=extra;budget-=extra;
   added.push({debtId:d.id,name:d.name,extraTwd:plain(extra),
    extraNative:plain(native),currency:d.currency,priority:"debt_first"});
  }
  const remaining=priorityOrder.map(d=>({
   debtId:d.id,name:d.name,currency:d.currency,dueDate:d.dueDate,
   annualInterestPercent:String(Number(d.annualInterestRate)*100),
   remainingNative:plain(d.remainingNative),remainingTwd:plain(nativeToTwd(d.remainingNative,d.rate)),
   monthlyInterestNativeEstimate:expectedInterest(d.remainingNative,d.annualInterestRate),
   pastDue:d.dueDate&&d.dueDate.slice(0,7)<=start&&d.remainingNative>ZERO
  }));
  const urgent=remaining.filter(d=>d.pastDue);
  if(urgent.length)notices.push("Sau "+start+" còn "+urgent.map(d=>d.name+" ("+d.remainingNative+" "+d.currency+")").join(", ")+
   " chưa có nguồn trả đủ theo hạn. Cần xác minh lịch trả góp, điều chỉnh kỳ trả hoặc tăng nguồn thu.");
  months.push({
   month:start,incomeTwd:m.incomeTwd,costTwd:m.costTwd,goalTwd:m.goalTwd,
   baselineEndingTwd:m.endingTwd,scheduledDebtTwd:plain(reserved),
   proposedExtraDebtTwd:plain(added.reduce((n,a)=>n+units(a.extraTwd),ZERO)),
   proposedExtraAllocations:added,remainingDebts:remaining,
   afterProposalEndingTwd:plain(units(m.endingTwd)-suggestedExtra),
   reserveProtectedTwd:plain(buffer),hasRisk:!!urgent.length
  });
 }
 if(priorityOrder.some(d=>d.remainingNative>ZERO))notices.push("Các tháng không khai báo thu nhập mới sẽ không tự phát sinh lương. Hãy thêm lịch thu thực tế hoặc thử tăng thu nhập trong Mô phỏng.");
 return {priority:["debt","expense","savings"],policy:"Nợ đến hạn → khoản chi đã có lịch → tiết kiệm. Trả nợ thêm chỉ dùng phần thanh khoản dư an toàn.",
  currency:"TWD",months,notices:[...new Set(notices)],
  assumptions:["Quỹ đã lập là khoản dự kiến; chưa phải trả nợ thật.",
   "Lãi tháng chỉ tham khảo theo dư nợ × lãi năm / 12, chưa cộng vào dư nợ hoặc khoản phải trả.",
   "Các khoản thu không được tự nhân bản qua tháng sau.",
   "Đề xuất phân bổ thêm chỉ mang tính mô phỏng, không chuyển tiền."]};
}
