import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const rootModule = await readFile(new URL("../src/stable-app-root.js", import.meta.url), "utf8");
const indexHtml = await readFile(new URL("../index.html", import.meta.url), "utf8");
const vpsHtml = await readFile(new URL("../vps-entry.html", import.meta.url), "utf8");

assert.match(rootModule, /class ShituAppRoot extends HTMLElement/, "stable shell must be scoped to the Kitchen OS root custom element");
assert.doesNotMatch(rootModule, /Element\.prototype\.innerHTML\s*=|Object\.defineProperty\(Element\.prototype/, "stable shell must not monkey-patch native DOM prototypes");
assert.match(rootModule, /nativeSetInnerHtml\.call\(host, markup\)/, "full native fallback render must remain available");
assert.match(rootModule, /directChild\(host, "\.app-shell"\)/, "stable path must preserve the existing app shell");
assert.match(rootModule, /directChild\(currentShell, "\.main-shell"\)/, "stable path must preserve the existing main shell");
assert.match(rootModule, /current\.outerHTML === next\.outerHTML/, "unchanged shell sections should not be replaced unnecessarily");
assert.match(rootModule, /current\.replaceWith\(next\)/, "changed shell sections must still update with current markup");
assert.match(rootModule, /if \(!patchStableShell\(this, markup\)\) nativeReplace\(this, markup\)/, "corrupt or first render must fall back safely");

for (const [name, html] of [["index", indexHtml], ["vps", vpsHtml]]) {
  assert.match(html, /<shitu-app-root id="app"><\/shitu-app-root>/, `${name} entrypoint must use the scoped stable app root`);
  const rootModuleIndex = html.indexOf("./src/stable-app-root.js");
  const appIndex = html.indexOf("./src/app.js");
  assert.ok(rootModuleIndex >= 0 && appIndex > rootModuleIndex, `${name} entrypoint must define the stable root before app.js executes`);
}

console.log("STABLE_SHELL_STATIC_REGRESSION_OK");
