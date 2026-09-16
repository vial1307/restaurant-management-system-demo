import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const cloud = read("src/inventory-cloud.js");
const app = read("src/app.js");
const backend = read("vps/backend/src/inventory-extra-routes.mjs");
const siteRegistry = read("vps/backend/src/site-registry.mjs");
const spec = read("docs/SYSTEM_SPECIFICATION.md");

assert(cloud.includes("export function canManageReceiveDefault(site = activeInventorySite())"), "frontend receiving-default permission boundary missing");
assert(cloud.includes('currentRole === "manager"') && cloud.includes("isBranchInventorySite(site)"), "frontend receiving-default boundary must be branch-manager scoped through DB-backed inventory mode");
assert(!cloud.includes('["fuxing","yongji"].includes(site)'), "frontend receiving-default permission must not hard-code branch site names");
assert(cloud.includes('if(!canManageReceiveDefault(site)) return {ok:false,fallback:false,error:new Error("RECEIVE_DEFAULT_MANAGER_REQUIRED")}'), "cloud receive-default write is not guarded by manager authority");

assert(app.includes("canManageReceiveDefault,"), "branch editor does not import receiving-default permission boundary");
assert(app.includes("const receiveDefaultEditable = canManageReceiveDefault(activeInventorySite());"), "branch editor does not derive receiving-default editability from the dedicated boundary");
assert(app.includes('disabled aria-disabled="true"'), "non-manager receiving-default selector is not disabled");
assert(app.includes('type="hidden" name="receiveZone"'), "read-only receiving-default UI must preserve the existing value on product save");
assert.equal((app.match(/const receiveResult = canManageReceiveDefault\(site\)/g) || []).length, 2, "both add/edit product save paths must skip unauthorized receiving-default writes");

assert(backend.includes("async function canManageReceiveDefault(user, site)"), "backend receiving-default permission boundary missing");
assert(backend.includes('return user.role === "manager" && await isBranchSite(site);'), "backend receiving-default boundary must be branch-manager scoped through DB-backed site metadata");
assert(!backend.includes('["fuxing","yongji"].includes(site)'), "backend receiving-default permission must not hard-code branch site names");
assert(backend.includes('reply.code(403).send({ error: "RECEIVE_DEFAULT_MANAGER_REQUIRED" });'), "backend must return an explicit receiving-default manager error");
assert(backend.includes('if (!(await requireReceiveDefaultManager(user, site, reply))) return;') || backend.includes('if (!await requireReceiveDefaultManager(user, site, reply)) return;'), "receive-default endpoint is not using the dedicated manager boundary");
assert(siteRegistry.includes("from public.sites") && siteRegistry.includes("metadata") && siteRegistry.includes("metadata?.inventory_mode"), "site registry must classify inventory mode from PostgreSQL site metadata");
assert(siteRegistry.includes('=== "branch"'), "site registry must expose branch classification from inventory_mode");

assert(spec.includes("receiving-default writes are restricted to the receiving site's manager or admin"), "canonical receiving-location ownership rule is not explicit about write authority");

console.log("receiving-default permission contract passed");
