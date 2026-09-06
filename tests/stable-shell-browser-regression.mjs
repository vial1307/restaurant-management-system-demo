import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE = process.env.TEST_WEB_BASE || "http://127.0.0.1:3000";
const PASSWORD = "KitchenTest!123";

async function login(page) {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.vpsAuthReady === "true", null, { timeout: 10000 });
  await page.locator('#auth-login-form input[name="username"]').fill("yangchuadmin");
  await page.locator('#auth-login-form input[name="password"]').fill(PASSWORD);
  await page.locator('#auth-login-form button[type="submit"]').click();
  await page.waitForSelector(".app-shell", { timeout: 30000 });
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page);

  await page.evaluate(() => {
    globalThis.__stableShellRefs = {
      appShell: document.querySelector(".app-shell"),
      mainShell: document.querySelector(".main-shell"),
      page: document.querySelector(".page-content"),
    };
  });

  const shellIdentity = async () => page.evaluate(() => ({
    app: document.querySelector(".app-shell") === globalThis.__stableShellRefs.appShell,
    main: document.querySelector(".main-shell") === globalThis.__stableShellRefs.mainShell,
    pageSame: document.querySelector(".page-content") === globalThis.__stableShellRefs.page,
  }));

  const calendarToggle = page.locator('[data-action="toggle-calendar"]').first();
  await calendarToggle.click();
  await page.locator(".calendar-popover").waitFor({ state: "visible" });
  let identity = await shellIdentity();
  assert.equal(identity.app, true, "render-only calendar interaction must preserve .app-shell identity");
  assert.equal(identity.main, true, "render-only calendar interaction must preserve .main-shell identity");

  await page.locator('[data-action="toggle-calendar"]').first().click();
  await page.locator(".calendar-popover").waitFor({ state: "hidden" });
  identity = await shellIdentity();
  assert.equal(identity.app, true, "closing calendar must preserve .app-shell identity");
  assert.equal(identity.main, true, "closing calendar must preserve .main-shell identity");

  await page.locator('[data-action="shift-date"][data-offset="1"]').first().click();
  identity = await shellIdentity();
  assert.equal(identity.app, true, "store-backed date mutation must preserve .app-shell identity");
  assert.equal(identity.main, true, "store-backed date mutation must preserve .main-shell identity");

  await page.locator('.mobile-nav .nav-item[href="#settings"]').click();
  await page.waitForFunction(() => location.hash.replace(/^#\/?/, "").split("?")[0] === "settings");
  identity = await shellIdentity();
  assert.equal(identity.app, true, "route navigation must preserve .app-shell identity");
  assert.equal(identity.main, true, "route navigation must preserve .main-shell identity");
  assert.equal(identity.pageSame, false, "route navigation may replace page content in the first stable-shell slice");

  const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  assert(overflow <= 3, `stable shell mobile overflow regression: ${overflow}px`);
  assert.deepEqual(errors, [], `stable shell page errors: ${errors.join(" | ")}`);

  console.log("STABLE_SHELL_BROWSER_REGRESSION_OK");
  await context.close();
} finally {
  await browser.close();
}
