import assert from "node:assert/strict";
import {getFinanceFxSnapshot,rateToTwdFromTwdQuote,convertToTwd,isRecentQuote} from "../vps/backend/src/finance-fx-valuation.mjs";
assert.equal(convertToTwd("1000000","0.001250000000"),"1250");
assert.equal(convertToTwd("1000000","0.001250500000"),"1251");
assert.equal(convertToTwd("1000","31.500000000000"),"31500");
assert.equal(convertToTwd("0.01","31.500000000000"),"0");
assert.throws(()=>convertToTwd("100","Infinity"));
assert.throws(()=>convertToTwd("-1","31"));
assert.throws(()=>rateToTwdFromTwdQuote(-1));
assert.equal(rateToTwdFromTwdQuote(800),"0.001250000000");
const observed="2026-10-17T01:00:00.000Z",now=Date.parse("2026-10-17T02:00:00Z");
assert(isRecentQuote(observed,now));
assert(!isRecentQuote("2026-09-28T00:00:00Z",now));
const currencies=[{code:"TWD",minor_units:0},{code:"VND",minor_units:0},{code:"USD",minor_units:2}];
let quotes=[],calls=0;
const pool={async query(sql,args=[]){
 if(sql.includes("FROM finance.currencies"))return {rows:currencies};
 if(sql.includes("FROM finance.fx_rates"))return {rows:[...quotes].map(x=>({...x}))};
 if(sql.includes("INSERT INTO finance.fx_rates")){
  quotes=quotes.filter(x=>x.currency!==args[0]);
  quotes.push({currency:args[0],rate:args[1],observed_at:args[3]});return {rows:[]};
 }
 throw Error("UNEXPECTED_SQL");
}};
const fetcher=async(url)=>{calls++;assert.equal(url,"https://open.er-api.com/v6/latest/TWD");return {ok:true,json:async()=>({
 result:"success",base_code:"TWD",time_last_update_unix:Math.floor(now/1000),
 rates:{TWD:1,VND:800,USD:0.032}
})}};
const fresh=await getFinanceFxSnapshot(pool,{fetcher,now:()=>now});
assert.equal(fresh.quotes.VND.rateToTwd,"0.001250000000");
assert.equal(fresh.quotes.USD.status,"fresh");
assert.equal(fresh.quotes.TWD.rateToTwd,"1");
assert.equal(fresh.automaticCurrencyExchange,false);
assert.equal(calls,1);
const cached=await getFinanceFxSnapshot(pool,{fetcher,now:()=>now});
assert.equal(calls,1,"Read from private DB snapshot rather than fetching on every browser call");
assert.equal(cached.quotes.VND.rateToTwd,"0.001250000000");
const stale=await getFinanceFxSnapshot(pool,{allowRemote:false,now:()=>now+7*86400000});
assert.equal(stale.quotes.VND.rateToTwd,null,"Stale quote cannot be shown as an actionable estimate");
assert.equal(stale.quotes.VND.status,"stale");
assert(stale.warnings.length);
console.log("PASS exact indicative FX, cached TWD quotes, provenance, stale fail-closed and no automatic exchange");
