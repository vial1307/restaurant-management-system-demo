import assert from "node:assert/strict";
import {
  buildGeneratedTasks,
  buildInventoryAlerts,
  calculateReservations,
  calculateRice,
  summarizeReserveInventory,
} from "../src/rules.js";
import { searchMatches } from "../src/search-utils.js";

const date = "2026-09-06";
const reservation = {
  lunchTables: 2,
  dinnerTables: 3,
  remaining: { vegetables: 1, braised: 2, hotpot: 3 },
};
const record = {
  reservation,
  riceRemaining: 500,
  inventory: [
    { id: "beef-freezer", stockKey: "beef", label: "牛肉", labelVi: "Thịt bò", zone: "large-freezer", workArea: "meat", quantity: 3, minimum: 2, unit: "包" },
  ],
  workInventory: [
    { id: "work-beef", stockKey: "beef", label: "牛肉", labelVi: "Thịt bò", workArea: "meat", quantity: 0, minimum: 1, unit: "包" },
  ],
  completedTasks: {},
  customTasks: [],
};
const settings = {
  reservationBuffer: 2,
  riceWeekday: 2000,
  riceWeekend: 3000,
  riceSkipAbove: 2000,
  checklist: [],
};
const state = {
  selectedDate: date,
  settings,
  records: { [date]: record },
};

const outsideFirst = calculateReservations(reservation, 2);
const outsideSecond = calculateReservations(reservation, 2);
assert.notStrictEqual(outsideFirst, outsideSecond, "rules must preserve fresh-result behavior outside search");
assert.deepEqual(outsideFirst, outsideSecond, "fresh outside-search results must remain value-equivalent");

assert.equal(searchMatches("牛肉 · Thịt bò", ""), true, "empty search behavior changed");
const emptySearchFirst = calculateReservations(reservation, 2);
const emptySearchSecond = calculateReservations(reservation, 2);
assert.notStrictEqual(emptySearchFirst, emptySearchSecond, "empty search must not activate the computation cache");

assert.equal(searchMatches("牛肉 · Thịt bò", "牛肉"), true, "Chinese search behavior changed");
assert.equal(searchMatches("牛肉 · Thịt bò", "niu rou"), true, "pinyin search behavior changed");
assert.equal(searchMatches("牛肉 · Thịt bò", "ㄋㄧㄡㄖㄡ"), true, "zhuyin search behavior changed");
assert.equal(searchMatches("牛肉 · Thịt bò", "thit bo"), true, "Vietnamese accent-insensitive search behavior changed");
assert.equal(searchMatches("牛肉 · Thịt bò", "vit quay"), false, "unrelated query must remain unmatched");

const reservationFirst = calculateReservations(reservation, 2);
const reservationSecond = calculateReservations(reservation, 2);
assert.strictEqual(reservationFirst, reservationSecond, "same reservation calculation must be reused during one search window");

const reservationDifferent = calculateReservations(reservation, 3);
assert.notStrictEqual(reservationFirst, reservationDifferent, "different arguments must not reuse a cached reservation result");
assert.equal(reservationDifferent.target, reservationFirst.target + 1, "different reservation arguments produced the wrong result");

const riceFirst = calculateRice(date, record.riceRemaining, settings);
const riceSecond = calculateRice(date, record.riceRemaining, settings);
assert.strictEqual(riceFirst, riceSecond, "rice calculation must be reused during one search window");

const generatedFirst = buildGeneratedTasks(state, date);
const generatedSecond = buildGeneratedTasks(state, date);
assert.strictEqual(generatedFirst, generatedSecond, "generated task calculation must be reused during one search window");

const reservesFirst = summarizeReserveInventory(record);
const reservesSecond = summarizeReserveInventory(record);
assert.strictEqual(reservesFirst, reservesSecond, "reserve summary must be reused during one search window");

const alertsFirst = buildInventoryAlerts(record);
const alertsSecond = buildInventoryAlerts(record);
assert.strictEqual(alertsFirst, alertsSecond, "inventory alerts must be reused during one search window");

await new Promise((resolve) => globalThis.queueMicrotask(resolve));

const afterSearchFirst = buildInventoryAlerts(record);
const afterSearchSecond = buildInventoryAlerts(record);
assert.notStrictEqual(afterSearchFirst, afterSearchSecond, "cache must expire at the microtask boundary");
assert.deepEqual(afterSearchFirst, afterSearchSecond, "post-search fresh results must remain value-equivalent");

console.log("INVENTORY_SEARCH_CONTEXT_CACHE_REGRESSION_OK");