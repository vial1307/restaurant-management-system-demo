import crypto from "node:crypto";
import { requireUser } from "./auth.mjs";
import { financeConfigured, getFinancePool, financeTransaction } from "./finance-db.mjs";
import { registerFinancePlanningRoutes } from "./finance-planning-routes.mjs";
import { registerFinanceAdvisorRoutes } from "./finance-advisor-routes.mjs";
import { registerFinanceScenarioRoutes } from "./finance-scenario-routes.mjs";
import {getFinanceFxSnapshot} from "./finance-fx-valuation.mjs";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO=/^[A-Z]{3}$/;
const AMOUNT=/^(?:0|[1-9]\d{0,15})(?:\.\d{1,6})?$/;
const RATE=/^(?:0|[1-9]\d{0,11})(?:\.\d{1,12})?$/;
const monthKey=value=>typeof value==="string"&&/^\d{4}-(0[1-9]|1[0-2])$/.test(value)?value:null;
const isDate=value=>typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+"T12:00:00Z"))&&new Date(value+"T12:00:00Z").toISOString().slice(0,10)===value;
const money=(value,minor)=>typeof value==="string"&&AMOUNT.test(value)&&value.split(".")[1]?.length<=minor||typeof value==="string"&&AMOUNT.test(value)&&!value.includes(".");
// Strictly forbid precision beyond the target currency's minor units.
const positive=(value,minor)=>money(value,minor)&&Number(value)>0;
const positiveRate=value=>typeof value==="string"&&RATE.test(value)&&Number(value)>0;
const trim=(value,max=150)=>String(value??"").trim().slice(0,max);
const id=value=>typeof value==="string"&&UUID.test(value);
const fail=(reply,code,status=400)=>reply.code(status).send({error:code});

async function authorized(request,reply,{write=false}={}) {
  const user=await requireUser(request,reply);
  if (!user) return null;
  // Absence of finance configuration always fails closed, and never leaks owner data.
  if (!financeConfigured()) { fail(reply,"FINANCE_NOT_CONFIGURED",503); return null; }
  if (String(user.id).toLowerCase()!==String(process.env.FINANCE_OWNER_USER_ID).toLowerCase()) {
    fail(reply,"FINANCE_OWNER_REQUIRED",403); return null;
  }
  // Custom JSON-only write header prevents a cross-site HTML form submitting a finance mutation.
  if (write && request.headers["x-finance-write"]!=="1") {
    fail(reply,"FINANCE_WRITE_HEADER_REQUIRED",403); return null;
  }
  return {user,owner:user.id,pool:getFinancePool()};
}
function databaseError(request,reply,error) {
  request.log.error({code:error?.code||"FINANCE_DATABASE_ERROR",message:"finance database operation failed"},"finance operation failed");
  if (["23503","23514","22P02","22003"].includes(error?.code)) return fail(reply,"FINANCE_VALIDATION_ERROR",400);
  if (error?.code==="23505") return fail(reply,"FINANCE_DUPLICATE",409);
  return fail(reply,"FINANCE_DATABASE_UNAVAILABLE",503);
}
async function account(client,owner,accountId) {
  const {rows}=await client.query(
    "SELECT a.id,a.currency_code,c.minor_units FROM finance.accounts a JOIN finance.currencies c ON c.code=a.currency_code WHERE a.owner_user_id=$1 AND a.id=$2 AND a.active=true FOR UPDATE OF a",
    [owner,accountId]
  );
  return rows[0]||null;
}
async function currency(client,code) {
  const {rows}=await client.query("SELECT code,minor_units FROM finance.currencies WHERE code=$1 AND enabled=true",[code]);
  return rows[0]||null;
}
async function createEvent(client,owner,kind,description,occurredAt,key) {
  const {rows}=await client.query(
    "INSERT INTO finance.events(owner_user_id,kind,description,occurred_at,idempotency_key) VALUES($1,$2,$3,$4,$5) ON CONFLICT(owner_user_id,idempotency_key) DO NOTHING RETURNING id",
    [owner,kind,description,occurredAt,key]
  );
  return rows[0]?.id||null;
}
async function entry(client,owner,eventId,accountRecord,amount,categoryId=null,toTwdRate=null) {
  await client.query(
    "INSERT INTO finance.entries(event_id,owner_user_id,account_id,currency_code,amount,category_id,base_amount_twd,fx_rate_to_twd) VALUES($1,$2,$3,$4,$5::numeric,$6,CASE WHEN $7::numeric IS NULL THEN NULL ELSE $5::numeric*$7::numeric END,$7::numeric)",
    [eventId,owner,accountRecord.id,accountRecord.currency_code,amount,categoryId,toTwdRate]
  );
}
async function audit(client,owner,action,entityId,metadata={},entityType="finance_event") {
  await client.query(
    "INSERT INTO finance.audit_events(owner_user_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$1,$2,$3,$4,$5::jsonb)",
    [owner,action,entityType,entityId,JSON.stringify(metadata)]
  );
}
async function auditedWrite(ctx,action,entityType,writer) {
  return financeTransaction(async client=>{
    const saved=await writer(client);
    if(saved?.id)await audit(client,ctx.owner,action,saved.id,{},entityType);
    return saved;
  });
}
export async function registerFinanceRoutes(app) {
  app.get("/api/finance/access",async(request,reply)=>{
    const ctx=await authorized(request,reply);if(!ctx)return;
    try { await ctx.pool.query("SELECT 1 FROM finance.schema_migrations LIMIT 1");return {allowed:true}; }
    catch(error){return databaseError(request,reply,error);}
  });
  // Automatic INDICATIVE currency valuation; never posts FX trades or ledger entries.
  app.get("/api/finance/fx/estimates",async(request,reply)=>{
    const ctx=await authorized(request,reply);if(!ctx)return;
    try{
      const snapshot=await getFinanceFxSnapshot(ctx.pool);
      reply.header("Cache-Control","private, no-store");
      return snapshot;
    }catch(error){return databaseError(request,reply,error);}
  });
  app.get("/api/finance/bootstrap",async(request,reply)=>{
    const ctx=await authorized(request,reply);if(!ctx)return;
    try {
      const [currencies,accounts,categories,budgets,plans,goals,debts]=await Promise.all([
        ctx.pool.query("SELECT code,name_vi,symbol,minor_units FROM finance.currencies WHERE enabled=true ORDER BY CASE code WHEN 'TWD' THEN 0 WHEN 'VND' THEN 1 ELSE 2 END,code"),
        ctx.pool.query("SELECT a.id,a.name,a.kind,a.currency_code,a.created_at,COALESCE(SUM(e.amount),0)::text AS balance FROM finance.accounts a LEFT JOIN finance.entries e ON e.account_id=a.id AND e.owner_user_id=a.owner_user_id WHERE a.owner_user_id=$1 AND a.active=true GROUP BY a.id ORDER BY a.created_at",[ctx.owner]),
        ctx.pool.query("SELECT id,name,kind FROM finance.categories WHERE owner_user_id=$1 ORDER BY kind,name",[ctx.owner]),
        ctx.pool.query("SELECT b.id,b.category_id,b.month_date::text AS month_date,b.amount_twd::text AS amount_twd,c.name AS category_name FROM finance.monthly_budgets b JOIN finance.categories c ON c.id=b.category_id AND c.owner_user_id=b.owner_user_id WHERE b.owner_user_id=$1 AND b.month_date>=date_trunc('month',CURRENT_DATE)-interval '12 months' ORDER BY b.month_date DESC,c.name",[ctx.owner]),
        ctx.pool.query("SELECT id,plan_date::text AS plan_date,plan_kind,from_currency,to_currency,source_amount::text AS source_amount,expected_rate::text AS expected_rate,expected_fee::text AS expected_fee,status,memo FROM finance.fx_plans WHERE owner_user_id=$1 ORDER BY plan_date DESC,created_at DESC LIMIT 100",[ctx.owner]),
        ctx.pool.query("SELECT id,name,currency_code,target_amount::text,current_amount::text,target_date::text,status,memo FROM finance.goals WHERE owner_user_id=$1 ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END,target_date NULLS LAST,created_at DESC LIMIT 100",[ctx.owner]),
        ctx.pool.query("SELECT d.id,d.name,d.currency_code,d.principal_original::text,d.annual_interest_rate::text,d.due_date::text,d.memo,COALESCE(SUM(p.principal_paid),0)::text AS principal_paid,(d.principal_original-COALESCE(SUM(p.principal_paid),0))::text AS outstanding_amount FROM finance.debts d LEFT JOIN finance.debt_payments p ON p.debt_id=d.id AND p.owner_user_id=d.owner_user_id WHERE d.owner_user_id=$1 GROUP BY d.id ORDER BY d.due_date NULLS LAST,d.created_at DESC LIMIT 100",[ctx.owner])
      ]);
      return {currencies:currencies.rows,accounts:accounts.rows,categories:categories.rows,budgets:budgets.rows,plans:plans.rows,goals:goals.rows,debts:debts.rows,reportCurrency:"TWD"};
    } catch(error){return databaseError(request,reply,error);}
  });
  app.get("/api/finance/overview",async(request,reply)=>{
    const ctx=await authorized(request,reply);if(!ctx)return;
    const month=monthKey(request.query?.month);
    if(!month)return fail(reply,"INVALID_MONTH");
    const start=month+"-01";
    try {
      const [flow,budget,events]=await Promise.all([
        ctx.pool.query(
          "SELECT v.kind,COALESCE(SUM(ABS(v.base_amount_twd)),0)::text AS total_twd FROM (SELECT ev.kind,en.base_amount_twd FROM finance.events ev JOIN finance.entries en ON en.event_id=ev.id AND en.owner_user_id=ev.owner_user_id WHERE ev.owner_user_id=$1 AND ev.kind IN ('income','expense') AND ev.occurred_at >= ($2::date AT TIME ZONE 'Asia/Taipei') AND ev.occurred_at < (($2::date+interval '1 month') AT TIME ZONE 'Asia/Taipei')) v GROUP BY v.kind",
          [ctx.owner,start]
        ),
        ctx.pool.query(
          "SELECT c.id AS category_id,c.name,c.kind,COALESCE(b.amount_twd,0)::text AS budget_twd,COALESCE((SELECT SUM(ABS(en.base_amount_twd)) FROM finance.entries en JOIN finance.events ev ON ev.id=en.event_id AND ev.owner_user_id=en.owner_user_id WHERE en.owner_user_id=$1 AND en.category_id=c.id AND ev.kind=c.kind AND ev.occurred_at >= ($2::date AT TIME ZONE 'Asia/Taipei') AND ev.occurred_at < (($2::date+interval '1 month') AT TIME ZONE 'Asia/Taipei')),0)::text AS actual_twd FROM finance.categories c LEFT JOIN finance.monthly_budgets b ON b.owner_user_id=c.owner_user_id AND b.category_id=c.id AND b.month_date=$2::date WHERE c.owner_user_id=$1 ORDER BY c.kind,c.name",
          [ctx.owner,start]
        ),
        ctx.pool.query(
          "SELECT ev.id,ev.kind,ev.description,ev.occurred_at,COALESCE(json_agg(json_build_object('accountId',en.account_id,'amount',en.amount::text,'currency',en.currency_code,'categoryId',en.category_id)) FILTER (WHERE en.id IS NOT NULL),'[]'::json) AS entries FROM finance.events ev LEFT JOIN finance.entries en ON en.event_id=ev.id AND en.owner_user_id=ev.owner_user_id WHERE ev.owner_user_id=$1 AND ev.occurred_at >= ($2::date AT TIME ZONE 'Asia/Taipei') AND ev.occurred_at < (($2::date+interval '1 month') AT TIME ZONE 'Asia/Taipei') GROUP BY ev.id ORDER BY ev.occurred_at DESC,ev.id DESC LIMIT 60",
          [ctx.owner,start]
        )
      ]);
      return {month,flow:flow.rows,budget:budget.rows,events:events.rows};
    } catch(error){return databaseError(request,reply,error);}
  });
  app.get("/api/finance/year",async(request,reply)=>{
    const ctx=await authorized(request,reply);if(!ctx)return;
    const year=Number(request.query?.year);
    if(!Number.isInteger(year)||year<2000||year>2100)return fail(reply,"INVALID_YEAR");
    try{
      const {rows}=await ctx.pool.query(
        "WITH months AS (SELECT generate_series(make_date($2::int,1,1),make_date($2::int,12,1),interval '1 month')::date AS first_day) SELECT to_char(m.first_day,'YYYY-MM') AS month, COALESCE((SELECT SUM(b.amount_twd) FROM finance.monthly_budgets b JOIN finance.categories c ON c.id=b.category_id AND c.owner_user_id=b.owner_user_id WHERE b.owner_user_id=$1 AND b.month_date=m.first_day AND c.kind='expense'),0)::text AS budget_twd, COALESCE((SELECT SUM(ABS(en.base_amount_twd)) FROM finance.entries en JOIN finance.events ev ON ev.id=en.event_id AND ev.owner_user_id=en.owner_user_id WHERE en.owner_user_id=$1 AND ev.kind='income' AND ev.occurred_at>=(m.first_day AT TIME ZONE 'Asia/Taipei') AND ev.occurred_at<((m.first_day+interval '1 month') AT TIME ZONE 'Asia/Taipei')),0)::text AS income_twd, COALESCE((SELECT SUM(ABS(en.base_amount_twd)) FROM finance.entries en JOIN finance.events ev ON ev.id=en.event_id AND ev.owner_user_id=en.owner_user_id WHERE en.owner_user_id=$1 AND ev.kind='expense' AND ev.occurred_at>=(m.first_day AT TIME ZONE 'Asia/Taipei') AND ev.occurred_at<((m.first_day+interval '1 month') AT TIME ZONE 'Asia/Taipei')),0)::text AS expense_twd FROM months m ORDER BY m.first_day",
        [ctx.owner,year]
      );
      return {year,months:rows};
    }catch(error){return databaseError(request,reply,error);}
  });
  app.post("/api/finance/accounts",async(request,reply)=>{
    const ctx=await authorized(request,reply,{write:true});if(!ctx)return;
    const {name,kind,currencyCode}=request.body||{};
    if(!trim(name)||!["cash","bank","ewallet","other"].includes(kind)||!ISO.test(String(currencyCode||"")))return fail(reply,"INVALID_ACCOUNT");
    try{
      const saved=await auditedWrite(ctx,"finance.account.create","finance_account",async db=>{
        const {rows}=await db.query("INSERT INTO finance.accounts(owner_user_id,name,kind,currency_code) SELECT $1,$2,$3,code FROM finance.currencies WHERE code=$4 AND enabled=true RETURNING id,name,kind,currency_code",[ctx.owner,trim(name,120),kind,currencyCode]);
        return rows[0];
      });
      if(!saved)return fail(reply,"UNSUPPORTED_CURRENCY");
      return reply.code(201).send({account:saved});
    }catch(error){return databaseError(request,reply,error);}
  });
  // Owner-only balance reconciliation. Never rewrite the immutable ledger:
  // insert one signed correcting entry after locking the owned account.
  app.post("/api/finance/accounts/:accountId/reconcile",async(request,reply)=>{
    const ctx=await authorized(request,reply,{write:true});if(!ctx)return;
    const accountId=request.params?.accountId,b=request.body||{};
    const signed=/^-?(?:0|[1-9]\d{0,15})(?:\.\d{1,6})?$/;
    const reason=trim(b.reason,250);
    if(!id(accountId)||!id(b.idempotencyKey)||typeof b.targetBalance!=="string"||
       typeof b.expectedBalance!=="string"||!signed.test(b.targetBalance)||!signed.test(b.expectedBalance)||
       reason.length<8)return fail(reply,"INVALID_BALANCE_RECONCILIATION");
    try {
      const result=await financeTransaction(async client=>{
        const wallet=await account(client,ctx.owner,accountId);
        if(!wallet)return {error:"ACCOUNT_NOT_FOUND",status:404};
        const minor=Number(wallet.minor_units);
        const valid=value=>!value.includes(".")||value.split(".")[1].slice(minor).replace(/0/g,"")==="";
        if(!valid(b.targetBalance)||!valid(b.expectedBalance))return {error:"INVALID_CURRENCY_PRECISION"};
        const {rows}=await client.query(
          "SELECT COALESCE(SUM(amount),0)::text AS actual FROM finance.entries WHERE account_id=$1 AND owner_user_id=$2",
          [wallet.id,ctx.owner]);
        const actual=rows[0].actual;
        const diff=await client.query(
          "SELECT ($1::numeric-$2::numeric)::text AS delta,($2::numeric=$3::numeric) AS matches",
          [b.targetBalance,actual,b.expectedBalance]);
        if(!diff.rows[0].matches)return {error:"BALANCE_CHANGED_RELOAD",status:409,actualBalance:actual};
        const delta=diff.rows[0].delta;
        if(Number(delta)===0)return {error:"BALANCE_UNCHANGED",status:409,actualBalance:actual};
        const eventId=await createEvent(client,ctx.owner,"adjustment",
          "Đối soát số dư · "+reason,new Date().toISOString(),b.idempotencyKey);
        if(!eventId)return {error:"FINANCE_DUPLICATE_REQUEST",status:409};
        await entry(client,ctx.owner,eventId,wallet,delta,null,wallet.currency_code==="TWD"?"1":null);
        await audit(client,ctx.owner,"finance.account.balance_reconciled",eventId,{
          accountId:wallet.id,currency:wallet.currency_code,previousBalance:actual,
          targetBalance:b.targetBalance,difference:delta,reason
        },"finance_event");
        return {id:eventId,accountId:wallet.id,currency:wallet.currency_code,
          previousBalance:actual,newBalance:b.targetBalance,delta};
      });
      if(result.error)return reply.code(result.status||400).send({error:result.error,...(result.actualBalance!==undefined?{actualBalance:result.actualBalance}:{})});
      return reply.code(201).send({reconciliation:result});
    }catch(error){return databaseError(request,reply,error);}
  });
  app.post("/api/finance/categories",async(request,reply)=>{
    const ctx=await authorized(request,reply,{write:true});if(!ctx)return;
    const {name,kind}=request.body||{};
    if(!trim(name)||!["income","expense"].includes(kind))return fail(reply,"INVALID_CATEGORY");
    try{
      const saved=await auditedWrite(ctx,"finance.category.create","finance_category",async db=>{
        const {rows}=await db.query("INSERT INTO finance.categories(owner_user_id,name,kind) VALUES($1,$2,$3) RETURNING id,name,kind",[ctx.owner,trim(name,100),kind]);
        return rows[0];
      });
      return reply.code(201).send({category:saved});
    }catch(error){return databaseError(request,reply,error);}
  });
  app.put("/api/finance/budgets",async(request,reply)=>{
    const ctx=await authorized(request,reply,{write:true});if(!ctx)return;
    const {categoryId,month,amountTwd}=request.body||{};
    if(!id(categoryId)||!monthKey(month)||!money(amountTwd,0))return fail(reply,"INVALID_BUDGET");
    try{
      const saved=await auditedWrite(ctx,"finance.budget.save","finance_budget",async db=>{
        const {rows}=await db.query(
        "INSERT INTO finance.monthly_budgets(owner_user_id,category_id,month_date,amount_twd) SELECT $1,c.id,$3::date,$4::numeric FROM finance.categories c WHERE c.id=$2 AND c.owner_user_id=$1 AND c.kind='expense' ON CONFLICT(owner_user_id,category_id,month_date) DO UPDATE SET amount_twd=EXCLUDED.amount_twd,updated_at=now() RETURNING id,month_date::text,amount_twd::text",
        [ctx.owner,categoryId,month+"-01",amountTwd]
      );
        return rows[0];
      });
      if(!saved)return fail(reply,"CATEGORY_NOT_FOUND",404);
      return {budget:saved};
    }catch(error){return databaseError(request,reply,error);}
  });
  app.post("/api/finance/fx-plans",async(request,reply)=>{
    const ctx=await authorized(request,reply,{write:true});if(!ctx)return;
    const b=request.body||{},when=b.planDate;
    if(!isDate(when)||!["fx","remittance"].includes(b.planKind) || !ISO.test(String(b.fromCurrency||"")) || !ISO.test(String(b.toCurrency||"")) || b.fromCurrency===b.toCurrency || !positiveRate(b.expectedRate) && b.expectedRate!==null && b.expectedRate!==undefined && b.expectedRate!=="")return fail(reply,"INVALID_FX_PLAN");
    try{
      const from=await ctx.pool.query("SELECT minor_units FROM finance.currencies WHERE code=$1 AND enabled=true",[b.fromCurrency]);
      const target=await ctx.pool.query("SELECT code FROM finance.currencies WHERE code=$1 AND enabled=true",[b.toCurrency]);
      if(!from.rows[0]||!target.rows[0]||!positive(b.sourceAmount,Number(from.rows[0].minor_units))||!money(b.expectedFee||"0",Number(from.rows[0].minor_units)))return fail(reply,"INVALID_FX_AMOUNT");
      const saved=await auditedWrite(ctx,"finance.fx_plan.create","finance_fx_plan",async db=>{
        const {rows}=await db.query(
        "INSERT INTO finance.fx_plans(owner_user_id,plan_date,plan_kind,from_currency,to_currency,source_amount,expected_rate,expected_fee,memo) VALUES($1,$2,$3,$4,$5,$6::numeric,NULLIF($7,'')::numeric,$8::numeric,$9) RETURNING id,plan_date::text,plan_kind,from_currency,to_currency,source_amount::text,expected_rate::text,expected_fee::text,status",
        [ctx.owner,when,b.planKind,b.fromCurrency,b.toCurrency,b.sourceAmount,b.expectedRate||"",b.expectedFee||"0",trim(b.memo,250)]
      );
        return rows[0];
      });
      return reply.code(201).send({plan:saved});
    }catch(error){return databaseError(request,reply,error);}
  });

  app.post("/api/finance/goals",async(request,reply)=>{
    const ctx=await authorized(request,reply,{write:true});if(!ctx)return;
    const b=request.body||{};
    if(!trim(b.name)||!ISO.test(String(b.currencyCode||""))||!positive(b.targetAmount,6)
      ||(b.targetDate && !isDate(b.targetDate)))return fail(reply,"INVALID_GOAL");
    try{
      const c=await currency(ctx.pool,b.currencyCode);
      if(!c||!positive(b.targetAmount,Number(c.minor_units)))return fail(reply,"INVALID_GOAL_AMOUNT");
      const saved=await auditedWrite(ctx,"finance.goal.create","finance_goal",async db=>{
        const {rows}=await db.query(
        "INSERT INTO finance.goals(owner_user_id,name,currency_code,target_amount,target_date,memo) VALUES($1,$2,$3,$4::numeric,$5::date,$6) RETURNING id,name,currency_code,target_amount::text,current_amount::text,target_date::text,status",
        [ctx.owner,trim(b.name,160),b.currencyCode,b.targetAmount,b.targetDate||null,trim(b.memo,600)||""]
      );
        return rows[0];
      });
      return reply.code(201).send({goal:saved});
    }catch(error){return databaseError(request,reply,error);}
  });
  app.put("/api/finance/goals/:goalId",async(request,reply)=>{
    const ctx=await authorized(request,reply,{write:true});if(!ctx)return;
    const goalId=request.params?.goalId,b=request.body||{};
    if(!id(goalId)||!["active","achieved","archived"].includes(b.status)
      ||typeof b.currentAmount!=="string")return fail(reply,"INVALID_GOAL_UPDATE");
    try{
      const goal=await ctx.pool.query(
        "SELECT c.minor_units FROM finance.goals g JOIN finance.currencies c ON c.code=g.currency_code WHERE g.id=$1 AND g.owner_user_id=$2",
        [goalId,ctx.owner]
      );
      if(!goal.rows[0])return fail(reply,"GOAL_NOT_FOUND",404);
      if(!money(b.currentAmount,Number(goal.rows[0].minor_units)))return fail(reply,"INVALID_GOAL_UPDATE");
      const saved=await auditedWrite(ctx,"finance.goal.update","finance_goal",async db=>{
        const {rows}=await db.query(
        "UPDATE finance.goals SET current_amount=$3::numeric,status=$4,updated_at=now() WHERE id=$1 AND owner_user_id=$2 RETURNING id,current_amount::text,status",
        [goalId,ctx.owner,b.currentAmount,b.status]
      );
        return rows[0];
      });
      return {goal:saved};
    }catch(error){return databaseError(request,reply,error);}
  });
  app.post("/api/finance/debts",async(request,reply)=>{
    const ctx=await authorized(request,reply,{write:true});if(!ctx)return;
    const b=request.body||{};
    if(!trim(b.name)||!ISO.test(String(b.currencyCode||""))
      ||!positive(b.principalOriginal,6)
      ||(b.dueDate && !isDate(b.dueDate))
      ||!money(b.annualInterestPercent||"0",6)
      ||Number(b.annualInterestPercent||"0")>100)return fail(reply,"INVALID_DEBT");
    try {
      const c=await currency(ctx.pool,b.currencyCode);
      if(!c||!positive(b.principalOriginal,Number(c.minor_units)))return fail(reply,"INVALID_DEBT_AMOUNT");
      const saved=await auditedWrite(ctx,"finance.debt.create","finance_debt",async db=>{
        const {rows}=await db.query(
        "INSERT INTO finance.debts(owner_user_id,name,currency_code,principal_original,annual_interest_rate,due_date) VALUES($1,$2,$3,$4::numeric,$5::numeric/100,$6::date) RETURNING id,name,currency_code,principal_original::text,annual_interest_rate::text,due_date::text",
        [ctx.owner,trim(b.name,160),b.currencyCode,b.principalOriginal,b.annualInterestPercent||"0",b.dueDate||null]
      );
        return rows[0];
      });
      return reply.code(201).send({debt:saved});
    }catch(error){return databaseError(request,reply,error);}
  });
  app.post("/api/finance/fx-plans/:planId/cancel",async(request,reply)=>{
    const ctx=await authorized(request,reply,{write:true});if(!ctx)return;
    const planId=request.params?.planId;
    if(!id(planId))return fail(reply,"INVALID_PLAN_ID");
    try{
      const saved=await auditedWrite(ctx,"finance.fx_plan.cancel","finance_fx_plan",async db=>{
        const {rows}=await db.query(
        "UPDATE finance.fx_plans SET status='cancelled' WHERE id=$1 AND owner_user_id=$2 AND status='planned' RETURNING id,status",
        [planId,ctx.owner]
      );
        return rows[0];
      });
      if(!saved)return fail(reply,"PLAN_NOT_FOUND_OR_NOT_PLANNED",404);
      return {plan:saved};
    }catch(error){return databaseError(request,reply,error);}
  });
  app.post("/api/finance/transactions",async(request,reply)=>{
    const ctx=await authorized(request,reply,{write:true});if(!ctx)return;
    const b=request.body||{},kind=b.kind,key=b.idempotencyKey;
    if(!id(key)||!["income","expense","transfer","fx","adjustment"].includes(kind))return fail(reply,"INVALID_FINANCE_TRANSACTION");
    const occurredAt=b.occurredAt||new Date().toISOString();
    if(typeof occurredAt!=="string"||Number.isNaN(Date.parse(occurredAt))||!/[zZ]|[+-]\d\d:\d\d$/.test(occurredAt))return fail(reply,"INVALID_FINANCE_TIMESTAMP");
    const description=trim(b.description,250);
    try {
      // If the owner chooses automatic valuation, resolve the current private
      // Finance quote on the server; never trust a browser-supplied "auto" rate.
      const automaticFx=["income","expense"].includes(kind)&&b.fxRateMode==="estimate";
      const estimatedFx=automaticFx&&b.currencyCode!=="TWD"?await getFinanceFxSnapshot(ctx.pool):null;
      const result=await financeTransaction(async(client)=>{
        const lockedAccounts=new Map();
        // Lock all owned wallets in the same order to avoid deadlocks when simultaneous
        // transfers/FX conversions move funds in opposite directions.
        const requestedAccountIds=(["transfer","fx"].includes(kind) && id(b.targetAccountId))
          ? [b.accountId,b.targetAccountId] : [b.accountId];
        for (const accountId of [...new Set(requestedAccountIds.map(value=>String(value).toLowerCase()))].sort()) {
          const record=await account(client,ctx.owner,accountId);
          if(record)lockedAccounts.set(accountId,record);
        }
        const primary=lockedAccounts.get(String(b.accountId).toLowerCase());
        if(!primary) return {error:"SOURCE_ACCOUNT_NOT_FOUND",status:404};
        let secondary=null,categoryId=null,toTwdRate=null;
        if(["transfer","fx"].includes(kind)){
          if(!id(b.targetAccountId)||b.targetAccountId===b.accountId)return {error:"INVALID_TARGET_ACCOUNT"};
          secondary=lockedAccounts.get(String(b.targetAccountId).toLowerCase());
          if(!secondary)return {error:"TARGET_ACCOUNT_NOT_FOUND",status:404};
          if(kind==="transfer"&&primary.currency_code!==secondary.currency_code)return {error:"USE_FX_FOR_CROSS_CURRENCY"};
          if(kind==="fx"&&primary.currency_code===secondary.currency_code)return {error:"FX_CURRENCIES_MUST_DIFFER"};
        }
        if(!positive(b.amount,Number(primary.minor_units)))return {error:"INVALID_AMOUNT"};
        if(kind==="adjustment"){
          const prior=await client.query("SELECT 1 FROM finance.entries WHERE owner_user_id=$1 AND account_id=$2 LIMIT 1",[ctx.owner,primary.id]);
          if(prior.rows[0])return {error:"ACCOUNT_ALREADY_HAS_LEDGER",status:409};
        }
        if(kind==="fx"){
          if(!positive(b.receivedAmount,Number(secondary.minor_units)) || !money(b.feeAmount||"0",Number(primary.minor_units)))return {error:"INVALID_EXCHANGE_AMOUNT"};
        }else if(kind==="income"||kind==="expense"){
          if(!id(b.categoryId))return {error:"CATEGORY_REQUIRED"};
          const check=await client.query("SELECT id FROM finance.categories WHERE id=$1 AND owner_user_id=$2 AND kind=$3",[b.categoryId,ctx.owner,kind]);
          if(!check.rows[0])return {error:"CATEGORY_NOT_FOUND"};
          categoryId=b.categoryId;
          // The source account always remains in its original currency.
          if(b.currencyCode&&b.currencyCode!==primary.currency_code)
            return {error:"TRANSACTION_CURRENCY_ACCOUNT_MISMATCH"};
          // Exchange-rate estimates affect reporting only, not account transfers.
          toTwdRate=primary.currency_code==="TWD"?"1":
            automaticFx?estimatedFx?.quotes?.[primary.currency_code]?.rateToTwd:b.toTwdRate;
          if(!positiveRate(toTwdRate))
            return {error:automaticFx?"FX_RATE_UNAVAILABLE":"TWD_RATE_REQUIRED"};
        }
        const eventId=await createEvent(client,ctx.owner,kind,description,occurredAt,key);
        if(!eventId)return {error:"FINANCE_DUPLICATE_REQUEST",status:409};
        const debit=kind==="expense"||kind==="transfer"||kind==="fx";
        await entry(client,ctx.owner,eventId,primary,(debit?"-":"")+b.amount,categoryId,toTwdRate);
        if(kind==="transfer")await entry(client,ctx.owner,eventId,secondary,b.amount);
        if(kind==="fx"){
          await entry(client,ctx.owner,eventId,secondary,b.receivedAmount);
          if(b.feeAmount && Number(b.feeAmount)>0)await entry(client,ctx.owner,eventId,primary,"-"+b.feeAmount);
          await client.query(
            "INSERT INTO finance.fx_exchanges(event_id,owner_user_id,from_currency,to_currency,source_amount,received_amount,effective_rate,fee_amount,fee_currency,rate_source) VALUES($1,$2,$3,$4,$5::numeric,$6::numeric,$6::numeric/$5::numeric,$7::numeric,$3,'manual')",
            [eventId,ctx.owner,primary.currency_code,secondary.currency_code,b.amount,b.receivedAmount,b.feeAmount||"0"]
          );
        }
        await audit(client,ctx.owner,"finance."+kind,eventId,{
          kind,...(["income","expense"].includes(kind)?{
            currency:primary.currency_code,toTwdRate,
            valuation:automaticFx?"indicative_reference":"recorded_rate",
            ...(automaticFx&&primary.currency_code!=="TWD"?{
              fxProvider:estimatedFx?.quotes?.[primary.currency_code]?.provider||null,
              fxObservedAt:estimatedFx?.quotes?.[primary.currency_code]?.observedAt||null
            }:{}),
          }:{})
        });
        return {id:eventId,kind};
      });
      if(result.error)return fail(reply,result.error,result.status||400);
      return reply.code(201).send({event:result});
    }catch(error){return databaseError(request,reply,error);}
  });
  registerFinancePlanningRoutes(app,{authorized,fail,databaseError,id,money,positive,positiveRate,monthKey,isDate,trim,auditedWrite,financeTransaction,account,createEvent,entry,audit});
  registerFinanceAdvisorRoutes(app,{authorized,fail,databaseError});
  registerFinanceScenarioRoutes(app,{authorized,fail,databaseError,auditedWrite,id});
}
