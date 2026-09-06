import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const storeCore = await readFile(new URL("../src/store-core.js", import.meta.url), "utf8");
const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

const selectDateStart = storeCore.indexOf("selectDate(date) {");
const selectDateEnd = storeCore.indexOf("\n    updateSetting", selectDateStart);
assert.ok(selectDateStart >= 0 && selectDateEnd > selectDateStart, "selectDate() must remain locatable");
const selectDateSource = storeCore.slice(selectDateStart, selectDateEnd);
assert.match(selectDateSource, /if\s*\(\s*state\.selectedDate\s*===\s*date\s*\)\s*return\s+state/, "same-date selectDate must return before generic update persistence");
assert.match(selectDateSource, /return\s+update\s*\(/, "real date changes must retain the normal update lifecycle");

const serviceDateStart = app.indexOf("function selectServiceDate(date) {");
const serviceDateEnd = app.indexOf("\nconst management =", serviceDateStart);
assert.ok(serviceDateStart >= 0 && serviceDateEnd > serviceDateStart, "selectServiceDate() must remain locatable");
const source = app.slice(serviceDateStart, serviceDateEnd);

const detectionIndex = source.search(/const\s+sameDate\s*=\s*store\.getState\(\)\.selectedDate\s*===\s*date/);
const selectIndex = source.indexOf("store.selectDate(date)");
const renderIndex = source.search(/if\s*\(\s*sameDate\s*\)\s*renderWhenAuthorized\s*\(\s*\)/);
assert.ok(detectionIndex >= 0, "selectServiceDate must capture same-date state before store selection");
assert.ok(selectIndex > detectionIndex, "store.selectDate must run after same-date detection");
assert.ok(renderIndex > selectIndex, "same-date explicit render must run after store.selectDate");
assert.equal((source.match(/renderWhenAuthorized\s*\(\s*\)/g) || []).length, 1, "selectServiceDate must have exactly one explicit render path so real date changes do not render twice");
assert.match(source, /if\s*\(\s*date\s*===\s*formatDateKey\(\)\s*&&\s*route\(\)\s*===\s*["']inventory["']\s*\)/, "inventory-today cloud synchronization condition must remain intact");

console.log("SELECT_DATE_NOOP_UI_LIFECYCLE_OK");
