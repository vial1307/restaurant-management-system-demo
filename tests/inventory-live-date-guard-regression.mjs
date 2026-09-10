import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { inventoryEntryNeedsToday } = await import("../src/inventory-live-date-guard.js");

function storageWith(selectedDate) {
  return {
    getItem(key) {
      if (key !== "shitu-kitchen-os-v1") return null;
      return JSON.stringify({ version: 1, selectedDate, records: {} });
    },
  };
}

const today = new Date(2026, 8, 11, 12, 0, 0);
assert.equal(inventoryEntryNeedsToday(storageWith("2026-09-10"), today), true,
  "opening inventory with a persisted old service date must restore today's live snapshot");
assert.equal(inventoryEntryNeedsToday(storageWith("2026-09-11"), today), false,
  "today's inventory date must not be reset unnecessarily");

const source = fs.readFileSync(path.join(root, "src/inventory-live-date-guard.js"), "utf8");
assert.match(source, /data-action=\"inventory-go-today\"/, "live guard must use the canonical app date action");
assert.match(source, /hashchange/, "entering Inventory from another route must arm the live-date guard");
assert.doesNotMatch(source, /setInterval/, "live-date guard must not create another polling loop");

for (const entry of ["index.html", "vps-entry.html"]) {
  const html = fs.readFileSync(path.join(root, entry), "utf8");
  assert.match(html, /inventory-live-date-guard\.js\?v=__KITCHEN_RELEASE__/, `${entry} must load the same live-date guard`);
}

console.log("INVENTORY_LIVE_DATE_GUARD_OK");
