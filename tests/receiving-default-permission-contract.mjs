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
assert(cloud.includes('currentRole === "manager"') && cloud.includes('["fuxing","yongji"].includes(site)'), "frontend receiving-default boundary must be branch-manager scoped");
assert(cloud.includes('if(!canManageReceiveDefault(site)) return {ok:false,fallback:false,error:new Error("RECEIVE_DEFAULT_MANAGER_REQUIRED")}'), "cloud receive-default write is not guarded by manager authority");

assert(app.includes("canManageReceiveDefault,"), "branch editor does not import receiving-default permission boundary");
assert(app.includes("const receiveDefaultEditable = canManageReceiveDefault(activeInventorySite());"), "branch editor does not derive receiving-default editability from the dedicated boundary");
assert(app.includes('disabled aria-disabled="true"'), "non-manager receiving-default selector is not disabled");
assert(app.includes('type="hidden" name="receiveZone"'), "read-only receiving-default UI must preserve the existing value on product save");
assert.equal((app.match(/const receiveResult = canManageReceiveDefault\(site\)/g) || []).length, 2, "both add/edit product save paths must skip unauthorized receiving-default writes");

assert(backend.includes("function canManageReceiveDefault(user, site)"), "backend receiving-default permission boundary missing");
assert(backend.includes('return user.role === "manager" && ["fuxing","yongji"].includes(site);'), "backend receiving-default boundary must be branch-manager scoped");
assert(backend.includes('reply.code(403).send({ error: "RECEIVE_DEFAULT_MANAGER_REQUIRED" });'), "backend must return an explicit receiving-default manager error");
assert(backend.includes('if (!requireReceiveDefaultManager(user, site, reply)) return;'), "receive-default endpoint is not using the dedicated manager boundary");

assert(spec.includes("receiving-default writes are restricted to the receiving site's manager or admin"), "canonical receiving-location ownership rule is not explicit about write authority");

console.log("receiving-default permission contract passed");
