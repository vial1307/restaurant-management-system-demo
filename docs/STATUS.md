# Kitchen OS Engineering Status

> Read this after `docs/CURRENT_HANDOFF.md`. This is the short operational workboard; `docs/WORK_LOG.md` remains the chronological log.

## Current authority

- Repository: `vial1307/restaurant-management-system-demo`
- Production data authority: Browser/UI -> VPS API -> PostgreSQL.
- PostgreSQL stays private behind the VPS/API boundary.
- Verified production commit: `9aae83a329541e2f65d968c7b1b6adc8bf56097c`.
- Verified production workflow: Deploy Kitchen OS to VPS #726, run `35378902959`.
- Verified production schema: `021`.
- Production UI smoke: PASS.
- Super Admin GitHub/Handoff now reads live release + schema from the serving runtime.
- Inventory cross-site refresh and PostgreSQL storage relocation invariants remain green.

## Release #726 completed — 2026-09-19

PR #109 made the Super Admin GitHub/Handoff state runtime-backed instead of manually pinning the active production SHA.

Verified release evidence:

- exact deploy target: `9aae83a329541e2f65d968c7b1b6adc8bf56097c`;
- pre-deploy backup created successfully;
- schema verifier: `021`;
- Super Admin revision columns: 5;
- Super Admin revision triggers: 5;
- API health: PASS;
- Web/API/Super Admin edge health: PASS;
- production release check: `9aae83a`;
- production UI smoke: PASS.

The protected development-status endpoint now returns:

- live runtime release;
- live runtime schema;
- a direct commit link for the serving release;
- current work/handoff metadata kept separately from runtime truth.

Static handoff metadata no longer needs a manual production SHA change after every release.

## VPS capacity audit #5

Run `35378899688` completed successfully for the release #726 workstream.

Observed host state:

- OS: Ubuntu 22.04.5 LTS;
- CPU: 2 vCPU, Intel Xeon E-2236 @ 3.40 GHz;
- container memory limit/visible host memory: ~3.85 GiB;
- root filesystem: 49 GB total, 5.1 GB used, 44 GB available (~11% used);
- inode use: ~2%;
- primary interface: `eth0`;
- host traffic counters at audit time: RX ~16.29 GB, TX ~0.73 GB since boot;
- Kitchen OS web/API/PostgreSQL containers: healthy;
- external HTTPS sample totals: mostly ~0.51–0.70 seconds, with occasional slower samples.

Provider monthly traffic quota remains unknown until real provider-plan data is configured. Host counters are usage observations, not billing-quota data.

## Current continuation point

The secure Admin/Data + VPS metrics + GitHub/Handoff workstream is complete and production verified.

Next engineering work starts from:

- main / production SHA `9aae83a329541e2f65d968c7b1b6adc8bf56097c`;
- schema `021`;
- no active production blocker.

Next queue:

1. Continue normalized-domain/database redesign one business domain at a time.
2. Never create a second writable authority alongside the VPS API/PostgreSQL path.
3. Keep domain-specific transactional APIs where generic CRUD could bypass inventory/workforce/payroll/SOP invariants.
4. Define migration, backfill, rollback and verification before destructive schema changes.
5. Add restore-verification evidence and off-site encrypted backup when extending backup operations.
6. Add provider bandwidth quota only when the real provider limit is known.

## Handoff rule

Before stopping work:

1. update this file with DONE / IN PROGRESS / NEXT / BLOCKED;
2. append the session to `docs/WORK_LOG.md`;
3. update `docs/CURRENT_HANDOFF.md` with exact verified production evidence;
4. keep the Super Admin GitHub/Handoff metadata aligned with the current continuation point;
5. never label a release as verified until deploy release check and production UI smoke are green.
