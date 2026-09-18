# Kitchen OS Engineering Status

> Read this after `docs/CURRENT_HANDOFF.md`. This file is the short operational workboard; `docs/WORK_LOG.md` remains the chronological log.

## Current authority

- Repository: `vial1307/restaurant-management-system-demo`
- Production data authority: Browser/UI -> VPS API -> PostgreSQL
- PostgreSQL is private to the VPS Docker network; browsers never connect to PostgreSQL directly.
- Last verified production runtime before this workstream: `d15ae2087d293111b989b5e5efe7d56ac3bebb84`, Deploy Kitchen OS to VPS #691.
- Current production schema before this workstream: `020`.
- Inventory state baseline: cross-site refresh and storage relocation are green; do not replace them with browser/localStorage authority.

## Active workstream — 2026-09-18

Branch: `fix/secure-admin-data-vps-metrics-20260918`

### Implemented on branch

- Hardened Super Admin Data Tables:
  - explicit server-side dataset/column allowlist remains the only generic CRUD surface;
  - unknown fields are rejected rather than silently ignored;
  - dataset-specific validation and text limits;
  - identity columns such as menu `site_code/item_code`, inventory `item_key/catalog_key`, and SOP `site_code/sop_code` become immutable after creation;
  - update/archive requires the row's current database `row_revision` token to prevent stale overwrite;
  - inventory items with non-zero stock cannot be archived through generic CRUD;
  - every successful mutation still writes `audit_logs`.
- Added Super Admin-only system metrics endpoint:
  - host CPU/load/uptime;
  - RAM/swap;
  - root disk and inode use;
  - Kitchen OS / backup / PostgreSQL storage footprint;
  - Docker service status for API, PostgreSQL and Caddy;
  - host network RX/TX counters, recent transfer rate and NIC link speed;
  - PostgreSQL logical database size, connection usage and top table/index sizes.
- Host metrics are collected outside the app container and exposed to the API through one filtered read-only snapshot file. No Docker socket, host filesystem, shell, or PostgreSQL port is exposed to the browser.
- Deployment installs a systemd metrics timer and mounts only the filtered runtime directory read-only into the API container.
- Regression fixtures/tests cover Super Admin authorization, metrics rendering, stale-write protection, immutable identity fields and unknown-field rejection.

### In progress

- CI / browser / API regression for this branch.
- Production deployment and post-deploy verification.
- Capture actual VPS capacity/network counters from production after deploy.
- Final handoff/log update with deployed SHA and workflow result.

## Next queue

1. Finish normalized-domain cutover from `business_state.modules` one domain at a time. Never introduce a second writable authority.
2. Add restore-verification evidence/off-site encrypted backup when the VPS backup workflow is extended.
3. Add an optional provider bandwidth-quota setting if the VPS vendor plan includes a monthly traffic cap. Host OS counters alone cannot prove provider billing quota.
4. Continue Super Admin data editors with domain-specific forms where generic CRUD would bypass business invariants.

## Handoff rule

Before stopping work:

1. update this file with `DONE / IN PROGRESS / NEXT / BLOCKED`;
2. append the session to `docs/WORK_LOG.md`;
3. update `docs/CURRENT_HANDOFF.md` with the exact production SHA and verification result;
4. never label a SHA as production until the production release check and smoke tests are green.
