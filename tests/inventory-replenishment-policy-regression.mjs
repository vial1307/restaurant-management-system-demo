import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildGeneratedTasks,
  buildInventoryAlerts,
  calculateProcurementPlan,
  summarizeReserveInventory,
} from "../src/rules-core.js";

const storageGroups = [
  { id:"cold-vault-alpha", storageGroup:"primary", replenishmentPolicy:"factory", sortOrder:10 },
  { id:"reserve-beta", storageGroup:"primary", replenishmentPolicy:"internal", sortOrder:20 },
  { id:"line-fridge-gamma", storageGroup:"service", replenishmentPolicy:"internal", sortOrder:30 },
];

const record = {
  reservation:{ lunchTables:0, dinnerTables:0, remaining:{} },
  riceRemaining:9999,
  procurement:{ planned:{}, incoming:{}, orderDates:{} },
  completedTasks:{},
  customTasks:[],
  inventory:[
    { id:"factory-a", stockKey:"ingredient-a", label:"A", labelVi:"A", zone:"cold-vault-alpha", quantity:0, minimum:5, unit:"包", workArea:"area-a" },
    { id:"reserve-a", stockKey:"ingredient-a", label:"A", labelVi:"A", zone:"reserve-beta", quantity:10, minimum:2, unit:"包", workArea:"area-a" },
    { id:"service-a", stockKey:"ingredient-a", label:"A", labelVi:"A", zone:"line-fridge-gamma", quantity:0, minimum:3, unit:"包", workArea:"area-a" },
    { id:"factory-b", stockKey:"ingredient-b", label:"B", labelVi:"B", zone:"cold-vault-alpha", quantity:0, minimum:4, unit:"包", workArea:"area-a" },
    { id:"service-c", stockKey:"ingredient-c", label:"C service", labelVi:"C service", zone:"line-fridge-gamma", quantity:1, minimum:5, unit:"包", workArea:"area-a" },
    { id:"primary-c", stockKey:"ingredient-c", label:"C primary", labelVi:"C primary", zone:"reserve-beta", quantity:2, minimum:5, unit:"包", workArea:"area-a" },
  ],
  workInventory:[
    { id:"work-a", stockKey:"ingredient-a", label:"A", labelVi:"A", quantity:0, minimum:4, unit:"包", workArea:"area-a" },
    { id:"work-b", stockKey:"ingredient-b", label:"B", labelVi:"B", quantity:0, minimum:2, unit:"包", workArea:"area-a" },
  ],
};

const settings = {
  reservationBuffer:2,
  riceWeekday:2000,
  riceWeekend:3000,
  riceSkipAbove:2000,
  procurementSchedules:{
    noodles:{closedDays:[]},
    vegetables:{closedDays:[]},
    factory:{closedDays:[]},
  },
  checklist:[],
};

const plan = calculateProcurementPlan("2026-09-28", record, settings, storageGroups);
const factoryA = plan.factory.find((row) => row.stockKey === "ingredient-a");
const factoryB = plan.factory.find((row) => row.stockKey === "ingredient-b");
assert(factoryA, "database policy must place ingredient A in the factory order queue");
assert(factoryB, "database policy must place ingredient B in the factory order queue");
assert.equal(factoryA.current, 0);
assert.equal(factoryA.demand, 5);
assert.equal(factoryA.orderUnits, 5);
assert.equal(plan.factory.some((row) => row.stockKey === "ingredient-c"), false,
  "internal/service storage must not enter the factory queue");

const alerts = buildInventoryAlerts(record, storageGroups);
assert(alerts.some((row) => row.kind === "reserve" && row.stockKey === "ingredient-a" && row.zone === "cold-vault-alpha"),
  "empty factory-policy stock must create a factory reserve alert");
assert(alerts.some((row) => row.kind === "storage" && row.id === "service-a"),
  "service storage shortage must remain an internal replenishment alert");
assert.equal(alerts.some((row) => row.kind === "storage" && row.id === "factory-a"), false,
  "factory-policy storage must not be treated as an internal storage-restock destination");

const state = { settings, records:{ "2026-09-28":record } };
const tasks = buildGeneratedTasks(state, "2026-09-28", storageGroups);
const blockedB = tasks.find((task) => task.id === "inventory-work-b");
assert(blockedB, "work shortage for ingredient B must produce a task");
assert.equal(blockedB.kind, "inventory-blocked");
assert.equal(blockedB.awaitingFactory, true,
  "work shortage with an empty factory-policy reserve must be marked as awaiting factory");
assert.equal(tasks.some((task) => task.id === "storage-factory-b"), false,
  "factory-policy storage must not generate an internal storage-restock task");
assert(tasks.some((task) => task.id === "factory-ingredient-b" && task.kind === "procurement"),
  "empty factory-policy storage must generate a procurement task");

const summary = summarizeReserveInventory(record, storageGroups);
const c = summary.find((row) => row.stockKey === "ingredient-c");
assert.equal(c.zone, "reserve-beta",
  "equal minimums must prefer database primary storage over service storage without a named-location rule");

const rulesSource = fs.readFileSync(new URL("../src/rules-core.js", import.meta.url), "utf8");
assert.doesNotMatch(rulesSource, /"large-freezer"|"kitchen"/,
  "runtime procurement/replenishment rules must not identify warehouses by legacy UI keys");
assert.match(rulesSource, /replenishmentPolicy === "factory"/,
  "factory routing must use database replenishment policy");

const migration = fs.readFileSync(new URL("../vps/database/migrations/028_inventory_replenishment_policy.sql", import.meta.url), "utf8");
assert.match(migration, /replenishment_policy/);
assert.match(migration, /inventory_location_replenishment_policy_guard/);
assert.match(migration, /INVALID_REPLENISHMENT_POLICY/);
assert.match(migration, /'internal','factory'/);
assert.doesNotMatch(migration, /update\s+public\.inventory_stock/i,
  "policy migration must not rewrite stock quantity or minimum");

console.log("INVENTORY_REPLENISHMENT_POLICY_OK");
