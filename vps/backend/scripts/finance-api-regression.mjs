import assert from "node:assert/strict";
import crypto from "node:crypto";
import pg from "pg";

const BASE=process.env.TEST_API_BASE||"http://127.0.0.1:8080";
const monthly=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit"}).format(new Date()).slice(0,7);
const date=monthly+"-25";
async function request(path,{method="GET",body,cookie,write=true}={}){
  const response=await fetch(BASE+"/api"+path,{
    method,headers:{
      ...(body?{"content-type":"application/json"}:{}),
      ...(cookie?{cookie}:{}),
      ...(write&&method!=="GET" ? {"x-finance-write":"1"}:{})
    },body:body?JSON.stringify(body):undefined
  });
  let data={};try{data=await response.json();}catch{}
  return {status:response.status,data,cookie:response.headers.get("set-cookie")?.split(";")[0]};
}
async function login(name){
 const r=await request("/auth/login",{method:"POST",body:{username:name,password:"KitchenTest!123"}});
 assert.equal(r.status,200,"Login failed: "+name);return r.cookie;
}
const owner=await login("managerfx");
const stranger=await login("yangchuadmin");
assert.equal((await request("/finance/bootstrap")).status,401,"anonymous finance read must fail");
assert.equal((await request("/finance/bootstrap",{cookie:stranger})).status,403,"restaurant super admin must not inherit private finance owner rights");
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
const salary=(await post("/categories",{name:"Lương",kind:"income"})).category;
const rent=(await post("/categories",{name:"Nhà ở",kind:"expense"})).category;
const food=(await post("/categories",{name:"Ăn uống",kind:"expense"})).category;
const budget=await request("/finance/budgets",{method:"PUT",cookie:owner,body:{categoryId:rent.id,month:monthly,amountTwd:"6000"}});
assert.equal(budget.status,200,JSON.stringify(budget.data));
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
const invalidFx=await request("/finance/transactions",{method:"POST",cookie:owner,body:{idempotencyKey:key(),kind:"fx",accountId:bank.id,targetAccountId:cash.id,amount:"10",receivedAmount:"10"}});
assert.equal(invalidFx.status,400,"FX cannot convert the same currency");
const invalidExpense=await request("/finance/transactions",{method:"POST",cookie:owner,body:{idempotencyKey:key(),kind:"expense",accountId:usd.id,categoryId:food.id,amount:"1.00"}});
assert.equal(invalidExpense.status,400,"foreign-currency expense must preserve FX-to-TWD rate");
snap=await request("/finance/bootstrap",{cookie:owner});
assert.equal(Number(snap.data.accounts.find(a=>a.id===bank.id).balance),40900);
assert.equal(Number(snap.data.accounts.find(a=>a.id===cash.id).balance),1000);
assert.equal(Number(snap.data.accounts.find(a=>a.id===vnd.id).balance),7850000);
assert.equal(Number(snap.data.accounts.find(a=>a.id===usd.id).balance),10.5);
assert.equal(snap.data.plans.length,1);
assert.equal(snap.data.currencies.length,6);
overview=await request("/finance/overview?month="+monthly,{cookie:owner});
assert.equal(Number(overview.data.flow.find(x=>x.kind==="expense").total_twd),6000,"FX fees and wallet transfers must not become consumption expense");
assert.equal(Number(overview.data.flow.find(x=>x.kind==="income").total_twd),58316.05);
const year=await request("/finance/year?year="+monthly.slice(0,4),{cookie:owner});
assert.equal(year.status,200);
assert.equal(year.data.months.length,12);
assert.equal(Number(year.data.months.find(m=>m.month===monthly).budget_twd),6000);
assert.equal(Number(year.data.months.find(m=>m.month===monthly).expense_twd),6000);
const db=new pg.Client({host:process.env.FINANCE_DB_HOST,port:Number(process.env.FINANCE_DB_PORT||5432),database:process.env.FINANCE_DB_NAME,user:process.env.FINANCE_DB_USER,password:process.env.FINANCE_DB_PASSWORD});
await db.connect();
try{
  const ledger=await db.query("SELECT count(*)::int as count FROM finance.entries WHERE owner_user_id=$1",[process.env.FINANCE_OWNER_USER_ID]);
  const aud=await db.query("SELECT count(*)::int as count FROM finance.audit_events WHERE owner_user_id=$1",[process.env.FINANCE_OWNER_USER_ID]);
  assert.equal(ledger.rows[0].count,7,"income + expense + 2 transfers + 3 FX entries + USD income = 8? check ledger");
  assert.equal(aud.rows[0].count,5);
  let blocked=false;
  try{await db.query("UPDATE finance.events SET description='tampered' WHERE owner_user_id=$1",[process.env.FINANCE_OWNER_USER_ID]);}
  catch(e){blocked=e.message.includes("POSTED_FINANCE_EVENTS_ARE_IMMUTABLE");}
  assert.equal(blocked,true,"posted event must be immutable");
}finally{await db.end();}
console.log("PASS authenticated owner-only private finance DB, idempotency, balances, FX, budgets and annual summaries");
