import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const readWorkflow = (name) => fs.readFileSync(path.join(ROOT, `.github/workflows/${name}`), "utf8");
const workflow = readWorkflow("workforce-schedule-production-backfill.yml");
const maintenanceWorkflows = [
  ["schedule", workflow],
  ["staff", readWorkflow("workforce-staff-production-backfill.yml")],
  ["attendance", readWorkflow("workforce-attendance-production-backfill.yml")],
];

for (const [domain, source] of maintenanceWorkflows) {
  assert.match(
    source,
    new RegExp(`group: \\$\\{\\{[^\\n]+kitchen-os-production-maintenance-apply[^\\n]+kitchen-os-production-${domain}-verify[^\\n]+\\}\\}`),
    `${domain} automatic verify must not compete with other production verification workflows`
  );
  assert.match(source, /cancel-in-progress: false/, `${domain} maintenance must not cancel its active operation`);
}

assert.match(workflow, /workflow_run:[\s\S]*Deploy Kitchen OS to VPS/, "schedule maintenance must follow the production deploy workflow");
assert.match(workflow, /github\.event\.workflow_run\.conclusion == 'success'/, "automatic schedule verification must require a successful deploy");
assert.match(workflow, /github\.event\.workflow_run\.head_branch == 'main'/, "automatic schedule verification must only follow main deployments");
assert.match(workflow, /MODE: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.mode \|\| 'verify' \}\}/, "automatic schedule maintenance must default to verify-only");
assert.match(workflow, /GITHUB_EVENT_NAME" != "workflow_dispatch" && "\$MODE" != "verify"/, "automatic events must be prevented from applying data");
const sealedVerifier=fs.readFileSync(path.join(ROOT,"vps/scripts/production-postdeploy-verify.sh"),"utf8");
assert(workflow.includes('if [[ "$MODE" == "apply" ]]; then'),"manual apply must be explicit");
assert(workflow.includes('GITHUB_EVENT_NAME" == "workflow_dispatch"'),"only manual dispatch may apply");
assert(workflow.includes('TASK="workforce-schedule-apply"'),"manual schedule task name required");
assert(workflow.includes('sudo -n /usr/local/sbin/kitchen-os-verify $TASK'),"workflow must call sealed verifier");
assert(!workflow.includes('source .env')&&!workflow.includes('docker compose --env-file'),"deploy account must never read secrets");
assert(sealedVerifier.includes('bash /opt/kitchen-os/repo/vps/scripts/backup.sh'),"privileged apply must create backup");
assert(sealedVerifier.includes('args+=("--apply")'),"writes only in explicitly selected apply task");
assert(sealedVerifier.indexOf('bash /opt/kitchen-os/repo/vps/scripts/backup.sh')<sealedVerifier.indexOf('args+=("--apply")'),"backup happens before apply");
assert(sealedVerifier.includes('workforce-schedule-backfill.mjs'),"schedule script must be fixed");
assert(!workflow.includes('<<\'REMOTE\''),"no streamed SSH bash heredoc");
assert.match(workflow, /test "\$ACTUAL_RELEASE" = "\$REMOTE_RELEASE"/, "production release must match the VPS repository HEAD");
assert.match(workflow, /test "\$LOCAL_SCRIPT_SHA" = "\$REMOTE_SCRIPT_SHA"/, "local and VPS schedule backfill scripts must match");
assert.match(workflow, /test "\$ACTUAL_RELEASE" = "\$EXPECTED_RELEASE"/, "workflow-run verification must pin the deployed commit");
assert.match(workflow, /curl --fail[\s\S]*\/api\/health[\s\S]*\/RELEASE/, "maintenance must finish with production health and release checks");

console.log("WORKFORCE_SCHEDULE_PRODUCTION_WORKFLOW_REGRESSION_OK");
