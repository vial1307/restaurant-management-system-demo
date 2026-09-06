import assert from "node:assert/strict";
import { createTaskDerivationCache, taskDerivationFingerprint } from "../src/task-derivation-cache.js";

const date = "2026-09-06";
const state = {
  selectedDate: date,
  settings: {
    reservationBuffer: 2,
    riceWeekday: 2000,
    riceWeekend: 3000,
    riceSkipAbove: 2000,
    checklist: [{ id: "check-open", title: "Open" }],
    language: "vi",
  },
  records: {
    [date]: {
      reservation: { lunchTables: 2, dinnerTables: 3, remaining: { vegetables: 1, braised: 1, hotpot: 1 } },
      riceRemaining: 500,
      inventory: [{ id: "stock-a", stockKey: "a", label: "A", quantity: 3, minimum: 5, unit: "包", zone: "large-freezer", workArea: "noodles" }],
      workInventory: [{ id: "work-a", stockKey: "a", label: "A", quantity: 1, minimum: 2, unit: "包", workArea: "noodles" }],
      customTasks: [{ id: "custom-1", title: "Custom" }],
      completedTasks: {},
      updatedAt: "2026-09-06T00:00:00.000Z",
    },
    "2026-09-07": {
      reservation: { lunchTables: 0, dinnerTables: 0, remaining: {} },
      riceRemaining: 0,
      inventory: [],
      workInventory: [],
      customTasks: [],
      completedTasks: {},
      updatedAt: "2026-09-07T00:00:00.000Z",
    },
  },
  operations: { attendance: [], schedules: [], audit: [], activeStaffId: "staff-a" },
};

let deriveCalls = 0;
let summaryCalls = 0;
const cache = createTaskDerivationCache({
  deriveTasks(currentState, currentDate) {
    deriveCalls += 1;
    const record = currentState.records[currentDate];
    return [
      { id: `generated-${currentDate}`, marker: `${record.reservation.lunchTables}:${record.riceRemaining}:${record.inventory.length}:${currentState.settings.checklist.length}` },
      ...record.customTasks,
    ];
  },
  summarizeProgress(tasks, completedTasks) {
    summaryCalls += 1;
    const done = tasks.filter((task) => Boolean(completedTasks[task.id])).length;
    return { total: tasks.length, done, pending: tasks.length - done, percentage: tasks.length ? Math.round((done / tasks.length) * 100) : 100 };
  },
});

const originalFingerprint = taskDerivationFingerprint(state, date);
const firstTasks = cache.tasks(state, date);
assert.equal(deriveCalls, 1, "first task read must derive once");
assert.strictEqual(cache.tasks(state, date), firstTasks, "unchanged task dependencies must reuse the same task array");
assert.equal(deriveCalls, 1, "unchanged second task read must not derive again");

const firstProgress = cache.progress(state, date);
assert.equal(summaryCalls, 1, "first progress read must summarize once");
assert.strictEqual(cache.progress(state, date), firstProgress, "unchanged progress dependencies must reuse the same progress object");
assert.equal(summaryCalls, 1, "unchanged second progress read must not summarize again");

state.operations.attendance.push({ id: "attendance-1" });
state.operations.schedules.push({ id: "schedule-1" });
state.operations.audit.push({ id: "audit-1" });
state.records[date].updatedAt = "2026-09-06T01:00:00.000Z";
assert.equal(taskDerivationFingerprint(state, date), originalFingerprint, "unrelated operations and record.updatedAt must not affect the task fingerprint");
assert.strictEqual(cache.tasks(state, date), firstTasks, "in-place unrelated store mutations must not invalidate tasks");
assert.equal(deriveCalls, 1, "attendance/schedule/audit mutations must not rederive tasks");
assert.strictEqual(cache.progress(state, date), firstProgress, "unrelated mutations must not invalidate progress");
assert.equal(summaryCalls, 1, "unrelated mutations must not resummarize progress");

state.records[date].completedTasks["generated-2026-09-06"] = true;
const completedProgress = cache.progress(state, date);
assert.equal(deriveCalls, 1, "completed-task changes must not invalidate the task list");
assert.equal(summaryCalls, 2, "completed-task changes must invalidate progress");
assert.equal(completedProgress.done, 1, "progress must reflect completed task changes");

async function expectTaskInvalidation(label, mutate) {
  const priorTasks = cache.tasks(state, date);
  const priorDeriveCalls = deriveCalls;
  const priorSummaryCalls = summaryCalls;
  mutate();
  const nextTasks = cache.tasks(state, date);
  assert.notStrictEqual(nextTasks, priorTasks, `${label} must invalidate the cached task array`);
  assert.equal(deriveCalls, priorDeriveCalls + 1, `${label} must call the task factory exactly once`);
  cache.progress(state, date);
  assert.equal(summaryCalls, priorSummaryCalls + 1, `${label} task invalidation must invalidate progress too`);
}

await expectTaskInvalidation("reservation mutation", () => { state.records[date].reservation.lunchTables += 1; });
await expectTaskInvalidation("rice mutation", () => { state.records[date].riceRemaining += 100; });
await expectTaskInvalidation("inventory mutation", () => { state.records[date].inventory[0].quantity += 1; });
await expectTaskInvalidation("work inventory mutation", () => { state.records[date].workInventory[0].minimum += 1; });
await expectTaskInvalidation("custom task mutation", () => { state.records[date].customTasks.push({ id: "custom-2", title: "Second" }); });
await expectTaskInvalidation("checklist mutation", () => { state.settings.checklist.push({ id: "check-close", title: "Close" }); });

const beforeDateSwitch = deriveCalls;
const otherDateTasks = cache.tasks(state, "2026-09-07");
assert.equal(deriveCalls, beforeDateSwitch + 1, "changing service date must invalidate tasks");
assert.equal(otherDateTasks[0].id, "generated-2026-09-07", "date-specific task output must come from the new date");

cache.clear();
const beforeClear = deriveCalls;
cache.tasks(state, "2026-09-07");
assert.equal(deriveCalls, beforeClear + 1, "clear() must force task recomputation");

let taskAttempts = 0;
const retryTaskCache = createTaskDerivationCache({
  deriveTasks() {
    taskAttempts += 1;
    if (taskAttempts === 1) throw new Error("task factory failed");
    return [{ id: "ok" }];
  },
  summarizeProgress: () => ({ total: 1, done: 0, pending: 1, percentage: 0 }),
});
assert.throws(() => retryTaskCache.tasks(state, date), /task factory failed/, "task factory failure must surface");
assert.deepEqual(retryTaskCache.tasks(state, date), [{ id: "ok" }], "task factory must retry after a failed derivation");
assert.equal(taskAttempts, 2, "failed task derivation must not poison the cache");

let progressAttempts = 0;
const retryProgressCache = createTaskDerivationCache({
  deriveTasks: () => [{ id: "ok" }],
  summarizeProgress() {
    progressAttempts += 1;
    if (progressAttempts === 1) throw new Error("progress factory failed");
    return { total: 1, done: 0, pending: 1, percentage: 0 };
  },
});
assert.throws(() => retryProgressCache.progress(state, date), /progress factory failed/, "progress factory failure must surface");
assert.deepEqual(retryProgressCache.progress(state, date), { total: 1, done: 0, pending: 1, percentage: 0 }, "progress factory must retry after failure");
assert.equal(progressAttempts, 2, "failed progress derivation must not poison the cache");

console.log("TASK_DERIVATION_CACHE_REGRESSION_OK");
