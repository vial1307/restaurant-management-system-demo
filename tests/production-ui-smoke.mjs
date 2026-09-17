import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE = process.env.PRODUCTION_BASE || "https://82.47.180.185.nip.io";
const EXPECTED_RELEASE = String(process.env.EXPECTED_RELEASE || "").trim().slice(0, 7);
const RECOVERY_SECRET = "PRODUCTION_RECOVERY_PAYLOAD_MUST_NOT_RENDER";
const admin = {
  id: "production-ui-smoke-admin",
  username: "ui-smoke-admin",
  displayName: "Production UI Smoke",
  display_name: "Production UI Smoke",
  role: "admin",
  location: "all",
  permissions: {},
  preferredLanguage: "vi",
  preferred_language: "vi",
  active: true,
};
const sites = [
  { code:"central", name_vi:"Bếp trung tâm", name_zh_tw:"央廚", sort_order:10, metadata:{ inventory_mode:"central" } },
  { code:"fuxing", name_vi:"Fuxing", name_zh_tw:"復興店", sort_order:20, metadata:{ inventory_mode:"branch" } },
  { code:"yongji", name_vi:"Yongji", name_zh_tw:"永吉店", sort_order:30, metadata:{ inventory_mode:"branch" } },
];
function masterData(siteCode) {
  const site = sites.find((entry) => entry.code === siteCode);
  const branch = site?.metadata?.inventory_mode === "branch";
  const storageLocations = branch
    ? [
        { code:`${siteCode}-large-freezer`, site:siteCode, kind:"storage", sort_order:10, active:true, name_zh_tw:"大冷凍", name_vi:"Tủ đông lớn", metadata:{ ui_key:"large-freezer", storage_group:"primary" } },
        { code:`${siteCode}-large-fridge`, site:siteCode, kind:"storage", sort_order:20, active:true, name_zh_tw:"大冷藏", name_vi:"Tủ mát lớn", metadata:{ ui_key:"large-fridge", storage_group:"primary" } },
        { code:`${siteCode}-four-door`, site:siteCode, kind:"storage", sort_order:30, active:true, name_zh_tw:"四門冰箱", name_vi:"Tủ lạnh 4 cánh", metadata:{ ui_key:"four-door", storage_group:"service" } },
        { code:`${siteCode}-kitchen`, site:siteCode, kind:"storage", sort_order:40, active:true, name_zh_tw:"廚房冰箱", name_vi:"Tủ lạnh bếp", metadata:{ ui_key:"kitchen", storage_group:"service" } },
      ]
    : [
        { code:"central-freezer", site:siteCode, kind:"storage", sort_order:10, active:true, name_zh_tw:"央廚冷凍", name_vi:"Tủ đông bếp trung tâm", metadata:{ ui_key:"央廚冷凍", storage_group:"primary" } },
        { code:"central-fridge", site:siteCode, kind:"storage", sort_order:20, active:true, name_zh_tw:"央廚冷藏", name_vi:"Tủ mát bếp trung tâm", metadata:{ ui_key:"央廚冷藏", storage_group:"primary" } },
        { code:"central-four-door", site:siteCode, kind:"storage", sort_order:30, active:true, name_zh_tw:"央廚4門", name_vi:"Tủ lạnh 4 cánh bếp trung tâm", metadata:{ ui_key:"央廚4門", storage_group:"service" } },
        { code:"central-chest", site:siteCode, kind:"storage", sort_order:40, active:true, name_zh_tw:"央廚臥櫃", name_vi:"Tủ đông nằm bếp trung tâm", metadata:{ ui_key:"央廚臥櫃", storage_group:"service" } },
      ];
  const workAreas = ["noodles","soup","seafood","meat"].map((code, index) => ({
    code, site_code:siteCode, name_zh_tw:code, name_vi:code, sort_order:(index + 1) * 10, active:true, metadata:{},
  }));
  const workLocations = branch
    ? workAreas.map((area, index) => ({
        code:`${siteCode}-work-${area.code}`, site:siteCode, kind:"work", sort_order:100 + index * 10, active:true,
        name_zh_tw:area.name_zh_tw, name_vi:area.name_vi, metadata:{ ui_key:area.code, work_area:area.code },
      }))
    : [];
  return { site, locations:[...storageLocations, ...workLocations], workAreas, departments:[], permissions:{ manageAll:true, manageLocations:true, manageWorkAreas:true } };
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  const page = await context.newPage();

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/auth/me") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: admin }) });
      return;
    }
    if (url.pathname === "/api/admin/users") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ users: [admin] }) });
      return;
    }
    if (url.pathname === "/api/inventory/schema-version") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ version: 12 }) });
      return;
    }
    if (url.pathname === "/api/inventory/sites") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sites }) });
      return;
    }
    const masterMatch = url.pathname.match(/^\/api\/master-data\/(central|fuxing|yongji)$/);
    if (masterMatch) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(masterData(masterMatch[1])) });
      return;
    }
    if (url.pathname === "/api/inventory/receive-defaults") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ defaults: [] }) });
      return;
    }
    if (/^\/api\/inventory\/(central|fuxing|yongji)$/.test(url.pathname)) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ locations: [], stock: [], items: [] }) });
      return;
    }
    if (/^\/api\/business-state\/(central|fuxing|yongji)$/.test(url.pathname)) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ revision: 0, moduleRevisions: {}, modules: {} }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await page.addInitScript(({ user, recoverySecret }) => {
    localStorage.setItem("shitu-kitchen-auth-v1", JSON.stringify({
      id: user.id,
      username: user.username,
      name: user.displayName,
      role: "admin",
      accountRole: "admin",
      location: "all",
      permissions: {},
      preferredLanguage: "vi",
      provider: "production-smoke",
    }));
    if (!localStorage.getItem("shitu-admin-active-site-v1")) {
      localStorage.setItem("shitu-admin-active-site-v1", "fuxing");
    }
    localStorage.setItem("shitu-central-kitchen-stock-v1", JSON.stringify([{
      id: "smoke-beef@central-freezer",
      baseId: "smoke-beef",
      itemKey: "central:smoke-beef",
      catalogKey: "smoke-beef",
      zh: "牛肉",
      vi: "Thịt bò",
      unit: "包",
      workArea: "meat",
      zone: "央廚冷凍",
      qty: 10,
      minimum: 2,
    }]));
    localStorage.setItem("shitu-business-recovery-v1", JSON.stringify({
      version: 1,
      drafts: {
        [`${user.id}:fuxing`]: {
          userId: user.id,
          site: "fuxing",
          capturedAt: "2026-09-06T04:00:00.000Z",
          changedModules: ["settings"],
          reason: "authorization-transition",
          modules: { settings: { recoverySecret } },
        },
      },
    }));
  }, { user: admin, recoverySecret: RECOVERY_SECRET });

  await page.goto(`${BASE}/#settings`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.locator("[data-account-edit]").first().waitFor({ state: "visible", timeout: 30000 });
  const recoveryBanner = page.locator("[data-business-recovery-banner]");
  await recoveryBanner.waitFor({ state: "visible", timeout: 10000 });
  assert.match(await recoveryBanner.innerText(), /Fuxing|復興|fuxing/i, "Production recovery banner does not identify the source site");
  assert.match(await recoveryBanner.innerText(), /settings/i, "Production recovery banner does not identify changed module metadata");
  assert.doesNotMatch(await page.locator("body").innerText(), new RegExp(RECOVERY_SECRET), "Production recovery banner leaked stored business payload");

  await page.evaluate((userId) => {
    window.dispatchEvent(new CustomEvent("shitu:business-persistence-status", {
      detail: {
        status: "error",
        userId,
        site: "fuxing",
        modules: ["settings"],
        error: "BUSINESS_STATE_CONFLICT",
      },
    }));
  }, admin.id);
  const persistenceStatus = page.locator("[data-business-persistence-status]");
  await persistenceStatus.waitFor({ state: "visible", timeout: 10000 });
  assert.equal(await persistenceStatus.getAttribute("role"), "alert", "Production persistence failure is not exposed as an alert");
  assert.match(await persistenceStatus.innerText(), /thiết bị|người dùng khác|chặn ghi đè|PostgreSQL/i, "Production conflict warning does not explain the blocked overwrite");
  assert.equal(
    await recoveryBanner.evaluate((node) => node.nextElementSibling?.matches("[data-business-persistence-status]") || false),
    true,
    "Production persistence warning displaced the higher-priority recovery banner"
  );

  const canonical = new URL(page.url());
  assert.equal(canonical.pathname, "/", "Production did not stay on the canonical root URL");
  assert.equal(canonical.search, "", "Production root still requires a release query parameter");
  const release = await page.locator('meta[name="kitchen-release"]').getAttribute("content");
  if (!new URL(BASE).hostname.match(/^(?:127\.0\.0\.1|localhost)$/)) {
    assert(release && release !== "__KITCHEN_RELEASE__", "Production HTML was not stamped with a release");
    if (EXPECTED_RELEASE) {
      assert.equal(release, EXPECTED_RELEASE, `Production UI release ${release} does not match tested commit ${EXPECTED_RELEASE}`);
    }
    const assetVersions = await page.locator('script[src],link[rel="stylesheet"][href]').evaluateAll((elements) =>
      elements.map((element) => new URL(element.src || element.href).searchParams.get("v"))
    );
    assert(assetVersions.length > 0 && assetVersions.every((version) => version === release), "Production mobile assets do not match the deployed release");
  }
  await page.locator("[data-account-edit]").first().click();
  const modal = page.locator(".account-modal");
  await modal.waitFor({ state: "visible", timeout: 10000 });

  const modules = await modal.locator(".permission-row").evaluateAll((rows) =>
    rows.map((row) => ({
      module: row.getAttribute("data-permission-module"),
      label: row.querySelector(":scope > span")?.textContent?.trim() || "",
    }))
  );
  assert.equal(modules[0]?.module, "dashboard", "Production modal does not render dashboard first");
  assert.match(modules[0]?.label || "", /Tổng quan|總覽/, "Production dashboard label is missing");
  assert.equal(await modal.locator('input[name="perm:dashboard:view"]').count(), 1);
  assert.equal(await modal.locator('input[name="perm:dashboard:edit"]').count(), 1);
  await modal.locator("[data-account-close]").first().click();

  await page.goto(`${BASE}/#attendance`, { waitUntil: "domcontentloaded", timeout: 30000 });
  const workforceTabs = page.locator("[data-workforce-tabs]");
  await workforceTabs.waitFor({ state: "visible", timeout: 10000 });
  assert.equal(await workforceTabs.locator("a").count(), 3, "Production workforce does not expose attendance, schedule and payroll tabs");
  assert((await page.locator('a.nav-item[href="#attendance"]:visible').count()) >= 1, "Merged workforce navigation entry is not visible on production mobile");
  const legacyScheduleStates = await page.locator('a.nav-item[href="#schedule"]').evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return {
      ariaHidden: node.getAttribute("aria-hidden"),
      tabIndex: node.tabIndex,
      width: rect.width,
      height: rect.height,
      pointerEvents: style.pointerEvents,
    };
  }));
  assert(legacyScheduleStates.length >= 1, "Production legacy schedule route is missing from compatibility DOM");
  for (const state of legacyScheduleStates) {
    assert.equal(state.ariaHidden, "true", "Legacy schedule route is exposed to accessibility navigation");
    assert.equal(state.tabIndex, -1, "Legacy schedule route remains keyboard-focusable");
    assert.equal(state.pointerEvents, "none", "Legacy schedule route remains pointer-interactive");
    assert.equal(state.width, 0, "Legacy schedule route has visible horizontal geometry");
    assert.equal(state.height, 0, "Legacy schedule route has visible vertical geometry");
  }
  await page.locator("[data-workforce-manager-day]").waitFor({ state: "visible", timeout: 10000 });

  await page.goto(`${BASE}/#attendance?workforce=payroll`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.locator("[data-workforce-payroll-panel]").waitFor({ state: "visible", timeout: 10000 });
  assert.equal(await page.locator('[data-workforce-tabs] a[href="#attendance?workforce=payroll"].active').count(), 1, "Production payroll tab is not active on the canonical payroll route");

  await page.goto(`${BASE}/#schedule`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.locator("[data-workforce-tabs]").waitFor({ state: "visible", timeout: 10000 });
  assert.equal(await page.locator('[data-workforce-tabs] a[href="#schedule"].active').count(), 1, "Production legacy schedule route is not reconciled into the workforce tab");
  const publicationStatus = page.locator("[data-workforce-publication-status]");
  await publicationStatus.waitFor({ state: "visible", timeout: 10000 });
  assert.match(await publicationStatus.innerText(), /publish|phiên bản|相容|發布/i, "Production schedule page does not expose publication status");
  const publishButton = page.locator("[data-workforce-schedule-publish]");
  await publishButton.waitFor({ state: "visible", timeout: 10000 });
  assert.equal(await publishButton.count(), 1, "Production schedule page does not expose a single manager publish control");
  const scheduleRulesButton = page.locator("[data-workforce-schedule-rules-open]");
  await scheduleRulesButton.waitFor({ state: "visible", timeout: 10000 });
  await scheduleRulesButton.click();
  const scheduleRulesModal = page.locator("[data-workforce-schedule-rules-modal]");
  await scheduleRulesModal.waitFor({ state: "visible", timeout: 10000 });
  assert.equal(await scheduleRulesModal.locator(".workforce-schedule-rule-card").count(), 3, "Production schedule rules editor is missing shift windows");
  assert.equal(await scheduleRulesModal.locator(".workforce-staffing-band").count(), 4, "Production schedule rules editor is missing staffing bands");
  await scheduleRulesModal.locator("[data-workforce-schedule-rules-close]").first().click();

  await page.evaluate(() => localStorage.setItem("shitu-admin-active-site-v1", "fuxing"));
  await page.goto(`${BASE}/#inventory`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => localStorage.getItem("shitu-inventory-cloud-v2") === "ready", null, { timeout: 10000 });
  for (const mode of ["overview", "in", "pick", "transfer", "ship", "manage", "history"]) {
    await page.locator(`[data-action="select-inventory-ops"][data-mode="${mode}"]`).waitFor({ state: "visible", timeout: 10000 });
  }
  await page.locator('[data-action="select-inventory-ops"][data-mode="in"]').click();
  await page.locator('[data-branch-inventory-operations][data-mode="in"]').waitFor({ state: "visible", timeout: 10000 });
  assert.equal(await page.locator(".inventory-history-notice").count(), 0, "A mobile inventory action did not return to today's live data");
  await page.locator('[data-action="select-inventory-ops"][data-mode="manage"]').click();
  await page.locator('[data-action="open-add-item"]').first().click();
  await page.locator('.modal-header-save[data-save-item]').waitFor({ state: "visible", timeout: 10000 });
  await page.locator('button[data-action="close-modal"]').first().click();

  await page.evaluate(() => localStorage.setItem("shitu-admin-active-site-v1", "central"));
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
  for (const mode of ["overview", "in", "pick", "transfer", "ship", "manage", "history"]) {
    await page.locator(`[data-central-mode="${mode}"]`).waitFor({ state: "visible", timeout: 10000 });
  }
  await page.locator('[data-central-mode="manage"]').click();
  await page.locator('[data-central-editor-open="new"]').click();
  await page.locator('.modal-header-save[data-central-save-item]').waitFor({ state: "visible", timeout: 10000 });

  console.log("PRODUCTION_PERMISSION_ROWS", JSON.stringify(modules));
  console.log("PRODUCTION_RECOVERY_NOTICE_OK");
  console.log("PRODUCTION_BUSINESS_CONFLICT_NOTICE_OK");
  console.log("PRODUCTION_WORKFORCE_PUBLICATION_UI_OK");
  console.log("PRODUCTION_WORKFORCE_MOBILE_OK");
  console.log("PRODUCTION_MOBILE_FUNCTIONS_OK", release);
  console.log("PRODUCTION_UI_SMOKE_OK", await page.url());
  await context.close();
} finally {
  await browser.close();
}
