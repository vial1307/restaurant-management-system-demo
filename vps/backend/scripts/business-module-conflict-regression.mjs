import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corePath = path.join(__dirname, "business-module-conflict-regression-core.mjs");
const source = fs.readFileSync(corePath, "utf8");
const legacyAssertion = 'assert.equal(health.data.schema, "013", "Database Core v2 migrations are not active");';
assert(source.includes(legacyAssertion), "business module conflict schema assertion changed; update wrapper explicitly");
const migrated = source.replace(
  legacyAssertion,
  'assert.equal(health.data.schema, "014", "Database Core v2 migrations are not active");'
);

await import(`data:text/javascript;base64,${Buffer.from(migrated).toString("base64")}`);
