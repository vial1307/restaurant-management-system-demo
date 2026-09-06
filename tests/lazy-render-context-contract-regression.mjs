import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
const taskCache = await readFile(new URL("../src/task-derivation-cache.js", import.meta.url), "utf8");

assert.match(app, /import\s*\{\s*defineLazyDerivedProperties\s*\}\s*from\s*["']\.\/lazy-derived-context\.js["']/, "app must use the dedicated lazy derived context helper");

const contextStart = app.indexOf("function currentContext()");
const contextEnd = app.indexOf("\nfunction navItem", contextStart);
assert.ok(contextStart >= 0 && contextEnd > contextStart, "currentContext function must remain locatable before navItem");
const source = app.slice(contextStart, contextEnd);

for (const eager of ["state", "record", "language", "text"]) {
  assert.match(source, new RegExp(`\\b${eager}\\b`), `currentContext must retain eager base field ${eager}`);
}

assert.match(source, /defineLazyDerivedProperties\s*\(\s*context\s*,\s*\{/, "currentContext must register derived properties lazily");
for (const key of ["reservations", "rice", "tasks", "progress", "reserves", "alerts", "workAlerts", "reserveAlerts", "capacity"]) {
  assert.match(source, new RegExp(`\\b${key}\\s*:`), `currentContext must lazily define ${key}`);
}

assert.match(source, /tasks\s*:\s*\(\)\s*=>\s*taskDerivationCache\.tasks\s*\(\s*state\s*,\s*state\.selectedDate\s*\)/, "tasks must remain lazy while using the cross-render task cache");
assert.match(source, /progress\s*:\s*\(\)\s*=>\s*taskDerivationCache\.progress\s*\(\s*state\s*,\s*state\.selectedDate\s*\)/, "progress must remain lazy while using the cross-render progress cache");
assert.match(taskCache, /function progress\(state, date\)[\s\S]*const currentTasks = tasks\(state, date\);[\s\S]*summarizeProgress\(currentTasks, completedTasks\)/, "cached progress must still derive from the memoized task value");
assert.match(source, /workAlerts\s*:\s*\(\)\s*=>\s*context\.alerts\.filter/, "workAlerts must derive from memoized lazy alerts");
assert.match(source, /reserveAlerts\s*:\s*\(\)\s*=>\s*context\.alerts\.filter/, "reserveAlerts must derive from memoized lazy alerts");

assert.doesNotMatch(source, /const\s+reservations\s*=\s*calculateReservations/, "reservations must no longer be calculated eagerly");
assert.doesNotMatch(source, /const\s+rice\s*=\s*calculateRice/, "rice must no longer be calculated eagerly");
assert.doesNotMatch(source, /const\s+alerts\s*=\s*buildInventoryAlerts/, "alerts must no longer be calculated eagerly");
assert.doesNotMatch(source, /const\s+capacity\s*=\s*assessShiftCapacity/, "capacity must no longer be calculated eagerly");

console.log("LAZY_RENDER_CONTEXT_CONTRACT_OK");
