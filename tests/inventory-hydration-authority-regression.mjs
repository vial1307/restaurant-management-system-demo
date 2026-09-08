import assert from "node:assert/strict";
import { createDefaultState, hydrateState } from "../src/store-core.js";

const date = "2026-09-09";
const raw = structuredClone(createDefaultState(date));
raw.records[date].inventory = [
  {
    id: "frozen-noodles",
    label: "冷凍麵",
    labelVi: "Mì đông lạnh",
    quantity: 0,
    minimum: 30,
    unit: "片",
    zone: "large-freezer",
    workArea: "noodles",
  },
  {
    id: "duck-intestine-large",
    label: "鴨腸",
    labelVi: "Lòng vịt",
    quantity: 0,
    minimum: 10,
    unit: "盒",
    zone: "large-freezer",
    workArea: "soup",
  },
];
raw.records[date].workInventory = [];

const hydrated = hydrateState(structuredClone(raw), date);
assert.deepEqual(
  hydrated.records[date].inventory.map((item) => item.id),
  ["frozen-noodles", "duck-intestine-large"],
  "hydration must not inject missing DEFAULT_ITEMS into an authoritative inventory array"
);
assert.equal(hydrated.records[date].inventory[0].minimum, 30, "hydration must not rewrite an authoritative frozen-noodle minimum");
assert.equal(hydrated.records[date].inventory[1].minimum, 10, "hydration must not rewrite an authoritative duck-intestine minimum");
assert.equal(hydrated.records[date].inventory[1].unit, "盒", "hydration must not rewrite an authoritative unit");
assert.equal(hydrated.records[date].inventory[1].workArea, "soup", "hydration must not rewrite an authoritative work area");
assert.deepEqual(hydrated.records[date].workInventory, [], "an explicit empty workInventory array must remain authoritative");

const legacyRaw = structuredClone(raw);
legacyRaw.records[date].workInventory = null;
const legacyHydrated = hydrateState(legacyRaw, date);
assert.equal(legacyHydrated.records[date].workInventory.length, 2, "missing/malformed legacy workInventory may still be derived from existing inventory");
assert.deepEqual(
  legacyHydrated.records[date].workInventory.map((item) => item.stockKey),
  ["frozen-noodles", "duck-intestine"],
  "legacy work fallback must derive only from inventory rows that actually exist"
);

console.log("INVENTORY_HYDRATION_AUTHORITY_OK");
