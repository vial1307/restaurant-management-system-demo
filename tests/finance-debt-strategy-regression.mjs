import assert from "node:assert/strict";
import {calculateDebtStrategy} from "../vps/backend/src/finance-debt-strategy.mjs";
const projection={bufferTwd:"0",months:[
 {month:"2026-11",incomeTwd:"58000",costTwd:"30000",goalTwd:"0",minimumTwd:"5000",endingTwd:"35000"},
 {month:"2026-12",incomeTwd:"0",costTwd:"4000",goalTwd:"0",minimumTwd:"15000",endingTwd:"31000"},
 {month:"2027-01",incomeTwd:"0",costTwd:"3000",goalTwd:"0",minimumTwd:"26000",endingTwd:"28000"}
]};
const debts=[
 {id:"urgent",name:"Nợ đến hạn",currency_code:"TWD",annual_interest_rate:"0.03",due_date:"2026-11-30",outstanding_amount:"10000"},
 {id:"interest",name:"Nợ lãi cao",currency_code:"TWD",annual_interest_rate:"0.24",due_date:"2027-08-01",outstanding_amount:"20000"}
];
const funds=[{debt_id:"urgent",month_date:"2026-11-01",planned_twd:"4000"}];
const result=calculateDebtStrategy({projection,debts,funds});
assert.deepEqual(result.priority,["debt","expense","savings"]);
assert.equal(result.months.length,3);
assert.equal(result.months[0].scheduledDebtTwd,"4000");
assert.equal(result.months[0].proposedExtraDebtTwd,"5000");
assert.equal(result.months[0].proposedExtraAllocations[0].debtId,"urgent",
 "Earlier due debt must receive safe surplus before the more expensive later debt");
assert.equal(result.months[0].remainingDebts.find(x=>x.debtId==="urgent").remainingNative,"1000");
assert.equal(result.months[1].incomeTwd,"0","Cannot invent an unstated December salary");
assert.equal(result.months[1].proposedExtraAllocations[0].debtId,"urgent");
assert(result.months[1].proposedExtraAllocations.some(x=>x.debtId==="interest"));
assert(result.months[0].remainingDebts.find(x=>x.debtId==="urgent").monthlyInterestNativeEstimate,
 "Interest is displayed as informational cost, not auto-credited to principal");
const foreign=calculateDebtStrategy({projection,debts:[
 {id:"vn",name:"Thẻ tín dụng VND",currency_code:"VND",annual_interest_rate:"0.18",due_date:"2026-12-01",outstanding_amount:"22000000"}],
 funds:[{debt_id:"vn",month_date:"2026-11-01",planned_twd:"12500"}],
 quotes:{VND:{status:"fresh",rateToTwd:"0.00125"}}});
assert.equal(foreign.months[0].scheduledDebtTwd,"12500");
assert.equal(foreign.months[0].remainingDebts[0].currency,"VND");
assert(Number(foreign.months[0].remainingDebts[0].remainingNative)<22000000);
const unknown=calculateDebtStrategy({projection,debts:[
 {id:"vn",name:"Không có FX",currency_code:"VND",annual_interest_rate:"0",due_date:"2026-12-01",outstanding_amount:"22000000"}
]});
assert(unknown.notices.some(x=>x.includes("chưa có tỷ giá")));
assert.equal(unknown.months[0].remainingDebts.length,0);
const paid=calculateDebtStrategy({projection,debts:[debts[0]],funds, payments:[
 {debt_id:"urgent",payment_date:"2026-11-03",base_amount_twd:"1000"}
]});
assert.equal(paid.months[0].scheduledDebtTwd,"3000",
 "Do not count a posted debt payment again in the planning simulation");
console.log("PASS Finance debt priority plan, due dates, VND estimation, zero phantom wages and posted-payment exclusion");
