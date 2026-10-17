// Pure, deterministic funding analysis: "priced in TWD" does not mean "already exchanged".
// Uses the stored planning FX quote and explicit funding mode; never posts a bank transfer.
const M=1000000n;
const amount=v=>{
 const s=String(v??"0");
 if(!/^-?(?:0|[1-9]\d{0,17})(?:\.\d{1,6})?$/.test(s))throw new Error("INVALID_FUNDING_AMOUNT");
 const neg=s.startsWith("-"),[w,f=""]=(neg?s.slice(1):s).split(".");
 const n=BigInt(w)*M+BigInt((f+"000000").slice(0,6));
 return neg?-n:n;
};
const out=n=>String(n<0n?"-":"")+String((n<0n?-n:n)/M)+
 ((n<0n?-n:n)%M===0n?"":"."+String((n<0n?-n:n)%M).padStart(6,"0").replace(/0+$/,""));
const monthOf=item=>String(item.month_date||item.month||"").slice(0,7);
const lastDay=m=>new Date(Date.UTC(Number(m.slice(0,4)),Number(m.slice(5,7)),0)).getUTCDate();
const due=(m,day)=>{
 const max=lastDay(m),n=Number(day);
 const estimated=day==null||day===""||!Number.isInteger(n)||n<1||n>max;
 return {date:m+"-"+String(estimated&&!day?max:Math.min(Math.max(n,1),max)).padStart(2,"0"),estimatedDate:estimated};
};
const modeOf=i=>String(i.funding_mode||((i.original_currency||"TWD")==="TWD"?
 "twd_wallet":i.kind==="expense"?"twd_pending_fx":"foreign_wallet"));
export function summarizeForeignFunding({asOf,through,items=[],wallets=[]}){
 const events=[],warnings=[],fundingRequirements=[],foreignShortfalls=[];
 const walletsById=new Map(wallets.map(a=>[a.id,a]));
 const balanceByCurrency=new Map();
 for(const w of wallets){
  if(w.currency_code==="TWD")continue;
  balanceByCurrency.set(w.currency_code,(balanceByCurrency.get(w.currency_code)||0n)+amount(w.balance));
 }
 const balanceByWallet=new Map(wallets.filter(w=>w.currency_code!=="TWD").map(w=>[w.id,amount(w.balance)]));
 const foreignEvents=[];
 for(const row of items){
  const month=monthOf(row);if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))continue;
  const originalCurrency=row.original_currency||"TWD",mode=modeOf(row),nominal=amount(row.amount_twd);
  const d=due(month,row.due_day);
  if(d.date<asOf||d.date>through)continue;
  if(originalCurrency==="TWD"){
   events.push({date:d.date,kind:row.kind,label:row.label,amountTwd:out((row.kind==="income"?1n:-1n)*nominal),
    source:"cashflow",estimatedDate:d.estimatedDate});
   continue;
  }
  if(row.kind==="income"){
   foreignEvents.push({...row,date:d.date,mode,kind:"income",native:amount(row.original_amount)});
   warnings.push("Thu nhập "+originalCurrency+" '"+row.label+"' chưa được đổi ra TWD, không tính thành TWD có thể chi.");
   continue;
  }
  if(mode==="twd_pending_fx"){
   const fee=amount(row.fx_fee_twd||"0"),conversion=due(month,row.conversion_day??row.due_day);
   const overdue=conversion.date<asOf;
   const date=overdue?asOf:conversion.date;
   events.push({date,kind:"expense",label:"Cần đổi TWD → "+originalCurrency+" để trả: "+row.label,
    amountTwd:out(-(nominal+fee)),source:"pending_fx",estimatedDate:conversion.estimatedDate});
   fundingRequirements.push({id:row.id||null,label:row.label,currency:originalCurrency,
    nativeAmount:String(row.original_amount),twdRequired:out(nominal+fee),
    exchangeDate:date,paymentDate:d.date,feeTwd:out(fee),status:"not_exchanged"});
   if(overdue)warnings.push("Đã qua ngày dự định đổi tiền cho '"+row.label+"' nhưng khoản chi chưa đến hạn: cần kiểm tra đổi ngay, không xem như đã đổi.");
   if(fee===0n)warnings.push("Phí đổi/chuyển tiền cho '"+row.label+"' đang là 0 theo kế hoạch; kiểm tra biểu phí thực tế.");
   continue;
  }
  foreignEvents.push({...row,date:d.date,mode:"foreign_wallet",kind:"expense",native:amount(row.original_amount)});
 }
 // Project foreign wallet coverage separately, in native minor units. Foreign balances
 // never become TWD cash and no simulated FX transfer credits them automatically.
 foreignEvents.sort((a,b)=>a.date.localeCompare(b.date)||
  (a.kind==="income"&&b.kind!=="income"?-1:a.kind!=="income"&&b.kind==="income"?1:0));
 for(const row of foreignEvents){
  const code=row.original_currency;
  const selected=row.funding_account_id&&walletsById.get(row.funding_account_id)?.currency_code===code?
    row.funding_account_id:null;
  // Selected wallet only, or currency total for legacy data with no source wallet.
  const pool=selected?balanceByWallet:balanceByCurrency,key=selected||code;
  const old=pool.get(key)||0n,delta=row.kind==="income"?row.native:-row.native;
  pool.set(key,old+delta);
  if(selected){
   balanceByCurrency.set(code,(balanceByCurrency.get(code)||0n)+delta);
  }else{
   // Preserve fallback pool on old rows. A selected-wallet allocation is accounted
   // inside currency total above and MUST NOT create the amount twice.
   if(row.kind==="income"&&row.funding_account_id&&!selected)
     warnings.push("Thu nhập ngoại tệ '"+row.label+"' tham chiếu ví không hợp lệ; đang tính gộp theo đồng tiền.");
  }
  if(row.kind==="expense"&&old+delta<0n){
   const missing=-(old+delta);
   foreignShortfalls.push({label:row.label,currency:code,date:row.date,missingNative:out(missing),
    fundingAccountId:selected});
   warnings.push("Ví "+code+" không đủ để thanh toán '"+row.label+"' ngày "+row.date+
     ": còn thiếu "+out(missing)+" "+code+". Chọn nguồn TWD cần đổi hoặc bổ sung nguồn ngoại tệ có thật.");
  }
 }
 return {events,warnings:[...new Set(warnings)],fundingRequirements,foreignShortfalls};
}
export const plannedTwdOutflow=(r)=>{
 const code=r.original_currency||"TWD",mode=modeOf(r);
 if(r.kind==="income")return code==="TWD"?String(r.amount_twd):"0";
 if(code!=="TWD"&&mode!=="twd_pending_fx")return "0";
 return out(amount(r.amount_twd)+(code==="TWD"?0n:amount(r.fx_fee_twd||"0")));
};
