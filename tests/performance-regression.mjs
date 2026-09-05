import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

const api = read("src/vps-api.js");
const inventoryCloud = read("src/inventory-cloud.js");
const businessSync = read("src/business-state-sync.js");
const uiRefresh = read("src/ui-refresh.js");
const app = read("src/app.js");
const deploy = read("vps/scripts/deploy-api.sh");
const workflow = read(".github/workflows/deploy-vps.yml");
const backendDocker = read("vps/backend/Dockerfile");
const gitignore = read(".gitignore");
const backendDockerignore = read("vps/backend/.dockerignore");

assert.match(api, /const receiveDefaultsCache = new Map\(\)/, "receive-default requests must have a shared request cache");
assert.match(api, /RECEIVE_DEFAULTS_CACHE_MS\s*=\s*5000/, "receive-default burst cache window changed unexpectedly");
assert.match(api, /normalizedSites[\s\S]{0,700}receiveDefaultsCache\.get\(key\)/, "receive-default cache key must be stable across equivalent site/key ordering");
assert.match(api, /receiveDefaultsCache\.set\(key, \{ at: now, promise \}\)/, "concurrent receive-default calls must reuse the same in-flight promise");
assert.match(api, /vpsSetReceiveDefault[\s\S]{0,300}invalidateVpsReceiveDefaultsCache\(\)/, "saving a receive default must invalidate cached routing data");
assert.match(api, /vpsArchiveCatalogItem[\s\S]{0,400}invalidateVpsReceiveDefaultsCache\(\)/, "archiving catalog data must invalidate receive-default cache");
assert.match(api, /clearRuntimeCaches\(\)[\s\S]{0,250}api\/auth\/login/, "login must not inherit another session's API cache");
assert.match(api, /let authMeInFlight = null/, "auth profile requests must share one in-flight request across startup/focus sync layers");
assert.match(api, /vpsMe\(\)[\s\S]{0,260}if \(authMeInFlight\) return authMeInFlight/, "concurrent auth profile refreshes must be deduplicated");
assert.match(api, /let adminUsersInFlight = null/, "admin user-list refreshes must share one in-flight request");
assert.match(api, /vpsListUsers\(\)[\s\S]{0,300}if \(adminUsersInFlight\) return adminUsersInFlight/, "concurrent admin account refreshes must be deduplicated");
assert.match(api, /vpsLogout[\s\S]{0,300}clearRuntimeCaches\(\)/, "logout must clear API caches");
assert.match(api, /vpsInventoryHistory[\s\S]{0,220}\/transactions\?limit=/, "inventory history must use the backend transactions route");
assert.doesNotMatch(api, /vpsInventoryHistory[\s\S]{0,220}\/history\?limit=/, "inventory history must not call the removed history route");

const receiveDefaultSave = inventoryCloud.match(/export async function cloudSetReceiveDefault\([\s\S]*?\n}\n\nfunction buildBranchCatalog/)?.[0] || "";
assert.match(receiveDefaultSave, /navigator\?\.onLine===false\) return \{ok:false/, "offline receive-default saves must fail instead of reporting local fallback success");
assert.match(receiveDefaultSave, /!\(await verifyMigration\(\)\)\) return \{ok:false/, "receive-default saves must fail while the VPS schema is unavailable");
assert.match(receiveDefaultSave, /await vpsSetReceiveDefault\([\s\S]{0,220}saveLocalReceiveDefault\(/, "receive-default local mirror must only update after the VPS confirms the write");
assert.doesNotMatch(receiveDefaultSave, /saveLocalReceiveDefault[\s\S]{0,220}await vpsSetReceiveDefault/, "receive-default saves must never write local state before PostgreSQL");
assert.doesNotMatch(receiveDefaultSave, /ok:true,fallback:true/, "receive-default writes must never report fallback success");

assert.doesNotMatch(inventoryCloud, /return \{ ok: false, fallback: true \}/, "inventory mutations must never fall back to local-only success when PostgreSQL is unavailable");
assert.match(inventoryCloud, /fallback: false, error: new Error\("INVENTORY_BACKEND_NOT_READY"\)/, "inventory mutation backend failures must be explicit so optimistic UI can roll back");

assert.match(businessSync, /loadedRevisionKey === key && loadedRevision === revision/, "unchanged business-state focus refresh must remain a no-op merge");
assert.match(uiRefresh, /observer\?\.disconnect\(\)/, "DOM patch observer must not observe its own mutations");
assert.match(uiRefresh, /observer\?\.takeRecords\(\)/, "DOM patch observer must discard self-generated records");
assert.match(app, /event\.detail\?\.status === "synced"\) return/, "unchanged inventory polls must not trigger a whole-app render");
assert.doesNotMatch(app, /function applyInventorySearchDom[\s\S]{0,2500}render\(\)/, "inventory search must remain local-DOM filtered");

assert.equal((app.match(/const receiveResult = await cloudSetReceiveDefault/g) || []).length, 2, "both product create/edit flows must verify receive-default persistence");
assert.match(app, /if \(!receiveResult\.ok\) \{[\s\S]{0,500}window\.alert/, "receive-default persistence failures must be visible instead of silently reporting a complete save");

assert.match(deploy, /KITCHEN_EXACT_TARGET_V1/, "deploy must enforce the exact-target contract");
assert.match(deploy, /DEPLOY_TARGET_REQUIRED/, "deploy must refuse an unpinned main-branch release");
assert.match(deploy, /merge-base --is-ancestor/, "deploy target must be verified as a main-branch commit");
assert.match(deploy, /reset --hard "\$\{DEPLOY_TARGET\}"/, "deploy must reset the VPS source to the exact tested commit");
assert.match(deploy, /SOURCE_BEFORE=.*rev-parse HEAD/, "deploy must capture the source revision before selecting the tested target");
assert.match(deploy, /SOURCE_AFTER=.*rev-parse HEAD/, "deploy must verify the source revision after selecting the tested target");
assert.match(deploy, /KITCHEN_DEPLOY_REEXEC/, "deploy must reload itself when the selected commit changes deployment logic");
assert.match(deploy, /exec \/usr\/bin\/bash .*deploy-api\.sh/, "deploy self-reload must execute the selected commit's script");
assert.match(deploy, /docker run --rm[\s\S]{0,400}node:22-alpine[\s\S]{0,200}stamp-frontend-release\.mjs/, "frontend release stamping must run inside the pinned Node container");
assert.doesNotMatch(deploy, /^node .*stamp-frontend-release\.mjs/m, "deployment must not require Node.js installed on the VPS host");

assert.match(workflow, /GITHUB_SHA/, "workflow must carry the tested GitHub SHA into deployment");
assert.match(workflow, /kitchen-os-deploy-target/, "workflow must transfer the tested SHA to the VPS deploy target file");
assert.match(workflow, /EXPECTED_RELEASE/, "workflow must compare the active VPS release with the tested commit");
assert.match(workflow, /full-device-regression\.mjs/, "workflow must gate deployment on full-device regression");
assert.match(workflow, /concurrency-regression\.mjs/, "workflow must gate deployment on multi-user concurrency regression");
assert.match(workflow, /TEST_WEB_BASE:\s*"http:\/\/localhost:3000"/, "browser regressions must use a hostname origin rather than an IP-literal cookie origin");
assert.match(workflow, /actions\/checkout@v7/, "CI checkout action must use the current Node 24 generation");
assert.match(workflow, /actions\/setup-node@v7/, "CI setup-node action must use the current Node 24 generation");
assert.match(workflow, /actions\/upload-artifact@v7/, "CI artifact upload action must use the current Node 24 generation");
assert.doesNotMatch(workflow, /actions\/(?:checkout@v5|setup-node@v4|upload-artifact@v4)/, "deprecated Node 20-generation CI actions must not return");

assert.equal(fs.existsSync(path.join(ROOT, "vps/backend/package-lock.json")), true, "backend dependencies must be lockfile-pinned");
assert.equal(fs.existsSync(path.join(ROOT, "tests/package-lock.json")), true, "browser test dependencies must be lockfile-pinned");
assert.match(backendDocker, /COPY package\.json package-lock\.json \.\/[\s\S]{0,80}RUN npm ci --omit=dev/, "production image must install exactly from the backend lockfile");
assert.doesNotMatch(backendDocker, /npm install --omit=dev/, "production image must not resolve semver ranges during deployment");
assert.match(workflow, /npm ci --prefix vps\/backend/, "CI backend install must use the committed lockfile");
assert.equal((workflow.match(/npm ci --prefix tests/g) || []).length, 2, "both browser regression jobs must use the committed test lockfile");
assert.doesNotMatch(workflow, /npm install --prefix (?:vps\/backend|tests)/, "CI dependency installs must not bypass committed lockfiles");

assert.match(gitignore, /(?:^|\n)\*\*\/node_modules\//, "repository must ignore nested dependency folders");
assert.match(gitignore, /(?:^|\n)\.env(?:\n|$)/, "repository must ignore local environment secrets");
assert.match(gitignore, /!\*\*\/\.env\.example/, "documented environment templates must remain committable");
assert.match(gitignore, /tests\/artifacts\//, "browser screenshots and traces must stay out of normal commits");
assert.match(backendDockerignore, /(?:^|\n)node_modules(?:\n|$)/, "Docker build context must exclude local dependencies");
assert.match(backendDockerignore, /(?:^|\n)\.env(?:\n|$)/, "Docker build context must exclude local environment secrets");

console.log("PERFORMANCE_REGRESSION_OK");
