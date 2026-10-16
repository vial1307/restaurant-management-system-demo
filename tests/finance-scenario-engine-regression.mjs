import assert from "node:assert/strict";
import {units,plain,sourceEvents,simulateScenario,validateScenario} from "../vps/backend/src/finance-scenario-engine.mjs";
assert.equal(plain(units("123.000005")),"123.000005");
const defaults={name:"Scenario",months:3,salaryDay:10,bufferTwd:"0",monthlyExtraIncomeTwd:"0",rows:[],goal:null};
const from="2026-10-17";
const base={startingBalanceTwd:"2000",events:[
 {date:"2026-11-05",kind:"debt",amountTwd:"-6000",label:"Debt due",source:"debt_fund"},
 {date:"2026-11-10",kind:"income",amountTwd:"30000",label:"Payday",source:"cashflow"},
 {date:"2026-11-11",kind:"expense",amountTwd:"-5000",label:"Food",source:"cashflow"}
],warnings:[],debtTwdPrincipal:"10000",debtRanking:[{name:"High interest",rate:"0.3"}]};
const short=simulateScenario({asOf:from,source:base,scenario:defaults});
assert.equal(short.earliestRisk.date,"2026-11-05");
assert.equal(short.earliestRisk.gapTwd,"4000");
assert.equal(short.minimumAdditionalIncomePerPaydayTwd,null,
 "Future salary cannot repair a shortfall before the payday");
assert.equal(short.months.length,3);
assert.equal(short.months[0].endingTwd,"2000","Months with no events carry live opening balance");
assert.equal(short.months[1].endingTwd,"21000");
assert.equal(short.months[2].endingTwd,"21000","Non-event months must carry previous closing balance");
const withBridge={...defaults,rows:[
 {kind:"borrow",linkId:"bridge-a",date:"2026-11-04",amountTwd:"4500",label:"Temporary lender"},
 {kind:"repay",linkId:"bridge-a",date:"2026-11-12",amountTwd:"4700",label:"Repay loan"}
]};
const bridged=simulateScenario({asOf:from,source:base,scenario:withBridge});
assert.equal(bridged.earliestRisk,null,"Paired short loan bridges early due without changing actual ledger");
assert.equal(bridged.loans[0].financingCostTwd,"200");
assert.equal(bridged.endingTwd,"20800");
assert.throws(()=>validateScenario({...withBridge,rows:[withBridge.rows[0]]}),/LOAN_REPAYMENT_PAIR_REQUIRED/);
assert.throws(()=>validateScenario({...withBridge,rows:[
 withBridge.rows[0],{...withBridge.rows[1],date:"2026-11-03"}]}),/INVALID_LOAN_REPAYMENT/);
assert.throws(()=>validateScenario({...defaults,rows:[{kind:"expense",label:"bad",date:"2026-11-01",amountTwd:"-3"}]}),
 /INVALID_SCENARIO_AMOUNT/);
const simple={startingBalanceTwd:"0",warnings:[],debtTwdPrincipal:"0",debtRanking:[],
 events:[
  {date:"2026-11-12",kind:"expense",amountTwd:"-5000",label:"Rent"},
  {date:"2026-12-12",kind:"expense",amountTwd:"-5000",label:"Rent"}]};
const required=simulateScenario({asOf:from,source:simple,scenario:defaults});
assert.equal(required.minimumAdditionalIncomePerPaydayTwd,"5000",
 "Required income is calculated from exact dates, not a monthly net average");
const withGoal=simulateScenario({asOf:from,source:{...simple,events:[]},scenario:{
 ...defaults,monthlyExtraIncomeTwd:"10000",
 goal:{label:"Travel",totalTwd:"9000",targetDate:"2026-12-31"}
}});
assert.equal(withGoal.timeline.filter(x=>x.source==="scenario_goal").length,2,
 "Goal is split over real upcoming salary dates before the deadline, not fabricated past payday");
assert.equal(withGoal.timeline.filter(x=>x.source==="scenario_goal").reduce((sum,x)=>sum+Math.abs(Number(x.amountTwd)),0),9000);
const foreign=sourceEvents({asOf:"2026-10-17",through:"2026-11-30",accounts:[
 {currency_code:"TWD",balance:"8500"},{currency_code:"VND",balance:"5000000"}
],cashItems:[{month_date:"2026-11-01",due_day:5,kind:"expense",label:"Rent",amount_twd:"6000"}],
 debts:[{id:"d1",currency_code:"VND",name:"VND credit card",outstanding_amount:"10000000"}]});
assert.equal(foreign.startingBalanceTwd,"8500");
assert.equal(foreign.debtTwdPrincipal,"0");
assert.equal(foreign.events[0].date,"2026-11-05");
assert(foreign.warnings.some(x=>x.includes("ngoại tệ")));
console.log("PASS scenario due-before-payday, safe bridge, loan cost, goal funding, required income, no invented FX and empty-month carry");
