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

const migrated = source
  .replace(oldSchemaAssertion, 'assert.equal(health.data.schema,"007");')
  .replace(
    oldEmployeeStocktakeAssertion,
    `assert.equal(employeeSet.response.status,403);\nassert.equal(employeeSet.data.error,"STOCKTAKE_ROLE_REQUIRED");`
  )
  .replace(
    oldSupervisorReceiveDefaultAssertion,
    `const supervisorReceiveDefault = await request("/api/inventory/receive-default",{\n  method:"POST",cookie:supervisor.cookie,\n  body:{site:"fuxing",catalogKey:"beef",locationCode:"fuxing-four"}\n});\nassert.equal(supervisorReceiveDefault.response.status,403);\nassert.equal(supervisorReceiveDefault.data.error,"RECEIVE_DEFAULT_MANAGER_REQUIRED");`
  );

await import(`data:text/javascript;base64,${Buffer.from(migrated).toString("base64")}`);
await import("./catalog-stocktake-regression-client.mjs");
await import("./receiving-default-regression-client.mjs");
