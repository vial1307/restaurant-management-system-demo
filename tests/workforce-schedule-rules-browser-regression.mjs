import assert from "node:assert/strict";
import { chromium } from "playwright";

const API = process.env.TEST_API_BASE || "http://127.0.0.1:8080";
const WEB = process.env.TEST_WEB_BASE || "http://127.0.0.1:3000";
const PASSWORD = "KitchenTest!123";
const SITE = "fuxing";
const DATE = "2038-06-05";

const BROWSER_RULES = {
  shifts:{
    morning:{ start:"09:00", end:"15:00" },
    evening:{ start:"17:00", end:"23:00" },
    full:{ start:"09:00", end:"23:00" },
  },
  staffingBands:[
    { minTables:0, maxTables:1, requiredInside:1, fixedAreas:false, needsReview:true },
    { minTables:2, maxTables:4, requiredInside:2, fixedAreas:false, needsReview:false },
    { minTables:5, maxTables:8, requiredInside:3, fixedAreas:true, needsReview:false },
    { minTables:9, maxTables:null, requiredInside:4, fixedAreas:true, needsReview:true },
  ],
};

async function request(path, { method="GET", body, cookie } = {}) {
  const response = await fetch(API + path, {
    method,
    headers:{
      ...(body === undefined ? {} : { "content-type":"application/json" }),
      ...(cookie ? { cookie } : {}),
    },
    body:body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await response.json(); } catch {}
  return { response, data, cookie:response.headers.get("set-cookie")?.split(";")[0] || "" };
}

async function apiLogin(username) {
  const result = await request("/api/auth/login", { method:"POST", body:{ username, password:PASSWORD } });
  assert.equal(result.response.status, 200, `API login failed for ${username}: ${JSON.stringify(result.data)}`);
  return result.cookie;
}

async function seed() {
  const manager = await apiLogin("managerfx");
  const rules = await request(`/api/workforce/${SITE}/schedule-rules`, { method:"POST", cookie:manager, body:BROWSER_RULES });
  assert.equal(rules.response.status, 200, `browser rule seed failed: ${JSON.stringify(rules.data)}`);

  const state = await request(`/api/business-state/${SITE}`, { cookie:manager });
  assert.equal(state.response.status, 200);
  const reservations = structuredClone(state.data.modules.reservations || { records:{} });
  reservations.records ??= {};
  reservations.records[DATE] = {
    ...(reservations.records[DATE] || {}),
    reservation:{ lunchTables:0, dinnerTables:5, remaining:{ vegetables:0, braised:0, hotpot:0 } },
    riceRemaining:0,
    updatedAt:null,
  };
  const revision = state.data.moduleRevisions.reservations;
  assert(Number.isInteger(revision), "reservation module revision missing");
  const saved = await request(`/api/business-state/${SITE}`, {
    method:"POST",
    cookie:manager,
    body:{ modules:{ reservations }, expectedModuleRevisions:{ reservations:revision } },
  });
  assert.equal(saved.response.status, 200, `browser reservation seed failed: ${JSON.stringify(saved.data)}`);
}

async function browserLogin(page, username) {
  await page.goto(WEB + "/", { waitUntil:"domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.vpsAuthReady === "true", null, { timeout:10000 });
  await page.locator('#auth-login-form input[name="username"]').fill(username);
  await page.locator('#auth-login-form input[name="password"]').fill(PASSWORD);
  await page.locator('#auth-login-form button[type="submit"]').click();
  await page.waitForFunction(() => {
    try { return Boolean(JSON.parse(localStorage.getItem("shitu-kitchen-auth-v1") || "null")?.id); }
    catch { return false; }
  }, null, { timeout:30000 });
  await page.waitForSelector(".app-shell", { timeout:30000 });
}

async function openSchedule(page) {
  await page.goto(`${WEB}/#schedule`, { waitUntil:"domcontentloaded" });
  await page.waitForFunction(() => location.hash.replace(/^#\/?/, "").split("?")[0] === "schedule", null, { timeout:10000 });
  await page.locator(".schedule-calendar").waitFor({ state:"visible", timeout:30000 });
}

await seed();
const browser = await chromium.launch({ headless:true });
try {
  const managerContext = await browser.newContext({ viewport:{ width:1365, height:900 } });
  const managerPage = await managerContext.newPage();
  const managerErrors = [];
  managerPage.on("pageerror", (error) => managerErrors.push(error.message));
  await browserLogin(managerPage, "managerfx");
  await openSchedule(managerPage);
  await managerPage.locator('[data-field="schedule-month"]').fill(DATE.slice(0, 7));
  await managerPage.locator(`.schedule-day[data-date="${DATE}"]`).click();
  await managerPage.locator("[data-workforce-schedule-rules-open]").waitFor({ state:"visible", timeout:30000 });

  const eveningOption = managerPage.locator('[data-field="schedule-shift"] option[value="evening"]');
  await managerPage.waitForFunction(() => document.querySelector('[data-field="schedule-shift"] option[value="evening"]')?.textContent?.includes("17:00–23:00"), null, { timeout:30000 });
  assert.match(await eveningOption.textContent(), /17:00–23:00/, "configured evening label missing");
  await managerPage.waitForFunction(() => document.querySelector(".capacity-numbers > div:nth-child(2) strong")?.textContent === "0/3", null, { timeout:30000 });

  await managerPage.locator("[data-workforce-schedule-rules-open]").click();
  const editor = managerPage.locator("[data-workforce-schedule-rules-modal]");
  await editor.waitFor({ state:"visible", timeout:10000 });
  assert.equal(await editor.locator('[name="evening:start"]').inputValue(), "17:00");
  assert.equal(await editor.locator('[name="evening:end"]').inputValue(), "23:00");
  await editor.locator('[name="evening:start"]').fill("18:00");
  await editor.locator('[name="band:2:required"]').fill("4");
  await editor.locator('button[type="submit"]').click();
  await editor.waitFor({ state:"detached", timeout:30000 });
  await managerPage.waitForFunction(() => document.querySelector('[data-field="schedule-shift"] option[value="evening"]')?.textContent?.includes("18:00–23:00"), null, { timeout:30000 });
  await managerPage.waitForFunction(() => document.querySelector(".capacity-numbers > div:nth-child(2) strong")?.textContent === "0/4", null, { timeout:30000 });

  await managerPage.locator('[data-action="schedule-add"]').click();
  const scheduleForm = managerPage.locator('form[data-form="save-schedule"]');
  await scheduleForm.waitFor({ state:"visible", timeout:10000 });
  assert.equal(await scheduleForm.locator('select[name="shift"]').inputValue(), "evening");
  await managerPage.waitForFunction(() => document.querySelector('form[data-form="save-schedule"] input[name="start"]')?.value === "18:00", null, { timeout:10000 });
  assert.equal(await scheduleForm.locator('input[name="end"]').inputValue(), "23:00", "new schedule end must use configured default");
  await managerPage.locator('[data-action="management-close"] .icon-button').click();
  assert.deepEqual(managerErrors, [], `manager schedule rules errors: ${managerErrors.join(" | ")}`);
  await managerContext.close();

  const mobileContext = await browser.newContext({ viewport:{ width:390, height:844 } });
  const mobilePage = await mobileContext.newPage();
  const mobileErrors = [];
  mobilePage.on("pageerror", (error) => mobileErrors.push(error.message));
  await browserLogin(mobilePage, "managerfx");
  await openSchedule(mobilePage);
  await mobilePage.locator("[data-workforce-schedule-rules-open]").waitFor({ state:"visible", timeout:30000 });
  await mobilePage.locator("[data-workforce-schedule-rules-open]").click();
  const mobileEditor = mobilePage.locator("[data-workforce-schedule-rules-modal] .workforce-schedule-rules-modal");
  await mobileEditor.waitFor({ state:"visible", timeout:10000 });
  const box = await mobileEditor.boundingBox();
  assert(box, "mobile rule editor bounding box missing");
  assert(box.x >= -1 && box.x + box.width <= 391, `mobile rule editor overflows viewport: ${JSON.stringify(box)}`);
  assert.equal(await mobileEditor.locator('[name="evening:start"]').inputValue(), "18:00");
  assert.deepEqual(mobileErrors, [], `mobile manager schedule rules errors: ${mobileErrors.join(" | ")}`);
  await mobileContext.close();

  for (const username of ["supervisorfx", "employeefx", "parttimefx"]) {
    const context = await browser.newContext({ viewport:{ width:390, height:844 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await browserLogin(page, username);
    await openSchedule(page);
    await page.waitForTimeout(800);
    assert.equal(await page.locator("[data-workforce-schedule-rules-open]").count(), 0, `${username} must not receive schedule-rule editor control`);
    assert.deepEqual(errors, [], `${username} schedule page errors: ${errors.join(" | ")}`);
    await context.close();
  }
} finally {
  await browser.close();
}

console.log("WORKFORCE_SCHEDULE_RULES_BROWSER_OK");
