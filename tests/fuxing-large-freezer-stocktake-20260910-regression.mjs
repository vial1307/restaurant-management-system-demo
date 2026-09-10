import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = fs.readFileSync(
  path.join(root, "vps/database/migrations/008_fuxing_large_freezer_stocktake_20260910.sql"),
  "utf8"
);

assert.match(migration, /code='fuxing-large-freezer'/, "stocktake must target canonical Fuxing large-freezer location");
assert.match(migration, /site='fuxing'/, "stocktake must remain scoped to Fuxing");
assert.doesNotMatch(migration, /site='(?:yongji|central)'/, "stocktake must not touch Yongji or central inventory");
assert.doesNotMatch(migration, /set\s+minimum_quantity\s*=/i, "stocktake must preserve configured minimum quantities");
assert.match(migration, /set active=true/, "items present in the current physical stocktake must remain visible in the active catalog");
assert.match(migration, /v_applied <> 51/, "migration must assert all 51 supplied rows were processed");
assert.match(migration, /FUXING_STOCKTAKE_VERIFY_FAILED/, "each quantity write must be read back inside the transaction");
assert.match(migration, /raw_detail/, "mixed-unit source detail must remain auditable");

const parsed = new Map();
for (const match of migration.matchAll(/\('([^']+)',([0-9]+)(?:::numeric)?,'([^']*)'\)/g)) {
  parsed.set(match[1], { quantity: Number(match[2]), rawDetail: match[3] });
}

const expected = new Map([
  ["fuxing:freezer-beef-noodle-broth",20],
  ["fuxing:freezer-clear-stew-broth",20],
  ["fuxing:freezer-kombu-broth-large",21],
  ["fuxing:freezer-kombu-broth-small",40],
  ["fuxing:freezer-taro-chicken-soup",5],
  ["fuxing:freezer-light-mala-broth",78],
  ["fuxing:freezer-heavy-mala-broth",67],
  ["fuxing:oxtail-rice",91],
  ["fuxing:freezer-oxtail-meat-2kg",9],
  ["fuxing:freezer-beef-bag",7],
  ["fuxing:freezer-beef-tendon-3kg",0],
  ["fuxing:freezer-braised-tofu",105],
  ["fuxing:freezer-braised-duck-wing",57],
  ["fuxing:freezer-braised-duck-tongue",54],
  ["fuxing:freezer-braised-duck-intestine",94],
  ["fuxing:freezer-tiger-skin-chicken-feet",75],
  ["fuxing:freezer-rice-cake",26],
  ["fuxing:freezer-tender-beef",17],
  ["fuxing:freezer-sichuan-mala-broth",35],
  ["fuxing:freezer-noodle-oil-1kg",57],
  ["fuxing:freezer-heavy-mala-oil",39],
  ["fuxing:freezer-yellow-throat",4],
  ["fuxing:duck-intestine",4],
  ["fuxing:freezer-frog",31],
  ["fuxing:freezer-large-intestine",40],
  ["fuxing:freezer-braised-tripe",110],
  ["fuxing:freezer-grass-prawn",0],
  ["fuxing:freezer-french-bread",71],
  ["fuxing:freezer-pr-short-rib",1],
  ["fuxing:freezer-pr-marbled-beef",0],
  ["fuxing:freezer-ch-marbled-beef",1],
  ["fuxing:freezer-lamb-shoulder",3],
  ["fuxing:freezer-ribeye",3],
  ["fuxing:freezer-yellow-beef-brisket",6],
  ["fuxing:freezer-wagyu",0],
  ["fuxing:freezer-pork-collar-box",7],
  ["fuxing:freezer-hell-tripe",24],
  ["fuxing:freezer-rice-sauce-180g",28],
  ["fuxing:freezer-hell-beef-rice",18],
  ["fuxing:freezer-sous-vide-steak",44],
  ["fuxing:freezer-secret-garlic-sauce",50],
  ["fuxing:freezer-mild-dipping-sauce",20],
  ["fuxing:frozen-noodles",30],
  ["fuxing:freezer-crispy-ribs",3],
  ["fuxing:freezer-fried-taro",3],
  ["fuxing:freezer-fried-squid",1],
  ["fuxing:freezer-buniu-concentrate",3],
  ["fuxing:freezer-sous-vide-chicken",18],
  ["fuxing:freezer-pork-knuckle",6],
  ["fuxing:freezer-sous-vide-pork-shoulder",5],
  ["fuxing:freezer-croissant",15],
]);

assert.equal(parsed.size, 51, `expected 51 unique stocktake rows, got ${parsed.size}`);
for (const [key, quantity] of expected) {
  assert.equal(parsed.get(key)?.quantity, quantity, `unexpected stocktake quantity for ${key}`);
}

assert.match(parsed.get("fuxing:freezer-beef-noodle-broth")?.rawDetail || "", /20包 \+ 14290g散量/, "beef-noodle broth residual grams must be preserved");
assert.match(parsed.get("fuxing:freezer-clear-stew-broth")?.rawDetail || "", /20包 \+ 11780g散量/, "clear broth residual grams must be preserved");
assert.match(parsed.get("fuxing:freezer-yellow-throat")?.rawDetail || "", /4包 \+ 880g散量/, "yellow-throat residual grams must be preserved");
assert.match(parsed.get("fuxing:duck-intestine")?.rawDetail || "", /4包 \+ 749g散量/, "duck-intestine residual grams must be preserved");
assert.match(parsed.get("fuxing:frozen-noodles")?.rawDetail || "", /1箱 = 30片/, "frozen-noodle carton conversion must remain explicit");
assert.match(parsed.get("fuxing:freezer-sous-vide-chicken")?.rawDetail || "", /44片 \+ 96片/, "sous-vide chicken extra pieces must be preserved without inferred package conversion");

console.log("FUXING_LARGE_FREEZER_STOCKTAKE_20260910_OK");
