import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE = process.env.TEST_WEB_BASE || "http://127.0.0.1:3000";
const PASSWORD = "KitchenTest!123";
const ACTIVE_SITE_KEY = "shitu-admin-active-site-v1";
const SECRET_ERROR = "SENSITIVE_INTERNAL_ERROR_MUST_NOT_RENDER_91c2";
const ROUTES = ["dashboard", "inventory", "procurement", "reservations", "preparation", "menu", "sop", "skills", "attendance", "schedule", "reports", "remote", "settings"];
const VIEWPORTS = [
  { width: 320, height: 740, label: "320px phone" },
  { width: 359, height: 800, label: "359px phone" },
  { width: 390, height: 844, label: "390px phone" },
  { width: 412, height: 915, label: "412px Android" },
  { width: 844, height: 390, label: "phone landscape" },
];

async function login(page) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => document.documentElement.dataset.vpsAuthReady === "true", null, { timeout: 15000 });
  const signedIn = await page.evaluate(() => {
    try { return Boolean(JSON.parse(localStorage.getItem("shitu-kitchen-auth-v1") || "null")?.id); }
    catch { return false; }
  });
  if (!signedIn) {
    await page.locator('#auth-login-form input[name="username"]').fill("yangchuadmin");
    await page.locator('#auth-login-form input[name="password"]').fill(PASSWORD);
    await page.locator('#auth-login-form button[type="submit"]').click();
  }
  await page.waitForSelector(".app-shell", { state: "visible", timeout: 30000 });
}

function emitPersistenceStatus(page, detail) {
  return page.evaluate((next) => {
    window.dispatchEvent(new CustomEvent("shitu:business-persistence-status", { detail: next }));
  }, detail);
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page);

  const userId = await page.evaluate(() => JSON.parse(localStorage.getItem("shitu-kitchen-auth-v1") || "null")?.id || "");
  assert(userId, "persistence-status test user id missing");
  await page.evaluate((key) => localStorage.setItem(key, "fuxing"), ACTIVE_SITE_KEY);

  const status = page.locator("[data-business-persistence-status]");

  await emitPersistenceStatus(page, { status: "pending", userId, site: "fuxing", modules: ["settings"] });
  await status.waitFor({ state: "visible", timeout: 5000 });
  assert.equal(await status.getAttribute("role"), "status", "pending persistence notice must use status semantics");
  assert.match(await status.innerText(), /chưa.*xác nhận|尚未.*確認|VPS/i, "pending persistence notice is not operationally clear");

  await emitPersistenceStatus(page, { status: "saving", userId, site: "fuxing", modules: ["settings"] });
  assert.match(await status.innerText(), /Đang lưu|正在.*儲存|saving/i, "saving persistence notice is missing");
  assert.equal(await status.getAttribute("role"), "status");

  // Unknown internal error strings must not be copied into visible text or DOM attributes/markup.
  await emitPersistenceStatus(page, { status: "error", userId, site: "fuxing", modules: ["settings"], error: SECRET_ERROR });
  assert.equal(await status.getAttribute("role"), "alert", "persistence failure must use alert semantics");
  assert.match(await status.innerText(), /Chưa lưu|尚未.*儲存|PostgreSQL|VPS/i, "persistence failure does not clearly state that the database write is unconfirmed");
  assert.doesNotMatch(await page.locator("body").innerText(), new RegExp(SECRET_ERROR), "raw persistence error text leaked into the UI");
  assert.doesNotMatch(await page.content(), new RegExp(SECRET_ERROR), "raw persistence error text leaked into DOM markup or attributes");
  const errorText = await status.innerText();

  // A read-only state event must not falsely clear a write failure.
  await page.evaluate(({ userId: currentUserId }) => {
    window.dispatchEvent(new CustomEvent("shitu:business-state-status", {
      detail: { status: "ready", userId: currentUserId, site: "fuxing" },
    }));
  }, { userId });
  assert.equal(await status.innerText(), errorText, "read/ready event cleared an unresolved persistence error");
  assert.equal(await status.getAttribute("role"), "alert");

  // Foreign account status must be ignored on a shared browser.
  await emitPersistenceStatus(page, { status: "saved", userId: "other-user", site: "fuxing", modules: ["settings"] });
  assert.equal(await status.innerText(), errorText, "foreign user's persistence event changed current user's status");

  // Only a confirmed save for the current exact scope resolves the error.
  await emitPersistenceStatus(page, { status: "saved", userId, site: "fuxing", modules: ["settings"] });
  assert.match(await status.innerText(), /Đã lưu|已儲存|saved/i, "confirmed persistence success is not visible");
  assert.equal(await status.getAttribute("role"), "status");

  // The notice is global and survives whole-shell route rerenders while its state is unresolved/current.
  await emitPersistenceStatus(page, { status: "error", userId, site: "fuxing", modules: ["settings"], error: "BUSINESS_STATE_OFFLINE" });
  for (const route of ROUTES) {
    await page.evaluate((nextRoute) => { window.location.hash = nextRoute; }, route);
    await page.waitForFunction((nextRoute) => window.location.hash === `#${nextRoute}`, route, { timeout: 5000 });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.locator(".page-content > [data-business-persistence-status]").waitFor({ state: "visible", timeout: 5000 });
  }

  // Mandatory responsive contract.
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.waitForTimeout(80);
    const geometry = await page.evaluate(() => {
      const node = document.querySelector("[data-business-persistence-status]");
      const rect = node?.getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        left: rect?.left ?? -999,
        right: rect?.right ?? 9999,
        width: rect?.width ?? 0,
        viewport: window.innerWidth,
      };
    });
    assert(geometry.overflow <= 3, `persistence notice caused ${geometry.overflow}px horizontal overflow at ${viewport.label}`);
    assert(geometry.width > 0, `persistence notice disappeared at ${viewport.label}`);
    assert(geometry.left >= -1 && geometry.right <= geometry.viewport + 1, `persistence notice escaped ${viewport.label}: ${JSON.stringify(geometry)}`);
  }

  // Moving to another admin site must hide the previous site's status rather than carrying it over.
  await page.evaluate((key) => {
    localStorage.setItem(key, "yongji");
    window.dispatchEvent(new CustomEvent("shitu:active-site-changed", { detail: { site: "yongji" } }));
  }, ACTIVE_SITE_KEY);
  await page.waitForTimeout(50);
  assert.equal(await page.locator("[data-business-persistence-status]").count(), 0, "Fuxing persistence error leaked into Yongji scope");

  assert.deepEqual(errors, [], `persistence status browser errors: ${errors.join(" | ")}`);
  await context.close();
  console.log("BUSINESS_PERSISTENCE_STATUS_BROWSER_OK");
} finally {
  await browser.close();
}
