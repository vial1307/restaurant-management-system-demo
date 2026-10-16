// Pure Finance OS forward cash planner. Amounts use signed BigInt micro-TWD,
// so any threshold comparison is exact (never IEEE754 currency math).
const MICRO=1000000n;
export function twdUnits(value){
  const s=String(value??"");
  if(!/^-?(?:0|[1-9]\d{0,17})(?:\.\d{1,6})?$/.test(s))throw new Error("INVALID_TWD_AMOUNT");
  const negative=s.startsWith("-"),abs=negative?s.slice(1):s;
  const [whole,fraction=""]=abs.split(".");
  const total=BigInt(whole)*MICRO+BigInt((fraction+"000000").slice(0,6));
  return negative?-total:total;
}
export function twdText(value){
  const minus=value<0n?"-":"",num=value<0n?-value:value;
  return minus+String(num/MICRO)+(num%MICRO===0n?"":"."+String(num%MICRO).padStart(6,"0").replace(/0+$/,""));
}
const utcDay=day=>new Date(day+"T00:00:00.000Z");
const iso=day=>day.toISOString().slice(0,10);
export const addDays=(day,n)=>iso(new Date(utcDay(day).getTime()+n*86400000));
const validDate=v=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(utcDay(v).getTime())&&iso(utcDay(v))===v;
const lastDay=month=>iso(new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)));
function dated(month,day,deadline){
  if(validDate(deadline)&&deadline.slice(0,7)===month)return {date:deadline,estimatedDate:false};
  const last=lastDay(month);
  if(day!=null && Number.isInteger(Number(day)) && Number(day)>0)
    return {date:month+"-"+String(Math.min(Number(day),Number(last.slice(-2)))).padStart(2,"0"),
      estimatedDate:Number(day)>Number(last.slice(-2))};
  return {date:last,estimatedDate:true};
}
function monthOf(row){return String(row.month||row.month_date||"").slice(0,7);}
export function calculateFinanceAdvice({asOf,days,bufferTwd="0",wallets=[],cashItems=[],debtFunds=[],goalFunds=[],debtPayments=[],fxPlans=[],goals=[],debts=[]}){
  if(!validDate(asOf)||![30,60,90].includes(days))throw new Error("INVALID_ADVISOR_RANGE");
  const buffer=twdUnits(bufferTwd);
  if(buffer<0n)throw new Error("INVALID_ADVISOR_BUFFER");
  const through=addDays(asOf,days-1);
  let opening=0n;
  const foreignWallets=[];
  for(const wallet of wallets){
    if(wallet.currency_code==="TWD")opening+=twdUnits(wallet.balance);
    else foreignWallets.push({currency:wallet.currency_code,name:wallet.name,balance:String(wallet.balance)});
  }
  const warnings=[],entries=[],excludedFxPlans=[];
  let pastDueCount=0,estimatedDateCount=0,foreignFxCount=0;
  const push=(date,kind,label,amount,source,id,estimatedDate=false)=>{
    if(date<asOf){pastDueCount++;return;}
    if(date>through)return;
    if(estimatedDate)estimatedDateCount++;
    if(amount===0n)return;
    entries.push({date,kind,label,amountTwd:twdText(amount),source,sourceId:id||"",estimatedDate});
  };
  for(const item of cashItems){
    const m=monthOf(item);
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(m))continue;
    const when=dated(m,item.due_day,null);
    const amt=twdUnits(item.amount_twd);
    push(when.date,item.kind,item.label,item.kind==="income"?amt:-amt,"cashflow",item.id,when.estimatedDate);
  }
  // A posted debt payment is already reflected in real wallets. Remove it from
  // remaining planned monthly debt funding so the projection never debits twice.
  const settled=new Map();
  for(const p of debtPayments){
    const key=String(p.debt_id)+"|"+String(p.payment_date||"").slice(0,7);
    settled.set(key,(settled.get(key)||0n)+twdUnits(p.base_amount_twd??"0"));
  }
  for(const fund of debtFunds){
    const m=monthOf(fund);
    const gross=twdUnits(fund.planned_twd);
    const paid=settled.get(String(fund.debt_id)+"|"+m)||0n;
    const remainder=gross>paid?gross-paid:0n;
    const when=dated(m,null,fund.due_date);
    push(when.date,"debt","Quỹ nợ · "+fund.debt_name,-remainder,"debt_fund",fund.debt_id,when.estimatedDate);
  }
  for(const fund of goalFunds){
    const m=monthOf(fund);
    const when=dated(m,null,fund.target_date);
    push(when.date,"goal","Quỹ mục tiêu · "+fund.goal_name,-twdUnits(fund.planned_twd),"goal_fund",fund.goal_id,when.estimatedDate);
  }
  for(const p of fxPlans){
    if(p.status!=="planned"||p.plan_kind!=="remittance")continue;
    if(p.from_currency!=="TWD"){foreignFxCount++;excludedFxPlans.push({id:p.id,currency:p.from_currency,planDate:p.plan_date});continue;}
    const amount=twdUnits(p.source_amount)+twdUnits(p.expected_fee??"0");
    push(String(p.plan_date),"remittance","Chuyển ra ngoài · "+p.from_currency+" → "+p.to_currency,-amount,"fx_plan",p.id);
  }
  // Every owner-entered monthly allocation is explicit; missing allocations
  // should never be backfilled from the face value of a debt/savings goal.
  const thisMonth=asOf.slice(0,7);
  const goalIds=new Set(goalFunds.filter(g=>monthOf(g)===thisMonth).map(g=>String(g.goal_id)));
  const debtIds=new Set(debtFunds.filter(g=>monthOf(g)===thisMonth).map(g=>String(g.debt_id)));
  const unallocatedGoals=goals.filter(g=>g.status==="active"&&!goalIds.has(String(g.id))).map(g=>g.name);
  const unallocatedDebts=debts.filter(d=>twdUnits(d.outstanding_amount??"0")>0n&&!debtIds.has(String(d.id))).map(d=>d.name);
  if(unallocatedGoals.length)warnings.push({code:"UNALLOCATED_GOALS",message:"Chưa phân bổ quỹ mục tiêu trong tháng: "+unallocatedGoals.join(", ")});
  if(unallocatedDebts.length)warnings.push({code:"UNALLOCATED_DEBTS",message:"Chưa phân bổ quỹ trả nợ trong tháng: "+unallocatedDebts.join(", ")});
  if(foreignWallets.length)warnings.push({code:"FOREIGN_WALLETS_EXCLUDED",message:"Không cộng số dư ví ngoài TWD vì chưa có tỷ giá thanh khoản được xác nhận."});
  if(foreignFxCount)warnings.push({code:"FOREIGN_REMITTANCE_EXCLUDED",message:"Có "+foreignFxCount+" kế hoạch chuyển ra ngoài bằng ngoại tệ chưa quy đổi vào dự báo TWD."});
  if(pastDueCount)warnings.push({code:"PAST_DUE_UNRECONCILED",message:"Có "+pastDueCount+" lịch dự kiến đã qua ngày; chưa có liên kết chứng từ để xác nhận đã thanh toán. Kiểm tra và cập nhật lịch gốc."});
  if(estimatedDateCount)warnings.push({code:"ESTIMATED_DATES",message:"Có "+estimatedDateCount+" khoản được tạm xếp cuối tháng hoặc ngày cuối của tháng vì chưa có ngày thanh toán chính xác."});
  entries.sort((a,b)=>a.date.localeCompare(b.date)||
    (a.kind==="income"?-1:b.kind==="income"?1:0)||
    a.label.localeCompare(b.label)||a.sourceId.localeCompare(b.sourceId));
  let balance=opening,minimum=opening,minimumDate=asOf,earliestRisk=null;
  const totals={income:0n,expense:0n,debt:0n,goal:0n,remittance:0n};
  for(const event of entries){
    const amt=twdUnits(event.amountTwd);
    balance+=amt;
    totals[event.kind]+=amt<0n?-amt:amt;
    event.projectedBalanceTwd=twdText(balance);
    if(balance<minimum){minimum=balance;minimumDate=event.date;}
    if(!earliestRisk&&balance<buffer)earliestRisk={date:event.date,balanceTwd:twdText(balance),gapTwd:twdText(buffer-balance),source:event.source,label:event.label};
  }
  if(!earliestRisk && opening<buffer)earliestRisk={date:asOf,balanceTwd:twdText(opening),gapTwd:twdText(buffer-opening),source:"opening",label:"Dự trữ đầu kỳ"};
  const recommendations=[];
  if(earliestRisk){
    recommendations.push({kind:"liquidity_gap",title:"Ưu tiên xử lý thiếu hụt vào "+earliestRisk.date,
      detail:"Dự kiến thiếu "+twdText(buffer-twdUnits(earliestRisk.balanceTwd))+" TWD so với mức dự trữ đã chọn. Đối chiếu lịch thu tiền và các khoản cần thanh toán trước ngày này."});
    const nextIncome=entries.find(e=>e.kind==="income"&&e.date>earliestRisk.date);
    if(nextIncome)recommendations.push({kind:"timing",title:"So khớp với kỳ thu "+nextIncome.date,
      detail:"Thu dự kiến "+nextIncome.amountTwd+" TWD ("+nextIncome.label+") sau thời điểm hụt. Cân nhắc điều chỉnh lịch chi có thể linh hoạt hoặc duy trì dự trữ trước kỳ thu; không tự thay đổi nghĩa vụ đến hạn."});
    if(entries.some(e=>e.kind==="goal"&&e.date<=earliestRisk.date))
      recommendations.push({kind:"goal",title:"Rà soát tiến độ phân bổ mục tiêu",
        detail:"Phân bổ mục tiêu là kế hoạch có thể điều chỉnh nếu phù hợp ưu tiên; việc sửa không tự chuyển tiền hay cập nhật tiến độ tích lũy."});
  }else recommendations.push({kind:"buffer_ok",title:"Chưa thấy ngày hụt tiền trong phạm vi dự báo",
    detail:"Với dữ liệu đã nhập, số dư TWD dự kiến không xuống dưới mức dự trữ. Kiểm tra lại lịch và chi phí chưa nhập trước khi quyết định."});
  recommendations.push({kind:"reconcile",title:"Đối chiếu lịch trước khi xoay vòng",
    detail:"Khoản dự kiến có thể đã thu/chi nhưng chưa liên kết với chứng từ. Không vay thêm, chuyển ví hoặc hoãn thanh toán chỉ dựa trên dự báo này."});
  return {
    asOf,through,days,bufferTwd:twdText(buffer),startingBalanceTwd:twdText(opening),
    projectedEndingTwd:twdText(balance),minimumBalanceTwd:twdText(minimum),minimumDate,
    earliestRisk,totals:Object.fromEntries(Object.entries(totals).map(([k,v])=>[k,twdText(v)])),
    entries,warnings,recommendations,foreignWallets,excludedFxPlans,
    metadata:{currency:"TWD",timeZone:"Asia/Taipei",countedWallets:wallets.length-foreignWallets.length,source:"finance_postgresql",readOnly:true}
  };
}
