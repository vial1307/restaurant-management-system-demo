import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

const stagingCompose = read("vps/docker-compose.staging.yml");
const productionCompose = read("vps/docker-compose.yml");
const productionCaddy = read("vps/Caddyfile");
const stagingCaddy = read("vps/Caddyfile.staging");
const deploy = read("vps/scripts/deploy-staging.sh");
const productionDeploy = read("vps/scripts/deploy-api.sh");
const workflow = read(".github/workflows/deploy-staging.yml");
const server = read("vps/backend/src/server.mjs");
const db = read("vps/backend/src/db.mjs");

assert.match(stagingCompose,/container_name:\s*kitchen-os-staging-db/);
assert.match(stagingCompose,/container_name:\s*kitchen-os-staging-api/);
assert.match(stagingCompose,/container_name:\s*kitchen-os-staging-web/);
assert.match(stagingCompose,/APP_ENV:\s*staging/);
assert.match(stagingCompose,/kitchen_os_staging_postgres_data/);
assert.doesNotMatch(stagingCompose,/container_name:\s*kitchen-os-db\b/);

assert.match(productionCompose,/APP_ENV:\s*production/);
assert.match(productionCompose,/kitchen_staging_edge/);
assert.match(productionCaddy,/staging\.82\.47\.180\.185\.nip\.io/);
assert.match(productionCaddy,/reverse_proxy kitchen-os-staging-web:80/);
assert.match(stagingCaddy,/X-Kitchen-Environment "staging"/);
assert.match(stagingCaddy,/X-Robots-Tag "noindex, nofollow, noarchive"/);

assert.match(deploy,/pg_dump[^\n]+--no-owner --no-acl/);
assert.match(deploy,/kitchen-os-staging-db pg_restore/);
assert.match(deploy,/STAGING_CLONE_DRIFT/);
assert.match(deploy,/PRODUCTION_SCHEMA_CHANGED_DURING_STAGING/);
assert.match(deploy,/STAGING_DATA_INTEGRITY_FAILED/);
assert.match(deploy,/STAGING_DB_NOT_STABLE/);
assert.match(deploy,/stable_probes/);
assert.match(deploy,/--maintenance-db=postgres/);
assert.match(deploy,/truncate table public\.sessions/);
assert.doesNotMatch(deploy,/kitchen-os-db\s+psql[^\n]*\b(update|insert|delete|alter|drop|create)\b/i);

assert.match(productionDeploy,/kitchen-os-staging-deploy/);
assert.match(productionDeploy,/kitchen_staging_edge/);
assert.match(workflow,/workflow_dispatch:/);
assert.match(workflow,/pull_request:/,"staging must run for pull-request candidates");
assert.match(workflow,/push:[\s\S]*branches:[\s\S]*- main/,"staging must run for main candidates");
assert.match(workflow,/github\.event\.pull_request\.head\.sha/,"PR staging must pin the exact head SHA");
assert.match(workflow,/\.kitchen-os-staging-bundle\.tgz/);
assert.match(workflow,/staging\.82\.47\.180\.185\.nip\.io\/api\/health/);

assert.match(server,/schemaFingerprint/);
assert.match(server,/environment: process\.env\.APP_ENV \|\| "production"/);
assert.match(db,/export function schemaFingerprint/);
assert.match(db,/md5\(coalesce\(string_agg/);

console.log("staging isolation contract regression passed");
