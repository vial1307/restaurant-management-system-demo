import assert from "node:assert/strict";
import fs from "node:fs";

const authLayer = fs.readFileSync(new URL("../src/auth-layer.js", import.meta.url), "utf8");

assert.match(
  authLayer,
  /function loadStock\(\)[\s\S]{0,360}const items = Array\.isArray\(saved\) \? saved : \[\];[\s\S]{0,180}return items;/,
  "central loadStock must honor an explicit persisted PostgreSQL projection even when it is empty",
);

assert.doesNotMatch(
  authLayer,
  /function loadStock\(\)[\s\S]{0,500}saved\.length/,
  "central empty authoritative cache must not be treated as missing data",
);

assert.doesNotMatch(
  authLayer,
  /DEFAULT_PRODUCTS|structuredClone\([^)]*DEFAULT_PRODUCTS/,
  "central cache recovery must never reseed a hard-coded product catalog",
);

console.log("CENTRAL_EMPTY_CACHE_RESEED_CONTRACT_OK");
