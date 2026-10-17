import assert from "node:assert/strict";
import {daysUntil,debtMentorAlerts,creditorLabels,obligationLabels} from "../vps/backend/src/finance-mentor-engine.mjs";
assert.equal(daysUntil("2026-11-30","2026-12-02"),2);
assert.equal(daysUntil("2026-12-03","2026-12-02"),-1);
assert.equal(creditorLabels.friend_family,"Người quen / gia đình");
assert(obligationLabels.agreed_flexible.includes("thỏa thuận"));
const debt=(id,rest={})=>({id,name:id,currency_code:"TWD",outstanding_amount:"12000",
  creditor_type:"friend_family",obligation_type:"fixed",due_date:"2026-12-02",
  minimum_due_amount:"12000",relationship_priority:"high",negotiation_status:"none",
  next_contact_date:null,...rest});
const asOf="2026-11-30";
const alerts=debtMentorAlerts([
 debt("friendFixed"),
 debt("friendRequested",{negotiation_status:"requested"}),
 debt("friendFlexible",{obligation_type:"agreed_flexible",negotiation_status:"confirmed",due_date:"2026-12-04"}),
 debt("friendUnknown",{obligation_type:"unconfirmed",due_date:null,minimum_due_amount:null,next_contact_date:"2026-12-01"}),
 debt("friendNoSchedule",{obligation_type:"unconfirmed",due_date:null,minimum_due_amount:null}),
 debt("card",{creditor_type:"credit_card",minimum_due_amount:"4000"}),
 debt("noCardMinimum",{creditor_type:"credit_card",minimum_due_amount:null}),
 debt("settled",{outstanding_amount:"0"}),
],asOf);
const forDebt=id=>alerts.filter(x=>x.debtId===id);
assert(forDebt("friendFixed").some(a=>a.kind==="due"&&a.date==="2026-12-02"));
assert(forDebt("friendRequested").some(a=>a.kind==="unconfirmed_renegotiation"));
assert(forDebt("friendFlexible").some(a=>a.kind==="due"&&a.date==="2026-12-04"));
assert(forDebt("friendUnknown").some(a=>a.kind==="contact"));
assert(!forDebt("friendUnknown").some(a=>a.kind==="due"),"No invented due date for flexible unknown debt");
assert(forDebt("friendNoSchedule").some(a=>a.kind==="unknown_schedule"));
assert(forDebt("card").some(a=>a.message.includes("4000 TWD")));
assert(forDebt("noCardMinimum").some(a=>a.message.includes("Chưa khai báo")));
assert.equal(forDebt("settled").length,0);
const overdue=debtMentorAlerts([debt("personalOverdue")],"2026-12-05");
assert(overdue.some(a=>a.urgency==="reconcile"),"Overdue schedule is not proof that an actual payment was missed");
assert(!JSON.stringify(overdue).includes("đã trễ hạn"),"Must distinguish schedule from actual settlement");
console.log("PASS Finance Mentor creditor categories, promised friend dates, renegotiation, unknown schedules and unposted status");
