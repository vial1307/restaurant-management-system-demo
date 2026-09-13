import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE = process.env.TEST_WEB_BASE || "http://127.0.0.1:3000";
const PASSWORD = "KitchenTest!123";

async function login(page, username) {
  await page.goto(`${BASE}/`, { waitUntil:"domcontentloaded", timeout:30000 });
  await page.waitForFunction(() => document.documentElement.dataset.vpsAuthReady === "true", null, { timeout:15000 });
  const form = page.locator("#auth-login-form").first();
  await form.waitFor({ state:"visible", timeout:10000 });
  await form.locator('input[name="username"]').fill(username);
  await form.locator('input[name="password"]').fill(PASSWORD);
  await form.locator('button[type="submit"]').click();
  await page.waitForSelector(".app-shell", { state:"visible", timeout:15000 });
  await page.waitForFunction(() => !document.querySelector("#auth-login-form"), null, { timeout:15000 });
}

async function gotoInventory(page) {
  await page.goto(`${BASE}/#inventory`, { waitUntil:"domcontentloaded", timeout:30000 });
  await page.waitForSelector(".page-content", { state:"visible", timeout:15000 });
  await page.waitForFunction(() => localStorage.getItem("shitu-inventory-cloud-v2") === "ready", null, { timeout:15000 });
  await page.waitForTimeout(100);
}

async function renderedBeefQuantities(page) {
  const rows = page.locator(".inventory-row.storage-row").filter({ hasText:"牛肉" });
  await rows.first().waitFor({ state:"visible", timeout:10000 });
  const values = [];
  for (let index = 0; index < await rows.count(); index += 1) {
    const row = rows.nth(index);
    const input = row.locator('.quantity-control input[data-key="quantity"]');
    if (await input.count()) values.push(Number(await input.first().inputValue()));
    else values.push(Number((await row.locator(".quantity-readonly").first().textContent()) || 0));
  }
  return values.sort((a,b) => a-b);
}

async function runRoleParity(browser) {
  const snapshots = new Map();
  for (const username of ["managerfx", "supervisorfx", "employeefx", "parttimefx"]) {
    const context = await browser.newContext({ viewport:{width:390,height:844}, hasTouch:true, isMobile:true });
    const page = await context.newPage();
    try {
      await login(page, username);
      await gotoInventory(page);
      const site = await page.evaluate(() => localStorage.getItem("shitu-admin-active-site-v1"));
      assert.equal(site, "fuxing", `${username}: wrong active inventory site`);
      const quantities = await renderedBeefQuantities(page);
      snapshots.set(username, quantities);
    } finally {
      await context.close();
    }
  }

  const baseline = snapshots.get("managerfx");
  assert(baseline?.length, "manager Fuxing beef rows missing");
  for (const [username, quantities] of snapshots) {
    assert.deepEqual(quantities, baseline, `${username}: rendered Fuxing beef quantities differ by role`);
  }
}

async function runAdminSiteSwitchParity(browser) {
  const context = await browser.newContext({ viewport:{width:390,height:844}, hasTouch:true, isMobile:true });
  const page = await context.newPage();
  try {
    await login(page, "yangchuadmin");
    await page.evaluate(() => localStorage.setItem("shitu-admin-active-site-v1", "fuxing"));
    await gotoInventory(page);
    const fuxing = await renderedBeefQuantities(page);
    assert.deepEqual(fuxing, [1,10], "admin Fuxing fixture quantities changed unexpectedly");

    let releaseYongji;
    const gate = new Promise((resolve) => { releaseYongji = resolve; });
    let delayed = false;
    await page.route("**/api/inventory/yongji", async (route) => {
      delayed = true;
      await gate;
      await route.continue();
    });

    const switcher = page.locator('[data-warehouse="yongji"]').first();
    await switcher.waitFor({ state:"visible", timeout:10000 });
    await switcher.click();
    await page.waitForFunction(() => localStorage.getItem("shitu-admin-active-site-v1") === "yongji", null, { timeout:10000 });
    await page.waitForTimeout(120);

    const transition = await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem("shitu-kitchen-os-v1") || "null");
      const record = state?.records?.[state?.selectedDate];
      return {
        inventorySite:record?.inventorySite || "",
        quantities:(record?.inventory || []).filter((item) => item.label === "牛肉").map((item) => Number(item.quantity)).sort((a,b) => a-b),
      };
    });
    assert.equal(transition.inventorySite, "yongji", "site switch did not immediately move rendered inventory identity to Yongji");
    assert.notDeepEqual(transition.quantities, fuxing, "Fuxing quantities leaked into Yongji transition state");

    releaseYongji();
    await page.waitForFunction(() => {
      const state = JSON.parse(localStorage.getItem("shitu-kitchen-os-v1") || "null");
      const record = state?.records?.[state?.selectedDate];
      const quantities = (record?.inventory || []).filter((item) => item.label === "牛肉").map((item) => Number(item.quantity)).sort((a,b) => a-b);
      return record?.inventorySite === "yongji" && quantities.includes(2) && quantities.includes(3);
    }, null, { timeout:15000 });
    assert(delayed, "Yongji inventory request was not delayed; stale-site transition was not exercised");
    const yongji = await renderedBeefQuantities(page);
    assert.deepEqual(yongji, [2,3], "admin Yongji rendered quantities do not match authoritative fixture");
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch({ headless:true });
try {
  await runRoleParity(browser);
  await runAdminSiteSwitchParity(browser);
} finally {
  await browser.close();
}

console.log("INVENTORY_ROLE_DATA_PARITY_BROWSER_OK");
