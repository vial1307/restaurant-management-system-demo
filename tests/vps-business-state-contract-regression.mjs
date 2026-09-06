import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const api = fs.readFileSync(path.join(ROOT, "src/vps-api.js"), "utf8");
const sync = fs.readFileSync(path.join(ROOT, "src/business-state-sync.js"), "utf8");
const saveFunction = api.match(/export async function vpsSaveBusinessState\([\s\S]*?\n}\n\nexport function vpsSchemaVersion/)?.[0] || "";

assert(saveFunction, "vpsSaveBusinessState must remain an explicit async confirmation boundary");
assert.match(saveFunction, /vpsSaveBusinessState\(site, modules, expectedModuleRevisions/, "business-state save must accept explicit per-module expected revisions");
assert.match(saveFunction, /const expected = normalizedModuleRevisions\(expectedModuleRevisions\)/, "transport must normalize only the revisions explicitly supplied by synchronization");
assert.match(saveFunction, /body:\s*\{\s*modules,\s*expectedModuleRevisions:\s*expected\s*\}/, "business-state POST must send resolved expectedModuleRevisions with dirty modules");
assert.match(saveFunction, /const result = await apiRequest\([\s\S]{0,320}\/api\/business-state\//, "business-state save must await the VPS response");
assert.match(saveFunction, /const confirmedRevisions = Array\.isArray\(result\?\.savedModules\)[\s\S]{0,260}moduleRevisions\[name\]/, "every saved module must carry a confirmed returned module revision");
assert.match(saveFunction, /BUSINESS_STATE_SAVE_CONFIRMATION_MISSING/, "missing module revision confirmation must fail explicitly");
assert.doesNotMatch(api, /businessModuleRevisionCache/, "transport must not own hidden business revision baseline state");
assert.match(saveFunction, /return \{ \.\.\.result, moduleRevisions \};/, "validated business-state save response must return normalized module revisions");

assert.match(sync, /let loadedModuleRevisionKey = "";[\s\S]{0,80}let loadedModuleRevisions = \{\};/, "business sync must own the accepted per-scope module revision baseline");
const acceptedRevisionHelper = sync.match(/const acceptedRevisionsFor = \(names, key = identityKey\(\)\) => \([\s\S]*?\n  \);/)?.[0] || "";
assert(acceptedRevisionHelper, "business sync must centralize accepted module revision lookup");
assert.match(acceptedRevisionHelper, /loadedModuleRevisionKey === key/, "accepted revision lookup must be scoped to the loaded identity");
assert.match(acceptedRevisionHelper, /Number\.isInteger\(loadedModuleRevisions\[name\]\)[\s\S]{0,100}loadedModuleRevisions\[name\]/, "accepted revision lookup must use only validated tokens from the sync baseline");
assert.match(sync, /const expectedModuleRevisions = acceptedRevisionsFor\(dirtyNames, key\)/, "dirty business writes must derive expected revisions from the accepted sync baseline helper");
assert.match(sync, /vpsSaveBusinessState\(site, dirtyModules, expectedModuleRevisions\)/, "business sync must pass its accepted revision baseline explicitly to transport");

const loadFunction = sync.match(/async function load\(\) \{[\s\S]*?\n  \}\n\n  const guardSiteSwitch/)?.[0] || "";
assert(loadFunction, "business sync load function must remain identifiable for concurrency contract guards");
const deferredMarkerIndex = loadFunction.indexOf('detail:{ status:"ready", site, deferred:true }');
const deferredReturnIndex = deferredMarkerIndex >= 0 ? loadFunction.indexOf("return;", deferredMarkerIndex) : -1;
const normalizeServerRevisionsIndex = loadFunction.indexOf("const serverModuleRevisions = normalizedModuleRevisions(result?.moduleRevisions);");
const adoptRevisionBaselineIndex = normalizeServerRevisionsIndex >= 0
  ? loadFunction.indexOf("loadedModuleRevisionKey = key;", normalizeServerRevisionsIndex)
  : -1;
assert(deferredMarkerIndex >= 0, "business sync must surface a deferred read when local state changes during GET");
assert(deferredReturnIndex > deferredMarkerIndex, "deferred business read must return from the load path");
assert(normalizeServerRevisionsIndex > deferredReturnIndex, "deferred read must return before normalizing a newer server revision baseline");
assert(adoptRevisionBaselineIndex > normalizeServerRevisionsIndex, "business sync must adopt module revision baseline only after an accepted read");

console.log("VPS_BUSINESS_STATE_CONTRACT_OK");
