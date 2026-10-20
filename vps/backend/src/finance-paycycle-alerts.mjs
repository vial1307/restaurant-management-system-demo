// Finance OS presentation-only cash-cycle and alert projection.
// Source data is the owner-scoped advisor result; no money movement, no DB writes.
// All calculations remain in integer micro-TWD, never JS floating-point money.
const SCALE=1000000n;
const amount=v=>{
  const s=String(v??"0");
  if(!/^-?(?:0|[1-9]\d{0,17})(?:\.\d{1,6})?$/.test(s))throw new Error("INVALID_TWD_AMOUNT");
  const neg=s.startsWith("-");
  const [whole,fraction=""]=(neg?s.slice(1):s).split(".");
  const n=BigInt(whole)*SCALE+BigInt((fraction+"000000").slice(0,6));
  return neg?-n:n;
};
const output=n=>(n<0n?"-":"")+String((n<0n?-n:n)/SCALE)+
  ((n<0n?-n:n)%SCALE===0n?"":"."+String((n<0n?-n:n)%SCALE).padStart(6,"0").replace(/0+$/,""));
const dateShift=(day,delta)=>new Date(Date.parse(day+"T00:00:00Z")+delta*86400000).toISOString().slice(0,10);
const diffDays=(a,b)=>Math.round((Date.parse(b+"T00:00:00Z")-Date.parse(a+"T00:00:00Z"))/86400000);
export function buildCycleAlerts({asOf,through,startingBalanceTwd,bufferTwd,entries=[]}){
  const opening=amount(startingBalanceTwd),buffer=amount(bufferTwd);
  const events=entries.map(e=>({...e,delta:amount(e.amountTwd)}))
    .filter(e=>e.date>=asOf&&e.date<=through).sort((a,b)=>a.date.localeCompare(b.date)||
      (a.kind==="income"?-1:b.kind==="income"?1:0));
  const incomeDates=[...new Set(events.filter(e=>e.kind==="income").map(e=>e.date))].sort();
  const starts=[asOf,...incomeDates.filter(d=>d>asOf)];
  const boundaries=[...starts.slice(1),dateShift(through,1)];
  const cycles=[];
  let current=opening,pos=0;
  for(let i=0;i<starts.length;i++){
    const start=starts[i],boundary=boundaries[i],before=current;
    let received=0n,obligations=0n,goals=0n,minimum=i===0?current:null,minimumDate=start,count=0;
    while(pos<events.length&&events[pos].date<boundary){
      const item=events[pos++];
      if(item.delta>0n)received+=item.delta;
      else if(item.kind==="goal")goals-=item.delta;
      else obligations-=item.delta;
      current+=item.delta;count++;
      if(minimum===null||current<minimum){minimum=current;minimumDate=item.date;}
    }
    const gap=minimum<buffer?buffer-minimum:0n;
    cycles.push({
      startDate:start,endDate:dateShift(boundary,-1),nextIncomeDate:i+1<starts.length?starts[i+1]:null,
      startingBalanceTwd:output(before),incomeTwd:output(received),
      obligationsTwd:output(obligations),goalAllocationsTwd:output(goals),
      endingBalanceTwd:output(current),minimumBalanceTwd:output(minimum),minimumDate,
      reserveGapTwd:output(gap),uncommittedCushionTwd:output(minimum>buffer?minimum-buffer:0n),
      eventCount:count
    });
  }
  const alerts=[];
  const riskDate=cycles.find(c=>amount(c.reserveGapTwd)>0n);
  if(riskDate){
    alerts.push({code:"LIQUIDITY_GAP",severity:"danger",date:riskDate.minimumDate,
      title:"Thiếu mức dự trữ trước kỳ thu tiếp theo",
      message:"Dự báo cần bù "+output(amount(riskDate.reserveGapTwd))+" TWD trước "+riskDate.minimumDate+
        ". Đối chiếu ngày thu nhập, giảm khoản chi linh hoạt hoặc điều chỉnh quỹ mục tiêu. Không tự hoãn nợ đến hạn."});
  }
  const upcoming=events.filter(e=>e.delta<0n&&e.date>=asOf&&diffDays(asOf,e.date)<=7);
  for(const e of upcoming.slice(0,6)){
    const days=diffDays(asOf,e.date);
    alerts.push({code:"DUE_SOON",severity:days<=1?"danger":"warning",date:e.date,
      title:days===0?"Đến hạn hôm nay":days===1?"Cần tiền ngày mai":"Cần tiền sau "+days+" ngày",
      message:e.label+" · "+output(-e.delta)+" TWD"+(e.estimatedDate?" (ngày tạm tính, cần xác nhận)":"")});
  }
  const futureIncome=events.find(e=>e.kind==="income"&&e.date>=asOf);
  if(futureIncome){
    const days=diffDays(asOf,futureIncome.date);
    if(days<=7)alerts.push({code:"INCOME_SOON",severity:"info",date:futureIncome.date,
      title:"Nguồn thu dự kiến "+futureIncome.date,
      message:futureIncome.label+" · "+output(futureIncome.delta)+" TWD (chưa ghi nhận trong số dư hiện tại)."});
  }else if(events.some(e=>e.delta<0n)){
    alerts.push({code:"MISSING_INCOME",severity:"warning",date:null,
      title:"Chưa có ngày thu nhập trong khoảng dự báo",
      message:"Nhập khoản lương hoặc nguồn thu vào từng tháng kèm ngày cụ thể, nếu không hệ thống không thể tính kỳ xoay vòng."});
  }
  if(events.some(e=>e.estimatedDate)){
    alerts.push({code:"DATES_TO_CONFIRM",severity:"warning",date:null,
      title:"Có ngày thanh toán đang tạm tính",
      message:"Khoản không có ngày được đưa về cuối tháng. Hãy nhập ngày chính xác để tránh cảnh báo muộn."});
  }
  return {cycles,alerts,nextIncomeDate:futureIncome?.date||null,
    upcomingObligationCount:upcoming.length,asOf,through};
}
