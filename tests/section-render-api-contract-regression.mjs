import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const rootModule = await readFile(new URL("../src/stable-app-root.js", import.meta.url), "utf8");
const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

assert.match(rootModule, /renderSections\(sections\)/, "stable app root must expose the dedicated section render API");
assert.match(rootModule, /const SECTION_SELECTORS = Object\.freeze\(\{[\s\S]*sidebar:[\s\S]*topbar:[\s\S]*page:[\s\S]*mobileNav:/, "section API must use fixed named shell slots");
assert.match(rootModule, /function createSectionCache\(\)[\s\S]*sidebar:[\s\S]*topbar:[\s\S]*page:[\s\S]*mobileNav:[\s\S]*overlays:/, "section cache must be bounded to fixed slots");
assert.doesNotMatch(rootModule, /function createSectionCache\(\)[\s\S]*new Map\s*\(/, "section cache must not grow as an unbounded history map");
assert.match(rootModule, /cached\?\.source === markup && current\.outerHTML === cached\.normalized/, "unchanged sections may skip parsing only when source and current normalized DOM both match");
assert.match(rootModule, /function parseSection\(markup, selector\)[\s\S]*document\.createElement\("template"\)[\s\S]*matches\?\.\(selector\)/, "changed sections must be parsed independently and validated against their expected root selector");
assert.match(rootModule, /function patchSubmittedSections\(host, sections, cache\)/, "normal section rendering must patch submitted fragments rather than full app markup");
assert.doesNotMatch(rootModule, /function patchSubmittedSections\(host, sections, cache\)[\s\S]*nativeSetInnerHtml\.call\(template, composeSections\(/, "normal section patching must not parse one complete application template");
assert.match(rootModule, /if \(!patchSubmittedSections\(this, normalized, cache\)\)[\s\S]*nativeReplace\(this, composeSections\(normalized\)\)/, "missing or corrupt shell must fall back to a complete native render");
assert.match(rootModule, /set innerHTML\(value\)[\s\S]*patchStableShell\(this, markup\)/, "legacy innerHTML stable-shell compatibility path must remain present");
assert.match(rootModule, /document\.createComment\("shitu-render"\)/, "auth-layer direct-child lifecycle marker must remain present");
assert.doesNotMatch(rootModule, /Element\.prototype\.innerHTML\s*=|Object\.defineProperty\(Element\.prototype/, "section rendering must not monkey-patch native DOM prototypes");

assert.match(app, /typeof root\.renderSections === "function"/, "app render must prefer the dedicated section API when available");
assert.match(app, /root\.renderSections\(\{\s*sidebar:[\s\S]*topbar:[\s\S]*page:[\s\S]*mobileNav:[\s\S]*overlays:/, "app must submit all stable sections independently");
assert.match(app, /else root\.innerHTML = `<div class="app-shell">/, "app must retain a complete innerHTML fallback path");

console.log("SECTION_RENDER_API_CONTRACT_OK");
