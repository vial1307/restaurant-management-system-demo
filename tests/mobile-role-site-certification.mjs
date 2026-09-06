import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE = process.env.TEST_WEB_BASE || "http://127.0.0.1:3000";
const PASSWORD = "KitchenTest!123";

const CASES = [
  { username:"managerfx", role:"manager", location:"fuxing", foreign:"yongji", deniedRoute:"settings", width:390, height:844 },
  { username:"manageryj", role:"manager", location:"yongji", foreign:"fuxing", deniedRoute:"settings", width:412, height:915 },
  { username:"employeefx", role:"employee", location:"fuxing", foreign:"yongji", deniedRoute:"reports", width:390, height:844 },
  { username:"centralreg", role:"central", location:"central", foreign:"fuxing", deniedRoute:"dashboard", width:412, height:915, central:true },
];

async function login(page, username, foreign) {
  await page.addInitScript((site) => {
    localStorage.setItem("shitu-admin-active-site-v1", site);
  }, foreign);
  await page.goto(`${BASE}/#inventory`, { waitUntil:"domcontentloaded", timeout:30000 });
  await page.waitForFunction(() => document.documentElement.dataset.vpsAuthReady === "true", null, { timeout:15000 });
  await page.locator('#auth-login-form input[name="username"]').fill(username);
  await page.locator('#auth-login-form input[name="password"]').fill(PASSWORD);
  await page.locator('#auth-login-form button[type="submit"]').click();
  await page.waitForSelector(".app-shell", { state:"visible", timeout:15000 });
  await page.waitForFunction(() => !document.querySelector("#auth-login-form"), null, { timeout:15000 });
  await page.waitForTimeout(100);
}

async function waitInventoryReady(page) {
  await page.goto(`${BASE}/#inventory`, { waitUntil:"domcontentloaded", timeout:30000 });
  await page.waitForSelector(".page-content", { state:"visible", timeout:15000 });
  await page.waitForFunction(() => localStorage.getItem("shitu-inventory-cloud-v2") === "ready", null, { timeout:15000 }).catch(() => {});
  await page.waitForTimeout(150);
}

async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert(overflow <= 3, `${label}: horizontal overflow ${overflow}px`);
}

async function sessionSnapshot(page) {
  return page.evaluate(() => {
    let user = null;
    try { user = JSON.parse(localStorage.getItem("shitu-kitchen-auth-v1") || "null"); } catch {}
    return {
      role:user?.role || user?.accountRole || "",
      location:user?.location || "",
      activeSite:localStorage.getItem("shitu-admin-active-site-v1") || "",
    };
  });
}

async function assertDeniedNavHidden(page, route, label) {
  const locator = page.locator(`a[href="#${route}"]`);
  if (!await locator.count()) return;
  assert.equal(await locator.first().isVisible(), false, `${label}: denied route ${route} is visibly exposed`);
}

const browser = await chromium.launch({ headless:true });
try {
  for (const testCase of CASES) {
    const label = `${testCase.username}-${testCase.width}`;
    const context = await browser.newContext({ viewport:{ width:testCase.width, height:testCase.height }, hasTouch:true, isMobile:true });
    const page = await context.newPage();
    try {
      await login(page, testCase.username, testCase.foreign);
      await waitInventoryReady(page);

      const session = await sessionSnapshot(page);
      assert.equal(session.role, testCase.role, `${label}: wrong role`);
      assert.equal(session.location, testCase.location, `${label}: wrong account location`);
      assert.equal(session.activeSite, testCase.location, `${label}: foreign/stale active site was not corrected`);
      assert.equal(await page.locator(".access-empty-state").count(), 0, `${label}: authorized inventory is blocked`);

      if (testCase.central) {
        await page.locator("input[data-central-search]").waitFor({ state:"visible", timeout:10000 });
      } else {
        const controls = page.locator('[data-action="select-inventory-ops"]');
        assert((await controls.count()) > 0, `${label}: branch inventory operation controls are missing`);
        await controls.first().waitFor({ state:"visible", timeout:10000 });
      }

      await assertDeniedNavHidden(page, testCase.deniedRoute, label);
      await assertNoHorizontalOverflow(page, label);
      console.log("MOBILE_ROLE_SITE_CASE_OK", label);
    } finally {
      await context.close();
    }
  }

  const adminContext = await browser.newContext({ viewport:{ width:390, height:844 }, hasTouch:true, isMobile:true });
  const adminPage = await adminContext.newPage();
  try {
    await login(adminPage, "yangchuadmin", "fuxing");
    for (const site of ["fuxing", "yongji", "central"]) {
      await adminPage.evaluate((target) => localStorage.setItem("shitu-admin-active-site-v1", target), site);
      await waitInventoryReady(adminPage);
      const warehouse = adminPage.locator(`[data-warehouse="${site}"]`).first();
      if (await warehouse.count()) await warehouse.click().catch(() => {});
      await adminPage.waitForTimeout(100);
      const session = await sessionSnapshot(adminPage);
      assert.equal(session.activeSite, site, `admin-390: cannot keep active site ${site}`);
      assert.equal(await adminPage.locator(".access-empty-state").count(), 0, `admin-390: ${site} inventory blocked`);
      if (site === "central") await adminPage.locator("input[data-central-search]").waitFor({ state:"visible", timeout:10000 });
      else await adminPage.locator('[data-action="select-inventory-ops"]').first().waitFor({ state:"visible", timeout:10000 });
      await assertNoHorizontalOverflow(adminPage, `admin-390-${site}`);
    }
    console.log("MOBILE_ROLE_SITE_ADMIN_OK");
  } finally {
    await adminContext.close();
  }
} finally {
  await browser.close();
}

console.log("MOBILE_ROLE_SITE_CERTIFICATION_OK");
