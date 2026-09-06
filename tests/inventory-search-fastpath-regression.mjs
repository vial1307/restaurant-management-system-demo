import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const fastPath = await readFile(new URL("../src/inventory-search-fastpath.js", import.meta.url), "utf8");
const indexHtml = await readFile(new URL("../index.html", import.meta.url), "utf8");
const vpsHtml = await readFile(new URL("../vps-entry.html", import.meta.url), "utf8");

assert.match(fastPath, /document\.addEventListener\("input",\s*handleSearchEvent,\s*true\)/, "fast path must run in capture phase before the legacy root bubble handler");
assert.doesNotMatch(fastPath, /stop(?:Immediate)?Propagation/, "fast path must not block the legacy handler that owns view.search");
assert.match(fastPath, /group\.classList\.remove\(GROUP_CLASS\)/, "grouped rows must be temporarily excluded from the legacy per-group loop");
assert.match(fastPath, /group\.classList\.add\(GROUP_CLASS\)/, "group class must be restored after the event");
assert.match(fastPath, /queueMicrotask\(restore\)|Promise\.resolve\(\)\.then\(restore\)/, "restoration must happen at the microtask checkpoint");
assert.match(fastPath, /searchMatches\(row\.textContent \|\| "", query\)/, "canonical search matching must be preserved");
assert.match(fastPath, /event\.type === "input" && event\.isComposing/, "IME composing input must remain deferred");

for (const [name, html] of [["index", indexHtml], ["vps", vpsHtml]]) {
  const fastIndex = html.indexOf("./src/inventory-search-fastpath.js");
  const appIndex = html.indexOf("./src/app.js");
  assert.ok(fastIndex >= 0, `${name} entrypoint must load inventory search fast path`);
  assert.ok(appIndex >= 0 && fastIndex < appIndex, `${name} entrypoint must load the fast path before app.js`);
}

console.log("INVENTORY_SEARCH_FASTPATH_REGRESSION_OK");
