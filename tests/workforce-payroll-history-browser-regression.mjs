import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";

const WEB = process.env.TEST_WEB_BASE || "http://127.0.0.1:3000";
const PASSWORD = "KitchenTest!123";
const MONTH = "2038-07";

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

async function openPayroll(page) {
  await page.goto(`${WEB}/#attendance?workforce=payroll`, { waitUntil:"domcontentloaded" });
  await page.locator("[data-workforce-payroll-panel]").waitFor({ state:"visible", timeout:30000 });
  const month = page.locator("[data-workforce-payroll-month]");
  await month.fill(MONTH);
  await month.dispatchEvent("change");
  await page.locator(`[data-workforce-payroll-history][data-month="${MONTH}"]`).waitFor({ state:"visible", timeout:30000 });
}

const browser = await chromium.launch({ headless:true });
try {
  const managerContext = await browser.newContext({ viewport:{ width:1365, height:900 }, acceptDownloads:true });
  const managerPage = await managerContext.newPage();
  const managerErrors = [];
  managerPage.on("pageerror", (error) => managerErrors.push(error.message));
  await browserLogin(managerPage, "managerfx");
  await openPayroll(managerPage);

  assert.equal(await managerPage.locator('[data-payroll-history-revision="2"]').count(), 1, "manager r2 history missing");
  assert.equal(await managerPage.locator('[data-payroll-history-revision="1"]').count(), 1, "manager r1 history missing");
  assert.equal(await managerPage.locator('[data-payroll-history-revision="2"][data-current="true"]').count(), 1, "r2 must be marked current");
  assert.equal(await managerPage.locator("[data-payroll-history-export]").count(), 2, "manager export controls missing");
  const r2Text = await managerPage.locator('[data-payroll-history-revision="2"]').innerText();
  assert.match(r2Text, /3[,.]?000/, "r2 net total missing from manager UI");
  assert.deepEqual(managerErrors, [], `manager payroll history page errors: ${managerErrors.join(" | ")}`);

  const [download] = await Promise.all([
    managerPage.waitForEvent("download"),
    managerPage.locator('[data-payroll-history-export="2"]').click(),
  ]);
  assert.equal(download.suggestedFilename(), `payroll-fuxing-${MONTH}-r2.csv`);
  const downloadPath = await download.path();
  assert(downloadPath, "CSV download path missing");
  const csv = await fs.readFile(downloadPath, "utf8");
  assert(csv.startsWith("\uFEFF"), "CSV export must include UTF-8 BOM");
  assert.match(csv, /"revision","2"/);
  assert.match(csv, /"payroll-history-employee"/);
  assert.match(csv, /"payroll-history-parttime"/);
  assert.match(csv, /"3000"/, "stored r2 total missing from CSV");
  await managerContext.close();

  const mobileContext = await browser.newContext({ viewport:{ width:390, height:844 } });
  const mobilePage = await mobileContext.newPage();
  const mobileErrors = [];
  mobilePage.on("pageerror", (error) => mobileErrors.push(error.message));
  await browserLogin(mobilePage, "managerfx");
  await openPayroll(mobilePage);
  assert.equal(await mobilePage.locator('[data-payroll-history-revision="2"]').count(), 1, "mobile manager r2 history missing");
  const noPageOverflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
  assert.equal(noPageOverflow, true, "payroll history caused mobile page horizontal overflow");
  assert.deepEqual(mobileErrors, [], `mobile payroll history page errors: ${mobileErrors.join(" | ")}`);
  await mobileContext.close();

  const supervisorContext = await browser.newContext({ viewport:{ width:390, height:844 } });
  const supervisorPage = await supervisorContext.newPage();
  await browserLogin(supervisorPage, "supervisorfx");
  await supervisorPage.goto(`${WEB}/#attendance?workforce=payroll`, { waitUntil:"domcontentloaded" });
  await supervisorPage.locator("[data-workforce-payroll-panel]").waitFor({ state:"visible", timeout:30000 });
  assert.equal(await supervisorPage.locator("[data-workforce-payroll-history]").count(), 0, "supervisor must not receive payroll history UI");
  assert.equal(await supervisorPage.locator("[data-payroll-history-export]").count(), 0, "supervisor must not receive payroll export controls");
  await supervisorContext.close();

  const employeeContext = await browser.newContext({ viewport:{ width:390, height:844 } });
  const employeePage = await employeeContext.newPage();
  await browserLogin(employeePage, "employeefx");
  await employeePage.goto(`${WEB}/#attendance?workforce=payroll`, { waitUntil:"domcontentloaded" });
  await employeePage.locator("[data-workforce-payroll-panel]").waitFor({ state:"visible", timeout:30000 });
  assert.equal(await employeePage.locator("[data-workforce-payroll-history]").count(), 0, "employee must not receive manager payroll history UI");
  await employeeContext.close();
} finally {
  await browser.close();
}

console.log("WORKFORCE_PAYROLL_HISTORY_BROWSER_REGRESSION_OK");
