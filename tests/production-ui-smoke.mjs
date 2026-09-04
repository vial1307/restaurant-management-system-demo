import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE = process.env.PRODUCTION_BASE || "https://82.47.180.185.nip.io";
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
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await page.addInitScript((user) => {
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
  }, admin);

  await page.goto(`${BASE}/#settings`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.locator("[data-account-edit]").first().waitFor({ state: "visible", timeout: 30000 });
  const canonical = new URL(page.url());
  assert.equal(canonical.pathname, "/", "Production did not stay on the canonical root URL");
  assert.equal(canonical.search, "", "Production root still requires a release query parameter");
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

  console.log("PRODUCTION_PERMISSION_ROWS", JSON.stringify(modules));
  console.log("PRODUCTION_UI_SMOKE_OK", await page.url());
  await context.close();
} finally {
  await browser.close();
}
