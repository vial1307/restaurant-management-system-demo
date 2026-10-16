import {chromium} from "playwright";
import assert from "node:assert/strict";
const origin=process.env.FINANCE_PRODUCTION_URL||"https://finance.82.47.180.185.nip.io/";
const browser=await chromium.launch({headless:true});
let issues=[];
try{
 for (const viewport of [{width:1440,height:900},{width:390,height:844}]){
  const page=await browser.newPage({viewport});
  const network=[];
  const errors=[];
  page.on("console",m=>{if(m.type()==="error")errors.push("CONSOLE "+m.text());});
  page.on("pageerror",e=>errors.push("PAGEERROR "+e.message));
  page.on("requestfailed",r=>errors.push("REQUESTFAILED "+new URL(r.url()).pathname+" "+r.failure()?.errorText));
  page.on("response",response=>network.push(response.status()+" "+new URL(response.url()).pathname+" "+response.headers()["content-type"]));
  const navigation=await page.goto(origin,{waitUntil:"domcontentloaded",timeout:25000});
  await page.waitForTimeout(2500);
  const dom=await page.evaluate(()=>({
   title:document.title, url:location.href,
   visibleText:(document.body?.innerText||"").slice(0,1600),
   htmlBytes:document.documentElement.outerHTML.length,
   loginView:{hidden:document.querySelector("#finance-login")?.hidden,display:document.querySelector("#finance-login")?getComputedStyle(document.querySelector("#finance-login")).display:null},
   layout:{hidden:document.querySelector("#finance-layout")?.hidden,display:document.querySelector("#finance-layout")?getComputedStyle(document.querySelector("#finance-layout")).display:null},
   scriptCount:document.scripts.length,
   css: [...document.styleSheets].map(s=>s.href),
   screenWidth:document.documentElement.scrollWidth
  }));
  const result={viewport,status:navigation.status(),dom,network,errors};
  console.log("FINANCE_BROWSER_DIAGNOSTIC "+JSON.stringify(result));
  const loginVisible=await page.locator("#finance-login-form").isVisible();
  const errorVisible=await page.locator("#finance-content .fin-error").isVisible();
  if(navigation.status()!==200 || !loginVisible || errors.length){
    issues.push({viewport,status:navigation.status(),loginVisible,errorVisible,errors});
  }
  await page.close();
 }
}finally{await browser.close();}
assert.equal(issues.length,0,"Public Finance OS fails to render login page "+JSON.stringify(issues));
console.log("FINANCE_PUBLIC_LOGIN_RENDER_PASS");
