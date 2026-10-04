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
const handoffWorkflow=read(".github/workflows/engineering-handoff-regression.yml");

assert.match(feed,/PUBLIC_HANDOFF_URL = "https:\/\/vial1307\.github\.io\/restaurant-management-system-demo\/handoff\.html"/);
assert.match(feed,/CACHE_TTL_MS = 5 \* 60 \* 1000/);
assert.match(feed,/\/branches\/main/);
assert.match(feed,/docs\/CURRENT_HANDOFF\.md/);
assert.match(feed,/\/pulls\?state=open&sort=updated&direction=desc&per_page=20/);
assert.match(feed,/explicitActivePrNumber/);
assert.match(feed,/requestedPrNumber[\s\S]{0,220}candidates\.find/);
assert.doesNotMatch(feed,/candidates\.find\(\(pr\) => !pr\.draft\)/,
  "newest open PR must not automatically become the current handoff");
assert.match(feed,/authority:"main-current-handoff"/);
assert.match(feed,/main_workflows:mainRuns/);
assert.match(feed,/workflowGateSummary/);
assert.match(feed,/workflow_summary:workflowGateSummary\(runs/);
assert.match(feed,/main_workflow_summary:workflowGateSummary\(mainRuns/);
assert.match(feed,/latestSuccessfulWorkflow/);
assert.match(feed,/deploy-vps\.yml/);
assert.match(feed,/inventory-site-production-audit\.yml/);
assert.match(feed,/production_workflows:\{/);
assert.match(feed,/deploy:productionDeploy/);
assert.match(feed,/inventory_audit:inventoryAudit/);
assert.match(feed,/latestByName/,"workflow dashboard must collapse obsolete reruns by workflow name");
assert.match(feed,/\/actions\/runs\?branch=main/);
assert.match(feed,/changed_files:files/);
assert.match(feed,/GITHUB_LIVE_HANDOFF_DISABLED/);
assert.match(feed,/process\.env\.GITHUB_ACTIONS === "true"/);

assert.match(routes,/getLiveGitHubHandoff/);
assert.match(routes,/forceGithub/);
assert.match(routes,/request\.query\?\.refresh/);
assert.match(routes,/getLiveGitHubHandoff\(\{ force:forceGithub \}\)/);
assert.match(routes,/live_github:liveGithub/);
assert.match(routes,/activePr \? "live-github-pr"/);
assert.match(routes,/liveGithub\?\.available \? "live-github-main"/);
assert.match(routes,/liveHandoff\?\.content/);
assert.match(routes,/stopping_point:activePr\.body/);

assert.match(panel,/One-link Handoff/);
assert.match(panel,/data-copy-handoff/);
assert.match(panel,/Git commit chain/);
assert.match(panel,/CI exact-head hiện tại/);
assert.match(panel,/data-workflow-dashboard/);
assert.match(panel,/workflow_summary/);
assert.match(panel,/main_workflow_summary/);
assert.match(panel,/Production deploy/,"Super Admin must show the latest successful production deploy workflow");
assert.match(panel,/Inventory audit/,"Super Admin must show the latest successful Inventory audit workflow");
assert.match(panel,/Runtime ↔ deploy/,"Super Admin must compare runtime release with deployed workflow evidence");
assert.match(panel,/production_workflows/);
assert.match(panel,/development-status\?refresh=1/);
assert.match(panel,/live_github/);

assert.match(page,/Live GitHub Handoff/);
assert.match(page,/api\.github\.com\/repos\//);
assert.match(page,/CURRENT_HANDOFF\.md/);
assert.match(page,/DEVELOPMENT_RULES\.md/);
assert.match(page,/MAIN AUTHORITY/);
assert.match(page,/ACTIVE_PR/);
assert.match(page,/raw\.githubusercontent\.com/);
assert.match(page,/pulls\?state=open/);
assert.match(page,/actions\/runs\?branch=main/);
assert.match(page,/summarizeWorkflows/);
assert.match(page,/PR workflow gates/);
assert.match(page,/Main workflow gates/);
assert.doesNotMatch(page,/candidates\.find\(\(row\)=>!row\.draft\)/,
  "public handoff must not promote the newest open PR automatically");

assert.match(status,/canonical_handoff:\{/);
assert.match(status,/url:PUBLIC_HANDOFF_URL/);
assert.match(status,/workflow_run_id:"\d+"/);
assert.match(status,/inventory_audit_run_id:"\d+"/);

assert.match(handoffWorkflow,/name: Engineering Handoff Regression/);
assert.match(handoffWorkflow,/pull_request:/);
assert.match(handoffWorkflow,/push:/);
assert.match(handoffWorkflow,/node tests\/live-handoff-contract-regression\.mjs/);
assert.match(handoffWorkflow,/node tests\/admin-panel-static-regression\.mjs/);
assert.match(handoffWorkflow,/node tests\/admin-panel-ui-v2-static-regression\.mjs/);

console.log("LIVE_HANDOFF_CONTRACT_OK");
