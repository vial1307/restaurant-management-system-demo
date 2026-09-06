import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "./business-state-regression-client.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(__dirname, "api-regression.mjs");
const source = fs.readFileSync(file, "utf8");
const oldAssertion = 'assert.equal(health.data.schema,"005");';
assert(source.includes(oldAssertion), "legacy API regression schema assertion changed; update v6 runner explicitly");
const migrated = source.replace(oldAssertion, 'assert.equal(health.data.schema,"006");');
await import(`data:text/javascript;base64,${Buffer.from(migrated).toString("base64")}`);
