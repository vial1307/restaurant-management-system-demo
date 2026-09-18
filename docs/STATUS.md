# Kitchen OS Engineering Status

> Read this after `docs/CURRENT_HANDOFF.md`. This is the short operational workboard; `docs/WORK_LOG.md` remains the chronological log.

## Current authority

- Repository: `vial1307/restaurant-management-system-demo`
- Production data authority: Browser/UI -> VPS API -> PostgreSQL.
- PostgreSQL stays private behind the VPS/API boundary.
- Verified production milestone: `3a3392133483c6575a63d61a04d085a2d50df692`.
- Verified production workflow: Deploy Kitchen OS to VPS #724, run `35377327661`.
- Verified production schema: `021`.
- Production UI smoke: PASS.
- Inventory cross-site refresh and PostgreSQL storage relocation invariants remain green.

## Release #724 completed — 2026-09-19

PR #108 fixed the failed host-metrics deployment and added the Super Admin GitHub/Handoff surface.

Verified release evidence:

- exact deploy target: `3a3392133483c6575a63d61a04d085a2d50df692`;
- pre-deploy backup created successfully;
- migration `021_admin_row_revisions.sql` applied;
- schema verifier: `021`;
- Super Admin revision columns: 5;
- Super Admin revision triggers: 5;
- API health: PASS;
- Web/API/Super Admin edge health: PASS;
- production release check: `3a33921`;
- production UI smoke: PASS.

Host metrics collector recovery:

- root cause: GNU `df` inode flags were used with an incompatible output combination;
- collector command corrected;
- collector now has actionable error diagnostics;
- systemd install emits status/journal evidence on failure;
- deploy preflight now executes the collector instead of syntax-checking only;
- the real VPS host-metrics install step passed in release #724.

## Active follow-up

Branch: `chore/runtime-handoff-status-20260919`

Purpose:

- make Super Admin GitHub/Handoff read live release/schema from the serving runtime;
- keep static handoff metadata focused on current work/next queue rather than hard-coded production SHA;
- display the resolved host-metrics incident as history instead of an active blocker.

This follow-up must pass the same PR/release gates before merge.

## VPS capacity milestone

Capacity audit run `35377327695` completed successfully before release #724.

Observed host state:

- OS: Ubuntu 22.04.5 LTS;
- CPU: 2 vCPU, Intel Xeon E-2236 @ 3.40 GHz;
- root filesystem: 49 GB total, 5.1 GB used, 44 GB available (~11% used);
- inode use: ~2%;
- Kitchen OS directory: ~38 MB;
- backup directory: ~15 MB;
- backup count at audit time: 72;
- primary interface: `eth0`;
- host traffic counters at audit time: RX ~16.29 GB, TX ~0.72 GB since boot;
- external HTTPS total response time in the sample set was roughly 0.67–0.90 seconds.

Provider monthly traffic quota remains unknown unless configured from the VPS provider's real plan data.

## Next queue

1. Merge/deploy the runtime-backed handoff follow-up only after all gates are green.
2. Continue normalized-domain cutover one business domain at a time; never create a second writable authority.
3. Keep domain-specific transactional APIs where generic CRUD could bypass inventory/workforce/payroll/SOP invariants.
4. Add restore-verification evidence and off-site encrypted backup when extending backup operations.
5. Add provider bandwidth quota only when the real provider limit is known.

## Handoff rule

Before stopping work:

1. update this file with DONE / IN PROGRESS / NEXT / BLOCKED;
2. append the session to `docs/WORK_LOG.md`;
3. update `docs/CURRENT_HANDOFF.md` with exact verified production evidence;
4. keep the Super Admin GitHub/Handoff metadata aligned with the current continuation point;
5. never label a release as verified until deploy release check and production UI smoke are green.
