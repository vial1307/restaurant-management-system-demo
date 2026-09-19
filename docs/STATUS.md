# Kitchen OS Engineering Status

> Read this after `docs/CURRENT_HANDOFF.md`. This is the short operational workboard; `docs/WORK_LOG.md` remains the chronological log.

## Current authority

- Repository: `vial1307/restaurant-management-system-demo`
- Production data authority: Browser/UI -> VPS API -> PostgreSQL.
- PostgreSQL remains private behind the VPS/API boundary.
- Verified production commit: `fc563c7f147327656aff304a0c621754d38b4591`.
- Verified production workflow: Deploy Kitchen OS to VPS #765, run `35443223746`.
- Verified production schema: `022`.
- Production UI smoke: PASS.
- Inventory Site Production Audit after release: PASS.
- Workforce Schedule Production Parity after release: PASS.
- Workforce Schedule Production Backfill after release: PASS.

## DONE

- Schema-022 inventory site isolation and storage relocation remain production-verified.
- Warehouse-switch pending/loading feedback is merged and production-verified.
- PR #119 runtime schedule shadow write is merged and production-verified.
- Draft schedules, requests/exceptions and publication history write to relational workforce tables in the same transaction as compatibility state.
- The existing schedule compatibility JSON remains readable and writable for rollback.
- Production parity after release #765 is green.

## IN PROGRESS — workforce schedule relational read cutover gate

Branch: `feat/workforce-schedule-read-cutover-gate-20260920`

Goal:

- prepare a reversible read-authority cutover without changing production behavior yet.

Current candidate behavior:

- server flag: `WORKFORCE_SCHEDULE_RELATIONAL_READ`;
- VPS default: `false`;
- OFF: business-state schedule read remains compatibility JSON;
- ON: business-state schedule read comes from relational schedule projection;
- schedule write path remains the existing transactional write-through path;
- compatibility module revision tokens remain the concurrency contract;
- no migration/schema change.

Required verification before merge:

1. syntax/static contracts;
2. PostgreSQL schedule backfill/parity regression;
3. schedule read-authority OFF/ON regression;
4. API/business-state regression;
5. desktop/mobile/full-device browser regression;
6. deploy preflight.

## NEXT

1. Merge only if all PR checks are green.
2. Deploy the merged commit with relational read still OFF.
3. Verify production release + UI smoke.
4. Verify production schedule parity/backfill again.
5. Enable relational read in a separate explicit step only after the OFF deployment is verified.
6. Keep compatibility writes until a later retirement stage is explicitly reviewed.

## BLOCKED

- No current product/data blocker.
- Do not treat relational read as production authority until the feature flag is deliberately enabled after the verified OFF deployment.

## Handoff rule

Before stopping work:

1. update this file with DONE / IN PROGRESS / NEXT / BLOCKED;
2. append the session to `docs/WORK_LOG.md`;
3. update `docs/CURRENT_HANDOFF.md` with exact verified production evidence;
4. keep Super Admin GitHub/Handoff metadata aligned with the current continuation point;
5. never label a release as verified until deploy release check and production UI smoke are green.
