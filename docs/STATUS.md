# Kitchen OS Engineering Status

> Read this after `docs/CURRENT_HANDOFF.md`. This is the short operational workboard; `docs/WORK_LOG.md` remains the chronological log.

## Current authority

- Repository: `vial1307/restaurant-management-system-demo`
- Production data authority: Browser/UI -> VPS API -> PostgreSQL.
- PostgreSQL stays private behind the VPS/API boundary.
- Last verified production runtime: `d15ae2087d293111b989b5e5efe7d56ac3bebb84`, Deploy Kitchen OS to VPS #691.
- Last verified production schema: `020`.
- Main now contains the secure Admin/Data + metrics candidate through merge commit `d2acef474866460c75ce66b6f5675306481bb65b`, including schema `021`.
- Do **not** call `d2acef47…` production: its production deploy failed before migration/restart.

## Active work — 2026-09-19

- Branch: `fix/host-metrics-deploy-resilience-20260919`
- Draft PR: #108 — Add Super Admin GitHub handoff and repair host-metrics deploy
- Current work URL: `https://github.com/vial1307/restaurant-management-system-demo/pull/108`
- Status: **VERIFYING PR #108.** API/static/cross-device Super Admin checks are green; full release workflow remains the merge gate.

### Exact stopping point

Main deploy workflow run `35372160924` passed preflight and full regression, then failed at:

`Deploy exact tested commit -> Installing filtered host metrics snapshot`

Root cause observed in the deploy log:

- `kitchen-os-host-metrics.timer` was installed/enabled;
- the first `kitchen-os-host-metrics.service` run exited 1;
- deploy stopped **before** backup, schema migration, container restart, release verification and production UI smoke.

Fix implemented on PR #108:

- corrected the GNU `df` inode command that caused the collector to exit under `set -e`;
- added collector error diagnostics;
- added systemd status/journal diagnostics on service-start failure;
- added a CI preflight that executes the host collector instead of syntax-checking only.

Current verification focus:

- `.github/workflows/deploy-vps.yml`
- `vps/scripts/collect-host-metrics.sh`
- `vps/scripts/install-host-metrics-timer.sh`

### Super Admin GitHub / Handoff section

Implemented on PR #108:

- new **System -> GitHub & Handoff · 開發交接** section;
- protected `GET /api/admin/super/development-status`;
- current branch + current PR link;
- main baseline commit + failed workflow link;
- verified production SHA/schema separate from candidate main SHA/schema;
- exact stopping point and code-focus files;
- ordered next steps;
- direct links to `CURRENT_HANDOFF.md`, `WORK_LOG.md`, `STATUS.md`, `DEVELOPMENT_RULES.md`;
- metadata endpoint returns no credentials, SSH keys, environment dumps or raw host access.

## Completed in previous candidate

- Generic Super Admin CRUD remains server allowlisted.
- Unknown fields fail closed.
- Durable identity columns are immutable after creation.
- Update/archive uses DB-owned integer `row_revision` from schema 021.
- Non-zero inventory stock cannot be archived through generic CRUD.
- Host metrics are filtered before reaching the API.
- `/api/admin/super/system-metrics` requires `system.super_admin`.
- Monthly provider bandwidth quota is not guessed from host counters.

## Next queue

1. Confirm PR #108 host-metrics runtime smoke + full API/browser/full-device release gates.
2. Merge only when all gates are green.
3. Deploy the exact tested merge SHA; metrics service remains a required production component.
4. Verify release + schema 021 + production UI smoke.
5. Update `CURRENT_HANDOFF.md`, `WORK_LOG.md`, this file and Super Admin development metadata with the final production SHA/run.
6. Continue normalized-domain/database redesign one business domain at a time without creating a second writable authority.

## Handoff rule

Before stopping work:

1. update this file with DONE / IN PROGRESS / NEXT / BLOCKED;
2. append the session to `docs/WORK_LOG.md`;
3. update `docs/CURRENT_HANDOFF.md` with the exact production SHA and verification result;
4. keep Super Admin `development-status` metadata aligned with the current branch/PR/stopping point;
5. never label a SHA as production until deploy release verification and production smoke are green.
