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
  assert.equal(aud.rows[0].count,28,"Goal fund save/edit add two owner-scoped audited planning changes");
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

// Linked liability write from the plan: source of truth is ONE debt row and
// ONE monthly allocation; cashflow_items and real entries are not duplicated.
const linkedBody={name:"Nợ được tạo từ Kế hoạch",currencyCode:"VND",principalOriginal:"22000000",
 annualInterestPercent:"18",dueDate:monthly+"-28",memo:"Trả trước hạn bằng dòng lương",
 month:monthly,plannedAmount:"5000000",earmarkedAmount:"0",fromPlanning:true};
const deniedLinked=await request("/finance/linked-debts",{method:"POST",cookie:stranger,body:linkedBody});
assert.equal(deniedLinked.status,403);
const missingDueLinked=await request("/finance/linked-debts",{method:"POST",cookie:owner,
 body:{...linkedBody,dueDate:null}});
assert.equal(missingDueLinked.status,400,"Debt entered in monthly planning requires a repayment deadline");
const beforeLink=await request("/finance/cashflow?month="+monthly,{cookie:owner});
const previousItems=beforeLink.data.items.length;
const previousLedger=await request("/finance/bootstrap",{cookie:owner});
const twdBeforeLink=Number(previousLedger.data.accounts.find(a=>a.id===bank.id).balance);
const linked=await request("/finance/linked-debts",{method:"POST",cookie:owner,body:linkedBody});
assert.equal(linked.status,201,JSON.stringify(linked.data));
assert.equal(linked.data.debt.currency_code,"VND");
assert.equal(linked.data.debt.memo,"Trả trước hạn bằng dòng lương");
assert.equal(Number(linked.data.debt.annual_interest_rate),0.18);
const edited=await request("/finance/linked-debts/"+linked.data.debt.id,{method:"PUT",cookie:owner,
 body:{...linkedBody,name:"Nợ đã đồng bộ",plannedAmount:"6000000",
 annualInterestPercent:"12",dueDate:monthly+"-29",memo:"Đã đổi hạn trả"}});
assert.equal(edited.status,200,JSON.stringify(edited.data));
const afterLink=await request("/finance/bootstrap",{cookie:owner});
const debtAgain=afterLink.data.debts.find(d=>d.id===linked.data.debt.id);
assert.equal(debtAgain.name,"Nợ đã đồng bộ");
assert.equal(debtAgain.due_date,monthly+"-29");
assert.equal(Number(debtAgain.annual_interest_rate),0.12);
assert.equal(debtAgain.memo,"Đã đổi hạn trả");
assert.equal(Number(afterLink.data.accounts.find(a=>a.id===bank.id).balance),twdBeforeLink,
 "Planning debt must not post a bank withdrawal or make new income");
const fundAgain=await request("/finance/cashflow?month="+monthly,{cookie:owner});
assert.equal(fundAgain.data.items.length,previousItems,"Do not create a duplicate expense row");
const linkedAllocations=fundAgain.data.debtFunds.filter(x=>x.debt_id===linked.data.debt.id);
assert.equal(linkedAllocations.length,1,"Saving same linked liability must update one monthly fund");
assert.equal(Number(linkedAllocations[0].planned_amount),6000000);
assert(Number(linkedAllocations[0].planned_twd)>0,"Current VND quote should value the allocation");
const goalMeta=await request("/finance/goals/"+goal.id,{method:"PUT",cookie:owner,body:{
 name:"Quỹ học phí có hạn",targetAmount:"60000",targetDate:monthly+"-29",
 currentAmount:"5000",status:"active",memo:"Cần đưa vào lịch kế hoạch"
}});
assert.equal(goalMeta.status,200,JSON.stringify(goalMeta.data));
assert.equal(goalMeta.data.goal.memo,"Cần đưa vào lịch kế hoạch");
const goalSynced=await request("/finance/bootstrap",{cookie:owner});
assert(goalSynced.data.goals.some(g=>g.id===goal.id&&g.target_date===monthly+"-29"&&g.memo==="Cần đưa vào lịch kế hoạch"));
const simpleScenario={name:"Tự phân bổ lương",months:3,salaryDay:10,
 bufferTwd:"0",monthlyExtraIncomeTwd:"0",rows:[]};
const debtPreview=await request("/finance/workbench/preview",{method:"POST",cookie:owner,
 body:{scenario:simpleScenario}});
assert.equal(debtPreview.status,200,JSON.stringify(debtPreview.data));
assert.equal(debtPreview.data.projection.debtStrategy.priority[0],"debt");
assert.equal(debtPreview.data.projection.debtStrategy.months.length,3);
assert(debtPreview.data.projection.debtStrategy.months[0].remainingDebts.some(x=>x.debtId===linked.data.debt.id),
 "Debt and its stored monthly allocation must drive the salary allocation forecast");

console.log("PASS monthly cashflow CRUD, multi-currency debt reserve, actual repayment immutable ledger, idempotency/RBAC, year summary and no phantom money");

