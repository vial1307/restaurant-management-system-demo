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
}

function sortedNumbers(values) {
  return [...values].map(Number).sort((a,b) => a-b);
}

async function inventoryDiagnostic(page) {
  return page.evaluate(() => {
    let session = null;
    let state = null;
    try { session = JSON.parse(localStorage.getItem("shitu-kitchen-auth-v1") || "null"); } catch {}
    try { state = JSON.parse(localStorage.getItem("shitu-kitchen-os-v1") || "null"); } catch {}
    const record = state?.records?.[state?.selectedDate];
    return {
      session:{ id:session?.id || "", role:session?.role || "", accountRole:session?.accountRole || "", location:session?.location || "" },
      activeSite:localStorage.getItem("shitu-admin-active-site-v1") || "",
      cloudState:localStorage.getItem("shitu-inventory-cloud-v2") || "",
      selectedDate:state?.selectedDate || "",
      inventorySite:record?.inventorySite || "",
      beef:(record?.inventory || []).filter((item) => item.label === "牛肉").map((item) => ({ id:item.id, zone:item.zone, quantity:Number(item.quantity) })),
      storageRows:[...document.querySelectorAll(".inventory-row.storage-row")].map((node) => (node.textContent || "").trim().slice(0,180)),
      pageText:(document.querySelector(".page-content")?.textContent || "").trim().slice(0,500),
    };
  });
}

async function waitForInventorySnapshot(page, site, expectedQuantities, label) {
  const expected = sortedNumbers(expectedQuantities);
  try {
    await page.waitForFunction(({ site, expected }) => {
      let state = null;
      try { state = JSON.parse(localStorage.getItem("shitu-kitchen-os-v1") || "null"); } catch {}
      const record = state?.records?.[state?.selectedDate];
      const quantities = (record?.inventory || [])
        .filter((item) => item.label === "牛肉")
        .map((item) => Number(item.quantity))
        .sort((a,b) => a-b);
      return record?.inventorySite === site
        && quantities.length === expected.length
        && quantities.every((value, index) => value === expected[index]);
    }, { site, expected }, { timeout:15000 });
  } catch (error) {
    const diagnostic = await inventoryDiagnostic(page);
    throw new Error(`${label}: authoritative inventory snapshot did not reach store; diagnostic=${JSON.stringify(diagnostic)}; cause=${error?.message || error}`);
  }
}

async function renderedBeefQuantities(page, expectedQuantities, label) {
  const expected = sortedNumbers(expectedQuantities);
  try {
    await page.waitForFunction((expectedValues) => {
      const rows = [...document.querySelectorAll(".inventory-row.storage-row")]
        .filter((node) => (node.textContent || "").includes("牛肉"));
      if (rows.length !== expectedValues.length) return false;
      const values = rows.map((row) => {
        const input = row.querySelector('.quantity-control input[data-key="quantity"]');
        if (input) return Number(input.value);
        return Number(row.querySelector(".quantity-readonly")?.textContent || 0);
      }).sort((a,b) => a-b);
      return values.every((value, index) => value === expectedValues[index]);
    }, expected, { timeout:10000 });
  } catch (error) {
    const diagnostic = await inventoryDiagnostic(page);
    throw new Error(`${label}: rendered inventory does not match authoritative store snapshot; diagnostic=${JSON.stringify(diagnostic)}; cause=${error?.message || error}`);
  }

  const rows = page.locator(".inventory-row.storage-row").filter({ hasText:"牛肉" });
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
      await waitForInventorySnapshot(page, "fuxing", [1,10], username);
      const quantities = await renderedBeefQuantities(page, [1,10], username);
      snapshots.set(username, quantities);
    } finally {
      await context.close();
    }
  }

  const baseline = snapshots.get("managerfx");
  assert.deepEqual(baseline, [1,10], "manager Fuxing rendered fixture quantities changed unexpectedly");
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
    await waitForInventorySnapshot(page, "fuxing", [1,10], "admin-fuxing");
    const fuxing = await renderedBeefQuantities(page, [1,10], "admin-fuxing");
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
    await page.waitForFunction(() => {
      const state = JSON.parse(localStorage.getItem("shitu-kitchen-os-v1") || "null");
      const record = state?.records?.[state?.selectedDate];
      return record?.inventorySite === "yongji";
    }, null, { timeout:10000 });

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
    await waitForInventorySnapshot(page, "yongji", [2,3], "admin-yongji");
    assert(delayed, "Yongji inventory request was not delayed; stale-site transition was not exercised");
    const yongji = await renderedBeefQuantities(page, [2,3], "admin-yongji");
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
