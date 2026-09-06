import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

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

assert.match(source, /progress\s*:\s*\(\)\s*=>\s*completionSummary\s*\(\s*context\.tasks\s*,\s*record\.completedTasks\s*\)/, "progress must derive from the memoized lazy tasks value");
assert.match(source, /workAlerts\s*:\s*\(\)\s*=>\s*context\.alerts\.filter/, "workAlerts must derive from memoized lazy alerts");
assert.match(source, /reserveAlerts\s*:\s*\(\)\s*=>\s*context\.alerts\.filter/, "reserveAlerts must derive from memoized lazy alerts");

assert.doesNotMatch(source, /const\s+reservations\s*=\s*calculateReservations/, "reservations must no longer be calculated eagerly");
assert.doesNotMatch(source, /const\s+rice\s*=\s*calculateRice/, "rice must no longer be calculated eagerly");
assert.doesNotMatch(source, /const\s+alerts\s*=\s*buildInventoryAlerts/, "alerts must no longer be calculated eagerly");
assert.doesNotMatch(source, /const\s+capacity\s*=\s*assessShiftCapacity/, "capacity must no longer be calculated eagerly");

console.log("LAZY_RENDER_CONTEXT_CONTRACT_OK");
