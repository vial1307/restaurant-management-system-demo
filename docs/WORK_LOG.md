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
- Main deployment workflow run: `34715840529` for exact application commit `69fcc350dd8f9cb645177eb571ecef956479d34d`.
- Isolated API load-smoke run: `34715840533` — passed 10/25/50-client smoke.
- Production result verified: preflight, regression, exact-SHA VPS deploy, health/release check and `production-ui-smoke` all completed successfully.
- Production deploy job used the existing server-side backup/rollback path before releasing the exact tested commit.

### Database safety
- No schema/data migration is introduced by PR #80.
- Before the next schema/data migration, preserve one immutable original PostgreSQL baseline dump outside normal rotating backups. Do not claim this baseline exists until it has been verified on the VPS.

### Next continuation point
1. Build attendance correction/request workflow as the next workforce slice; employee/part-time submit their own correction request, manager/admin approve or reject, and approved correction invalidates attendance approval so it must be reviewed again.
2. Then continue payroll history/export and configurable scheduling/shift rules without inventing wage rules.
3. Keep manager/admin authority distinct from employee/part-time self-service and certify desktop/mobile parity through the existing release gates.

## 2026-09-13 — Attendance correction request slice

### Branch and specification
- Branch: `feat/workforce-attendance-corrections-20260913`.
- Spec delta: `docs/spec-deltas/2026-09-13-workforce-attendance-correction-requests.md`.
- PostgreSQL storage remains the existing `business_state.modules.attendance` JSONB document; this slice introduces no SQL migration.

### Implemented behavior
- Employee/part-time accounts can submit a correction request only for their own attendance row and cancel their own pending request.
- Manager/admin accounts with attendance edit authority can approve or reject; supervisor cannot decide requests.
- Approval applies the requested clock-in/clock-out on the VPS, clears the row's prior attendance approval metadata and therefore requires normal attendance approval again before a payroll period can lock.
- Approval refuses stale source attendance and locked payroll periods.
- `attendance.correctionRequests` is server-owned workflow state: generic attendance saves preserve it instead of allowing clients to forge/delete workflow decisions.
- Employee/part-time business-state reads expose only their own correction requests.
- Desktop/mobile use the same endpoints and correction UI actions.

### Regression coverage added
- New combined API/browser gate: `tests/workforce-attendance-correction-regression.mjs`.
- Coverage includes ownership/privacy, spoof resistance, duplicate-pending rejection, own cancellation, manager/supervisor boundary, server-owned workflow preservation, stale-source rejection, reject-note requirement, payroll-lock protection, approval invalidation and mobile employee/manager browser flow.
- The regression is wired into `tests/full-device-regression.mjs`, so it runs in the existing release gate with the live isolated API/frontend test servers.

### Current verification state
- Implementation is complete on the feature branch and awaiting GitHub Actions validation; no CI result is claimed yet.
- Do not merge or deploy until preflight/regression gates are green.

### Database safety
- No schema/data migration is needed for this slice, so the immutable original PostgreSQL baseline requirement is not triggered yet.
- The baseline remains unverified and must be created/verified before the next real schema/data migration.

### Next continuation point
1. Open the attendance-correction PR and run the standard preflight/regression pipeline.
2. Fix any CI defects without weakening permission, data-integrity or device-parity assertions.
3. After green CI, merge to `main`, verify exact-SHA VPS deployment and production UI smoke, then update this log with final commit/run IDs.
4. Continue to payroll history/export and configurable scheduling/shift rules.
