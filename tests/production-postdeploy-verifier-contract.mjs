import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(path,"utf8");
const hook=read("vps/scripts/deploy-api.sh");
const verifier=read("vps/scripts/production-postdeploy-verify.sh");
assert.match(hook,/install -o root -g root -m 0755 .*production-postdeploy-verify\.sh.*\/usr\/local\/sbin\/kitchen-os-verify/);
assert.match(hook,/chmod 0440 \/etc\/sudoers.d\/kitchen-os-verify/);
assert.match(verifier,/VERIFY_TASK_NOT_ALLOWED/);
assert.match(verifier,/case "\$task" in/);
assert(!verifier.includes("source .env"));
assert.match(verifier,/bash \/opt\/kitchen-os\/repo\/vps\/scripts\/backup\.sh[\s\S]*args\+=\("--apply"\)/,"manual apply must make a backup before modifying DB");
assert(!verifier.includes("eval "));
assert(!verifier.includes("bash -c"));
const inv=read(".github/workflows/inventory-site-production-audit.yml");
assert(!inv.includes("source .env"),"inventory audit must not read VPS secrets");
assert(!inv.includes("<<'SQL'"),"inventory audit must use pinned queries");
for(let k=1;k<=5;k++){
 assert(inv.includes("kitchen-os-verify inventory-"+k));
 const sql=read("vps/scripts/inventory-audit/inventory-"+k+".sql");
 assert.match(sql,/\b(?:select|with)\b/i);
 assert(!/\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|CREATE)\b/i.test(sql),"audit SQL must be read-only");
}
const parity=read(".github/workflows/workforce-schedule-production-parity.yml");
assert(parity.includes("kitchen-os-verify workforce-parity"));
for(const kind of ["staff","schedule","attendance"]){
 const flow=read(".github/workflows/workforce-"+kind+"-production-backfill.yml");
 assert(flow.includes('TASK="workforce-'+kind+'"'),"workflow must choose the allowlisted task");
 assert(flow.includes("sudo -n /usr/local/sbin/kitchen-os-verify $TASK"),"workflow must call verifier");
 assert(!flow.includes("docker compose --env-file .env"));
 assert(!flow.includes("source .env"));
 assert(flow.includes("          - apply"),"manual apply choice remains available");
 assert(flow.includes("GITHUB_EVENT_NAME\" == \"workflow_dispatch"),"write mode restricted to explicit manual runs");
}
console.log("PASS sealed production verification, read-only pinned SQL and no secret file access");
