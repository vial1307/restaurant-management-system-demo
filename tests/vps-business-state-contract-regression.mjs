import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const api = fs.readFileSync(path.join(ROOT, "src/vps-api.js"), "utf8");
const saveFunction = api.match(/export async function vpsSaveBusinessState\([\s\S]*?\n}\n\nexport function vpsSchemaVersion/)?.[0] || "";

assert(saveFunction, "vpsSaveBusinessState must remain an explicit async confirmation boundary");
assert.match(saveFunction, /vpsSaveBusinessState\(site, modules, expectedModuleRevisions/, "business-state save must accept optional explicit per-module expected revisions");
assert.match(saveFunction, /businessModuleRevisionCache\.get\(key\)[\s\S]{0,320}Object\.fromEntries\(moduleNames\.map/, "business-state save must derive dirty-module tokens from the last authoritative GET cache");
assert.match(saveFunction, /body:\s*\{\s*modules,\s*expectedModuleRevisions:\s*expected\s*\}/, "business-state POST must send resolved expectedModuleRevisions with dirty modules");
assert.match(saveFunction, /const result = await apiRequest\([\s\S]{0,320}\/api\/business-state\//, "business-state save must await the VPS response");
assert.match(saveFunction, /const confirmedRevisions = Array\.isArray\(result\?\.savedModules\)[\s\S]{0,260}moduleRevisions\[name\]/, "every saved module must carry a confirmed returned module revision");
assert.match(saveFunction, /BUSINESS_STATE_SAVE_CONFIRMATION_MISSING/, "missing module revision confirmation must fail explicitly");
assert.match(saveFunction, /businessModuleRevisionCache\.set\(key,[\s\S]{0,140}moduleRevisions/, "confirmed module revisions must advance the transport cache");
assert.match(saveFunction, /return \{ \.\.\.result, moduleRevisions \};/, "validated business-state save response must return normalized module revisions");

console.log("VPS_BUSINESS_STATE_CONTRACT_OK");
