import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

const renderStart = app.indexOf("function render() {");
const renderEnd = app.indexOf("\nfunction renderWhenAuthorized()", renderStart);
assert.ok(renderStart >= 0 && renderEnd > renderStart, "render() must remain locatable");
const renderSource = app.slice(renderStart, renderEnd);

assert.match(
  renderSource,
  /const\s+inventorySearchInput\s*=\s*root\.querySelector\(\s*["']\[data-field=[\\"']inventorySearch[\\"']\]["']\s*\)/,
  "render() must continue locating the inventory search input",
);
assert.match(
  renderSource,
  /prepareSearchNeedle\s*\(\s*inventorySearchInput\?\.value\s*\|\|\s*["']["']\s*\)/,
  "render-time search reapply must normalize the current input value",
);
assert.match(
  renderSource,
  /if\s*\([^)]*inventorySearchInput[^)]*&&[^)]*(?:inventorySearchNeedle|prepareSearchNeedle)[^)]*\)\s*applyInventorySearchDom\s*\(\s*inventorySearchInput\s*\)/,
  "render-time inventory search must run only for a non-empty normalized needle",
);
assert.doesNotMatch(
  renderSource,
  /if\s*\(\s*inventorySearchInput\s*\)\s*applyInventorySearchDom\s*\(\s*inventorySearchInput\s*\)/,
  "render() must not scan inventory rows just because an empty search input exists",
);

const handlerStart = app.indexOf("function handleInventorySearchEvent(event)");
const handlerEnd = app.indexOf("\nroot.addEventListener(\"submit\"", handlerStart);
assert.ok(handlerStart >= 0 && handlerEnd > handlerStart, "inventory search handlers must remain locatable");
const handlerSource = app.slice(handlerStart, handlerEnd);
assert.match(handlerSource, /applyInventorySearchDom\s*\(\s*input\s*\)/, "direct input/search handler must still apply search DOM updates");
assert.match(handlerSource, /root\.addEventListener\(\s*["']input["']\s*,\s*handleInventorySearchEvent\s*\)/, "input handler must remain installed");
assert.match(handlerSource, /root\.addEventListener\(\s*["']search["']\s*,\s*handleInventorySearchEvent\s*\)/, "search handler must remain installed");
assert.match(handlerSource, /root\.addEventListener\(\s*["']compositionend["'][\s\S]*applyInventorySearchDom\s*\(\s*event\.target\s*\)/, "compositionend must still apply the live search update");

console.log("INVENTORY_RENDER_SEARCH_BYPASS_REGRESSION_OK");
