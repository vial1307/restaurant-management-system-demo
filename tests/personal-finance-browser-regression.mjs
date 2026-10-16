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
    page.on("pageerror",error=>pageErrors.push(error.message));
    await page.route("**/api/finance/**",async route=>{
      const url=new URL(route.request().url()),pathname=url.pathname;
      const method=route.request().method();
      let data={},status=200;
      if(method==="GET"&&pathname.endsWith("/bootstrap")){
        data={currencies,accounts,categories:[],budgets:[],plans,reportCurrency:"TWD"};
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
      }else if(method==="POST"&&pathname.endsWith("/transactions")){
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
    assert.equal(accounts[0].balance,"0");
    await page.locator("#finance-dialog-close").click();
    await page.locator('.fin-nav [data-tab="budget"]').click();
    await page.locator('[data-period="year"]').click();
    await page.locator('h2').filter({hasText:"Tổng hợp năm"}).waitFor();
    const size=await page.evaluate(()=>({doc:document.documentElement.scrollWidth,view:innerWidth}));
    assert(size.doc<=size.view+1,"Finance mobile horizontal overflow "+JSON.stringify({viewport,size}));
    assert.deepEqual(pageErrors,[],"Page JavaScript errors "+JSON.stringify({viewport,pageErrors}));
    await context.close();
  }
  console.log("PASS private finance responsive mobile/desktop navigation, DB-confirmed writes, FX planning and error handling");
}finally{await browser.close();}
