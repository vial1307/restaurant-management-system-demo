// Single read-only source for historic debt payments and monthly projections.
// An allocation is NOT an actual repayment. Do not infer historic payments from
// plan entries, ordinary expenses or a manually reconciled wallet balance.
const todayTaipei=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
export async function loadFinanceDebtProgress(pool,owner,year){
 const {rows}=await pool.query(
  "WITH months AS (SELECT generate_series(make_date($2::int,1,1),make_date($2::int,12,1),interval '1 month')::date AS month_date), "+
  "monthly_paid AS (SELECT debt_id,date_trunc('month',payment_date)::date AS month_date,"+
  "SUM(principal_paid) AS principal,SUM(interest_paid) AS interest,SUM(fee_paid) AS fees,"+
  "SUM(base_amount_twd) AS total_twd,COUNT(*)::int AS payment_count "+
  "FROM finance.debt_payments WHERE owner_user_id=$1 AND payment_date>=make_date($2::int,1,1) "+
  "AND payment_date<make_date($2::int+1,1,1) GROUP BY debt_id,date_trunc('month',payment_date)::date) "+
  "SELECT d.id AS debt_id,d.name,d.currency_code,d.principal_original::text,d.due_date::text, "+
  "COALESCE(t.creditor_type,'other') AS creditor_type,COALESCE(t.obligation_type,'unconfirmed') AS obligation_type,"+
  "to_char(m.month_date,'YYYY-MM') AS month, "+
  "COALESCE(f.planned_amount,0)::text AS planned_native,f.planned_payment_date::text AS planned_payment_date, "+
  "COALESCE(p.principal,0)::text AS paid_principal_native,COALESCE(p.interest,0)::text AS paid_interest_native, "+
  "COALESCE(p.fees,0)::text AS paid_fees_native,COALESCE(p.total_twd,0)::text AS paid_twd, "+
  "COALESCE(p.payment_count,0)::int AS payment_count, "+
  "(d.principal_original-COALESCE((SELECT SUM(q.principal_paid) FROM finance.debt_payments q "+
  "WHERE q.owner_user_id=d.owner_user_id AND q.debt_id=d.id AND q.payment_date<m.month_date),0))::text AS opening_principal_native, "+
  "(d.principal_original-COALESCE((SELECT SUM(q.principal_paid) FROM finance.debt_payments q "+
  "WHERE q.owner_user_id=d.owner_user_id AND q.debt_id=d.id AND q.payment_date<m.month_date+interval '1 month'),0))::text AS closing_principal_native "+
  "FROM finance.debts d CROSS JOIN months m "+
  "LEFT JOIN finance.debt_mentor_terms t ON t.debt_id=d.id AND t.owner_user_id=d.owner_user_id "+
  "LEFT JOIN finance.debt_fund_allocations f ON f.debt_id=d.id AND f.owner_user_id=d.owner_user_id AND f.month_date=m.month_date "+
  "LEFT JOIN monthly_paid p ON p.debt_id=d.id AND p.month_date=m.month_date "+
  "WHERE d.owner_user_id=$1 AND d.archived_at IS NULL ORDER BY d.due_date NULLS LAST,d.name,d.id,m.month_date",
  [owner,year]
 );
 const byDebt=new Map(),asOf=todayTaipei(),warnings=[];
 for(const row of rows){
  let debt=byDebt.get(row.debt_id);
  if(!debt){
   debt={id:row.debt_id,name:row.name,currency:row.currency_code,
     principalOriginal:row.principal_original,dueDate:row.due_date,
     creditorType:row.creditor_type,obligationType:row.obligation_type,
     scheduleType:row.due_date?"contractual_due":"flexible_or_unconfirmed",
     months:[]};
   byDebt.set(row.debt_id,debt);
  }
  const planned=Number(row.planned_native),paid=Number(row.paid_principal_native)+Number(row.paid_interest_native)+Number(row.paid_fees_native);
  const monthPast=row.month<asOf.slice(0,7);
  const hasTarget=!!row.planned_payment_date;
  debt.months.push({month:row.month,plannedNative:row.planned_native,
   plannedPaymentDate:row.planned_payment_date,scheduledDateType:hasTarget?"owner_target":row.due_date?.startsWith(row.month)?"contractual_due":"unspecified",
   paidPrincipalNative:row.paid_principal_native,paidInterestNative:row.paid_interest_native,
   paidFeesNative:row.paid_fees_native,paidTotalNative:String(paid),
   paidTwd:row.paid_twd,paymentCount:row.payment_count,
   openingPrincipalNative:row.opening_principal_native,
   closingPrincipalNative:row.closing_principal_native,
   unconfirmedPlanNative:String(Math.max(0,planned-paid)),
   status:row.payment_count?"posted":planned>0&&monthPast?"unreconciled":planned>0?"planned":"none"});
 }
 const debts=[...byDebt.values()];
 for(const d of debts){
  if(d.months.some(m=>m.status==="unreconciled"))
   warnings.push("Khoản “"+d.name+"” có tháng đã qua với quỹ dự kiến nhưng chưa có bút toán trả nợ xác nhận. Không tự coi là đã trả.");
 }
 return {year,asOf,debts,warnings,source:"finance_postgresql",
  rules:{actualFrom:"finance.debt_payments",plannedFrom:"finance.debt_fund_allocations",
   historyReadOnly:true,noPlanAsPayment:true,undatedFriendLoansAreNotOverdue:true}};
}
export function registerFinanceDebtProgressRoutes(app,{authorized,fail,databaseError}){
 app.get("/api/finance/debt-progress",async(req,reply)=>{
  const ctx=await authorized(req,reply);if(!ctx)return;
  const year=Number(req.query?.year??todayTaipei().slice(0,4));
  if(!Number.isInteger(year)||year<2000||year>2100)return fail(reply,"INVALID_YEAR");
  try{const result=await loadFinanceDebtProgress(ctx.pool,ctx.owner,year);
   reply.header("Cache-Control","private, no-store");return result;
  }catch(error){return databaseError(req,reply,error);}
 });
}
