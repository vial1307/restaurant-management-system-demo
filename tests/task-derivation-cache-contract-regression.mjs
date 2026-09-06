import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
const helper = await readFile(new URL("../src/task-derivation-cache.js", import.meta.url), "utf8");

assert.match(app, /import \{ createTaskDerivationCache \} from "\.\/task-derivation-cache\.js";/, "app must import the task derivation cache helper");
assert.match(app, /const taskDerivationCache = createTaskDerivationCache\(\{[\s\S]*deriveTasks:[\s\S]*buildGeneratedTasks\(state, date\)[\s\S]*record\.customTasks[\s\S]*summarizeProgress:[\s\S]*completionSummary/s, "app must create one shared task/progress cache using the existing derivation functions");
assert.match(app, /tasks:\(\) => taskDerivationCache\.tasks\(state, state\.selectedDate\)/, "currentContext tasks getter must read through the cross-render task cache");
assert.match(app, /progress:\(\) => taskDerivationCache\.progress\(state, state\.selectedDate\)/, "currentContext progress getter must read through the cross-render progress cache");
assert.doesNotMatch(app, /tasks:\(\) => \[\.\.\.buildGeneratedTasks\(state, state\.selectedDate\), \.\.\.record\.customTasks\]/, "currentContext must not directly rebuild tasks on every render");
assert.doesNotMatch(app, /progress:\(\) => completionSummary\(context\.tasks, record\.completedTasks\)/, "currentContext must not directly resummarize progress on every render");

assert.match(helper, /export function taskDerivationFingerprint\(/, "helper must expose the deterministic task dependency fingerprint for regression coverage");
assert.match(helper, /record\.reservation/, "fingerprint must include reservation input");
assert.match(helper, /record\.riceRemaining/, "fingerprint must include rice remaining input");
assert.match(helper, /record\.inventory/, "fingerprint must include reserve inventory input");
assert.match(helper, /record\.workInventory/, "fingerprint must include work inventory input");
assert.match(helper, /record\.customTasks/, "fingerprint must include custom tasks");
assert.match(helper, /settings\.reservationBuffer/, "fingerprint must include reservation buffer");
assert.match(helper, /settings\.riceWeekday/, "fingerprint must include weekday rice rule");
assert.match(helper, /settings\.riceWeekend/, "fingerprint must include weekend rice rule");
assert.match(helper, /settings\.riceSkipAbove/, "fingerprint must include rice skip threshold");
assert.match(helper, /settings\.checklist/, "fingerprint must include checklist rules");
assert.doesNotMatch(helper, /updatedAt/, "task fingerprint must ignore record.updatedAt churn");
assert.doesNotMatch(helper, /attendance|schedules|audit/, "task fingerprint must ignore unrelated operations state");
assert.doesNotMatch(helper, /new Map\s*\(/, "task derivation cache must remain single-entry rather than growing by history");
assert.match(helper, /let taskKey = null/, "single-entry task cache key must be explicit");
assert.match(helper, /let progressKey = null/, "single-entry progress cache key must be explicit");
assert.match(helper, /function clear\(\)/, "cache must expose an explicit clear path");

console.log("TASK_DERIVATION_CACHE_CONTRACT_OK");
