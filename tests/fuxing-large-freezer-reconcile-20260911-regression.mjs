import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = fs.readFileSync(
  path.join(root, "vps/database/migrations/009_fuxing_large_freezer_authoritative_reconcile_20260911.sql"),
  "utf8"
);

assert.match(migration, /code='fuxing-large-freezer'/, "reconciliation must target canonical Fuxing 大冷凍");
assert.match(migration, /site='fuxing'/, "reconciliation must be Fuxing-scoped");
assert.doesNotMatch(migration, /site='(?:yongji|central)'/, "reconciliation must not touch other sites");
assert.doesNotMatch(migration, /set\s+minimum_quantity\s*=/i, "existing minimum quantities must be preserved");
assert.match(migration, /scope','fuxing-large-freezer-only'/, "audit metadata must state the exact location scope");
assert.match(migration, /v_applied <> 51/, "all 51 user-confirmed rows must be processed");
assert.match(migration, /FUXING_STOCKTAKE_VERIFY_FAILED/, "every quantity must be read back before commit");
assert.match(migration, /stocktake_reconcile/, "the full reconciliation must be auditable");

const rows = new Map();
for (const match of migration.matchAll(/\('([^']+)','([^']*)','([^']*)','([^']*)','([^']*)',([0-9]+)(?:::numeric)?,'([^']*)'\)/g)) {
  rows.set(match[1], {
    zh: match[2],
    vi: match[3],
    unit: match[4],
    area: match[5],
    quantity: Number(match[6]),
    raw: match[7],
  });
}

const expected = new Map([
  ["fuxing:freezer-beef-noodle-broth",20],["fuxing:freezer-clear-stew-broth",20],
  ["fuxing:freezer-kombu-broth-large",21],["fuxing:freezer-kombu-broth-small",40],
  ["fuxing:freezer-taro-chicken-soup",5],["fuxing:freezer-light-mala-broth",78],
  ["fuxing:freezer-heavy-mala-broth",67],["fuxing:oxtail-rice",91],
  ["fuxing:freezer-oxtail-meat-2kg",9],["fuxing:freezer-beef-bag",7],
  ["fuxing:freezer-beef-tendon-3kg",0],["fuxing:freezer-braised-tofu",105],
  ["fuxing:freezer-braised-duck-wing",57],["fuxing:freezer-braised-duck-tongue",54],
  ["fuxing:freezer-braised-duck-intestine",94],["fuxing:freezer-tiger-skin-chicken-feet",75],
  ["fuxing:freezer-rice-cake",26],["fuxing:freezer-tender-beef",17],
  ["fuxing:freezer-sichuan-mala-broth",35],["fuxing:freezer-noodle-oil-1kg",57],
  ["fuxing:freezer-heavy-mala-oil",39],["fuxing:freezer-yellow-throat",4],
  ["fuxing:duck-intestine",4],["fuxing:freezer-frog",31],
  ["fuxing:freezer-large-intestine",40],["fuxing:freezer-braised-tripe",110],
  ["fuxing:freezer-grass-prawn",0],["fuxing:freezer-french-bread",71],
  ["fuxing:freezer-pr-short-rib",1],["fuxing:freezer-pr-marbled-beef",0],
  ["fuxing:freezer-ch-marbled-beef",1],["fuxing:freezer-lamb-shoulder",3],
  ["fuxing:freezer-ribeye",3],["fuxing:freezer-yellow-beef-brisket",6],
  ["fuxing:freezer-wagyu",0],["fuxing:freezer-pork-collar-box",7],
  ["fuxing:freezer-hell-tripe",24],["fuxing:freezer-rice-sauce-180g",28],
  ["fuxing:freezer-hell-beef-rice",18],["fuxing:freezer-sous-vide-steak",44],
  ["fuxing:freezer-secret-garlic-sauce",50],["fuxing:freezer-mild-dipping-sauce",20],
  ["fuxing:frozen-noodles",30],["fuxing:freezer-crispy-ribs",3],
  ["fuxing:freezer-fried-taro",3],["fuxing:freezer-fried-squid",1],
  ["fuxing:freezer-buniu-concentrate",3],["fuxing:freezer-sous-vide-chicken",18],
  ["fuxing:freezer-pork-knuckle",6],["fuxing:freezer-sous-vide-pork-shoulder",5],
  ["fuxing:freezer-croissant",15],
]);

assert.equal(rows.size, 51, `expected 51 exact product rows, got ${rows.size}`);
for (const [key, quantity] of expected) {
  assert.equal(rows.get(key)?.quantity, quantity, `wrong quantity for ${key}`);
}

assert.equal(rows.get("fuxing:freezer-french-bread")?.unit, "條", "法國麵包 unit must be 條");
assert.equal(rows.get("fuxing:freezer-pr-short-rib")?.unit, "塊", "PR牛小排 unit must be 塊");
assert.equal(rows.get("fuxing:freezer-pork-collar-box")?.unit, "條", "梅花豬 unit must be 條");
assert.equal(rows.get("fuxing:frozen-noodles")?.unit, "片", "冷凍麵 database unit must be 片");
assert.match(rows.get("fuxing:frozen-noodles")?.raw || "", /1箱 = 30片/, "冷凍麵 carton conversion must be retained");
assert.match(rows.get("fuxing:freezer-sous-vide-chicken")?.raw || "", /另140片/, "舒肥雞 secondary piece count must be preserved without invented conversion");

console.log("FUXING_LARGE_FREEZER_RECONCILE_20260911_OK");
