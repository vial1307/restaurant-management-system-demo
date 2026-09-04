import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

const api = read("src/vps-api.js");
const businessSync = read("src/business-state-sync.js");
const uiRefresh = read("src/ui-refresh.js");
const app = read("src/app.js");
const deploy = read("vps/scripts/deploy-api.sh");

assert.match(api, /const receiveDefaultsCache = new Map\(\)/, "receive-default requests must have a shared request cache");
assert.match(api, /RECEIVE_DEFAULTS_CACHE_MS\s*=\s*5000/, "receive-default burst cache window changed unexpectedly");
assert.match(api, /normalizedSites[\s\S]{0,700}receiveDefaultsCache\.get\(key\)/, "receive-default cache key must be stable across equivalent site/key ordering");
assert.match(api, /receiveDefaultsCache\.set\(key, \{ at: now, promise \}\)/, "concurrent receive-default calls must reuse the same in-flight promise");
assert.match(api, /vpsSetReceiveDefault[\s\S]{0,300}invalidateVpsReceiveDefaultsCache\(\)/, "saving a receive default must invalidate cached routing data");
assert.match(api, /vpsArchiveCatalogItem[\s\S]{0,400}invalidateVpsReceiveDefaultsCache\(\)/, "archiving catalog data must invalidate receive-default cache");
assert.match(api, /clearRuntimeCaches\(\)[\s\S]{0,250}api\/auth\/login/, "login must not inherit another session's API cache");
assert.match(api, /vpsLogout[\s\S]{0,300}clearRuntimeCaches\(\)/, "logout must clear API caches");

assert.match(businessSync, /loadedRevisionKey === key && loadedRevision === revision/, "unchanged business-state focus refresh must remain a no-op merge");
assert.match(uiRefresh, /observer\?\.disconnect\(\)/, "DOM patch observer must not observe its own mutations");
assert.match(uiRefresh, /observer\?\.takeRecords\(\)/, "DOM patch observer must discard self-generated records");
assert.match(app, /event\.detail\?\.status === "synced"\) return/, "unchanged inventory polls must not trigger a whole-app render");
assert.doesNotMatch(app, /function applyInventorySearchDom[\s\S]{0,2500}render\(\)/, "inventory search must remain local-DOM filtered");

assert.match(deploy, /SOURCE_BEFORE=.*rev-parse HEAD/, "deploy must capture the source revision before pulling");
assert.match(deploy, /SOURCE_AFTER=.*rev-parse HEAD/, "deploy must capture the source revision after pulling");
assert.match(deploy, /KITCHEN_DEPLOY_REEXEC/, "deploy must reload itself when git pull changes deployment logic");
assert.match(deploy, /exec \/usr\/bin\/bash .*deploy-api\.sh/, "deploy self-reload must execute the newly pulled script");
assert.match(deploy, /docker run --rm[\s\S]{0,400}node:22-alpine[\s\S]{0,200}stamp-frontend-release\.mjs/, "frontend release stamping must run inside the pinned Node container");
assert.doesNotMatch(deploy, /^node .*stamp-frontend-release\.mjs/m, "deployment must not require Node.js installed on the VPS host");

console.log("PERFORMANCE_REGRESSION_OK");
