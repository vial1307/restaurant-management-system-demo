import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { ACCOUNT_MODULES } from "../src/account-permissions.js";

const BASE = process.env.TEST_WEB_BASE || "http://127.0.0.1:3000";
const PASSWORD = "KitchenTest!123";
const ENGINES = { chromium, webkit };

const CASES = [
  { engine:"chromium", username:"managerfx", role:"manager", site:"fuxing", foreign:"yongji", width:390, height:844, manage:true, operations:true, stocktake:true, receiveDefault:true },
  { engine:"chromium", username:"manageryj", role:"manager", site:"yongji", foreign:"fuxing", width:412, height:915, manage:true, operations:true, stocktake:true, receiveDefault:true },
  { engine:"chromium", username:"supervisorfx", role:"supervisor", site:"fuxing", foreign:"yongji", width:390, height:844, manage:true, operations:true, stocktake:true, receiveDefault:false },
  { engine:"chromium", username:"employeefx", role:"employee", site:"fuxing", foreign:"yongji", width:412, height:915, manage:true, operations:true, stocktake:false, receiveDefault:false },
  { engine:"chromium", username:"parttimefx", role:"parttime", site:"fuxing", foreign:"yongji", width:390, height:844, manage:false, operations:false, stocktake:false, receiveDefault:false },
  { engine:"chromium", username:"centralreg", role:"central", site:"central", foreign:"fuxing", width:412, height:915, central:true, manage:true, operations:true, stocktake:false },
  { engine:"webkit", username:"managerfx", role:"manager", site:"fuxing", foreign:"yongji", width:390, height:844, manage:true, operations:true, stocktake:true, receiveDefault:true },
  { engine:"webkit", username:"employeefx", role:"employee", site:"fuxing", foreign:"yongji", width:390, height:844, manage:true, operations:true, stocktake:false, receiveDefault:false },
  { engine:"webkit", username:"centralreg", role:"central", site:"central", foreign:"fuxing", width:390, height:844, central:true, manage:true, operations:true, stocktake:false },
];

function inventorySiteFromUrl(url) {
  try {
    const path = new URL(url).pathname;
    const match = path.match(/^\/api\/inventory\/(central|fuxing|yongji)(?:\/|$)/);
    return match?.[1] || "";
  } catch {
    return "";
  }
}

async function login(page, context, username, foreignSite, label) {
  await page.goto(BASE + "/", { waitUntil:"domcontentloaded", timeout:30000 });
  await page.waitForFunction(() => document.documentElement.dataset.vpsAuthReady === "true", null, { timeout:15000 });
  await page.evaluate((site) => localStorage.setItem("shitu-admin-active-site-v1", site), foreignSite);

  const loginForm = page.locator("#auth-login-form");
  await loginForm.waitFor({ state:"visible", timeout:10000 });
  await loginForm.locator('input[name="username"]').fill(username);
  await loginForm.locator('input[name="password"]').fill(PASSWORD);
  await loginForm.locator('button[type="submit"]').click();

  try {
    await page.waitForSelector(".app-shell", { state:"visible", timeout:12000 });
    await page.waitForFunction(() => !document.querySelector("#auth-login-form"), null, { timeout:12000 });
  } catch (uiError) {
    // WebKit in CI can occasionally drop the login cookie during a form navigation.
    // Re-seed the same account through the browser context so cookie/session scope
    // remains identical to the page origin, then let the auth bridge rebuild local state.
    const response = await context.request.post(`${BASE}/api/auth/login`, {
      data:{ username, password:PASSWORD },
      failOnStatusCode:false,
    });
    if (!response.ok()) throw new Error(`${label}: login fallback failed with HTTP ${response.status()}; original=${uiError?.message || uiError}`);
    await page.reload({ waitUntil:"domcontentloaded", timeout:30000 });
    await page.waitForFunction(() => document.documentElement.dataset.vpsAuthReady === "true", null, { timeout:15000 });
    await page.waitForSelector(".app-shell", { state:"visible", timeout:15000 });
    await page.waitForFunction(() => !document.querySelector("#auth-login-form"), null, { timeout:15000 });
  }
}

async function sessionSnapshot(page) {
  return page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem("shitu-kitchen-auth-v1") || "null"); }
    catch { return null; }
  });
}

async function gotoInventory(page) {
  await page.goto(`${BASE}/#inventory`, { waitUntil:"domcontentloaded", timeout:30000 });
  await page.waitForSelector(".page-content", { state:"visible", timeout:15000 });
  await page.waitForFunction(() => localStorage.getItem("shitu-inventory-cloud-v2") === "ready", null, { timeout:15000 });
}

async function selectTodayViaUi(page, label) {
  const toggle = page.locator('[data-action="toggle-calendar"]').first();
  await toggle.waitFor({ state:"visible", timeout:10000 });
  await toggle.click();

  const today = page.locator('[data-action="calendar-shortcut"][data-shortcut="today"]').first();
  await today.waitFor({ state:"visible", timeout:10000 });
  await today.click();

  await page.locator(".calendar-popover").waitFor({ state:"detached", timeout:10000 });
  await toggle.click();
  const selectedToday = page.locator(".calendar-day.today.selected");
  await selectedToday.first().waitFor({ state:"visible", timeout:10000 });
  assert.equal(await selectedToday.count(), 1, `${label}: today is not the rendered selected service date`);
  await page.keyboard.press("Escape");
  await page.locator(".calendar-popover").waitFor({ state:"detached", timeout:10000 });
}

async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert(overflow <= 3, `${label}: horizontal overflow ${overflow}px`);
}

async function waitForPermissionState(page, scopeSelector, route, expected) {
  await page.waitForFunction(({ scopeSelector, route, expected }) => {
    const host = document.querySelector(scopeSelector);
    const link = host?.querySelector(`.nav-item[href="#${route}"]`);
    if (!link) return false;
    const displayed = getComputedStyle(link).display !== "none";
    if (displayed !== expected) return false;
    if (route === "schedule" && expected) return link.dataset.workforceLegacySchedule === "true";
    return true;
  }, { scopeSelector, route, expected }, { timeout:10000 });
}

async function assertPermissionNavigation(page, session, label) {
  for (const route of ACCOUNT_MODULES) {
    const expected = Boolean(session?.permissions?.[route]?.view) || session?.role === "admin" || session?.accountRole === "admin";
    const nav = page.locator(`.mobile-nav .nav-item[href="#${route}"]`);
    assert.equal(await nav.count(), 1, `${label}: mobile nav entry missing for ${route}`);
    await waitForPermissionState(page, ".mobile-nav", route, expected);
    const displayed = await nav.evaluate((node) => getComputedStyle(node).display !== "none");
    assert.equal(displayed, expected, `${label}: mobile nav permission mismatch for ${route}`);
  }

  const menuButton = page.locator('[data-action="toggle-mobile-menu"]').first();
  if (await menuButton.count()) {
    await menuButton.click();
    const menu = page.locator(".mobile-menu-grid");
    await menu.waitFor({ state:"visible", timeout:10000 });
    for (const route of ACCOUNT_MODULES) {
      const expected = Boolean(session?.permissions?.[route]?.view) || session?.role === "admin" || session?.accountRole === "admin";
      const link = menu.locator(`.nav-item[href="#${route}"]`);
      assert.equal(await link.count(), 1, `${label}: full mobile menu entry missing for ${route}`);
      await waitForPermissionState(page, ".mobile-menu-grid", route, expected);
      const displayed = await link.evaluate((node) => getComputedStyle(node).display !== "none");
      assert.equal(displayed, expected, `${label}: full mobile menu permission mismatch for ${route}`);
    }
    await page.keyboard.press("Escape");
    await page.locator(".mobile-menu-backdrop").waitFor({ state:"detached", timeout:10000 });
  }
}

async function assertBranchInventoryRole(page, testCase, label) {
  const manage = page.locator('[data-action="select-inventory-ops"][data-mode="manage"]');
  const inbound = page.locator('[data-action="select-inventory-ops"][data-mode="in"]');

  if (testCase.manage) {
    await manage.waitFor({ state:"visible", timeout:10000 });
    await manage.click();
    const edit = page.locator('[data-action="open-edit-item"]').first();
    await edit.waitFor({ state:"visible", timeout:10000 });
    const directControls = await page.locator('[data-manage-adjust="true"]').count();
    if (testCase.stocktake) assert(directControls > 0, `${label}: stocktake controls missing`);
    else assert.equal(directControls, 0, `${label}: unauthorized stocktake controls visible`);

    await edit.click();
    const modal = page.locator('form[data-form="edit-item"]');
    await modal.waitFor({ state:"visible", timeout:10000 });

    const quantity = modal.locator('input[name^="quantity:"]').first();
    const minimum = modal.locator('input[name^="minimum:"]').first();
    const workMinimum = modal.locator('input[name="workMinimum"]');
    const receiveDefault = modal.locator('select[name="receiveZone"]');
    await quantity.waitFor({ state:"visible", timeout:10000 });
    await minimum.waitFor({ state:"visible", timeout:10000 });
    await workMinimum.waitFor({ state:"visible", timeout:10000 });
    await receiveDefault.waitFor({ state:"visible", timeout:10000 });

    for (const [name, field] of [["quantity", quantity], ["minimum", minimum], ["workMinimum", workMinimum]]) {
      const readonly = await field.getAttribute("readonly");
      if (testCase.stocktake) assert.equal(readonly, null, `${label}: ${name} unexpectedly read-only`);
      else assert.equal(readonly, "", `${label}: ${name} editable without stocktake authority`);
    }
    assert.equal(await receiveDefault.isDisabled(), !testCase.receiveDefault, `${label}: receiving-default ownership mismatch`);
    await assertNoHorizontalOverflow(page, `${label}-product-modal`);
    await page.locator('button[data-action="close-modal"]').first().click();
    await page.locator(".modal-backdrop").waitFor({ state:"detached", timeout:10000 });
  } else {
    assert.equal(await manage.count(), 0, `${label}: manage tab visible without catalog management authority`);
  }

  if (testCase.operations) {
    await inbound.waitFor({ state:"visible", timeout:10000 });
  } else {
    assert.equal(await inbound.count(), 0, `${label}: inventory mutation tab visible without edit authority`);
  }
}

async function assertCentralInventoryRole(page, testCase, label) {
  await page.locator('input[data-central-search]').first().waitFor({ state:"visible", timeout:10000 });
  const inbound = page.locator('[data-central-mode="in"]');
  if (testCase.operations) await inbound.waitFor({ state:"visible", timeout:10000 });
  else assert.equal(await inbound.count(), 0, `${label}: central mutation tab visible without authority`);

  const manage = page.locator('[data-central-mode="manage"]');
  if (!testCase.manage) {
    assert.equal(await manage.count(), 0, `${label}: central manage visible without authority`);
    return;
  }
  await manage.waitFor({ state:"visible", timeout:10000 });
  await manage.click();
  const directControls = await page.locator('[data-central-manage-adjust="true"]').count();
  if (testCase.stocktake) assert(directControls > 0, `${label}: central stocktake controls missing`);
  else assert.equal(directControls, 0, `${label}: central role received direct stocktake controls`);

  const edit = page.locator('[data-central-editor-open]').first();
  await edit.waitFor({ state:"visible", timeout:10000 });
  await edit.click();
  const quantity = page.locator('input[name^="central-quantity:"]').first();
  const minimum = page.locator('input[name^="central-minimum:"]').first();
  await quantity.waitFor({ state:"visible", timeout:10000 });
  await minimum.waitFor({ state:"visible", timeout:10000 });
  if (testCase.stocktake) {
    assert.equal(await quantity.getAttribute("readonly"), null, `${label}: central quantity unexpectedly read-only`);
    assert.equal(await minimum.getAttribute("readonly"), null, `${label}: central minimum unexpectedly read-only`);
  } else {
    assert.equal(await quantity.getAttribute("readonly"), "", `${label}: central quantity editable without stocktake authority`);
    assert.equal(await minimum.getAttribute("readonly"), "", `${label}: central minimum editable without stocktake authority`);
  }
  await assertNoHorizontalOverflow(page, `${label}-central-modal`);
  await page.locator('button[data-central-editor-close]').first().click();
}

async function runRoleCase(browser, testCase) {
  const label = `${testCase.engine}-${testCase.username}-${testCase.width}x${testCase.height}`;
  const context = await browser.newContext({
    viewport:{ width:testCase.width, height:testCase.height },
    hasTouch:true,
    isMobile:true,
  });
  const page = await context.newPage();
  const errors = [];
  const requestedSites = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    const site = inventorySiteFromUrl(request.url());
    if (site) requestedSites.push(site);
  });

  try {
    await login(page, context, testCase.username, testCase.foreign, label);
    const session = await sessionSnapshot(page);
    assert(session, `${label}: local session missing`);
    assert.equal(session.accountRole || session.role, testCase.role, `${label}: wrong role`);
    assert.equal(session.location, testCase.site, `${label}: wrong scoped site`);

    await gotoInventory(page);
    await selectTodayViaUi(page, label);
    assert.equal(await page.locator(".access-empty-state").count(), 0, `${label}: authorized inventory blocked`);
    const activeSite = await page.evaluate(() => localStorage.getItem("shitu-admin-active-site-v1"));
    assert.equal(activeSite, testCase.site, `${label}: stale active site was not repaired`);

    await assertPermissionNavigation(page, session, label);
    if (testCase.central) await assertCentralInventoryRole(page, testCase, label);
    else await assertBranchInventoryRole(page, testCase, label);
    await assertNoHorizontalOverflow(page, label);
    const foreignRequests = requestedSites.filter((site) => site !== testCase.site);
    assert.deepEqual(foreignRequests, [], `${label}: scoped account attempted foreign inventory API: ${foreignRequests.join(",")}`);
    assert.deepEqual(errors, [], `${label}: page errors: ${errors.join(" | ")}`);
    console.log("MOBILE_ROLE_SITE_CASE_OK", label, `inventoryRequests=${requestedSites.join(",") || "none"}`);
  } finally {
    await context.close();
  }
}

async function runAdminMobile(browser) {
  const label = "chromium-admin-390x844";
  const context = await browser.newContext({ viewport:{ width:390, height:844 }, hasTouch:true, isMobile:true });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await login(page, context, "yangchuadmin", "fuxing", label);
    const session = await sessionSnapshot(page);
    assert.equal(session?.accountRole || session?.role, "admin");
    await assertPermissionNavigation(page, session, label);

    await gotoInventory(page);
    for (const site of ["fuxing", "yongji", "central"]) {
      const switcher = page.locator(`[data-warehouse="${site}"]`).first();
      await switcher.waitFor({ state:"visible", timeout:10000 });
      await switcher.click();
      await page.waitForFunction((target) => localStorage.getItem("shitu-admin-active-site-v1") === target, site, { timeout:10000 });
      await page.waitForTimeout(150);
      assert.equal(await page.locator(".access-empty-state").count(), 0, `${label}: admin blocked from ${site}`);
      if (site === "central") {
        await page.locator('input[data-central-search]').first().waitFor({ state:"visible", timeout:10000 });
      } else {
        await page.locator('[data-action="select-inventory-ops"][data-mode="in"]').waitFor({ state:"visible", timeout:10000 });
      }
      await assertNoHorizontalOverflow(page, `${label}-${site}`);
    }
    assert.deepEqual(errors, [], `${label}: page errors: ${errors.join(" | ")}`);
    console.log("MOBILE_ROLE_SITE_ADMIN_OK");
  } finally {
    await context.close();
  }
}

for (const [engineName, engine] of Object.entries(ENGINES)) {
  const selected = CASES.filter((entry) => entry.engine === engineName);
  if (!selected.length) continue;
  const browser = await engine.launch({ headless:true });
  try {
    for (const testCase of selected) await runRoleCase(browser, testCase);
    if (engineName === "chromium") await runAdminMobile(browser);
  } finally {
    await browser.close();
  }
}

console.log("MOBILE_ROLE_SITE_CERTIFICATION_V2_OK");