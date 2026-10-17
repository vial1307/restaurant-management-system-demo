// Deterministic, read-only allocation advice. Never posts a debt repayment.
// Budget order: debts due -> essential expenses -> savings (but all known
// essential expenses are protected before any optional extra debt payment).
const asMoney=(value)=>{
 const n=Number(value||0);
 if(!Number.isFinite(n)||n<0||n>1e14)throw new Error("INVALID_PAYOFF_AMOUNT");
 return n;
};
const rounded=n=>Math.round(n);
const mm=date=>String(date||"").slice(0,7);
const fmt=n=>String(rounded(n));
const rank=(a,b)=>{
 const aDue=a.due_date||"9999-12-31",bDue=b.due_date||"9999-12-31";
 if(aDue!==bDue)return aDue.localeCompare(bDue);
 if(a.apr!==b.apr)return b.apr-a.apr;
 return a.name.localeCompare(b.name);
};
export function planDebtPayoff({asOf,baseline,debts=[],funds=[],quotes={},bufferTwd="0"}){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(asOf))||!baseline||!Array.isArray(baseline.months))
  throw new Error("INVALID_DEBT_PAYOFF_INPUT");
 const buffer=asMoney(bufferTwd),warnings=[];
 const outstanding=debts.filter(d=>asMoney(d.outstanding_amount)>0).map(d=>{
   const rate=d.currency_code==="TWD"?1:
    quotes[d.currency_code]?.status==="fresh"?Number(quotes[d.currency_code]?.rateToTwd):null;
   if(rate===null||!Number.isFinite(rate)||rate<=0)
    warnings.push("Thiếu tỷ giá "+d.currency_code+" cho nợ “"+d.name+"”; không thể tự tính nguồn trả.");
   return {...d,apr:asMoney(d.annual_interest_rate||0),rate,
     remainingNative:asMoney(d.outstanding_amount)};
 }).sort(rank);
 const byId=new Map(outstanding.map(d=>[d.id,d]));
 const byMonth=new Map();
 for(const fund of funds){
  const month=mm(fund.month_date),key=month+"|"+fund.debt_id;
  byMonth.set(key,(byMonth.get(key)||0)+asMoney(fund.planned_amount));
 }
 const months=[],suggestions=[],allMonths=baseline.months.filter(x=>mm(x.month)>=mm(asOf));
 let openingTwd=asMoney(baseline.startingBalanceTwd||0);
 let allocatedEarlier=0;
 for(let i=0;i<allMonths.length;i++){
  const m=allMonths[i],month=mm(m.month),alreadyPlanned=[],suggested=[];
  // Existing fund payments are ALREADY included as debits in baseline timeline.
  // They never become a second expense or a second debit in this plan.
  for(const debt of outstanding){
   if(debt.rate===null||debt.remainingNative<=0)continue;
   const interest=debt.remainingNative*debt.apr/12,scheduled=byMonth.get(month+"|"+debt.id)||0;
   const principalPay=Math.max(0,Math.min(debt.remainingNative,scheduled-interest));
   debt.remainingNative=Math.max(0,debt.remainingNative-principalPay);
   if(scheduled>0)alreadyPlanned.push({debtId:debt.id,name:debt.name,
     amountNative:fmt(scheduled),estimatedInterestNative:fmt(interest),
     principalReductionNative:fmt(principalPay),currency:debt.currency_code});
  }
  // Protect the lowest subsequent baseline month, the desired cash buffer,
  // and any optional extra payments suggested in prior months.
  const futureFloor=Math.min(...allMonths.slice(i).map(x=>Number(x.minimumTwd??x.endingTwd)));
  const budget=Math.max(0,Math.floor(futureFloor-buffer-allocatedEarlier));
  let spare=budget;
  for(const debt of outstanding){
   if(spare<1||debt.rate===null||debt.remainingNative<1)continue;
   const nativePay=Math.min(debt.remainingNative,Math.floor(spare/debt.rate));
   if(nativePay<1)continue;
   const twd=rounded(nativePay*debt.rate);
   if(twd<1||twd>spare)continue;
   debt.remainingNative-=nativePay;
   spare-=twd;
   allocatedEarlier+=twd;
   const row={month,debtId:debt.id,name:debt.name,currency:debt.currency_code,
     extraNative:fmt(nativePay),extraTwd:fmt(twd),
     dueDate:debt.due_date||null,apr:debt.apr,
     suggestedTotalNative:fmt((byMonth.get(month+"|"+debt.id)||0)+nativePay)};
   suggested.push(row);suggestions.push(row);
  }
  months.push({month,startingTwd:fmt(openingTwd),incomeTwd:String(m.incomeTwd??"0"),
   essentialOutgoTwd:String(m.costTwd??"0"),existingDebtTwd:String(m.repaymentTwd??"0"),
   savingsTwd:String(m.goalTwd??"0"),baselineEndingTwd:String(m.endingTwd),
   suggestedExtraTwd:fmt(budget-spare),
   endingAfterSuggestionsTwd:fmt(Number(m.endingTwd)-allocatedEarlier),
   plannedPayments:alreadyPlanned,suggestions:suggested});
  openingTwd=Number(m.endingTwd);
 }
 const remaining=outstanding.map(d=>({debtId:d.id,name:d.name,currency:d.currency_code,
  dueDate:d.due_date,annualInterestPercent:d.apr*100,
  remainingNative:fmt(d.remainingNative),
  remainingTwd:d.rate===null?null:fmt(d.remainingNative*d.rate),
  missingRate:d.rate===null}));
 if(outstanding.some(d=>d.due_date&&d.due_date<asOf))
  warnings.push("Có nợ đã quá hạn. Cần đối chiếu với chủ nợ về lãi/phí thực tế trước khi thực hiện.");
 if(outstanding.some(d=>d.apr>0))
  warnings.push("Lãi dự kiến chỉ ước tính theo lãi suất năm / 12; không bao gồm lãi phạt, sao kê hoặc thay đổi theo ngày.");
 if(!allMonths.length)warnings.push("Chưa có dữ liệu thu/chi cho khoảng dự báo.");
 if(allMonths.some(m=>Number(m.endingTwd)<buffer))
  warnings.push("Một số tháng thiếu tiền so với quỹ dự phòng; không tự dùng tiền chi thiết yếu để đề xuất trả nợ thêm.");
 return {priority:["debt","essential_expense","saving"],months,suggestions,
  remaining,warnings,bufferTwd:String(buffer),source:"finance_postgresql",readOnly:true,
  note:"Số tiền trong lịch quỹ nợ đã trừ một lần ở dự báo gốc; phần 'trả thêm' chỉ là đề xuất, chưa ghi sổ."};
}
