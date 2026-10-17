import assert from "node:assert/strict";
import {buildDebtRepaymentAdvice} from "../vps/backend/src/finance-debt-repayment-advisor.mjs";
const projection={
 months:[
 {month:"2026-11",incomeTwd:"58000",costTwd:"38000",goalTwd:"5000",repaymentTwd:"0",endingTwd:"29000"},
 {month:"2026-12",incomeTwd:"62000",costTwd:"36000",goalTwd:"5000",repaymentTwd:"0",endingTwd:"50000"}
 ],
 timeline:[
 {date:"2026-11-03",kind:"income",amountTwd:"58000",balanceTwd:"68000"},
 {date:"2026-11-10",kind:"expense",amountTwd:"-38000",balanceTwd:"30000"},
 {date:"2026-11-15",kind:"debt",amountTwd:"-8000",balanceTwd:"22000"},
 {date:"2026-11-30",kind:"goal",amountTwd:"-5000",balanceTwd:"29000"},
 {date:"2026-12-10",kind:"income",amountTwd:"62000",balanceTwd:"91000"},
 {date:"2026-12-15",kind:"expense",amountTwd:"-36000",balanceTwd:"55000"},
 {date:"2026-12-30",kind:"goal",amountTwd:"-5000",balanceTwd:"50000"}
 ]
};
const debts=[
 {id:"a",name:"Thẻ tín dụng",currency_code:"VND",outstanding_amount:"22000000",annual_interest_rate:"0.18",due_date:"2026-11-15"},
 {id:"b",name:"Vay khác",currency_code:"TWD",outstanding_amount:"14000",annual_interest_rate:"0",due_date:"2027-01-01"}
];
const funds=[{debt_id:"a",month_date:"2026-11-01",planned_twd:"8000"}];
const quotes={VND:{status:"fresh",rateToTwd:"0.00125"}};
const result=buildDebtRepaymentAdvice({projection,debts,debtFunds:funds,quotes,cashBufferTwd:10000});
assert.deepEqual(result.priority,["debt","expense","goal"]);
assert.equal(result.months.length,2);
assert.equal(Number(result.months[0].scheduledDebtTwd),8000);
assert(Number(result.months[0].suggestedAdditionalDebtTwd)>=0);
assert.equal(result.months[0].details[0].name,"Thẻ tín dụng");
assert(Number(result.months[0].details[0].remainingPrincipalEstimateTwd)<22000000*0.00125,
 "Future recommended repayments reduce only estimated principal");
assert(Number(result.months[0].projectedAfterSuggestionsTwd)>=10000,
 "Never allocate more than future minimum balance above buffer");
assert.equal(result.months[1].incomeTwd,"62000");
assert.equal(result.unconvertedDebts.length,0);
assert(result.estimatedInterestTotalTwd!=="0","Estimate APR/12 interest separately");
const missing=buildDebtRepaymentAdvice({projection,debts,debtFunds:funds,quotes:{},cashBufferTwd:10000});
assert.equal(missing.unconvertedDebts.length,1);
assert.equal(missing.debtBalances.length,1,"Never silently invent a TWD value for VND debt");
const noPayday=buildDebtRepaymentAdvice({
 projection:{months:[{month:"2026-12",incomeTwd:"0",endingTwd:"15000"}],timeline:[]},
 debts,debtFunds:[],quotes,cashBufferTwd:5000
});
assert.equal(Number(noPayday.months[0].suggestedAdditionalDebtTwd),0,
 "Do not hallucinate next-month salary or use unreceived income to repay.");
assert(noPayday.warnings.some(x=>x.includes("chưa có lịch nhận thu nhập")));
assert.equal(debts[0].outstanding_amount,"22000000","Planning must never mutate the input actual debts");
console.log("PASS priority debt > expense > savings, FX safeguards, payday/date-constrained repayment, missing future income and ledger isolation");
