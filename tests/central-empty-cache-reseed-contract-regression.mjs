import assert from "node:assert/strict";
import fs from "node:fs";

const authLayer = fs.readFileSync(new URL("../src/auth-layer.js", import.meta.url), "utf8");

assert.match(
  authLayer,
  /function loadBaseStock\(\)[\s\S]{0,300}if \(Array\.isArray\(saved\)\) return saved;/,
  "central loadBaseStock must honor an explicit persisted array even when it is empty",
);

assert.doesNotMatch(
  authLayer,
  /function loadBaseStock\(\)[\s\S]{0,300}Array\.isArray\(saved\) && saved\.length/,
  "central empty authoritative cache must not fall through to DEFAULT_PRODUCTS",
);

console.log("CENTRAL_EMPTY_CACHE_RESEED_CONTRACT_OK");
