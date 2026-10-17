import {convertToTwd} from "./finance-fx-valuation.mjs";

// Runtime pricing for editable debt/goal allocations. Posted repayments are
// immutable historical facts; their actual settlement FX must NEVER be repriced.
export function priceFinanceFund(row,snapshot){
 const currency=row.currency_code||"TWD";
 const quoted=snapshot?.quotes?.[currency];
 const rate=currency==="TWD"?"1":
  quoted?.status==="fresh"&&quoted.rateToTwd?String(quoted.rateToTwd):null;
 const originalRate=row.fx_rate_to_twd==null?null:String(row.fx_rate_to_twd);
 const base={...row,stored_fx_rate_to_twd:originalRate,
  fx_rate_to_twd:rate,fx_status:currency==="TWD"?"base":rate?"fresh":"unavailable",
  fx_observed_at:currency==="TWD"?null:quoted?.observedAt||null,
  fx_provider:currency==="TWD"?"native":quoted?.provider||null,
  fx_revalued:rate!==null&&originalRate!==null&&
     Math.abs(Number(rate)-Number(originalRate))>Math.abs(Number(rate))*0.000001};
 if(!rate)return {...base,planned_twd:null,earmarked_twd:null};
 const normalized=v=>String(v??"0").replace(/(\.\d*?)0+$/,"$1").replace(/\.$/,"");
 try{
  const planned=normalized(row.planned_amount),earmarked=normalized(row.earmarked_amount??"0");
  return {...base,planned_twd:convertToTwd(planned,rate),earmarked_twd:convertToTwd(earmarked,rate)};
 }catch{
  return {...base,planned_twd:null,earmarked_twd:null,fx_status:"invalid"};
 }
}
export function summarizeFinanceFundValues(rows,field){
 const total=rows.reduce((n,row)=>n+BigInt(row[field]??"0"),0n);
 return total.toString();
}
export function missingFinanceFundQuotes(...groups){
 return groups.flat().filter(r=>r.planned_twd===null).map(r=>({
  currency:r.currency_code||"TWD",name:r.debt_name||r.goal_name||"",
  reason:"FX_RATE_UNAVAILABLE"
 }));
}
