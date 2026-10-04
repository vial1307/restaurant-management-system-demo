import assert from "node:assert/strict";
import fs from "node:fs";
import { buildEngineeringHarnessState,extractVerifiedProductionSha } from "../vps/backend/src/engineering-harness.mjs";

const contract=fs.readFileSync("docs/ENGINEERING_CONTRACT.md","utf8");
const start=fs.readFileSync("docs/AGENT_START_PROTOCOL.md","utf8");
const registry=fs.readFileSync("docs/FEATURE_REGISTRY.md","utf8");
const matrix=fs.readFileSync("docs/VERIFICATION_MATRIX.md","utf8");
const admin=fs.readFileSync("src/admin-panel.js","utf8");
const routes=fs.readFileSync("vps/backend/src/super-admin-routes.mjs","utf8");
const sync=fs.readFileSync("vps/scripts/agentmemory-sync.mjs","utf8");
const browser=fs.readFileSync("tests/browser-regression.mjs","utf8");
const superBrowser=fs.readFileSync("tests/super-admin-panel-browser-regression.mjs","utf8");

for(const phrase of [
  "PostgreSQL/VPS is the runtime source of truth",
  "unexpected full-document reload",
  "browser reload/F5",
  "RBAC contract",
  "Definition of Done",
  "exact head SHA",
]) assert(contract.toLowerCase().includes(phrase.toLowerCase()),"Engineering Contract missing: "+phrase);

for(const phrase of [
  "Resolve the active PR",
  "Baseline before modification",
  "Verify the user path",
  "Exact-head gate",
  "Production gate",
]) assert(start.toLowerCase().includes(phrase.toLowerCase()),"Agent Start Protocol missing: "+phrase);

for(const feature of ["Inventory / Kho","Users / RBAC","Super Admin","GitHub & Handoff","AgentMemory","Deployment"]){
  assert(registry.includes(feature),"Feature Registry missing "+feature);
}

for(const area of ["Buttons/tabs/forms","Unexpected full reload","Persistence / F5","RBAC positive/negative","Full-device cross-browser","Production UI smoke"]){
  assert(matrix.toLowerCase().includes(area.toLowerCase()),"Verification Matrix missing "+area);
}

assert(admin.includes("data-engineering-harness"),"Super Admin must render Engineering Harness");
assert(admin.includes("Verification Matrix · 驗證矩陣"),"Super Admin must render verification matrix");
assert(admin.includes("data-copy-engineering-start"),"Super Admin must provide a new-chat start packet");
assert(routes.includes("buildEngineeringHarnessState"),"development-status must derive live Engineering Harness state");
assert(routes.includes("engineering_harness:engineeringHarness"),"development-status must return Engineering Harness state");

for(const file of ["ENGINEERING_CONTRACT.md","AGENT_START_PROTOCOL.md","FEATURE_REGISTRY.md","VERIFICATION_MATRIX.md"]){
  assert(sync.includes(file),"AgentMemory seed missing "+file);
}

assert(browser.includes('performance.getEntriesByType("navigation").length'),"main browser regression must guard unexpected reload on SPA switching");
assert(browser.includes('page.on("pageerror"'),"main browser regression must collect page errors");
assert(superBrowser.includes('page.on("pageerror"'),"Super Admin browser regression must collect page errors");
assert(superBrowser.includes("page.reload"),"Super Admin browser regression must exercise reload persistence");

const productionSha="b61ef3837750a773294c1eb230bbb48393710cf3";
const handoff="# Handoff\n\n## CURRENT VERIFIED PRODUCTION\n- final production merge: " + String.fromCharCode(96) + productionSha + String.fromCharCode(96) + ";\n";
assert.equal(extractVerifiedProductionSha(handoff),productionSha);

const liveGithub={
  active_pr:{number:999,title:"Harness test",head_sha:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",branch:"feat/test"},
  main:{sha:"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},
  current_handoff:{content:handoff},
  workflows:[
    {id:1,name:"Deploy Kitchen OS to VPS",status:"completed",conclusion:"success",head_sha:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",run_number:1,url:"https://example.invalid/1"},
    {id:2,name:"Master Data and Admin Panel Regression",status:"completed",conclusion:"success",head_sha:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",run_number:2,url:"https://example.invalid/2"},
  ],
  main_workflows:[],
};
const green=buildEngineeringHarnessState({liveGithub,release:productionSha,schema:{version:"031"}});
assert.equal(green.gates.merge.status,"pass","all exact-head mandatory workflows should open merge gate");
assert.equal(green.gates.deploy.status,"blocked","active PR must never be treated as deployable branch");
assert.equal(green.gates.production.status,"pass","recorded production SHA must match runtime release");
assert.equal(green.quality_matrix.find((row)=>row.id==="controls")?.coverage,"partial","interaction coverage must not be overstated");

const failed=buildEngineeringHarnessState({
  liveGithub:{
    ...liveGithub,
    workflows:[
      {...liveGithub.workflows[0],conclusion:"failure"},
      liveGithub.workflows[1],
    ],
  },
  release:productionSha,
  schema:"031",
});
assert.equal(failed.gates.merge.status,"fail","failed exact-head workflow must block merge");

const pending=buildEngineeringHarnessState({
  liveGithub:{...liveGithub,workflows:[liveGithub.workflows[0]]},
  release:"cccccccccccccccccccccccccccccccccccccccc",
  schema:"031",
});
assert.equal(pending.gates.merge.status,"pending","missing mandatory exact-head workflow must keep gate pending");
assert.equal(pending.gates.production.status,"pending","runtime mismatch must not be production verified");

console.log("ENGINEERING_HARNESS_CONTRACT_REGRESSION_OK");
