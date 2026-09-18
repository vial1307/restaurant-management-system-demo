# Kitchen OS — Current Development Handoff

Last updated: 2026-09-18 (Asia/Taipei)

This document is the current continuation point for any developer or future ChatGPT session working on Kitchen OS. It must be updated whenever a significant production fix, schema migration, deployment, or workstream handoff occurs.

Do not store credentials, private keys, passwords, database secrets, or SSH secrets in this repository.

## 1. Repository / production authority

- Repository: `vial1307/restaurant-management-system-demo`
- Branch of record: `main`
- Current main HEAD at handoff creation: `d15ae2087d293111b989b5e5efe7d56ac3bebb84`
- Production URL: `https://82.47.180.185.nip.io`
- Super Admin URL: `https://82.47.180.185.nip.io/.admindev.html`
- Production database schema: PostgreSQL migrations through schema 020.
- Runtime authority: Browser/UI -> VPS API -> PostgreSQL.
- Browser localStorage is cache/UI state only; it is not an authoritative shared inventory/business database.

## 2. Last verified production release

The current verified production deployment is:

- Workflow: Deploy Kitchen OS to VPS #691
- Run ID: `35335888439`
- Tested/deployed commit: `d15ae2087d293111b989b5e5efe7d56ac3bebb84`
- Result: SUCCESS
- Preflight: PASS
- API/inventory regression: PASS
- Desktop/mobile Chromium regression: PASS
- Full-device cross-browser regression: PASS
- SSH deploy: PASS
- Production UI smoke: PASS

This production release includes the forced fresh VPS snapshot on site switching and the database-backed storage relocation flow.

Never claim a newer production SHA until its deploy + production smoke jobs are green.

## 3. Completed: cross-site inventory tab synchronization

User-reported problem:
- Switching 央廚 / 復興 / 永吉 could visually change the selected site while the visible data still came from a previous site or from a recent client cache.

Root causes fixed:
1. Site UI could render before PostgreSQL hydration completed.
2. Inventory sync used one shared queue, allowing a late response from a previously active branch to overwrite the shared branch record.
3. Site switching could reuse the short-lived VPS inventory/master-data cache instead of forcing a fresh database-backed snapshot.

Current behavior:
- Interactive site switching uses `switchActiveInventorySite()`.
- The target site is hydrated before `shitu:active-site-changed` is emitted.
- If hydration fails, the active-site preference rolls back instead of displaying a new site with stale data.
- `applyBranch()` rejects stale branch hydration when the response site is no longer the active site.
- Interactive site switching forces fresh inventory + master-data fetches from VPS, bypassing the short client cache.

Important files:
- `src/inventory-cloud.js`
- `src/auth-layer.js`
- `tests/mobile-role-site-certification.mjs`
- `tests/static-regression.mjs`

Important commits:
- `13f8312e` — hydrate target site before warehouse switch render
- `13c9498c` — await PostgreSQL hydration in site-switch UI
- `9b2de03e` — prevent stale branch sync from overwriting active site
- `dbfecf66` — regression for real Yongji -> Central -> Fuxing transitions
- `483833a9` — force fresh VPS snapshot on every interactive site switch
- `d15ae208` — static guard requiring the forced VPS refresh behavior

## 4. Completed: storage relocation must use PostgreSQL

User-reported problem:
- Changing an item's storage location, e.g. 大冷凍 -> 4門冰箱 / 廚房冰箱 / 大冷藏, could fail or behave like a local/catalog metadata edit rather than a real inventory movement.

Root cause:
- The storage-location dropdown in the inventory management table previously used catalog sync. Catalog sync is configuration-oriented and is intentionally prevented from silently deleting stock rows that still contain quantity.
- Therefore changing `zone` was not equivalent to moving physical stock.

Current solution:
- New endpoint: `POST /api/inventory/relocate-storage`.
- The operation runs in one PostgreSQL transaction.
- It locks the source/destination stock rows.
- It moves the entire source quantity into the destination quantity.
- Destination minimum becomes the max of the existing destination minimum and source minimum.
- The old source stock association is removed.
- If the item's fixed receiving location points to the old storage location, it is moved to the destination location in the same transaction.
- A transfer transaction is written when moved quantity > 0.
- An `inventory_storage_relocate` audit log is always written.
- The UI does not optimistically change local `zone`; it waits for VPS confirmation and reloads the authoritative inventory snapshot.

Important files:
- `vps/backend/src/inventory-extra-routes.mjs`
- `src/vps-api.js`
- `src/inventory-cloud.js`
- `src/app.js`
- `vps/backend/scripts/api-regression.mjs`
- `tests/static-regression.mjs`
- `tests/catalog-stocktake-boundary-regression.mjs`

Important commits:
- `e9b1f4bf` — atomic storage relocation API
- `d50c0a38` — VPS API client wrapper
- `f0a36165` — database-backed relocation client
- `ebb0453b` — branch storage dropdown uses PostgreSQL relocation
- `41b5887f` — API regression proving source/destination/minimum/receive-default results
- `b8942bc8` — frontend static guard
- `656ea272` — preserve stocktake permission regression while using scoped site variable

Regression proof:
- API test creates a branch item in `fuxing-freezer` with quantity/minimum.
- It relocates the item to `fuxing-four`.
- The test requires the source stock association to disappear, destination quantity/minimum to be correct, and fixed receive default to move to `fuxing-four`.

## 5. Inventory invariants that must not be broken

- `領貨`: branch internal withdrawal/use flow.
- `庫存轉撥`: same-site movement between storage locations.
- `出貨`: cross-site transfer.
- Cross-site direct transfer must remain atomic: source decrement + destination increment in one DB transaction.
- Internal location relocation is not a catalog metadata edit.
- Quantity/minimum stocktake permissions remain stricter than catalog metadata permissions.
- Receiving-default routing is database-backed and manager/admin controlled.
- No browser code may connect directly to PostgreSQL.
- Every inventory mutation must be authenticated, authorized, validated and auditable server-side.
- Never overwrite VPS stock from a stale browser snapshot.
- Equivalent behavior must work for 央廚 / 復興 / 永吉 unless an explicit business rule differs.

## 6. Super Admin / catalog synchronization state

Completed:
- Super Admin standalone panel exists at `/.admindev.html`.
- `superadmin` role/capability is separate from ordinary admin.
- Inventory catalog audit separates:
  - identity drift: VI/Traditional Chinese naming differences
  - operational variance: unit/work_area/storage_only differences
- Receive-default backfill migration 019 completed.
- Identity majority synchronization migration 020 completed.
- Manual identity resolver exists for ambiguous remaining catalog-name drift and is audit logged.

Do not auto-normalize operational variants without business confirmation.

## 7. Next work queue requested by product owner

Do these after inventory site/relocation stability is confirmed.

### P1 — Database redesign for secure editable data

Goal:
- redesign the database/data-admin surface so authorized administrators can safely add/edit operational data behind the VPS API.

Requirements:
- PostgreSQL remains private behind VPS API; never expose DB credentials/browser SQL access.
- Use explicit server-side allowlists, validation and capability checks.
- Add audit history for sensitive CRUD.
- Prefer relational canonical data where shared business facts require consistency.
- Define migration + rollback/backfill path before destructive schema changes.
- Keep backups and production integrity audit in the deploy path.
- Review existing `docs/DATABASE_CORE_V2.md` and `docs/DATABASE_PERSISTENCE_AUDIT.md` before creating new schema.

### P2 — Repository handoff / engineering journal

This file and `docs/WORK_LOG.md` are the initial implementation.

Continue by maintaining:
- current production SHA/run
- current schema version
- current feature/fix being worked on
- last successful verification
- failed runs and root causes
- exact continuation point
- important files/commits
- known risks
- ordered backlog

Recommended future addition:
- PR/issue templates that require a work-log update for production-impacting changes.
- A lightweight `docs/STATUS.md` generated/updated by developers when releasing.

### P3 — VPS detailed metrics in Super Admin

Add detailed server/database health data, without exposing secrets:
- total/used/free disk
- memory total/used/available
- CPU/load
- uptime
- container/service status
- PostgreSQL database size
- table/index size summaries
- active/max DB connections
- backup footprint
- frontend/backend deployed SHA
- schema version
- network interface totals / bandwidth counters when available from the host
- optional recent traffic rate if a reliable host metric source exists

Security:
- Super Admin-only endpoint.
- Never return passwords, environment secrets, session secrets, private keys, connection strings or raw sensitive process environment.
- Prefer a narrow server metrics API rather than shell access from the browser.

## 8. Deployment policy

Production workflow:
- `.github/workflows/deploy-vps.yml`
- exact tested commit only
- preflight gate
- API/PostgreSQL regressions
- browser/mobile/full-device regressions
- server-side PostgreSQL backup
- schema migrations
- production integrity audit
- health/release SHA verification
- production UI smoke

Never bypass the release gates to push a fix directly to production.

## 9. Immediate continuation procedure

When resuming work:
1. Fetch current `main` HEAD.
2. Check the newest `Deploy Kitchen OS to VPS` run.
3. Production is verified at #691 / `d15ae2087d293111b989b5e5efe7d56ac3bebb84`; re-confirm only if a newer production-impacting commit exists.
4. Re-test the user-facing storage relocation flow and cross-site switching if any inventory code changes after this handoff.
5. Start P1 database redesign from this verified green baseline.
6. Update this file and `docs/WORK_LOG.md` at the end of the next substantial work session.


## 2026-09-18 continuation — secure admin writes and VPS telemetry

The inventory synchronization/relocation baseline above remains authoritative and must not be rewritten.

A continuation branch `fix/secure-admin-data-vps-metrics-20260918` was created from main `d84484a15bd835e7890921267ba59984ca37967a`. This branch hardens the existing Super Admin database surface instead of creating a parallel database authority, and adds filtered VPS metrics without exposing host/Docker/PostgreSQL internals directly to the browser.

Key new invariants on the candidate branch:

- generic admin datasets remain static backend allowlists, never arbitrary SQL/table access;
- unknown fields fail closed;
- durable identity columns are immutable after creation;
- update/archive must carry the currently loaded database `row_revision` token and stale writes return conflict;
- inventory with non-zero relational stock cannot be archived through generic CRUD;
- host metrics are collected outside the app container into a filtered file mounted read-only;
- `/api/admin/super/system-metrics` requires `system.super_admin`;
- monthly provider bandwidth quota is not guessed from host counters.

See `docs/STATUS.md` for the active short workboard. Do not mark this candidate as production until CI, deployment release verification and production smoke are green.


## 2026-09-19 — PR #108 current continuation

Main now contains merge commit `d2acef474866460c75ce66b6f5675306481bb65b` from PR #107, including schema 021 and secure Admin/Data/VPS metrics work. This commit is **not yet verified production**.

Production deploy workflow run `35372160924` passed preflight and full regression, then stopped during the new host-metrics install step:

- stopping point: `Installing filtered host metrics snapshot`;
- `kitchen-os-host-metrics.service` exited 1;
- failure happened before backup, migration, container restart and release verification;
- therefore the last verified production remains `d15ae2087d293111b989b5e5efe7d56ac3bebb84`, schema 020.

Current continuation:

- branch: `fix/host-metrics-deploy-resilience-20260919`;
- draft PR: #108;
- current work link: `https://github.com/vial1307/restaurant-management-system-demo/pull/108`;
- immediate code focus: `vps/scripts/collect-host-metrics.sh`, `vps/scripts/install-host-metrics-timer.sh`, `vps/scripts/deploy.sh`.

PR #108 also adds a Super Admin **GitHub & Handoff** section backed by a Super Admin-only API. It shows the current PR/branch, verified production vs candidate state, failed workflow, exact stopping point, code-focus files, handoff docs and ordered next steps. The endpoint must remain metadata-only and must never expose credentials, environment dumps, SSH keys, private keys or direct host/database access.

Next developer must read this file, `docs/STATUS.md`, `docs/WORK_LOG.md` and `docs/DEVELOPMENT_RULES.md` before changing production code.
