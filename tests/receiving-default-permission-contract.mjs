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
assert.match(cloud,/canManageReceiveDefault[\s\S]{0,400}hasInventoryPermission\("edit"\)[\s\S]{0,250}s\.location === site \|\| s\.location === "all"/, "frontend receiving-default boundary must follow explicit edit permission and site scope");
assert.doesNotMatch(cloud,/canManageReceiveDefault[\s\S]{0,400}currentRole === "manager"/, "frontend receiving-default writes must not be re-denied by role name");
assert(!cloud.includes('["fuxing","yongji"].includes(site)'), "frontend receiving-default permission must not hard-code branch site names");
assert(cloud.includes('if(!canManageReceiveDefault(site)) return {ok:false,fallback:false,error:new Error("RECEIVE_DEFAULT_MANAGER_REQUIRED")}'), "cloud receive-default write is not guarded by explicit inventory edit authority");

assert(app.includes("canManageReceiveDefault,"), "branch editor does not import receiving-default permission boundary");
assert(app.includes("const receiveDefaultEditable = canManageReceiveDefault(activeInventorySite());"), "branch editor does not derive receiving-default editability from the dedicated boundary");
assert(app.includes('disabled aria-disabled="true"'), "view-only receiving-default selector is not disabled");
assert(app.includes('type="hidden" name="receiveZone"'), "read-only receiving-default UI must preserve the existing value on product save");
assert.equal(
  (app.match(/const receiveResult = stockResult\.ok && canManageReceiveDefault\(site\)/g) || []).length,
  2,
  "both add/edit product save paths must require successful stock persistence and receiving-default authority before writing"
);

assert(backend.includes("async function canManageReceiveDefault(user, site)"), "backend receiving-default permission boundary missing");
assert.match(backend,/canManageReceiveDefault[\s\S]{0,220}siteAllowed\(user, site\) && hasPermission\(user, "inventory", "edit"\)/, "backend receiving-default boundary must follow explicit edit permission and site scope");
assert.doesNotMatch(backend,/canManageReceiveDefault[\s\S]{0,220}user\.role === "manager"/, "backend receiving-default writes must not be re-denied by role name");
assert(!backend.includes('["fuxing","yongji"].includes(site)'), "backend receiving-default permission must not hard-code branch site names");
assert(backend.includes('if (!(await requireReceiveDefaultManager(user, site, reply))) return;') || backend.includes('if (!await requireReceiveDefaultManager(user, site, reply)) return;'), "receive-default endpoint is not using its dedicated permission boundary");

assert(spec.includes("receiving-default writes require explicit `inventory.edit`"), "canonical receiving-location ownership rule is not explicit about edit permission authority");

console.log("receiving-default permission contract passed");
