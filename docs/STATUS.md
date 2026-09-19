# Kitchen OS Engineering Status

> Read this after `docs/CURRENT_HANDOFF.md`. `docs/WORK_LOG.md` remains chronological evidence.

## Current authority

- Repository: `vial1307/restaurant-management-system-demo`
- Runtime authority: Browser/UI -> VPS API -> PostgreSQL.
- Verified production commit: `04718106c7558a2f20f8e1551d17767e3bff1230`.
- Verified production workflow: Deploy Kitchen OS to VPS #767, run `35456380284`.
- Schema: `022`.
- Production UI smoke: PASS.
- Inventory Site Production Audit #22: PASS.
- Workforce Schedule Production Parity #43: PASS.
- Workforce Schedule Production Backfill #254: PASS.
- Production schedule read authority: compatibility JSON; relational read gate is deployed but default OFF.

## DONE

- Schedule runtime write-through to relational PostgreSQL is production-verified.
- Reversible server-side read gate is production-deployed with default OFF.
- Release #767 passed full regression, deploy, UI smoke, inventory audit and schedule parity/backfill.

## IN PROGRESS — relational-read canary certification

Branch: `test/workforce-schedule-relational-read-canary-20260920`

This branch does not enable production relational read.

It changes CI so the full release regression runs with:

- `WORKFORCE_SCHEDULE_RELATIONAL_READ=true`

It also adds an API canary after full-device regression to prove relational read + transactional write-through + module revision reuse.

Production `vps/docker-compose.yml` remains default:

- `WORKFORCE_SCHEDULE_RELATIONAL_READ=false`

## NEXT

1. Run all PR workflows.
2. Fix any API/browser/canary mismatch.
3. Merge only when all gates are green.
4. Deploy certification changes with production still OFF.
5. Reverify production parity/backfill.
6. Only then create a separate explicit production-enable PR.

## BLOCKED

- No current data-integrity blocker.
- Production read cutover remains intentionally blocked until full ON-mode CI certification passes.

## Handoff rule

Update `CURRENT_HANDOFF.md`, `STATUS.md`, and `WORK_LOG.md` whenever the verified baseline or exact continuation point changes.
