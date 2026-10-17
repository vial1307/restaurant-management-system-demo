import {getFinanceFxSnapshot} from "./finance-fx-valuation.mjs";
import {priceFinanceFund,missingFinanceFundQuotes} from "./finance-fund-valuation.mjs";
import {addDays,calculateFinanceAdvice} from "./finance-advisor-engine.mjs";

// Read-only owner-scoped advice. Finance PostgreSQL is the only source of record.
// The kitchen/restaurant DB and any external FX service are never queried here.
export function registerFinanceAdvisorRoutes(app,{authorized,fail,databaseError}){
  app.get("/api/finance/advisor",async(request,reply)=>{
    const ctx=await authorized(request,reply);if(!ctx)return;
    const daysText=String(request.query?.days??"30");
    const bufferTwd=String(request.query?.bufferTwd??"0");
    if(!/^(30|60|90|365)$/.test(daysText))return fail(reply,"INVALID_ADVISOR_RANGE");
    if(!/^(?:0|[1-9]\d{0,10})(?:\.\d{1,2})?$/.test(bufferTwd))return fail(reply,"INVALID_ADVISOR_BUFFER");
    const asOf=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
    const through=addDays(asOf,Number(daysText)-1);
    const startMonth=asOf.slice(0,7)+"-01";
    const endMonth=through.slice(0,7)+"-01";
    try{
      const pool=ctx.pool,owner=ctx.owner;
      const [wallets,cashItems,debtFunds,goalFunds,debtPayments,fxPlans,goals,debts]=await Promise.all([
        pool.query("SELECT a.id,a.name,a.currency_code,COALESCE(SUM(e.amount),0)::text AS balance FROM finance.accounts a LEFT JOIN finance.entries e ON e.account_id=a.id AND e.owner_user_id=a.owner_user_id WHERE a.owner_user_id=$1 GROUP BY a.id,a.name,a.currency_code ORDER BY a.currency_code,a.name",[owner]),
        pool.query("SELECT id,kind,label,amount_twd::text,month_date::text,due_day FROM finance.cashflow_items WHERE owner_user_id=$1 AND month_date BETWEEN $2::date AND $3::date ORDER BY month_date,due_day NULLS LAST,id",[owner,startMonth,endMonth]),
        pool.query(
          "SELECT f.id,f.debt_id,d.name AS debt_name,d.due_date::text,f.month_date::text,"+
          "f.planned_amount::text,f.earmarked_amount::text,f.fx_rate_to_twd::text,d.currency_code "+
          "FROM finance.debt_fund_allocations f JOIN finance.debts d ON d.id=f.debt_id AND d.owner_user_id=f.owner_user_id "+
          "WHERE f.owner_user_id=$1 AND f.month_date BETWEEN $2::date AND $3::date ORDER BY f.month_date,f.id",
          [owner,startMonth,endMonth]
        ),
        pool.query(
          "SELECT f.id,f.goal_id,g.name AS goal_name,g.target_date::text,f.month_date::text,"+
          "f.planned_amount::text,f.earmarked_amount::text,f.fx_rate_to_twd::text,g.currency_code "+
          "FROM finance.goal_fund_allocations f JOIN finance.goals g ON g.id=f.goal_id AND g.owner_user_id=f.owner_user_id "+
          "WHERE f.owner_user_id=$1 AND f.month_date BETWEEN $2::date AND $3::date ORDER BY f.month_date,f.id",
          [owner,startMonth,endMonth]
        ),
        pool.query(
          "SELECT debt_id,payment_date::text,COALESCE(base_amount_twd,0)::text AS base_amount_twd "+
          "FROM finance.debt_payments WHERE owner_user_id=$1 AND payment_date>=$2::date AND payment_date<=$3::date + interval '1 month'",
          [owner,startMonth,endMonth]
        ),
        pool.query(
          "SELECT id,plan_date::text,plan_kind,status,from_currency,to_currency,source_amount::text,expected_fee::text "+
          "FROM finance.fx_plans WHERE owner_user_id=$1 AND status='planned' AND plan_date BETWEEN $2::date AND $3::date "+
          "ORDER BY plan_date,id",[owner,asOf,through]
        ),
        pool.query("SELECT id,name,status FROM finance.goals WHERE owner_user_id=$1 AND status='active' ORDER BY name",[owner]),
        pool.query(
          "SELECT d.id,d.name,(d.principal_original-COALESCE(SUM(p.principal_paid),0))::text AS outstanding_amount "+
          "FROM finance.debts d LEFT JOIN finance.debt_payments p ON p.debt_id=d.id AND p.owner_user_id=d.owner_user_id "+
          "WHERE d.owner_user_id=$1 GROUP BY d.id ORDER BY d.name",[owner]
        )
      ]);
      const fx=await getFinanceFxSnapshot(ctx.pool);
      const liveDebts=debtFunds.rows.map(row=>priceFinanceFund(row,fx));
      const liveGoals=goalFunds.rows.map(row=>priceFinanceFund(row,fx));
      const unconverted=missingFinanceFundQuotes(liveDebts,liveGoals);
      reply.header("Cache-Control","private, no-store");
      const advice=calculateFinanceAdvice({asOf,days:Number(daysText),bufferTwd,
        wallets:wallets.rows,cashItems:cashItems.rows,debtFunds:liveDebts.filter(x=>x.planned_twd!==null),
        goalFunds:liveGoals.filter(x=>x.planned_twd!==null),debtPayments:debtPayments.rows,fxPlans:fxPlans.rows,
        goals:goals.rows,debts:debts.rows});
      return {...advice,unconvertedFunds:unconverted,
        warnings:[...advice.warnings,...unconverted.map(x=>({code:"FX_RATE_UNAVAILABLE",message:"Quỹ "+x.name+" ("+x.currency+") thiếu tỷ giá hiện tại và chưa được tính vào TWD."}))],
        fxEstimateIncomplete:unconverted.length>0};
    }catch(error){return databaseError(request,reply,error);}
  });
}
