import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
const start = app.indexOf("function applyInventorySearchDom(input)");
const end = app.indexOf("\nfunction handleInventorySearchEvent", start);
assert.ok(start >= 0 && end > start, "applyInventorySearchDom must remain locatable");
const source = app.slice(start, end);

const loopMarker = 'table.querySelectorAll(".inventory-group").forEach((group) => {';
const loopStart = source.indexOf(loopMarker);
assert.ok(loopStart > 0, "inventory group loop must remain locatable");

const preLoop = source.slice(0, loopStart);
assert.match(preLoop, /const\s+itemsLabel\s*=\s*currentContext\(\)\.text\.items\s*;/, "items label must be resolved exactly once before iterating groups");

const loopEnd = source.indexOf("\n  });", loopStart);
assert.ok(loopEnd > loopStart, "inventory group loop end must remain locatable");
const loopBody = source.slice(loopStart, loopEnd);
assert.doesNotMatch(loopBody, /currentContext\s*\(/, "per-group inventory search loop must not rebuild current context");
assert.match(loopBody, /count\.textContent\s*=\s*`\$\{visibleInGroup\}\s+\$\{itemsLabel\}`/, "group count must reuse the precomputed translated items label");

console.log("INVENTORY_SEARCH_LABEL_CONTEXT_REGRESSION_OK");
