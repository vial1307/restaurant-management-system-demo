import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

assert.match(app, /import\s*\{[^}]*prepareSearchCorpus[^}]*prepareSearchNeedle[^}]*preparedSearchMatches[^}]*\}\s*from\s*["']\.\/search-utils\.js["']|import\s*\{[^}]*preparedSearchMatches[^}]*prepareSearchCorpus[^}]*prepareSearchNeedle[^}]*\}\s*from\s*["']\.\/search-utils\.js["']|import\s*\{[^}]*prepareSearchNeedle[^}]*prepareSearchCorpus[^}]*preparedSearchMatches[^}]*\}\s*from\s*["']\.\/search-utils\.js["']/, "app must import prepared search primitives");
assert.match(app, /const\s+inventorySearchCorpusCache\s*=\s*new\s+WeakMap\s*\(\s*\)/, "inventory search corpus cache must be a WeakMap");
assert.match(app, /function\s+inventoryRowSearchCorpus\s*\(\s*row\s*\)/, "inventory row corpus helper must exist");
assert.match(app, /inventorySearchCorpusCache\.has\(row\)/, "row corpus helper must check the WeakMap before computing");
assert.match(app, /inventorySearchCorpusCache\.get\(row\)/, "row corpus helper must reuse cached corpus");
assert.match(app, /prepareSearchCorpus\s*\(\s*row\.textContent\s*\|\|\s*["']["']\s*\)/, "row corpus must be prepared from the current row text on cache miss");
assert.match(app, /inventorySearchCorpusCache\.set\(row\s*,\s*corpus\)/, "row corpus helper must store prepared corpus in the WeakMap");

const start = app.indexOf("function applyInventorySearchDom(input)");
const end = app.indexOf("\nfunction handleInventorySearchEvent", start);
assert.ok(start >= 0 && end > start, "applyInventorySearchDom must remain locatable");
const source = app.slice(start, end);
const firstRowLoop = source.indexOf('table.querySelectorAll(".inventory-group").forEach');
assert.ok(firstRowLoop > 0, "inventory group loop must remain locatable");
assert.match(source.slice(0, firstRowLoop), /const\s+needle\s*=\s*prepareSearchNeedle\s*\(\s*query\s*\)/, "inventory search must prepare the query once before row loops");
const preparedMatchPattern = /const\s+visible\s*=\s*!needle\s*\|\|\s*preparedSearchMatches\s*\(\s*inventoryRowSearchCorpus\(row\)\s*,\s*needle\s*\)/g;
assert.equal([...source.matchAll(preparedMatchPattern)].length, 2, "grouped and loose rows must short-circuit empty queries before preparing row corpus");
assert.doesNotMatch(source, /searchMatches\s*\(\s*row\.textContent/, "inventory row loops must not rebuild search corpus through searchMatches");

console.log("INVENTORY_SEARCH_PREPARED_CORPUS_CONTRACT_OK");
