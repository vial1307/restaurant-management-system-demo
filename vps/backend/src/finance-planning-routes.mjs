import {financeScenarioSources} from "./finance-scenario-routes.mjs";
import {simulateScenario} from "./finance-scenario-engine.mjs";
import {planDebtPayoff} from "./finance-debt-payoff-engine.mjs";
import {priceFinanceFund,summarizeFinanceFundValues,missingFinanceFundQuotes} from "./finance-fund-valuation.mjs";
import {getFinanceFxSnapshot,convertToTwd} from "./finance-fx-valuation.mjs";
// Owner-only Finance OS planning & debt-fund endpoints, backed by the *separate* finance PostgreSQL.
// A plan or earmark does not create a financial posting; actual repayments do.
export function registerFinancePlanningRoutes(app,{authorized,fail,databaseError,id,money,positive,positiveRate,monthKey,isDate,trim,auditedWrite,financeTransaction,account,createEvent,entry,audit}) {
  const amountTwd=x=>money(x,0);
  // Native-currency planned entries are converted ONLY for forecasting; no real trade.
  async function plannedAmount(ctx,b){
    const code=String(b.currencyCode||"TWD");
    if(!/^[A-Z]{3}$/.test(code))return {error:"INVALID_PLAN_CURRENCY"};
    const orig=String(b.originalAmount??b.amountTwd??"").replace(/(\.\d*?)0+$/,"$1").replace(/\.$/,"");
    const {rows}=await ctx.pool.query(
      "SELECT code,minor_units FROM finance.currencies WHERE code=$1 AND enabled=true",[code]);
    if(!rows[0]||!positive(orig,Number(rows[0].minor_units)))return {error:"INVALID_PLAN_NATIVE_AMOUNT"};
    if(code==="TWD")return {amountTwd:orig,originalCurrency:code,originalAmount:orig,rate:"1",observedAt:null,provider:"native"};
    const snap=await getFinanceFxSnapshot(ctx.pool);
    const quote=snap.quotes[code];
    const auto=quote?.status==="fresh"&&quote.rateToTwd;
    const rate=auto?quote.rateToTwd:positiveRate(b.fxRateToTwd)?String(b.fxRateToTwd):null;
    if(!rate)return {error:"FX_RATE_UNAVAILABLE"};
    let converted;
    try{converted=convertToTwd(orig,rate);}catch{return {error:"INVALID_PLAN_FX_CONVERSION"};}
    if(!positive(converted,0))return {error:"FX_AMOUNT_TOO_SMALL"};
    return {amountTwd:converted,originalCurrency:code,originalAmount:orig,rate,
      observedAt:auto?quote.observedAt:null,provider:auto?quote.provider:"manual-plan"};
  }

  const startMonth=m=>m+"-01";
  // A financing forecast is always linked to one loan; never a salary posting.
  async function validateLoan(db,owner,debtId,amount){
    const {rows}=await db.query(
      "SELECT d.id,d.currency_code,d.principal_original::text AS principal,"+
      "EXISTS(SELECT 1 FROM finance.debt_disbursements x WHERE x.owner_user_id=d.owner_user_id AND x.debt_id=d.id) AS received,"+
      "EXISTS(SELECT 1 FROM finance.debt_payments p WHERE p.owner_user_id=d.owner_user_id AND p.debt_id=d.id) AS paid "+
      "FROM finance.debts d WHERE d.owner_user_id=$1 AND d.id=$2 FOR UPDATE OF d",[owner,debtId]);
    const loan=rows[0];
    if(!loan)return "PLAN_DEBT_NOT_FOUND";
    if(loan.currency_code!==amount.originalCurrency)return "PLAN_LOAN_CURRENCY_MISMATCH";
    if(Number(loan.principal)!==Number(amount.originalAmount))return "PLAN_LOAN_PRINCIPAL_MISMATCH";
    if(loan.received||loan.paid)return "PLAN_LOAN_ALREADY_RECEIVED";
    return null;
  }
  const roundTripQuery=async(ctx,m)=>{
    const date=startMonth(m);
    const [items,funds,payments,sums,goalFunds]=await Promise.all([
      ctx.pool.query("SELECT id,kind,debt_id,label,amount_twd::text,EXISTS(SELECT 1 FROM finance.debt_disbursements ld WHERE ld.debt_id=finance.cashflow_items.debt_id AND ld.owner_user_id=finance.cashflow_items.owner_user_id) AS received,original_currency,original_amount::text,fx_rate_to_twd::text,fx_rate_observed_at,fx_rate_provider,due_day,memo,month_date::text,updated_at::text AS updated_at FROM finance.cashflow_items WHERE owner_user_id=$1 AND month_date=$2::date ORDER BY kind,due_day NULLS LAST,label,id",[ctx.owner,date]),
      ctx.pool.query("SELECT f.id,f.debt_id,d.name AS debt_name,d.currency_code,f.planned_amount::text,f.earmarked_amount::text,f.fx_rate_to_twd::text,d.due_date::text,f.updated_at::text AS updated_at FROM finance.debt_fund_allocations f JOIN finance.debts d ON d.id=f.debt_id AND d.owner_user_id=f.owner_user_id WHERE f.owner_user_id=$1 AND f.month_date=$2::date ORDER BY d.name,f.id",[ctx.owner,date]),
      ctx.pool.query("SELECT p.id,p.debt_id,d.name AS debt_name,d.currency_code,p.payment_date::text,p.principal_paid::text,p.interest_paid::text,p.fee_paid::text,p.base_amount_twd::text,p.event_id FROM finance.debt_payments p JOIN finance.debts d ON d.id=p.debt_id AND d.owner_user_id=p.owner_user_id WHERE p.owner_user_id=$1 AND p.payment_date >= $2::date AND p.payment_date < ($2::date+interval '1 month') ORDER BY p.payment_date DESC,p.created_at DESC LIMIT 100",[ctx.owner,date]),
      ctx.pool.query(
        "SELECT "+
        "COALESCE((SELECT SUM(amount_twd) FROM finance.cashflow_items WHERE owner_user_id=$1 AND month_date=$2::date AND kind='income'),0)::text AS planned_income_twd,"+
        "COALESCE((SELECT SUM(amount_twd) FROM finance.cashflow_items WHERE owner_user_id=$1 AND month_date=$2::date AND kind='borrowing' AND NOT EXISTS(SELECT 1 FROM finance.debt_disbursements ld WHERE ld.debt_id=finance.cashflow_items.debt_id AND ld.owner_user_id=finance.cashflow_items.owner_user_id)),0)::text AS planned_borrowing_twd,"+
        "COALESCE((SELECT SUM(amount_twd) FROM finance.cashflow_items WHERE owner_user_id=$1 AND month_date=$2::date AND kind='expense'),0)::text AS planned_expense_twd,"+
        "COALESCE((SELECT SUM(planned_amount*fx_rate_to_twd) FROM finance.debt_fund_allocations WHERE owner_user_id=$1 AND month_date=$2::date),0)::text AS planned_debt_fund_twd,"+
        "COALESCE((SELECT SUM(earmarked_amount*fx_rate_to_twd) FROM finance.debt_fund_allocations WHERE owner_user_id=$1 AND month_date=$2::date),0)::text AS earmarked_debt_fund_twd,"+
        "COALESCE((SELECT SUM(planned_amount*fx_rate_to_twd) FROM finance.goal_fund_allocations WHERE owner_user_id=$1 AND month_date=$2::date),0)::text AS planned_goal_fund_twd,"+
        "COALESCE((SELECT SUM(earmarked_amount*fx_rate_to_twd) FROM finance.goal_fund_allocations WHERE owner_user_id=$1 AND month_date=$2::date),0)::text AS earmarked_goal_fund_twd,"+
        "COALESCE((SELECT SUM(ABS(e.base_amount_twd)) FROM finance.entries e JOIN finance.events v ON v.id=e.event_id AND v.owner_user_id=e.owner_user_id WHERE v.owner_user_id=$1 AND v.kind='income' AND v.occurred_at>=($2::date AT TIME ZONE 'Asia/Taipei') AND v.occurred_at<(($2::date+interval '1 month') AT TIME ZONE 'Asia/Taipei')),0)::text AS actual_income_twd,"+
        "COALESCE((SELECT SUM(ABS(e.base_amount_twd)) FROM finance.entries e JOIN finance.events v ON v.id=e.event_id AND v.owner_user_id=e.owner_user_id WHERE v.owner_user_id=$1 AND v.kind='expense' AND v.occurred_at>=($2::date AT TIME ZONE 'Asia/Taipei') AND v.occurred_at<(($2::date+interval '1 month') AT TIME ZONE 'Asia/Taipei')),0)::text AS actual_expense_twd,"+
        "COALESCE((SELECT SUM(base_amount_twd) FROM finance.debt_payments WHERE owner_user_id=$1 AND payment_date>=$2::date AND payment_date<($2::date+interval '1 month')),0)::text AS actual_debt_paid_twd",
        [ctx.owner,date]
      ),
      ctx.pool.query(
        "SELECT f.id,f.goal_id,g.name AS goal_name,g.currency_code,g.status,f.planned_amount::text,f.earmarked_amount::text,f.fx_rate_to_twd::text,f.updated_at::text AS updated_at,g.target_amount::text,g.current_amount::text,g.target_date::text FROM finance.goal_fund_allocations f JOIN finance.goals g ON g.id=f.goal_id AND g.owner_user_id=f.owner_user_id WHERE f.owner_user_id=$1 AND f.month_date=$2::date ORDER BY g.name,f.id",
        [ctx.owner,date]
      )
    ]);
    // Debt/goal allocations are editable plans. Always value them using the
    // ONE verified Finance snapshot, never a potentially inverted legacy rate.
    const fx=await getFinanceFxSnapshot(ctx.pool);
    const liveDebts=funds.rows.map(row=>priceFinanceFund(row,fx));
    const liveGoals=goalFunds.rows.map(row=>priceFinanceFund(row,fx));
    const unconverted=missingFinanceFundQuotes(liveDebts,liveGoals);
    const summary={
      ...sums.rows[0],
      planned_debt_fund_twd:summarizeFinanceFundValues(liveDebts,"planned_twd"),
      earmarked_debt_fund_twd:summarizeFinanceFundValues(liveDebts,"earmarked_twd"),
      planned_goal_fund_twd:summarizeFinanceFundValues(liveGoals,"planned_twd"),
      earmarked_goal_fund_twd:summarizeFinanceFundValues(liveGoals,"earmarked_twd")
    };
    // Numeric projection is calculated by PostgreSQL for precision, never as optimistic UI state.
    const {rows:net}=await ctx.pool.query(
      "SELECT ($1::numeric+$8::numeric-$2::numeric-$3::numeric-$4::numeric)::text AS planned_net_twd,"+
      "($5::numeric-$6::numeric-$7::numeric)::text AS actual_net_twd",
      [summary.planned_income_twd,summary.planned_expense_twd,summary.planned_debt_fund_twd,summary.planned_goal_fund_twd,
       summary.actual_income_twd,summary.actual_expense_twd,summary.actual_debt_paid_twd,summary.planned_borrowing_twd]);
    return {month:m,items:items.rows,debtFunds:liveDebts,goalFunds:liveGoals,debtPayments:payments.rows,unconvertedFunds:unconverted,summary:{...summary,...net[0],fx_estimate_incomplete:unconverted.length>0}};
  };
  // Equivalent bidirectional goal flow, no spending posted when planning.
  app.post("/api/finance/goal-plans",async(req,reply)=>{
    const ctx=await authorized(req,reply,{write:true});if(!ctx)return;
    const b=req.body||{};
    if(!monthKey(b.month)||!trim(b.name)||!/^[A-Z]{3}$/.test(String(b.currencyCode||""))||
       !positive(String(b.targetAmount||""),6)||typeof b.plannedAmount!=="string"||
       !money(b.plannedAmount,6)||(b.targetDate&&!isDate(b.targetDate)))
      return fail(reply,"INVALID_GOAL_PLAN");
    try{
      const c=(await ctx.pool.query("SELECT minor_units FROM finance.currencies WHERE code=$1 AND enabled=true",[b.currencyCode])).rows[0];
      if(!c||!positive(b.targetAmount,Number(c.minor_units))||
        !money(b.plannedAmount,Number(c.minor_units)))return fail(reply,"INVALID_GOAL_PLAN_AMOUNT");
      const snap=b.currencyCode==="TWD"?null:await getFinanceFxSnapshot(ctx.pool);
      const rate=b.currencyCode==="TWD"?"1":snap?.quotes?.[b.currencyCode]?.rateToTwd;
      if(!positiveRate(rate))return fail(reply,"FX_RATE_UNAVAILABLE");
      const saved=await auditedWrite(ctx,"finance.goal_plan.create","finance_goal",async db=>{
        const {rows:goals}=await db.query(
         "INSERT INTO finance.goals(owner_user_id,name,currency_code,target_amount,target_date) "+
         "VALUES($1,$2,$3,$4::numeric,$5::date) "+
         "RETURNING id,name,currency_code,target_amount::text,target_date::text",
         [ctx.owner,trim(b.name,160),b.currencyCode,b.targetAmount,b.targetDate||null]);
        const goal=goals[0];
        const {rows:funds}=await db.query(
         "INSERT INTO finance.goal_fund_allocations(owner_user_id,goal_id,month_date,planned_amount,earmarked_amount,fx_rate_to_twd) "+
         "VALUES($1,$2,$3::date,$4::numeric,0,$5::numeric) "+
         "RETURNING id,goal_id,month_date::text,planned_amount::text,earmarked_amount::text,fx_rate_to_twd::text",
         [ctx.owner,goal.id,startMonth(b.month),b.plannedAmount,rate]);
        return {goal,fund:funds[0]};
      });
      return reply.code(201).send(saved);
    }catch(error){return databaseError(req,reply,error);}
  });
  app.get("/api/finance/debt-payoff-plan",async(req,reply)=>{
    const ctx=await authorized(req,reply);if(!ctx)return;
    const months=Number(req.query?.months||12),bufferText=String(req.query?.bufferTwd??"0");
    if(![3,6,12].includes(months)||!money(bufferText,0))
      return fail(reply,"INVALID_PAYOFF_QUERY");
    const today=new Intl.DateTimeFormat("sv-SE",{
      timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"
    }).format(new Date());
    const through=new Date(Date.UTC(Number(today.slice(0,4)),
      Number(today.slice(5,7))-1+months,0)).toISOString().slice(0,10);
    try{
      const [source,result,fx]=await Promise.all([
       financeScenarioSources(ctx.pool,ctx.owner,today,through),
       ctx.pool.query(
        "SELECT d.id,d.name,d.currency_code,d.annual_interest_rate::text,d.due_date::text,"+
        "(d.principal_original-COALESCE(SUM(p.principal_paid),0))::text AS outstanding_amount "+
        "FROM finance.debts d LEFT JOIN finance.debt_payments p "+
        "ON p.debt_id=d.id AND p.owner_user_id=d.owner_user_id "+
        "WHERE d.owner_user_id=$1 GROUP BY d.id ORDER BY d.due_date NULLS LAST,d.name",[ctx.owner]),
       getFinanceFxSnapshot(ctx.pool)
      ]);
      const [fundRows,paymentRows]=await Promise.all([
       ctx.pool.query(
        "SELECT debt_id,month_date::text,planned_amount::text FROM finance.debt_fund_allocations "+
        "WHERE owner_user_id=$1 AND month_date>=$2::date AND month_date<=$3::date",
        [ctx.owner,today.slice(0,7)+"-01",through.slice(0,7)+"-01"]),
       ctx.pool.query(
        "SELECT debt_id,payment_date::text,SUM(principal_paid+interest_paid+fee_paid)::text AS native_paid "+
        "FROM finance.debt_payments WHERE owner_user_id=$1 AND payment_date>=$2::date "+
        "AND payment_date<=$3::date GROUP BY debt_id,payment_date",
        [ctx.owner,today.slice(0,7)+"-01",through])
      ]);
      const baseline=simulateScenario({asOf:today,source,scenario:{
       name:"Tự phân bổ nợ theo kế hoạch",months,salaryDay:10,
       bufferTwd:bufferText,monthlyExtraIncomeTwd:"0",rows:[]}});
      const advice=planDebtPayoff({asOf:today,baseline,debts:result.rows,
       funds:fundRows.rows,payments:paymentRows.rows,quotes:fx.quotes,bufferTwd:bufferText});
      reply.header("Cache-Control","private, no-store");
      return {...advice,baseline:{through:baseline.through,minimumTwd:baseline.minimumTwd,
       earliestRisk:baseline.earliestRisk},fxObservedAt:Object.fromEntries(
         Object.entries(fx.quotes).map(([code,q])=>[code,q.observedAt||null]))};
    }catch(error){return databaseError(req,reply,error);}
  });
  // One owner-only action from "Công nợ" in the monthly planner. Debt master
  // and its monthly planned allocation are created together, never duplicated
  // as an ordinary expense. No wallet or posted repayment is touched.
  app.post("/api/finance/debt-plans",async(req,reply)=>{
    const ctx=await authorized(req,reply,{write:true});if(!ctx)return;
    const b=req.body||{};
    if(!monthKey(b.month)||!trim(b.name)||!/^[A-Z]{3}$/.test(String(b.currencyCode||""))||
       !positive(String(b.principalOriginal||""),6)||
       !money(String(b.plannedAmount??"0"),6)||
       !money(String(b.annualInterestPercent??"0"),6)||
       Number(b.annualInterestPercent??0)>100||
       !b.dueDate||!isDate(b.dueDate)||
       typeof b.plannedAmount!=="string")
      return fail(reply,"INVALID_DEBT_PLAN");
    try{
      const c=(await ctx.pool.query(
       "SELECT minor_units FROM finance.currencies WHERE code=$1 AND enabled=true",[b.currencyCode])).rows[0];
      if(!c||!positive(b.principalOriginal,Number(c.minor_units))||
         !money(b.plannedAmount,Number(c.minor_units)))
        return fail(reply,"INVALID_DEBT_PLAN_AMOUNT");
      const snap=b.currencyCode==="TWD"?null:await getFinanceFxSnapshot(ctx.pool);
      const rate=b.currencyCode==="TWD"?"1":snap?.quotes?.[b.currencyCode]?.rateToTwd;
      if(!positiveRate(rate))return fail(reply,"FX_RATE_UNAVAILABLE");
      const saved=await auditedWrite(ctx,"finance.debt_plan.create","finance_debt",async db=>{
        const {rows:debts}=await db.query(
         "INSERT INTO finance.debts(owner_user_id,name,currency_code,principal_original,annual_interest_rate,due_date) "+
         "VALUES($1,$2,$3,$4::numeric,$5::numeric/100,$6::date) "+
         "RETURNING id,name,currency_code,principal_original::text,annual_interest_rate::text,due_date::text",
         [ctx.owner,trim(b.name,160),b.currencyCode,b.principalOriginal,String(b.annualInterestPercent||"0"),b.dueDate]);
        const debt=debts[0];
        const {rows:funds}=await db.query(
         "INSERT INTO finance.debt_fund_allocations(owner_user_id,debt_id,month_date,planned_amount,earmarked_amount,fx_rate_to_twd) "+
         "VALUES($1,$2,$3::date,$4::numeric,0,$5::numeric) "+
         "RETURNING id,debt_id,month_date::text,planned_amount::text,earmarked_amount::text,fx_rate_to_twd::text",
         [ctx.owner,debt.id,startMonth(b.month),b.plannedAmount,rate]);
        return {debt,fund:funds[0]};
      });
      return reply.code(201).send(saved);
    }catch(error){return databaseError(req,reply,error);}
  });
  app.get("/api/finance/cashflow",async(req,reply)=>{
    const ctx=await authorized(req,reply);if(!ctx)return;
    const month=monthKey(req.query?.month);
    if(!month)return fail(reply,"INVALID_MONTH");
    try{return await roundTripQuery(ctx,month);}catch(error){return databaseError(req,reply,error);}
  });
  app.get("/api/finance/cashflow/year",async(req,reply)=>{
    const ctx=await authorized(req,reply);if(!ctx)return;
    const year=Number(req.query?.year);
    if(!Number.isInteger(year)||year<2000||year>2100)return fail(reply,"INVALID_YEAR");
    try{
      const {rows}=await ctx.pool.query(
        "WITH months AS (SELECT generate_series(make_date($2,1,1),make_date($2,12,1),interval '1 month')::date AS dt) "+
        "SELECT to_char(m.dt,'YYYY-MM') AS month,"+
        "COALESCE((SELECT SUM(amount_twd) FROM finance.cashflow_items WHERE owner_user_id=$1 AND month_date=m.dt AND kind='income'),0)::text AS planned_income_twd,"+
        "COALESCE((SELECT SUM(amount_twd) FROM finance.cashflow_items WHERE owner_user_id=$1 AND month_date=m.dt AND kind='expense'),0)::text AS planned_expense_twd,"+
        "COALESCE((SELECT SUM(planned_amount*fx_rate_to_twd) FROM finance.debt_fund_allocations WHERE owner_user_id=$1 AND month_date=m.dt),0)::text AS debt_fund_twd,"+
        "COALESCE((SELECT SUM(planned_amount*fx_rate_to_twd) FROM finance.goal_fund_allocations WHERE owner_user_id=$1 AND month_date=m.dt),0)::text AS goal_fund_twd,"+
        "COALESCE((SELECT SUM(base_amount_twd) FROM finance.debt_payments WHERE owner_user_id=$1 AND payment_date>=m.dt AND payment_date<m.dt+interval '1 month'),0)::text AS debt_paid_twd "+
        "FROM months m ORDER BY m.dt",
        [ctx.owner,year]
      );
      // Recompute all 12 month totals from the same live quote basis used by
      // /cashflow and the advisor. Stored rates remain audit-only metadata.
      const {rows:allFunds}=await ctx.pool.query(
        "SELECT 'debt' AS kind,f.month_date::text,d.currency_code,f.planned_amount::text,f.earmarked_amount::text,f.fx_rate_to_twd::text "+
        "FROM finance.debt_fund_allocations f JOIN finance.debts d ON d.id=f.debt_id AND d.owner_user_id=f.owner_user_id WHERE f.owner_user_id=$1 AND EXTRACT(YEAR FROM f.month_date)=$2 "+
        "UNION ALL "+
        "SELECT 'goal' AS kind,f.month_date::text,g.currency_code,f.planned_amount::text,f.earmarked_amount::text,f.fx_rate_to_twd::text "+
        "FROM finance.goal_fund_allocations f JOIN finance.goals g ON g.id=f.goal_id AND g.owner_user_id=f.owner_user_id WHERE f.owner_user_id=$1 AND EXTRACT(YEAR FROM f.month_date)=$2",
        [ctx.owner,year]);
      const fx=await getFinanceFxSnapshot(ctx.pool),byMonth=new Map();
      for(const fund of allFunds){
        const month=String(fund.month_date).slice(0,7),priced=priceFinanceFund(fund,fx);
        if(!byMonth.has(month))byMonth.set(month,{debt:[],goal:[]});
        byMonth.get(month)[fund.kind].push(priced);
      }
      for(const row of rows){
        const funds=byMonth.get(row.month)||{debt:[],goal:[]};
        row.debt_fund_twd=summarizeFinanceFundValues(funds.debt,"planned_twd");
        row.goal_fund_twd=summarizeFinanceFundValues(funds.goal,"planned_twd");
        row.fx_estimate_incomplete=missingFinanceFundQuotes(funds.debt,funds.goal).length>0;
      }
      return {year,months:rows};
    }catch(error){return databaseError(req,reply,error);}
  });
  // Create a debt and an expected inflow together, without posting a wallet credit.
  app.post("/api/finance/loan-plans",async(req,reply)=>{
    const ctx=await authorized(req,reply,{write:true});if(!ctx)return;
    const b=req.body||{};
    if(!monthKey(b.month)||!trim(b.name)||!isDate(b.dueDate)||
       !Number.isInteger(Number(b.dueDay))||Number(b.dueDay)<1||Number(b.dueDay)>31||
       !money(String(b.annualInterestPercent??"0"),6)||Number(b.annualInterestPercent??0)>100||
       !["friend_family","bank_loan","credit_card","installment_provider","other"].includes(b.creditorType||"other"))
      return fail(reply,"INVALID_LOAN_PLAN");
    try{
      const a=await plannedAmount(ctx,b);if(a.error)return fail(reply,a.error);
      const saved=await financeTransaction(async db=>{
        const {rows:debts}=await db.query(
          "INSERT INTO finance.debts(owner_user_id,name,currency_code,principal_original,annual_interest_rate,due_date) "+
          "VALUES($1,$2,$3,$4::numeric,$5::numeric/100,$6::date) RETURNING id,name,currency_code,principal_original::text,due_date::text",
          [ctx.owner,trim(b.name,160),a.originalCurrency,a.originalAmount,String(b.annualInterestPercent??"0"),b.dueDate]);
        const debt=debts[0];
        await db.query("INSERT INTO finance.debt_mentor_terms(owner_user_id,debt_id,creditor_type) VALUES($1,$2,$3)",
          [ctx.owner,debt.id,b.creditorType||"other"]);
        const {rows:items}=await db.query(
          "INSERT INTO finance.cashflow_items(owner_user_id,month_date,kind,debt_id,label,amount_twd,due_day,memo,original_currency,original_amount,fx_rate_to_twd,fx_rate_observed_at,fx_rate_provider) "+
          "VALUES($1,$2::date,'borrowing',$3,$4,$5::numeric,$6,$7,$8,$9::numeric,$10::numeric,$11::timestamptz,$12) "+
          "RETURNING id,kind,debt_id,month_date::text,amount_twd::text",
          [ctx.owner,startMonth(b.month),debt.id,trim(b.name,140),a.amountTwd,Number(b.dueDay),
           trim(b.memo,250),a.originalCurrency,a.originalAmount,a.rate,a.observedAt,a.provider]);
        await audit(db,ctx.owner,"finance.loan_plan.create",items[0].id,{debtId:debt.id},"finance_cashflow_item");
        return {debt,item:items[0],ledgerPosted:false};
      });
      return reply.code(201).send(saved);
    }catch(error){return databaseError(req,reply,error);}
  });
  app.post("/api/finance/cashflow/items",async(req,reply)=>{
    const ctx=await authorized(req,reply,{write:true});if(!ctx)return;
    const b=req.body||{};
    if(!monthKey(b.month)||!["income","expense"].includes(b.kind)||!trim(b.label)
      ||!(b.dueDay==null||b.dueDay===""||(Number.isInteger(Number(b.dueDay))&&Number(b.dueDay)>=1&&Number(b.dueDay)<=31)))
      return fail(reply,"INVALID_CASHFLOW_ITEM");
    try{
      const converted=await plannedAmount(ctx,b);
      if(converted.error)return fail(reply,converted.error);
      const saved=await auditedWrite(ctx,"finance.cashflow.create","finance_cashflow_item",async db=>{
        const {rows}=await db.query(
          "INSERT INTO finance.cashflow_items(owner_user_id,month_date,kind,label,amount_twd,due_day,memo,original_currency,original_amount,fx_rate_to_twd,fx_rate_observed_at,fx_rate_provider) VALUES($1,$2::date,$3,$4,$5::numeric,$6,$7,$8,$9::numeric,$10::numeric,$11::timestamptz,$12) RETURNING id,kind,label,amount_twd::text,original_currency,original_amount::text,fx_rate_to_twd::text,month_date::text,due_day,memo",
          [ctx.owner,startMonth(b.month),b.kind,trim(b.label,140),converted.amountTwd,b.dueDay||null,trim(b.memo,250),converted.originalCurrency,converted.originalAmount,converted.rate,converted.observedAt,converted.provider]
        );
        return rows[0];
      });
      return reply.code(201).send({item:saved});
    }catch(error){return databaseError(req,reply,error);}
  });
  app.put("/api/finance/cashflow/items/:itemId",async(req,reply)=>{
    const ctx=await authorized(req,reply,{write:true});if(!ctx)return;
    const b=req.body||{},itemId=req.params?.itemId;
    if(!id(itemId)||!["income","expense"].includes(b.kind)||!trim(b.label)
      ||!(b.dueDay==null||b.dueDay===""||(Number.isInteger(Number(b.dueDay))&&Number(b.dueDay)>=1&&Number(b.dueDay)<=31)))
      return fail(reply,"INVALID_CASHFLOW_ITEM");
    try{
      const converted=await plannedAmount(ctx,b);
      if(converted.error)return fail(reply,converted.error);
      const saved=await auditedWrite(ctx,"finance.cashflow.update","finance_cashflow_item",async db=>{
        const {rows}=await db.query(
          "UPDATE finance.cashflow_items SET kind=$3,label=$4,amount_twd=$5::numeric,due_day=$6,memo=$7,updated_at=now(),original_currency=$8,original_amount=$9::numeric,fx_rate_to_twd=$10::numeric,fx_rate_observed_at=$11::timestamptz,fx_rate_provider=$12 WHERE owner_user_id=$1 AND id=$2 RETURNING id,kind,label,amount_twd::text,original_currency,original_amount::text,fx_rate_to_twd::text,month_date::text,due_day,memo",
          [ctx.owner,itemId,b.kind,trim(b.label,140),converted.amountTwd,b.dueDay||null,trim(b.memo,250),converted.originalCurrency,converted.originalAmount,converted.rate,converted.observedAt,converted.provider]
        );return rows[0];
      });
      if(!saved)return fail(reply,"CASHFLOW_ITEM_NOT_FOUND",404);
      return {item:saved};
    }catch(error){return databaseError(req,reply,error);}
  });
  app.delete("/api/finance/cashflow/items/:itemId",async(req,reply)=>{
    const ctx=await authorized(req,reply,{write:true});if(!ctx)return;
    const itemId=req.params?.itemId;if(!id(itemId))return fail(reply,"INVALID_CASHFLOW_ITEM");
    try{
      const saved=await auditedWrite(ctx,"finance.cashflow.delete","finance_cashflow_item",async db=>{
        const {rows}=await db.query("DELETE FROM finance.cashflow_items WHERE owner_user_id=$1 AND id=$2 RETURNING id",[ctx.owner,itemId]);return rows[0];
      });
      if(!saved)return fail(reply,"CASHFLOW_ITEM_NOT_FOUND",404);
      return {deleted:true,id:saved.id};
    }catch(error){return databaseError(req,reply,error);}
  });
  app.put("/api/finance/goal-funds",async(req,reply)=>{
    const ctx=await authorized(req,reply,{write:true});if(!ctx)return;
    const b=req.body||{};
    if(!id(b.goalId)||!monthKey(b.month)||typeof b.plannedAmount!=="string"||typeof b.earmarkedAmount!=="string")
      return fail(reply,"INVALID_GOAL_FUND");
    try{
      const saved=await auditedWrite(ctx,"finance.goal_fund.save","finance_goal_fund",async db=>{
        const {rows}=await db.query(
          "SELECT g.currency_code,c.minor_units FROM finance.goals g JOIN finance.currencies c ON c.code=g.currency_code WHERE g.id=$1 AND g.owner_user_id=$2",
          [b.goalId,ctx.owner]
        );
        const goal=rows[0];
        if(!goal)return null;
        if(!money(b.plannedAmount,Number(goal.minor_units))||!money(b.earmarkedAmount,Number(goal.minor_units)))
          return {error:"INVALID_GOAL_FUND"};
        const snapRate=goal.currency_code==="TWD"?"1":(await getFinanceFxSnapshot(ctx.pool)).quotes?.[goal.currency_code]?.rateToTwd;
        const rate=goal.currency_code==="TWD"?"1":positiveRate(snapRate)?snapRate:positiveRate(b.fxRateToTwd)?b.fxRateToTwd:null;
        if(!positiveRate(rate))return {error:"GOAL_FUND_RATE_REQUIRED"};
        const {rows:funds}=await db.query(
          "INSERT INTO finance.goal_fund_allocations(owner_user_id,goal_id,month_date,planned_amount,earmarked_amount,fx_rate_to_twd) VALUES($1,$2,$3::date,$4::numeric,$5::numeric,$6::numeric) ON CONFLICT(owner_user_id,goal_id,month_date) DO UPDATE SET planned_amount=EXCLUDED.planned_amount,earmarked_amount=EXCLUDED.earmarked_amount,fx_rate_to_twd=EXCLUDED.fx_rate_to_twd,updated_at=now() RETURNING id,goal_id,planned_amount::text,earmarked_amount::text,fx_rate_to_twd::text",
          [ctx.owner,b.goalId,startMonth(b.month),b.plannedAmount,b.earmarkedAmount,rate]
        );
        return funds[0];
      });
      if(!saved)return fail(reply,"GOAL_NOT_FOUND",404);
      if(saved.error)return fail(reply,saved.error);
      return {fund:saved};
    }catch(error){return databaseError(req,reply,error);}
  });
  app.put("/api/finance/debt-funds",async(req,reply)=>{
    const ctx=await authorized(req,reply,{write:true});if(!ctx)return;
    const b=req.body||{};
    if(!id(b.debtId)||!monthKey(b.month)||typeof b.plannedAmount!=="string"||typeof b.earmarkedAmount!=="string")
      return fail(reply,"INVALID_DEBT_FUND");
    try{
      const saved=await auditedWrite(ctx,"finance.debt_fund.save","finance_debt_fund",async db=>{
        const {rows}=await db.query("SELECT d.currency_code,c.minor_units FROM finance.debts d JOIN finance.currencies c ON c.code=d.currency_code WHERE d.id=$1 AND d.owner_user_id=$2",[b.debtId,ctx.owner]);
        const debt=rows[0];
        if(!debt)return null;
        if(!money(b.plannedAmount,Number(debt.minor_units))||!money(b.earmarkedAmount,Number(debt.minor_units)))return {error:"INVALID_DEBT_FUND"};
        const snapRate=debt.currency_code==="TWD"?"1":(await getFinanceFxSnapshot(ctx.pool)).quotes?.[debt.currency_code]?.rateToTwd;
        const rate=debt.currency_code==="TWD"?"1":positiveRate(snapRate)?snapRate:positiveRate(b.fxRateToTwd)?b.fxRateToTwd:null;
        if(!positiveRate(rate))return {error:"DEBT_FUND_RATE_REQUIRED"};
        const {rows:funds}=await db.query(
          "INSERT INTO finance.debt_fund_allocations(owner_user_id,debt_id,month_date,planned_amount,earmarked_amount,fx_rate_to_twd) VALUES($1,$2,$3::date,$4::numeric,$5::numeric,$6::numeric) ON CONFLICT(owner_user_id,debt_id,month_date) DO UPDATE SET planned_amount=EXCLUDED.planned_amount,earmarked_amount=EXCLUDED.earmarked_amount,fx_rate_to_twd=EXCLUDED.fx_rate_to_twd,updated_at=now() RETURNING id,debt_id,planned_amount::text,earmarked_amount::text,fx_rate_to_twd::text",
          [ctx.owner,b.debtId,startMonth(b.month),b.plannedAmount,b.earmarkedAmount,rate]
        );
        return funds[0];
      });
      if(!saved)return fail(reply,"DEBT_NOT_FOUND",404);
      if(saved.error)return fail(reply,saved.error);
      return {fund:saved};
    }catch(error){return databaseError(req,reply,error);}
  });
  // Spreadsheet edits only touch plans and allocations. Atomic, audited, owner scoped.
  app.post("/api/finance/cashflow/sheet/batch",async(req,reply)=>{
    const ctx=await authorized(req,reply,{write:true});if(!ctx)return;
    const b=req.body||{},month=monthKey(b.month),ops=b.operations;
    if(!month||!Array.isArray(ops)||ops.length<1||ops.length>80)
      return fail(reply,"INVALID_SHEET_BATCH");
    const seen=new Set(),prepared=[];
    try{
      for(const op of ops){
        if(!op||!["createItem","updateItem","deleteItem","createFund","updateFund","deleteFund"].includes(op.op))
          return fail(reply,"INVALID_SHEET_OPERATION");
        if(op.op!=="createItem"&&op.op!=="createFund"){
          if(!id(op.id)||typeof op.version!=="string"||op.version.length>50)
            return fail(reply,"INVALID_SHEET_ROW_VERSION");
          const key=op.op.includes("Fund")?op.fundType+":"+op.id:"item:"+op.id;
          if(seen.has(key))return fail(reply,"DUPLICATE_SHEET_ROW");
          seen.add(key);
        }
        if(op.op==="createFund"){
          if(op.fundType!=="debt"||!id(op.debtId)||
             typeof op.plannedAmount!=="string"||!money(op.plannedAmount,6))
            return fail(reply,"INVALID_SHEET_NEW_DEBT_FUND");
          const key="new-debt:"+op.debtId;
          if(seen.has(key))return fail(reply,"DUPLICATE_SHEET_DEBT_FUND");
          seen.add(key);prepared.push(op);
        }else if(op.op.endsWith("Item")&&op.op!=="deleteItem"){
          if(!["income","expense"].includes(op.kind)||typeof op.label!=="string"||
             !trim(op.label)||trim(op.label,140)!==trim(op.label)||
             typeof op.memo!=="string"||op.memo.length>250||
             (op.dueDay!==null&&(!Number.isInteger(op.dueDay)||op.dueDay<1||op.dueDay>31)))
             return fail(reply,"INVALID_SHEET_ITEM");
          const amount=await plannedAmount(ctx,{
            currencyCode:op.currencyCode,originalAmount:op.originalAmount
          });
          if(amount.error)return fail(reply,amount.error);
          prepared.push({...op,converted:amount});
        }else if(op.op==="updateFund"){
          if(!["debt","goal"].includes(op.fundType)||
              typeof op.plannedAmount!=="string"||!money(op.plannedAmount,6))
            return fail(reply,"INVALID_SHEET_FUND");
          prepared.push(op);
        }else if(op.op==="deleteFund"){
          if(!["debt","goal"].includes(op.fundType))
            return fail(reply,"INVALID_SHEET_FUND");
          prepared.push(op);
        }else prepared.push(op);
      }
      const results=await financeTransaction(async db=>{
        const saved=[];
        for(const op of prepared){
          let rows=[];
          if(op.op==="createItem"){
            const a=op.converted;
            ({rows}=await db.query(
              "INSERT INTO finance.cashflow_items(owner_user_id,month_date,kind,label,amount_twd,due_day,memo,original_currency,original_amount,fx_rate_to_twd,fx_rate_observed_at,fx_rate_provider) "+
              "VALUES($1,$2::date,$3,$4,$5::numeric,$6,$7,$8,$9::numeric,$10::numeric,$11::timestamptz,$12) RETURNING id",
              [ctx.owner,startMonth(month),op.kind,trim(op.label,140),a.amountTwd,op.dueDay,
                op.memo,a.originalCurrency,a.originalAmount,a.rate,a.observedAt,a.provider]));
          }else if(op.op==="createFund"){
            const {rows:valid}=await db.query(
              "SELECT d.currency_code,c.minor_units FROM finance.debts d JOIN finance.currencies c ON c.code=d.currency_code "+
              "WHERE d.owner_user_id=$1 AND d.id=$2 AND d.principal_original > "+
              "COALESCE((SELECT SUM(p.principal_paid) FROM finance.debt_payments p "+
              "WHERE p.debt_id=d.id AND p.owner_user_id=d.owner_user_id),0)",
              [ctx.owner,op.debtId]);
            if(!valid[0]){const error=new Error("SHEET_DEBT_NOT_ACTIVE");error.sheetCode="SHEET_DEBT_NOT_ACTIVE";throw error;}
            if(!money(op.plannedAmount,Number(valid[0].minor_units))){
              const error=new Error("INVALID_SHEET_FUND_PRECISION");error.sheetCode="INVALID_SHEET_FUND_PRECISION";throw error;
            }
            const snap=valid[0].currency_code==="TWD"?null:await getFinanceFxSnapshot(ctx.pool);
            const fx=valid[0].currency_code==="TWD"?"1":snap?.quotes?.[valid[0].currency_code]?.rateToTwd;
            if(!positiveRate(fx)){
              const error=new Error("SHEET_FUND_RATE_REQUIRED");error.sheetCode="SHEET_FUND_RATE_REQUIRED";throw error;
            }
            ({rows}=await db.query(
              "INSERT INTO finance.debt_fund_allocations(owner_user_id,debt_id,month_date,planned_amount,earmarked_amount,fx_rate_to_twd) "+
              "VALUES($1,$2,$3::date,$4::numeric,0,$5::numeric) "+
              "ON CONFLICT(owner_user_id,debt_id,month_date) DO NOTHING RETURNING id",
              [ctx.owner,op.debtId,startMonth(month),op.plannedAmount,fx]));
            if(!rows[0]){
              const error=new Error("SHEET_FUND_ALREADY_EXISTS");error.sheetCode="SHEET_FUND_ALREADY_EXISTS";throw error;
            }
          }else if(op.op==="updateItem"){
            const a=op.converted;
            ({rows}=await db.query(
              "UPDATE finance.cashflow_items SET kind=$4,label=$5,amount_twd=$6::numeric,due_day=$7,"+
              "memo=$8,original_currency=$9,original_amount=$10::numeric,fx_rate_to_twd=$11::numeric,"+
              "fx_rate_observed_at=$12::timestamptz,fx_rate_provider=$13,updated_at=clock_timestamp() "+
              "WHERE owner_user_id=$1 AND month_date=$2::date AND id=$3 AND updated_at=$14::timestamptz RETURNING id",
              [ctx.owner,startMonth(month),op.id,op.kind,trim(op.label,140),a.amountTwd,
                op.dueDay,op.memo,a.originalCurrency,a.originalAmount,a.rate,a.observedAt,a.provider,op.version]));
          }else if(op.op==="deleteItem"){
            ({rows}=await db.query(
              "DELETE FROM finance.cashflow_items WHERE owner_user_id=$1 AND month_date=$2::date "+
              "AND id=$3 AND updated_at=$4::timestamptz RETURNING id",
              [ctx.owner,startMonth(month),op.id,op.version]));
          }else{
            const table=op.fundType==="debt"?"finance.debt_fund_allocations":"finance.goal_fund_allocations";
            if(op.op==="deleteFund"){
              ({rows}=await db.query("DELETE FROM "+table+" WHERE owner_user_id=$1 AND month_date=$2::date AND id=$3 AND updated_at=$4::timestamptz RETURNING id",
                [ctx.owner,startMonth(month),op.id,op.version]));
            }else{
              const master=op.fundType==="debt"?"finance.debts":"finance.goals";
              const foreign=op.fundType==="debt"?"debt_id":"goal_id";
              const {rows:valid}=await db.query(
                "SELECT c.minor_units FROM "+table+" f JOIN "+master+" m ON m.id=f."+foreign+" AND m.owner_user_id=f.owner_user_id JOIN finance.currencies c ON c.code=m.currency_code WHERE f.owner_user_id=$1 AND f.month_date=$2::date AND f.id=$3",
                [ctx.owner,startMonth(month),op.id]);
              if(!valid[0]||!money(op.plannedAmount,Number(valid[0].minor_units))) {
                const err=new Error("INVALID_SHEET_FUND_PRECISION");err.sheetCode="INVALID_SHEET_FUND_PRECISION";throw err;
              }
              ({rows}=await db.query("UPDATE "+table+" SET planned_amount=$5::numeric,updated_at=clock_timestamp() WHERE owner_user_id=$1 AND month_date=$2::date AND id=$3 AND updated_at=$4::timestamptz RETURNING id",
                [ctx.owner,startMonth(month),op.id,op.version,op.plannedAmount]));
            }
          }
          if(!rows[0]){
            const err=new Error("SHEET_STALE_RELOAD");err.sheetCode="SHEET_STALE_RELOAD";throw err;
          }
          await audit(db,ctx.owner,"finance.sheet."+op.op,rows[0].id,
            {month,source:op.fundType||"item"},"finance_planning_row");
          saved.push({id:rows[0].id,op:op.op});
        }
        return saved;
      });
      reply.header("Cache-Control","private, no-store");
      return {saved:results.length,rows:results,month,ledgerPosted:false};
    }catch(error){
      if(error.sheetCode)return fail(reply,error.sheetCode,["SHEET_STALE_RELOAD","SHEET_FUND_ALREADY_EXISTS"].includes(error.sheetCode)?409:400);
      return databaseError(req,reply,error);
    }
  });

  app.post("/api/finance/debt-payments",async(req,reply)=>{
    const ctx=await authorized(req,reply,{write:true});if(!ctx)return;
    const b=req.body||{};
    if(!id(b.accountId)||!id(b.debtId)||!id(b.idempotencyKey)||!isDate(b.paymentDate)
      ||typeof b.principalPaid!=="string"||typeof b.interestPaid!=="string"||typeof b.feePaid!=="string")
      return fail(reply,"INVALID_DEBT_PAYMENT");
    try{
      const result=await financeTransaction(async db=>{
        // Wallet always locked first, then debtor; consistent with other finance ledger operations.
        const source=await account(db,ctx.owner,b.accountId);
        if(!source)return {error:"SOURCE_ACCOUNT_NOT_FOUND",status:404};
        const {rows}=await db.query("SELECT d.id,d.currency_code,d.principal_original,c.minor_units FROM finance.debts d JOIN finance.currencies c ON c.code=d.currency_code WHERE d.id=$1 AND d.owner_user_id=$2 FOR UPDATE OF d",[b.debtId,ctx.owner]);
        const debt=rows[0];if(!debt)return {error:"DEBT_NOT_FOUND",status:404};
        if(source.currency_code!==debt.currency_code)return {error:"DEBT_CURRENCY_MISMATCH"};
        const minor=Number(debt.minor_units);
        if(![b.principalPaid,b.interestPaid,b.feePaid].every(v=>money(v,minor)))return {error:"INVALID_DEBT_PAYMENT_AMOUNT"};
        const {rows:checks}=await db.query(
          "SELECT ($1::numeric+$2::numeric+$3::numeric)::text AS total,"+
          "($1::numeric+$2::numeric+$3::numeric>0) AS is_positive,"+
          "($1::numeric<=$4::numeric-COALESCE((SELECT SUM(principal_paid) FROM finance.debt_payments WHERE owner_user_id=$5 AND debt_id=$6),0)) AS principal_allowed",
          [b.principalPaid,b.interestPaid,b.feePaid,debt.principal_original,ctx.owner,debt.id]
        );
        const {total,is_positive,principal_allowed}=checks[0];
        if(!is_positive)return {error:"INVALID_DEBT_PAYMENT_AMOUNT"};
        if(!principal_allowed)return {error:"DEBT_PRINCIPAL_EXCEEDS_OUTSTANDING"};
        const rate=source.currency_code==="TWD"?"1":b.fxRateToTwd;
        if(!positiveRate(rate))return {error:"DEBT_PAYMENT_RATE_REQUIRED"};
        const {rows:balance}=await db.query(
          "SELECT COALESCE(SUM(amount),0)>=$3::numeric AS sufficient FROM finance.entries WHERE owner_user_id=$1 AND account_id=$2",
          [ctx.owner,source.id,total]
        );
        // Compare NUMERIC inside PostgreSQL, not floating-point JS currency values.
        if(!balance[0].sufficient)return {error:"DEBT_PAYMENT_INSUFFICIENT_FUNDS"};
        const eventId=await createEvent(db,ctx.owner,"remittance","Trả nợ · "+trim(b.memo,160),b.paymentDate+"T12:00:00+08:00",b.idempotencyKey);
        if(!eventId)return {error:"FINANCE_DUPLICATE_REQUEST",status:409};
        await entry(db,ctx.owner,eventId,source,"-"+total,null,rate);
        const {rows:payments}=await db.query(
          "INSERT INTO finance.debt_payments(owner_user_id,debt_id,payment_date,principal_paid,interest_paid,fee_paid,event_id,base_amount_twd,fx_rate_to_twd) VALUES($1,$2,$3::date,$4::numeric,$5::numeric,$6::numeric,$7,$8::numeric*$9::numeric,$9::numeric) RETURNING id,debt_id,payment_date::text,principal_paid::text,interest_paid::text,fee_paid::text,base_amount_twd::text,event_id",
          [ctx.owner,debt.id,b.paymentDate,b.principalPaid,b.interestPaid,b.feePaid,eventId,total,rate]
        );
        await audit(db,ctx.owner,"finance.debt_payment.post",payments[0].id,{eventId,accountId:source.id},"finance_debt_payment");
        return payments[0];
      });
      if(result.error)return fail(reply,result.error,result.status||400);
      return reply.code(201).send({payment:result});
    }catch(error){return databaseError(req,reply,error);}
  });
}
