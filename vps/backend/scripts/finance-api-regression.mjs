import assert from "node:assert/strict";
import crypto from "node:crypto";
import pg from "pg";

const BASE=process.env.TEST_API_BASE||"http://127.0.0.1:8080";
const monthly=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit"}).format(new Date()).slice(0,7);
const date=monthly+"-25";
async function request(path,{method="GET",body,cookie,write=true,headers={}}={}){
  const response=await fetch(BASE+"/api"+path,{
    method,headers:{
      ...(body?{"content-type":"application/json"}:{}),
      ...(cookie?{cookie}:{}),
      ...(write&&method!=="GET" ? {"x-finance-write":"1"}:{}),
      ...headers
    },body:body?JSON.stringify(body):undefined
  });
  let data={};try{data=await response.json();}catch{}
  return {status:response.status,data,cookie:response.headers.get("set-cookie")?.split(";")[0]};
}
async function login(name){
 const r=await request("/auth/login",{method:"POST",body:{username:name,password:"KitchenTest!123"}});
 assert.equal(r.status,200,"Login failed: "+name);return r.cookie;
}
const financeHostname="finance.82.47.180.185.nip.io";
const otherOriginLogin=await request("/auth/login",{method:"POST",body:{username:"yangchuadmin",password:"KitchenTest!123"},headers:{"x-forwarded-host":financeHostname}});
assert.equal(otherOriginLogin.status,403,"Finance domain must reject all non-owner kitchen users");
const secureOriginLogin=await fetch(BASE+"/api/auth/login",{
 method:"POST",headers:{"Content-Type":"application/json","x-forwarded-host":financeHostname},
 body:JSON.stringify({username:"managerfx",password:"KitchenTest!123"})
});
assert.equal(secureOriginLogin.status,200);
assert.match(secureOriginLogin.headers.get("set-cookie")||"",/Secure/,"finance session must be secure");
assert.match(secureOriginLogin.headers.get("set-cookie")||"",/SameSite=Strict/i,"finance cookie must be strict");
const owner=await login("managerfx");
const stranger=await login("yangchuadmin");
assert.equal((await request("/finance/bootstrap")).status,401,"anonymous finance read must fail");
assert.equal((await request("/finance/bootstrap",{cookie:stranger})).status,403,"restaurant super admin must not inherit private finance owner rights");
assert.equal((await request("/finance/access",{cookie:stranger})).status,403);
assert.equal((await request("/finance/access",{cookie:owner})).status,200);
assert.equal((await request("/finance/bootstrap",{cookie:owner})).status,200);
assert.equal((await request("/finance/accounts",{method:"POST",cookie:owner,body:{name:"must fail",kind:"bank",currencyCode:"TWD"},write:false})).status,403,"write header must be required");
async function post(path,body){
 const r=await request("/finance"+path,{method:"POST",cookie:owner,body});
 assert.equal(r.status,201,JSON.stringify({path,body,data:r.data}));
 return r.data;
}
const bank=(await post("/accounts",{name:"Ngân hàng Đài",kind:"bank",currencyCode:"TWD"})).account;
const cash=(await post("/accounts",{name:"Tiền mặt",kind:"cash",currencyCode:"TWD"})).account;
const vnd=(await post("/accounts",{name:"VN ngân hàng",kind:"bank",currencyCode:"VND"})).account;
const usd=(await post("/accounts",{name:"Ví USD",kind:"ewallet",currencyCode:"USD"})).account;
const jpy=(await post("/accounts",{name:"Ví JPY",kind:"cash",currencyCode:"JPY"})).account;
const salary=(await post("/categories",{name:"Lương",kind:"income"})).category;
const rent=(await post("/categories",{name:"Nhà ở",kind:"expense"})).category;
const food=(await post("/categories",{name:"Ăn uống",kind:"expense"})).category;
const budget=await request("/finance/budgets",{method:"PUT",cookie:owner,body:{categoryId:rent.id,month:monthly,amountTwd:"6000"}});
assert.equal(budget.status,200,JSON.stringify(budget.data));
const goal=(await post("/goals",{name:"Quỹ học phí",currencyCode:"TWD",targetAmount:"50000",targetDate:monthly+"-27"})).goal;
assert.equal(goal.current_amount,"0.000000");
const progress=await request("/finance/goals/"+goal.id,{method:"PUT",cookie:owner,body:{currentAmount:"5000",status:"active"}});
assert.equal(progress.status,200,JSON.stringify(progress.data));
assert.equal(Number(progress.data.goal.current_amount),5000);
const invalidGoal=await request("/finance/goals/"+goal.id,{method:"PUT",cookie:owner,body:{currentAmount:"5000.50",status:"active"}});
assert.equal(invalidGoal.status,400,"TWD manual goal progress cannot silently round");
const unauthorizedGoal=await request("/finance/goals/"+goal.id,{method:"PUT",cookie:stranger,body:{currentAmount:"10",status:"achieved"}});
assert.equal(unauthorizedGoal.status,403,"Super Admin may not edit private goals");
const debt=(await post("/debts",{name:"Thẻ tín dụng",currencyCode:"VND",principalOriginal:"12000000",annualInterestPercent:"12.5",dueDate:monthly+"-26"})).debt;
assert.equal(Number(debt.annual_interest_rate),0.125);
let planning=await request("/finance/bootstrap",{cookie:owner});
assert.equal(planning.data.goals.length,1);
assert.equal(Number(planning.data.goals[0].current_amount),5000);
assert.equal(planning.data.debts.length,1);
assert.equal(Number(planning.data.debts[0].outstanding_amount),12000000);
assert.equal(Number(planning.data.accounts.find(a=>a.id===bank.id).balance),0,"Goals and debts must not mint posted money");
const key=()=>crypto.randomUUID();
const incomeKey=key();
await post("/transactions",{idempotencyKey:incomeKey,kind:"income",accountId:bank.id,categoryId:salary.id,amount:"58000",description:"Lương tháng"});
const duplicate=await request("/finance/transactions",{method:"POST",cookie:owner,body:{idempotencyKey:incomeKey,kind:"income",accountId:bank.id,categoryId:salary.id,amount:"58000"}});
assert.equal(duplicate.status,409,"same idempotency key must not double post");
await post("/transactions",{idempotencyKey:key(),kind:"expense",accountId:bank.id,categoryId:rent.id,amount:"6000"});
await post("/transactions",{idempotencyKey:key(),kind:"transfer",accountId:bank.id,targetAccountId:cash.id,amount:"1000"});
const fxPlan=await post("/fx-plans",{planDate:date,planKind:"remittance",fromCurrency:"TWD",toCurrency:"VND",sourceAmount:"10000",expectedRate:"785",expectedFee:"100",memo:"Gửi về VN"});
assert.equal(fxPlan.plan.status,"planned");
let overview=await request("/finance/overview?month="+monthly,{cookie:owner});
assert.equal(overview.status,200);
assert.equal(Number(overview.data.flow.find(x=>x.kind==="income")?.total_twd),58000);
assert.equal(Number(overview.data.flow.find(x=>x.kind==="expense")?.total_twd),6000);
assert.equal(Number(overview.data.budget.find(x=>x.category_id===rent.id)?.actual_twd),6000);
let snap=await request("/finance/bootstrap",{cookie:owner});
assert.equal(Number(snap.data.accounts.find(a=>a.id===bank.id).balance),51000,"planning must not debit; income - expense - internal transfer only");
assert.equal(Number(snap.data.accounts.find(a=>a.id===vnd.id).balance),0,"plan cannot mint VND");
await post("/transactions",{idempotencyKey:key(),kind:"fx",accountId:bank.id,targetAccountId:vnd.id,amount:"10000",receivedAmount:"7850000",feeAmount:"100",description:"Đổi thực tế"});
await post("/transactions",{idempotencyKey:key(),kind:"income",accountId:usd.id,categoryId:salary.id,amount:"10.50",toTwdRate:"30.10"});
await post("/transactions",{idempotencyKey:key(),kind:"adjustment",accountId:jpy.id,amount:"12500",description:"Opening balance"});
const repeatedOpening=await request("/finance/transactions",{method:"POST",cookie:owner,body:{idempotencyKey:key(),kind:"adjustment",accountId:jpy.id,amount:"12500"}});
assert.equal(repeatedOpening.status,409,"opening balances are only accepted on empty accounts");
const invalidFx=await request("/finance/transactions",{method:"POST",cookie:owner,body:{idempotencyKey:key(),kind:"fx",accountId:bank.id,targetAccountId:cash.id,amount:"10",receivedAmount:"10"}});
assert.equal(invalidFx.status,400,"FX cannot convert the same currency");
const invalidExpense=await request("/finance/transactions",{method:"POST",cookie:owner,body:{idempotencyKey:key(),kind:"expense",accountId:usd.id,categoryId:food.id,amount:"1.00"}});
assert.equal(invalidExpense.status,400,"foreign-currency expense must preserve FX-to-TWD rate");
snap=await request("/finance/bootstrap",{cookie:owner});
assert.equal(Number(snap.data.accounts.find(a=>a.id===bank.id).balance),40900);
assert.equal(Number(snap.data.accounts.find(a=>a.id===cash.id).balance),1000);
assert.equal(Number(snap.data.accounts.find(a=>a.id===vnd.id).balance),7850000);
assert.equal(Number(snap.data.accounts.find(a=>a.id===usd.id).balance),10.5);
assert.equal(Number(snap.data.accounts.find(a=>a.id===jpy.id).balance),12500);
assert.equal(snap.data.plans.length,1);
const cancelledPlan=await request("/finance/fx-plans/"+fxPlan.plan.id+"/cancel",{method:"POST",cookie:owner,body:{}});
assert.equal(cancelledPlan.status,200);
assert.equal(cancelledPlan.data.plan.status,"cancelled");
const cancelAgain=await request("/finance/fx-plans/"+fxPlan.plan.id+"/cancel",{method:"POST",cookie:owner,body:{}});
assert.equal(cancelAgain.status,404,"Plan cancellation must not run twice");
const unauthorizedCancel=await request("/finance/fx-plans/"+fxPlan.plan.id+"/cancel",{method:"POST",cookie:stranger,body:{}});
assert.equal(unauthorizedCancel.status,403);
const reloaded=await request("/finance/bootstrap",{cookie:owner});
assert.equal(reloaded.data.plans.find(x=>x.id===fxPlan.plan.id).status,"cancelled","Cancellation must persist after API reload");
assert.equal(Number(reloaded.data.accounts.find(a=>a.id===bank.id).balance),40900,"Plan cancellation does not move money");
assert.equal(snap.data.currencies.length,6);
overview=await request("/finance/overview?month="+monthly,{cookie:owner});
assert.equal(Number(overview.data.flow.find(x=>x.kind==="expense").total_twd),6000,"FX fees and wallet transfers must not become consumption expense");
assert.equal(Number(overview.data.flow.find(x=>x.kind==="income").total_twd),58316.05);
const year=await request("/finance/year?year="+monthly.slice(0,4),{cookie:owner});
assert.equal(year.status,200);
assert.equal(year.data.months.length,12);
assert.equal(Number(year.data.months.find(m=>m.month===monthly).budget_twd),6000);
assert.equal(Number(year.data.months.find(m=>m.month===monthly).expense_twd),6000);
// Planned monthly cashflow is separate from actual ledger and can be edited/deleted safely.
const cfIncome=(await post("/cashflow/items",{month:monthly,kind:"income",label:"Lương dự kiến",amountTwd:"60000",dueDay:"10"})).item;
const cfExpense=(await post("/cashflow/items",{month:monthly,kind:"expense",label:"Chi phí sinh hoạt",amountTwd:"11000",dueDay:"5"})).item;
const badPlan=await request("/finance/cashflow/items",{method:"POST",cookie:owner,body:{month:monthly,kind:"expense",label:"bad",amountTwd:"-100"}});
assert.equal(badPlan.status,400);
const updated=await request("/finance/cashflow/items/"+cfExpense.id,{method:"PUT",cookie:owner,body:{kind:"expense",label:"Chi phí sinh hoạt",amountTwd:"11000",dueDay:"6"}});
assert.equal(updated.status,200);
const foreignAttempt=await request("/finance/cashflow/items/"+cfIncome.id,{method:"PUT",cookie:stranger,body:{kind:"income",label:"tampered",amountTwd:"1"}});
assert.equal(foreignAttempt.status,403);
const reserve=await request("/finance/debt-funds",{method:"PUT",cookie:owner,body:{
  debtId:debt.id,month:monthly,plannedAmount:"1500000",earmarkedAmount:"500000",fxRateToTwd:"810"
}});
assert.equal(reserve.status,200,JSON.stringify(reserve.data));
const noRate=await request("/finance/debt-funds",{method:"PUT",cookie:owner,body:{
  debtId:debt.id,month:monthly,plannedAmount:"1500000",earmarkedAmount:"500000"
}});
assert.equal(noRate.status,400,"Debt fund foreign rate must be explicit");
// Historical fund rate was entered in the reverse direction (810 VND per TWD).
// Without a recent quote, the API must not manufacture a huge TWD valuation.
const missingRate=await request("/finance/cashflow?month="+monthly,{cookie:owner});
assert.equal(missingRate.data.debtFunds[0].planned_twd,null);
assert.equal(missingRate.data.summary.fx_estimate_incomplete,true);
const rateDb=new pg.Client({host:process.env.FINANCE_DB_HOST,port:Number(process.env.FINANCE_DB_PORT||5432),
 database:process.env.FINANCE_DB_NAME,user:process.env.FINANCE_DB_USER,password:process.env.FINANCE_DB_PASSWORD});
await rateDb.connect();
try{
 await rateDb.query(
  "INSERT INTO finance.fx_rates(base_currency,quote_currency,rate,provider,observed_at) VALUES('VND','TWD',0.0013,'exchangerate-api-open',now())");
}finally{await rateDb.end();}
// Creating a goal must not fabricate a monthly installment until the owner allocates it.
const emptyBeforeGoalFunding=await request("/finance/cashflow?month="+monthly,{cookie:owner});
assert.equal(Number(emptyBeforeGoalFunding.data.summary.planned_goal_fund_twd),0);
assert.equal(emptyBeforeGoalFunding.data.goalFunds.length,0);
const allocateGoal=await request("/finance/goal-funds",{method:"PUT",cookie:owner,body:{
  goalId:goal.id,month:monthly,plannedAmount:"8000",earmarkedAmount:"2500"
}});
assert.equal(allocateGoal.status,200,JSON.stringify(allocateGoal.data));
const changeAllocation=await request("/finance/goal-funds",{method:"PUT",cookie:owner,body:{
  goalId:goal.id,month:monthly,plannedAmount:"9000",earmarkedAmount:"4000"
}});
assert.equal(changeAllocation.status,200,"Editing same goal-month must upsert, not add duplicate planned outflow");
const denyOther=await request("/finance/goal-funds",{method:"PUT",cookie:stranger,body:{
  goalId:goal.id,month:monthly,plannedAmount:"1",earmarkedAmount:"1"
}});
assert.equal(denyOther.status,403,"Restaurant Super Admin has no access to private goal allocation");
const invalidGoalFunding=await request("/finance/goal-funds",{method:"PUT",cookie:owner,body:{
  goalId:goal.id,month:monthly,plannedAmount:"1.55",earmarkedAmount:"0"
}});
assert.equal(invalidGoalFunding.status,400,"TWD goal allocation must reject unsupported precision");
const noSuchGoalFunding=await request("/finance/goal-funds",{method:"PUT",cookie:owner,body:{
  goalId:crypto.randomUUID(),month:monthly,plannedAmount:"10",earmarkedAmount:"0"
}});
assert.equal(noSuchGoalFunding.status,404);
const otherMonth=monthly.slice(0,4)+"-"+(monthly.slice(5)==="12"?"11":"12");
const emptyOtherMonth=await request("/finance/cashflow?month="+otherMonth,{cookie:owner});
assert.equal(emptyOtherMonth.status,200);
assert.equal(Number(emptyOtherMonth.data.summary.planned_goal_fund_twd),0,"Monthly goal fund must not leak into another month");
assert.equal(emptyOtherMonth.data.goalFunds.length,0);
let cashflow=await request("/finance/cashflow?month="+monthly,{cookie:owner});
assert.equal(cashflow.status,200,JSON.stringify(cashflow.data));
assert.equal(cashflow.data.items.length,2);
assert.equal(Number(cashflow.data.summary.planned_income_twd),60000);
assert.equal(Number(cashflow.data.summary.planned_expense_twd),11000);
assert.equal(Number(cashflow.data.summary.planned_debt_fund_twd),1950);
assert.equal(Number(cashflow.data.summary.planned_net_twd),38050);
assert.equal(Number(cashflow.data.summary.earmarked_debt_fund_twd),650);
assert.equal(Number(cashflow.data.summary.planned_goal_fund_twd),9000);
assert.equal(Number(cashflow.data.summary.earmarked_goal_fund_twd),4000);
assert.equal(cashflow.data.goalFunds.length,1);
assert.equal(cashflow.data.goalFunds[0].goal_name,"Quỹ học phí");
const beforeActual=await request("/finance/bootstrap",{cookie:owner});
assert.equal(Number(beforeActual.data.accounts.find(a=>a.id===vnd.id).balance),7850000,
  "Debt fund earmarking MUST NOT alter wallet balances");
const paymentKey=key();
const paymentBody={idempotencyKey:paymentKey,debtId:debt.id,accountId:vnd.id,paymentDate:date,
  principalPaid:"1000000",interestPaid:"0",feePaid:"0",fxRateToTwd:"0.0013",memo:"Thanh toán theo sao kê"};
const payment=(await post("/debt-payments",paymentBody)).payment;
assert.equal(Number(payment.base_amount_twd),1300);
const repeatPayment=await request("/finance/debt-payments",{method:"POST",cookie:owner,body:paymentBody});
assert.equal(repeatPayment.status,409,"Debt payment idempotency must reject retries");
const invalidLarge=await request("/finance/debt-payments",{method:"POST",cookie:owner,body:{...paymentBody,idempotencyKey:key(),principalPaid:"99999999"}});
assert.equal(invalidLarge.status,400,"Cannot repay more principal than outstanding");
const invalidOtherOwner=await request("/finance/debt-payments",{method:"POST",cookie:stranger,body:{...paymentBody,idempotencyKey:key()}});
assert.equal(invalidOtherOwner.status,403,"Restaurant Super Admin cannot repay private debts");
const afterActual=await request("/finance/bootstrap",{cookie:owner});
assert.equal(Number(afterActual.data.accounts.find(a=>a.id===vnd.id).balance),6850000);
assert.equal(Number(afterActual.data.debts.find(d=>d.id===debt.id).outstanding_amount),11000000);
cashflow=await request("/finance/cashflow?month="+monthly,{cookie:owner});
assert.equal(Number(cashflow.data.summary.actual_debt_paid_twd),1300);
assert.equal(Number(cashflow.data.summary.actual_net_twd),51016.05);
assert.equal(cashflow.data.debtPayments.length,1);
assert.equal(Number(cashflow.data.debtFunds[0].earmarked_amount),500000,
 "Manual reserve must remain separate from posted repayment");
const yearCashflow=await request("/finance/cashflow/year?year="+monthly.slice(0,4),{cookie:owner});
assert.equal(yearCashflow.status,200);
assert.equal(yearCashflow.data.months.length,12);
assert.equal(Number(yearCashflow.data.months.find(x=>x.month===monthly).debt_fund_twd),1950);
assert.equal(Number(yearCashflow.data.months.find(x=>x.month===monthly).goal_fund_twd),9000);
const deleteItem=await request("/finance/cashflow/items/"+cfExpense.id,{method:"DELETE",cookie:owner,body:{}});
assert.equal(deleteItem.status,200);
assert.equal((await request("/finance/cashflow?month="+monthly,{cookie:owner})).data.items.length,1,
 "Deleting a forecast item must persist without touching actual ledger");
// Mentor: bank vs person is explicit, and due terms remain owner-scoped.
assert.equal((await request("/finance/mentor/status")).status,401);
assert.equal((await request("/finance/mentor/obligations",{cookie:stranger})).status,403);
const mentorStatus=await request("/finance/mentor/status",{cookie:owner});
assert.equal(mentorStatus.status,200);
assert.equal(mentorStatus.data.configured,false,"AI must be disabled without a VPS API key");
assert.equal((await request("/finance/mentor/analysis")).status,401,"Anonymous visitors cannot read Finance mentor data");
assert.equal((await request("/finance/mentor/analysis?days=90",{cookie:stranger})).status,403,"Other users cannot read owner's Mentor");
assert.equal((await request("/finance/mentor/analysis?days=31",{cookie:owner})).status,400,"Reject unsupported time horizons");
const mentorWithoutKey=await request("/finance/mentor/analysis?days=90&bufferTwd=3000",{cookie:owner});
assert.equal(mentorWithoutKey.status,200,JSON.stringify(mentorWithoutKey.data));
assert.equal(mentorWithoutKey.data.readOnly,true);
assert.equal(mentorWithoutKey.data.analysis.aiGenerated,false);
assert.equal(mentorWithoutKey.data.analysis.source,"finance_postgresql");
assert.equal(mentorWithoutKey.data.analysis.asOf.length,10);
assert(Array.isArray(mentorWithoutKey.data.analysis.actions));
assert(Array.isArray(mentorWithoutKey.data.analysis.needsConfirmation));
const termsBody={creditorType:"friend_family",obligationType:"fixed",minimumDueAmount:"1000000",
 relationshipPriority:"high",negotiationStatus:"none",nextContactDate:null,remindersEnabled:true,
 memo:"Ngày đã hứa trả; cần đối chiếu với chủ nợ."};
const termsUrl="/finance/mentor/debts/"+debt.id+"/terms";
assert.equal((await request(termsUrl,{method:"PUT",cookie:stranger,body:termsBody})).status,403);
assert.equal((await request(termsUrl,{method:"PUT",cookie:owner,body:termsBody,write:false})).status,403);
const invalidFlex={...termsBody,obligationType:"agreed_flexible",negotiationStatus:"requested"};
assert.equal((await request(termsUrl,{method:"PUT",cookie:owner,body:invalidFlex})).status,400,
 "No treating a requested reschedule as confirmed agreement");
const savedTerms=await request(termsUrl,{method:"PUT",cookie:owner,body:termsBody});
assert.equal(savedTerms.status,200,JSON.stringify(savedTerms.data));
const obligations=await request("/finance/mentor/obligations",{cookie:owner});
assert.equal(obligations.status,200,JSON.stringify(obligations.data));
const annotated=obligations.data.debts.find(d=>d.id===debt.id);
assert.equal(annotated.creditor_type,"friend_family");
assert.equal(annotated.obligation_type,"fixed");
assert.equal(annotated.minimum_due_amount,"1000000.000000");
assert.equal(annotated.reminders_enabled,true);
assert.equal((await request("/finance/mentor/conversations",{cookie:owner})).status,200);
assert.equal((await request("/finance/mentor/messages",{method:"POST",cookie:owner,body:{
 message:"Tôi nên ưu tiên trả nợ thế nào?",horizonDays:90,bufferTwd:"3000"}})).status,503,
 "Missing OpenAI configuration must fail closed with no provider request");

// Read-only liquidity advisor derives current TWD wallets from the same ledger used in bootstrap.
const advisor=await request("/finance/advisor?days=30&bufferTwd=2000",{cookie:owner});
assert.equal(advisor.status,200,JSON.stringify(advisor.data));
assert.equal(advisor.data.metadata.currency,"TWD");
assert.equal(advisor.data.metadata.readOnly,true);
assert.equal(advisor.data.metadata.countedWallets,2);
assert.equal(Number(advisor.data.startingBalanceTwd),41900,
  "Advisor must start at actually posted TWD bank + TWD cash only");
assert.equal(advisor.data.foreignWallets.length,3,"Do not use guessed exchange rates to credit foreign wallets");
assert(Array.isArray(advisor.data.entries));
assert(Array.isArray(advisor.data.recommendations));
assert(advisor.data.warnings.some(x=>x.code==="FOREIGN_WALLETS_EXCLUDED"));
assert.equal((await request("/finance/advisor?days=31",{cookie:owner})).status,400);
assert.equal((await request("/finance/advisor?days=30&bufferTwd=-1",{cookie:owner})).status,400);
assert.equal((await request("/finance/advisor")).status,401,"Anonymous may not read private schedule");
assert.equal((await request("/finance/advisor?days=90",{cookie:stranger})).status,403,
  "Restaurant Super Admin has no access to private forecasts");
const afterAdvisor=await request("/finance/bootstrap",{cookie:owner});
assert.equal(Number(afterAdvisor.data.accounts.find(x=>x.id===bank.id).balance),40900,
  "Read-only advisor must not change actual ledger balances");
const db=new pg.Client({host:process.env.FINANCE_DB_HOST,port:Number(process.env.FINANCE_DB_PORT||5432),database:process.env.FINANCE_DB_NAME,user:process.env.FINANCE_DB_USER,password:process.env.FINANCE_DB_PASSWORD});
await db.connect();
try{
  const ledger=await db.query("SELECT count(*)::int as count FROM finance.entries WHERE owner_user_id=$1",[process.env.FINANCE_OWNER_USER_ID]);
  const aud=await db.query("SELECT count(*)::int as count FROM finance.audit_events WHERE owner_user_id=$1",[process.env.FINANCE_OWNER_USER_ID]);
  assert.equal(ledger.rows[0].count,10,"Original nine entries and one immutable debt payment entry");
  const payments=await db.query("SELECT id FROM finance.debt_payments WHERE owner_user_id=$1",[process.env.FINANCE_OWNER_USER_ID]);
  assert.equal(payments.rows.length,1);
  let immutable=false;
  try{await db.query("UPDATE finance.debt_payments SET principal_paid=0 WHERE id=$1",[payments.rows[0].id]);}
  catch(error){immutable=error.message.includes("POSTED_FINANCE_EVENTS_ARE_IMMUTABLE");}
  assert.equal(immutable,true,"Actual paid debt cannot be edited or deleted in place");
  assert.equal(aud.rows[0].count,29,"Mentor debt terms write must add an owner-scoped audit event without changing posted entries");
  const mentorAudit=await db.query("SELECT COUNT(*)::int AS count FROM finance.audit_events WHERE owner_user_id=$1 AND action='finance.mentor.debt_terms.update'",[process.env.FINANCE_OWNER_USER_ID]);
  assert.equal(mentorAudit.rows[0].count,1,"Mentor terms change must remain auditable");
  let blocked=false;
  try{await db.query("UPDATE finance.events SET description='tampered' WHERE owner_user_id=$1",[process.env.FINANCE_OWNER_USER_ID]);}
  catch(e){blocked=e.message.includes("POSTED_FINANCE_EVENTS_ARE_IMMUTABLE");}
  assert.equal(blocked,true,"posted event must be immutable");
}finally{await db.end();}
// Concurrent opposite-direction transfers must finish without lock-order deadlocks.
const opposite=await Promise.all([
  request("/finance/transactions",{method:"POST",cookie:owner,body:{idempotencyKey:key(),kind:"transfer",accountId:bank.id,targetAccountId:cash.id,amount:"1"}}),
  request("/finance/transactions",{method:"POST",cookie:owner,body:{idempotencyKey:key(),kind:"transfer",accountId:cash.id,targetAccountId:bank.id,amount:"1"}})
]);
assert.deepEqual(opposite.map(x=>x.status),[201,201],"Opposite direction transfers should not deadlock");
const afterConcurrency=await request("/finance/bootstrap",{cookie:owner});
assert.equal(Number(afterConcurrency.data.accounts.find(a=>a.id===bank.id).balance),40900);
assert.equal(Number(afterConcurrency.data.accounts.find(a=>a.id===cash.id).balance),1000);

// Saved scenarios are owner-only hypothetical documents; preview cannot mint or pay money.
assert.equal((await request("/finance/workbench")).status,401);
assert.equal((await request("/finance/workbench",{cookie:stranger})).status,403);
assert.equal((await request("/finance/workbench/scenarios",{method:"POST",cookie:stranger,body:{}})).status,403);
const wb=await request("/finance/workbench",{cookie:owner});
assert.equal(wb.status,200);
assert(Array.isArray(wb.data.scenarios));
const day=wb.data.asOf;
const nextMonthDate=new Date(Date.parse(day+"T00:00:00Z")+30*86400000).toISOString().slice(0,10);
const simulated={name:"Emergency bridge",months:3,salaryDay:10,bufferTwd:"2000",
 monthlyExtraIncomeTwd:"0",rows:[
  {kind:"borrow",linkId:"bridge-1",date:day,label:"Temporary third-party loan",amountTwd:"1000"},
  {kind:"repay",linkId:"bridge-1",date:nextMonthDate,label:"Repay temporary loan",amountTwd:"1020"}
 ],goal:null};
assert.equal((await request("/finance/workbench/preview",{method:"POST",cookie:stranger,body:{scenario:simulated}})).status,403);
assert.equal((await request("/finance/workbench/preview",{method:"POST",cookie:owner,body:{scenario:simulated},write:false})).status,403);
const preview=await request("/finance/workbench/preview",{method:"POST",cookie:owner,body:{scenario:simulated}});
assert.equal(preview.status,200,JSON.stringify(preview.data));
assert.equal(preview.data.sourceTag,"finance_postgresql");
assert.equal(preview.data.projection.loans[0].financingCostTwd,"20");
assert.equal(preview.data.projection.startingBalanceTwd,"41900");
assert(preview.data.projection.months.length===3);
const invalidPair=await request("/finance/workbench/preview",{method:"POST",cookie:owner,
 body:{scenario:{...simulated,rows:[simulated.rows[0]]}}});
assert.equal(invalidPair.status,400,"Never model debt refinancing as money with no repayment");
const created=await request("/finance/workbench/scenarios",{method:"POST",cookie:owner,body:{scenario:simulated}});
assert.equal(created.status,201,JSON.stringify(created.data));
const scenarioId=created.data.scenario.id;
let savedBooks=await request("/finance/workbench",{cookie:owner});
assert(savedBooks.data.scenarios.some(x=>x.id===scenarioId));
const scenarioUpdated=await request("/finance/workbench/scenarios/"+scenarioId,{method:"PUT",cookie:owner,
 body:{scenario:{...simulated,name:"Updated plan",monthlyExtraIncomeTwd:"2000"}}});
assert.equal(scenarioUpdated.status,200);
savedBooks=await request("/finance/workbench",{cookie:owner});
assert.equal(savedBooks.data.scenarios.find(x=>x.id===scenarioId)?.settings?.monthlyExtraIncomeTwd,"2000");
assert.equal((await request("/finance/workbench/scenarios/"+scenarioId,{method:"DELETE",cookie:stranger,body:{}})).status,403);
assert.equal((await request("/finance/workbench/scenarios/"+scenarioId,{method:"DELETE",cookie:owner,body:{}})).status,200);
savedBooks=await request("/finance/workbench",{cookie:owner});
assert(!savedBooks.data.scenarios.some(x=>x.id===scenarioId));
const afterSimulation=await request("/finance/bootstrap",{cookie:owner});
assert.equal(Number(afterSimulation.data.accounts.find(x=>x.id===bank.id).balance),40900);
assert.equal(Number(afterSimulation.data.debts.find(x=>x.id===debt.id).outstanding_amount),
  Number(afterConcurrency.data.debts.find(x=>x.id===debt.id).outstanding_amount),
  "Scenario borrowing and repayment cannot change existing actual debt principal");


// Explicit real-balance reconciliation must be append-only, owned and race-safe.
const reconPath="/finance/accounts/"+bank.id+"/reconcile";
const reconciliation={expectedBalance:"40900",targetBalance:"40250",reason:"Đối soát số dư từ ứng dụng ngân hàng",idempotencyKey:key()};
const beforeReconcile=await request("/finance/overview?month="+monthly,{cookie:owner});
assert.equal((await request(reconPath,{method:"POST",body:reconciliation})).status,401,
 "Anonymous cannot edit private wallet balances");
assert.equal((await request(reconPath,{method:"POST",cookie:stranger,body:reconciliation})).status,403,
 "Other Kitchen/Super Admin users cannot edit Finance balances");
assert.equal((await request(reconPath,{method:"POST",cookie:owner,write:false,body:reconciliation})).status,403,
 "Mutations require Finance write header");
assert.equal((await request(reconPath,{method:"POST",cookie:owner,
 body:{...reconciliation,reason:"test"}})).status,400,
 "A meaningful reason is mandatory");
assert.equal((await request(reconPath,{method:"POST",cookie:owner,
 body:{...reconciliation,targetBalance:"40.125"}})).status,400,
 "TWD balance must obey zero-minor-unit precision");
const savedReconcile=await request(reconPath,{method:"POST",cookie:owner,body:reconciliation});
assert.equal(savedReconcile.status,201,JSON.stringify(savedReconcile.data));
assert.equal(Number(savedReconcile.data.reconciliation.delta),-650);
let reconciled=await request("/finance/bootstrap",{cookie:owner});
assert.equal(Number(reconciled.data.accounts.find(x=>x.id===bank.id).balance),40250);
assert.equal(Number(reconciled.data.accounts.find(x=>x.id===vnd.id).balance),6850000);
assert.equal((await request(reconPath,{method:"POST",cookie:owner,body:reconciliation})).status,409,
 "Replaying a balance adjustment must not post it again");
assert.equal((await request(reconPath,{method:"POST",cookie:owner,
 body:{...reconciliation,idempotencyKey:key(),targetBalance:"39500"}})).status,409,
 "Concurrent stale balance read must not overwrite an intervening transaction");
const afterReconcile=await request("/finance/overview?month="+monthly,{cookie:owner});
assert.deepEqual(afterReconcile.data.flow,beforeReconcile.data.flow,
 "Manual balance adjustments are not income or expenses");
const monthlyRows=afterReconcile.data.events;
assert(monthlyRows.some(x=>x.kind==="adjustment"&&x.description.includes("Đối soát số dư")),
 "Balance edits leave a visible immutable reconciliation history");
const vndReconPath="/finance/accounts/"+vnd.id+"/reconcile";
assert.equal((await request(vndReconPath,{method:"POST",cookie:owner,
 body:{expectedBalance:"6850000",targetBalance:"6850000.5",reason:"Đối soát tài khoản VND theo sổ",idempotencyKey:key()}})).status,400,
 "VND precision must be verified separately");
const settledAfter=await request("/finance/bootstrap",{cookie:owner});
assert.equal(Number(settledAfter.data.debts.find(x=>x.id===debt.id).outstanding_amount),11000000,
 "Correcting a cash wallet never modifies actual creditor outstanding principal");
const verify=new pg.Client({host:process.env.FINANCE_DB_HOST,port:Number(process.env.FINANCE_DB_PORT||5432),
 database:process.env.FINANCE_DB_NAME,user:process.env.FINANCE_DB_USER,password:process.env.FINANCE_DB_PASSWORD});
await verify.connect();
try{
 const reconciliationEvent=await verify.query(
  "SELECT e.id FROM finance.events e WHERE e.owner_user_id=$1 AND e.idempotency_key=$2",
  [process.env.FINANCE_OWNER_USER_ID,reconciliation.idempotencyKey]);
 assert.equal(reconciliationEvent.rows.length,1);
 const audited=await verify.query(
  "SELECT metadata FROM finance.audit_events WHERE owner_user_id=$1 AND action='finance.account.balance_reconciled' AND entity_id=$2",
  [process.env.FINANCE_OWNER_USER_ID,reconciliationEvent.rows[0].id]);
 assert.equal(audited.rows.length,1);
 assert.equal(Number(audited.rows[0].metadata.difference),-650);
 let immutableCorrection=false;
 try{await verify.query("DELETE FROM finance.events WHERE id=$1",[reconciliationEvent.rows[0].id]);}
 catch(error){immutableCorrection=error.message.includes("POSTED_FINANCE_EVENTS_ARE_IMMUTABLE");}
 assert(immutableCorrection,"Balance reconciliation cannot be erased after posting");
}finally{await verify.end();}


// Indicative currency snapshot is protected, source-attributed, cached in Finance DB.
assert.equal((await request("/finance/fx/estimates")).status,401);
assert.equal((await request("/finance/fx/estimates",{cookie:stranger})).status,403);
const fxBefore=await request("/finance/fx/estimates",{cookie:owner});
assert.equal(fxBefore.status,200);
assert.equal(fxBefore.data.automaticCurrencyExchange,false);
assert.equal(Number(fxBefore.data.quotes.VND.rateToTwd),0.0013,"The current Finance quote must replace the previously inverted manual fund quote");
const fxSeedDb=new pg.Client({host:process.env.FINANCE_DB_HOST,port:Number(process.env.FINANCE_DB_PORT||5432),
 database:process.env.FINANCE_DB_NAME,user:process.env.FINANCE_DB_USER,password:process.env.FINANCE_DB_PASSWORD});
await fxSeedDb.connect();
try{
 await fxSeedDb.query(
  "INSERT INTO finance.fx_rates(base_currency,quote_currency,rate,provider,observed_at) VALUES('VND','TWD',0.00125,'exchangerate-api-open',now()),('USD','TWD',31.25,'exchangerate-api-open',now())");
}finally{await fxSeedDb.end();}
const fxReady=await request("/finance/fx/estimates",{cookie:owner});
assert.equal(fxReady.status,200);
assert.equal(Number(fxReady.data.quotes.VND.rateToTwd),0.00125);
assert.equal(fxReady.data.quotes.VND.status,"fresh");
assert.equal(fxReady.data.source.attribution,"Rates By Exchange Rate API");
const nativePlan=await post("/cashflow/items",{month:monthly,kind:"expense",
 label:"Dự kiến trả 1 triệu đồng",currencyCode:"VND",originalAmount:"1000000",dueDay:"28"});
assert.equal(Number(nativePlan.item.amount_twd),1250);
assert.equal(nativePlan.item.original_currency,"VND");
assert.equal(Number(nativePlan.item.original_amount),1000000);
const nativeRows=await request("/finance/cashflow?month="+monthly,{cookie:owner});
assert.equal(nativeRows.status,200);
assert.equal(Number(nativeRows.data.items.find(x=>x.id===nativePlan.item.id).amount_twd),1250);
const badFXCurrency=await request("/finance/cashflow/items",{method:"POST",cookie:owner,body:{
 month:monthly,kind:"expense",label:"Currency missing",currencyCode:"JPY",originalAmount:"500"
}});
assert.equal(badFXCurrency.status,400,"Missing current quote must not produce guessed plan amount");
const wrongPrecision=await request("/finance/cashflow/items",{method:"POST",cookie:owner,body:{
 month:monthly,kind:"expense",label:"Wrong VND fraction",currencyCode:"VND",originalAmount:"1000.5"
}});
assert.equal(wrongPrecision.status,400);
const foreignFundAuto=await request("/finance/debt-funds",{method:"PUT",cookie:owner,body:{
 debtId:debt.id,month:monthly,plannedAmount:"1000000",earmarkedAmount:"0"
}});
assert.equal(foreignFundAuto.status,200,JSON.stringify(foreignFundAuto.data));
assert.equal(Number(foreignFundAuto.data.fund.fx_rate_to_twd),0.00125);
const financeAfterFX=await request("/finance/bootstrap",{cookie:owner});
assert.equal(Number(financeAfterFX.data.accounts.find(x=>x.id===bank.id).balance),40250,
 "FX planning must not move any posted TWD wallet");
assert.equal(Number(financeAfterFX.data.accounts.find(x=>x.id===vnd.id).balance),6850000,
 "FX planning must not transfer foreign-currency wallet balance");

// Actual posted foreign expense: native amount changes only the matching VND wallet;
// TWD valuation is calculated server-side from the finance DB quote, not a
// browser rate and never creates a cross-currency transfer.
const mismatchedWallet=await request("/finance/transactions",{method:"POST",cookie:owner,body:{
 kind:"expense",accountId:vnd.id,currencyCode:"TWD",categoryId:food.id,
 amount:"100000",fxRateMode:"estimate",idempotencyKey:key()
}});
assert.equal(mismatchedWallet.status,400);
assert.equal(mismatchedWallet.data.error,"TRANSACTION_CURRENCY_ACCOUNT_MISMATCH");
const noRateWallet=await request("/finance/transactions",{method:"POST",cookie:owner,body:{
 kind:"expense",accountId:jpy.id,currencyCode:"JPY",categoryId:food.id,
 amount:"100",fxRateMode:"estimate",idempotencyKey:key()
}});
assert.equal(noRateWallet.status,400);
assert.equal(noRateWallet.data.error,"FX_RATE_UNAVAILABLE","No exchange quote must never fabricate a TWD value");
const vndBefore=await request("/finance/bootstrap",{cookie:owner});
const balanceBefore=Number(vndBefore.data.accounts.find(a=>a.id===vnd.id).balance);
const realForeign=await post("/transactions",{
 kind:"expense",accountId:vnd.id,currencyCode:"VND",categoryId:food.id,
 amount:"100000",fxRateMode:"estimate",description:"Thanh toán tiền Việt",
 idempotencyKey:key()
});
assert.equal(realForeign.event.kind,"expense");
const vndAfter=await request("/finance/bootstrap",{cookie:owner});
assert.equal(Number(vndAfter.data.accounts.find(a=>a.id===vnd.id).balance),balanceBefore-100000);
assert.equal(Number(vndAfter.data.accounts.find(a=>a.id===bank.id).balance),40250,
 "A VND expense must never debit the TWD bank or execute an implicit exchange");
const actualExchangeCheck=new pg.Client({host:process.env.FINANCE_DB_HOST,port:Number(process.env.FINANCE_DB_PORT||5432),
 database:process.env.FINANCE_DB_NAME,user:process.env.FINANCE_DB_USER,password:process.env.FINANCE_DB_PASSWORD});
await actualExchangeCheck.connect();
try{
 const {rows}=await actualExchangeCheck.query(
  "SELECT amount::text,base_amount_twd::text,fx_rate_to_twd::text FROM finance.entries WHERE event_id=$1",
  [realForeign.event.id]);
 assert.equal(rows.length,1);
 assert.equal(Number(rows[0].amount),-100000);
 assert.equal(Number(rows[0].base_amount_twd),-125);
 assert.equal(Number(rows[0].fx_rate_to_twd),0.00125);
 const {rows:fxTransfers}=await actualExchangeCheck.query(
  "SELECT count(*)::int AS n FROM finance.fx_exchanges WHERE event_id=$1",[realForeign.event.id]);
 assert.equal(fxTransfers[0].n,0,"Automatic valuation cannot post an FX trade");
}finally{await actualExchangeCheck.end();}


// One action from the monthly plan must atomically create one debt and one
// linked fund, with no posted wallet change or duplicate expense.
const debtPlanBody={month:monthly,name:"Vay mẹ (tạo tại kế hoạch)",currencyCode:"TWD",
 principalOriginal:"20000",plannedAmount:"2500",annualInterestPercent:"6.5",
 dueDate:monthly+"-28"};
assert.equal((await request("/finance/debt-plans",{method:"POST",body:debtPlanBody})).status,401);
assert.equal((await request("/finance/debt-plans",{method:"POST",cookie:stranger,body:debtPlanBody})).status,403);
assert.equal((await request("/finance/debt-plans",{method:"POST",cookie:owner,body:debtPlanBody,write:false})).status,403);
assert.equal((await request("/finance/debt-plans",{method:"POST",cookie:owner,
 body:{...debtPlanBody,dueDate:""}})).status,400);
const startBank=Number((await request("/finance/bootstrap",{cookie:owner})).data.accounts.find(x=>x.id===bank.id).balance);
const createdDebtPlan=await post("/debt-plans",debtPlanBody);
assert.equal(Number(createdDebtPlan.debt.principal_original),20000);
assert.equal(Number(createdDebtPlan.debt.annual_interest_rate),0.065);
assert.equal(Number(createdDebtPlan.fund.planned_amount),2500);
const createdGoalPlan=await post("/goal-plans",{
 month:monthly,name:"Quỹ phòng rủi ro",currencyCode:"TWD",
 targetAmount:"10000",plannedAmount:"1000",targetDate:monthly+"-29"
});
const syncedPlan=await request("/finance/cashflow?month="+monthly,{cookie:owner});
assert(syncedPlan.data.debtFunds.some(x=>x.debt_id===createdDebtPlan.debt.id&&Number(x.planned_twd)===2500));
assert(syncedPlan.data.goalFunds.some(x=>x.goal_id===createdGoalPlan.goal.id&&Number(x.planned_twd)===1000));
assert.equal(Number((await request("/finance/bootstrap",{cookie:owner})).data.accounts.find(x=>x.id===bank.id).balance),startBank,
 "Linking a debt reserve and savings goal must not debit real bank money");
const updateInterest=await request("/finance/debts/"+createdDebtPlan.debt.id,{method:"PUT",cookie:owner,
 body:{name:"Vay mẹ · mới",annualInterestPercent:"7",dueDate:monthly+"-30"}});
assert.equal(updateInterest.status,200,JSON.stringify(updateInterest.data));
assert.equal(Number(updateInterest.data.debt.annual_interest_rate),0.07);
assert.equal((await request("/finance/debts/"+createdDebtPlan.debt.id,{method:"PUT",cookie:stranger,
 body:{name:"Cannot edit",annualInterestPercent:"0"}})).status,403);
const payoff=await request("/finance/debt-payoff-plan?months=3&bufferTwd=5000",{cookie:owner});
assert.equal(payoff.status,200,JSON.stringify(payoff.data));
assert.equal(payoff.data.readOnly,true);
assert.deepEqual(payoff.data.priority,["debt","essential_expense","saving"]);
assert(payoff.data.months.length>=1);
assert(payoff.data.remaining.some(x=>x.debtId===createdDebtPlan.debt.id));
assert.equal(Number((await request("/finance/bootstrap",{cookie:owner})).data.accounts.find(x=>x.id===bank.id).balance),startBank,
 "Payoff recommendations must not automatically move cash");

// Spreadsheet contract: atomic multirow edits, audit per mutation and real ledger unchanged.
const sheetBefore=(await request("/finance/cashflow?month="+monthly,{cookie:owner})).data;
const fundForSheet=sheetBefore.debtFunds.find(x=>x.debt_id===createdDebtPlan.debt.id);
const goalForSheet=sheetBefore.goalFunds.find(x=>x.goal_id===createdGoalPlan.goal.id);
assert(fundForSheet.updated_at&&goalForSheet.updated_at,"Monthly allocations must expose concurrency versions");
const newUnfundedDebt=(await post("/debts",{name:"Nợ mẹ chưa lập quỹ",currencyCode:"TWD",
 principalOriginal:"9200",annualInterestPercent:"0",dueDate:monthly+"-25"})).debt;
const addExistingDebtFund={op:"createFund",fundType:"debt",debtId:newUnfundedDebt.id,plannedAmount:"3200"};
const itemToCreate={op:"createItem",kind:"expense",label:"Bảng tính kiểm thử",originalAmount:"1800",
 currencyCode:"TWD",dueDay:21,memo:"Xác minh lưu theo lô"};
const editFund={op:"updateFund",fundType:"debt",id:fundForSheet.id,version:fundForSheet.updated_at,plannedAmount:"3000"};
assert.equal((await request("/finance/cashflow/sheet/batch",{method:"POST",body:{month:monthly,operations:[itemToCreate]}})).status,401);
assert.equal((await request("/finance/cashflow/sheet/batch",{method:"POST",cookie:stranger,body:{month:monthly,operations:[itemToCreate]}})).status,403);
assert.equal((await request("/finance/cashflow/sheet/batch",{method:"POST",cookie:owner,write:false,body:{month:monthly,operations:[itemToCreate]}})).status,403);
const incorrectVersion=await request("/finance/cashflow/sheet/batch",{method:"POST",cookie:owner,
 body:{month:monthly,operations:[itemToCreate,{...editFund,version:"2020-01-01 00:00:00+00"}]}});
assert.equal(incorrectVersion.status,409,"Stale versions fail the entire batch");
const afterRollback=(await request("/finance/cashflow?month="+monthly,{cookie:owner})).data;
assert(!afterRollback.items.some(x=>x.label==="Bảng tính kiểm thử"),"Failed batch may not partially create rows");
assert.equal(Number(afterRollback.debtFunds.find(x=>x.id===fundForSheet.id).planned_amount),2500,"Failed batch may not change debt reserve");
const successfulSheet=await request("/finance/cashflow/sheet/batch",{method:"POST",cookie:owner,
 body:{month:monthly,operations:[itemToCreate,editFund,addExistingDebtFund,
  {op:"deleteFund",fundType:"goal",id:goalForSheet.id,version:goalForSheet.updated_at}]}});
assert.equal(successfulSheet.status,200,JSON.stringify(successfulSheet.data));
assert.equal(successfulSheet.data.saved,4);
assert.equal(successfulSheet.data.ledgerPosted,false);
const afterSheet=(await request("/finance/cashflow?month="+monthly,{cookie:owner})).data;
assert(afterSheet.items.some(x=>x.label==="Bảng tính kiểm thử"));
assert.equal(Number(afterSheet.debtFunds.find(x=>x.id===fundForSheet.id).planned_amount),3000);
const createdFund=afterSheet.debtFunds.find(x=>x.debt_id===newUnfundedDebt.id);
assert(createdFund,"New monthly fund must link to an existing active debt");
assert.equal(Number(createdFund.planned_amount),3200);
const debtMaster=(await request("/finance/bootstrap",{cookie:owner})).data.debts.find(x=>x.id===newUnfundedDebt.id);
assert.equal(Number(debtMaster.outstanding_amount),9200,"Creating monthly fund cannot modify debt principal");
const duplicatedFund=await request("/finance/cashflow/sheet/batch",{method:"POST",cookie:owner,
 body:{month:monthly,operations:[{...itemToCreate,label:"MUST ROLLBACK"},addExistingDebtFund]}});
assert.equal(duplicatedFund.status,409,"Same creditor cannot get a second monthly allocation");
const afterDuplicate=(await request("/finance/cashflow?month="+monthly,{cookie:owner})).data;
assert(!afterDuplicate.items.some(x=>x.label==="MUST ROLLBACK"),"A duplicate fund rolls back the entire batch");
assert.equal(afterDuplicate.debtFunds.filter(x=>x.debt_id===newUnfundedDebt.id).length,1);
const forgedFund=await request("/finance/cashflow/sheet/batch",{method:"POST",cookie:owner,
 body:{month:monthly,operations:[{...addExistingDebtFund,debtId:crypto.randomUUID()}]}});
assert.equal(forgedFund.status,400,"Cannot allocate a fund to another/nonexistent debt");
assert(!afterSheet.goalFunds.some(x=>x.id===goalForSheet.id),"Deleting a goal allocation does not delete goal master");
assert((await request("/finance/bootstrap",{cookie:owner})).data.goals.some(x=>x.id===createdGoalPlan.goal.id));
assert.equal(Number((await request("/finance/bootstrap",{cookie:owner})).data.accounts.find(x=>x.id===bank.id).balance),startBank,
 "Spreadsheet edits may not post or remove real transactions");
const auditSheet=new pg.Client({host:process.env.FINANCE_DB_HOST,port:Number(process.env.FINANCE_DB_PORT||5432),
 database:process.env.FINANCE_DB_NAME,user:process.env.FINANCE_DB_USER,password:process.env.FINANCE_DB_PASSWORD});
await auditSheet.connect();
try{
 const a=await auditSheet.query("SELECT count(*)::int AS n FROM finance.audit_events WHERE owner_user_id=$1 AND action LIKE 'finance.sheet.%'",[process.env.FINANCE_OWNER_USER_ID]);
 assert.equal(a.rows[0].n,4,"Each successful spreadsheet change is audited once");
}finally{await auditSheet.end();}


 // Editing/removing Finance master records is owner-scoped and does not change
 // the posted ledger. Only unposted master data is eligible for deletion.
 const unusedWallet=(await post("/accounts",{name:"Ví dùng thử",kind:"cash",currencyCode:"TWD"})).account;
 const editWallet=await request("/finance/accounts/"+unusedWallet.id,{method:"PUT",cookie:owner,
  body:{name:"Ví đã đổi tên",kind:"ewallet"}});
 assert.equal(editWallet.status,200,JSON.stringify(editWallet.data));
 assert.equal(editWallet.data.account.name,"Ví đã đổi tên");
 assert.equal((await request("/finance/accounts/"+unusedWallet.id,{method:"DELETE",cookie:stranger,body:{}})).status,403);
 assert.equal((await request("/finance/accounts/"+unusedWallet.id,{method:"DELETE",cookie:owner,body:{}})).status,200);
 assert.equal((await request("/finance/accounts/"+bank.id,{method:"DELETE",cookie:owner,body:{}})).status,409,
  "A posted wallet cannot be deleted");

 const unusedCategory=(await post("/categories",{name:"Thu thử không dùng",kind:"income"})).category;
 const renameCategory=await request("/finance/categories/"+unusedCategory.id,{method:"PUT",cookie:owner,
  body:{name:"Thu thử đổi tên"}});
 assert.equal(renameCategory.status,200,JSON.stringify(renameCategory.data));
 assert.equal(renameCategory.data.category.kind,"income");
 assert.equal((await request("/finance/categories/"+unusedCategory.id,{method:"DELETE",cookie:owner,body:{}})).status,200);
 assert.equal((await request("/finance/categories/"+salary.id,{method:"DELETE",cookie:owner,body:{}})).status,409);

 const removableGoal=(await post("/goals",{name:"Mục tiêu xóa được",currencyCode:"TWD",
  targetAmount:"1000",targetDate:monthly+"-27"})).goal;
 const goalEdit=await request("/finance/goals/"+removableGoal.id,{method:"PUT",cookie:owner,
  body:{name:"Mục tiêu đã sửa",targetAmount:"2000",currentAmount:"150",targetDate:monthly+"-25",status:"active"}});
 assert.equal(goalEdit.status,200,JSON.stringify(goalEdit.data));
 assert.equal(goalEdit.data.goal.name,"Mục tiêu đã sửa");
 assert.equal(Number(goalEdit.data.goal.target_amount),2000);
 assert.equal(goalEdit.data.goal.target_date,monthly+"-25");
 assert.equal((await request("/finance/goals/"+removableGoal.id,{method:"DELETE",cookie:owner,body:{}})).status,200);
 assert(!(await request("/finance/bootstrap",{cookie:owner})).data.goals.some(g=>g.id===removableGoal.id));

 const removableDebt=(await post("/debts",{name:"Nợ chưa phát sinh",currencyCode:"TWD",
  principalOriginal:"1000",annualInterestPercent:"0",dueDate:monthly+"-25"})).debt;
 assert.equal((await request("/finance/debts/"+removableDebt.id,{method:"DELETE",cookie:stranger,body:{}})).status,403);
 assert.equal((await request("/finance/debts/"+removableDebt.id,{method:"DELETE",cookie:owner,body:{}})).status,200);
 assert.equal((await request("/finance/debts/"+debt.id,{method:"DELETE",cookie:owner,body:{}})).status,409,
  "Any debt with a posted repayment is immutable");

 // Posted income corrections use reversal + replacement, never UPDATE or DELETE.
 // Correct and then cancel the corrected entry to restore the exact starting balance.
 const ledgerWallet=(await post("/accounts",{name:"Ví kiểm thử sửa giao dịch",kind:"cash",currencyCode:"TWD"})).account;
 const ledgerCategory=(await post("/categories",{name:"Thu nhập kiểm thử sửa",kind:"income"})).category;
 const posted=(await post("/transactions",{kind:"income",accountId:ledgerWallet.id,
  categoryId:ledgerCategory.id,currencyCode:"TWD",amount:"120",
  description:"Ghi sai ban đầu",occurredAt:new Date().toISOString(),
  toTwdRate:"1",idempotencyKey:key()})).event;
 const correctPath="/finance/transactions/"+posted.id+"/adjust";
 const corrected=await request(correctPath,{method:"POST",cookie:owner,
  body:{action:"correct",idempotencyKey:key(),correction:{amount:"150",
   categoryId:ledgerCategory.id,occurredAt:new Date().toISOString(),description:"Sửa thành 150"}}});
 assert.equal(corrected.status,200,JSON.stringify(corrected.data));
 assert(corrected.data.adjustment.replacementEventId);
 const originalAfter=(await request("/finance/overview?month="+monthly,{cookie:owner})).data.events.find(e=>e.id===posted.id);
 assert(originalAfter?.reversed,"Original posted income should be visibly reversed");
 const walletAfterCorrection=(await request("/finance/bootstrap",{cookie:owner})).data.accounts.find(a=>a.id===ledgerWallet.id);
 assert.equal(Number(walletAfterCorrection.balance),150,"Correction replaces the original amount, not doubles it");
 assert.equal((await request(correctPath,{method:"POST",cookie:owner,
  body:{action:"reverse",idempotencyKey:key()}})).status,409,"Prevent reversing one original twice");
 const replacementId=corrected.data.adjustment.replacementEventId;
 assert.equal((await request("/finance/transactions/"+replacementId+"/adjust",{method:"POST",cookie:stranger,
  body:{action:"reverse",idempotencyKey:key()}})).status,403);
 const cancelled=await request("/finance/transactions/"+replacementId+"/adjust",{method:"POST",cookie:owner,
  body:{action:"reverse",idempotencyKey:key()}});
 assert.equal(cancelled.status,200,JSON.stringify(cancelled.data));
 const walletAfterCancel=(await request("/finance/bootstrap",{cookie:owner})).data.accounts.find(a=>a.id===ledgerWallet.id);
 assert.equal(Number(walletAfterCancel.balance),0,"Cancel corrected transaction restores wallet balance");
 assert.equal((await request("/finance/transactions/"+replacementId+"/adjust",{method:"POST",cookie:owner,
  body:{action:"reverse",idempotencyKey:key()}})).status,409);
 const allPosted=(await request("/finance/overview?month="+monthly,{cookie:owner})).data.flow;
 assert(!allPosted.some(x=>Number(x.total_twd)<0),"Correction must preserve valid overview aggregates");

// Actual borrowing must create precisely one linked debt + posted wallet receipt.
// It is financing, not salary/income, and must flow to the existing Mentor/forecast.
const borrowWallet=(await post("/accounts",{name:"Ví nhận vay thực tế",kind:"bank",currencyCode:"TWD"})).account;
const borrowKey=key(),receiptDate=monthly+"-20";
const loanBody={name:"Bạn thân cho vay · test",creditorType:"friend_family",currencyCode:"TWD",
  accountId:borrowWallet.id,principalOriginal:"20000",annualInterestPercent:"0",
  receivedDate:receiptDate,dueDate:monthly+"-28",idempotencyKey:borrowKey};
const loanBefore=(await request("/finance/overview?month="+monthly,{cookie:owner})).data;
const earlierDebts=(await request("/finance/bootstrap",{cookie:owner})).data.debts.length;
assert.equal((await request("/finance/loan-receipts",{method:"POST",body:loanBody})).status,401);
assert.equal((await request("/finance/loan-receipts",{method:"POST",cookie:stranger,body:loanBody})).status,403);
assert.equal((await request("/finance/loan-receipts",{method:"POST",cookie:owner,write:false,body:loanBody})).status,403);
const badWallet=await request("/finance/loan-receipts",{method:"POST",cookie:owner,
  body:{...loanBody,idempotencyKey:key(),currencyCode:"VND",principalOriginal:"2000000",fxRateToTwd:"0.00004"}});
assert.equal(badWallet.status,400,"Loan currency must equal target wallet currency");
assert.equal((await request("/finance/bootstrap",{cookie:owner})).data.debts.length,earlierDebts,
 "Invalid loan receipt must not create a debt, event or wallet entry");
const postedLoan=await post("/loan-receipts",loanBody);
assert(postedLoan.debt.id&&postedLoan.receipt.eventId);
const loanAfter=(await request("/finance/bootstrap",{cookie:owner})).data;
assert.equal(loanAfter.debts.length,earlierDebts+1);
assert.equal(Number(loanAfter.accounts.find(x=>x.id===borrowWallet.id).balance),20000);
assert.equal(Number(loanAfter.debts.find(x=>x.id===postedLoan.debt.id).outstanding_amount),20000);
assert.equal(Number(loanAfter.debts.find(x=>x.id===postedLoan.debt.id).received_amount),20000);
const creditedOverview=(await request("/finance/overview?month="+monthly,{cookie:owner})).data;
assert.equal(Number(creditedOverview.financing.borrowing_twd)-Number(loanBefore.financing.borrowing_twd),20000);
assert.equal(Number(creditedOverview.flow.find(x=>x.kind==="income")?.total_twd||0),
 Number(loanBefore.flow.find(x=>x.kind==="income")?.total_twd||0),
 "Cash borrowed must NOT inflate earned income or salary reports");
assert(creditedOverview.events.some(x=>x.id===postedLoan.receipt.eventId&&x.kind==="borrowing"));
const mentorLoan=(await request("/finance/mentor/obligations",{cookie:owner})).data.debts.find(x=>x.id===postedLoan.debt.id);
assert.equal(mentorLoan?.creditor_type,"friend_family");
assert.equal(mentorLoan?.obligation_type,"unconfirmed","Do not infer contractual payment terms");
assert.equal((await request("/finance/loan-receipts",{method:"POST",cookie:owner,body:loanBody})).status,409,
 "A repeated loan funding idempotency key must not mint money twice");
assert.equal((await request("/finance/debts/"+postedLoan.debt.id,{method:"DELETE",cookie:owner,body:{}})).status,409,
 "Posted loan liabilities cannot be deleted even before first repayment");
assert.equal(Number((await request("/finance/bootstrap",{cookie:owner})).data.accounts.find(x=>x.id===borrowWallet.id).balance),20000);
const payLoan=await post("/debt-payments",{debtId:postedLoan.debt.id,accountId:borrowWallet.id,paymentDate:receiptDate,
  principalPaid:"2000",interestPaid:"100",feePaid:"0",fxRateToTwd:"1",memo:"Trả gốc + lãi",idempotencyKey:key()});
assert(payLoan.payment.id);
const loanFinal=(await request("/finance/bootstrap",{cookie:owner})).data;
assert.equal(Number(loanFinal.accounts.find(x=>x.id===borrowWallet.id).balance),17900);
assert.equal(Number(loanFinal.debts.find(x=>x.id===postedLoan.debt.id).outstanding_amount),18000);
const paidOverview=(await request("/finance/overview?month="+monthly,{cookie:owner})).data;
assert.equal(Number(paidOverview.financing.debt_paid_twd)-Number(loanBefore.financing.debt_paid_twd),2100);
assert.equal(Number(paidOverview.flow.find(x=>x.kind==="income")?.total_twd||0),
 Number(loanBefore.flow.find(x=>x.kind==="income")?.total_twd||0));
const afterPreview=await request("/finance/workbench/preview",{method:"POST",cookie:owner,
 body:{scenario:{name:"Dòng tiền theo nợ đã ghi",months:3,salaryDay:10,bufferTwd:"0",
  monthlyExtraIncomeTwd:"0",rows:[]}}});
assert.equal(afterPreview.status,200,JSON.stringify(afterPreview.data));
assert(!afterPreview.data.projection.timeline.some(x=>x.kind==="borrow"),
 "An already-posted loan must only count in wallet opening, not be added to future salary or income");
const loanDate=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
const repayDate=new Date(Date.now()+17*86400000).toISOString().slice(0,10);
const simulatedLoan=await request("/finance/workbench/preview",{method:"POST",cookie:owner,
 body:{scenario:{name:"Vay tạm rồi trả",months:3,salaryDay:10,bufferTwd:"0",monthlyExtraIncomeTwd:"0",
  rows:[{key:key(),linkId:"hypothetical-loan",kind:"borrow",date:loanDate,
    label:"Bạn bè cho vay giả định",amountTwd:"1000"},
   {key:key(),linkId:"hypothetical-loan",kind:"repay",date:repayDate,
    label:"Trả cả gốc lãi giả định",amountTwd:"1030"}]}}});
assert.equal(simulatedLoan.status,200,JSON.stringify(simulatedLoan.data));
assert.equal(simulatedLoan.data.projection.loans[0].financingCostTwd,"30");
assert.equal(Number((await request("/finance/bootstrap",{cookie:owner})).data.accounts.find(x=>x.id===borrowWallet.id).balance),17900,
 "Previewing a future loan/repayment pair cannot post either transaction");


console.log("PASS monthly cashflow CRUD, multi-currency debt reserve, actual repayment immutable ledger, idempotency/RBAC, year summary and no phantom money, loan financing classification and linked Mentor obligations");

