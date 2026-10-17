import assert from "node:assert/strict";
import {planDebtPayoff} from "../vps/backend/src/finance-debt-payoff-engine.mjs";
const asOf="2026-10-18";
const baseline={startingBalanceTwd:"30000",months:[
 {month:"2026-10",incomeTwd:"58000",costTwd:"25000",goalTwd:"4000",repaymentTwd:"12500",minimumTwd:"32000",endingTwd:"46500"},
 {month:"2026-11",incomeTwd:"60000",costTwd:"28000",goalTwd:"4000",repaymentTwd:"10000",minimumTwd:"39000",endingTwd:"64500"},
 {month:"2026-12",incomeTwd:"45000",costTwd:"35000",goalTwd:"5000",repaymentTwd:"8000",minimumTwd:"25000",endingTwd:"61500"}
]};
const debts=[
 {id:"card",name:"Thẻ tín dụng",currency_code:"VND",outstanding_amount:"22000000",annual_interest_rate:"0.12",due_date:"2026-11-03"},
 {id:"loan",name:"Vay bạn",currency_code:"TWD",outstanding_amount:"20000",annual_interest_rate:"0.06",due_date:"2026-12-10"}
];
const funds=[{debt_id:"card",month_date:"2026-10-01",planned_amount:"10000000"},
 {debt_id:"loan",month_date:"2026-11-01",planned_amount:"4000"}];
const quotes={VND:{status:"fresh",rateToTwd:"0.001250000000"}};
const a=planDebtPayoff({asOf,baseline,debts,funds,quotes,bufferTwd:"20000"});
assert.equal(a.months.length,3);
assert.equal(a.priority.join(","),"debt,essential_expense,saving");
assert.equal(a.months[0].plannedPayments[0].amountNative,"10000000");
assert(a.suggestions.length>0);
assert.equal(a.suggestions[0].name,"Thẻ tín dụng","Earlier due date ranks above later debt");
assert(a.suggestions.every(x=>Number(x.extraTwd)>0));
assert(a.months.every(m=>Number(m.endingAfterSuggestionsTwd)>=20000),"No optional extra below reserve");
assert(a.months[0].suggestedExtraTwd===String(5000),"Future minimum should constrain the first allocation");
const readOnly=structuredClone(debts);
const stale=planDebtPayoff({asOf,baseline,debts,funds,quotes:{VND:{status:"stale",rateToTwd:"0.00125"}},bufferTwd:"20000"});
assert(stale.warnings.some(x=>x.includes("Thiếu tỷ giá VND")));
assert(stale.remaining.find(x=>x.debtId==="card").missingRate);
assert.deepEqual(debts,readOnly,"Projection never changes persisted debt objects");
const risk=planDebtPayoff({asOf,baseline:{...baseline,months:[
 {...baseline.months[0],minimumTwd:"-12000",endingTwd:"3000"},baseline.months[1]]},debts,funds,quotes,bufferTwd:"5000"});
assert.equal(risk.months[0].suggestions.length,0,"Never recommend an extra debt payment before the known near-term cash shortfall");
assert(risk.suggestions.every(x=>x.month!=="2026-10"),"Later recovered months may independently fund debt");
assert(risk.warnings.some(x=>x.includes("thiếu tiền")));
const paid=planDebtPayoff({
 asOf,baseline,debts:[{...debts[0],outstanding_amount:"20000000",annual_interest_rate:"0"}],
 funds:[funds[0]],payments:[{debt_id:"card",payment_date:"2026-10-20",native_paid:"2000000"}],
 quotes,bufferTwd:"100000000"
});
assert.equal(paid.months[0].plannedPayments[0].amountNative,"8000000",
 "Already posted 2m VND must reduce the remaining planned 10m VND reserve");
assert.equal(paid.remaining[0].remainingNative,"12000000",
 "Recorded payment already reduced original debt principal; never subtract twice");
console.log("PASS debt priority, monthly roll-forward, interest, pre-funded debt, stale FX, no double counting and protected cash floor");
