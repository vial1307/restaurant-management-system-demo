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
assert(source.includes(oldEmployeeStocktakeAssertion), "employee stocktake regression changed; update v6 runner explicitly");

const oldSupervisorReceiveDefaultAssertion = `assert.equal((await request("/api/inventory/receive-default",{\n  method:"POST",cookie:supervisor.cookie,\n  body:{site:"fuxing",catalogKey:"beef",locationCode:"fuxing-four"}\n})).response.status,200);`;
assert(source.includes(oldSupervisorReceiveDefaultAssertion), "supervisor receive-default regression changed; update v6 runner explicitly");

const oldAllSiteViewAssertion = `for (const site of ["fuxing","yongji","central"]) {\n  assert.equal((await inventory(admin.cookie,site)).response.status,200,\`admin cannot view \${site}\`);\n}`;
assert(source.includes(oldAllSiteViewAssertion), "all-site inventory regression changed; update snapshot integrity injection explicitly");

const oldSharedStaffFixture = `shared:{staff:[{id:"staff-a",name:"A",role:"employee",area:"noodles",hourlyRate:200,active:true,pin:""}]},`;
assert(source.includes(oldSharedStaffFixture), "legacy workforce fixture changed; update scoped workforce injection explicitly");
const scopedSharedStaffFixture = `shared:{staff:[{id:"staff-a",name:"A",role:"employee",area:"noodles",hourlyRate:200,active:true,pin:""},{id:"staff-employee",name:"employeefx",role:"employee",area:"soup",hourlyRate:220,active:true,pin:""},{id:"staff-parttime",name:"parttimefx",role:"parttime",area:"seafood",hourlyRate:225,active:true,pin:""}]},`;

const oldEmployeeStateRegression = `const employeeStateRead = await request("/api/business-state/fuxing",{cookie:employee.cookie});\nassert.equal(employeeStateRead.response.status,200);\nassert.equal(employeeStateRead.data.modules.settings,undefined,"employee must not read settings state");\nassert.equal(employeeStateRead.data.modules.attendance.payroll.overtimeRate,1.34);\nconst employeeStateSave = await request("/api/business-state/fuxing",{\n  method:"POST",cookie:employee.cookie,\n  body:{modules:{settings:{reservationBuffer:99},attendance:{attendance:[{id:"clock-test"}],payroll:{overtimeRate:1.5}}}}\n});\nassert.equal(employeeStateSave.response.status,200);\nassert.deepEqual(employeeStateSave.data.savedModules,["attendance"]);\nconst protectedStateRead = await request("/api/business-state/fuxing",{cookie:admin.cookie});\nassert.equal(protectedStateRead.data.modules.settings.reservationBuffer,3,"unauthorized settings write was accepted");\nassert.equal(protectedStateRead.data.modules.attendance.payroll.overtimeRate,1.5);`;
assert(source.includes(oldEmployeeStateRegression), "legacy employee business-state regression changed; update workforce record-scope injection explicitly");

const scopedEmployeeStateRegression = `const employeeStateRead = await request("/api/business-state/fuxing",{cookie:employee.cookie});\nassert.equal(employeeStateRead.response.status,200);\nassert.equal(employeeStateRead.data.modules.settings,undefined,"employee must not read settings state");\nassert.equal(employeeStateRead.data.modules.attendance.payroll.overtimeRate,1.34);\nassert.deepEqual(employeeStateRead.data.modules.attendance.attendance,[],"employee must not receive coworker attendance rows");\nconst coworkerStaff = employeeStateRead.data.modules.shared.staff.find((member)=>member.id==="staff-a");\nconst ownStaff = employeeStateRead.data.modules.shared.staff.find((member)=>member.id==="staff-employee");\nconst parttimeStaff = employeeStateRead.data.modules.shared.staff.find((member)=>member.id==="staff-parttime");\nassert.equal(coworkerStaff.hourlyRate,undefined,"employee must not receive coworker hourly rate");\nassert.equal(parttimeStaff.hourlyRate,undefined,"employee must not receive part-time coworker hourly rate");\nassert.equal(ownStaff.hourlyRate,220,"employee must retain own hourly rate for own wage calculation");\nconst employeeStateSave = await request("/api/business-state/fuxing",{\n  method:"POST",cookie:employee.cookie,\n  body:{modules:{settings:{reservationBuffer:99},attendance:{attendance:[{\n    id:"clock-test",date:"2026-09-04",staffId:"staff-employee",staffName:"tampered",area:"meat",hourlyRate:9999,\n    scheduledStart:"23:59",clockIn:"2026-09-04T09:00:00.000Z",clockOut:null,breakMinutes:999,note:"self clock in"\n  }],payroll:{overtimeRate:1.34}}}}\n});\nassert.equal(employeeStateSave.response.status,200);\nassert.deepEqual(employeeStateSave.data.savedModules,["attendance"]);\nconst protectedStateRead = await request("/api/business-state/fuxing",{cookie:admin.cookie});\nassert.equal(protectedStateRead.data.modules.settings.reservationBuffer,3,"unauthorized settings write was accepted");\nassert.equal(protectedStateRead.data.modules.attendance.payroll.overtimeRate,1.34,"employee must not mutate payroll policy");\nconst protectedClock = protectedStateRead.data.modules.attendance.attendance.find((entry)=>entry.id==="clock-test");\nassert.equal(protectedClock.staffId,"staff-employee");\nassert.equal(protectedClock.staffName,"employeefx","self-service staff name must be server canonical");\nassert.equal(protectedClock.area,"soup","self-service work area must be server canonical");\nassert.equal(protectedClock.hourlyRate,220,"self-service hourly rate must be server canonical");\nassert.equal(protectedClock.breakMinutes,0,"self-service must not inject payroll-affecting break minutes");`;

const allSiteSnapshotRegression = `${oldAllSiteViewAssertion}\n\nfunction assertInventorySnapshotIntegrity(snapshot, site) {\n  assert.equal(snapshot?.site, site, \`snapshot site mismatch for \${site}\`);\n  assert(Array.isArray(snapshot?.items), \`items missing for \${site}\`);\n  assert(Array.isArray(snapshot?.locations), \`locations missing for \${site}\`);\n  assert(Array.isArray(snapshot?.stock), \`stock missing for \${site}\`);\n  const itemIds = new Set(snapshot.items.map((item) => item.id));\n  const locationIds = new Set(snapshot.locations.map((location) => location.id));\n  for (const row of snapshot.stock) {\n    assert(itemIds.has(row.item_id), \`orphan/inactive item stock leaked into \${site} snapshot: \${row.item_id}\`);\n    assert(locationIds.has(row.location_id), \`inactive/foreign location stock leaked into \${site} snapshot: \${row.location_id}\`);\n  }\n}\n\nfor (const [site, locationCode] of [["central","central-freezer"],["fuxing","fuxing-freezer"],["yongji","yongji-freezer"]]) {\n  const itemKey = \`\${site}:snapshot-archive-regression\`;\n  const created = await request("/api/inventory/catalog/sync",{\n    method:"POST",cookie:admin.cookie,\n    body:{item:{\n      key:itemKey,catalog_key:\`snapshot-archive-\${site}\`,zh:\`快照封存測試-\${site}\`,vi:\`Kiểm thử snapshot archive \${site}\`,\n      unit:"包",work_area:"noodles",storage_only:true,\n      locations:[{code:locationCode,quantity:3,minimum:1}]\n    }}\n  });\n  assert.equal(created.response.status,200,\`catalog seed failed for \${site}\`);\n\n  const beforeArchive = await inventory(admin.cookie,site);\n  assert.equal(beforeArchive.response.status,200);\n  assertInventorySnapshotIntegrity(beforeArchive.data,site);\n  const seededItem = beforeArchive.data.items.find((item)=>item.item_key===itemKey);\n  assert(seededItem,\`seeded item missing before archive for \${site}\`);\n  assert(beforeArchive.data.stock.some((row)=>row.item_id===seededItem.id),\`seeded stock missing before archive for \${site}\`);\n\n  const archived = await request("/api/inventory/catalog/archive",{\n    method:"POST",cookie:admin.cookie,body:{itemKey}\n  });\n  assert.equal(archived.response.status,200,\`archive failed for \${site}\`);\n  assert.equal(archived.data.archived,true);\n\n  const afterArchive = await inventory(admin.cookie,site);\n  assert.equal(afterArchive.response.status,200);\n  assertInventorySnapshotIntegrity(afterArchive.data,site);\n  assert(!afterArchive.data.items.some((item)=>item.id===seededItem.id || item.item_key===itemKey),\`archived item leaked into item list for \${site}\`);\n  assert(!afterArchive.data.stock.some((row)=>row.item_id===seededItem.id),\`archived item stock leaked into active snapshot for \${site}\`);\n}`;

const migrated = source
  .replace(oldSchemaAssertion, 'assert.equal(health.data.schema,"008");')
  .replace(oldSharedStaffFixture, scopedSharedStaffFixture)
  .replace(oldEmployeeStateRegression, scopedEmployeeStateRegression)
  .replace(
    oldEmployeeStocktakeAssertion,
    `assert.equal(employeeSet.response.status,403);\nassert.equal(employeeSet.data.error,"STOCKTAKE_ROLE_REQUIRED");`
  )
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
await import("./workforce-approval-regression-client.mjs");
await import("./workforce-request-regression-client.mjs");