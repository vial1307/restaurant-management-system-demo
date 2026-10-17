// Read-only recommendation engine. Ledger and debtor outstanding amounts remain
// unchanged until a confirmed repayment is explicitly posted.
// Loan payments already present in the baseline cashflow MUST NOT be added twice.
const validMoney=x=>Number.isFinite(Number(x))&&Number(x)>=0;
export function buildDebtRepaymentAdvice({projection,debts=[],debtFunds=[],quotes={},cashBufferTwd=0}){
 const months=projection?.months||[],timeline=projection?.timeline||[];
 const warnings=[],unknown=[],monthPlans=[];
 const buffer=Math.max(0,Number(cashBufferTwd)||0);
 const money=x=>Math.round(x*100)/100;
 const sorted=debts.map(d=>{
   const code=d.currency_code||"TWD";
   const q=code==="TWD"?1:quotes[code]?.status==="fresh"?Number(quotes[code].rateToTwd):null;
   const out=Number(d.outstanding_amount);
   if(q===null||!Number.isFinite(q)||q<=0||!validMoney(out)){
     unknown.push({name:d.name,currency:code});return null;
   }
   return {id:d.id,name:d.name,currency:code,dueDate:d.due_date||null,
    annualRate:Number(d.annual_interest_rate||0),
    rateToTwd:q,remainingTwd:money(out*q)};
 }).filter(Boolean).sort((a,b)=>{
  // Payment due first; APR is the tiebreaker. A debt without a deadline
  // has lower priority than a confirmed due-date obligation.
  return (a.dueDate||"9999-12-31").localeCompare(b.dueDate||"9999-12-31")||
   b.annualRate-a.annualRate||a.name.localeCompare(b.name);
 });
 let extraCommitted=0,interestTotal=0;
 if(unknown.length)warnings.push("Các khoản nợ chưa có tỷ giá mới không được đưa vào số TWD gợi ý: "+unknown.map(x=>x.name+" ("+x.currency+")").join(", ")+".");
 for(const m of months){
  const f=debtFunds.filter(x=>String(x.month_date||"").slice(0,7)===m.month);
  const now=timeline.filter(t=>t.date?.startsWith(m.month)&&Number(t.amountTwd)>0&&t.kind==="income");
  const payday=now.length?now.at(-1).date:null;
  // Safe repayment after a real scheduled inflow, with all future obligations
  // and all previously suggested extra repayments reserved.
  const future=payday?timeline.filter(t=>t.date>=payday):[];
  const lowest=future.length?Math.min(...future.map(t=>Number(t.balanceTwd))):Number(m.endingTwd);
  let safeExtra=payday?Math.max(0,Math.floor(lowest-buffer-extraCommitted)):0;
  const details=[];
  const maxIncome=Number(m.incomeTwd||0);
  if(!payday&&sorted.some(d=>d.remainingTwd>0))warnings.push(m.month+": chưa có lịch nhận thu nhập; không tự dự đoán lương của tháng này.");
  for(const d of sorted){
   if(d.remainingTwd<=0)continue;
   const interest=money(Math.max(0,d.remainingTwd*d.annualRate/12));
   interestTotal+=interest;
   // Interest is explicitly a rough APR / 12 estimate; do not silently
   // increase debt principal by assumed capitalization terms.
   const allocations=f.filter(x=>x.debt_id===d.id);
   const booked=Math.min(d.remainingTwd,allocations.reduce((n,x)=>n+Math.max(0,Number(x.planned_twd)||0),0));
   d.remainingTwd=money(Math.max(0,d.remainingTwd-booked));
   const extra=Math.min(safeExtra,Math.ceil(d.remainingTwd));
   d.remainingTwd=money(Math.max(0,d.remainingTwd-extra));
   safeExtra-=extra;extraCommitted+=extra;
   if(booked||extra||interest){
    details.push({debtId:d.id,name:d.name,currency:d.currency,dueDate:d.dueDate,
      interestEstimateTwd:money(interest),scheduledFundTwd:money(booked),
      suggestedExtraTwd:money(extra),remainingPrincipalEstimateTwd:d.remainingTwd,
      paymentPriority:"debt"});
   }
  }
  const scheduled=details.reduce((n,d)=>n+d.scheduledFundTwd,0);
  const extra=details.reduce((n,d)=>n+d.suggestedExtraTwd,0);
  monthPlans.push({month:m.month,incomeTwd:String(m.incomeTwd||"0"),
    essentialTwd:String(m.costTwd||"0"),savingsTwd:String(m.goalTwd||"0"),
    scheduledDebtTwd:String(money(scheduled+Math.max(0,Number(m.repaymentTwd)||0))),
    suggestedAdditionalDebtTwd:String(extra),
    projectedAfterSuggestionsTwd:String(money(Number(m.endingTwd)-extraCommitted)),
    estimatedInterestTwd:String(money(details.reduce((n,d)=>n+d.interestEstimateTwd,0))),
    availableAfterAllKnownObligationsTwd:String(money(Math.max(0,lowest-buffer-extraCommitted))),
    payday,details});
 }
 if(months.length&&sorted.some(d=>d.remainingTwd>0))warnings.push("Dư nợ cuối kỳ là dự báo nếu các khoản đã lên lịch và khoản trả thêm gợi ý đều được thực hiện. Không phải dư nợ thực tế.");
 warnings.push("Lãi ước tính = dư gốc × lãi suất năm ÷ 12; lịch tính lãi thực tế, phí và tỷ giá thanh toán có thể khác.");
 return {priority:["debt","expense","goal"],basis:"read_only_finance_plan",months:monthPlans,
   debtBalances:sorted.map(d=>({debtId:d.id,name:d.name,currency:d.currency,remainingPrincipalEstimatedTwd:String(d.remainingTwd),dueDate:d.dueDate})),
   estimatedInterestTotalTwd:String(money(interestTotal)),unconvertedDebts:unknown,warnings:[...new Set(warnings)]};
}
