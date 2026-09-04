import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium, firefox, webkit } from "playwright";
import { ACCOUNT_MODULES } from "../src/account-permissions.js";

const BASE = process.env.TEST_WEB_BASE || "http://127.0.0.1:3000";
const PASSWORD = "KitchenTest!123";
const OUTPUT = path.resolve("tests/artifacts/full-device");
fs.mkdirSync(OUTPUT, { recursive:true });

const ENGINES = { chromium, firefox, webkit };
const CRITICAL_ROUTES = ["dashboard", "inventory", "schedule", "sop", "settings"];

const PROFILES = [
  { name:"chromium-desktop", engine:"chromium", width:1440, height:900, allRoutes:true },
  { name:"firefox-laptop", engine:"firefox", width:1366, height:768, allRoutes:true },
  { name:"webkit-desktop", engine:"webkit", width:1440, height:900, allRoutes:true },
  { name:"chromium-mobile-small", engine:"chromium", width:320, height:568, mobile:true, touch:true },
  { name:"chromium-android", engine:"chromium", width:412, height:915, mobile:true, touch:true },
  { name:"webkit-iphone", engine:"webkit", width:390, height:844, mobile:true, touch:true },
  { name:"webkit-tablet", engine:"webkit", width:820, height:1180, mobile:true, touch:true },
  { name:"chromium-landscape", engine:"chromium", width:844, height:390, mobile:true, touch:true },
];

function safeName(value) {
  return String(value).replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "");
}

async function login(page) {
  await page.goto(BASE + "/", { waitUntil:"domcontentloaded", timeout:30000 });
  await page.waitForFunction(() => document.documentElement.dataset.vpsAuthReady === "true", null, { timeout:15000 });
  const existing = await page.evaluate(() => {
    try { return Boolean(JSON.parse(localStorage.getItem("shitu-kitchen-auth-v1") || "null")?.id); }
    catch { return false; }
  });
  if (!existing) {
    await page.locator('#auth-login-form input[name="username"]').fill("yangchuadmin");
    await page.locator('#auth-login-form input[name="password"]').fill(PASSWORD);
    await page.locator('#auth-login-form button[type="submit"]').click();
  }
  await page.waitForSelector(".app-shell", { timeout:30000 });
  await page.waitForFunction(() => !document.querySelector("#auth-login-form"), null, { timeout:30000 });
}

async function gotoRoute(page, route) {
  await page.goto(`${BASE}/#${route}`, { waitUntil:"domcontentloaded", timeout:30000 });
  await page.waitForSelector(".page-content", { timeout:15000 });
  await page.waitForTimeout(60);
  assert.equal(await page.locator(".access-empty-state").count(), 0, `admin unexpectedly blocked from ${route}`);
}

async function assertGeometry(page, label) {
  const result = await page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const horizontalOverflow = document.documentElement.scrollWidth - viewportWidth;
    const nodes = [...document.querySelectorAll('button,a.nav-item,input:not([type="checkbox"]):not([type="radio"]),select')]
      .filter((node) => {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      });
    const describe = (node, rect, extra = {}) => ({
      tag:node.tagName.toLowerCase(),
      id:node.id || "",
      className:typeof node.className === "string" ? node.className.slice(0,120) : "",
      name:node.getAttribute("name") || "",
      action:node.getAttribute("data-action") || "",
      text:(node.textContent || node.value || "").trim().slice(0,80),
      width:Math.round(rect.width),
      height:Math.round(rect.height),
      ...extra,
    });
    const tooSmall = [];
    const clippedText = [];
    for (const node of nodes.slice(0, 160)) {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      const tag = node.tagName.toLowerCase();
      const text = (node.textContent || node.value || "").trim();
      if (rect.height < 28 || rect.width < 24) {
        tooSmall.push(describe(node, rect));
      }
      const fontSize = Number.parseFloat(style.fontSize || "0");
      if ((tag === "button" || tag === "select" || tag === "input") && fontSize > 0 && fontSize < 12) {
        tooSmall.push(describe(node, rect, { fontSize }));
      }
      if (text.length > 2 && node.scrollWidth > node.clientWidth + 3 && style.overflowX !== "visible") {
        clippedText.push(describe(node, rect, {
          scrollWidth:node.scrollWidth,
          clientWidth:node.clientWidth,
          overflowX:style.overflowX,
          whiteSpace:style.whiteSpace,
        }));
      }
    }
    const visibleModal = [...document.querySelectorAll('.modal,.account-modal,.central-editor-modal,.modal-card')]
      .find((node) => {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      });
    let modal = null;
    if (visibleModal) {
      const rect = visibleModal.getBoundingClientRect();
      modal = {
        ...describe(visibleModal, rect),
        top:Math.round(rect.top),
        left:Math.round(rect.left),
        right:Math.round(rect.right),
        bottom:Math.round(rect.bottom),
        viewportWidth,
        viewportHeight,
      };
    }
    return { horizontalOverflow, viewportWidth, viewportHeight, tooSmall, clippedText, modal };
  });

  const modalOut = Boolean(result.modal && (
    result.modal.top < -1 || result.modal.left < -1 ||
    result.modal.right > result.modal.viewportWidth + 1 ||
    result.modal.bottom > result.modal.viewportHeight + 1
  ));
  if (result.horizontalOverflow > 3 || result.tooSmall.length || result.clippedText.length || modalOut) {
    console.error("FULL_DEVICE_GEOMETRY_FAILURE", JSON.stringify({ label, ...result }));
  }

  assert(result.horizontalOverflow <= 3, `${label}: page horizontally overflows by ${result.horizontalOverflow}px`);
  assert.deepEqual(result.tooSmall, [], `${label}: undersized interactive targets: ${JSON.stringify(result.tooSmall.slice(0,8))}`);
  assert.deepEqual(result.clippedText, [], `${label}: clipped interactive text: ${JSON.stringify(result.clippedText.slice(0,8))}`);
  if (result.modal) {
    assert(result.modal.top >= -1, `${label}: modal starts above viewport (${result.modal.top}px)`);
    assert(result.modal.left >= -1, `${label}: modal starts left of viewport (${result.modal.left}px)`);
    assert(result.modal.right <= result.modal.viewportWidth + 1, `${label}: modal exceeds right viewport edge (${result.modal.right}px)`);
    assert(result.modal.bottom <= result.modal.viewportHeight + 1, `${label}: modal exceeds bottom viewport edge (${result.modal.bottom}px)`);
  }
}

async function selectBranch(page, site="fuxing") {
  await page.evaluate((target) => localStorage.setItem("shitu-admin-active-site-v1", target), site);
  await gotoRoute(page, "inventory");
  const button = page.locator(`[data-warehouse="${site}"]`).first();
  if (await button.count()) await button.click().catch(() => {});
  await page.waitForFunction(() => localStorage.getItem("shitu-inventory-cloud-v2") === "ready", null, { timeout:15000 });
  await page.waitForTimeout(100);
}

async function assertInventoryParity(page, label) {
  await selectBranch(page, "fuxing");
  for (const mode of ["overview","in","pick","transfer","ship","manage","history"]) {
    await page.locator(`[data-action="select-inventory-ops"][data-mode="${mode}"]`).waitFor({ state:"visible", timeout:10000 });
  }
  await assertGeometry(page, `${label} inventory overview`);

  await page.locator('[data-action="select-inventory-ops"][data-mode="manage"]').click();
  const add = page.locator('[data-action="open-add-item"]').first();
  await add.waitFor({ state:"visible", timeout:10000 });
  await add.click();
  await page.locator('form[data-form="add-item"]').waitFor({ state:"visible", timeout:10000 });
  const save = page.locator('.modal-header-save[data-save-item]');
  await save.waitFor({ state:"visible", timeout:10000 });
  await assertGeometry(page, `${label} product modal`);
  await page.locator('button[data-action="close-modal"]').first().click();
  await page.locator(".modal-backdrop").waitFor({ state:"detached", timeout:10000 });

  const longTab = page.locator('[data-action="select-inventory-ops"][data-mode="overview"]').first();
  await longTab.evaluate((node) => {
    node.dataset.originalText = node.textContent || "";
    node.textContent = "庫存總覽與跨分店庫存同步管理 / Tổng quan và đồng bộ tồn kho giữa các chi nhánh";
  });
  await assertGeometry(page, `${label} long bilingual action`);
  await longTab.evaluate((node) => { node.textContent = node.dataset.originalText || ""; });
}

async function assertSettingsModal(page, label) {
  await gotoRoute(page, "settings");
  const edit = page.locator("[data-account-edit]").first();
  await edit.waitFor({ state:"visible", timeout:10000 });
  await edit.click();
  const modal = page.locator(".account-modal");
  await modal.waitFor({ state:"visible", timeout:10000 });
  await assertGeometry(page, `${label} account modal`);
  await modal.locator("[data-account-close]").first().click();
}

async function assertLanguage(page, label) {
  await gotoRoute(page, "dashboard");
  const zh = page.locator('[data-action="set-language"][data-language="zh"]').first();
  const vi = page.locator('[data-action="set-language"][data-language="vi"]').first();
  if (await zh.count()) {
    await zh.click();
    await page.waitForFunction(() => document.documentElement.lang === "zh-Hant");
    await assertGeometry(page, `${label} zh-Hant`);
    await vi.click();
    await page.waitForFunction(() => document.documentElement.lang === "vi");
    await assertGeometry(page, `${label} vi`);
  }
}

async function runProfile(profile) {
  const browserType = ENGINES[profile.engine];
  const browser = await browserType.launch({ headless:true });
  const context = await browser.newContext({
    viewport:{ width:profile.width, height:profile.height },
    isMobile:Boolean(profile.mobile),
    hasTouch:Boolean(profile.touch),
    serviceWorkers:"block",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  try {
    console.log("FULL_DEVICE_PROFILE_START", profile.name);
    await login(page);
    const routes = profile.allRoutes ? ACCOUNT_MODULES : CRITICAL_ROUTES;
    for (const route of routes) {
      console.log("FULL_DEVICE_ROUTE", profile.name, route);
      await gotoRoute(page, route);
      await assertGeometry(page, `${profile.name} ${route}`);
    }

    await assertInventoryParity(page, profile.name);
    await page.screenshot({ path:path.join(OUTPUT, `${safeName(profile.name)}-inventory.png`), fullPage:true });
    await assertSettingsModal(page, profile.name);
    await page.screenshot({ path:path.join(OUTPUT, `${safeName(profile.name)}-settings.png`), fullPage:true });

    if (profile.engine !== "chromium" || profile.mobile) await assertLanguage(page, profile.name);

    if (profile.mobile) {
      await gotoRoute(page, "inventory");
      const before = await page.evaluate(() => location.hash);
      await page.setViewportSize({ width:profile.height, height:profile.width });
      await page.waitForTimeout(100);
      await assertGeometry(page, `${profile.name} rotated`);
      assert.equal(await page.evaluate(() => location.hash), before, `${profile.name}: rotation changed route`);
      assert.equal(await page.locator(".app-shell").count(), 1, `${profile.name}: rotation unmounted application`);
      await page.setViewportSize({ width:profile.width, height:profile.height });
      await page.waitForTimeout(100);
      await assertGeometry(page, `${profile.name} restored orientation`);
    }

    assert.deepEqual(errors, [], `${profile.name}: page errors: ${errors.join(" | ")}`);
    console.log("FULL_DEVICE_PROFILE_OK", profile.name);
  } catch (error) {
    const failurePath = path.join(OUTPUT, `${safeName(profile.name)}-failure.png`);
    await page.screenshot({ path:failurePath, fullPage:true }).catch(() => {});
    console.error("FULL_DEVICE_PROFILE_FAILURE", profile.name, error?.stack || error);
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

for (const profile of PROFILES) await runProfile(profile);
console.log("FULL_DEVICE_REGRESSION_OK");
