import assert from "node:assert/strict";
import fs from "node:fs";

const cloud = fs.readFileSync(new URL("../src/inventory-cloud.js", import.meta.url), "utf8");
const backend = fs.readFileSync(new URL("../vps/backend/src/inventory-extra-routes.mjs", import.meta.url), "utf8");
const mobile = fs.readFileSync(new URL("./mobile-role-site-certification.mjs", import.meta.url), "utf8");

const directMatch = cloud.match(/export function canDirectInventoryAdjust\(\) \{[\s\S]*?\n\}/);
assert(directMatch, "canDirectInventoryAdjust contract missing");
const direct = directMatch[0];
assert(direct.includes("canInventoryEdit()"), "direct inventory controls must inherit effective inventory.edit/readiness contract");
assert(direct.includes('s.location === site || s.location === "all"'), "direct inventory controls must remain site-scoped");
assert(!direct.includes("manager") && !direct.includes("supervisor"), "direct inventory controls must not be hard-coded to manager/supervisor roles");

const setQuantity = backend.match(/app\.post\("\/api\/inventory\/set-quantity"[\s\S]*?app\.post\("\/api\/inventory\/set-minimum"/);
assert(setQuantity, "set-quantity route contract missing");
assert(setQuantity[0].includes('requireInventory(user, row.site, "edit", reply)'), "set-quantity must authorize with effective inventory.edit + site scope");

const setMinimum = backend.match(/app\.post\("\/api\/inventory\/set-minimum"[\s\S]*?app\.post\("\/api\/inventory\/catalog\/sync"/);
assert(setMinimum, "set-minimum route contract missing");
assert(setMinimum[0].includes('requireInventory(user,row.site,"edit",reply)'), "set-minimum must authorize with effective inventory.edit + site scope");
assert(!backend.includes("STOCKTAKE_ROLE_REQUIRED"), "legacy role-only stocktake gate must not return");

assert(backend.includes('return user.role === "manager" && ["fuxing","yongji"].includes(site);'), "receiving-default configuration must remain manager/admin bounded");
assert(backend.includes('if (user.role !== "admin") return reply.code(403).send({ error:"ADMIN_REQUIRED" });'), "catalog archive must remain admin-only");

assert(mobile.includes('username:"employeefx", role:"employee", site:"fuxing"') && mobile.includes('username:"employeefx", role:"employee", site:"fuxing", foreign:"yongji", width:412, height:915, manage:true, operations:true, stocktake:true'), "Chromium employee fixture must certify direct controls when inventory.edit is granted");
assert(mobile.includes('username:"centralreg", role:"central", site:"central", foreign:"fuxing", width:412, height:915, central:true, manage:true, operations:true, stocktake:true'), "Chromium Central fixture must certify direct controls when inventory.edit is granted");
assert(mobile.includes('username:"parttimefx", role:"parttime", site:"fuxing", foreign:"yongji", width:390, height:844, manage:false, operations:false, stocktake:false'), "view-only/no-edit fixture must keep mutation controls hidden");
assert(mobile.includes('engine:"webkit", username:"employeefx"') && mobile.includes('engine:"webkit", username:"centralreg"'), "WebKit must certify permission-driven employee and Central controls");

console.log("INVENTORY_PERMISSION_CONTROLS_REGRESSION_OK");
