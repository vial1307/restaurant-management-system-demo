import assert from "node:assert/strict";
import fs from "node:fs";

const auth = fs.readFileSync(new URL("../src/auth-layer.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../src/central-kitchen-ui.css", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const vpsEntry = fs.readFileSync(new URL("../vps-entry.html", import.meta.url), "utf8");

assert.match(auth, /data-central-kitchen-shell/, "Central Kitchen must render the redesigned shell");
assert.match(auth, /const uiGroups = inventoryUiGroups\("central"\);[\s\S]{0,180}const storageCount = uiGroups\.storage\.length;[\s\S]{0,120}const workAreaCount = uiGroups\.workAreas\.length;/,
  "Central KPI structure must come from PostgreSQL master data");
assert.match(auth, /function centralSiteRecord\(\)[\s\S]{0,160}inventorySites\(\)\.find\(\(site\) => site\.code === "central"\)/,
  "Central header name must come from the database-backed site registry");
assert.doesNotMatch(auth, /央廚冷凍、4門、臥櫃與冷藏/,
  "Central subtitle must not hard-code a fixed storage layout");
assert.doesNotMatch(auth, /data-central-stat-total/,
  "Central KPI must not sum quantities across incompatible units");
for (const mode of ["overview","in","pick","transfer","ship","manage","history"]) {
  assert(auth.includes(`id:"${mode}"`) || auth.includes(`data-central-mode="${mode}"`), `Central mode ${mode} missing`);
}
assert.match(auth, /centralZones\(\)\.map\(\(zone\) =>[\s\S]{0,700}data-central-zone=/,
  "Central storage overview cards must be generated from database-declared locations");
assert.match(auth, /centralWorkAreas\(\)\.map\(\(area\) =>[\s\S]{0,700}centralWorkAreaLabel/,
  "Central work-area overview cards must be generated from database-declared work areas");
assert.match(auth, /function centralPriorityPanel\(items, language, operationsEnabled\)[\s\S]{0,900}Number\(item\.qty \|\| 0\) < Number\(item\.minimum \|\| 0\)/,
  "Central priority panel must derive low-stock work from database quantities/minimums");
assert.match(auth, /data-central-priority-zone[\s\S]{0,420}centralZoneLabel\(item\.zone,language\)/,
  "Central priority rows must use database-declared location labels");
assert.match(auth, /data-central-priority-zone[\s\S]{0,900}centralInventoryView = "storage"[\s\S]{0,260}centralZone = button\.dataset\.centralPriorityZone/,
  "Central priority rows must drill into the selected database storage location");
assert.match(auth, /mountInventoryOperations\(host,\{site:"central",mode,language/,
  "Central redesign must preserve the existing authoritative operation controller");
assert.match(auth, /cloudRelocateStorage\(/,
  "Central redesign must preserve PostgreSQL-backed storage relocation");
assert.match(auth, /cloudSyncCentralCatalogItem\(/,
  "Central redesign must preserve PostgreSQL-backed catalog editing");

for (const shell of [index, vpsEntry]) {
  assert.match(shell, /central-kitchen-ui\.css\?v=__KITCHEN_RELEASE__/,
    "Central UI stylesheet must be release-stamped in every production shell");
  assert(shell.indexOf("central-kitchen-ui.css") > shell.indexOf("mobile-browser-compat.css"),
    "Central UI stylesheet must load after legacy mobile compatibility overrides");
}
assert.equal(index, vpsEntry, "Canonical and VPS entry shells must remain identical");

assert.match(css, /\.central-kitchen-kpis\{[\s\S]{0,220}grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/,
  "Central desktop KPI layout missing");
assert.match(css, /@media\(max-width:620px\)[\s\S]{0,2400}\.central-kitchen-modebar\.central-tabs\{[\s\S]{0,220}overflow-x:auto/,
  "Central mobile mode navigation must remain touch-scrollable");
assert.match(css, /@media\(max-width:620px\)[\s\S]{0,3200}\.central-kitchen-location-grid\{[\s\S]{0,120}repeat\(2,minmax\(0,1fr\)\)/,
  "Central mobile location cards must remain compact without horizontal overflow");
assert.match(css, /\.central-kitchen-priority-list\{[\s\S]{0,150}repeat\(2,minmax\(0,1fr\)\)/,
  "Central priority panel must use a compact desktop grid");
assert.match(css, /@media\(max-width:620px\)[\s\S]{0,1800}\.central-kitchen-priority-list\{grid-template-columns:1fr\}/,
  "Central priority panel must collapse to one column on mobile");
assert.doesNotMatch(css, /min-width:\s*(?:[4-9]\d\d|\d{4,})px/,
  "Central dedicated UI must not introduce a fixed desktop minimum width");

console.log("CENTRAL_KITCHEN_UI_REGRESSION_OK");
