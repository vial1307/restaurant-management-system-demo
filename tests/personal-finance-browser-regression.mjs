import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE=process.env.TEST_WEB_BASE||"http://127.0.0.1:3000";
const browser=await chromium.launch({headless:true});
const currencies=["TWD","VND","USD","JPY","EUR","CNY"].map(code=>({code,name_vi:code,symbol:code,minor_units:["USD","EUR","CNY"].includes(code)?2:0}));
const account=(id,name,code,balance)=>({id,name,currency_code:code,balance,kind:"bank"});
const initialAccounts=[
 account("00000000-0000-4000-8000-000000000001","Ngân hàng Đài","TWD","0"),
 account("00000000-0000-4000-8000-000000000002","Ngân hàng VN","VND","0")
];
try {
  for(const viewport of [{width:1440,height:900},{width:390,height:844},{width:320,height:700}]){
    const context=await browser.newContext({viewport});
    const page=await context.newPage();
    const pageErrors=[];
    let accounts=structuredClone(initialAccounts);
    let plans=[];
    let goals=[];
    let debts=[];
    let cashItems=[];
    let debtFunds=[];
    let goalFunds=[];
    let debtPayments=[];
    const attemptedTransactionKeys=[];
    const advisorCalls=[];
    let scenarioBooks=[];
    const scenarioPreviews=[];

    page.on("pageerror",error=>pageErrors.push(error.message));
    await page.route("**/api/finance/**",async route=>{
      const url=new URL(route.request().url()),pathname=url.pathname;
      const method=route.request().method();
      let data={},status=200;
      if(method==="GET"&&pathname.endsWith("/bootstrap")){
        data={currencies,accounts,categories:[],budgets:[],plans,goals,debts,reportCurrency:"TWD"};
      }else if(method==="GET"&&pathname.endsWith("/overview")){
        data={month:url.searchParams.get("month"),flow:[],budget:[],events:[]};
      }else if(method==="GET"&&pathname.endsWith("/advisor")){
        const days=url.searchParams.get("days"),buffer=url.searchParams.get("bufferTwd");
        advisorCalls.push({days,buffer});
        data={asOf:"2026-10-17",through:days==="90"?"2027-01-14":"2026-11-15",days:Number(days),bufferTwd:buffer,
          startingBalanceTwd:"1000",projectedEndingTwd:"-500",minimumBalanceTwd:"-500",minimumDate:"2026-10-22",
          earliestRisk:{date:"2026-10-22",balanceTwd:"-500",gapTwd:"500",label:"Chi phí",source:"cashflow"},
          totals:{income:"1000",expense:"1500",debt:"0",goal:"0",remittance:"0"},totalOutflowTwd:"1500",
          entries:[{date:"2026-10-20",kind:"income",label:"Lương",amountTwd:"1000",projectedBalanceTwd:"2000",source:"cashflow",estimatedDate:false},
            {date:"2026-10-22",kind:"expense",label:"Chi phí",amountTwd:"-1500",projectedBalanceTwd:"500",source:"cashflow",estimatedDate:false}],
          cycles:[{startDate:"2026-10-17",endDate:"2026-10-19",nextIncomeDate:"2026-10-20",incomeTwd:"0",
            obligationsTwd:"0",goalAllocationsTwd:"0",minimumBalanceTwd:"1000",reserveGapTwd:"500",
            endingBalanceTwd:"1000"},{startDate:"2026-10-20",endDate:"2026-11-15",nextIncomeDate:null,
            incomeTwd:"1000",obligationsTwd:"1500",goalAllocationsTwd:"0",minimumBalanceTwd:"-500",
            reserveGapTwd:"500",endingBalanceTwd:"-500"}],
          alerts:[{code:"LIQUIDITY_GAP",severity:"danger",date:"2026-10-22",
            title:"Thiếu mức dự trữ trước kỳ thu tiếp theo",message:"Cần bù 500 TWD vào ngày 2026-10-22."}],
          warnings:[{code:"ESTIMATED_DATES",message:"Kiểm tra ngày thanh toán dự kiến."}],
          recommendations:[{kind:"liquidity_gap",title:"Ưu tiên xử lý thiếu hụt",detail:"Kiểm tra dòng tiền theo ngày, không tự chuyển tiền."}],
          foreignWallets:[{name:"Ví VND",currency:"VND",balance:"100000"}],metadata:{currency:"TWD",countedWallets:1,readOnly:true}};
      }else if(method==="GET"&&pathname.endsWith("/workbench")){
        data={asOf:"2026-10-17",scenarios:scenarioBooks,source:"finance_postgresql"};
      }else if(method==="POST"&&pathname.endsWith("/workbench/preview")){
        const settings=route.request().postDataJSON().scenario;
        scenarioPreviews.push(settings);
        data={projection:{
          name:settings.name,asOf:"2026-10-17",through:"2027-01-16",
          startingBalanceTwd:"0",bufferTwd:settings.bufferTwd,minimumTwd:"0",endingTwd:"0",
          safeExtraDebtTwd:"0",minimumAdditionalIncomePerPaydayTwd:"0",earliestRisk:null,
          firstPayday:"2026-11-10",warnings:[],loans:[],timeline:[],
          months:[{month:"2026-10",incomeTwd:"0",costTwd:"0",goalTwd:"0",borrowedTwd:"0",
            repaymentTwd:"0",endingTwd:"0",minimumTwd:"0",surplusTwd:"0"}]
        }};
      }else if(method==="POST"&&pathname.endsWith("/workbench/scenarios")){
        const settings=route.request().postDataJSON().scenario;
        const b={id:"00000000-0000-4000-8000-000000000099",name:settings.name,settings};
        scenarioBooks=[b];data={scenario:b};status=201;
      }else if(method==="PUT"&&pathname.includes("/workbench/scenarios/")){
        const settings=route.request().postDataJSON().scenario;
        const b={id:scenarioBooks[0].id,name:settings.name,settings};
        scenarioBooks=[b];data={scenario:b};
      }else if(method==="DELETE"&&pathname.includes("/workbench/scenarios/")){
        scenarioBooks=[];data={deleted:true};
      }else if(method==="GET"&&pathname.endsWith("/cashflow")){
        const inc=cashItems.filter(i=>i.kind==="income").reduce((sum,i)=>sum+Number(i.amount_twd),0);
        const exp=cashItems.filter(i=>i.kind==="expense").reduce((sum,i)=>sum+Number(i.amount_twd),0);
        const reserve=debtFunds.reduce((sum,i)=>sum+Number(i.planned_twd),0);
        const earmarked=debtFunds.reduce((sum,i)=>sum+Number(i.earmarked_twd),0);
        const currentMonth=url.searchParams.get("month");
        const visibleGoalFunds=goalFunds.filter(f=>f.month===currentMonth);
        const goalsReserved=visibleGoalFunds.reduce((sum,i)=>sum+Number(i.planned_twd),0);
        const goalsEarmarked=visibleGoalFunds.reduce((sum,i)=>sum+Number(i.earmarked_twd),0);
        const paid=debtPayments.reduce((sum,i)=>sum+Number(i.base_amount_twd),0);
        data={month:currentMonth,items:cashItems,debtFunds,goalFunds:visibleGoalFunds,debtPayments,summary:{
          planned_income_twd:String(inc),planned_expense_twd:String(exp),planned_debt_fund_twd:String(reserve),
          earmarked_debt_fund_twd:String(earmarked),planned_goal_fund_twd:String(goalsReserved),earmarked_goal_fund_twd:String(goalsEarmarked),planned_net_twd:String(inc-exp-reserve-goalsReserved),
          actual_income_twd:"0",actual_expense_twd:"0",actual_debt_paid_twd:String(paid),actual_net_twd:String(-paid)
        }};
      }else if(method==="GET"&&pathname.endsWith("/cashflow/year")){
        const year=Number(url.searchParams.get("year"));
        data={year,months:Array.from({length:12},(_,i)=>({month:year+"-"+String(i+1).padStart(2,"0"),
         planned_income_twd:"0",planned_expense_twd:"0",debt_fund_twd:"0",
         goal_fund_twd:String(goalFunds.filter(f=>f.month===year+"-"+String(i+1).padStart(2,"0")).reduce((a,f)=>a+Number(f.planned_twd),0)),debt_paid_twd:"0"}))};
      }else if(method==="GET"&&pathname.endsWith("/year")){
        const year=Number(url.searchParams.get("year"));
        data={year,months:Array.from({length:12},(_,i)=>({month:year+"-"+String(i+1).padStart(2,"0"),budget_twd:"0",income_twd:"0",expense_twd:"0"}))};
      }else if(method==="POST"&&pathname.endsWith("/accounts")){
        const b=route.request().postDataJSON();
        assert.equal(route.request().headers()["x-finance-write"],"1");
        const a=account("00000000-0000-4000-8000-000000000003",b.name,b.currencyCode,"0");
        accounts.push(a);data={account:a};status=201;
      }else if(method==="POST"&&pathname.endsWith("/fx-plans")){
        const b=route.request().postDataJSON();
        assert.equal(route.request().headers()["x-finance-write"],"1");
        const p={id:"00000000-0000-4000-8000-000000000004",
          plan_date:b.planDate,plan_kind:b.planKind,from_currency:b.fromCurrency,to_currency:b.toCurrency,
          source_amount:b.sourceAmount,expected_rate:b.expectedRate,expected_fee:b.expectedFee,status:"planned",memo:b.memo};
        plans.push(p);data={plan:p};status=201;
      }else if(method==="POST"&&pathname.endsWith("/goals")){
        const b=route.request().postDataJSON();
        const g={id:"00000000-0000-4000-8000-000000000011",name:b.name,currency_code:b.currencyCode,target_amount:b.targetAmount,current_amount:"0",status:"active",target_date:b.targetDate||null};
        goals.push(g);data={goal:g};status=201;
      }else if(method==="PUT"&&pathname.includes("/goals/")){
        const b=route.request().postDataJSON();
        const goal=goals.find(g=>pathname.endsWith(g.id));
        assert.ok(goal,"Must update existing goal");
        goal.current_amount=b.currentAmount;goal.status=b.status;
        data={goal:{id:goal.id,current_amount:b.currentAmount,status:b.status}};
      }else if(method==="POST"&&pathname.endsWith("/debts")){
        const b=route.request().postDataJSON();
        const d={id:"00000000-0000-4000-8000-000000000012",name:b.name,currency_code:b.currencyCode,principal_original:b.principalOriginal,outstanding_amount:b.principalOriginal,annual_interest_rate:"0.05",due_date:b.dueDate||null};
        debts.push(d);data={debt:d};status=201;
      }else if(method==="POST"&&pathname.includes("/fx-plans/")&&pathname.endsWith("/cancel")){
        const id=pathname.split("/")[4];
        const plan=plans.find(p=>p.id===id);
        assert.ok(plan && plan.status==="planned","Expected planned FX");
        plan.status="cancelled";data={plan:{id,status:"cancelled"}};
      }else if(method==="POST"&&pathname.endsWith("/cashflow/items")){
        const b=route.request().postDataJSON();
        const i={id:"00000000-0000-4000-8000-"+String(cashItems.length+21).padStart(12,"0"),kind:b.kind,label:b.label,month_date:b.month+"-01",
          amount_twd:b.amountTwd,due_day:b.dueDay||null,memo:b.memo||""};
        cashItems.push(i);data={item:i};status=201;
      }else if(method==="PUT"&&pathname.includes("/cashflow/items/")){
        const b=route.request().postDataJSON();
        const item=cashItems.find(i=>pathname.endsWith(i.id));assert.ok(item);
        Object.assign(item,{kind:b.kind,label:b.label,amount_twd:b.amountTwd,due_day:b.dueDay||null,memo:b.memo||""});
        data={item};
      }else if(method==="DELETE"&&pathname.includes("/cashflow/items/")){
        cashItems=cashItems.filter(i=>!pathname.endsWith(i.id));data={deleted:true};
      }else if(method==="PUT"&&pathname.endsWith("/goal-funds")){
        const b=route.request().postDataJSON();
        assert.equal(route.request().headers()["x-finance-write"],"1");
        const goal=goals.find(g=>g.id===b.goalId);assert.ok(goal,"Goal ID must refer to real owned goal");
        const rate=goal.currency_code==="TWD"?1:Number(b.fxRateToTwd);
        const fund={id:"00000000-0000-4000-8000-000000000024",goal_id:goal.id,goal_name:goal.name,
          currency_code:goal.currency_code,month:b.month,planned_amount:b.plannedAmount,
          earmarked_amount:b.earmarkedAmount,planned_twd:String(Number(b.plannedAmount)*rate),
          earmarked_twd:String(Number(b.earmarkedAmount)*rate),fx_rate_to_twd:String(rate)};
        goalFunds=goalFunds.filter(f=>!(f.goal_id===goal.id&&f.month===b.month)).concat(fund);
        data={fund};
      }else if(method==="PUT"&&pathname.endsWith("/debt-funds")){
        const b=route.request().postDataJSON();
        const debt=debts.find(d=>d.id===b.debtId);assert.ok(debt);
        const rate=debt.currency_code==="TWD"?1:Number(b.fxRateToTwd);
        const fund={id:"00000000-0000-4000-8000-000000000022",debt_id:b.debtId,debt_name:debt.name,
          currency_code:debt.currency_code,planned_amount:b.plannedAmount,earmarked_amount:b.earmarkedAmount,
          planned_twd:String(Number(b.plannedAmount)*rate),earmarked_twd:String(Number(b.earmarkedAmount)*rate),
          fx_rate_to_twd:String(rate)};
        debtFunds=debtFunds.filter(f=>f.debt_id!==b.debtId).concat(fund);
        data={fund};
      }else if(method==="POST"&&pathname.endsWith("/debt-payments")){
        const b=route.request().postDataJSON();
        const debt=debts.find(d=>d.id===b.debtId);assert.ok(debt);
        const wallet=accounts.find(a=>a.id===b.accountId);
        const total=Number(b.principalPaid)+Number(b.interestPaid)+Number(b.feePaid);
        assert(wallet && Number(wallet.balance)>=total,"Test payment requires actual wallet funds");
        wallet.balance=String(Number(wallet.balance)-total);
        debt.outstanding_amount=String(Number(debt.outstanding_amount)-Number(b.principalPaid));
        const payment={id:"00000000-0000-4000-8000-000000000023",debt_id:debt.id,debt_name:debt.name,
          currency_code:debt.currency_code,payment_date:b.paymentDate,principal_paid:b.principalPaid,
          interest_paid:b.interestPaid,fee_paid:b.feePaid,base_amount_twd:String(total*Number(b.fxRateToTwd||1))};
        debtPayments.push(payment);data={payment};status=201;
      }else if(method==="POST"&&pathname.endsWith("/transactions")){
        attemptedTransactionKeys.push(route.request().postDataJSON().idempotencyKey);
        data={error:"FINANCE_DATABASE_UNAVAILABLE"};status=503;
      }else{data={error:"NOT_FOUND"};status=404;}
      await route.fulfill({status,contentType:"application/json",body:JSON.stringify(data)});
    });
    await page.goto(BASE+"/finance.html",{waitUntil:"domcontentloaded"});
    await page.locator("h1").filter({hasText:"Tổng quan tài chính"}).waitFor({timeout:12000});
    assert((await page.locator(".fin-kpi-value").allTextContents()).every(t=>t.includes("0")),
      "No invented money values can appear before actual postings");
    await page.locator(".fin-control-summary").waitFor();
    assert((await page.locator(".fin-alert-line.danger").first().textContent()).includes("2026-10-22"),
      "Overview must show a readable day-specific liquidity alert from the advisor API");
    assert.equal(await page.locator('.fin-howto summary').count(),1,"Getting-started guide is available on all viewports");
    // A dedicated advisory tab must read protected API and permit 30/60/90d controls.
    await page.locator('.fin-nav [data-tab="advisor"]').click();
    await page.locator("h1").filter({hasText:"Tư vấn dòng tiền"}).waitFor();
    await page.getByText("Ưu tiên xử lý thiếu hụt").waitFor();
    assert.equal(advisorCalls.length,1);
    assert.equal(advisorCalls[0].days,"30");
    assert.equal(advisorCalls[0].buffer,"0");
    await page.locator("#fin-advice-days").selectOption("90");
    await page.locator("#fin-advice-buffer").fill("3000");
    await page.locator('[data-advice-refresh]').click();
    await page.waitForFunction(()=>document.querySelector("#fin-advice-days")?.value==="90"
      &&!!document.querySelector(".fin-advice-event"));
    assert.equal(advisorCalls.at(-1).days,"90");
    assert.equal(advisorCalls.at(-1).buffer,"3000");
    await page.locator('[data-go-finance-tab="budget"]').click();
    await page.locator("h1").filter({hasText:"Kế hoạch tháng / năm"}).waitFor();
    assert.equal(await page.locator(".fin-nav [data-tab='advisor']").count(),1,"Adviser link never missing on mobile");
    await page.locator('.fin-nav [data-tab="overview"]').click();

    // 12-month scenario workbench is a spreadsheet, not a second real ledger.
    await page.locator('.fin-nav [data-tab="workbench"]').click();
    await page.locator("h1").filter({hasText:"Bảng điều hành tài chính"}).waitFor();
    await page.locator(".fin-wb-metrics").waitFor();
    assert.equal(scenarioPreviews.length,1,"Initial preview must use protected Finance API");
    const horizonRequest=page.waitForResponse(resp=>resp.url().endsWith("/workbench/preview") &&
      String(resp.request().postDataJSON()?.scenario?.months)==="3",{timeout:10000});
    await page.locator('[data-wb-field="months"]').selectOption("3");
    await horizonRequest;
    assert.equal(String(scenarioPreviews.at(-1).months),"3");
    await page.locator('[data-wb-action="add-expense"]').click();
    await page.locator('[data-wb-row="0"][data-wb-prop="label"]').fill("Chi đi chơi");
    const changedLabel=page.waitForResponse(resp=>resp.url().endsWith("/workbench/preview") &&
      resp.request().postDataJSON()?.scenario?.rows?.some(r=>r.label==="Chi đi chơi"),{timeout:10000});
    await page.locator('[data-wb-row="0"][data-wb-prop="label"]').press("Tab");
    await changedLabel;
    await page.waitForFunction(()=>document.querySelector('[data-wb-action="preview"]')?.disabled===false);
    await page.locator('[data-wb-row="0"][data-wb-prop="amountTwd"]').fill("2000");
    const changed=page.waitForResponse(resp=>resp.url().endsWith("/workbench/preview") &&
      resp.request().postDataJSON()?.scenario?.rows?.some(r=>r.label==="Chi đi chơi"&&r.amountTwd==="2000"),{timeout:10000});
    await page.locator('[data-wb-row="0"][data-wb-prop="amountTwd"]').press("Tab");
    await changed;
    assert(scenarioPreviews.some(x=>x.rows.some(r=>r.label==="Chi đi chơi"&&r.amountTwd==="2000")));
    await page.locator('[data-wb-action="loan"]').click();
    assert.equal(await page.locator(".fin-wb-editor tbody tr").count(),3,
      "Borrowing must create a pair of borrow and dated repayment, never just free cash");
    await page.locator('[data-wb-row="1"][data-wb-prop="amountTwd"]').fill("4000");
    await page.locator('[data-wb-row="1"][data-wb-prop="amountTwd"]').press("Tab");
    await page.locator('[data-wb-row="2"][data-wb-prop="amountTwd"]').fill("4200");
    await page.locator('[data-wb-row="2"][data-wb-prop="amountTwd"]').press("Tab");
    await page.locator('[data-wb-action="save"]').click();
    await page.locator("#fin-wb-saved").waitFor();
    assert.equal(scenarioBooks.length,1);
    assert.equal(scenarioBooks[0].settings.rows[1].linkId,scenarioBooks[0].settings.rows[2].linkId);
    assert.equal(accounts[0].balance,"0","Scenario borrowing must never post cash");
    await page.reload({waitUntil:"domcontentloaded"});
    await page.locator("h1").filter({hasText:"Tổng quan tài chính"}).waitFor();
    await page.locator('.fin-nav [data-tab="workbench"]').click();
    await page.locator(".fin-wb-editor tbody tr").first().waitFor();
    assert.equal(await page.locator(".fin-wb-editor tbody tr").count(),3,
      "Saved scenario must survive F5 through Finance DB readback");
    await page.locator('.fin-nav [data-tab="overview"]').click();
    await page.locator('[data-open="account"]').click();
    await page.locator('#finance-dialog [name="name"]').fill("Ví VN thêm");
    await page.locator('#finance-dialog [name="kind"]').selectOption("bank");
    await page.locator('#finance-dialog [name="currencyCode"]').selectOption("VND");
    await page.locator("#finance-submit").click();
    await page.locator('.fin-row').filter({hasText:"Ví VN thêm"}).waitFor();
    await page.locator('.fin-nav [data-tab="fx"]').click();
    await page.locator('[data-open="fxPlan"]').click();
    await page.locator('#finance-dialog [name="planDate"]').fill("2026-10-25");
    await page.locator('#finance-dialog [name="planKind"]').selectOption("remittance");
    await page.locator('#finance-dialog [name="fromCurrency"]').selectOption("TWD");
    await page.locator('#finance-dialog [name="toCurrency"]').selectOption("VND");
    await page.locator('#finance-dialog [name="sourceAmount"]').fill("10000");
    await page.locator('#finance-dialog [name="expectedRate"]').fill("785");
    await page.locator('#finance-dialog [name="expectedFee"]').fill("100");
    await page.locator("#finance-submit").click();
    await page.locator('.fin-row').filter({hasText:"10.000"}).waitFor();
    assert.equal(plans.length,1,"Plan must be confirmed by API");
    assert.equal(accounts[0].balance,"0","Plan must not silently debit TWD");
    await page.locator('[data-open="fxPost"]').click();
    await page.locator('#finance-dialog [name="accountId"]').selectOption(initialAccounts[0].id);
    await page.locator('#finance-dialog [name="targetAccountId"]').selectOption(initialAccounts[1].id);
    await page.locator('#finance-dialog [name="amount"]').fill("10000");
    await page.locator('#finance-dialog [name="receivedAmount"]').fill("7850000");
    await page.locator("#finance-submit").click();
    await page.waitForFunction(()=>!document.querySelector("#finance-toast").hidden);
    assert.equal(await page.locator("#finance-dialog").evaluate(el=>el.open),true,"Failed server write must leave form open");
    await page.locator("#finance-submit").click();
    await page.waitForFunction(()=>document.querySelector("#finance-submit")?.disabled===false);
    assert.equal(attemptedTransactionKeys.length,2,"Retry must reach API twice");
    assert.equal(attemptedTransactionKeys[0],attemptedTransactionKeys[1],"Retry must reuse the idempotency key, never mint a second posting");
    assert.equal(accounts[0].balance,"0");
    await page.locator("#finance-dialog-close").click();
    // Persisted plan must not create any account movement; cancel survives F5.
    page.on("dialog",async d=>{await d.accept();});
    await page.locator('[data-cancel-plan]').click();
    assert.equal(plans[0].status,"cancelled");
    await page.reload({waitUntil:"domcontentloaded"});
    await page.locator('h1').filter({hasText:"Tổng quan tài chính"}).waitFor();
    await page.locator('.fin-nav [data-tab="fx"]').click();
    assert(await page.getByText("Đã cancelled").count()===1,"Reload preserves canceled FX plan");
    assert.equal(accounts[0].balance,"0");
    await page.locator('.fin-nav [data-tab="goals"]').click();
    await page.locator('[data-open="goal"]').click();
    await page.locator('#finance-dialog [name="name"]').fill("Học phí");
    await page.locator('#finance-dialog [name="currencyCode"]').selectOption("TWD");
    await page.locator('#finance-dialog [name="targetAmount"]').fill("50000");
    await page.locator("#finance-submit").click();
    await page.getByText("Học phí").first().waitFor();
    await page.locator('[data-goal-update]').click();
    await page.locator('#finance-dialog [name="currentAmount"]').fill("15000");
    await page.locator('#finance-dialog [name="status"]').selectOption("active");
    await page.locator("#finance-submit").click();
    await page.getByText("15.000").first().waitFor();
    await page.locator('[data-open="debt"]').click();
    await page.locator('#finance-dialog [name="name"]').fill("Thẻ tín dụng");
    await page.locator('#finance-dialog [name="currencyCode"]').selectOption("VND");
    await page.locator('#finance-dialog [name="principalOriginal"]').fill("12000000");
    await page.locator('#finance-dialog [name="annualInterestPercent"]').fill("5");
    await page.locator("#finance-submit").click();
    await page.getByText("Thẻ tín dụng").first().waitFor();
    await page.reload({waitUntil:"domcontentloaded"});
    await page.locator('.fin-nav [data-tab="goals"]').click();
    assert(await page.getByText("15.000").count()>0,"Saved goal survives F5");
    assert(await page.getByText("Thẻ tín dụng").count()>0,"Saved debt survives F5");
    assert.equal(accounts[0].balance,"0","Debt and goal planning do not move wallet funds");
    // Goal created without allocation is visible as unallocated, not silently counted as spending.
    await page.getByText("Chưa phân bổ quỹ tháng này").first().waitFor();
    await page.locator('[data-goal-fund]').first().click();
    await page.locator('#finance-dialog [name="plannedAmount"]').fill("8000");
    await page.locator('#finance-dialog [name="earmarkedAmount"]').fill("2500");
    await page.locator("#finance-submit").click();
    await page.getByText("Phân bổ tháng: NT$8.000").waitFor();
    assert.equal(accounts[0].balance,"0","Goal allocation must not debit wallet");
    await page.locator('.fin-nav [data-tab="budget"]').click();
    await page.getByText("Quỹ mục tiêu dự kiến").waitFor();
    await page.getByText("Quỹ mục tiêu dự kiến").locator("..").getByText("NT$8.000").waitFor();
    // The allocation button on Planning edits the same row, never creates a second copy.
    await page.locator('[data-goal-fund]').first().click();
    await page.locator('#finance-dialog [name="plannedAmount"]').fill("9000");
    await page.locator('#finance-dialog [name="earmarkedAmount"]').fill("4000");
    await page.locator("#finance-submit").click();
    assert.equal(goalFunds.length,1,"Goal allocation upsert must not double-count one goal/month");
    await page.getByText("Quỹ mục tiêu dự kiến").locator("..").getByText("NT$9.000").waitFor();
    await page.reload({waitUntil:"domcontentloaded"});
    await page.locator('.fin-nav [data-tab="goals"]').click();
    await page.getByText("Phân bổ tháng: NT$9.000").waitFor();
    assert.equal(Number(goals[0].current_amount),15000,"Manual savings progress remains independent of monthly allocation");
    assert.equal(accounts[0].balance,"0","Goal funding never moves wallet balance");

    await page.locator('[data-fund-debt]').click();
    await page.locator('#finance-dialog [name="plannedAmount"]').fill("1500000");
    await page.locator('#finance-dialog [name="earmarkedAmount"]').fill("500000");
    await page.locator('#finance-dialog [name="fxRateToTwd"]').fill("0.0013");
    await page.locator("#finance-submit").click();
    await page.getByText("Đánh dấu đã dành, chưa chuyển ví").waitFor();
    assert.equal(accounts[1].balance,"0","Debt reserve must not alter a wallet");
    // A real wallet balance can only come from an actual posted ledger event.
    // Inject server-owned test fixture balance, then verify posting decrements it.
    accounts[1].balance="2000000";
    await page.reload({waitUntil:"domcontentloaded"});
    await page.locator('.fin-nav [data-tab="goals"]').click();
    await page.locator('[data-pay-debt]').click();
    await page.locator('#finance-dialog [name="accountId"]').selectOption(initialAccounts[1].id);
    await page.locator('#finance-dialog [name="principalPaid"]').fill("1000000");
    await page.locator('#finance-dialog [name="fxRateToTwd"]').fill("0.0013");
    await page.locator("#finance-submit").click();
    await page.getByText("Các khoản trả nợ đã ghi sổ").waitFor();
    assert.equal(accounts[1].balance,"1000000","Posted payment must debit wallet exactly once");
    assert.equal(debts[0].outstanding_amount,"11000000","Posted principal reduces debt");
    await page.locator('.fin-nav [data-tab="budget"]').click();
    await page.locator('[data-open="cashIncome"]').click();
    await page.locator('#finance-dialog [name="label"]').fill("Lương dự kiến");
    await page.locator('#finance-dialog [name="amountTwd"]').fill("60000");
    await page.locator("#finance-submit").click();
    await page.getByText("Lương dự kiến").waitFor();
    await page.locator('[data-open="cashExpense"]').click();
    await page.locator('#finance-dialog [name="label"]').fill("Sinh hoạt");
    await page.locator('#finance-dialog [name="amountTwd"]').fill("10000");
    await page.locator("#finance-submit").click();
    await page.getByText("Sinh hoạt").waitFor();
    await page.locator('[data-edit-cashflow]').first().click();
    await page.locator('#finance-dialog [name="amountTwd"]').fill("12000");
    await page.locator("#finance-submit").click();
    await page.reload({waitUntil:"domcontentloaded"});
    await page.locator('.fin-nav [data-tab="budget"]').click();
    await page.getByText("Lương dự kiến").waitFor();
    assert.equal(cashItems.length,2,"Forecast data persists over refresh");
    assert.equal(Number(cashItems[0].amount_twd),12000,"Edited amount persists after F5");
    // The existing global dialog handler accepts confirmations for this test.
    await page.locator('[data-delete-cashflow]').first().click();
    await page.waitForFunction(()=>document.querySelectorAll("[data-delete-cashflow]").length===1);
    assert.equal(cashItems.length,1,"Deleting a forecast item persists");
    await page.locator('.fin-nav [data-tab="budget"]').click();
    await page.locator('[data-period="year"]').click();
    await page.locator('h2').filter({hasText:"Tổng hợp năm"}).waitFor();
    const size=await page.evaluate(()=>({doc:document.documentElement.scrollWidth,view:innerWidth}));
    if(size.doc>size.view+1){
      const overflowing=await page.evaluate(()=>
        [...document.body.querySelectorAll("*")]
          .filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+1||r.left< -1);})
          .map(el=>({tag:el.tagName,cls:String(el.className).slice(0,120),text:(el.innerText||"").slice(0,65),rect:({left:Math.round(el.getBoundingClientRect().left),right:Math.round(el.getBoundingClientRect().right),width:Math.round(el.getBoundingClientRect().width)})}))
          .slice(0,25)
      );
      const metrics=await page.evaluate(()=>{
        const a=document.activeElement;
        const before={bodyScroll:document.body.scrollWidth,htmlScroll:document.documentElement.scrollWidth,
          bodyClient:document.body.clientWidth,htmlClient:document.documentElement.clientWidth,
          viewport:window.visualViewport?.width,
          active:a?{tag:a.tagName,cls:String(a.className),outline:getComputedStyle(a).outline,
            rect:{left:a.getBoundingClientRect().left,right:a.getBoundingClientRect().right}}:null};
        if(a instanceof HTMLElement)a.blur();
        return {...before,afterBlur:{bodyScroll:document.body.scrollWidth,htmlScroll:document.documentElement.scrollWidth},
          overflowingContent:[...document.querySelectorAll("*")]
            .filter(el=>el.scrollWidth>el.clientWidth+1 && el.clientWidth>0)
            .map(el=>({tag:el.tagName,cls:String(el.className).slice(0,100),client:el.clientWidth,scroll:el.scrollWidth,
             rect:{l:Math.round(el.getBoundingClientRect().left),r:Math.round(el.getBoundingClientRect().right)},
             text:(el.innerText||"").slice(0,42)})).slice(0,30)};

      });
      console.error("FINANCE_LAYOUT_OVERFLOW_OFFENDERS",JSON.stringify({viewport,size,overflowing,metrics}));
    }
    assert(size.doc<=size.view+1,"Finance mobile horizontal overflow "+JSON.stringify({viewport,size}));
    assert.deepEqual(pageErrors,[],"Page JavaScript errors "+JSON.stringify({viewport,pageErrors}));
    await context.close();
  }
  // Permission / login / logout must be interactive on its own Finance origin.
  const authContext=await browser.newContext({viewport:{width:390,height:844}});
  const authPage=await authContext.newPage();
  let hasOwnerSession=false;
  const authErrors=[];
  authPage.on("pageerror",e=>authErrors.push(e.message));
  await authPage.route("**/api/finance/**",async route=>{
    const url=new URL(route.request().url());
    if(!hasOwnerSession)return route.fulfill({status:401,contentType:"application/json",body:JSON.stringify({error:"AUTH_REQUIRED"})});
    const data=url.pathname.endsWith("/bootstrap")
      ? {currencies,accounts:[],categories:[],budgets:[],plans:[],goals:[],debts:[],reportCurrency:"TWD"}
      : {month:url.searchParams.get("month"),flow:[],budget:[],events:[]};
    await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(data)});
  });
  await authPage.route("**/api/auth/login",async route=>{
    const user=route.request().postDataJSON().username;
    if(user==="owner")hasOwnerSession=true;
    await route.fulfill({status:user==="owner"?200:403,contentType:"application/json",body:JSON.stringify(user==="owner"?{ok:true}:{error:"FINANCE_OWNER_REQUIRED"})});
  });
  await authPage.route("**/api/auth/logout",async route=>{
    hasOwnerSession=false;
    await route.fulfill({status:200,contentType:"application/json",body:'{"ok":true}'});
  });
  await authPage.goto(BASE+"/finance.html",{waitUntil:"domcontentloaded"});
  await authPage.locator("#finance-login-form").waitFor({state:"visible"});
  await authPage.locator('#finance-login-form [name="username"]').fill("other");
  await authPage.locator('#finance-login-form [name="password"]').fill("test");
  await authPage.locator('#finance-login-form button[type="submit"]').click();
  await authPage.getByText("Tài khoản này chưa được cấp quyền Finance OS.").waitFor();
  await authPage.locator('#finance-login-form [name="username"]').fill("owner");
  await authPage.locator('#finance-login-form [name="password"]').fill("test");
  await authPage.locator('#finance-login-form button[type="submit"]').click();
  await authPage.locator("h1").filter({hasText:"Tổng quan tài chính"}).waitFor();
  await authPage.reload({waitUntil:"domcontentloaded"});
  await authPage.locator("h1").filter({hasText:"Tổng quan tài chính"}).waitFor();
  await authPage.locator("#finance-logout").click();
  await authPage.locator("#finance-login-form").waitFor({state:"visible"});
  assert.deepEqual(authErrors,[],"Authenticated Finance browser has no uncaught page errors");
  await authContext.close();
  console.log("PASS private finance responsive mobile/desktop navigation, DB-confirmed writes, FX planning and error handling");
}finally{await browser.close();}
