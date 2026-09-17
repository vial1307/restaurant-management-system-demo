import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium, webkit } from "playwright";

let BASE = process.env.TEST_WEB_BASE || "http://127.0.0.1:3000";
if (BASE === "http://localhost:3000") BASE = "http://127.0.0.1:3000";
const PASSWORD = "KitchenTest!123";
const OUTPUT = path.resolve("tests/artifacts/full-device");
fs.mkdirSync(OUTPUT, { recursive:true });

const PROFILES = [
  { name:"superadmin-mobile-small", engine:"chromium", width:320, height:568, mobile:true, touch:true },
  { name:"superadmin-iphone", engine:"webkit", width:390, height:844, mobile:true, touch:true },
  { name:"superadmin-android", engine:"chromium", width:412, height:915, mobile:true, touch:true },
  { name:"superadmin-tablet", engine:"webkit", width:820, height:1180, mobile:true, touch:true },
  { name:"superadmin-laptop", engine:"chromium", width:1366, height:768 },
  { name:"superadmin-desktop", engine:"chromium", width:1440, height:900 },
];

const ENGINES = { chromium, webkit };

async function login(context, username) {
  const response = await context.request.post(`${BASE}/api/auth/login`, {
    data:{ username, password:PASSWORD },
    failOnStatusCode:false,
  });
  assert.equal(response.status(), 200, `${username}: login failed with HTTP ${response.status()}`);
}

async function assertFit(page, label) {
  const result = await page.evaluate(() => {
    const viewportWidth = innerWidth;
    const viewportHeight = innerHeight;
    const pageOverflow = Math.max(0, document.documentElement.scrollWidth - viewportWidth);
    const modal = document.querySelector(".sa-modal");
    let modalRect = null;
    if (modal) {
      const rect = modal.getBoundingClientRect();
      modalRect = { top:rect.top,left:rect.left,right:rect.right,bottom:rect.bottom };
    }
    const smallTargets = [...document.querySelectorAll("button,a,input,select")]
      .filter((node) => {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        if (style.display === "none" || style.visibility === "hidden" || node.disabled) return false;
        if (rect.width <= 0 || rect.height <= 0) return false;
        return rect.height < 28 || rect.width < 24;
      })
      .slice(0,12)
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return { tag:node.tagName.toLowerCase(), text:(node.textContent || node.value || "").trim().slice(0,60), width:Math.round(rect.width), height:Math.round(rect.height) };
      });
    return { viewportWidth, viewportHeight, pageOverflow, modalRect, smallTargets };
  });

  assert(result.pageOverflow <= 3, `${label}: page overflow ${result.pageOverflow}px`);
  assert.deepEqual(result.smallTargets, [], `${label}: undersized controls ${JSON.stringify(result.smallTargets)}`);
  if (result.modalRect) {
    assert(result.modalRect.left >= -1, `${label}: modal exceeds left edge`);
    assert(result.modalRect.top >= -1, `${label}: modal exceeds top edge`);
    assert(result.modalRect.right <= result.viewportWidth + 1, `${label}: modal exceeds right edge`);
    assert(result.modalRect.bottom <= result.viewportHeight + 1, `${label}: modal exceeds bottom edge`);
  }
}

async function gotoSection(page, section) {
  const button = page.locator(`[data-section="${section}"]`);
  await button.waitFor({ state:"visible", timeout:15000 });
  await button.click();
  await page.waitForFunction((target) => location.hash === `#${target}`, section, { timeout:10000 });
  await page.waitForTimeout(120);
}

async function runSuperAdminProfile(profile) {
  const browser = await ENGINES[profile.engine].launch({ headless:true });
  const context = await browser.newContext({
    viewport:{ width:profile.width, height:profile.height },
    isMobile:Boolean(profile.mobile),
    hasTouch:Boolean(profile.touch),
    serviceWorkers:"block",
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  try {
    console.log("SUPER_ADMIN_DEVICE_START", profile.name);
    await login(context, "yangchuadmin");
    await page.goto(`${BASE}/.admindev.html#overview`, { waitUntil:"domcontentloaded", timeout:30000 });
    await page.locator("#admin-app.sa-app").waitFor({ state:"visible", timeout:20000 });
    assert.equal(await page.locator(".sa-nav-item").count(), 7, `${profile.name}: expected seven Super Admin sections`);
    await assertFit(page, `${profile.name} overview`);

    if (profile.mobile) {
      const menu = page.locator("[data-toggle-nav]");
      await menu.waitFor({ state:"visible", timeout:10000 });
      await menu.click();
      await page.waitForFunction(() => document.querySelector("#admin-app")?.classList.contains("nav-open"));
      await menu.click();
    }

    await gotoSection(page, "users");
    await page.locator("[data-user-new]").click();
    await page.locator(".sa-modal").waitFor({ state:"visible", timeout:10000 });
    assert((await page.locator(".sa-permission-row").count()) > 0, `${profile.name}: permission matrix did not render`);
    await assertFit(page, `${profile.name} user modal`);
    await page.locator("[data-modal-close]").click();

    await gotoSection(page, "data");
    await page.locator(".sa-table-wrap").first().waitFor({ state:"visible", timeout:15000 });
    await assertFit(page, `${profile.name} data tables`);

    await gotoSection(page, "stores");
    await page.locator("[data-super-transfer-form]").waitFor({ state:"visible", timeout:20000 });
    await assertFit(page, `${profile.name} stores`);

    await gotoSection(page, "settings");
    await assertFit(page, `${profile.name} settings`);
    await gotoSection(page, "logs");
    await assertFit(page, `${profile.name} logs`);

    if (profile.mobile) {
      await page.setViewportSize({ width:profile.height, height:profile.width });
      await page.waitForTimeout(100);
      await assertFit(page, `${profile.name} landscape`);
      await page.setViewportSize({ width:profile.width, height:profile.height });
    }

    assert.deepEqual(pageErrors, [], `${profile.name}: page errors ${pageErrors.join(" | ")}`);
    await page.screenshot({ path:path.join(OUTPUT, `${profile.name}.png`), fullPage:true });
    console.log("SUPER_ADMIN_DEVICE_OK", profile.name);
  } catch (error) {
    await page.screenshot({ path:path.join(OUTPUT, `${profile.name}-failure.png`), fullPage:true }).catch(() => {});
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

for (const profile of PROFILES) await runSuperAdminProfile(profile);

const browser = await chromium.launch({ headless:true });
try {
  const context = await browser.newContext({ viewport:{ width:390, height:844 } });
  const page = await context.newPage();
  await login(context, "managerfx");
  await page.goto(`${BASE}/.admindev.html`, { waitUntil:"domcontentloaded", timeout:30000 });
  await page.locator(".sa-gate").waitFor({ state:"visible", timeout:15000 });
  assert.match(await page.locator(".sa-gate h1").textContent(), /Super Admin only/i);
  assert.equal(await page.locator(".sa-sidebar").count(), 0, "ordinary manager must not receive Super Admin navigation");
  await context.close();
} finally {
  await browser.close();
}

console.log("SUPER_ADMIN_PANEL_BROWSER_REGRESSION_OK");
