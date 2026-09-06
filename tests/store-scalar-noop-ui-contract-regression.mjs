import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const storeCore = await readFile(new URL("../src/store-core.js", import.meta.url), "utf8");
const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

const selectDateStart = storeCore.indexOf("selectDate(date) {");
const selectDateEnd = storeCore.indexOf("\n    updateSetting", selectDateStart);
assert.ok(selectDateStart >= 0 && selectDateEnd > selectDateStart, "selectDate() must remain locatable");
const selectDateSource = storeCore.slice(selectDateStart, selectDateEnd);
assert.match(selectDateSource, /state\.selectedDate\s*===\s*date[\s\S]*return\s+state/, "same-date selectDate must return before generic update persistence");
assert.match(selectDateSource, /return\s+update\s*\(/, "real date changes must retain the normal update lifecycle");

const serviceDateStart = app.indexOf("function selectServiceDate(date) {");
const serviceDateEnd = app.indexOf("\nconst management =", serviceDateStart);
assert.ok(serviceDateStart >= 0 && serviceDateEnd > serviceDateStart, "selectServiceDate() must remain locatable");
const serviceDateSource = app.slice(serviceDateStart, serviceDateEnd);
assert.match(serviceDateSource, /const\s+(?:sameDate|unchanged|alreadySelected)\s*=\s*store\.getState\(\)\.selectedDate\s*===\s*date/, "selectServiceDate must detect same-date view-only transitions before calling the store");
assert.match(serviceDateSource, /store\.selectDate\(date\)/, "selectServiceDate must retain normal store date selection");
assert.match(serviceDateSource, /if\s*\(\s*(?:sameDate|unchanged|alreadySelected)\s*\)\s*renderWhenAuthorized\s*\(\s*\)/, "same-date calendar close must explicitly render without a fake store notification");

console.log("STORE_SCALAR_NOOP_UI_CONTRACT_OK");
