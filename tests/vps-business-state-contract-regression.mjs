import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const api = fs.readFileSync(path.join(ROOT, "src/vps-api.js"), "utf8");
const saveFunction = api.match(/export async function vpsSaveBusinessState\([\s\S]*?\n}\n\nexport function vpsSchemaVersion/)?.[0] || "";

assert(saveFunction, "vpsSaveBusinessState must remain an explicit async confirmation boundary");
assert.match(saveFunction, /vpsSaveBusinessState\(site, modules, expectedModuleRevisions/, "business-state save must accept per-module expected revisions");
assert.match(saveFunction, /body:\s*\{\s*modules,\s*expectedModuleRevisions\s*\}/, "business-state POST must send expectedModuleRevisions with dirty modules");
assert.match(saveFunction, /const result = await apiRequest\([\s\S]{0,320}\/api\/business-state\//, "business-state save must await the VPS response");
assert.match(saveFunction, /result\?\.ok !== true[\s\S]{0,160}!Array\.isArray\(result\?\.savedModules\)[\s\S]{0,180}moduleRevisions/, "business-state transport must require ok, savedModules and moduleRevisions confirmation");
assert.match(saveFunction, /BUSINESS_STATE_SAVE_CONFIRMATION_MISSING/, "missing module revision confirmation must fail explicitly");
assert.match(saveFunction, /return result;/, "validated business-state save response must be returned to synchronization logic");

console.log("VPS_BUSINESS_STATE_CONTRACT_OK");
