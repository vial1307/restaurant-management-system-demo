import assert from "node:assert/strict";
import { chromium } from "playwright";
import { ACCOUNT_MODULES } from "../src/account-permissions.js";
import { normalizeSearch } from "../src/search-utils.js";

const BASE = process.env.TEST_WEB_BASE || "http://127.0.0.1:3000";
const PASSWORD = "KitchenTest!123";

async function login(page, username) {
  await page.goto(BASE + "/", { waitUntil:"domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.vpsAuthReady === "true", null, { timeout:10000 });
  assert.equal(await page.locator(".app-shell").count(),0,"unauthenticated sessions must not render the full application behind login");
  await page.locator('#auth-login-form input[name="username"]').fill(username);
  await page.locator('#auth-login-form input[name="password"]').fill(PASSWORD);
  await page.locator('#auth-login-form button[type="submit"]').click();
  await page.waitForFunction(() => {
    try {
      const session = JSON.parse(localStorage.getItem("shitu-kitchen-auth-v1") || "null");
      return Boolean(session?.id);
    } catch {
      return false;
    }
  }, null, { timeout:30000 });
  await page.waitForSelector(".app-shell",{timeout:30000});
  await page.waitForFunction(() => !document.querySelector("#auth-login-form"), null, { timeout:30000 });
}

async function seedRoleSession(page, context, username) {
  await page.goto(BASE + "/", { waitUntil:"domcontentloaded", timeout:30000 });
  await page.waitForFunction(() => document.documentElement.dataset.vpsAuthReady === "true", null, { timeout:15000 });

  const form = page.locator("#auth-login-form");
  if (await form.count()) {
    await form.locator('input[name="username"]').fill(username);
    await form.locator('input[name="password"]').fill(PASSWORD);
    await form.locator('button[type="submit"]').click();
  }

  try {
    await page.locator(".app-shell").waitFor({ state:"visible", timeout:12000 });
    await page.waitForFunction(() => !document.querySelector("#auth-login-form"), null, { timeout:12000 });
  } catch (uiError) {
    const response = await context.request.post(`${BASE}/api/auth/login`, {
      data:{ username, password:PASSWORD },
      failOnStatusCode:false,
    });
    assert.equal(response.status(),200,`${username}: login fallback failed with HTTP ${response.status()}; original=${uiError?.message || uiError}`);
    await page.reload({ waitUntil:"domcontentloaded", timeout:30000 });
    await page.waitForFunction(() => document.documentElement.dataset.vpsAuthReady === "true", null, { timeout:15000 });
    await page.locator(".app-shell").waitFor({ state:"visible", timeout:15000 });
    await page.waitForFunction(() => !document.querySelector("#auth-login-form"), null, { timeout:15000 });
  }
}

function attachRuntimeDiagnostics(page, errors, prefix="") {
  const origin=new URL(BASE).origin;
  const isSameOriginApi=(url)=>{
    try {
      const parsed=new URL(url);
      return parsed.origin===origin && parsed.pathname.startsWith("/api/");
    } catch {
      return false;
    }
  };
  page.on("pageerror",(error)=>errors.push(`${prefix}pageerror: ${error.message}`));
  page.on("requestfailed",(request)=>{
    if(!isSameOriginApi(request.url()))return;
    const parsed=new URL(request.url());
    const errorText=request.failure()?.errorText||"";
    const expectedStreamAbort=parsed.pathname==="/api/inventory/events" && /ERR_ABORTED|NS_BINDING_ABORTED|cancel/i.test(errorText);
    if(expectedStreamAbort)return;
    errors.push(`${prefix}api request failed: ${request.method()} ${request.url()} ${errorText}`);
  });
  page.on("response",(response)=>{
    if(isSameOriginApi(response.url())&&response.status()>=500)errors.push(`${prefix}api ${response.status()}: ${response.request().method()} ${response.url()}`);
  });
}

async function assertNoPageErrors(page, errors, label) {
  await page.waitForTimeout(80);
  assert.deepEqual(errors,[],`${label} page errors: ${errors.join(" | ")}`);
}

async function assertInventorySurfaceFits(page,label){
  const documentOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  assert(documentOverflow<=3,`${label}: document horizontal overflow ${documentOverflow}px`);

  const surfaceSelectors=[
    ".inventory-op-card:visible",
    ".inventory-row:visible",
    ".work-row:visible",
    ".central-kitchen-location-card:visible",
    ".central-kitchen-priority-row:visible",
  ];
  for(const selector of surfaceSelectors){
    const nodes=page.locator(selector);
    const count=Math.min(await nodes.count(),8);
    for(let i=0;i<count;i+=1){
      const overflow=await nodes.nth(i).evaluate((node)=>node.scrollWidth-node.clientWidth);
      if(overflow>2){
        const diagnostics=await nodes.nth(i).evaluate((node)=>{
          const root=node.getBoundingClientRect();
          return [...node.querySelectorAll("*")].map((child)=>{
            const box=child.getBoundingClientRect();
            const style=getComputedStyle(child);
            return {
              tag:child.tagName.toLowerCase(),
              className:String(child.className||"").slice(0,120),
              scrollWidth:child.scrollWidth,
              clientWidth:child.clientWidth,
              left:Math.round(box.left-root.left),
              right:Math.round(box.right-root.left),
              width:Math.round(box.width),
              overflowX:style.overflowX,
              whiteSpace:style.whiteSpace,
              display:style.display,
            };
          }).filter((entry)=>
            entry.scrollWidth>entry.clientWidth+2 || entry.left< -2 || entry.right>root.width+2
          ).slice(0,16);
        });
        assert.fail(`${label}: ${selector}[${i}] horizontal overflow ${overflow}px; children=${JSON.stringify(diagnostics)}`);
      }
    }
  }

  const controls=page.locator([
    ".branch-ops-tabs button:visible",
    ".inventory-view-switch button:visible",
    ".storage-tab-groups .filter-tab:visible",
    ".zone-tabs.work-area-tabs .filter-tab:visible",
    ".inventory-op-card button:visible",
    ".inventory-table button:visible",
    ".central-kitchen-shell button:visible",
  ].join(","));
  const controlCount=Math.min(await controls.count(),32);
  for(let i=0;i<controlCount;i+=1){
    const control=controls.nth(i);
    const overflow=await control.evaluate((node)=>node.scrollWidth-node.clientWidth);
    if(overflow>2){
      const diagnostics=await control.evaluate((node)=>({
        className:String(node.className||"").slice(0,140),
        text:String(node.textContent||"").trim().replace(/\\s+/g," ").slice(0,180),
        scrollWidth:node.scrollWidth,
        clientWidth:node.clientWidth,
        whiteSpace:getComputedStyle(node).whiteSpace,
        display:getComputedStyle(node).display,
      }));
      assert.fail(`${label}: visible Inventory button[${i}] text overflow ${overflow}px; control=${JSON.stringify(diagnostics)}`);
    }
  }
}

async function selectToday(page) {
  const calendarToggle = page.locator('[data-action="toggle-calendar"]').first();
  if (!await calendarToggle.count()) return;
  await calendarToggle.click();
  const today = page.locator('[data-action="calendar-shortcut"][data-shortcut="today"]').first();
  if (await today.count()) await today.click();
}

async function setSite(page, site) {
  const currentRoute = await page.evaluate(() => location.hash.replace(/^#\/?/, "").split("?")[0] || "dashboard");
  if (currentRoute !== "inventory") {
    const inventoryNav = page.locator('.desktop-nav .nav-item[href="#inventory"]:visible, .mobile-nav .nav-item[href="#inventory"]:visible').first();
    await inventoryNav.waitFor({ state:"visible", timeout:10000 });
    await inventoryNav.click();
  }
  await page.waitForFunction(() => location.hash.replace(/^#\/?/, "").split("?")[0] === "inventory");
  await page.locator(".inventory-sql-status,.inventory-cloud-notice,[data-central-kitchen-shell]").first().waitFor({ state:"visible", timeout:10000 });

  const activeSite = await page.evaluate(() => {
    try {
      const user = JSON.parse(localStorage.getItem("shitu-kitchen-auth-v1") || "null");
      if (["central", "fuxing", "yongji"].includes(user?.location)) return user.location;
      return localStorage.getItem("shitu-admin-active-site-v1") || "fuxing";
    } catch {
      return "fuxing";
    }
  });
  if (activeSite !== site) {
    const siteButton = page.locator(`[data-warehouse="${site}"]`).first();
    await siteButton.waitFor({ state:"visible", timeout:10000 });
    await siteButton.click();
    await page.waitForFunction((expected) => localStorage.getItem("shitu-admin-active-site-v1") === expected, site);
  }

  await selectToday(page);

  await page.waitForFunction(() => localStorage.getItem("shitu-inventory-cloud-v2") === "ready", null, {timeout:10000});
  try {
    await page.waitForFunction(() => document.querySelectorAll(".inventory-row,.central-row,.central-manage-row").length > 0,{timeout:10000});
  } catch (error) {
    const diagnostics = await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem("shitu-kitchen-os-v1") || "null");
      const selected = state?.selectedDate;
      const record = state?.records?.[selected];
      return {
        href:location.href,
        selectedDate:selected,
        browserToday:new Date().toISOString().slice(0,10),
        activeSite:localStorage.getItem("shitu-admin-active-site-v1"),
        cloud:localStorage.getItem("shitu-inventory-cloud-v2"),
        inventory:Number(record?.inventory?.length || 0),
        workInventory:Number(record?.workInventory?.length || 0),
        pageText:document.querySelector(".page-content")?.innerText?.slice(0,300) || "",
      };
    });
    throw new Error(`inventory rows did not render: ${JSON.stringify(diagnostics)}`, { cause:error });
  }
}

async function stableEvaluate(page, fn, arg) {
  let lastError = null;
  for (let attempt=0;attempt<3;attempt+=1) {
    try {
      return await page.evaluate(fn,arg);
    } catch (error) {
      lastError = error;
      const message = String(error?.message || "");
      if (!/Execution context was destroyed|most likely because of a navigation|Target page, context or browser has been closed/i.test(message)) throw error;
      await page.waitForLoadState("domcontentloaded",{timeout:10000}).catch(()=>{});
      await page.waitForTimeout(100);
    }
  }
  throw lastError;
}

async function assertRoutePermissions(page, username) {
  await page.waitForLoadState("domcontentloaded",{timeout:10000}).catch(()=>{});
  await page.waitForFunction(() => Boolean(localStorage.getItem("shitu-kitchen-auth-v1")),null,{timeout:10000});
  const session = await stableEvaluate(page,()=>JSON.parse(localStorage.getItem("shitu-kitchen-auth-v1")||"null"));
  assert(session?.permissions,`${username} session permissions missing`);
  for (const route of ACCOUNT_MODULES) {
    await page.goto(BASE + "/#" + route,{waitUntil:"domcontentloaded"});
    await page.waitForSelector(".page-content");
    if (session.permissions[route]?.view) {
      await page.waitForFunction((expected)=>location.hash.replace(/^#/,"").split("?")[0]===expected,route);
      assert.equal(await page.locator(".access-empty-state").count(),0,`${username} blocked from allowed route ${route}`);
    } else {
      await page.waitForFunction((blocked)=>location.hash.replace(/^#/,"").split("?")[0]!==blocked,route);
      const redirected = await stableEvaluate(page,()=>location.hash.replace(/^#/,"").split("?")[0]);
      assert.equal(session.permissions[redirected]?.view,true,`${username} redirected from ${route} to forbidden ${redirected}`);
    }
  }
}

async function inventorySearchRoundTrip(page) {
  const input = page.locator('[data-field="inventorySearch"]');
  await input.waitFor({state:"visible"});
  const rows = page.locator(".inventory-row");
  const visibleRows = page.locator(".inventory-row:visible");
  const before = await visibleRows.count();
  assert(before > 1,"inventory search fixture needs multiple visible rows");

  await input.fill("niu rou");
  assert.equal(await input.inputValue(),"niu rou");
  await page.waitForFunction(
    (beforeCount)=>document.querySelectorAll(".inventory-row:not([data-search-hidden])").length < beforeCount,
    before
  );
  const filtered = await visibleRows.count();
  assert(filtered > 0 && filtered < before,"inventory search must hide non-matching rows");
  assert((await page.locator(".inventory-row[data-search-hidden]").count()) > 0,"inventory search did not mark hidden rows");

  const meta = page.locator("[data-inventory-search-meta]");
  await meta.waitFor({state:"visible"});
  assert.match(await meta.innerText(),new RegExp(`^${filtered} / ${before} `),"inventory search result counter is stale");

  await input.fill("n r");
  await page.waitForFunction(
    (beforeCount)=>{
      const visible=document.querySelectorAll(".inventory-row:not([data-search-hidden])").length;
      return visible>0 && visible<beforeCount;
    },
    before
  );
  assert((await visibleRows.count()) > 0,"Inventory spaced-initial search must return matching rows");

  await input.fill("__inventory_no_match__");
  await page.waitForFunction(()=>document.querySelectorAll(".inventory-row:not([data-search-hidden])").length===0);
  assert.equal(await visibleRows.count(),0,"no-result inventory search must hide every row");
  assert.equal(await page.locator("[data-inventory-search-empty]:visible").count(),1,"no-result state must be visible");

  const clear = page.locator('[data-action="clear-inventory-search"]');
  await clear.waitFor({state:"visible"});
  await clear.click();
  await page.waitForFunction((beforeCount)=>document.querySelectorAll(".inventory-row:not([data-search-hidden])").length===beforeCount,before);
  assert.equal(await input.inputValue(),"");
  assert.equal(await visibleRows.count(),before,"clearing inventory search did not restore all rows");
  assert.equal(await page.locator("[data-inventory-search-empty]:visible").count(),0,"empty state must clear after search reset");
  assert.equal(await rows.count(),before,"search must not remove inventory rows from the DOM");
}

async function adminDesktop(browser) {
  const context = await browser.newContext({ viewport:{width:1440,height:900} });
  const page = await context.newPage();
  const errors=[];
  attachRuntimeDiagnostics(page,errors);
  await login(page,"yangchuadmin");

  const session = await page.evaluate(()=>JSON.parse(localStorage.getItem("shitu-kitchen-auth-v1")||"null"));
  assert.equal(session.accountRole,"admin");
  assert.equal(session.location,"all");
  for(const key of ACCOUNT_MODULES){
    assert.equal(session.permissions[key]?.view,true,`admin missing view ${key}`);
    assert.equal(session.permissions[key]?.edit,true,`admin missing edit ${key}`);
  }

  for(const route of ACCOUNT_MODULES){
    await page.goto(BASE + "/#" + route,{waitUntil:"domcontentloaded"});
    await page.waitForSelector(".page-content");
    assert.equal(await page.locator(".access-empty-state").count(),0,`admin blocked from ${route}`);
  }

  await page.goto(BASE + "/#dashboard",{waitUntil:"domcontentloaded"});
  const initialDate=await page.locator('[data-action="toggle-calendar"] strong').innerText();
  await page.locator('[data-action="shift-date"][data-offset="1"]').click();
  assert.notEqual(await page.locator('[data-action="toggle-calendar"] strong').innerText(),initialDate,"next-day control did not change the service date");
  await page.locator('[data-action="shift-date"][data-offset="-1"]').click();
  assert.equal(await page.locator('[data-action="toggle-calendar"] strong').innerText(),initialDate,"previous-day control did not restore the service date");
  await page.locator('[data-action="set-language"][data-language="zh"]').first().click();
  await page.waitForFunction(()=>document.documentElement.lang==="zh-Hant");
  await page.locator('[data-action="set-language"][data-language="vi"]').first().click();
  await page.waitForFunction(()=>document.documentElement.lang==="vi");

  await setSite(page,"fuxing");
  await inventorySearchRoundTrip(page);
  await assertInventorySurfaceFits(page,"fuxing desktop overview");

  const overviewSearch=page.locator('[data-field="inventorySearch"]');
  await overviewSearch.fill("niu rou");
  const receiveTab=page.locator('.branch-ops-tabs > [data-action="select-inventory-ops"][data-mode="in"]').first();
  await receiveTab.click();
  const carriedSearch=page.locator("[data-op-search]");
  await carriedSearch.waitFor({state:"visible"});
  assert.equal(await carriedSearch.inputValue(),"niu rou","Inventory search must carry from Overview into operation tabs");
  await page.locator("[data-op-search-clear]").click();
  const overviewTab=page.locator('.branch-ops-tabs > [data-action="select-inventory-ops"][data-mode="overview"]').first();
  await overviewTab.click();
  await page.locator('[data-field="inventorySearch"]').waitFor({state:"visible"});
  assert.equal(await page.locator('[data-field="inventorySearch"]').inputValue(),"","clearing operation search must clear shared Inventory search state");

  for(const mode of ["overview","alerts","in","pick","transfer","ship","manage","history"]){
    const button=page.locator(`.branch-ops-tabs > [data-action="select-inventory-ops"][data-mode="${mode}"]`).first();
    await button.waitFor({state:"visible"});
    await button.click();
    if(mode==="alerts"){
      await page.locator(".inventory-alert-center").waitFor({state:"visible"});
      assert.equal(await page.locator('[data-action="select-inventory-alert-filter"]').count(),4,"Inventory alert severity filters missing");
      await assertInventorySurfaceFits(page,"fuxing desktop alerts");
    }
    if(["in","pick","transfer","ship"].includes(mode)){
      const search=page.locator("[data-op-search]");
      await search.waitFor({state:"visible"});
      const beforeSearch=await page.locator("[data-op-item]:visible").count();
      assert(beforeSearch>1,`${mode} operation search fixture needs multiple cards`);

      const indexedCards=await page.locator("[data-op-item]").evaluateAll((cards)=>cards.map((card)=>({
        key:card.dataset.opItemKey||"",
        corpus:card.dataset.opSearchCorpus||"",
        zh:card.querySelector(".op-item-head strong")?.textContent?.trim()||"",
        vi:card.querySelector(".op-item-head small")?.textContent?.trim()||"",
      })));
      assert.equal(indexedCards.length,beforeSearch,`${mode} operation search index must cover every rendered card`);
      for(const card of indexedCards){
        assert(card.zh,`${mode} operation card missing Chinese product identity`);
        assert(
          normalizeSearch(card.corpus).includes(normalizeSearch(card.zh)),
          `${mode} search corpus missing Chinese identity for ${card.key||card.zh}`
        );
        if(card.vi){
          assert(
            normalizeSearch(card.corpus).includes(normalizeSearch(card.vi)),
            `${mode} search corpus missing Vietnamese identity for ${card.key||card.zh}`
          );
        }
      }

      const identitySamples=[indexedCards[0],indexedCards.at(-1)].filter(Boolean);
      for(const sample of identitySamples){
        await search.fill(sample.zh);
        await page.waitForFunction(({key,query})=>{
          const host=[...document.querySelectorAll(".inventory-operations-host")]
            .find((node)=>node.getClientRects().length>0);
          const input=host?.querySelector("[data-op-search]");
          const card=host?.querySelector(`[data-op-item-key="${CSS.escape(key)}"]`);
          return Boolean(host&&input?.value===query&&card&&card.getClientRects().length>0&&!card.hasAttribute("data-op-search-hidden"));
        },{key:sample.key,query:sample.zh});
      }

      await search.fill("niu rou");
      const filteredHandle=await page.waitForFunction(({before,query})=>{
        const host=[...document.querySelectorAll(".inventory-operations-host")]
          .find((node)=>node.getClientRects().length>0);
        const input=host?.querySelector("[data-op-search]");
        const cards=host ? [...host.querySelectorAll("[data-op-item]")] : [];
        const hidden=cards.filter((card)=>card.hasAttribute("data-op-search-hidden"));
        const visible=cards.filter((card)=>card.getClientRects().length>0);
        const count=host?.querySelector(".op-count");
        if(!host||input?.value!==query||cards.length!==before)return false;
        if(!(visible.length>0&&visible.length<before&&hidden.length>0))return false;
        const expected=`${visible.length} / ${before}`;
        if(count?.textContent?.trim()!==expected)return false;
        return {total:cards.length,visible:visible.length,hidden:hidden.length,count:expected};
      },{before:beforeSearch,query:"niu rou"});
      const filteredState=await filteredHandle.jsonValue();
      assert(filteredState,`${mode} search state did not stabilize`);
      assert(filteredState.visible>0&&filteredState.visible<beforeSearch,`${mode} search must hide non-matching operation cards`);
      assert(filteredState.hidden>0,`${mode} search missing explicit hidden-card state`);
      assert.equal(filteredState.count,`${filteredState.visible} / ${beforeSearch}`,`${mode} search counter is stale`);

      await search.fill("__inventory_operation_no_match__");
      const emptyHandle=await page.waitForFunction(({before,query})=>{
        const host=[...document.querySelectorAll(".inventory-operations-host")]
          .find((node)=>node.getClientRects().length>0);
        const input=host?.querySelector("[data-op-search]");
        const cards=host ? [...host.querySelectorAll("[data-op-item]")] : [];
        const hidden=cards.filter((card)=>card.hasAttribute("data-op-search-hidden"));
        const visible=cards.filter((card)=>card.getClientRects().length>0);
        const empty=host?.querySelector("[data-op-search-empty]");
        if(!host||input?.value!==query||cards.length!==before)return false;
        if(visible.length!==0||hidden.length!==before||!empty?.getClientRects().length)return false;
        return {total:cards.length,hidden:hidden.length,visible:visible.length};
      },{before:beforeSearch,query:"__inventory_operation_no_match__"});
      const emptyState=await emptyHandle.jsonValue();
      assert.equal(emptyState.visible,0,`${mode} no-result search must hide every operation card`);
      assert.equal(emptyState.hidden,beforeSearch,`${mode} no-result search must explicitly hide every card`);

      const clearSearch=page.locator("[data-op-search-clear]");
      await clearSearch.waitFor({state:"visible"});
      await clearSearch.click();
      const restoredHandle=await page.waitForFunction((before)=>{
        const host=[...document.querySelectorAll(".inventory-operations-host")]
          .find((node)=>node.getClientRects().length>0);
        const input=host?.querySelector("[data-op-search]");
        const cards=host ? [...host.querySelectorAll("[data-op-item]")] : [];
        const hidden=cards.filter((card)=>card.hasAttribute("data-op-search-hidden"));
        const visible=cards.filter((card)=>card.getClientRects().length>0);
        const empty=host?.querySelector("[data-op-search-empty]");
        if(!host||input?.value!==""||cards.length!==before)return false;
        if(visible.length!==before||hidden.length!==0||empty?.getClientRects().length)return false;
        return {total:cards.length,visible:visible.length,hidden:hidden.length};
      },beforeSearch);
      const restoredState=await restoredHandle.jsonValue();
      assert.equal(restoredState.visible,beforeSearch,`${mode} clear-search did not restore all cards`);
      assert.equal(restoredState.total,beforeSearch,`${mode} search must not remove cards from DOM`);

      const desktopViewport=page.viewportSize();
      if(desktopViewport?.width>900){
        const geometryHandle=await page.waitForFunction(()=>{
          const list=document.querySelector(".inventory-operations-host .inventory-ops-list");
          const card=[...document.querySelectorAll(".inventory-operations-host .inventory-op-card")]
            .find((node)=>node.getClientRects().length>0);
          if(!list||!card||!list.getClientRects().length||!card.getClientRects().length)return false;
          const controls=card.querySelector(".op-select-grid");
          const action=card.querySelector(".op-action-row");
          if(!controls||!action||!controls.getClientRects().length||!action.getClientRects().length)return false;
          const listBox=list.getBoundingClientRect();
          const cardBox=card.getBoundingClientRect();
          const controlsBox=controls.getBoundingClientRect();
          const actionBox=action.getBoundingClientRect();
          return {
            listWidth:listBox.width,
            cardWidth:cardBox.width,
            cardOverflow:card.scrollWidth>card.clientWidth+1,
            controlsRight:controlsBox.x+controlsBox.width,
            actionLeft:actionBox.x,
          };
        });
        const geometry=await geometryHandle.jsonValue();
        assert(
          geometry&&Math.abs(geometry.cardWidth-geometry.listWidth)<=2,
          `${mode} desktop operation card must span the full operation grid (card=${geometry?.cardWidth ?? "missing"}, list=${geometry?.listWidth ?? "missing"})`
        );
        assert.equal(geometry.cardOverflow,false,`${mode} desktop operation card has horizontal overflow`);
        assert(
          geometry.controlsRight<=geometry.actionLeft+2,
          `${mode} controls and action column overlap (controlsRight=${geometry.controlsRight}, actionLeft=${geometry.actionLeft})`
        );

        if(mode==="pick"&&desktopViewport.width>=1200){
          const denseCount=await page.locator(".inventory-op-card:has(.pick-followup):visible").count();
          if(denseCount){
            const followupHandle=await page.waitForFunction(()=>{
              const card=[...document.querySelectorAll(".inventory-operations-host .inventory-op-card")]
                .find((node)=>node.getClientRects().length>0&&node.querySelector(".pick-followup"));
              const followup=card?.querySelector(".pick-followup");
              const status=followup?.querySelector(".pick-status");
              const use=followup?.querySelector(".pick-use-row");
              const ret=followup?.querySelector(".pick-return-row");
              if(!followup||!status||!use||!ret)return false;
              if(!followup.getClientRects().length||!status.getClientRects().length||!use.getClientRects().length||!ret.getClientRects().length)return false;
              const statusBox=status.getBoundingClientRect();
              const useBox=use.getBoundingClientRect();
              const returnBox=ret.getBoundingClientRect();
              return {
                statusRight:statusBox.x+statusBox.width,
                useLeft:useBox.x,
                useRight:useBox.x+useBox.width,
                returnLeft:returnBox.x,
                overflow:followup.scrollWidth>followup.clientWidth+1,
              };
            });
            const followupGeometry=await followupHandle.jsonValue();
            assert(followupGeometry,"pick Desktop compact-row geometry missing");
            assert(followupGeometry.statusRight<=followupGeometry.useLeft+1,"pick Desktop status must remain left of Use controls");
            assert(followupGeometry.useRight<=followupGeometry.returnLeft+1,"pick Desktop Use controls must remain left of Return controls");
            assert.equal(followupGeometry.overflow,false,"pick Desktop compact row has horizontal overflow");
          }
        }
      }
      await assertInventorySurfaceFits(page,`fuxing desktop ${mode}`);
    }
    if(mode==="overview"){
      await page.locator(".inventory-product-table").waitFor({state:"visible"});
      await assertInventorySurfaceFits(page,"fuxing desktop overview revisit");
    }
    if(mode==="manage"){
      await page.locator(".storage-table").waitFor({state:"visible"});
      await inventorySearchRoundTrip(page);
      await assertInventorySurfaceFits(page,"fuxing desktop manage");
    }
    if(mode==="history"){
      await page.locator(".branch-history-card").waitFor({state:"visible"});
      await assertInventorySurfaceFits(page,"fuxing desktop history");
    }
  }

  await page.locator('.branch-ops-tabs > [data-action="select-inventory-ops"][data-mode="manage"]').first().click();
  assert((await page.locator('[data-manage-adjust="true"]').count()) > 0,"branch management quantity controls missing");
  const add=page.locator('[data-action="open-add-item"]').first();
  await add.waitFor({state:"visible"});
  await add.click();
  await page.locator('form[data-form="add-item"]').waitFor({state:"visible"});
  const saveProduct=page.locator('.modal-header-save[data-save-item]');
  await saveProduct.waitFor({state:"visible"});
  assert.match(await saveProduct.innerText(),/Lưu sản phẩm/);
  assert.equal(await page.locator('select[name="receiveZone"]').isDisabled(),false,"admin receiving default unexpectedly disabled");
  const saveBox=await saveProduct.boundingBox();
  const viewport=page.viewportSize();
  assert(saveBox && viewport && saveBox.y >= 0 && saveBox.y + saveBox.height <= viewport.height,"product save button is outside the visible viewport");
  await page.locator('button[data-action="close-modal"]').first().click();
  await page.locator(".modal-backdrop").waitFor({state:"detached"});

  await page.goto(BASE + "/#settings",{waitUntil:"domcontentloaded"});
  await page.locator("[data-account-add]").waitFor({state:"visible"});
  assert.match(await page.locator(".account-storage-note").innerText(),/VPS PostgreSQL/,"VPS account storage notice is stale");
  await page.locator("[data-account-edit]").first().click();
  const accountModal=page.locator(".account-modal");
  await accountModal.waitFor({state:"visible"});
  assert.equal(await accountModal.locator('input[name="password"]').getAttribute("minlength"),"10");
  assert.equal(await accountModal.locator('input[name="perm:dashboard:view"]').count(),1,"dashboard view permission missing from account editor");
  assert.equal(await accountModal.locator('input[name="perm:dashboard:edit"]').count(),1,"dashboard edit permission missing from account editor");
  assert.equal(await accountModal.locator('.permission-row').first().getAttribute('data-permission-module'),'dashboard',"dashboard must be the first permission row");
  await accountModal.locator('select[name="role"]').selectOption("central");
  assert.equal(await accountModal.locator('select[name="location"]').inputValue(),"central","central role did not select central kitchen");
  await accountModal.locator('select[name="role"]').selectOption("manager");
  assert.equal(await accountModal.locator('select[name="location"]').inputValue(),"central","manager Role should permit Central workplace");
  const assignedSites=await accountModal.locator('select[name="location"] option').evaluateAll((nodes)=>nodes.map((node)=>node.value));
  for(const site of ["central","fuxing","yongji"])assert(assignedSites.includes(site),`main website missing ${site} for manager Role`);
  assert.equal(assignedSites.includes("all"),false,"assigned Role must not offer global scope");
  await accountModal.locator("[data-account-close]").first().click();
  await accountModal.waitFor({state:"detached"});

  await setSite(page,"central");
  const centralSearch=page.locator('input[data-central-search]').first();
  await centralSearch.waitFor({state:"visible"});
  const centralRows=page.locator(".central-row");
  const centralBefore=await centralRows.count();
  assert(centralBefore > 1,"central inventory should have multiple rows");
  await centralSearch.evaluate((input)=>{
    input.value="niu rou";
    input.dispatchEvent(new InputEvent("input",{
      bubbles:true,
      composed:true,
      data:"niu rou",
      inputType:"insertCompositionText",
      isComposing:true,
    }));
  });
  assert.equal(await centralSearch.inputValue(),"niu rou");
  await page.waitForTimeout(50);
  const centralFiltered=await page.locator(".central-row:visible").count();
  assert(centralFiltered > 0 && centralFiltered < centralBefore,"central search did not filter during IME composition");
  for(let i=0;i<centralFiltered;i++){
    assert.match(await page.locator(".central-row:visible").nth(i).innerText(),/牛肉|Thịt bò/);
  }
  await centralSearch.fill("");
  await page.waitForTimeout(50);
  assert.equal(await page.locator(".central-row:visible").count(),centralBefore,"clearing central search did not restore all rows");
  const zoneTabs=page.locator('[data-central-zone]:not([data-central-zone="all"])');
  const zoneKey=await zoneTabs.evaluateAll((nodes)=>{
    const match=nodes.find((node)=>Number(node.querySelector("span")?.textContent||0)>0);
    return match?.dataset.centralZone||"";
  });
  assert(zoneKey,"central inventory fixture has no database storage location with stock");
  await page.locator(`[data-central-zone="${zoneKey}"]`).first().click();
  const zonedRows=page.locator(".central-row:visible");
  assert((await zonedRows.count()) > 0,"central zone filter returned no rows");
  assert.equal(await page.locator(".inventory-group:visible").count(),1,"central zone filter must isolate one database storage group");
  assert((await page.locator(".inventory-group:visible .inventory-group-heading strong").innerText()).trim().length>0,"central filtered storage label missing");
  await page.locator('[data-central-zone="all"]').first().click();
  assert.equal(await page.locator(".central-row:visible").count(),centralBefore,"central all-zone filter did not restore rows");

  const navigationCount=await page.evaluate(()=>performance.getEntriesByType("navigation").length);
  await page.locator('[data-warehouse="fuxing"]').click();
  await page.locator('[data-field="inventorySearch"]').waitFor({state:"visible"});
  assert.equal(await page.locator("[data-central-kitchen-shell]").count(),0,"central page remained mounted after switching warehouse");
  assert.equal(await page.evaluate(()=>performance.getEntriesByType("navigation").length),navigationCount,"switching warehouses reloaded the whole application");
  await page.locator('[data-warehouse="central"]').click();
  await page.locator("[data-central-kitchen-shell]").waitFor({state:"visible"});
  assert.equal(await page.evaluate(()=>performance.getEntriesByType("navigation").length),navigationCount,"returning to central warehouse reloaded the whole application");

  await assertNoPageErrors(page,errors,"admin desktop");
  await context.clearCookies();
  await page.reload({waitUntil:"domcontentloaded"});
  await page.locator("#auth-login-form").waitFor({state:"visible"});
  assert.equal(await page.locator(".app-shell").count(),0,"expired sessions must not keep the heavy application mounted");
  assert.equal(await page.getByText("AUTH_REQUIRED",{exact:true}).count(),0,"expired VPS session leaked a database error");
  await context.close();
}

async function roleDesktop(browser, username, checks) {
  const context=await browser.newContext({viewport:{width:1280,height:800}});
  const page=await context.newPage();
  const errors=[];
  attachRuntimeDiagnostics(page,errors);
  await seedRoleSession(page,context,username);
  await assertRoutePermissions(page,username);
  if(checks.dashboardEdit !== undefined){
    await page.goto(BASE + "/#dashboard",{waitUntil:"domcontentloaded"});
    await page.waitForSelector(".dashboard-grid");
    const actions=page.locator("[data-dashboard-edit-action]");
    if(checks.dashboardEdit){
      assert((await actions.count()) > 0,`${username} missing dashboard edit actions`);
    }else{
      assert.equal(await actions.count(),0,`${username} can access dashboard edit actions without permission`);
      const taskControls=page.locator('.task-overview input[data-field="task"]');
      for(let i=0;i<await taskControls.count();i++) assert.equal(await taskControls.nth(i).isDisabled(),true,`${username} can update a task from read-only dashboard`);
    }
  }
  if(checks.central){
    await page.goto(BASE + "/#inventory",{waitUntil:"domcontentloaded"});
    await page.locator("[data-central-kitchen-shell]").waitFor({state:"visible"});
    await selectToday(page);
    await page.waitForFunction(() => localStorage.getItem("shitu-inventory-cloud-v2") === "ready", null, {timeout:10000});
    await page.locator('[data-central-mode="in"]').waitFor({state:"visible"});

    // Central inventory is live and must not be hidden when the shared service
    // date is moved to a historical day. This caught the production regression
    // where all four operational tabs disappeared from the central warehouse.
    await page.locator('[data-action="shift-date"][data-offset="-1"]').click();
    await page.locator("[data-central-kitchen-shell]").waitFor({state:"visible"});
    for(const mode of ["in","pick","transfer","ship"]){
      await page.locator(`[data-central-mode="${mode}"]`).waitFor({state:"visible"});
    }
    assert.equal(await page.locator(".inventory-readonly-notice").filter({hasText:/Ảnh chụp tồn kho|歷史庫存快照/}).count(),0,"central inventory was incorrectly date-locked");
    await selectToday(page);
    await page.locator('[data-central-mode="in"]').waitFor({state:"visible"});

    assert.equal(await page.locator(".central-kitchen-kpis").count(),1,"central inventory KPI summary missing");
    assert.equal(await page.locator(".central-kitchen-kpis > article").count(),4,"central inventory KPI summary must expose four database-driven indicators");
    assert.equal(await page.locator("[data-central-priority]").count(),1,"central operator priority panel missing");
    const priorityZone = page.locator("[data-central-priority-zone]").first();
    if (await priorityZone.count()) {
      const zone = await priorityZone.getAttribute("data-central-priority-zone");
      await priorityZone.click();
      assert.equal(await page.locator('[data-central-view="storage"].selected').count(),1,"priority drill-down must return to storage view");
      assert.equal(await page.locator(`[data-central-zone="${zone}"].selected`).count(),1,"priority drill-down must select its database storage location");
    }
    const priorityReceive = page.locator("[data-central-priority-receive]").first();
    if (await priorityReceive.count()) {
      const itemKey = await priorityReceive.getAttribute("data-item-key");
      const locationCode = await priorityReceive.getAttribute("data-location-code");
      await priorityReceive.click();
      await page.locator('[data-central-mode="in"].active').waitFor({state:"visible"});
      const focusedCard = page.locator(`[data-op-item-key="${itemKey}"]`);
      await focusedCard.waitFor({state:"visible"});
      assert.equal(await page.locator("[data-op-item]:visible").count(),1,"priority receive shortcut must focus the exact database item");
      assert.equal(await focusedCard.locator('[data-op-destination] option:checked').getAttribute("data-code"),locationCode,"priority receive shortcut must preselect the shortage storage location");
      await page.locator("[data-op-search]").fill("");
    }
    assert.equal(await page.locator(".branch-ops-tabs").count(),1,"central operation navigation must preserve shared operation-tab behavior");
    assert.equal(await page.locator(".inventory-view-switch").count(),1,"central overview view switch missing");
    assert((await page.locator(".inventory-table.storage-table .central-row").count()) > 0,"central storage overview cards missing");
    await page.locator('[data-central-mode="overview"]').click();
    await page.locator('[data-central-view="storage"]').waitFor({state:"visible"});
    const quickPick = page.locator("[data-central-storage-pick]").first();
    if (await quickPick.count()) {
      const itemKey = await quickPick.getAttribute("data-item-key");
      const sourceLocationCode = await quickPick.getAttribute("data-source-location-code");
      await quickPick.click();
      await page.locator('[data-central-mode="pick"].active').waitFor({state:"visible"});
      const focusedPickCard = page.locator(`[data-op-item-key="${itemKey}"]`);
      await focusedPickCard.waitFor({state:"visible"});
      assert.equal(await page.locator("[data-op-item]:visible").count(),1,"storage pick shortcut must focus the exact database item");
      assert.equal(await focusedPickCard.locator('[data-op-source] option:checked').getAttribute("data-code"),sourceLocationCode,"storage pick shortcut must preselect the exact source location");
      await page.locator("[data-op-search]").fill("");
      await page.locator('[data-central-mode="overview"]').click();
      await page.locator('[data-central-view="storage"]').waitFor({state:"visible"});
    }
    if(checks.manage === true){
      assert((await page.locator("select[data-central-inline-work-area]").count()) > 0,"central overview work-area editors missing");
      assert((await page.locator("select[data-central-inline-zone]").count()) > 0,"central overview storage editors missing");
    }
    await page.locator('[data-central-view="work"]').click();
    assert((await page.locator(".inventory-table.work-table .central-row").count()) > 0,"central work overview cards missing");
    await page.locator('[data-central-view="storage"]').click();
    assert.equal(await page.locator(".warehouse-switch").count(),0);
    for(const mode of ["in","pick","transfer","ship"]){
      const tab=page.locator(`[data-central-mode="${mode}"]`);
      await tab.waitFor({state:"visible"});
      await tab.click();
      const search=page.locator("[data-op-search]");
      await search.waitFor({state:"visible"});
      await search.fill("niu rou");
      assert.equal(await search.inputValue(),"niu rou");
      await search.fill("");
    }
    if(checks.manage === true){
      const manage=page.locator('[data-central-mode="manage"]');
      await manage.waitFor({state:"visible"});
      await manage.click();
      await page.locator('[data-central-editor-open="new"]').waitFor({state:"visible"});
      const centralManageQuantityControls=await page.locator('[data-central-manage-adjust="true"]').count();
      if(checks.stocktake === true){
        assert(centralManageQuantityControls > 0,"central stocktake quantity controls missing");
      }
      if(checks.stocktake === false){
        assert.equal(centralManageQuantityControls,0,"central role must not receive direct stocktake quantity controls");
      }
      await page.locator('[data-central-editor-open="new"]').click();
      const centralSave=page.locator('.modal-header-save[data-central-save-item]');
      await centralSave.waitFor({state:"visible"});
      assert.match(await centralSave.innerText(),/Lưu sản phẩm|儲存品項/,"central product save action missing");
      const centralQuantityField=page.locator('input[name^="central-quantity:"]').first();
      const centralMinimumField=page.locator('input[name^="central-minimum:"]').first();
      if(checks.stocktake === false){
        assert.equal(await centralQuantityField.getAttribute("readonly"),"","central role quantity field must be read-only");
        assert.equal(await centralMinimumField.getAttribute("readonly"),"","central role minimum field must be read-only");
      }
      if(checks.stocktake === true){
        assert.equal(await centralQuantityField.getAttribute("readonly"),null,"central stocktake quantity field unexpectedly read-only");
        assert.equal(await centralMinimumField.getAttribute("readonly"),null,"central stocktake minimum field unexpectedly read-only");
      }
      await page.locator('button[data-central-editor-close]').click();
    }
  } else {
    const site = await page.evaluate(() => {
      try {
        return JSON.parse(localStorage.getItem("shitu-kitchen-auth-v1") || "null")?.location || "fuxing";
      } catch {
        return "fuxing";
      }
    });
    await setSite(page, site === "yongji" ? "yongji" : "fuxing");
    if(checks.manage === false){
      assert.equal(await page.locator('[data-action="select-inventory-ops"][data-mode="manage"]').count(),0);
    }
    if(checks.manage === true){
      const manage=page.locator('[data-action="select-inventory-ops"][data-mode="manage"]');
      await manage.waitFor({state:"visible"});
      await manage.click();
      const manageQuantityControls=await page.locator('[data-manage-adjust="true"]').count();
      if(checks.stocktake === true){
        assert(manageQuantityControls > 0,`${username} missing management quantity controls`);
      }
      if(checks.stocktake === false){
        assert.equal(manageQuantityControls,0,`${username} must not receive stocktake quantity controls`);
      }
      const editItem=page.locator('[data-action="open-edit-item"]').first();
      await editItem.waitFor({state:"visible"});
      await editItem.click();
      const workMinimum=page.locator('input[name="workMinimum"]');
      await workMinimum.waitFor({state:"visible"});
      if(checks.stocktake === true){
        assert.equal(await workMinimum.getAttribute("readonly"),null,`${username} work minimum unexpectedly read-only`);
      }
      if(checks.stocktake === false){
        assert.equal(await workMinimum.getAttribute("readonly"),"",`${username} can edit work minimum without stocktake authority`);
      }
      const receiveDefault=page.locator('select[name="receiveZone"]');
      await receiveDefault.waitFor({state:"visible"});
      if(checks.receiveDefault === true){
        assert.equal(await receiveDefault.isDisabled(),false,`${username} receiving default unexpectedly disabled`);
      }
      if(checks.receiveDefault === false){
        assert.equal(await receiveDefault.isDisabled(),true,`${username} can edit branch-owned receiving default`);
      }
      await page.locator('button[data-action="close-modal"]').first().click();
      await page.locator(".modal-backdrop").waitFor({state:"detached"});
    }
    if(username === "employeefx" && checks.stocktake === true){
      const overview=page.locator('[data-action="select-inventory-ops"][data-mode="overview"]').first();
      if(await overview.count()) {
        await overview.click();
        await page.locator(".inventory-product-table").waitFor({state:"visible",timeout:12000});
      }
      const peer=await context.newPage();
      attachRuntimeDiagnostics(peer,errors,"peer: ");
      await peer.goto(BASE + "/#inventory",{waitUntil:"domcontentloaded"});
      await peer.locator(".app-shell").waitFor({state:"visible",timeout:15000});
      await setSite(peer,"fuxing");

      const sourceRow=page.locator(".inventory-product-table .inventory-product-row").first();
      const peerRow=peer.locator(".inventory-product-table .inventory-product-row").first();
      await sourceRow.waitFor({state:"visible"});
      await peerRow.waitFor({state:"visible"});
      const stockKey=await sourceRow.getAttribute("data-stock-key");
      assert(stockKey,"multi-location overview product row is missing stock key");

      await sourceRow.locator('[data-action="open-inventory-detail"]').first().click();
      const sourceSheet=page.locator(".inventory-detail-sheet");
      await sourceSheet.waitFor({state:"visible"});
      const sourceMinimum=sourceSheet.locator('input[data-field="item"][data-key="minimum"]').first();
      await sourceMinimum.waitFor({state:"visible"});
      const zone=await sourceMinimum.getAttribute("data-zone");
      const locationId=await sourceMinimum.getAttribute("data-cloud-location-id");
      assert(zone,"detail minimum is missing the rendered storage zone");
      assert(locationId,"detail minimum is missing the rendered PostgreSQL location id");
      assert(await sourceMinimum.getAttribute("data-cloud-item-id"),"detail minimum is missing the rendered PostgreSQL item id");
      const before=Math.max(0,Number(await sourceMinimum.inputValue())||0);
      const next=before+1;

      await peer.locator(`.inventory-product-row[data-stock-key="${stockKey}"] [data-action="open-inventory-detail"]`).first().click();
      const peerSheet=peer.locator(".inventory-detail-sheet");
      await peerSheet.waitFor({state:"visible"});
      const peerMinimum=peerSheet.locator(`input[data-key="minimum"][data-cloud-location-id="${locationId}"]`);
      await peerMinimum.waitFor({state:"visible"});
      await page.waitForTimeout(250);

      await page.evaluate(()=>{
        window.__inventoryChangeProbe=0;
        document.querySelector("#app")?.addEventListener("change",()=>{ window.__inventoryChangeProbe+=1; },{capture:true,once:true});
      });
      const minimumWrite=page.waitForResponse((response)=>response.url().endsWith("/api/inventory/set-minimum")&&response.request().method()==="POST");
      await sourceMinimum.evaluate((input,value)=>{
        input.value=value;
        input.dispatchEvent(new Event("change",{bubbles:true,composed:true}));
      },String(next));
      const dispatchDiagnostic=await page.evaluate((targetLocationId)=>{
        const input=document.querySelector(`.inventory-detail-sheet input[data-key="minimum"][data-cloud-location-id="${CSS.escape(targetLocationId)}"]`);
        const state=JSON.parse(localStorage.getItem("shitu-kitchen-os-v1")||"null");
        const today=new Date();
        const todayKey=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
        return {
          probe:window.__inventoryChangeProbe,
          disabled:Boolean(input?.disabled),
          dataset:{...(input?.dataset||{})},
          selectedDate:state?.selectedDate||"",
          todayKey,
          cloud:localStorage.getItem("shitu-inventory-cloud-v2"),
        };
      },locationId);
      assert.equal(dispatchDiagnostic.probe,1,`detail change did not reach app root: ${JSON.stringify(dispatchDiagnostic)}`);
      assert.equal(dispatchDiagnostic.disabled,true,`detail change handler returned before mutation: ${JSON.stringify(dispatchDiagnostic)}`);
      assert.equal((await minimumWrite).status(),200,"detail minimum did not persist through the database API");
      await peer.waitForFunction(
        ({locationId,value})=>document.querySelector(`.inventory-detail-sheet input[data-key="minimum"][data-cloud-location-id="${CSS.escape(locationId)}"]`)?.value===value,
        {locationId,value:String(next)},
        {timeout:10000}
      );

      const restoredMinimum=page.locator(`.inventory-detail-sheet input[data-key="minimum"][data-cloud-location-id="${locationId}"]`);
      const minimumRestore=page.waitForResponse((response)=>response.url().endsWith("/api/inventory/set-minimum")&&response.request().method()==="POST");
      await restoredMinimum.evaluate((input,value)=>{
        input.value=value;
        input.dispatchEvent(new Event("change",{bubbles:true,composed:true}));
      },String(before));
      assert.equal((await minimumRestore).status(),200,"detail minimum restore did not persist through the database API");
      await peer.waitForFunction(
        ({locationId,value})=>document.querySelector(`.inventory-detail-sheet input[data-key="minimum"][data-cloud-location-id="${CSS.escape(locationId)}"]`)?.value===value,
        {locationId,value:String(before)},
        {timeout:10000}
      );
      await peer.locator('[data-action="close-inventory-detail"]').last().click();
      await peer.close();
    }
    if(checks.operations === false){
      assert.equal(await page.locator('[data-action="select-inventory-ops"][data-mode="in"]').count(),0);
    }
    if(checks.operations === true){
      assert((await page.locator('[data-action="select-inventory-ops"][data-mode="in"]').count()) > 0);
    }
    if(checks.stocktake === true){
      assert((await page.locator('input.minimum-input').count()) > 0,"stocktake control missing");
    }
  }
  await assertNoPageErrors(page,errors,username);
  await context.close();
}

async function responsiveAdmin(browser, viewport) {
  const context=await browser.newContext({viewport});
  const page=await context.newPage();
  const errors=[];
  attachRuntimeDiagnostics(page,errors);
  await seedRoleSession(page,context,"yangchuadmin");
  await setSite(page,"fuxing");
  await inventorySearchRoundTrip(page);
  await assertInventorySurfaceFits(page,`responsive inventory ${viewport.width}x${viewport.height}`);

  const structuredFilterPrimary=page.locator(".storage-tab-groups .filter-tab .bilingual-control-label .label-primary").first();
  if(await structuredFilterPrimary.count()){
    assert.equal(
      (await structuredFilterPrimary.innerText()).includes(" · "),
      false,
      `responsive inventory ${viewport.width}x${viewport.height}: structured bilingual primary label was translated twice`
    );
  }

  if(viewport.width <= 440 && viewport.height >= 700){
    const mobileRoutes=page.locator(".mobile-nav .nav-item");
    assert.equal(await mobileRoutes.count(),ACCOUNT_MODULES.length,"mobile navigation does not contain every desktop module");
    for(const route of ACCOUNT_MODULES){
      assert.equal(await page.locator(`.mobile-nav .nav-item[href="#${route}"]`).count(),1,`mobile navigation is missing ${route}`);
    }

    for(const site of ["fuxing","yongji"]){
      await setSite(page,site);
      const overview=page.locator('.branch-ops-tabs > [data-action="select-inventory-ops"][data-mode="overview"]').first();
      await overview.waitFor({state:"visible"});
      await overview.click();
      await page.locator('[data-field="inventorySearch"]').waitFor({state:"visible"});
      await page.locator('[data-action="shift-date"][data-offset="-1"]').first().click();
      await page.locator(".inventory-history-notice").waitFor({state:"visible"});
      for(const mode of ["overview","alerts","in","pick","transfer","ship","manage","history"]){
        const tab=page.locator(`.branch-ops-tabs > [data-action="select-inventory-ops"][data-mode="${mode}"]`).first();
        await tab.waitFor({state:"visible"});
      }
      await page.locator('.branch-ops-tabs > [data-action="select-inventory-ops"][data-mode="alerts"]').first().click();
      await page.locator(".inventory-alert-center").waitFor({state:"visible"});
      assert.equal(await page.locator('[data-action="select-inventory-alert-filter"]').count(),4,`${site} mobile Inventory alert filters missing`);
      await assertInventorySurfaceFits(page,`${site} mobile alerts ${viewport.width}x${viewport.height}`);
      await page.locator('.inventory-alert-heading [data-action="select-inventory-ops"][data-mode="overview"]').click();
      await page.locator('[data-field="inventorySearch"]').waitFor({state:"visible"});
      await page.locator('.branch-ops-tabs > [data-action="select-inventory-ops"][data-mode="in"]').first().click();
      await page.locator('[data-branch-inventory-operations][data-mode="in"]').waitFor({state:"visible"});
      assert.equal(await page.locator(".inventory-history-notice").count(),0,`${site} mobile operation did not switch back to today`);
      await page.locator('[data-action="select-inventory-ops"][data-mode="manage"]').click();
      await page.locator('[data-action="open-add-item"]').first().click();
      const branchSave=page.locator('.modal-header-save[data-save-item]');
      await branchSave.waitFor({state:"visible"});
      assert.match(await branchSave.innerText(),/Lưu sản phẩm|儲存品項/,`${site} mobile product save action missing`);
      assert.equal(await page.locator('input[name="workMinimum"]').getAttribute("readonly"),null,`${site} admin work minimum must remain editable on mobile`);
      assert.equal(await page.locator('select[name="receiveZone"]').isDisabled(),false,`${site} admin receiving default must remain editable on mobile`);
      await page.locator('button[data-action="close-modal"]').first().click();
      await page.locator(".modal-backdrop").waitFor({state:"detached"});
    }

    await setSite(page,"central");
    // Central Kitchen keeps its existing dedicated operation navigation in this
    // branch; PR #211 adds the low-stock center to branch Inventory only.
    for(const mode of ["overview","in","pick","transfer","ship","manage","history"]){
      const tab=page.locator(`[data-central-mode="${mode}"]`);
      await tab.waitFor({state:"visible"});
    }
    await page.locator('[data-central-mode="manage"]').click();
    await page.locator('[data-central-editor-open="new"]').click();
    const centralSave=page.locator('.modal-header-save[data-central-save-item]');
    await centralSave.waitFor({state:"visible"});
    assert.match(await centralSave.innerText(),/Lưu sản phẩm|儲存品項/,"central mobile product save action missing");
    assert.equal(await page.locator('input[name^="central-quantity:"]').first().getAttribute("readonly"),null,"admin central quantity field must remain editable on mobile");
    assert.equal(await page.locator('input[name^="central-minimum:"]').first().getAttribute("readonly"),null,"admin central minimum field must remain editable on mobile");
    await page.locator('button[data-central-editor-close]').click();

    await page.goto(BASE + "/#settings",{waitUntil:"domcontentloaded"});
    await page.locator("[data-account-edit]").first().click();
    const mobileAccountModal=page.locator(".account-modal");
    await mobileAccountModal.waitFor({state:"visible"});
    assert.equal(await mobileAccountModal.locator(".permission-row").count(),ACCOUNT_MODULES.length,"mobile permission editor does not contain every module");
    assert.equal(await mobileAccountModal.locator(".permission-row").first().getAttribute("data-permission-module"),"dashboard","mobile permission editor does not begin with dashboard");
    await mobileAccountModal.evaluate((modal)=>{ modal.scrollTop=Math.min(260,modal.scrollHeight); });
    await page.waitForTimeout(60);
    const mobileDashboardRow=mobileAccountModal.locator('.permission-row[data-permission-module="dashboard"]');
    const mobilePermissionHead=mobileAccountModal.locator('.permission-head');
    const [dashboardBox,permissionHeadBox,modalBox]=await Promise.all([
      mobileDashboardRow.boundingBox(),
      mobilePermissionHead.boundingBox(),
      mobileAccountModal.boundingBox(),
    ]);
    assert(dashboardBox && permissionHeadBox && modalBox,"mobile dashboard permission geometry unavailable");
    assert(dashboardBox.y >= permissionHeadBox.y + permissionHeadBox.height - 1,"mobile dashboard permission row is hidden under sticky permission header");
    assert(dashboardBox.y + dashboardBox.height <= modalBox.y + modalBox.height,"mobile dashboard permission row falls outside the account modal viewport");
    assert.equal(await mobileDashboardRow.locator('input[name="perm:dashboard:edit"]').count(),1,"mobile dashboard edit toggle is not reachable");
    await mobileAccountModal.locator("[data-account-close]").first().click();
  }

  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  assert(overflow <= 3,`document horizontal overflow ${overflow}px at ${viewport.width}x${viewport.height}`);

  const visibleTargets=page.locator('button:visible,a.nav-item:visible,input:not([type="checkbox"]):not([type="radio"]):visible,select:visible');
  const count=Math.min(await visibleTargets.count(),40);
  for(let i=0;i<count;i++){
    const box=await visibleTargets.nth(i).boundingBox();
    if(!box) continue;
    assert(box.height >= 28,`tap target too short: ${box.height}px at ${viewport.width}x${viewport.height}`);
  }

  if(viewport.width===390 && viewport.height===844){
    await page.goto(BASE + "/#settings",{waitUntil:"domcontentloaded"});
    await page.locator("[data-account-edit]").first().waitFor({state:"visible"});
    await page.locator("[data-account-edit]").first().click();
    await page.locator(".account-modal").waitFor({state:"visible"});
    await page.setViewportSize({width:390,height:520});
    await page.waitForTimeout(80);
    const modalBounds=await page.locator(".account-modal").evaluate((modal)=>{
      const box=modal.getBoundingClientRect();
      return {top:box.top,bottom:box.bottom};
    });
    assert(modalBounds.top >= -1,`account modal starts above visual viewport: ${modalBounds.top}px`);
    assert(modalBounds.bottom <= 521,`account modal falls below visual viewport: ${modalBounds.bottom}px`);
    await page.locator("[data-account-close]").first().click();
  }

  await assertNoPageErrors(page,errors,`responsive ${viewport.width}x${viewport.height}`);
  await context.close();
}

const browser=await chromium.launch({headless:true});
try{
  await adminDesktop(browser);
  await roleDesktop(browser,"managerfx",{manage:true,operations:true,stocktake:true,receiveDefault:true,dashboardEdit:true});
  await roleDesktop(browser,"supervisorfx",{manage:true,operations:true,stocktake:true,receiveDefault:true,dashboardEdit:false});
  await roleDesktop(browser,"employeefx",{manage:true,operations:true,stocktake:true,receiveDefault:true,dashboardEdit:false});
  await roleDesktop(browser,"parttimefx",{manage:false,operations:false,dashboardEdit:false});
  await roleDesktop(browser,"centralreg",{central:true,manage:true,stocktake:true});
  await responsiveAdmin(browser,{width:359,height:740});
  await responsiveAdmin(browser,{width:390,height:844});
  await responsiveAdmin(browser,{width:440,height:956});
  await responsiveAdmin(browser,{width:844,height:390});
  console.log("BROWSER_REGRESSION_OK");
} finally {
  await browser.close();
}
