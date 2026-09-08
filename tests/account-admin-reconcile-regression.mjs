import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const bridge = await readFile(new URL("../src/vps-auth-bridge.js", import.meta.url), "utf8");

const saveStart = bridge.indexOf('if (form.matches("[data-account-form]"))');
const saveEnd = bridge.indexOf('\n  }\n}, true);', saveStart);
assert.ok(saveStart >= 0 && saveEnd > saveStart, "VPS account save handler must exist");
const saveBlock = bridge.slice(saveStart, saveEnd);
assert.match(saveBlock, /const result = await vpsSaveUser\(body\);/, "account save must retain the VPS response for session reconciliation");
assert.match(saveBlock, /result\?\.user\?\.id === currentSession\?\.id[\s\S]*mirrorVpsSession\(result\.user\)/, "self-admin edits must mirror the returned VPS profile");
assert.match(saveBlock, /mirrorVpsSession\(result\.user\)[\s\S]*shitu:auth-synced/, "self-admin edits must notify auth consumers after mirroring");
assert.match(saveBlock, /await syncProfiles\(\);/, "account save must refresh the VPS account list");
assert.doesNotMatch(saveBlock, /location\.reload\(/, "account save must not reload the application");

const deleteStart = bridge.indexOf('const deleteButton = event.target.closest("[data-account-delete]");');
const deleteEnd = bridge.indexOf('\n}, true);', deleteStart);
assert.ok(deleteStart >= 0 && deleteEnd > deleteStart, "VPS account delete handler must exist");
const deleteBlock = bridge.slice(deleteStart, deleteEnd);
assert.match(deleteBlock, /await vpsDeleteUser\(/, "account delete must persist through VPS");
assert.match(deleteBlock, /await syncProfiles\(\);/, "account delete must refresh the VPS account list");
assert.doesNotMatch(deleteBlock, /location\.reload\(/, "account delete must not reload the application");

const reloadCalls = [...bridge.matchAll(/location\.reload\(\)/g)];
assert.equal(reloadCalls.length, 1, "only the dedicated password-change flow may reload after this delta");
assert.match(bridge, /localStorage\.removeItem\(AUTH_KEY\)[\s\S]{0,300}setTimeout\(\(\) => location\.reload\(\), 500\)/, "password-change logout/reload behavior must remain intact");

console.log("ACCOUNT_ADMIN_RECONCILE_OK");
