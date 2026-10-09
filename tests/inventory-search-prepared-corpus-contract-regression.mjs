import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

assert.match(
  app,
  /import\s*\{[^}]*ingredientNameSearchMatches[^}]*prepareIngredientNameSearchCorpus[^}]*prepareIngredientNameSearchNeedle[^}]*\}\s*from\s*["']\.\/search-utils\.js["']/,
  "Inventory app must import literal ingredient-name search primitives",
);
assert.match(app, /const\s+inventorySearchCorpusCache\s*=\s*new\s+WeakMap\s*\(\s*\)/, "inventory search corpus cache must be a WeakMap");
assert.match(app, /function\s+inventoryRowSearchCorpus\s*\(\s*row\s*\)/, "inventory row corpus helper must exist");
assert.match(app, /inventorySearchCorpusCache\.has\(row\)/, "row corpus helper must check the WeakMap before reuse");
assert.match(app, /inventorySearchCorpusCache\.get\(row\)/, "row corpus helper must reuse cached corpus");
assert.match(
  app,
  /const\s+corpus\s*=\s*row\.dataset\.inventorySearchCorpus\s*\|\|\s*["']["']/,
  "Inventory row search must use curated name corpus only and never rendered-text fallback",
);
assert.doesNotMatch(
  app,
  /row\.dataset\.inventorySearchCorpus\s*\|\|\s*prepareSearchCorpus\s*\(\s*row\.textContent/,
  "Inventory row search must not fall back to broad rendered text",
);
assert.match(app, /inventorySearchCorpusCache\.set\(row\s*,\s*corpus\)/, "row corpus helper must cache the literal corpus");
assert.match(app,/data-inventory-search-corpus/,"Inventory rows must carry literal search corpus metadata");
assert.match(app,/prepareIngredientNameSearchCorpus\(item\?\.label,item\?\.labelVi\)/,"Inventory row corpus must derive from actual Chinese/Vietnamese product names");
assert.match(app,/prepareIngredientNameSearchCorpus\(product\?\.label,product\?\.labelVi\)/,"aggregated product corpus must derive from actual Chinese/Vietnamese product names");

const start = app.indexOf("function applyInventorySearchDom(input)");
const end = app.indexOf("\nfunction handleInventorySearchEvent", start);
assert.ok(start >= 0 && end > start, "applyInventorySearchDom must remain locatable");
const source = app.slice(start, end);
const firstRowLoop = source.indexOf('table.querySelectorAll(".inventory-group").forEach');
assert.ok(firstRowLoop > 0, "inventory group loop must remain locatable");
assert.match(
  source.slice(0, firstRowLoop),
  /const\s+needle\s*=\s*prepareIngredientNameSearchNeedle\s*\(\s*query\s*\)/,
  "Inventory search must prepare the literal product-name query once before row loops",
);
const literalMatchPattern = /const\s+visible\s*=\s*!needle\s*\|\|\s*ingredientNameSearchMatches\s*\(\s*inventoryRowSearchCorpus\(row\)\s*,\s*needle\s*\)/g;
assert.equal([...source.matchAll(literalMatchPattern)].length, 2, "grouped and loose rows must use the same literal matcher");
assert.doesNotMatch(source, /searchMatches\s*\(\s*row\.textContent/, "Inventory row loops must not use generic phonetic search");
assert.doesNotMatch(source, /prepareSearchNeedle\s*\(/, "Inventory row search must not use generic phonetic query preparation");

console.log("INVENTORY_SEARCH_PREPARED_CORPUS_CONTRACT_OK");
