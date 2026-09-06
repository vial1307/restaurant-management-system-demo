import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const source = fs.readFileSync(path.join(ROOT, "vps/backend/src/business-state-routes.mjs"), "utf8");

assert.match(
  source,
  /if \(action === "edit" && \["reservations", "preparation"\]\.includes\(moduleName\)\) \{\s*return hasPermission\(user, moduleName, "edit"\);\s*\}/,
  "reservations/preparation edits must require their own module edit permission"
);

const guardIndex = source.indexOf('if (action === "edit" && ["reservations", "preparation"].includes(moduleName))');
const fallbackIndex = source.indexOf('return rules.some((permission) => hasPermission(user, permission, action));');
assert(guardIndex >= 0 && fallbackIndex >= 0 && guardIndex < fallbackIndex, "module-specific edit guard must execute before dashboard fallback");

assert.match(source, /reservations:\s*\["reservations", "dashboard"\]/, "reservation dashboard view fallback must remain available");
assert.match(source, /preparation:\s*\["preparation", "dashboard"\]/, "preparation dashboard view fallback must remain available");
assert.match(source, /if \(moduleName === "shared" && action === "edit"\)/, "shared-module edit protection must remain intact");
assert.match(source, /if \(moduleName === "audit" && action === "edit"\)/, "audit edit protection must remain intact");

console.log("business module permission contract passed");
