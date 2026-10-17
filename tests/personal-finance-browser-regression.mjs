import assert from "node:assert/strict";
import {chromium} from "playwright";
const BASE=process.env.TEST_WEB_BASE||"http://127.0.0.1:3000";
const uuid=n=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
const T=uuid(1),V=uuid(2),expense=uuid(3),income=uuid(4),debtId=uuid(5),goalId=uuid(6);
const browser=await chromium.launch({headless:true});
const cookie="__host-finance-test";
try{
 for(const viewport of [{width:1440,height:900},{width:390,height:844},{width:320,height:700}]){
  const ctx=await browser.newContext({viewport});
  const page=await ctx.newPage(),errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  const accounts=[{id:T,name:"Ví TWD",kind:"bank",currency_code:"TWD",balance:"30000"},{id:V,name:"Ví VND",kind:"bank",currency_code:"VND",balance:"2000000"}];
  const currencies=["TWD","VND","USD","JPY","EUR","CNY"].map(code=>({code,name_vi:code,minor_units:["USD","CNY","EUR"].includes(code)?2:0}));
  const categories=[{id:expense,name:"Ăn uống",kind:"expense"},{id:income,name:"Lương",kind:"income"}];
  const debts=[{id:debtId,name:"Thẻ tín dụng",currency_code:"VND",principal_original:"22000000",outstanding_amount:"22000000",due_date:"2026-11-03"}];
  const goals=[{id:goalId,name:"Học phí",currency_code:"TWD",target_amount:"50000",current_amount:"15000",status:"active",target_date:"2027-02-15"}];
  const items=[];const funds=[{id:uuid(7),debt_id:debtId,debt_name:"Thẻ tín dụng",currency_code:"VND",month_date:"2026-10-01",due_date:"2026-11-03",planned_amount:"10000000",earmarked_amount:"0",fx_rate_to_twd:"0.00125",planned_twd:"12500"}];
  const goalFunds=[],history=[],scenarioBooks=[];
  let num=1000,wroteLedger=0;
  const next=()=>uuid(num++);
  const counts={};
  const respond=(route,value,status=200)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(value)});
  await page.route("**/api/finance/**",async route=>{
   const req=route.request(),url=new URL(req.url()),p=url.pathname.slice("/api/finance".length),m=req.method(),b=m!=="GET"?req.postDataJSON()||{}:{};
   counts[m+" "+p]=(counts[m+" "+p]||0)+1;
   if(p==="/access")return respond(route,{allowed:true});
   if(p==="/bootstrap")return respond(route,{currencies,accounts,categories,budgets:[],debts,goals,reportCurrency:"TWD",plans:[]});
   if(p==="/fx/estimates")return respond(route,{baseCurrency:"TWD",quotes:{TWD:{rateToTwd:"1",status:"base"},VND:{rateToTwd:"0.001250000000",status:"fresh",observedAt:"2026-10-17T01:00:00Z",provider:"exchangerate-api-open"},USD:{rateToTwd:"31.500000000000",status:"fresh",observedAt:"2026-10-17T01:00:00Z",provider:"exchangerate-api-open"}},source:{attribution:"Rates By Exchange Rate API"},readOnlyValuation:true,automaticCurrencyExchange:false});
   if(p==="/overview")return respond(route,{flow:[{kind:"income",total_twd:"50000"},{kind:"expense",total_twd:"12000"}],
     budget:[{id:expense,category_id:expense,name:"Ăn uống",kind:"expense",budget_twd:"15000",actual_twd:"12000"}],events:history});
   if(p==="/cashflow")return respond(route,{month:url.searchParams.get("month"),
     items:items.filter(x=>x.month_date.startsWith(url.searchParams.get("month"))),
     debtFunds:funds.filter(x=>x.month_date.startsWith(url.searchParams.get("month"))),goalFunds:goalFunds.filter(x=>x.month_date.startsWith(url.searchParams.get("month"))),summary:{planned_income_twd:"0",planned_expense_twd:"0",planned_debt_fund_twd:"12500"},unconvertedFunds:[]});
   if(p==="/year")return respond(route,{year:+url.searchParams.get("year"),months:[{month:"2026-10",income_twd:"50000",expense_twd:"12000"}]});
   if(p==="/cashflow/year"){
    const year=+url.searchParams.get("year");
    return respond(route,{year,months:Array.from({length:12},(_,idx)=>{
     const month=year+"-"+String(idx+1).padStart(2,"0");
     const flow=items.filter(x=>x.month_date.startsWith(month));
     return {month,planned_income_twd:String(flow.filter(x=>x.kind==="income").reduce((v,x)=>v+Number(x.amount_twd),0)),
      planned_expense_twd:String(flow.filter(x=>x.kind==="expense").reduce((v,x)=>v+Number(x.amount_twd),0)),
      debt_fund_twd:String(funds.filter(x=>x.month_date.startsWith(month)).reduce((v,x)=>v+Number(x.planned_twd),0)),
      goal_fund_twd:"0",fx_estimate_incomplete:false};
    })});
   }
   if(p==="/advisor")return respond(route,{asOf:"2026-10-17",through:"2026-11-15",days:30,startingBalanceTwd:"30000",
     entries:[{date:"2026-10-30",kind:"income",source:"cashflow",label:"Lương",amountTwd:"50000",projectedBalanceTwd:"80000"}],recommendations:[{title:"Giữ quỹ dự phòng",detail:"Đối chiếu tiền lương và khoản chi trước khi cam kết."}],warnings:[],bufferTwd:"0"});
   if(p==="/workbench"&&m==="GET")return respond(route,{scenarios:scenarioBooks,asOf:"2026-10-17"});
   if(p==="/workbench/preview"&&m==="POST"){
    // A representative read-only server forecast assembled from exactly the
    // same persisted monthly plan and debt fund mock data used by each tab.
    const endMonth=String(new Date(Date.UTC(2026,9+(b.scenario?.months||3),0)).toISOString()).slice(0,7);
    const forthcoming=[
     ...items.filter(x=>x.month_date.slice(0,7)<=endMonth).map(x=>({
       date:x.month_date.slice(0,7)+"-"+String(x.due_day||30).padStart(2,"0"),label:x.label,kind:x.kind,
       source:"cashflow",amountTwd:String(Number(x.amount_twd)*(x.kind==="income"?1:-1))})),
     ...funds.filter(x=>x.month_date.slice(0,7)<=endMonth).map(x=>({
       date:x.month_date.slice(0,7)+"-30",label:"Quỹ nợ · "+x.debt_name,
       source:"debt_fund",kind:"debt",amountTwd:String(-Number(x.planned_twd))}))
    ].filter(x=>x.date>="2026-10-17").sort((a,b)=>a.date.localeCompare(b.date)||
       (Number(b.amountTwd)>0?1:0)-(Number(a.amountTwd)>0?1:0));
    let current=Number(accounts.find(a=>a.id===T).balance),min=current,firstGap=null;
    const timeline=forthcoming.map(x=>{
      current+=Number(x.amountTwd);min=Math.min(min,current);
      if(current<0&&!firstGap)firstGap={date:x.date,gapTwd:String(-current),label:x.label};
      return {...x,balanceTwd:String(current)};
    });
    const repaymentAdvice={priority:["debt","expense","goal"],months:[{month:"2026-11",incomeTwd:"58000",essentialTwd:"100000",
      scheduledDebtTwd:String(funds.reduce((n,x)=>n+Number(x.planned_twd),0)),suggestedAdditionalDebtTwd:"0",
      projectedAfterSuggestionsTwd:String(current),payday:"2026-11-03",details:debts.map(d=>({
        debtId:d.id,name:d.name,remainingPrincipalEstimateTwd:String(Math.round(Number(d.outstanding_amount)*(d.currency_code==="VND"?0.00125:1)))})
      )}],debtBalances:debts.map(d=>({name:d.name,currency:d.currency_code,dueDate:d.due_date,
      remainingPrincipalEstimatedTwd:String(Math.round(Number(d.outstanding_amount)*(d.currency_code==="VND"?0.00125:1)))})),
      warnings:[]};
    return respond(route,{repaymentAdvice,projection:{asOf:"2026-10-17",through:endMonth+"-30",
      startingBalanceTwd:accounts.find(a=>a.id===T).balance,
      endingTwd:String(current),minimumTwd:String(min),bufferTwd:"0",
      minimumAdditionalIncomePerPaydayTwd:"0",warnings:[],earliestRisk:firstGap,timeline},scenario:b.scenario});
   }
   if(p==="/workbench/scenarios"&&m==="POST"){scenarioBooks.push({id:next(),name:b.scenario.name,settings:b.scenario,updated_at:"2026-10-17"});return respond(route,{scenario:scenarioBooks.at(-1)},201);}
   if(p==="/accounts"&&m==="POST"){const a={id:next(),name:b.name,kind:b.kind,currency_code:b.currencyCode,balance:"0"};accounts.push(a);return respond(route,{account:a},201);}
   if(/^\/accounts\/[^/]+\/reconcile$/.test(p)&&m==="POST"){
    const a=accounts.find(x=>x.id===p.split("/")[2]);if(!a||Number(a.balance)!==Number(b.expectedBalance))return respond(route,{error:"BALANCE_CHANGED_RELOAD"},409);
    a.balance=b.targetBalance;wroteLedger++;history.push({id:next(),kind:"adjustment",description:"Đối soát số dư · "+b.reason,occurred_at:"2026-10-17",entries:[{accountId:a.id,amount:b.targetBalance,currency:a.currency_code}]});return respond(route,{reconciliation:{newBalance:a.balance}},201);
   }
   if(p==="/cashflow/items"&&m==="POST"){
    const q=b.currencyCode==="VND"?0.00125:1,a={id:next(),kind:b.kind,label:b.label,amount_twd:String(Math.round(Number(b.originalAmount)*q)),
     original_amount:b.originalAmount,original_currency:b.currencyCode,month_date:b.month+"-01",due_day:b.dueDay,memo:b.memo||"",fx_rate_to_twd:String(q)};
    items.push(a);return respond(route,{item:a},201);
   }
   if(/^\/cashflow\/items\/[^/]+$/.test(p)&&m==="PUT"){
    const a=items.find(x=>x.id===p.split("/").at(-1));Object.assign(a,{kind:b.kind,label:b.label,original_amount:b.originalAmount,original_currency:b.currencyCode,amount_twd:String(Math.round(Number(b.originalAmount)*(b.currencyCode==="VND"?0.00125:1))),due_day:b.dueDay,memo:b.memo});return respond(route,{item:a});
   }
   if(/^\/cashflow\/items\/[^/]+$/.test(p)&&m==="DELETE"){
    items.splice(items.findIndex(x=>x.id===p.split("/").at(-1)),1);return respond(route,{deleted:true});
   }
   if(p==="/debt-plans"&&m==="POST"){
    const d={id:next(),name:b.name,currency_code:b.currencyCode,principal_original:b.principalOriginal,
      annual_interest_rate:String(Number(b.annualInterestPercent)/100),due_date:b.dueDate,
      outstanding_amount:b.principalOriginal};
    debts.push(d);
    let fund=null;
    if(Number(b.plannedAmount)>0){fund={id:next(),debt_id:d.id,debt_name:d.name,currency_code:d.currency_code,
      month_date:b.month+"-01",due_date:d.due_date,payment_day:b.paymentDay,
      planned_amount:b.plannedAmount,earmarked_amount:"0",planned_twd:String(Math.round(Number(b.plannedAmount)*(b.currencyCode==="VND"?0.00125:1)))};
      funds.push(fund);}
    return respond(route,{debt:d,fund},201);
   }
   if(/^\/debts\/[^/]+\/terms$/.test(p)&&m==="PUT"){
    const d=debts.find(x=>x.id===p.split("/")[2]);
    Object.assign(d,{name:b.name,principal_original:b.principalOriginal,annual_interest_rate:String(Number(b.annualInterestPercent)/100),
      due_date:b.dueDate,outstanding_amount:b.principalOriginal});
    if(b.month){let fund=funds.find(x=>x.debt_id===d.id&&x.month_date.startsWith(b.month));
      if(!fund){fund={id:next(),debt_id:d.id,month_date:b.month+"-01",earmarked_amount:"0"};funds.push(fund);}
      Object.assign(fund,{debt_name:d.name,currency_code:d.currency_code,due_date:d.due_date,
        planned_amount:b.plannedAmount,planned_twd:String(Math.round(Number(b.plannedAmount)*(d.currency_code==="VND"?0.00125:1))),
        payment_day:b.paymentDay});}
    return respond(route,{debt:d});
   }
   if(p==="/goal-plans"&&m==="POST"){
    const g={id:next(),name:b.name,currency_code:b.currencyCode,target_amount:b.targetAmount,current_amount:"0",
      target_date:b.targetDate,status:"active"};
    goals.push(g);
    const fund={id:next(),goal_id:g.id,goal_name:g.name,month_date:b.month+"-01",
      target_date:g.target_date,currency_code:g.currency_code,
      planned_amount:b.plannedAmount,earmarked_amount:"0",
      planned_twd:String(Math.round(Number(b.plannedAmount)*(b.currencyCode==="VND"?0.00125:1)))};
    if(Number(b.plannedAmount)>0)goalFunds.push(fund);
    return respond(route,{goal:g,fund},201);
   }
   if(p==="/debt-funds"&&m==="PUT"){const d=funds.find(x=>x.debt_id===b.debtId);
    Object.assign(d,{planned_amount:b.plannedAmount,earmarked_amount:b.earmarkedAmount,payment_day:b.paymentDay||d.payment_day,planned_twd:String(Math.round(+b.plannedAmount*.00125)),fx_rate_to_twd:"0.00125"});
    return respond(route,{fund:d});}
   if(p==="/goal-funds"&&m==="PUT"){const f={id:next(),goal_id:b.goalId,goal_name:"Học phí",currency_code:"TWD",planned_amount:b.plannedAmount,planned_twd:b.plannedAmount};goalFunds.push(f);return respond(route,{fund:f});}
   if(p==="/transactions"&&m==="POST"){const a=accounts.find(a=>a.id===b.accountId);a.balance=String(+a.balance+Number(b.amount)*(b.kind==="income"?1:-1));
     wroteLedger++;return respond(route,{event:{id:next(),kind:b.kind}},201);}
   if(p==="/categories"&&m==="POST"){categories.push({id:next(),name:b.name,kind:b.kind});return respond(route,{category:categories.at(-1)},201);}
   if(p==="/debts"&&m==="POST"){debts.push({id:next(),name:b.name,currency_code:b.currencyCode,outstanding_amount:b.principalOriginal});return respond(route,{debt:debts.at(-1)},201);}
   if(p==="/goals"&&m==="POST"){goals.push({id:next(),name:b.name,currency_code:b.currencyCode,target_amount:b.targetAmount,current_amount:"0",status:"active"});return respond(route,{goal:goals.at(-1)},201);}
   if(/^\/goals\/[^/]+$/.test(p)&&m==="PUT"){const g=goals.find(x=>x.id===p.split("/").at(-1));Object.assign(g,{status:b.status,current_amount:b.currentAmount,name:b.name||g.name,target_amount:b.targetAmount||g.target_amount,target_date:b.targetDate||g.target_date});return respond(route,{goal:g});}
   if(p==="/budgets"&&m==="PUT")return respond(route,{budget:b});
   if(p==="/debt-payments"&&m==="POST")return respond(route,{payment:{id:next()}},201);
   return respond(route,{error:"MOCK_ROUTE_UNIMPLEMENTED",path:p,method:m},404);
  });
  await page.goto(BASE+"/finance.html",{waitUntil:"domcontentloaded"});
  await page.locator("h1").filter({hasText:"Tổng quan tài chính"}).waitFor({timeout:12000});
  assert.equal(await page.locator(".main-nav [data-tab]").count(),5,"Only five clean finance sections should be visible");
  assert.equal(await page.locator(".fin-nav-tools").count(),0,"Legacy finance drawer must be removed");
  assert(await page.locator(".metric").count()===4);
  await page.locator('.main-nav [data-tab="plan"]').click();
  assert.match(await page.locator("#finance-content").innerText(),/Thẻ tín dụng/);
  assert.match(await page.locator("#finance-content").innerText(),/12\.500/,"10 million VND planned debt fund becomes ~12500 TWD");
  assert.doesNotMatch(await page.locator("#finance-content").innerText(),/8\.100\.000\.000/);
  await page.locator('[data-action="newPlan"]').first().click();
  await page.locator('#finance-fields [name="label"]').fill("Lương nhà hàng");
  await page.locator('#finance-fields [name="kind"]').selectOption("income");
  await page.locator('#finance-fields [name="currencyCode"]').selectOption("TWD");
  await page.locator('#finance-fields [name="originalAmount"]').fill("50000");
  await page.locator("#finance-submit").click();
  await page.locator('[data-action="editPlan"]').first().waitFor();
  assert.equal(items.length,1);
  await page.locator('[data-action="newPlan"]').first().click();
  await page.locator('#finance-fields [name="currencyCode"]').selectOption("VND");
  await page.locator('#finance-fields [name="label"]').fill("Chi tiền Việt");
  await page.locator('#finance-fields [name="originalAmount"]').fill("1000000");
  await page.locator("#finance-submit").click();
  assert.equal(items.length,2);assert.equal(Number(items[1].amount_twd),1250);
  await page.reload({waitUntil:"domcontentloaded"});
  await page.locator("h1").filter({hasText:"Tổng quan tài chính"}).waitFor();
  await page.locator('[data-action="reconcile"]').first().click();
  await page.locator('#finance-fields [name="targetBalance"]').fill("35000");
  await page.locator("#finance-submit").click();
  assert.equal(Number(accounts[0].balance),35000);assert.equal(wroteLedger,1);
  await page.locator('.main-nav [data-tab="commitments"]').click();
  await page.locator('[data-action="fundDebt"]').first().click();
  await page.locator('#finance-fields [name="plannedAmount"]').fill("10000000");
  await page.locator("#finance-submit").click();
  assert.equal(Number(funds[0].planned_twd),12500);
  // Reproduce the owner's November example: plan data written once must
  // appear automatically in both reporting and simulation, without re-entry.
  await page.locator("#finance-month").fill("2026-11");
  await page.locator('.main-nav [data-tab="plan"]').click();
  await page.locator('[data-action="newPlan"]').first().click();
  await page.locator('#finance-fields [name="kind"]').selectOption("income");
  await page.locator('#finance-fields [name="label"]').fill("Lương tháng 11");
  await page.locator('#finance-fields [name="originalAmount"]').fill("58000");
  await page.locator('#finance-fields [name="dueDay"]').fill("3");
  await page.locator("#finance-submit").click();
  await page.locator('[data-action="newPlan"]').first().click();
  await page.locator('#finance-fields [name="label"]').fill("Tiền nhà tháng 11");
  await page.locator('#finance-fields [name="originalAmount"]').fill("100000");
  await page.locator('#finance-fields [name="dueDay"]').fill("15");
  await page.locator("#finance-submit").click();
  // One debt entered in the PLAN creates one linked liability and one plan
  // allocation, not another "expense" row or any actual wallet mutation.
  await page.locator('[data-action="newPlan"]').first().click();
  await page.locator('#finance-fields [name="kind"]').selectOption("debt");
  await page.locator('#finance-fields [name="label"]').fill("Vay học phí");
  await page.locator('#finance-fields [name="currencyCode"]').selectOption("VND");
  await page.locator('#finance-fields [name="originalAmount"]').fill("2000000");
  await page.locator('#finance-fields [name="principalOriginal"]').fill("12000000");
  await page.locator('#finance-fields [name="annualInterestPercent"]').fill("9.5");
  await page.locator('#finance-fields [name="dueDate"]').fill("2026-11-18");
  await page.locator('#finance-fields [name="dueDay"]').fill("18");
  assert.equal(await page.locator('[data-plan-extra="debt"] input:disabled').count(),0);
  await page.locator("#finance-submit").click();
  const addedDebt=debts.find(d=>d.name==="Vay học phí");
  assert(addedDebt,"Entering debt in the monthly plan must create a linked debt");
  assert.equal(addedDebt.annual_interest_rate,"0.095");
  assert.equal(items.length,4,"Liability must not be duplicated as a cashflow expense");
  assert.equal(funds.filter(x=>x.debt_id===addedDebt.id&&x.month_date.startsWith("2026-11")).length,1);
  assert.equal(wroteLedger,1,"Drafting a debt never posts actual payment or income");
  await page.getByText("Vay học phí",{exact:true}).waitFor();
  assert.match(await page.locator("#finance-content").innerText(),/1 · Cao nhất/);
  await page.locator('.main-nav [data-tab="commitments"]').click();
  const editDebt=page.locator('[data-action="editDebt"][data-id="'+addedDebt.id+'"]');
  await editDebt.first().click();
  await page.locator('#finance-fields [name="annualInterestPercent"]').fill("12");
  await page.locator('#finance-fields [name="plannedAmount"]').fill("3000000");
  await page.locator('#finance-fields [name="paymentDay"]').fill("20");
  await page.locator("#finance-submit").click();
  assert.equal(addedDebt.annual_interest_rate,"0.12");
  assert.equal(funds.find(x=>x.debt_id===addedDebt.id).payment_day,20);
  assert.equal(Number(funds.find(x=>x.debt_id===addedDebt.id).planned_twd),3750);
  await page.locator('.main-nav [data-tab="plan"]').click();
  assert.match(await page.locator("#finance-content").innerText(),/3\.750/);
  await page.locator('[data-action="newPlan"]').first().click();
  await page.locator('#finance-fields [name="kind"]').selectOption("goal");
  await page.locator('#finance-fields [name="label"]').fill("Quỹ dự phòng");
  await page.locator('#finance-fields [name="originalAmount"]').fill("1000");
  await page.locator('#finance-fields [name="targetAmount"]').fill("20000");
  await page.locator('#finance-fields [name="targetDate"]').fill("2026-12-31");
  await page.locator("#finance-submit").click();
  assert(goals.some(g=>g.name==="Quỹ dự phòng"));
  assert(goalFunds.some(g=>g.goal_name==="Quỹ dự phòng"));
  assert.equal(items.length,4,"Savings goals must not be duplicate expense entries");
  await page.getByText("Quỹ dự phòng",{exact:true}).waitFor();
  assert.match(await page.locator("#finance-content").innerText(),/3 · Sau cùng/);
  await page.locator('.main-nav [data-tab="reports"]').click();
  assert.match(await page.locator("#finance-content").innerText(),/Dòng tiền & báo cáo/);
  await page.getByText("Dòng tiền dự kiến từ Kế hoạch tài chính").waitFor();
  await page.getByText("So sánh kế hoạch 12 tháng").waitFor();
  await page.getByText("Tiền nhà tháng 11",{exact:true}).waitFor();
  assert.match(await page.locator("#finance-content").innerText(),/Thu dự kiến/);
  assert.match(await page.locator("#finance-content").innerText(),/58\.000/);
  assert.match(await page.locator("#finance-content").innerText(),/100\.000/);
  assert((counts["POST /workbench/preview"]||0)>=2,"A baseline preview must automatically refresh after edits/month change");
  await page.locator('.main-nav [data-tab="simulator"]').click();
  await page.getByText("Cuối kỳ dự báo").waitFor();
  await page.getByText("Tự phân tích từ số liệu Kế hoạch tài chính đã lưu").waitFor();
  await page.getByText("Kế hoạch trả nợ từ lương và dòng tiền mới").waitFor();
  await page.getByText("Quỹ dự phòng").first().waitFor();
  await page.getByText("Tiền nhà tháng 11").first().waitFor();
  assert.match(await page.locator("#finance-content").innerText(),/19\.500|65\.000|42\.000|7\.000/,
   "Forecast should reflect saved plans and the real wallet balance; not stale demo numbers.");

  await page.locator('[data-action="simulate"]').click();
  await page.getByText("Cuối kỳ dự báo").waitFor();
  await page.locator("#finance-settings").click();
  assert.match(await page.locator("#finance-content").innerText(),/Tài khoản & cài đặt/);
  const size=await page.evaluate(()=>({doc:document.documentElement.scrollWidth,view:innerWidth}));
  assert(size.doc<=size.view+1,"Finance v2 overflows screen: "+JSON.stringify({viewport,size}));
  assert.deepEqual(errors,[],"Unexpected JS errors at viewport "+viewport.width);
  await ctx.close();
  console.log("PASS Finance v2 "+viewport.width+"px: fresh clean nav, native FX, debt repricing, plan edits, wallet reconciliation, reports & simulator");
 }
}finally{await browser.close();}
