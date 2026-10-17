import {buildCycleAlerts} from "../vps/backend/src/finance-paycycle-alerts.mjs";
import assert from "node:assert/strict";
import {calculateFinanceAdvice,twdUnits,twdText,addDays} from "../vps/backend/src/finance-advisor-engine.mjs";

assert.equal(twdText(twdUnits("1234.000005")),"1234.000005");
assert.equal(twdText(twdUnits("-0.000001")),"-0.000001");
assert.equal(addDays("2026-12-31",1),"2027-01-01");
assert.throws(()=>twdUnits("1.0000001"),/INVALID_TWD_AMOUNT/);

const input={
  asOf:"2026-10-17",days:30,bufferTwd:"5000",
  wallets:[{name:"TWD Bank",currency_code:"TWD",balance:"10000"},
    {name:"TWD Cash",currency_code:"TWD",balance:"0"},
    {name:"VN account",currency_code:"VND",balance:"2000000"}],
  cashItems:[
    {id:"rent",month_date:"2026-10-01",kind:"expense",label:"Past expense needs review",amount_twd:"500",due_day:1},
    {id:"food",month_date:"2026-10-01",kind:"expense",label:"Chi tiêu",amount_twd:"5000",due_day:19},
    {id:"salary",month_date:"2026-10-01",kind:"income",label:"Lương",amount_twd:"15000",due_day:20},
    {id:"weekend",month_date:"2026-10-01",kind:"expense",label:"Chưa rõ ngày",amount_twd:"1000",due_day:null},
    {id:"nov",month_date:"2026-11-01",kind:"income",label:"Lương 11",amount_twd:"12000",due_day:5},
    {id:"nov-rent",month_date:"2026-11-01",kind:"expense",label:"Nhà",amount_twd:"11000",due_day:10}
  ],
  debtFunds:[{id:"d1",debt_id:"debt",month_date:"2026-10-01",debt_name:"Thẻ tín dụng",due_date:"2026-10-25",planned_twd:"4000"}],
  goalFunds:[{id:"g1",goal_id:"goal",month_date:"2026-10-01",goal_name:"Học phí",target_date:"2026-10-28",planned_twd:"2000"}],
  debtPayments:[{debt_id:"debt",payment_date:"2026-10-11",base_amount_twd:"1000"}],
  fxPlans:[
    {id:"fx1",status:"planned",plan_kind:"remittance",plan_date:"2026-10-22",from_currency:"TWD",to_currency:"VND",source_amount:"3000",expected_fee:"100"},
    {id:"fx2",status:"planned",plan_kind:"fx",plan_date:"2026-10-22",from_currency:"TWD",to_currency:"VND",source_amount:"8000",expected_fee:"100"},
    {id:"fx3",status:"planned",plan_kind:"remittance",plan_date:"2026-10-22",from_currency:"VND",to_currency:"TWD",source_amount:"1000000",expected_fee:"5000"}
  ],
  goals:[{id:"goal",name:"Học phí",status:"active"},{id:"missing",name:"Quỹ dự phòng",status:"active"}],
  debts:[{id:"debt",name:"Thẻ tín dụng",outstanding_amount:"10000"},{id:"unallocated",name:"Nợ khác",outstanding_amount:"1000"}]
};
const plan=calculateFinanceAdvice(input);
assert.equal(plan.startingBalanceTwd,"10000");
assert.equal(plan.totals.income,"27000");
assert.equal(plan.totals.expense,"17000");
assert.equal(plan.totals.debt,"3000","Posted 1000 debt payment must not be planned twice");
assert.equal(plan.totals.goal,"2000");
assert.equal(plan.totals.remittance,"3100","External TWD transfer includes fee; internal FX excluded");
assert.equal(plan.totalOutflowTwd,"25100");
assert.equal(plan.projectedEndingTwd,"11900");
assert.equal(plan.minimumBalanceTwd,"5000");
assert.equal(plan.earliestRisk,null);
assert.equal(plan.entries.some(e=>e.label==="Past expense needs review"),false);
assert.equal(plan.entries.find(e=>e.label==="Chưa rõ ngày").date,"2026-10-31");
assert.equal(plan.entries.find(e=>e.label==="Chưa rõ ngày").estimatedDate,true);
assert.equal(plan.entries.filter(e=>e.source==="debt_fund").length,1);
assert.equal(plan.foreignWallets.length,1);
assert.equal(plan.excludedFxPlans.length,1);
assert(plan.warnings.some(w=>w.code==="FOREIGN_WALLETS_EXCLUDED"));
assert(plan.warnings.some(w=>w.code==="PAST_DUE_UNRECONCILED"));
assert(plan.warnings.some(w=>w.code==="UNALLOCATED_GOALS"));
assert(plan.warnings.some(w=>w.code==="UNALLOCATED_DEBTS"));

const risk=calculateFinanceAdvice({...input,bufferTwd:"15000"});
assert.equal(risk.earliestRisk.date,"2026-10-17","Opening balance shortfall takes precedence over later dates");
assert.equal(risk.earliestRisk.gapTwd,"5000");
assert(risk.recommendations.some(x=>x.kind==="timing"));
const short=calculateFinanceAdvice({...input,bufferTwd:"0",wallets:[{name:"TWD",currency_code:"TWD",balance:"5000"}],
 cashItems:[],debtPayments:[],goalFunds:[],fxPlans:[],debtFunds:[{id:"d",debt_id:"debt",
 month_date:"2026-10-01",debt_name:"Nợ",due_date:"2026-10-20",planned_twd:"9000"}]});
assert.equal(short.earliestRisk.date,"2026-10-20");
assert.equal(short.earliestRisk.gapTwd,"4000");
assert.equal(short.minimumBalanceTwd,"-4000");
assert.equal(short.projectedEndingTwd,"-4000");
const sameDay=calculateFinanceAdvice({...input,wallets:[{name:"TWD",currency_code:"TWD",balance:"0"}],
 cashItems:[{month_date:"2026-10-01",kind:"expense",label:"Chi",amount_twd:"100",due_day:20},
 {month_date:"2026-10-01",kind:"income",label:"Thu",amount_twd:"200",due_day:20}],
 debtFunds:[],goalFunds:[],debtPayments:[],fxPlans:[],goals:[],debts:[]});
assert.deepEqual(sameDay.entries.map(e=>e.kind),["income","expense"]);
assert.equal(sameDay.projectedEndingTwd,"100");
assert.equal(calculateFinanceAdvice({...input,days:365}).days,365,"Future selected month needs full 12-month forecast");
assert.throws(()=>calculateFinanceAdvice({...input,days:366}),/INVALID_ADVISOR_RANGE/);
// Salary on the 10th must not cover expenses due on the 5th.
const cycleResult=buildCycleAlerts({
 asOf:"2026-10-17",through:"2026-11-15",startingBalanceTwd:"10000",bufferTwd:"2000",
 entries:[
  {date:"2026-10-20",kind:"expense",label:"Living costs",amountTwd:"-8000"},
  {date:"2026-11-05",kind:"expense",label:"Rent due before salary",amountTwd:"-6000"},
  {date:"2026-11-10",kind:"income",label:"Salary",amountTwd:"30000"},
  {date:"2026-11-13",kind:"debt",label:"Debt payment",amountTwd:"-5000"}
 ]
});
assert.equal(cycleResult.cycles.length,2,"A salary creates a new planning interval");
assert.equal(cycleResult.cycles[0].endDate,"2026-11-09");
assert.equal(cycleResult.cycles[0].reserveGapTwd,"6000","Pre-payday obligations must show the necessary liquidity bridge");
assert.equal(cycleResult.cycles[1].incomeTwd,"30000");
assert.equal(cycleResult.cycles[1].reserveGapTwd,"0","Past shortage must not taint the next funded cycle");
assert(cycleResult.alerts.some(x=>x.code==="LIQUIDITY_GAP"));
const nearDue=buildCycleAlerts({
 asOf:"2026-11-03",through:"2026-11-20",startingBalanceTwd:"7000",bufferTwd:"0",
 entries:[{date:"2026-11-05",kind:"debt",label:"Payment",amountTwd:"-3000"},
  {date:"2026-11-10",kind:"income",label:"Salary",amountTwd:"10000"}]
});
assert.equal(nearDue.alerts.find(x=>x.code==="DUE_SOON")?.date,"2026-11-05");
assert.equal(nearDue.alerts.find(x=>x.code==="INCOME_SOON")?.date,"2026-11-10");
assert.equal(plan.cycles.length>=1,true);
assert(Array.isArray(plan.alerts));

console.log("PASS forecast micro-TWD precision, 30-day rolling dates, overdue reconciliation, FX isolation, actual debt paid and risk recommendation");
