import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const api = fs.readFileSync(path.join(ROOT, "src/vps-api.js"), "utf8");
const saveFunction = api.match(/export async function vpsSaveBusinessState\([\s\S]*?\n}\n\nexport function vpsSchemaVersion/)?.[0] || "";

assert(saveFunction, "vpsSaveBusinessState must remain an explicit async confirmation boundary");
assert.match(saveFunction, /const result = await apiRequest\([\s\S]{0,260}\/api\/business-state\//, "business-state save must await the VPS response");
assert.match(saveFunction, /result\?\.ok !== true[\s\S]{0,120}!Array\.isArray\(result\?\.savedModules\)/, "business-state transport must require ok=true and savedModules confirmation");
assert.match(saveFunction, /BUSINESS_STATE_SAVE_CONFIRMATION_MISSING/, "missing business-state confirmation must fail explicitly");
assert.match(saveFunction, /return result;/, "validated business-state save response must be returned to synchronization logic");

console.log("VPS_BUSINESS_STATE_CONTRACT_OK");
