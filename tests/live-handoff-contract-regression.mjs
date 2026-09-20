import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT=path.resolve(new URL("..",import.meta.url).pathname);
const read=(file)=>fs.readFileSync(path.join(ROOT,file),"utf8");

const feed=read("vps/backend/src/github-handoff.mjs");
const routes=read("vps/backend/src/super-admin-routes.mjs");
const panel=read("src/admin-panel.js");
const page=read("handoff.html");
const status=read("vps/backend/src/development-status.mjs");

assert.match(feed,/PUBLIC_HANDOFF_URL = "https:\/\/vial1307\.github\.io\/restaurant-management-system-demo\/handoff\.html"/);
assert.match(feed,/CACHE_TTL_MS = 5 \* 60 \* 1000/);
assert.match(feed,/\/pulls\?state=open&sort=updated&direction=desc&per_page=10/);
assert.match(feed,/\/actions\/runs\?branch=/);
assert.match(feed,/changed_files:files/);
assert.match(feed,/GITHUB_LIVE_HANDOFF_DISABLED/);
assert.match(feed,/process\.env\.GITHUB_ACTIONS === "true"/);

assert.match(routes,/getLiveGitHubHandoff/);
assert.match(routes,/live_github:liveGithub/);
assert.match(routes,/activePr \? "live-github-pr"/);
assert.match(routes,/stopping_point:activePr\.body/);

assert.match(panel,/One-link Handoff/);
assert.match(panel,/data-copy-handoff/);
assert.match(panel,/Git commit chain/);
assert.match(panel,/CI của head hiện tại/);
assert.match(panel,/live_github/);

assert.match(page,/Live GitHub Handoff/);
assert.match(page,/api\.github\.com\/repos\//);
assert.match(page,/CURRENT_HANDOFF\.md/);
assert.match(page,/DEVELOPMENT_RULES\.md/);
assert.match(page,/pulls\?state=open/);
assert.match(page,/actions\/runs\?branch=/);

assert.match(status,/canonical_handoff:\{/);
assert.match(status,/url:PUBLIC_HANDOFF_URL/);
assert.match(status,/workflow_run_id:"\d+"/);
assert.match(status,/inventory_audit_run_id:"\d+"/);

console.log("LIVE_HANDOFF_CONTRACT_OK");
