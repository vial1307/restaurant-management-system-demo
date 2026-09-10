import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createStore } from "../src/store-core.js";
import { hydrateOperations } from "../src/operations.js";
import { businessModulesFromState } from "../src/business-state-sync.js";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const source = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
for (const obsolete of [
  ".github/workflows/port-system-recent-fixes.yml",
  "scripts/port-system-recent-fixes.py",
  "scripts/port-system-recent-fixes-v2.py",
]) {
  assert.equal(fs.existsSync(path.join(ROOT, obsolete)), false, `${obsolete} must not return; system-demo is the sole production source`);
}
const memoryStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
};

const storage = memoryStorage();
const store = createStore(storage);
store.saveGeneralSettings({
  organizationName: "食徒",
  branchName: "永吉店",
  employeeName: "成南",
  workstation: "麵台",
  reservationBuffer: "3",
  riceWeekday: "2100",
  riceWeekend: "3200",
  riceSkipAbove: "1800",
});
assert.equal(store.getState().settings.branchName, "永吉店");
assert.equal(store.getState().settings.riceWeekend, 3200);
const modules = businessModulesFromState(store.getState());
assert.equal(modules.settings.organizationName, "食徒");
assert.equal(modules.settings.branchName, "永吉店");
assert.equal(Object.hasOwn(modules.settings, "employeeName"), false, "operator name must remain local/profile state");
assert.equal(Object.hasOwn(modules.settings, "workstation"), false, "workstation must remain local/profile state");

store.saveStaff({ id: "staff-manager", name: "Default manager", role: "parttime", area: "soup", hourlyRate: 230, active: false });
const permanent = store.getState().operations.staff.find((member) => member.id === "staff-manager");
assert.equal(permanent.role, "manager");
assert.equal(permanent.active, true);

const recovered = hydrateOperations({
  staff: [{ id: "staff-manager", name: "Recovered", role: "parttime", area: "noodles", hourlyRate: 230, active: false, pin: "1234" }],
  activeStaffId: "staff-manager",
  operationsManagerRecoveryVersion: 0,
}, { employeeName: "阿南" });
assert.equal(recovered.staff[0].role, "manager");
assert.equal(recovered.staff[0].active, true);
assert.equal(recovered.staff[0].pin, "");

const app = source("src/app.js");
assert.match(app, /data-action="toggle-mobile-menu"/);
assert.match(app, /data-form="save-general-settings"/);
assert.match(app, /shitu:business-persistence-status/);
assert.match(app, /modules\.includes\("settings"\)/);
const workAreaSelectStart = app.indexOf('<select name="workArea">');
const workAreaSelectClose = app.indexOf("</select>", workAreaSelectStart);
const workAreaGuide = app.indexOf('<small class="ingredient-form-guide">', workAreaSelectStart);
assert.ok(workAreaSelectStart >= 0, "ingredient modal workstation select must exist");
assert.ok(workAreaSelectClose > workAreaSelectStart && workAreaSelectClose < workAreaGuide, "ingredient modal workstation select must close before its guide and stocktake fields");
assert.match(source("src/styles.css"), /\.mobile-menu-grid/);
assert.match(source("docs/SYSTEM_SPECIFICATION.md"), /successful shared save only after the VPS confirms/);

await import("./business-module-permission-contract.mjs");
await import("./catalog-stocktake-boundary-regression.mjs");
await import("./central-stocktake-boundary-regression.mjs");
await import("./branch-work-minimum-stocktake-regression.mjs");
await import("./receiving-default-permission-contract.mjs");
await import("./inventory-date-cache-regression.mjs");
await import("./action-feedback-contract-regression.mjs");
await import("./workforce-module-contract-regression.mjs");
