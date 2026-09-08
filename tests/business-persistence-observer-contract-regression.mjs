import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const statusModule = await readFile(new URL("../src/business-persistence-status.js", import.meta.url), "utf8");
const rootModule = await readFile(new URL("../src/stable-app-root.js", import.meta.url), "utf8");

assert.match(statusModule, /const appRoot = document\.querySelector\("#app"\);[\s\S]*observer\.observe\(appRoot, \{ childList: true \}\);/, "persistence status must observe direct app-root child mutations");
assert.doesNotMatch(statusModule, /observer\.observe\(appRoot, \{[^}]*subtree\s*:\s*true[^}]*\}\)/, "persistence status must not observe the entire app subtree");
assert.match(rootModule, /document\.createComment\("shitu-render"\)/, "stable renderer must retain the direct-root lifecycle marker");
assert.match(rootModule, /host\.append\(marker\);\s*marker\.remove\(\);/, "stable renderer lifecycle marker must remain a direct transient root mutation");
assert.match(statusModule, /window\.addEventListener\("shitu:business-persistence-status", handlePersistenceStatus\)/, "persistence status event reconciliation must remain present");
assert.match(statusModule, /window\.addEventListener\("shitu:active-site-changed", scheduleRender\)/, "site-change reconciliation must remain present");
assert.match(statusModule, /window\.addEventListener\("shitu:auth-synced", scheduleRender\)/, "auth reconciliation must remain present");

console.log("BUSINESS_PERSISTENCE_OBSERVER_CONTRACT_OK");
