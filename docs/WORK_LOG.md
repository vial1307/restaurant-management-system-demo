# Kitchen OS Work Log

This file is the canonical continuation log for implementation, CI, merge and deployment work. Do not record credentials, secret values or private keys here.

## 2026-09-13 — Workforce leave / shift-change workflow

### Scope
- Pull request: #80 `Add workforce leave and shift-change requests`
- Feature branch head tested before merge: `0a3065bf064cb110cbab11a538abcb2dfa4253ca`
- Squash merge commit on `main`: `69fcc350dd8f9cb645177eb571ecef956479d34d`
- Storage remains in the existing PostgreSQL `business_state.modules.schedule` JSONB document; this phase requires no SQL migration.

### CI diagnosis and resolution
- The original PR workflow failure was isolated to the existing `Full-device cross-browser regression` gate, not the new workforce API/browser request tests.
- The captured full-device artifact showed all scoped mobile role/site Chromium cases passing; the one failure was a timeout while certifying the administrator mobile navigation state.
- No permission assertion or release gate was weakened. The exact failed regression job was rerun unchanged.
- Rerun result: preflight and regression passed, including workforce approval/request coverage, mobile role/site certification and full-device cross-browser coverage.
- PR #80 was merged only after the unchanged release gates were green.

### Production pipeline
- Main deployment workflow run: `34715840529` for exact application commit `69fcc350dd8f9cb645177eb571ecef956479d34d` — completed successfully.
- Deploy job passed VPS SSH secret check, SSH configuration, exact tested-commit deployment with server-side backup/rollback, and production health/release verification.
- Production UI smoke passed against the deployed release.
- Isolated API load-smoke run: `34715840533` — passed 10/25/50-client smoke.

### Database safety
- No schema/data migration is introduced by PR #80.
- Before the next schema/data migration, preserve one immutable original PostgreSQL baseline dump outside normal rotating backups. Do not claim this baseline exists until it has been verified on the VPS.

## 2026-09-13 — Attendance correction request workflow

### Active branch
- Branch: `feat/workforce-attendance-correction-20260913`
- Base: `ef420702da68285a956c9e24c636d8294ced9e71`
- This phase uses the existing PostgreSQL `business_state.modules.attendance` JSONB document and does not introduce a SQL migration.

### Implemented so far
- Added spec delta: `docs/spec-deltas/2026-09-13-workforce-attendance-correction-requests.md`.
- Added VPS-owned correction workflow routes in `vps/backend/src/workforce-attendance-correction-routes.mjs` for create, own pending cancellation, manager/admin approval and manager/admin rejection.
- Correction requests bind identity from the authenticated VPS account; employee/part-time cannot choose another `staffId`.
- Requested fields are allow-listed and exclude `hourlyRate`.
- Manager approval checks a source snapshot before applying the delta and invalidates prior attendance approval metadata so payroll must re-review the corrected row.
- Locked payroll periods block correction application at decision time until the existing audited payroll reopen flow is used.
- Generic manager attendance writes now preserve server-owned `correctionRequests` rather than accepting forged/deleted workflow state from clients.
- Self-service business-state reads now scope `correctionRequests` to the authenticated employee/part-time staff identity.
- Added API regression client `vps/backend/scripts/workforce-attendance-correction-regression-client.mjs` covering unsupported pay-rate edits, invalid time range, own request creation, supervisor denial, generic-write preservation, manager approval, approval invalidation, payroll relock guard and locked-period behavior.

### Commits on active branch
- `8afb4c550884bc90311faeb8e790723c26237780` — attendance correction specification.
- `d48cdda93999125e7bce0a8a52e627b8a3f874ff` — attendance correction API workflow.
- `7e28f5180435bd7074740de44ab87cf84cd2bd15` — register correction routes.
- `37780189631f72e31e6bb969a48f36d6a7cbb0f7` — preserve correction workflow on generic attendance writes.
- `a953b71692f8c281004053b6ce4431c24769bc3f` — self-service correction-request scoping.
- `c060fee4c706d530fcaa729ba1e43a1039a3b08a` — API regression client.

### Remaining before merge
1. Align `scheduledStart` correction validation with the canonical attendance representation (`HH:MM` from schedule data), then extend regression coverage for that field.
2. Wire the correction API regression into the required GitHub Actions regression job.
3. Add the Attendance-tab UI for employee submission/history and manager/admin approval/rejection, using the same desktop/mobile behavior path.
4. Add browser regression for employee submission and manager decision on mobile Chromium.
5. Run full PR CI, fix regressions without weakening gates, merge only when green, then allow the existing exact-SHA VPS deployment + production UI smoke pipeline to deploy `main`.

### Database safety
- No SQL migration is required for the current correction-request phase, so the immutable original baseline is not yet consumed or claimed.
- Before any later payroll-history/schema migration, verify and preserve the one immutable original PostgreSQL baseline on the VPS.

### Next continuation point
- Continue from `feat/workforce-attendance-correction-20260913`.
- Finish correction-request frontend + regression wiring first.
- After correction workflow is green/deployed, continue payroll history/export and configurable shift-rule work without hardcoding personal wage rules.
