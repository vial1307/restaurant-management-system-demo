import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname,"database-rbac-regression-client.mjs"),"utf8");

const oldSchema = 'assert.equal(health.data.schema,"017");';
const oldCreatedPermission = 'assert.equal(created.data.user.permissions.settings?.view,false,"client permission JSON must not override database rank");';
const oldCreatedLogin = 'assert.equal(createdLogin.data.user.permissions.settings?.view,false);';

assert(source.includes(oldSchema),"database RBAC schema assertion changed; update the schema-018 adapter explicitly");
assert(source.includes(oldCreatedPermission),"database RBAC permission expectation changed; update the schema-018 adapter explicitly");
assert(source.includes(oldCreatedLogin),"database RBAC login expectation changed; update the schema-018 adapter explicitly");

const migrated = source
  .replace(oldSchema,'assert.equal(health.data.schema,"018");')
  .replace(
    oldCreatedPermission,
    'assert.equal(created.data.user.permission_overrides.settings?.view,true,"schema-018 explicit override must be stored separately from role defaults");\nassert.equal(created.data.user.permissions.settings?.view,true,"schema-018 explicit user override must beat the database role default");\nassert.equal(created.data.user.permissions.settings?.edit,true);'
  )
  .replace(oldCreatedLogin,'assert.equal(createdLogin.data.user.permissions.settings?.view,true);\nassert.equal(createdLogin.data.user.permissions.settings?.edit,true);');

await import(`data:text/javascript;base64,${Buffer.from(migrated).toString("base64")}`);
