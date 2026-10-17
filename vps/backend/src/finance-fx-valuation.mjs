// Indicative Finance OS FX valuation (never an exchange or settlement).
// Fixed public endpoint, verified timestamp, finite rate and owner-only exposure.
// Provider: https://www.exchangerate-api.com/docs/free (attribution required).
const PROVIDER="exchangerate-api-open";
const ENDPOINT="https://open.er-api.com/v6/latest/TWD";
const MAX_AGE_MS=72*60*60*1000;
let lastAttemptMs=0;
let inFlight=null;
export const fxProvider={id:PROVIDER,attribution:"Rates By Exchange Rate API",url:"https://www.exchangerate-api.com",terms:"https://www.exchangerate-api.com/terms",refresh:"Khoảng một lần mỗi ngày; tỷ giá tham chiếu, không phải báo giá ngân hàng."};
export function rateToTwdFromTwdQuote(q){
 const n=Number(q);
 if(!Number.isFinite(n)||n<=0||n>1e12||n<1e-12)throw new Error("INVALID_FX_QUOTE");
 const v=1/n;
 if(!Number.isFinite(v)||v<=0||v>=1e12)throw new Error("INVALID_FX_QUOTE");
 const formatted=v.toFixed(12);
 if(!/^(?:0|[1-9]\d*)(?:\.\d{12})$/.test(formatted)||Number(formatted)<=0)throw new Error("FX_QUOTE_PRECISION");
 return formatted;
}
export function isRecentQuote(observedAt,nowMs=Date.now()){
 const at=Date.parse(observedAt);
 return Number.isFinite(at)&&at<=nowMs+5*60*1000&&at>=nowMs-MAX_AGE_MS;
}
export function convertToTwd(amount,rate,{decimals=0}={}){
 // Monetary amounts and rates are parsed as decimals; never use binary float for ledgers.
 const re=/^(?:0|[1-9]\d{0,15})(?:\.\d{1,12})?$/;
 if(typeof amount!=="string"||typeof rate!=="string"||!re.test(amount)||!re.test(rate)||
  !(Number(rate)>0)||![0,2].includes(decimals))throw new Error("INVALID_FX_CONVERSION");
 const fixed=(x,n)=>{
  const [w,f=""]=x.split(".");
  if(f.length>n)throw new Error("INVALID_FX_CONVERSION_PRECISION");
  return BigInt(w)*10n**BigInt(n)+BigInt((f+"0".repeat(n)).slice(0,n)||"0");
 };
 const a=fixed(amount,6),r=fixed(rate,12);
 // A hundredth of a TWD is still rounded to nearest whole TWD for planning.
 const product=a*r,div=10n**18n;
 const rounded=(product+div/2n)/div;
 if(rounded>9999999999999999n)throw new Error("FX_CONVERSION_OVERFLOW");
 return rounded.toString();
}
export async function getFinanceFxSnapshot(pool,{allowRemote=true,now=()=>Date.now(),fetcher=fetch}={}){
 const current=now();
 const {rows:enabled}=await pool.query("SELECT code,minor_units FROM finance.currencies WHERE enabled=true ORDER BY code");
 const codes=enabled.map(r=>r.code).filter(c=>/^[A-Z]{3}$/.test(c));
 const query=async()=>pool.query(
  "SELECT DISTINCT ON (base_currency) base_currency AS currency,rate::text,observed_at "+
  "FROM finance.fx_rates WHERE quote_currency='TWD' AND provider=$1 "+
  "ORDER BY base_currency,observed_at DESC",[PROVIDER]);
 let cached=(await query()).rows;
 const missing=codes.some(code=>code!=="TWD"&&
  !cached.some(row=>row.currency===code&&isRecentQuote(row.observed_at,current)));
 const due=cached.some(row=>current-Date.parse(row.observed_at)>26*60*60*1000);
 const remoteAllowed=process.env.FINANCE_FX_AUTO_REFRESH!=="false";
 if((missing||due)&&allowRemote&&remoteAllowed&&current-lastAttemptMs>=10*60*1000){
  if(!inFlight){
   lastAttemptMs=current;
   inFlight=(async()=>{
     const response=await fetcher(ENDPOINT,{headers:{accept:"application/json"},signal:AbortSignal.timeout(4000)});
     if(!response.ok)throw new Error("FX_PROVIDER_UNAVAILABLE");
     const payload=await response.json();
     if(payload?.result!=="success"||payload?.base_code!=="TWD"||!payload.rates||typeof payload.rates!=="object")
       throw new Error("FX_PROVIDER_INVALID");
     const at=Number(payload.time_last_update_unix)*1000;
     if(!Number.isFinite(at)||at>current+5*60*1000||at<current-MAX_AGE_MS)
       throw new Error("FX_PROVIDER_STALE");
     const datetime=new Date(at).toISOString(),records=[];
     for(const code of codes){
       if(code==="TWD")continue;
       try{records.push({code,rate:rateToTwdFromTwdQuote(payload.rates[code])});}catch{}
     }
     for(const item of records){
       await pool.query(
        "INSERT INTO finance.fx_rates(base_currency,quote_currency,rate,provider,observed_at) "+
        "VALUES($1,'TWD',$2::numeric,$3,$4::timestamptz) ON CONFLICT(base_currency,quote_currency,provider,observed_at) DO NOTHING",
        [item.code,item.rate,PROVIDER,datetime]);
     }
   })().finally(()=>{inFlight=null;});
  }
  try{await inFlight;}catch{/* Strict DB-only fallback; never invent a rate. */}
  cached=(await query()).rows;
 }
 const byCode=new Map(cached.map(row=>[row.currency,row]));
 const quotes={TWD:{rateToTwd:"1",status:"base",observedAt:null,provider:"native"}};
 for(const code of codes){
  if(code==="TWD")continue;
  const row=byCode.get(code),fresh=row&&isRecentQuote(row.observed_at,current);
  quotes[code]={rateToTwd:fresh?String(row.rate):null,status:fresh?"fresh":row?"stale":"unavailable",
   observedAt:row?new Date(row.observed_at).toISOString():null,provider:PROVIDER};
 }
 return {baseCurrency:"TWD",quotes,source:fxProvider,
  readOnlyValuation:true,automaticCurrencyExchange:false,
  warnings:Object.values(quotes).some(q=>q.status==="stale"||q.status==="unavailable")?
   ["Có ngoại tệ thiếu tỷ giá mới; không tự đoán số tiền quy đổi."] : []};
}
