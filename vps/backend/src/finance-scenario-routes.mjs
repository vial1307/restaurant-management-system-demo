import {addDays,sourceEvents,simulateScenario,validateScenario,dateOk} from "./finance-scenario-engine.mjs";

// Finance-only, owner-restricted scenario workbooks. Never posts real money.
const asOfTaipei=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const monthsEnd=(date,months)=>addDays(new Date(Date.UTC(Number(date.slice(0,4)),Number(date.slice(5,7))-1+months,1)).toISOString().slice(0,10),-1);
function asInput(body) {
  try{return validateScenario(body?.scenario);}catch{return null;}
}
async function sources(pool,owner,asOf,through){
 const first=asOf.slice(0,7)+"-01",last=through.slice(0,7)+"-01";
 const [accounts,cashItems,debtFunds,goalFunds,debtPayments,fxPlans,debts]=await Promise.all([
  pool.query("SELECT a.id,a.name,a.currency_code,COALESCE(SUM(e.amount),0)::text AS balance FROM finance.accounts a LEFT JOIN finance.entries e ON e.account_id=a.id AND e.owner_user_id=a.owner_user_id WHERE a.owner_user_id=$1 AND a.active=true GROUP BY a.id ORDER BY a.currency_code,a.name",[owner]),
  pool.query("SELECT id,label,kind,amount_twd::text,original_currency,original_amount::text,funding_mode,funding_account_id,conversion_day,fx_fee_twd::text,due_day,month_date::text FROM finance.cashflow_items WHERE owner_user_id=$1 AND month_date BETWEEN $2::date AND $3::date ORDER BY month_date,due_day NULLS LAST",[owner,first,last]),
  pool.query("SELECT f.debt_id,d.name AS debt_name,d.due_date::text,f.month_date::text,ROUND(f.planned_amount*f.fx_rate_to_twd,6)::text AS planned_twd FROM finance.debt_fund_allocations f JOIN finance.debts d ON d.id=f.debt_id AND d.owner_user_id=f.owner_user_id WHERE f.owner_user_id=$1 AND f.month_date BETWEEN $2::date AND $3::date",[owner,first,last]),
  pool.query("SELECT f.goal_id,g.name AS goal_name,g.target_date::text,f.month_date::text,ROUND(f.planned_amount*f.fx_rate_to_twd,6)::text AS planned_twd FROM finance.goal_fund_allocations f JOIN finance.goals g ON g.id=f.goal_id AND g.owner_user_id=f.owner_user_id WHERE f.owner_user_id=$1 AND f.month_date BETWEEN $2::date AND $3::date",[owner,first,last]),
  pool.query("SELECT debt_id,payment_date::text,COALESCE(base_amount_twd,0)::text AS base_amount_twd FROM finance.debt_payments WHERE owner_user_id=$1 AND payment_date >= $2::date AND payment_date <= $3::date + interval '1 month'",[owner,first,last]),
  pool.query("SELECT plan_date::text,plan_kind,status,from_currency,to_currency,source_amount::text,expected_fee::text FROM finance.fx_plans WHERE owner_user_id=$1 AND plan_date BETWEEN $2::date AND $3::date AND status='planned'",[owner,asOf,through]),
  pool.query("SELECT d.id,d.name,d.currency_code,d.annual_interest_rate::text,(d.principal_original-COALESCE(SUM(p.principal_paid),0))::text AS outstanding_amount FROM finance.debts d LEFT JOIN finance.debt_payments p ON p.debt_id=d.id AND p.owner_user_id=d.owner_user_id WHERE d.owner_user_id=$1 GROUP BY d.id ORDER BY d.name",[owner])
 ]);
 return sourceEvents({asOf,through,accounts:accounts.rows,cashItems:cashItems.rows,
   debtFunds:debtFunds.rows,goalFunds:goalFunds.rows,debtPayments:debtPayments.rows,
   fxPlans:fxPlans.rows,debts:debts.rows});
}
export function registerFinanceScenarioRoutes(app,{authorized,fail,databaseError,auditedWrite,id}){
 app.get("/api/finance/workbench",async(req,reply)=>{
  const ctx=await authorized(req,reply);if(!ctx)return;
  try{
   const {rows}=await ctx.pool.query("SELECT id,name,settings,updated_at FROM finance.scenario_workbooks WHERE owner_user_id=$1 ORDER BY updated_at DESC LIMIT 20",[ctx.owner]);
   reply.header("Cache-Control","private, no-store");
   return {scenarios:rows,asOf:asOfTaipei(),source:"finance_postgresql",readOnlyPreview:true};
  }catch(error){return databaseError(req,reply,error);}
 });
 app.post("/api/finance/workbench/preview",async(req,reply)=>{
  const ctx=await authorized(req,reply,{write:true});if(!ctx)return;
  const scenario=asInput(req.body);
  if(!scenario)return fail(reply,"INVALID_FINANCE_SCENARIO");
  const asOf=asOfTaipei(),through=monthsEnd(asOf,scenario.months);
  if(scenario.rows.some(r=>!dateOk(r.date)||r.date<asOf||r.date>through))return fail(reply,"SCENARIO_DATE_OUTSIDE_WINDOW");
  try{
   const source=await sources(ctx.pool,ctx.owner,asOf,through);
   const projection=simulateScenario({asOf,source,scenario});
   reply.header("Cache-Control","private, no-store");
   return {projection,scenario,sourceTag:"finance_postgresql",saved:false};
  }catch(error){
   if(/^(INVALID_SCENARIO|LOAN_REPAYMENT|SCENARIO_DATE)/.test(error.message))return fail(reply,error.message);
   return databaseError(req,reply,error);
  }
 });
 app.post("/api/finance/workbench/scenarios",async(req,reply)=>{
  const ctx=await authorized(req,reply,{write:true});if(!ctx)return;
  const settings=asInput(req.body);
  if(!settings)return fail(reply,"INVALID_FINANCE_SCENARIO");
  try{
   const {rows:count}=await ctx.pool.query("SELECT COUNT(*)::int AS n FROM finance.scenario_workbooks WHERE owner_user_id=$1",[ctx.owner]);
   if(count[0].n>=20)return fail(reply,"SCENARIO_LIMIT_REACHED",409);
   const saved=await auditedWrite(ctx,"finance.workbench.create","finance_scenario",async db=>{
    const {rows}=await db.query("INSERT INTO finance.scenario_workbooks(owner_user_id,name,settings) VALUES($1,$2,$3::jsonb) RETURNING id,name,settings,updated_at",[ctx.owner,settings.name,JSON.stringify(settings)]);
    return rows[0];
   });
   return reply.code(201).send({scenario:saved});
  }catch(error){return databaseError(req,reply,error);}
 });
 app.put("/api/finance/workbench/scenarios/:id",async(req,reply)=>{
  const ctx=await authorized(req,reply,{write:true});if(!ctx)return;
  if(!id(req.params?.id))return fail(reply,"INVALID_SCENARIO_ID");
  const settings=asInput(req.body);
  if(!settings)return fail(reply,"INVALID_FINANCE_SCENARIO");
  try{
   const saved=await auditedWrite(ctx,"finance.workbench.update","finance_scenario",async db=>{
    const {rows}=await db.query("UPDATE finance.scenario_workbooks SET name=$3,settings=$4::jsonb,updated_at=now() WHERE owner_user_id=$1 AND id=$2 RETURNING id,name,settings,updated_at",
      [ctx.owner,req.params.id,settings.name,JSON.stringify(settings)]);
    return rows[0];
   });
   if(!saved)return fail(reply,"SCENARIO_NOT_FOUND",404);
   return {scenario:saved};
  }catch(error){return databaseError(req,reply,error);}
 });
 app.delete("/api/finance/workbench/scenarios/:id",async(req,reply)=>{
  const ctx=await authorized(req,reply,{write:true});if(!ctx)return;
  if(!id(req.params?.id))return fail(reply,"INVALID_SCENARIO_ID");
  try{
   const saved=await auditedWrite(ctx,"finance.workbench.delete","finance_scenario",async db=>{
    const {rows}=await db.query("DELETE FROM finance.scenario_workbooks WHERE owner_user_id=$1 AND id=$2 RETURNING id",[ctx.owner,req.params.id]);
    return rows[0];
   });
   if(!saved)return fail(reply,"SCENARIO_NOT_FOUND",404);
   return {deleted:true};
  }catch(error){return databaseError(req,reply,error);}
 });
}