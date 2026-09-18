import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const workflow = fs.readFileSync(
  path.join(ROOT, ".github/workflows/workforce-schedule-production-parity.yml"),
  "utf8"
);

assert.match(workflow, /workflow_run:[\s\S]*Deploy Kitchen OS to VPS/, "parity audit must follow production deployment");
assert.match(workflow, /push:[\s\S]*branches:[\s\S]*main[\s\S]*workforce-schedule-production-parity\.yml/, "workflow-only main fixes must be able to re-run parity without redeploying the app");
assert.match(workflow, /group: kitchen-os-production-schedule-parity/, "parity must not share the maintenance concurrency group with backfill workflows");
assert.match(workflow, /github\.event\.workflow_run\.conclusion == 'success'/, "parity audit must require successful deploy");
assert.match(workflow, /github\.event\.workflow_run\.head_branch == 'main'/, "parity audit must only follow main deploys");
assert.match(workflow, /github\.event_name == 'push'/, "parity job must permit the workflow-only push trigger");
assert.match(workflow, /workforce-schedule-backfill\.mjs --parity/, "production parity must run read-only parity mode");
assert.doesNotMatch(workflow, /--apply/, "production parity workflow must never apply backfill writes");
assert.doesNotMatch(workflow, /backup\.sh/, "read-only parity workflow must not create a write/backfill backup path");
assert.match(workflow, /test "\$ACTUAL_RELEASE" = "\$REMOTE_RELEASE"/, "parity must verify live release matches VPS repo");
assert.match(workflow, /test "\$LOCAL_SCRIPT_SHA" = "\$REMOTE_SCRIPT_SHA"/, "parity must verify the deployed parity script");
assert.match(workflow, /test "\$ACTUAL_RELEASE" = "\$EXPECTED_RELEASE"/, "workflow-run parity must pin the deployed commit");
assert.match(workflow, /curl --fail[\s\S]*\/api\/health[\s\S]*\/RELEASE/, "parity audit must finish with health/release checks");

console.log("WORKFORCE_SCHEDULE_PRODUCTION_PARITY_WORKFLOW_OK");
