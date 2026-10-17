// Scenario-only deterministic Finance OS simulation. Never mutates real ledger or debts.
// All values are TWD micro-units to preserve numeric accuracy across FX snapshots.
const MICRO=1000000n;
export function units(input){
  const s=String(input??"0");
  if(!/^-?(?:0|[1-9]\d{0,16})(?:\.\d{1,6})?$/.test(s))throw new Error("INVALID_SCENARIO_AMOUNT");
  const negative=s.startsWith("-"),[a,b=""]=(negative?s.slice(1):s).split(".");
  const value=BigInt(a)*MICRO+BigInt((b+"000000").slice(0,6));
  return negative?-value:value;
}
export const plain=value=>{
  const n=value<0n?-value:value;
  return (value<0n?"-":"")+String(n/MICRO)+(n%MICRO?"."+String(n%MICRO).padStart(6,"0").replace(/0+$/,""):"");
};
export const addDays=(date,count)=>new Date(Date.parse(date+"T00:00:00Z")+count*86400000).toISOString().slice(0,10);
export const dateOk=x=>typeof x==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x+"T00:00:00Z"))&&addDays(x,0)===x;
const monthShift=(date,months)=>new Date(Date.UTC(Number(date.slice(0,4)),Number(date.slice(5,7))-1+months,1)).toISOString().slice(0,7);
export const monthEnd=month=>addDays(monthShift(month+"-01",1)+"-01",-1);
const dateFor=(month,day)=>{
  const max=Number(monthEnd(month).slice(-2));
  const actual=Math.min(Number(day)||max,max);
  return {date:month+"-"+String(actual).padStart(2,"0"),estimatedDate:!day||Number(day)>max};
};
const positive=(x,allowZero=true)=>{
  const n=units(x);
  if(n<0n||(!allowZero&&n===0n))throw new Error("INVALID_SCENARIO_AMOUNT");
  return n;
};
export function validateScenario(input){
 if(!input||typeof input!=="object"||Array.isArray(input))throw new Error("INVALID_SCENARIO");
 const name=String(input.name||"Kịch bản của tôi").trim().slice(0,90);
 const months=Number(input.months??12), salaryDay=Number(input.salaryDay??10);
 if(!name||![3,6,12].includes(months)||!Number.isInteger(salaryDay)||salaryDay<1||salaryDay>31)throw new Error("INVALID_SCENARIO");
 const bufferTwd=String(input.bufferTwd??"0"),monthlyExtraIncomeTwd=String(input.monthlyExtraIncomeTwd??"0");
 positive(bufferTwd);positive(monthlyExtraIncomeTwd);
 const rows=input.rows??[];
 if(!Array.isArray(rows)||rows.length>120)throw new Error("INVALID_SCENARIO_ROWS");
 const kinds=["income","income_loss","expense","debt","goal","borrow","repay"];
 const normalized=rows.map((row,index)=>{
   if(!row||typeof row!=="object"||!kinds.includes(row.kind)||!dateOk(row.date))throw new Error("INVALID_SCENARIO_ROW");
   const amountTwd=String(row.amountTwd??""),label=String(row.label??"").trim().slice(0,120);
   positive(amountTwd,false);
   if(!label)throw new Error("INVALID_SCENARIO_ROW");
   const linkId=String(row.linkId||"").trim().slice(0,60);
   if(["borrow","repay"].includes(row.kind)&&!linkId)throw new Error("LOAN_REPAYMENT_PAIR_REQUIRED");
   return {key:String(row.key||"row-"+index).slice(0,60),kind:row.kind,date:row.date,
     amountTwd,label,linkId};
 });
 const links=new Map();
 for(const row of normalized.filter(r=>["borrow","repay"].includes(r.kind))){
   const current=links.get(row.linkId)||[];
   current.push(row);links.set(row.linkId,current);
 }
 for(const pair of links.values()){
   if(pair.length!==2||!pair.some(x=>x.kind==="borrow")||!pair.some(x=>x.kind==="repay"))throw new Error("LOAN_REPAYMENT_PAIR_REQUIRED");
   const borrowed=pair.find(x=>x.kind==="borrow"),returned=pair.find(x=>x.kind==="repay");
   if(borrowed.date>returned.date||units(returned.amountTwd)<units(borrowed.amountTwd))throw new Error("INVALID_LOAN_REPAYMENT");
 }
 let goal=null;
 if(input.goal?.label||input.goal?.totalTwd||input.goal?.targetDate){
   const g=input.goal;
   const label=String(g.label||"Mục tiêu").trim().slice(0,100);
   const totalTwd=String(g.totalTwd??"0");
   if(!dateOk(g.targetDate)||!label)throw new Error("INVALID_SCENARIO_GOAL");
   positive(totalTwd);
   const mode=String(g.mode||"even");if(!["even","adaptive"].includes(mode))throw new Error("INVALID_SCENARIO_GOAL");
   goal={label,totalTwd,targetDate:g.targetDate,mode};
 }
 return {name,months,salaryDay,bufferTwd,monthlyExtraIncomeTwd,rows:normalized,goal};
}
export function sourceEvents({asOf,through,accounts=[],cashItems=[],debtFunds=[],goalFunds=[],debtPayments=[],fxPlans=[],debts=[]}){
 const events=[],warnings=[];
 let pastDueCount=0;
 const startingBalance=accounts.filter(a=>a.currency_code==="TWD").reduce((sum,a)=>sum+units(a.balance),0n);
 const foreign=accounts.filter(a=>a.currency_code!=="TWD");
 if(foreign.length)warnings.push("Ví ngoại tệ chưa quy đổi sang thanh khoản TWD; chỉ đánh giá tiền TWD thực có.");
 const include=(event)=>{
   if(event.date<asOf){pastDueCount++;return;}
   if(event.date>through)return;
   if(units(event.amountTwd)===0n)return;
   events.push(event);
 };
 for(const row of cashItems){
   const month=String(row.month_date).slice(0,7);
   const d=dateFor(month,row.due_day);
   if(d.estimatedDate)warnings.push("Có khoản thu/chi thiếu ngày chính xác, tạm xếp cuối tháng.");
   include({date:d.date,kind:row.kind,label:row.label,amountTwd:plain(units(row.amount_twd)*(row.kind==="income"?1n:-1n)),
    source:"cashflow",estimatedDate:d.estimatedDate});
 }
 const posted=new Map();
 for(const p of debtPayments){
   const k=p.debt_id+"|"+String(p.payment_date).slice(0,7);
   posted.set(k,(posted.get(k)||0n)+units(p.base_amount_twd??"0"));
 }
 for(const row of debtFunds){
   const month=String(row.month_date).slice(0,7);
   const debtDate=dateOk(row.due_date)&&row.due_date.slice(0,7)===month?row.due_date:null;
   const when=row.payment_day?dateFor(month,row.payment_day):debtDate?{date:debtDate,estimatedDate:false}:dateFor(month,null);
   if(when.estimatedDate)warnings.push("Một số quỹ trả nợ chưa có ngày đến hạn đúng tháng; mốc cuối tháng chỉ là ước tính.");
   const due=units(row.planned_twd)-(posted.get(row.debt_id+"|"+month)||0n);
   include({date:when.date,kind:"debt",label:"Quỹ nợ: "+row.debt_name,
     amountTwd:plain(due>0n?-due:0n),source:"debt_fund",estimatedDate:when.estimatedDate});
 }
 for(const row of goalFunds){
   const month=String(row.month_date).slice(0,7);
   const d=dateOk(row.target_date)&&row.target_date.slice(0,7)===month?
     {date:row.target_date,estimatedDate:false}:dateFor(month,null);
   include({date:d.date,kind:"goal",label:"Quỹ mục tiêu: "+row.goal_name,
     amountTwd:plain(-units(row.planned_twd)),source:"goal_fund",estimatedDate:d.estimatedDate});
 }
 for(const p of fxPlans){
   if(p.status!=="planned"||p.plan_kind!=="remittance")continue;
   if(p.from_currency!=="TWD"){
     warnings.push("Có kế hoạch chuyển ngoại tệ ngoài TWD; chưa thể tính thanh khoản nếu thiếu tỷ giá đã xác nhận.");
     continue;
   }
   include({date:p.plan_date,kind:"expense",label:"Chuyển ra ngoài (TWD)",
     amountTwd:plain(-(units(p.source_amount)+units(p.expected_fee||"0"))),source:"remittance",estimatedDate:false});
 }
 if(pastDueCount)warnings.push("Có "+pastDueCount+" dòng dự kiến đã qua ngày và chưa được đối soát với giao dịch thực tế. Kiểm tra trạng thái thu/trả để tránh bỏ sót nợ quá hạn.");
 if(debts.some(d=>d.currency_code!=="TWD"))warnings.push("Công nợ ngoại tệ chưa quy đổi, không dùng dư nợ VND/USD để tính tổng nợ TWD.");
 if(debts.some(d=>!debtFunds.some(f=>f.debt_id===d.id)))warnings.push("Có công nợ chưa lập lịch trả góp theo từng tháng; dự báo có thể thiếu nghĩa vụ.");
 return {startingBalanceTwd:plain(startingBalance),events,warnings:[...new Set(warnings)],
   debtTwdPrincipal:plain(debts.filter(d=>d.currency_code==="TWD").reduce((s,d)=>s+units(d.outstanding_amount??"0"),0n)),
   debtRanking:debts.filter(d=>d.currency_code==="TWD"&&units(d.outstanding_amount??"0")>0n)
     .map(d=>({name:d.name,amountTwd:d.outstanding_amount,rate:String(d.annual_interest_rate??"0")}))
     .sort((a,b)=>Number(b.rate)-Number(a.rate))};
}
const actualDelta=(kind,amount)=>["income","borrow"].includes(kind)?amount:-amount;
function timelineFor({asOf,through,startingBalanceTwd,baselineEvents,settings,addition=0n}){
 const events=baselineEvents.map(e=>({...e,delta:units(e.amountTwd),source:e.source||"database"}));
 const add=(e)=>{if(e.date>=asOf&&e.date<=through)events.push(e);};
 for(const row of settings.rows){
   add({...row,delta:actualDelta(row.kind,units(row.amountTwd)),source:"scenario"});
 }
 const paydayDates=[];
 for(let i=0;i<settings.months;i++){
   const month=monthShift(asOf,i),d=dateFor(month,settings.salaryDay);
   if(d.date>=asOf&&d.date<=through){
     paydayDates.push(d.date);
     const sum=units(settings.monthlyExtraIncomeTwd)+addition;
     if(sum>0n)add({date:d.date,kind:"income",label:"Thu nhập tăng thêm giả định",delta:sum,source:"assumption"});
   }
 }
 const warnings=[];
 let goalFundingGap=0n,goalSchedule=[];
 if(settings.goal&&units(settings.goal.totalTwd)>0n){
   const allPaydays=[];
   for(let i=0;i<settings.months;i++){
     const month=monthShift(asOf,i),d=dateFor(month,settings.salaryDay).date;
     if(d>=asOf&&d<=through&&d<=settings.goal.targetDate)allPaydays.push(d);
   }
   const total=units(settings.goal.totalTwd);
   if(!allPaydays.length){
     goalFundingGap=total;
     warnings.push("Không có kỳ thu nhập giả định nào trước hạn mục tiêu. Cần đổi ngày hoặc nguồn tiền.");
   }else if(settings.goal.mode==="adaptive"){
     // Working backwards means expensive months are funded only up to the
     // cash surplus actually available after all subsequent known obligations.
     let remaining=total;
     const buffer=units(settings.bufferTwd);
     for(const d of [...allPaydays].reverse()){
       const ordered=[...events].sort((a,b)=>a.date.localeCompare(b.date)||
         (a.delta>0n&&b.delta<=0n?-1:a.delta<=0n&&b.delta>0n?1:0));
       let balance=units(startingBalanceTwd),lowest=null;
       // Day-end after positive income and negative obligations; includes all
       // previously allocated goal payments on later dates.
       for(let i=0;i<ordered.length;){
         const day=ordered[i].date;
         while(i<ordered.length&&ordered[i].date===day){balance+=ordered[i].delta;i++;}
         if(day>=d&&(lowest===null||balance<lowest))lowest=balance;
       }
       if(lowest===null)lowest=balance;
       const available=lowest>buffer?lowest-buffer:0n;
       const contribution=remaining<available?remaining:available;
       if(contribution>0n){
         add({date:d,kind:"goal",label:"Để dành linh hoạt: "+settings.goal.label,
           delta:-contribution,source:"scenario_goal"});
         goalSchedule.push({date:d,amountTwd:plain(contribution)});
         remaining-=contribution;
       }
       if(remaining===0n)break;
     }
     goalFundingGap=remaining;
     goalSchedule.sort((a,b)=>a.date.localeCompare(b.date));
     if(remaining>0n)warnings.push("Chưa thể phân bổ đủ "+plain(remaining)+" TWD mục tiêu mà vẫn giữ mức dự trữ theo lịch đã nhập.");
   }else{
     const installment=(total+BigInt(allPaydays.length)-1n)/BigInt(allPaydays.length);
     let remaining=total;
     for(const d of allPaydays){
       const contribution=remaining<installment?remaining:installment;
       remaining-=contribution;
       add({date:d,kind:"goal",label:"Để dành: "+settings.goal.label,
         delta:-contribution,source:"scenario_goal"});
       goalSchedule.push({date:d,amountTwd:plain(contribution)});
     }
     goalFundingGap=remaining;
   }
   if(settings.goal.targetDate>through)warnings.push("Ngày cần đạt mục tiêu nằm sau kỳ mô phỏng; chưa thể chứng minh toàn bộ quỹ đạt đủ trước hạn.");
 }
 events.sort((a,b)=>a.date.localeCompare(b.date)||
   (a.delta>0n&&b.delta<=0n?-1:a.delta<=0n&&b.delta>0n?1:0)||a.label.localeCompare(b.label));
 let balance=units(startingBalanceTwd),minimum=balance,minimumDate=asOf,firstRisk=null;
 const buffer=units(settings.bufferTwd);
 if(balance<buffer)firstRisk={date:asOf,gapTwd:plain(buffer-balance),label:"Dự trữ hiện có"};
 const timeline=[];
 const monthly=new Map();
 const monthCount=settings.months;
 for(let i=0;i<monthCount;i++){
   const month=monthShift(asOf,i);
   monthly.set(month,{month,income:0n,essential:0n,goals:0n,borrowed:0n,repayment:0n,end:balance,minimum:null});
 }
 for(const e of events){
   const n=e.delta;
   const month=e.date.slice(0,7),summary=monthly.get(month);
   balance+=n;
   if(balance<minimum){minimum=balance;minimumDate=e.date;}
   if(!firstRisk&&balance<buffer)firstRisk={date:e.date,gapTwd:plain(buffer-balance),label:e.label};
   if(summary){
     if(e.kind==="income"||e.kind==="income_loss")summary.income+=n;
     else if(e.kind==="borrow")summary.borrowed+=n;
     else if(e.kind==="repay")summary.repayment-=n;
     else if(e.kind==="goal")summary.goals-=n;
     else summary.essential-=n;
     summary.end=balance;
     if(summary.minimum===null||balance<summary.minimum)summary.minimum=balance;
   }
   timeline.push({date:e.date,label:e.label,kind:e.kind,source:e.source,
     estimatedDate:!!e.estimatedDate,amountTwd:plain(n),balanceTwd:plain(balance)});
 }
 const months=[];
 let carry=units(startingBalanceTwd);
 for(const s of monthly.values()){
   const opening=carry;
   if(s.minimum===null)s.end=carry;
   else carry=s.end;
   const min=s.minimum===null?s.end:(s.minimum<opening?s.minimum:opening);
   months.push({month:s.month,incomeTwd:plain(s.income),costTwd:plain(s.essential),
    goalTwd:plain(s.goals),borrowedTwd:plain(s.borrowed),repaymentTwd:plain(s.repayment),
    endingTwd:plain(s.end),minimumTwd:plain(min),
    surplusTwd:plain(min>buffer?min-buffer:0n)});
 }
 // A safe immediate extra repayment is limited by the lowest balance BEFORE the
 // next payday, not by a positive end-of-month total that arrives too late.
 const firstPayday=paydayDates.find(d=>d>=asOf);
 let safety=units(startingBalanceTwd);
 for(const e of timeline.filter(x=>!firstPayday||x.date<firstPayday)){
   const v=units(e.balanceTwd);
   if(v<safety)safety=v;
 }
 return {asOf,through,startingBalanceTwd,bufferTwd:settings.bufferTwd,
   endingTwd:plain(balance),minimumTwd:plain(minimum),minimumDate,
   earliestRisk:firstRisk,months,timeline,warnings,
   firstPayday:firstPayday||null,
   goalFundingGapTwd:plain(goalFundingGap),goalSchedule,
   safeExtraDebtTwd:plain(safety>buffer?safety-buffer:0n)};
}
export function simulateScenario({asOf,source,scenario}){
 if(!dateOk(asOf)||!source||!Array.isArray(source.events))throw new Error("INVALID_SCENARIO");
 const settings=validateScenario(scenario);
 const through=addDays(monthShift(asOf,settings.months)+"-01",-1);
 for(const row of settings.rows){
   if(row.date<asOf||row.date>through)throw new Error("SCENARIO_DATE_OUTSIDE_WINDOW");
 }
 if(settings.goal&&settings.goal.targetDate<asOf)throw new Error("INVALID_SCENARIO_GOAL");
 const base=timelineFor({asOf,through,startingBalanceTwd:source.startingBalanceTwd,
   baselineEvents:source.events,settings});
 let minExtra=null;
 // Even an arbitrarily large paycheck cannot repair a shortfall before it is received.
 // This is explicitly distinguished from a sustainable monthly income gap.
 if(!base.earliestRisk&&units(base.goalFundingGapTwd)===0n)minExtra="0";
 else{
   let high=100000000n*MICRO;
   const feasible=timelineFor({asOf,through,startingBalanceTwd:source.startingBalanceTwd,
     baselineEvents:source.events,settings,addition:high});
   if(!feasible.earliestRisk&&units(feasible.goalFundingGapTwd)===0n){
     let low=0n;
     while(low<high){
       const mid=(low+high)/2n;
       const probe=timelineFor({asOf,through,startingBalanceTwd:source.startingBalanceTwd,
         baselineEvents:source.events,settings,addition:mid});
       if(probe.earliestRisk||units(probe.goalFundingGapTwd)>0n)low=mid+1n;
       else high=mid;
     }
     // Round up to whole TWD for a practical salary target.
     const whole=(low+MICRO-1n)/MICRO;
     minExtra=String(whole);
   }
 }
 // Informational bridge window only: principal, zero assumed fees. Never an instruction to borrow.
 // Repayment is considered affordable only after the candidate day AND every later
 // scheduled obligation remains above buffer; before then, calculate the peak bridge.
 let bridgeWindow=null;
 if(base.earliestRisk){
   const buffer=units(settings.bufferTwd);
   const paydays=[...new Set(base.timeline.filter(e=>e.kind==="income" &&
     units(e.amountTwd)>0n && e.date>base.earliestRisk.date).map(e=>e.date))];
   for(const payday of paydays){
     const tail=base.timeline.filter(e=>e.date>=payday);
     if(tail.some(e=>units(e.balanceTwd)<buffer))continue;
     const preceding=base.timeline.filter(e=>e.date<payday);
     let peak=buffer-units(source.startingBalanceTwd);
     for(const x of preceding){
       const gap=buffer-units(x.balanceTwd);
       if(gap>peak)peak=gap;
     }
     const gap=peak>0n?peak:0n;
     bridgeWindow={neededBy:base.earliestRisk.date,
       minimumPrincipalTwd:plain(gap),earliestPrincipalOnlyRepayDate:payday,
       feeKnown:false,financialAdvice:false};
     break;
   }
 }
 const loans=settings.rows.filter(r=>r.kind==="borrow").map(r=>{
   const pay=settings.rows.find(t=>t.kind==="repay"&&t.linkId===r.linkId);
   return {label:r.label,borrowDate:r.date,repayDate:pay.date,borrowedTwd:r.amountTwd,
     repayTwd:pay.amountTwd,daysToRepay:Math.round((Date.parse(pay.date+'T00:00:00Z')-Date.parse(r.date+'T00:00:00Z'))/86400000),financingCostTwd:plain(units(pay.amountTwd)-units(r.amountTwd))};
 });
 const warnings=[...source.warnings,...base.warnings];
 if(loans.length)warnings.push("Khoản vay là giả định mới, không phải tiền thật; lãi, phí và ngày hoàn trả phải nhập từ điều khoản thực tế.");
 if(settings.rows.some(r=>r.kind==="income_loss"))warnings.push("Giảm thu nhập là khoản bù trừ giả định; kiểm tra lịch thu gốc và ngày tiền thực nhận để không khấu trừ hai lần.");
 if((base.earliestRisk||units(base.goalFundingGapTwd)>0n)&&minExtra===null)warnings.push("Tăng thu nhập vào các ngày lương đã chọn vẫn không khắc phục được rủi ro trước đó hoặc không đủ kỳ tích lũy. Điều chỉnh ngày, chi linh hoạt hay hạn mục tiêu.");
 if(settings.rows.some(x=>x.kind==="debt")&&source.events.some(x=>x.source==="debt_fund"))warnings.push("Kiểm tra khoản tất toán và quỹ nợ đã phân bổ để không trừ trùng cùng một nghĩa vụ.");
 return {...base,name:settings.name,minimumAdditionalIncomePerPaydayTwd:minExtra,
   goal:settings.goal,loans,bridgeWindow,sourceDebtTwdPrincipal:source.debtTwdPrincipal,
   debtRanking:source.debtRanking,warnings:[...new Set(warnings)].slice(0,18),
   methodology:"Mô phỏng thanh khoản; không phải dự báo xác suất, giao dịch thực tế hay lời đề nghị vay."};
}