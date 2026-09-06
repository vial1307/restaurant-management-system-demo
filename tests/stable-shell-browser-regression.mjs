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
      sidebar: document.querySelector(".sidebar"),
      page: document.querySelector(".page-content"),
      mobileNav: document.querySelector(".mobile-nav"),
    };
  });

  const shellIdentity = async () => page.evaluate(() => ({
    app: document.querySelector(".app-shell") === globalThis.__stableShellRefs.appShell,
    main: document.querySelector(".main-shell") === globalThis.__stableShellRefs.mainShell,
    sidebarSame: document.querySelector(".sidebar") === globalThis.__stableShellRefs.sidebar,
    pageSame: document.querySelector(".page-content") === globalThis.__stableShellRefs.page,
    mobileNavSame: document.querySelector(".mobile-nav") === globalThis.__stableShellRefs.mobileNav,
  }));

  const calendarToggle = page.locator('[data-action="toggle-calendar"]').first();
  await calendarToggle.click();
  await page.locator(".calendar-popover").waitFor({ state: "visible" });
  let identity = await shellIdentity();
  assert.equal(identity.app, true, "render-only calendar interaction must preserve .app-shell identity");
  assert.equal(identity.main, true, "render-only calendar interaction must preserve .main-shell identity");
  assert.equal(identity.sidebarSame, true, "calendar-only render must preserve unchanged sidebar node identity");
  assert.equal(identity.pageSame, true, "calendar-only render must preserve unchanged page node identity");
  assert.equal(identity.mobileNavSame, true, "calendar-only render must preserve unchanged mobile-nav node identity");

  await page.locator(".calendar-popover .calendar-day.selected").click();
  await page.locator(".calendar-popover").waitFor({ state: "hidden" });
  identity = await shellIdentity();
  assert.equal(identity.app, true, "calendar day selection must preserve .app-shell identity");
  assert.equal(identity.main, true, "calendar day selection must preserve .main-shell identity");
  assert.equal(identity.sidebarSame, true, "closing calendar without changing task output must preserve sidebar identity");
  assert.equal(identity.pageSame, true, "closing calendar without changing route output must preserve page identity");
  assert.equal(identity.mobileNavSame, true, "closing calendar must preserve unchanged mobile-nav identity");

  await page.locator('[data-action="shift-date"][data-offset="1"]').first().click();
  identity = await shellIdentity();
  assert.equal(identity.app, true, "store-backed date mutation must preserve .app-shell identity");
  assert.equal(identity.main, true, "store-backed date mutation must preserve .main-shell identity");

  await page.locator('.mobile-nav .nav-item[href="#settings"]').click();
  await page.waitForFunction(() => location.hash.replace(/^#\/?/, "").split("?")[0] === "settings");
  identity = await shellIdentity();
  assert.equal(identity.app, true, "route navigation must preserve .app-shell identity");
  assert.equal(identity.main, true, "route navigation must preserve .main-shell identity");
  assert.equal(identity.pageSame, false, "route navigation may replace page content in the stable-shell architecture");

  await page.locator('.mobile-nav .nav-item[href="#inventory"]').click();
  await page.waitForFunction(() => location.hash.replace(/^#\/?/, "").split("?")[0] === "inventory");
  await page.waitForSelector('[data-action="open-add-item"]', { timeout: 15000 });
  const beforeModal = await page.evaluate(() => ({
    appShell: document.querySelector(".app-shell"),
    mainShell: document.querySelector(".main-shell"),
  }));
  await page.locator('[data-action="open-add-item"]').first().click();
  await page.locator(".ingredient-modal").waitFor({ state: "visible", timeout: 15000 });
  const modalIdentity = await page.evaluate(() => ({
    appSame: document.querySelector(".app-shell") === globalThis.__stableShellRefs.appShell,
    mainSame: document.querySelector(".main-shell") === globalThis.__stableShellRefs.mainShell,
    modalCount: document.querySelectorAll(".ingredient-modal").length,
  }));
  assert.equal(modalIdentity.appSame, true, "opening root overlay must preserve .app-shell identity");
  assert.equal(modalIdentity.mainSame, true, "opening root overlay must preserve .main-shell identity");
  assert.equal(modalIdentity.modalCount, 1, "opening add-item overlay must create exactly one ingredient modal");
  void beforeModal;

  await page.locator('.ingredient-modal [data-action="close-modal"]').first().click();
  await page.locator(".ingredient-modal").waitFor({ state: "detached", timeout: 15000 });
  const afterModal = await page.evaluate(() => ({
    appSame: document.querySelector(".app-shell") === globalThis.__stableShellRefs.appShell,
    mainSame: document.querySelector(".main-shell") === globalThis.__stableShellRefs.mainShell,
    modalCount: document.querySelectorAll(".ingredient-modal").length,
  }));
  assert.equal(afterModal.appSame, true, "closing root overlay must preserve .app-shell identity");
  assert.equal(afterModal.mainSame, true, "closing root overlay must preserve .main-shell identity");
  assert.equal(afterModal.modalCount, 0, "closing add-item overlay must not leave orphan modal DOM");

  for (const width of [320, 359, 390, 412]) {
    await page.setViewportSize({ width, height: 844 });
    const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
    assert(overflow <= 3, `stable section render mobile overflow regression at ${width}px: ${overflow}px`);
  }

  assert.deepEqual(errors, [], `stable shell page errors: ${errors.join(" | ")}`);

  console.log("STABLE_SHELL_BROWSER_REGRESSION_OK");
  await context.close();
} finally {
  await browser.close();
}
