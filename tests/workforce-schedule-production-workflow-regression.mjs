import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const workflow = fs.readFileSync(
  path.join(ROOT, ".github/workflows/workforce-schedule-production-backfill.yml"),
  "utf8"
);

assert.match(workflow, /workflow_run:[\s\S]*Deploy Kitchen OS to VPS/, "schedule maintenance must follow the production deploy workflow");
assert.match(workflow, /github\.event\.workflow_run\.conclusion == 'success'/, "automatic schedule verification must require a successful deploy");
assert.match(workflow, /github\.event\.workflow_run\.head_branch == 'main'/, "automatic schedule verification must only follow main deployments");
assert.match(workflow, /MODE: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.mode \|\| 'verify' \}\}/, "automatic schedule maintenance must default to verify-only");
assert.match(workflow, /GITHUB_EVENT_NAME" != "workflow_dispatch" && "\$MODE" != "verify"/, "automatic events must be prevented from applying data");
assert.match(workflow, /if \[\[ "\$MODE" == "apply" \]\]; then[\s\S]*bash repo\/vps\/scripts\/backup\.sh[\s\S]*workforce-schedule-backfill\.mjs --apply/, "manual apply must create a database backup before schedule writes");
assert.match(workflow, /test "\$ACTUAL_RELEASE" = "\$REMOTE_RELEASE"/, "production release must match the VPS repository HEAD");
assert.match(workflow, /test "\$LOCAL_SCRIPT_SHA" = "\$REMOTE_SCRIPT_SHA"/, "local and VPS schedule backfill scripts must match");
assert.match(workflow, /test "\$ACTUAL_RELEASE" = "\$EXPECTED_RELEASE"/, "workflow-run verification must pin the deployed commit");
assert.match(workflow, /curl --fail[\s\S]*\/api\/health[\s\S]*\/RELEASE/, "maintenance must finish with production health and release checks");

console.log("WORKFORCE_SCHEDULE_PRODUCTION_WORKFLOW_REGRESSION_OK");
