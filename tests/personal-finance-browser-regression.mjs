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
    const attemptedTransactionKeys=[];
    page.on("pageerror",error=>pageErrors.push(error.message));
    await page.route("**/api/finance/**",async route=>{
      const url=new URL(route.request().url()),pathname=url.pathname;
      const method=route.request().method();
      let data={},status=200;
      if(method==="GET"&&pathname.endsWith("/bootstrap")){
        data={currencies,accounts,categories:[],budgets:[],plans,goals,debts,reportCurrency:"TWD"};
      }else if(method==="GET"&&pathname.endsWith("/overview")){
        data={month:url.searchParams.get("month"),flow:[],budget:[],events:[]};
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
    await page.locator('.fin-nav [data-tab="budget"]').click();
    await page.locator('[data-period="year"]').click();
    await page.locator('h2').filter({hasText:"Tổng hợp năm"}).waitFor();
    const size=await page.evaluate(()=>({doc:document.documentElement.scrollWidth,view:innerWidth}));
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
