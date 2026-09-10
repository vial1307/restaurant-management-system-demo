import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "./business-state-regression-client.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(__dirname, "api-regression.mjs");
const source = fs.readFileSync(file, "utf8");
const oldSchemaAssertion = 'assert.equal(health.data.schema,"005");';
assert(source.includes(oldSchemaAssertion), "legacy API regression schema assertion changed; update v6 runner explicitly");

const oldEmployeeStocktakeAssertion = `assert.equal(employeeSet.response.status,200);\nassert.equal(Number(employeeSet.data.after),99);`;
assert(source.includes(oldEmployeeStocktakeAssertion), "employee inventory edit regression changed; update v6 runner explicitly");
const permissionDrivenEmployeeEditAssertion = `${oldEmployeeStocktakeAssertion}\n\nconst parttimeSet = await request("/api/inventory/set-quantity",{\n  method:"POST",cookie:parttime.cookie,\n  body:{itemId:beefFx.id,locationId:fxFreezer.id,quantity:100}\n});\nassert.equal(parttimeSet.response.status,403);\nassert.equal(parttimeSet.data.error,"INVENTORY_EDIT_NOT_ALLOWED");`;

const oldSupervisorReceiveDefaultAssertion = `assert.equal((await request("/api/inventory/receive-default",{\n  method:"POST",cookie:supervisor.cookie,\n  body:{site:"fuxing",catalogKey:"beef",locationCode:"fuxing-four"}\n})).response.status,200);`;
assert(source.includes(oldSupervisorReceiveDefaultAssertion), "supervisor receive-default regression changed; update v6 runner explicitly");

const oldAllSiteViewAssertion = `for (const site of ["fuxing","yongji","central"]) {\n  assert.equal((await inventory(admin.cookie,site)).response.status,200,\`admin cannot view \${site}\`);\n}`;
assert(source.includes(oldAllSiteViewAssertion), "all-site inventory regression changed; update snapshot integrity injection explicitly");

const allSiteSnapshotRegression = `${oldAllSiteViewAssertion}\n\nfunction assertInventorySnapshotIntegrity(snapshot, site) {\n  assert.equal(snapshot?.site, site, \`snapshot site mismatch for \${site}\`);\n  assert(Array.isArray(snapshot?.items), \`items missing for \${site}\`);\n  assert(Array.isArray(snapshot?.locations), \`locations missing for \${site}\`);\n  assert(Array.isArray(snapshot?.stock), \`stock missing for \${site}\`);\n  const itemIds = new Set(snapshot.items.map((item) => item.id));\n  const locationIds = new Set(snapshot.locations.map((location) => location.id));\n  for (const row of snapshot.stock) {\n    assert(itemIds.has(row.item_id), \`orphan/inactive item stock leaked into \${site} snapshot: \${row.item_id}\`);\n    assert(locationIds.has(row.location_id), \`inactive/foreign location stock leaked into \${site} snapshot: \${row.location_id}\`);\n  }\n}\n\nfor (const [site, locationCode] of [["central","central-freezer"],["fuxing","fuxing-freezer"],["yongji","yongji-freezer"]]) {\n  const itemKey = \`\${site}:snapshot-archive-regression\`;\n  const created = await request("/api/inventory/catalog/sync",{\n    method:"POST",cookie:admin.cookie,\n    body:{item:{\n      key:itemKey,catalog_key:\`snapshot-archive-\${site}\`,zh:\`快照封存測試-\${site}\`,vi:\`Kiểm thử snapshot archive \${site}\`,\n      unit:"包",work_area:"noodles",storage_only:true,\n      locations:[{code:locationCode,quantity:3,minimum:1}]\n    }}\n  });\n  assert.equal(created.response.status,200,\`catalog seed failed for \${site}\`);\n\n  const beforeArchive = await inventory(admin.cookie,site);\n  assert.equal(beforeArchive.response.status,200);\n  assertInventorySnapshotIntegrity(beforeArchive.data,site);\n  const seededItem = beforeArchive.data.items.find((item)=>item.item_key===itemKey);\n  assert(seededItem,\`seeded item missing before archive for \${site}\`);\n  assert(beforeArchive.data.stock.some((row)=>row.item_id===seededItem.id),\`seeded stock missing before archive for \${site}\`);\n\n  const archived = await request("/api/inventory/catalog/archive",{\n    method:"POST",cookie:admin.cookie,body:{itemKey}\n  });\n  assert.equal(archived.response.status,200,\`archive failed for \${site}\`);\n  assert.equal(archived.data.archived,true);\n\n  const afterArchive = await inventory(admin.cookie,site);\n  assert.equal(afterArchive.response.status,200);\n  assertInventorySnapshotIntegrity(afterArchive.data,site);\n  assert(!afterArchive.data.items.some((item)=>item.id===seededItem.id || item.item_key===itemKey),\`archived item leaked into item list for \${site}\`);\n  assert(!afterArchive.data.stock.some((row)=>row.item_id===seededItem.id),\`archived item stock leaked into active snapshot for \${site}\`);\n}`;

const migrated = source
  .replace(oldSchemaAssertion, 'assert.equal(health.data.schema,"008");')
  .replace(oldEmployeeStocktakeAssertion, permissionDrivenEmployeeEditAssertion)
  .replace(
    oldSupervisorReceiveDefaultAssertion,
    `const supervisorReceiveDefault = await request("/api/inventory/receive-default",{\n  method:"POST",cookie:supervisor.cookie,\n  body:{site:"fuxing",catalogKey:"beef",locationCode:"fuxing-four"}\n});\nassert.equal(supervisorReceiveDefault.response.status,403);\nassert.equal(supervisorReceiveDefault.data.error,"RECEIVE_DEFAULT_MANAGER_REQUIRED");`
  )
  .replace(oldAllSiteViewAssertion, allSiteSnapshotRegression);

await import(`data:text/javascript;base64,${Buffer.from(migrated).toString("base64")}`);
await import("./catalog-stocktake-regression-client.mjs");
await import("./receiving-default-regression-client.mjs");

// The legacy API regression intentionally exercises historical fixture codes.
// Browser certification must run against the canonical production location codes
// consumed by inventory-cloud, otherwise timing determines whether default rows
// are observed before an authoritative 200 snapshot filters legacy locations out.
await import("./canonicalize-browser-inventory-fixture.mjs");
