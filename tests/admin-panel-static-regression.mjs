import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync("admin.html", "utf8");
const js = fs.readFileSync("src/admin-panel.js", "utf8");
const css = fs.readFileSync("src/admin-panel.css", "utf8");
const routes = fs.readFileSync("vps/backend/src/master-data-routes.mjs", "utf8");
const migration = fs.readFileSync("vps/database/migrations/015_operational_master_data.sql", "utf8");

assert.match(html, /id="admin-app"/);
assert.match(html, /src\/admin-panel\.js/);
assert.match(html, /src\/admin-panel\.css/);
assert.match(js, /vpsMe\(\)/, "Admin Panel must authenticate against VPS session");
assert.match(js, /system\.master_data\.manage/, "Admin Panel must require database capability");
assert.match(js, /\/api\/admin\/overview/, "Admin Panel must read system overview from API");
assert.match(js, /\/api\/master-data\//, "Admin Panel must read master data from API");
assert.match(js, /\/api\/master-data\/locations/, "location saves must use VPS API");
assert.match(js, /\/api\/master-data\/work-areas/, "work-area saves must use VPS API");
assert.doesNotMatch(js, /localStorage\.setItem/, "Admin Panel must not persist master data to localStorage");
assert.match(css, /@media\(max-width:600px\)/, "Admin Panel must include mobile layout");

assert.match(routes, /LOCATION_HAS_POSITIVE_STOCK/);
assert.match(routes, /LOCATION_IS_RECEIVE_DEFAULT/);
assert.match(routes, /LOCATION_CODE_IMMUTABLE/);
assert.match(routes, /master_location_create/);
assert.match(routes, /master_work_area_update/);
assert.match(migration, /create table if not exists public\.work_areas/);
assert.match(migration, /fuxing-large-freezer/);
assert.match(migration, /fuxing-large-fridge/);
assert.match(migration, /fuxing-four-door/);
assert.match(migration, /fuxing-kitchen/);
assert.match(migration, /yongji-large-freezer/);
assert.match(migration, /central-four-door/);
assert.match(migration, /inventory\.locations\.manage/);
assert.match(migration, /operations\.work_areas\.manage/);
assert.match(migration, /system\.master_data\.manage/);

console.log("ADMIN_PANEL_STATIC_REGRESSION_OK");
