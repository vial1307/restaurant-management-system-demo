import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = fs.readFileSync(
  path.join(root, "vps/database/migrations/007_fuxing_large_freezer_stocktake_20260909.sql"),
  "utf8"
);

assert.match(migration, /code='fuxing-large-freezer'/, "stocktake must target canonical Fuxing large-freezer location");
assert.match(migration, /site='fuxing'/, "stocktake must remain site-scoped to Fuxing");
assert.doesNotMatch(migration, /site='(?:yongji|central)'/, "stocktake must not touch Yongji or central inventory");
assert.doesNotMatch(migration, /set\s+minimum_quantity\s*=/i, "stocktake must not overwrite configured minimums");
assert.match(migration, /v_applied <> 51/, "migration must assert all 51 supplied stock rows were processed");
assert.match(migration, /FUXING_STOCKTAKE_VERIFY_FAILED/, "each write must be read back and verified inside the transaction");
assert.match(migration, /raw_detail/, "mixed package\/weight source detail must remain auditable");

const parsed = new Map();
for (const match of migration.matchAll(/\('([^']+)','[^']*','[^']*','([^']+)','[^']+',([0-9]+)(?:::numeric)?,'[^']*'\)/g)) {
  parsed.set(match[1], { unit: match[2], quantity: Number(match[3]) });
}

const expected = new Map([
  ["fuxing:freezer-beef-noodle-broth", ["包",29]],
  ["fuxing:freezer-clear-stew-broth", ["包",25]],
  ["fuxing:freezer-kombu-broth-large", ["包",21]],
  ["fuxing:freezer-kombu-broth-small", ["包",40]],
  ["fuxing:freezer-taro-chicken-soup", ["包",5]],
  ["fuxing:freezer-light-mala-broth", ["包",93]],
  ["fuxing:freezer-heavy-mala-broth", ["包",36]],
  ["fuxing:oxtail-rice", ["包",91]],
  ["fuxing:freezer-oxtail-meat-2kg", ["包",7]],
  ["fuxing:freezer-beef-bag", ["包",7]],
  ["fuxing:freezer-beef-tendon-3kg", ["包",0]],
  ["fuxing:freezer-braised-tofu", ["包",110]],
  ["fuxing:freezer-braised-duck-wing", ["包",32]],
  ["fuxing:freezer-braised-duck-tongue", ["包",56]],
  ["fuxing:freezer-braised-duck-intestine", ["包",94]],
  ["fuxing:freezer-tiger-skin-chicken-feet", ["包",75]],
  ["fuxing:freezer-rice-cake", ["包",30]],
  ["fuxing:freezer-tender-beef", ["包",21]],
  ["fuxing:freezer-sichuan-mala-broth", ["包",35]],
  ["fuxing:freezer-noodle-oil-1kg", ["包",57]],
  ["fuxing:freezer-heavy-mala-oil", ["包",39]],
  ["fuxing:freezer-yellow-throat", ["包",4]],
  ["fuxing:duck-intestine", ["包",4]],
  ["fuxing:freezer-frog", ["包",49]],
  ["fuxing:freezer-large-intestine", ["包",60]],
  ["fuxing:freezer-braised-tripe", ["包",130]],
  ["fuxing:freezer-grass-prawn", ["箱",0]],
  ["fuxing:freezer-french-bread", ["條",71]],
  ["fuxing:freezer-pr-short-rib", ["塊",1]],
  ["fuxing:freezer-pr-marbled-beef", ["塊",0]],
  ["fuxing:freezer-ch-marbled-beef", ["塊",1]],
  ["fuxing:freezer-lamb-shoulder", ["塊",3]],
  ["fuxing:freezer-ribeye", ["塊",3]],
  ["fuxing:freezer-yellow-beef-brisket", ["塊",6]],
  ["fuxing:freezer-wagyu", ["塊",0]],
  ["fuxing:freezer-pork-collar-box", ["條",7]],
  ["fuxing:freezer-hell-tripe", ["包",27]],
  ["fuxing:freezer-rice-sauce-180g", ["包",28]],
  ["fuxing:freezer-hell-beef-rice", ["包",27]],
  ["fuxing:freezer-sous-vide-steak", ["包",44]],
  ["fuxing:freezer-secret-garlic-sauce", ["包",50]],
  ["fuxing:freezer-mild-dipping-sauce", ["包",20]],
  ["fuxing:frozen-noodles", ["片",30]],
  ["fuxing:freezer-crispy-ribs", ["斤",3]],
  ["fuxing:freezer-fried-taro", ["包",5]],
  ["fuxing:freezer-fried-squid", ["包",1]],
  ["fuxing:freezer-buniu-concentrate", ["包",3]],
  ["fuxing:freezer-sous-vide-chicken", ["包",51]],
  ["fuxing:freezer-pork-knuckle", ["包",6]],
  ["fuxing:freezer-sous-vide-pork-shoulder", ["包",10]],
  ["fuxing:freezer-croissant", ["個",15]],
]);

assert.equal(parsed.size, 51, `expected 51 unique stocktake rows, got ${parsed.size}`);
for (const [key, [unit, quantity]] of expected) {
  assert.deepEqual(parsed.get(key), { unit, quantity }, `unexpected stocktake mapping for ${key}`);
}

assert.match(migration, /29包 \+ 22560g散量/, "beef-noodle broth residual grams must be preserved");
assert.match(migration, /25包 \+ 15160g散量/, "clear broth residual grams must be preserved");
assert.match(migration, /4包 \+ 880g散量/, "yellow-throat residual grams must be preserved");
assert.match(migration, /4包 \+ 749g散量/, "duck-intestine residual grams must be preserved");
assert.match(migration, /1箱 = 30片/, "frozen-noodle carton conversion must remain explicit");

console.log("FUXING_LARGE_FREEZER_STOCKTAKE_REGRESSION_OK");
