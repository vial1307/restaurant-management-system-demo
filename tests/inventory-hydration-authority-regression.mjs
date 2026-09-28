import assert from "node:assert/strict";
import { createDefaultState, hydrateState } from "../src/store-core.js";

const date = "2026-09-09";
const blank = createDefaultState(date);
assert.deepEqual(blank.records[date].inventory, [],
  "a new browser state must not seed a source-coded inventory catalog");
assert.deepEqual(blank.records[date].workInventory, [],
  "a new browser state must wait for PostgreSQL work stock");

const raw = structuredClone(blank);
raw.records[date].inventory = [
  {
    id: "frozen-noodles",
    label: "冷凍麵",
    labelVi: "Mì đông lạnh",
    quantity: 0,
    minimum: 30,
    unit: "片",
    zone: "db-freezer",
    workArea: "noodles",
  },
  {
    id: "duck-intestine-large",
    label: "鴨腸",
    labelVi: "Lòng vịt",
    quantity: 0,
    minimum: 10,
    unit: "盒",
    zone: "db-freezer",
    workArea: "soup",
  },
  {
    id: "looks-like-seafood",
    label: "海鮮牛肉湯",
    labelVi: "Hải sản thịt bò canh",
    quantity: 1,
    minimum: 1,
    unit: "包",
    zone: "arbitrary-db-location",
  },
];
raw.records[date].workInventory = [];

const hydrated = hydrateState(structuredClone(raw), date);
assert.deepEqual(
  hydrated.records[date].inventory.map((item) => item.id),
  ["frozen-noodles", "duck-intestine-large", "looks-like-seafood"],
  "hydration must preserve only the explicit inventory projection"
);
assert.equal(hydrated.records[date].inventory[0].minimum, 30,
  "hydration must not rewrite an authoritative minimum");
assert.equal(hydrated.records[date].inventory[1].unit, "盒",
  "hydration must not rewrite an authoritative unit");
assert.equal(hydrated.records[date].inventory[1].workArea, "soup",
  "hydration must preserve the explicit database Work Area");
assert.equal(hydrated.records[date].inventory[2].workArea, "",
  "a missing Work Area must stay unconfigured even when the item name looks like seafood/meat/soup");
assert.deepEqual(hydrated.records[date].workInventory, [],
  "an explicit empty workInventory array must remain authoritative");

const legacyRaw = structuredClone(raw);
legacyRaw.records[date].workInventory = null;
const legacyHydrated = hydrateState(legacyRaw, date);
assert.deepEqual(legacyHydrated.records[date].workInventory, [],
  "missing legacy workInventory must not be synthesized from storage rows");

console.log("INVENTORY_HYDRATION_AUTHORITY_OK");
