import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE = process.env.TEST_WEB_BASE || "http://127.0.0.1:3000";
const PASSWORD = "KitchenTest!123";
const RECOVERY_KEY = "shitu-business-recovery-v1";
const SECRET_MARKER = "RECOVERY_PAYLOAD_MUST_NOT_RENDER_7f3d";

async function login(page) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => document.documentElement.dataset.vpsAuthReady === "true", null, { timeout: 15000 });
  const alreadySignedIn = await page.evaluate(() => {
    try { return Boolean(JSON.parse(localStorage.getItem("shitu-kitchen-auth-v1") || "null")?.id); }
    catch { return false; }
  });
  if (!alreadySignedIn) {
    await page.locator('#auth-login-form input[name="username"]').fill("yangchuadmin");
    await page.locator('#auth-login-form input[name="password"]').fill(PASSWORD);
    await page.locator('#auth-login-form button[type="submit"]').click();
  }
  await page.waitForSelector(".app-shell", { state: "visible", timeout: 30000 });
  await page.waitForFunction(() => !document.querySelector("#auth-login-form"), null, { timeout: 30000 });
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page);

  const userId = await page.evaluate(() => JSON.parse(localStorage.getItem("shitu-kitchen-auth-v1") || "null")?.id || "");
  assert(userId, "signed-in test user id missing");

  await page.evaluate(({ recoveryKey, userId, secretMarker }) => {
    localStorage.setItem(recoveryKey, JSON.stringify({
      version: 1,
      drafts: {
        [`${userId}:fuxing`]: {
          userId,
          site: "fuxing",
          capturedAt: "2026-09-06T04:00:00.000Z",
          baseRevision: 12,
          changedModules: ["settings"],
          reason: "authorization-transition",
          modules: {
            settings: {
              reservationBuffer: 77,
              secretMarker,
            },
          },
        },
      },
    }));
  }, { recoveryKey: RECOVERY_KEY, userId, secretMarker: SECRET_MARKER });

  await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(".app-shell", { state: "visible", timeout: 30000 });
  const banner = page.locator("[data-business-recovery-banner]");
  await banner.waitFor({ state: "visible", timeout: 10000 });
  const bannerText = await banner.innerText();
  assert.match(bannerText, /Fuxing|復興|fuxing/i, "recovery notice does not identify the original Fuxing site");
  assert.match(bannerText, /settings/i, "recovery notice does not identify the dirty module");
  assert.doesNotMatch(await page.locator("body").innerText(), new RegExp(SECRET_MARKER), "recovery notice leaked recovery payload content into the UI");

  // The notice is derived from durable local recovery state, not one ephemeral event.
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(".app-shell", { state: "visible", timeout: 30000 });
  await page.locator("[data-business-recovery-banner]").waitFor({ state: "visible", timeout: 10000 });

  // Mandatory mobile breakpoint: no horizontal overflow and the banner stays inside the viewport.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  const geometry = await page.evaluate(() => {
    const banner = document.querySelector("[data-business-recovery-banner]");
    const rect = banner?.getBoundingClientRect();
    return {
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      left: rect?.left ?? -999,
      right: rect?.right ?? 9999,
      width: rect?.width ?? 0,
      viewport: window.innerWidth,
    };
  });
  assert(geometry.overflow <= 3, `recovery notice caused ${geometry.overflow}px horizontal overflow on mobile`);
  assert(geometry.width > 0, "recovery notice disappeared at 390px mobile width");
  assert(geometry.left >= -1 && geometry.right <= geometry.viewport + 1, `recovery notice escaped mobile viewport: ${JSON.stringify(geometry)}`);

  // Recovery metadata from another account on the same browser must stay hidden.
  await page.evaluate(({ recoveryKey }) => {
    localStorage.setItem(recoveryKey, JSON.stringify({
      version: 1,
      drafts: {
        "other-user:fuxing": {
          userId: "other-user",
          site: "fuxing",
          capturedAt: "2026-09-06T04:10:00.000Z",
          changedModules: ["settings"],
          reason: "authorization-transition",
          modules: { settings: { privateValue: "FOREIGN_RECOVERY" } },
        },
      },
    }));
  }, { recoveryKey: RECOVERY_KEY });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(".app-shell", { state: "visible", timeout: 30000 });
  assert.equal(await page.locator("[data-business-recovery-banner]").count(), 0, "recovery notice exposed another user's draft metadata");

  assert.deepEqual(errors, [], `recovery notice browser errors: ${errors.join(" | ")}`);
  await context.close();
  console.log("BUSINESS_RECOVERY_NOTICE_BROWSER_OK");
} finally {
  await browser.close();
}
