import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const cloud = read("src/inventory-cloud.js");
const app = read("src/app.js");
const backend = read("vps/backend/src/inventory-extra-routes.mjs");
const spec = read("docs/SYSTEM_SPECIFICATION.md");

assert(cloud.includes("export function canManageReceiveDefault(site = activeInventorySite())"), "frontend receiving-default permission boundary missing");
assert.match(cloud,/canManageReceiveDefault[\s\S]{0,180}canInventoryAction\("inventory\.receive_default\.edit",\{site\}\)/, "frontend receiving-default boundary must use granular database action and active site");
assert.doesNotMatch(cloud,/canManageReceiveDefault[\s\S]{0,400}currentRole|hasInventoryPermission\("edit"\)|s\.location === site/, "frontend receiving-default writes must not derive authority from role/module/session-location");
assert(!cloud.includes('["fuxing","yongji"].includes(site)'), "frontend receiving-default permission must not hard-code branch site names");
assert.match(cloud,/cloudSetReceiveDefault[\s\S]{0,1200}canManageReceiveDefault\(site\)[\s\S]{0,260}INVENTORY_ACTION_NOT_ALLOWED|cloudSetReceiveDefault[\s\S]{0,1200}canManageReceiveDefault\(site\)/, "cloud receive-default write must remain guarded by the granular permission boundary");

assert(app.includes("canManageReceiveDefault,"), "branch editor does not import receiving-default permission boundary");
assert.match(app,/function addItemModal\([\s\S]{0,2600}const site = activeInventorySite\(\);[\s\S]{0,1800}const receiveDefaultEditable = canManageReceiveDefault\(site\);/, "branch editor must derive receiving-default editability from the active database-scoped site");
assert(app.includes('disabled aria-disabled="true"'), "view-only receiving-default selector is not disabled");
assert(app.includes('type="hidden" name="receiveZone"'), "read-only receiving-default UI must preserve the existing value on product save");
assert.equal(
  (app.match(/const receiveResult = stockResult\.ok && canManageReceiveDefault\(site\)/g) || []).length,
  2,
  "both add/edit product save paths must require successful stock persistence and receiving-default authority before writing"
);

assert.match(backend,/async function canManageReceiveDefault\(user, site, client = pool\)/, "backend receiving-default permission boundary missing");
assert.match(backend,/canManageReceiveDefault[\s\S]{0,220}inventoryActionAllowed\(user,"inventory\.receive_default\.edit",\{site\},client\)/, "backend receiving-default boundary must use granular database action and site scope");
assert.doesNotMatch(backend,/canManageReceiveDefault[\s\S]{0,260}user\.role|hasPermission\(user, "inventory"/, "backend receiving-default writes must not derive authority from role/module permission");
assert(!backend.includes('["fuxing","yongji"].includes(site)'), "backend receiving-default permission must not hard-code branch site names");
assert.match(
  backend,
  /app\.get\("\/api\/inventory\/receive-defaults"[\s\S]*?inventoryActionAllowed\(user,"inventory\.view",\{site\}\)[\s\S]*?inventoryActionAllowed\(user,"inventory\.receive",\{site\}\)/,
  "receiving routing metadata must remain readable to destination receive-scoped users without granting full inventory.view"
);
assert(backend.includes('if (!(await requireReceiveDefaultManager(user, site, reply))) return;') || backend.includes('if (!await requireReceiveDefaultManager(user, site, reply)) return;'), "receive-default endpoint is not using its dedicated permission boundary");

assert(spec.includes("receiving-default writes require explicit `inventory.receive_default.edit`"), "canonical receiving-location ownership rule is not explicit about granular permission authority");

console.log("receiving-default permission contract passed");
