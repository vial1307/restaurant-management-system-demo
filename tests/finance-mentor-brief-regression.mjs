import assert from "node:assert/strict";
import {buildFinanceMentorBrief} from "../vps/backend/src/finance-mentor-brief.mjs";

const forecast={
 asOf:"2026-11-27",through:"2027-02-24",days:90,bufferTwd:"3000",
 startingBalanceTwd:"12000",projectedEndingTwd:"60000",minimumBalanceTwd:"2000",
 minimumDate:"2026-11-30",earliestRisk:{date:"2026-11-30",gapTwd:"1000"},
 warnings:[],entries:[
 {date:"2026-11-28",kind:"expense",label:"Tiền nhà",amountTwd:"-6000",source:"cashflow"},
 {date:"2026-11-30",kind:"debt",label:"Thanh toán thẻ",amountTwd:"-4000",source:"debt_fund",sourceId:"card"},
 {date:"2026-12-03",kind:"income",label:"Lương",amountTwd:"58000",source:"cashflow"}
 ]
};
const debt=(id,rest={})=>({id,name:id,currency_code:"TWD",outstanding_amount:"20000",
 creditor_type:"friend_family",obligation_type:"fixed",negotiation_status:"none",
 due_date:"2026-12-02",minimum_due_amount:"12000",...rest});

const result=buildFinanceMentorBrief({forecast,debts:[
 debt("friend"),
 debt("card",{creditor_type:"credit_card",due_date:"2026-11-30",minimum_due_amount:"4000"}),
 debt("requested",{negotiation_status:"requested",obligation_type:"agreed_flexible"}),
 debt("uncertain",{obligation_type:"unconfirmed",due_date:null,minimum_due_amount:null}),
 debt("foreign",{currency_code:"VND",minimum_due_amount:"2000000"}),
 debt("settled",{outstanding_amount:"0"})
]});
assert.equal(result.aiGenerated,false);
assert.equal(result.readOnly,true);
assert.equal(result.nextIncome.date,"2026-12-03");
assert.equal(result.minBeforeNextIncomeTwd,"2000");
assert.equal(result.shortageToReserveBeforeNextIncomeTwd,"1000");
assert.equal(result.conservativeUnfundedRiskBeforeIncomeTwd,"13000",
 "12000 friend commitment plus 1000 reserve gap must be shown before next salary");
assert.equal(result.uncovered.find(x=>x.id==="friend").uncoveredBeforeDueTwd,"12000");
assert.equal(result.obligations.find(x=>x.id==="card").allocatedBeforeDueTwd,"4000");
assert(!result.uncovered.some(x=>x.id==="card"),"No double-counting card with planned debt fund");
assert(result.needsConfirmation.some(x=>x.id==="requested"),
 "Requested reschedule does not become a confirmed promise");
assert(result.needsConfirmation.some(x=>x.id==="uncertain"));
assert(result.uncovered.some(x=>x.id==="foreign"&&x.uncoveredBeforeDueTwd===null),
 "Foreign currency obligations must remain unconverted");
assert(!JSON.stringify(result).includes("settled"),"Settled principal excluded");

const lateFund={...forecast,entries:[
 {date:"2026-12-02",kind:"debt",label:"Fund later",amountTwd:"-3000",source:"debt_fund",sourceId:"other"},
 {date:"2026-12-03",kind:"income",label:"Lương",amountTwd:"58000",source:"cashflow"},
 {date:"2026-12-15",kind:"debt",label:"Quỹ nợ",amountTwd:"-12000",source:"debt_fund",sourceId:"friend"}]};
const result2=buildFinanceMentorBrief({forecast:lateFund,debts:[debt("friend")]});
assert.equal(result2.uncovered[0].uncoveredBeforeDueTwd,"12000",
 "Fund after due is not available on promised date");
const result3=buildFinanceMentorBrief({forecast:{...forecast,entries:[
 ...forecast.entries.slice(0,2),{date:"2026-12-02",kind:"debt",source:"debt_fund",
 sourceId:"friend",amountTwd:"-5000",label:"quỹ"},forecast.entries[2]
]},debts:[debt("friend")]});
assert.equal(result3.uncovered[0].uncoveredBeforeDueTwd,"7000");
const noSalary=buildFinanceMentorBrief({forecast:{...forecast,entries:forecast.entries.slice(0,2)},
 debts:[debt("friend")]});
assert.equal(noSalary.nextIncome,null);
assert(noSalary.uncovered.length===1);
console.log("PASS deterministic Mentor: salary timing, friend/bank, uncovered due, FX, no API key");
