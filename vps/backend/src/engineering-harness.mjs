const REPOSITORY_URL = "https://github.com/vial1307/restaurant-management-system-demo";

const REQUIRED_WORKFLOWS = Object.freeze([
  {
    id:"deploy-regression",
    name:"Deploy Kitchen OS to VPS",
    label:"Full regression / release gate",
    purpose:"Preflight + PostgreSQL/API + browser/full-device regression. On main, this workflow also performs the VPS deployment.",
    always:true,
  },
  {
    id:"master-admin",
    name:"Master Data and Admin Panel Regression",
    label:"Master Data + Super Admin",
    purpose:"Protects Super Admin and master-data/database management surfaces.",
    paths:["src/admin-panel","src/admin-panel-inventory","vps/backend/","docs/ENGINEERING_","docs/AGENT_START_","docs/FEATURE_REGISTRY","docs/VERIFICATION_MATRIX"],
  },
  {
    id:"super-admin-browser",
    name:"Super Admin Browser Regression",
    label:"Super Admin browser behavior",
    purpose:"Verifies protected Super Admin behavior on real browser/device profiles.",
    paths:[".admindev.html","src/admin-panel","vps/backend/src/super-admin","vps/backend/src/engineering-harness"],
  },
  {
    id:"api-load",
    name:"Isolated CI API Load Smoke",
    label:"API load / isolation smoke",
    purpose:"Protects backend/API startup and isolated load behavior.",
    paths:["vps/backend/"],
  },
  {
    id:"workforce-approval",
    name:"Workforce Approval Regression Diagnostic",
    label:"Workforce approval diagnostic",
    purpose:"Required only when workforce approval/request paths are changed.",
    paths:["src/workforce","vps/backend/src/workforce","workforce"],
  },
]);

const QUALITY_MATRIX = Object.freeze([
  { id:"static",label:"Static/source contract",coverage:"covered",workflow:"Deploy Kitchen OS to VPS",evidence:"Static regressions + syntax/contracts" },
  { id:"database-api",label:"PostgreSQL / API",coverage:"covered",workflow:"Deploy Kitchen OS to VPS",evidence:"Isolated DB + API + concurrency regressions" },
  { id:"controls",label:"Buttons / tabs / forms",coverage:"partial",workflow:"Deploy Kitchen OS to VPS",evidence:"Main browser + Super Admin interaction regressions; changed uncovered controls need targeted assertions" },
  { id:"lists",label:"Lists / filter / sort / pagination",coverage:"partial",workflow:"Deploy Kitchen OS to VPS",evidence:"Module-specific coverage; changed list behavior must add/extend an assertion" },
  { id:"reload",label:"Unexpected SPA reload",coverage:"partial",workflow:"Deploy Kitchen OS to VPS",evidence:"Inventory warehouse switch currently asserts no full-document reload" },
  { id:"page-errors",label:"Page crash / uncaught JS",coverage:"covered",workflow:"Deploy Kitchen OS to VPS",evidence:"Browser and Super Admin pageerror collection" },
  { id:"api-failures",label:"Same-origin API failures",coverage:"covered",workflow:"Deploy Kitchen OS to VPS",evidence:"Browser diagnostics fail on same-origin API 5xx/request failure plus critical mutation response assertions" },
  { id:"console",label:"Console error monitoring",coverage:"partial",workflow:"Deploy Kitchen OS to VPS",evidence:"Not globally enforced on every surface; add targeted monitoring where relevant" },
  { id:"persistence",label:"Persistence / F5",coverage:"partial",workflow:"Deploy Kitchen OS to VPS",evidence:"RBAC/master-data reload checks + DB round trips; every changed mutation needs proof" },
  { id:"sync",label:"Cross-view / realtime sync",coverage:"partial",workflow:"Deploy Kitchen OS to VPS",evidence:"Inventory/master-data peer/realtime coverage; expand for changed entities" },
  { id:"rbac",label:"RBAC positive / negative",coverage:"partial",workflow:"Deploy Kitchen OS to VPS",evidence:"Role/API account regressions; permission changes require allowed + denied cases" },
  { id:"responsive",label:"Desktop / mobile / overflow",coverage:"covered",workflow:"Deploy Kitchen OS to VPS",evidence:"Chromium responsive + overflow guards" },
  { id:"full-device",label:"Full-device cross-browser",coverage:"covered",workflow:"Deploy Kitchen OS to VPS",evidence:"Required full-device cross-browser regression" },
  { id:"super-admin",label:"Super Admin",coverage:"covered",workflow:"Master Data and Admin Panel Regression",evidence:"Static + browser regression for protected admin surfaces" },
  { id:"production",label:"Production release / integrity / smoke",coverage:"covered",workflow:"Deploy Kitchen OS to VPS",evidence:"Release/schema + DATA_INTEGRITY_OK + production UI smoke on main deploy" },
]);

const START_PROTOCOL = Object.freeze([
  "Read CURRENT_HANDOFF + Engineering Contract + Feature Registry + Verification Matrix.",
  "Resolve ACTIVE_PR explicitly; never select an open PR by recency.",
  "Compare main SHA, PR head SHA, live production release and schema.",
  "Classify the requested feature, data authority, affected roles/sites and user paths.",
  "Establish a baseline/reproduce before modification when practical.",
  "Implement minimum-scope change and add/extend a regression for the failure mode.",
  "Verify controls, API/DB persistence, F5, reload behavior, page errors and RBAC as applicable.",
  "Require exact-head CI before merge; no post-green commit without rerun.",
  "Deploy exact merge SHA for runtime changes and require production health/integrity/smoke/audit.",
  "Update handoff/status/work log and sync AgentMemory before closure.",
]);

export const ENGINEERING_HARNESS_POLICY = Object.freeze({
  version:"1.0",
  authority:"GitHub CURRENT_HANDOFF.md + PostgreSQL/VPS runtime. AgentMemory is recall only.",
  required_workflows:REQUIRED_WORKFLOWS,
  quality_matrix:QUALITY_MATRIX,
  start_protocol:START_PROTOCOL,
  documents:[
    { label:"Engineering Contract",path:"docs/ENGINEERING_CONTRACT.md",url:`${REPOSITORY_URL}/blob/main/docs/ENGINEERING_CONTRACT.md` },
    { label:"Agent Start Protocol",path:"docs/AGENT_START_PROTOCOL.md",url:`${REPOSITORY_URL}/blob/main/docs/AGENT_START_PROTOCOL.md` },
    { label:"Feature Registry",path:"docs/FEATURE_REGISTRY.md",url:`${REPOSITORY_URL}/blob/main/docs/FEATURE_REGISTRY.md` },
    { label:"Verification Matrix",path:"docs/VERIFICATION_MATRIX.md",url:`${REPOSITORY_URL}/blob/main/docs/VERIFICATION_MATRIX.md` },
  ],
});

function value(value) {
  return String(value ?? "").trim();
}

function sameSha(left,right) {
  const a=value(left).toLowerCase();
  const b=value(right).toLowerCase();
  if (!a || !b) return false;
  return a === b || a.startsWith(b) || b.startsWith(a);
}

function runState(run) {
  if (!run) return "missing";
  if (value(run.status) !== "completed") return "pending";
  return value(run.conclusion) === "success" ? "pass" : "fail";
}

function latestWorkflow(runs,name) {
  return (Array.isArray(runs) ? runs : []).find((run)=>value(run?.name)===name) || null;
}

function workflowApplies(spec,changedFiles,activePr) {
  if (!activePr) return Boolean(spec.always);
  if (spec.always) return true;
  const paths=(Array.isArray(changedFiles) ? changedFiles : [])
    .map((entry)=>value(typeof entry==="string" ? entry : entry?.path))
    .filter(Boolean);
  if (!paths.length) return true;
  const prefixes=Array.isArray(spec.paths) ? spec.paths : [];
  return prefixes.some((prefix)=>paths.some((path)=>path.includes(prefix)));
}

export function extractVerifiedProductionSha(content) {
  const source=String(content || "");
  const patterns=[
    /final production merge:\s*`?([0-9a-f]{40})`?/i,
    /merge commit:\s*`?([0-9a-f]{40})`?/i,
    /current production release:\s*`?([0-9a-f]{40})`?/i,
    /production merge\s+`([0-9a-f]{40})`/i,
    /current verified production[\s\S]{0,2500}?\b([0-9a-f]{40})\b/i,
  ];
  for (const pattern of patterns) {
    const match=source.match(pattern);
    if (match?.[1]) return match[1].toLowerCase();
  }
  return "";
}

export function buildEngineeringHarnessState({ liveGithub=null,release="",schema=null } = {}) {
  const github=liveGithub || {};
  const activePr=github.active_pr || null;
  const activeRuns=Array.isArray(github.workflows) ? github.workflows : [];
  const mainRuns=Array.isArray(github.main_workflows) ? github.main_workflows : [];
  const recentMainRuns=Array.isArray(github.recent_main_workflows) ? github.recent_main_workflows : mainRuns;
  const handoffContent=value(github.current_handoff?.content);
  const verifiedProductionSha=extractVerifiedProductionSha(handoffContent);
  const productionRuns=verifiedProductionSha
    ? recentMainRuns.filter((run)=>sameSha(run?.head_sha,verifiedProductionSha))
    : [];
  const gateRuns=activePr ? activeRuns : (productionRuns.length ? productionRuns : mainRuns);

  const changedFiles=Array.isArray(github.changed_files) ? github.changed_files : [];
  const requiredWorkflows=REQUIRED_WORKFLOWS
    .filter((spec)=>workflowApplies(spec,changedFiles,activePr))
    .map((spec)=>{
      const run=latestWorkflow(gateRuns,spec.name);
      return {
        id:spec.id,
        name:spec.name,
        label:spec.label,
        purpose:spec.purpose,
        status:runState(run),
        run:run ? {
          id:run.id,
          run_number:run.run_number,
          head_sha:value(run.head_sha),
          status:value(run.status),
          conclusion:run.conclusion || null,
          url:value(run.url),
        } : null,
      };
    });

  const anyFail=requiredWorkflows.some((row)=>row.status==="fail");
  const allPass=requiredWorkflows.length>0 && requiredWorkflows.every((row)=>row.status==="pass");
  const mergeGate=activePr
    ? {
        status:allPass ? "pass" : (anyFail ? "fail" : "pending"),
        label:allPass ? "READY TO MERGE" : (anyFail ? "MERGE BLOCKED" : "WAITING FOR CI"),
        reason:allPass
          ? "All mandatory workflows are green on the active PR head."
          : anyFail
            ? "At least one mandatory workflow failed on the active PR head."
            : "Mandatory exact-head workflow evidence is incomplete.",
      }
    : { status:"n/a",label:"NO ACTIVE PR",reason:"CURRENT_HANDOFF.md does not name an active PR." };

  const productionVerified=Boolean(verifiedProductionSha && sameSha(release,verifiedProductionSha));
  const deployGate=activePr
    ? { status:"blocked",label:"DEPLOY AFTER MERGE",reason:"Runtime deploy must use the exact merge SHA, never the PR branch SHA." }
    : productionVerified
      ? { status:"pass",label:"DEPLOY VERIFIED",reason:"Runtime release matches the production SHA recorded in CURRENT_HANDOFF.md." }
      : { status:"pending",label:"PRODUCTION CHECK REQUIRED",reason:"Runtime release does not match a production SHA recorded in CURRENT_HANDOFF.md." };

  const productionGate={
    status:productionVerified ? "pass" : "pending",
    label:productionVerified ? "PRODUCTION VERIFIED" : "NOT VERIFIED",
    recorded_sha:verifiedProductionSha || null,
    live_release:value(release) || null,
    schema:typeof schema==="object" ? schema?.version || null : schema || null,
    reason:productionVerified
      ? "Live release matches the production evidence recorded in CURRENT_HANDOFF.md."
      : "A matching verified production SHA was not proven from current handoff + runtime.",
  };

  const workflowStateByName=new Map(requiredWorkflows.map((row)=>[row.name,row.status]));
  const qualityMatrix=QUALITY_MATRIX.map((item)=>({
    ...item,
    execution_status:workflowStateByName.get(item.workflow) || "missing",
  }));

  return {
    version:ENGINEERING_HARNESS_POLICY.version,
    authority:ENGINEERING_HARNESS_POLICY.authority,
    candidate:{
      active_pr:activePr ? {
        number:activePr.number,
        title:value(activePr.title),
        head_sha:value(activePr.head_sha),
        branch:value(activePr.branch),
      } : null,
      main_sha:value(github.main?.sha) || null,
    },
    gates:{
      merge:mergeGate,
      deploy:deployGate,
      production:productionGate,
      definition_of_done:{
        status:!activePr && productionVerified ? "pass" : "pending",
        label:!activePr && productionVerified ? "DONE EVIDENCE COMPLETE" : "NOT DONE",
        reason:activePr
          ? "An active PR still exists; completion requires merge + production verification for runtime changes."
          : productionVerified
            ? "No active PR and the current verified production evidence matches runtime."
            : "Production evidence is incomplete.",
      },
    },
    required_workflows:requiredWorkflows,
    quality_matrix:qualityMatrix,
    start_protocol:[...START_PROTOCOL],
    documents:ENGINEERING_HARNESS_POLICY.documents.map((row)=>({...row})),
    definition_of_done:[
      "Expected user behavior verified",
      "Persistence/F5 verified for mutations",
      "RBAC positive/negative verified where applicable",
      "No unexpected reload/page crash on changed path",
      "Exact-head mandatory CI green",
      "Tested head included in merge",
      "Exact merge SHA deployed for runtime changes",
      "Production release/schema + DATA_INTEGRITY_OK + UI smoke verified",
      "Module production audit green when available",
      "Handoff/evidence updated and AgentMemory synchronized",
    ],
  };
}
