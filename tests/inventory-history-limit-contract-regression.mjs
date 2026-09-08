import assert from "node:assert/strict";
import fs from "node:fs";

const vpsApi = fs.readFileSync(new URL("../src/vps-api.js", import.meta.url), "utf8");
const inventoryCloud = fs.readFileSync(new URL("../src/inventory-cloud.js", import.meta.url), "utf8");

assert.match(
  vpsApi,
  /export function vpsInventoryHistory\(site, \{ limit = 250 \} = \{\}\)/,
  "vpsInventoryHistory must keep the options-object limit contract",
);

assert.match(
  inventoryCloud,
  /vpsInventoryHistory\(site, \{ limit \}\)/,
  "getCloudInventoryHistory must forward the requested limit through the options object",
);

assert.doesNotMatch(
  inventoryCloud,
  /vpsInventoryHistory\(site, limit\)/,
  "inventory history must not regress to the obsolete scalar second argument",
);

console.log("INVENTORY_HISTORY_LIMIT_CONTRACT_OK");
