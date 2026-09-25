# Kitchen OS — Current Development Handoff

## Completed correction — Super Admin Role and workplace, 2026-09-25

- PR #140 merged as `b4d9cbe11caac5352226fde228cf88e07c7e4a57`. The user-reported `INVALID_LOCATION` came from retaining `all` when changing an administrator to an assigned branch Role. The editor now offers only `all` for all-scope Roles, `central` for the central Role, or active branch sites for assigned Roles. It retains a selected branch across Role changes and preserves custom module permissions. The form validates before submitting and reports a readable error if the API rejects the workplace. Six-device Super Admin regression and PostgreSQL account create/reload passed.
- Deploy #847 / run `36151553155` passed full regression but stopped before activating its frontend because the production integrity script read stale legacy `app_users.permissions` JSON for a new administrator. PR #141 fixed that audit to check effective role policy plus permission overrides, retaining a hard failure for actual missing admin rights; no production account data was rewritten.
- **Verified production release:** PR #141 merged as `f2ea2b3713e610c98e9ec90cd2178f5a2d5e682f`. Deploy #849 / run `36153187681` passed preflight, API/PostgreSQL/browser/device regression, backup, corrected `DATA_INTEGRITY_OK` with all admin module permissions OK, deploy, health and `PRODUCTION_UI_SMOKE_OK` including the permission modal. Runtime returned `release=f2ea2b3`, `schema=024`, app/database `ok`. Backup: `kitchen_os_20260925T152227Z.dump`.

The current runtime release, rather than the older static `development-status.mjs` release-evidence milestone, is authoritative for production SHA. A future status-metadata update can refresh that fallback without changing account/business data.


## Completed correction — 2026-09-25

- PR #139 merged as `ee5316b8ae5f12f2288aebf54e9e9cede3756ba0`. VPS deploy #843 / run `36142844487` passed preflight, full regression, backup/deploy and production UI smoke; production health returned `release=ee5316b`, `schema=024`, `app=ok`, `database=ok`. Backup: `kitchen_os_20260925T134859Z.dump`.
- Central/Fuxing/Yongji now share site-scoped PostgreSQL master labels/options and authoritative catalog/stock snapshots between the main website and Super Admin. Central overview Edit opens its form; branch ingredient writes send the explicit form draft through the catalog API. Clean open forms refresh after remote changes; unsaved drafts remain visible and cannot submit stale values until reopened. Mobile WebKit ingredient editors fit without page overflow.
- Super Admin ingredient rows show work area and storage with compact Edit and expandable stock, receiving and archive actions. There was no schema migration or production data rewrite.
- Exact-head CI passed Super Admin Browser `36142056162` on six device profiles, with independent two-session edits/reloads on all three sites at 320px and 1366px; complete API/PostgreSQL/browser/device regression `36142055831`, API load `36142055866`, workforce diagnostic `36142055825`. The merged release passed its own full regression and production smoke (`PRODUCTION_UI_SMOKE_OK`).

Last updated: 2026-09-25 (Asia/Taipei)

This document is the current continuation point for any developer or future ChatGPT session working on Kitchen OS. It must be updated whenever a significant production fix, schema migration, deployment, or workstream handoff occurs.

Do not store credentials, private keys, passwords, database secrets, or SSH secrets in this repository.

## Completed release — Super Admin branch inventory database

PR #138 merged as `5cc4f907387873367d78dfbdfb3183971846e968` and deployed through #832 / run `35672333632`. The Database section now has a dedicated inventory workspace while retaining the other generic data tables. It supports independent site layouts, bilingual item/location/work-area editing, per-location stock/minimum actions, receiving defaults, relocation, history and local-site integrity checks. Existing work-stock must move through relocation; metadata saves do not replay quantities.

Optional stale-write guards and append-only stock associations preserve concurrent changes. Master-data/catalog writes publish inventory invalidations; dirty forms retain input until explicitly closed. No schema migration or destructive data conversion.

Verification completed: exact PR head `923f36a` passed all checks; Super Admin Browser run `35671898006` passed all six profiles, save/reload, peer-edit notification, stale-submit rejection and dirty-input retention. Master Data/Admin API run `35671897948` passed. The merged release passed full-system regression, VPS backup/deploy, runtime health/release checks and production UI smoke in run `35672333632`. Runtime returned `release=5cc4f90`, `schema=024`, `app=ok`, `database=ok`; inventory site-isolation audit passed with zero violations. Local Cloud Browser preview was unavailable; device evidence comes from CI, not a physical-device certification.

Open `https://82.47.180.185.nip.io/.admindev.html#data` and select a branch. This stage is complete; no branch setup data was automatically copied or rewritten. The production development-status fallback text was authored before deployment; this document and the live runtime/workflow evidence supersede its candidate wording. Older workforce candidate notes below are historical.

## 1. Repository / production authority

- Repository: `vial1307/restaurant-management-system-demo`
- Branch of record: `main`
- Current verified production SHA: `f2ea2b3713e610c98e9ec90cd2178f5a2d5e682f`
- Production URL: `https://82.47.180.185.nip.io`
- Super Admin URL: `https://82.47.180.185.nip.io/.admindev.html#development`
- Canonical one-link handoff: `https://vial1307.github.io/restaurant-management-system-demo/handoff.html`
- Production database schema: PostgreSQL migrations through schema 024.
- Runtime authority: Browser/UI -> VPS API -> PostgreSQL.
- Browser localStorage is cache/UI state only; it is not an authoritative shared inventory/business database.

## 2. Last verified production release

The current verified production deployment is:

- Workflow: Deploy Kitchen OS to VPS #849
- Run ID: `36153187681`
- Tested/deployed commit: `f2ea2b3713e610c98e9ec90cd2178f5a2d5e682f`
- Result: SUCCESS
- Preflight: PASS
- API/inventory regression: PASS
- PostgreSQL concurrency regression: PASS
- Desktop/mobile Chromium regression: PASS
- Full-device cross-browser regression: PASS
- SSH deploy with backup/rollback path: PASS
- Production health/release check: PASS
- Production UI smoke: PASS
- Database schema: `024`
- Inventory site-isolation triggers: 3
- Deploy-integrated inventory site/data-integrity audit: PASS
- Historical schedule cutover prerequisite: Parity #105 / `35571899839` and Backfill verify #316 / `35571899835` passed on release `30fd1dd`; these are not verification runs for #849.

Production audit after schema 022:

- `stock_site_mismatch = 0`
- `receive_default_site_mismatch = 0`
- `unknown_item_site = 0`

This release includes earlier inventory persistence/SSE and schedule-read work, PR #138 branch-scoped Super Admin Database configuration, PR #139 main ↔ admin convergence, PR #140 account workplace validation and PR #141 effective-RBAC production audit. It changes no schema or schedule authority.

Never claim a newer production SHA until its deploy + production smoke jobs are green.

## 3. Completed: inventory overview/editor real-time convergence

Production evidence:

- PR #133 merged as `a5da75d4dac54c38abbf825bc1d247798d25ba14`;
- final production source includes the test-only PR #134 merge `09e2fffc80bf186d15054002c00421a2a5525e8f`;
- Deploy #815 / run `35549929164`: PASS;
- exact release endpoint: `09e2fff`;
- schema remains `024`;
- preflight, API, PostgreSQL concurrency, desktop/mobile Chromium, full-device cross-browser, deploy, health/release and production UI smoke: PASS.

User-reported defects:

- quantity/minimum writes were still re-denied by legacy role names after `inventory.edit` had been explicitly granted;
- the Central overview showed work area and storage location as read-only even though the product editor could change them;
- branch scalar overview edits performed an optimistic local write/full render before database confirmation;
- the branch page rendered the current site-scoped cloud mirror, but its edit handlers and modal still looked up items in the stale long-lived store;
- `subscribeRealtime()` was a placeholder, so another tab/device waited for focus or the 60-second poll.

Production behavior:

- explicit `inventory.edit` plus allowed site scope is the single write authority for all exposed inventory fields; view-only and foreign-site accounts remain denied;
- Central overview work-area/storage selectors persist through catalog sync/transactional relocation and reconcile the product editor from PostgreSQL;
- branch overview quantity/minimum writes no longer mutate local state first and perform one forced authoritative reconciliation;
- today's branch overview, quick actions, transfers and product modal all layer the same site-scoped PostgreSQL mirror over the store before resolving an item;
- every successful inventory mutation publishes an authenticated SSE invalidation; other tabs/devices coalesce it, ignore their own source id and refresh the active permitted site;
- polling/focus/visibility remain fallback convergence paths;
- receive-default editing follows the same explicit edit-permission rule.

Two-tab browser regression proves an overview minimum write reaches PostgreSQL and repaints an already-open peer editor from the forced SSE snapshot. Direct rendered database item/location IDs prevent stale UI lookup from suppressing a valid write. Cross-tab shared `localStorage` equality no longer suppresses the peer document repaint.

### Exact next work

1. Preserve the inventory write/realtime invariants; do not reopen them as browser-local state.
2. Continue normalized-domain/database redesign one domain at a time.
3. Review and deploy the separate workforce-schedule relational read candidate only after its full regression job passes with the gate ON.
4. Keep compatibility schedule writes until relational reads have remained stable in production; compatibility retirement is a later explicit stage.

Verification prerequisite completed on 2026-09-21:

- Queue correction PR #136 merged as `30fd1ddff89cd821b5a66fe54ececca9f9e9825f` and deployed through #823 / run `35571481421`.
- Schedule Parity #105 / run `35571899839` passed against exact production release `30fd1dd`.
- Schedule Backfill verify #316 / run `35571899835` passed against the same exact release `30fd1dd`.
- The separate cutover candidate defaults VPS relational schedule reads ON and runs the complete deploy regression job with the gate ON.
- Compatibility schedule writes and module revision tokens remain active. Immediate rollback is `WORKFORCE_SCHEDULE_RELATIONAL_READ=false` in VPS `.env` followed by app-container recreation.

## 4. Completed: cross-site inventory tab synchronization

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

## 5. Completed: storage relocation must use PostgreSQL

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

## 6. Inventory invariants that must not be broken

- `領貨`: branch internal withdrawal/use flow.
- `庫存轉撥`: same-site movement between storage locations.
- `出貨`: cross-site transfer.
- Cross-site direct transfer must remain atomic: source decrement + destination increment in one DB transaction.
- Internal location relocation is not a catalog metadata edit.
- Quantity/minimum, catalog metadata and receiving-default writes require explicit `inventory.edit` within allowed site scope; a role name cannot re-deny a granted edit permission.
- Receiving-default routing remains database-backed and site-scoped.
- No browser code may connect directly to PostgreSQL.
- Every inventory mutation must be authenticated, authorized, validated and auditable server-side.
- Never overwrite VPS stock from a stale browser snapshot.
- Equivalent behavior must work for 央廚 / 復興 / 永吉 unless an explicit business rule differs.

## 7. Super Admin / catalog synchronization state

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

## 8. Next work queue requested by product owner

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
1. Fetch current `main` HEAD and read the live release/schema shown in Super Admin GitHub/Handoff.
2. Check the newest `Deploy Kitchen OS to VPS` run before treating a newer commit as production.
3. Current verified production baseline is #783 / `5bc9d92e878510c0646acced2b8070750778529c`, schema `024`.
4. Re-test storage relocation and cross-site switching if any inventory code changes.
5. Finish warehouse-switch UX feedback first; then continue normalized-domain/database redesign from the schema-022 green baseline, one domain at a time.
6. Update this file, `docs/STATUS.md` and `docs/WORK_LOG.md` at the end of the next substantial work session.


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


## 2026-09-19 — Release #724 verified production

Verified production now is:

- commit: `3a3392133483c6575a63d61a04d085a2d50df692`;
- workflow: Deploy Kitchen OS to VPS #724;
- run ID: `35377327661`;
- schema: `021`;
- production UI smoke: PASS.

The previous host-metrics deployment blocker is resolved. The production deploy log proves:

- exact tested target `3a3392133483c6575a63d61a04d085a2d50df692`;
- pre-deploy PostgreSQL backup created;
- migration `021_admin_row_revisions.sql` applied;
- `OK: schema version 021`;
- `OK: Super Admin revision columns = 5`;
- `OK: Super Admin revision triggers = 5`;
- API healthy;
- Web/API/Super Admin edge healthy;
- release endpoint returned `3a33921`;
- production UI smoke completed successfully.

The Super Admin GitHub/Handoff feature is therefore production-capable. A follow-up branch `chore/runtime-handoff-status-20260919` changes the status API/UI so the live release/schema come from the currently serving runtime rather than a manually maintained SHA. Static metadata remains only for handoff context, resolved incidents and the ordered next queue.

VPS capacity audit run `35377327695` also passed. At audit time the host reported Ubuntu 22.04.5 LTS, 2 vCPU, a 49 GB root filesystem with about 44 GB available, and primary interface `eth0`. Provider monthly traffic quota is still intentionally unknown until real provider-plan data is configured.

### Next continuation after runtime-handoff follow-up

1. Read `CURRENT_HANDOFF.md`, `STATUS.md`, `DATABASE_CORE_V2.md` and `DATABASE_PERSISTENCE_AUDIT.md`.
2. Continue normalized-domain/database redesign one domain at a time.
3. Keep Browser/UI -> VPS API -> PostgreSQL as the only authoritative write path.
4. Do not use generic Super Admin CRUD for operations whose invariants require dedicated transactions.
5. Preserve schema 021 row revision concurrency protection and inventory relocation/site-refresh invariants.


## 2026-09-19 — Release #726 final verified production

The runtime-backed GitHub/Handoff follow-up was merged as:

- commit: `9aae83a329541e2f65d968c7b1b6adc8bf56097c`;
- workflow: Deploy Kitchen OS to VPS #726;
- run ID: `35378902959`;
- schema: `021`;
- production UI smoke: PASS.

Production deploy evidence:

- exact tested target `9aae83a329541e2f65d968c7b1b6adc8bf56097c`;
- pre-deploy backup created successfully;
- API healthy;
- `OK: schema version 021`;
- `OK: Super Admin revision columns = 5`;
- `OK: Super Admin revision triggers = 5`;
- Web/API/Super Admin edge healthy;
- release endpoint returned `9aae83a`;
- production UI smoke completed successfully.

Super Admin GitHub/Handoff now separates static continuation metadata from live runtime truth. The protected status endpoint derives the currently serving release and schema at request time, so future releases do not require a manually maintained production SHA in the UI.

VPS Capacity Audit #5 / run `35378899688` passed for this workstream. At audit time the host reported:

- Ubuntu 22.04.5 LTS;
- 2 vCPU on Intel Xeon E-2236;
- about 3.85 GiB visible memory;
- 49 GB root filesystem, about 44 GB available;
- healthy web/API/PostgreSQL containers;
- primary interface `eth0`;
- host counters around 16.29 GB RX and 0.73 GB TX since boot;
- external HTTPS samples mostly around 0.51–0.70 seconds.

Provider monthly traffic quota is not derivable from host counters and remains intentionally unconfigured until real provider-plan data is supplied.

### Exact next work

The Admin/Data hardening, VPS metrics and GitHub/Handoff workstream is complete. The next code work should start with normalized-domain/database redesign:

1. read `docs/DATABASE_CORE_V2.md` and `docs/DATABASE_PERSISTENCE_AUDIT.md`;
2. choose one business domain;
3. define relational authority, migration/backfill/rollback and capability checks;
4. preserve Browser/UI -> VPS API -> PostgreSQL as the only write authority;
5. keep dedicated transactional APIs for operations whose invariants cannot safely be expressed through generic CRUD.


## 2026-09-19 — Release #754 inventory isolation verified

Inventory hardening is now production-verified.

Evidence:

- commit: `6f391421881e6e4aa687ed8cca85d751f96efadb`;
- workflow: Deploy Kitchen OS to VPS #754;
- run ID: `35430241680`;
- schema: `022`;
- production UI smoke: PASS;
- post-deploy Inventory Site Production Audit #8: PASS.

Pre-migration production audit ran after the database backup and before schema 022:

- stock-site mismatch: 0;
- receive-default site mismatch: 0;
- unknown item-site prefix: 0.

Migration `022_inventory_site_isolation.sql` was then applied successfully. Production verification reported:

- `OK: schema version 022`;
- `OK: inventory site-isolation triggers = 3`;
- release endpoint: `6f39142`.

This confirms the user-reported Fuxing/Yongji “shared quantity” symptom was not caused by cross-site PostgreSQL contamination. The relevant defect was browser cache/site context; schema 022 now also prevents a future frontend defect from writing an item into another site's location.

Current inventory authority:

- Central, Fuxing and Yongji intentionally share one PostgreSQL database.
- They are isolated by site-scoped item/location rows.
- Normal stock edits affect only the active site.
- Cross-site quantity changes require an explicit shipment/direct-transfer transaction.
- Same-site storage movement uses transfer/relocation transactions.
- Browser localStorage remains cache/UI state only.

Immediate continuation:

1. Finish visible warehouse-switch pending feedback.
2. Preserve fetch-before-commit branch switching.
3. Keep Inventory Site Production Audit as a release gate.
4. Preserve schema-022 guards in all future inventory/database work.


## 2026-09-20 — Release #765 verified; schedule read cutover gate in progress

Verified production now is:

- commit: `fc563c7f147327656aff304a0c621754d38b4591`;
- workflow: Deploy Kitchen OS to VPS #765;
- run ID: `35443223746`;
- schema: `022`;
- production UI smoke: PASS;
- Inventory Site Production Audit: PASS;
- Workforce Schedule Production Parity: PASS;
- Workforce Schedule Production Backfill: PASS.

PR #119 is therefore production-verified. Runtime schedule mutations now write through to relational workforce schedule tables inside the same PostgreSQL transaction as the compatibility `business_state.schedule` update. Compatibility JSON is still the read authority; there is not yet a production read cutover.

Current candidate branch:

- `feat/workforce-schedule-read-cutover-gate-20260920`
- base: verified production `fc563c7f147327656aff304a0c621754d38b4591`
- schema change: none
- production behavior change while the flag is absent: none

Candidate purpose:

- add `WORKFORCE_SCHEDULE_RELATIONAL_READ` as a server-side read-authority gate;
- default the VPS compose value to `false`;
- when disabled, `/api/business-state/:site` continues to read schedule from compatibility JSON;
- when enabled, only the schedule module is projected from relational PostgreSQL tables;
- keep existing compatibility module revision tokens for optimistic write concurrency and rollback;
- expose read-authority metadata for diagnosis;
- keep the dedicated relational schedule endpoint read-only;
- regression-test both gate states before any production enablement.

Do not enable the flag in production merely because this candidate merges. Required sequence:

1. CI must pass with the gate default OFF.
2. Deploy the code with the gate still OFF and verify release + production smoke.
3. Re-run production schedule parity/backfill and confirm no divergence.
4. Enable relational read only in a separate reviewed change/operation with a rollback path.
5. Continue compatibility writes until relational read has been stable in production; retirement of compatibility authority is a later explicit stage.


## 2026-09-20 — Inventory hidden-stock production defect confirmed

A deeper read-only production audit was merged as PR #122 and executed as Inventory Site Production Audit #24 / run `35457497470`.

Cross-site integrity remained clean:

- `stock_site_mismatch = 0`
- `receive_default_site_mismatch = 0`
- `unknown_item_site = 0`
- duplicate active catalog/site groups = 0
- invalid/blank catalog identity = 0
- active item without stock/storage configuration = 0
- invalid receive-default configuration = 0

The audit found one real inventory integrity defect:

- `inactive_item_positive_stock = 4` stock rows;
- `inactive_item_positive_minimum = 4` stock rows;
- affected hidden stock belongs to two Fuxing items:
  - `fuxing:duck-tongue`
    - `fuxing-kitchen`: quantity 4 / minimum 10
    - `fuxing-large-fridge`: quantity 14 / minimum 20
    - `fuxing-work-noodles`: quantity 4 / minimum 10
  - `fuxing:freezer-kombu-broth-small`
    - `fuxing-large-freezer`: quantity 40 / minimum 15

Root cause:

- frontend already expected the backend to return `ITEM_HAS_STOCK` when deleting a stock-bearing item;
- backend `POST /api/inventory/catalog/archive` previously performed a direct `active=false` update with no stock guard;
- inventory GET intentionally hides inactive items, so stock stayed in PostgreSQL but disappeared from normal UI/API snapshots.

Active fix branch:

- `fix/inventory-hidden-stock-archive-integrity-20260920`

Candidate fix:

1. migration 023 reactivates only inactive items that still have positive physical quantity; quantity/minimum values are preserved exactly and recovery is audit logged;
2. DB trigger blocks item archive while quantity or minimum configuration remains;
3. DB trigger blocks positive stock/minimum writes against an inactive item;
4. archive API becomes transactional, returns `409 ITEM_HAS_STOCK`, removes only zero-stock configuration/default routing, and writes an audit record;
5. API regression requires archive to fail before stock is cleared and succeed only after quantity/minimum become zero;
6. production data verifier requires schema 023 and zero hidden stock after deploy.

Do not manually delete or zero the affected production quantities. The migration intentionally restores visibility without guessing physical stock.


## 2026-09-20 — Release #774 hidden-stock repair verified; schema 024 candidate

Release #774 is now the verified production baseline.

Evidence:

- commit: `267235bf9d406f84f982d05df10a46a30f937201`;
- workflow: Deploy Kitchen OS to VPS #774;
- run ID: `35458513691`;
- server-side backup: `kitchen_os_20260919T173838Z.dump`;
- migration `023_inventory_archive_integrity.sql`: applied;
- schema: `023`;
- API health/release: PASS;
- production UI smoke: PASS;
- post-deploy Inventory Site Production Audit #31 / run `35458782811`: PASS.

Production after migration 023:

- stock-site mismatch: 0;
- receive-default site mismatch: 0;
- unknown item site: 0;
- inactive item positive quantity: 0;
- inactive item positive minimum: 0;
- inactive location positive quantity: 0;
- inactive location positive minimum: 0;
- invalid receive-default location/config: 0;
- duplicate active catalog/site groups: 0;
- active item without stock rows: 0;
- active item without active storage rows: 0;
- `inventory_hidden_integrity_violations = 0`;
- `inventory_site_integrity_violations = 0`.

The Fuxing hidden-stock repair preserved the database totals and stock rows; it did not zero or delete the affected inventory.

Current candidate branch:

- `fix/inventory-location-archive-integrity-20260920`
- target schema: `024`

Reason:

The location archive API previously blocked only `quantity > 0`. A location with `quantity = 0` but `minimum_quantity > 0` could therefore be archived and hide operational stock configuration.

Schema 024 candidate adds:

1. DB guard blocking location archive while quantity/minimum remains;
2. DB guard blocking positive stock/minimum writes to inactive locations;
3. DB guard requiring receive-default routing to target an active storage location;
4. API archive check for `quantity > 0 OR minimum_quantity > 0`;
5. isolated DB + static regression coverage;
6. production verifier requirement for all three location-integrity triggers.

After schema 024, continue the inventory audit by reviewing `catalog/sync`: any path that changes physical quantity must create the same auditable `inventory_transactions` history as the dedicated set-quantity/transfer APIs.


## 2026-09-20 — Release #776 schema 024 verified; catalog stock authority defect confirmed

Verified production:

- commit: `d3d5f4e73d4c5fd6f2f4f3971066f4d7e31497d2`;
- Deploy Kitchen OS to VPS #776 / run `35459291983`;
- backup: `kitchen_os_20260919T175402Z.dump`;
- migration `024_inventory_location_archive_integrity.sql`: applied;
- schema: `024`;
- item archive-integrity triggers: 2;
- location-integrity triggers: 3;
- `DATA_INTEGRITY_OK`;
- production UI smoke: PASS;
- Inventory Site Production Audit #33 / run `35459551373`: PASS;
- Schedule Production Parity/Backfill: PASS.

Audit #33 confirms all current inventory structural checks are zero, including inactive item/location stock, invalid receive defaults, duplicate active catalog/site groups and missing active stock/storage rows.

### Next defect found during write-path audit

`POST /api/inventory/catalog/sync` currently mixes two authorities:

1. catalog/location metadata;
2. physical quantity/minimum writes when the caller has stocktake capability.

The branch/product modal sends quantity/minimum in the same catalog payload. Therefore an admin/supervisor metadata edit can replay stale local stock into PostgreSQL, and the quantity mutation does not create `inventory_transactions`.

A second issue exists in the same route: omitted location associations are deleted when `quantity=0` even if `minimum_quantity>0`.

Active branch:

- `fix/inventory-catalog-sync-stock-authority-20260920`
- schema change: none

Required invariant:

- catalog sync owns metadata + location association only;
- quantity changes use dedicated stocktake API and transaction history;
- minimum changes use dedicated minimum API;
- catalog sync never overwrites existing quantity/minimum;
- new associations start at 0/0;
- omitted associations may be deleted only at quantity=0 and minimum=0;
- protected omitted locations return conflict rather than silently losing configuration.

Historical quantity changes performed through the old catalog path cannot be reconstructed reliably because that path did not emit inventory transactions. Do not guess corrective stock values; current physical quantities must be validated by normal stocktake if operationally questioned.


## 2026-09-20 — Release #783 catalog authority verified; Super Admin lifecycle gap

Release #783 is the verified production baseline.

Evidence:

- commit: `5bc9d92e878510c0646acced2b8070750778529c`;
- Deploy Kitchen OS to VPS #783 / run `35475816625`;
- server backup: `kitchen_os_20260919T232353Z.dump`;
- schema remains `024`;
- preflight/API/concurrency/browser/full-device: PASS;
- production UI smoke: PASS;
- `DATA_INTEGRITY_OK`;
- Inventory Site Production Audit #40 / run `35476066953`: PASS;
- exact release: `5bc9d92`.

Production inventory totals remained unchanged:

- central: 71;
- fuxing: 1792;
- yongji: 6.

All audited structural violations remain zero.

### Next integrity gap

Super Admin Data Tables & CRUD exposed `inventory-products` as a generic lifecycle dataset.

Although `item_key` and `catalog_key` are create-only, generic CRUD could still:

- create an active inventory item without any stock/storage association;
- toggle `active` outside Inventory lifecycle;
- archive an item without the dedicated cleanup of zero stock associations and receive-default routing.

Active branch:

- `fix/super-admin-inventory-lifecycle-20260920`
- schema change: none

Required invariant:

- Super Admin generic CRUD may inspect and edit safe metadata for an existing inventory item;
- item create/reactivate/archive belongs only to Inventory lifecycle APIs;
- `active` is not a generic editable field;
- frontend must not show create/archive controls for `inventory-products`;
- backend must enforce the same policy even if called directly.

After this slice, continue with minimum-change history/audit semantics and remaining non-quantity inventory mutations.


## 2026-09-20 — Live GitHub & Handoff workstream

Production baseline before this workstream:

- release: `60684bb3bb38d5f6af3a4c25f8991fc2ecc1c17c`;
- Deploy Kitchen OS to VPS #786 / run `35482680596`: PASS;
- schema: `024`;
- production UI smoke: PASS;
- Inventory Site Production Audit #44 / run `35482912054`: PASS.

Active branch:

- `feat/live-github-handoff-20260920`
- schema change: none.

### Handoff authority change

The canonical entry point for another developer or a new ChatGPT conversation is:

- `https://vial1307.github.io/restaurant-management-system-demo/handoff.html`

Expected continuation order:

1. Open the canonical Live Handoff URL.
2. Read the active PR title/body, branch, head SHA, changed files and CI shown there.
3. Read `docs/CURRENT_HANDOFF.md`.
4. Read `docs/WORK_LOG.md`.
5. Read `docs/DEVELOPMENT_RULES.md`.
6. Continue only from the active PR/head shown by Live Handoff.

The VPS Super Admin `GitHub & Handoff` section now has a server-side live GitHub feed design:

- latest open PR becomes current work automatically;
- current branch/head SHA come from GitHub;
- PR body becomes the current fix/stopping-point description;
- changed files become code focus;
- recent commits form the current development chain;
- workflow runs are filtered to the exact active PR head SHA;
- production release/schema still come directly from the running VPS;
- GitHub metadata is cached briefly and falls back safely if GitHub is unavailable;
- GitHub Actions CI uses deterministic fallback so tests do not depend on external API availability.

The public `handoff.html` page is intentionally limited to public repository metadata. It contains no VPS credential, database secret, SSH key or private operational data.

### Next known work after Live Handoff

The next inventory integrity slice already identified is `set-minimum` history/audit semantics: minimum changes currently update `inventory_stock.minimum_quantity` but do not create an `inventory_transactions`/audit history record. Do not mix that fix into the Live Handoff PR.


## 2026-09-20 — Live Handoff production verified; minimum-history slice

Live GitHub & Handoff is now production verified.

Production evidence:

- merge/release SHA: `19feaa88744939eba6c6b28cdcc57b290ad72029`;
- Deploy Kitchen OS to VPS #789 / run `35495483199`: PASS;
- schema: `024`;
- `DATA_INTEGRITY_OK`;
- production UI smoke: PASS;
- GitHub Pages build/deploy #927: PASS;
- Inventory Site Production Audit #47 / run `35495707381`: PASS;
- `inventory_site_integrity_violations = 0`;
- `inventory_hidden_integrity_violations = 0`;
- exact release check: `19feaa8`.

Canonical continuation entry remains:

- `https://vial1307.github.io/restaurant-management-system-demo/handoff.html`

### Active inventory slice

Branch:

- `fix/inventory-minimum-history-20260920`
- schema change: none; remains `024`.

Confirmed defect:

- `POST /api/inventory/set-minimum` changed `inventory_stock.minimum_quantity`;
- the mutation did not create `inventory_transactions`;
- the Inventory History view therefore could not show who changed an item minimum, when it changed, or its before/after values.

Candidate invariant:

- minimum changes are transactional;
- stock row is locked before reading the previous minimum;
- no-op save does not create duplicate history;
- real change writes `inventory_transactions.action='adjust'`;
- metadata uses `operation='set_minimum'`, `before_minimum`, `after_minimum`;
- increase/decrease anchors the same location through destination/source so existing site history query includes the event;
- frontend maps this metadata to a distinct `minimum` history direction;
- UI label is `標準量調整 / Điều chỉnh định mức`;
- no schema migration is needed because the existing `adjust` transaction action contract is reused.

Dynamic regression uses a zero-minimum fixture to prove:

1. `0 -> 4` creates history;
2. `4 -> 4` creates no duplicate history;
3. `4 -> 0` creates the second history event;
4. admin History API returns actor/location/before/after correctly.


## 2026-09-20 — Minimum history production #793; receive-default audit slice

Minimum-history work is production verified.

Production evidence:

- PR #129 merged as `ccef35dad7027808d60b3a691925fbebc29b9eb4`;
- Deploy Kitchen OS to VPS #793 / run `35496998332`: PASS;
- schema: `024`;
- server backup: `kitchen_os_20260920T073331Z.dump`;
- `DATA_INTEGRITY_OK`;
- Web/API/Super Admin edge healthy;
- production UI smoke: PASS;
- GitHub Pages #928: PASS;
- exact release: `ccef35d`.

Inventory Site Production Audit #51 / run `35497249172`:

- first attempt failed before SQL audit because SSH was reset by the VPS (`kex_exchange_identification: Connection reset by peer`);
- rerun succeeded without code/data change;
- `stock_site_mismatch = 0`;
- `receive_default_site_mismatch = 0`;
- inactive item/location positive quantity/minimum = 0;
- invalid receive-default checks = 0;
- duplicate active catalog/site groups = 0;
- active items missing stock/storage rows = 0;
- `inventory_site_integrity_violations = 0`;
- `inventory_hidden_integrity_violations = 0`;
- exact release check: `ccef35d`.

### Active inventory slice — receive-default audit

Branch:

- `fix/inventory-receive-default-audit-20260920`
- schema change: none; remains `024`.

Confirmed gap:

- `POST /api/inventory/receive-default` stored only the latest `updated_by` / `updated_at`;
- changing A -> B overwrote prior context;
- deleting a receive-default removed the routing row and its actor context entirely;
- no persistent before/after audit existed for direct receive-default edits.

Candidate invariant:

- create/update/delete run inside one DB transaction;
- an advisory transaction lock serializes the same `site + catalogKey` even when no receive-default row exists yet;
- an existing receive-default row is also locked before change;
- no-op set and no-op delete change nothing and create no audit;
- real changes write `audit_logs.action='inventory_receive_default_change'`;
- `entity_type='inventory_receive_default'`;
- `entity_id='site:catalogKey'`;
- before/after store `location_id` and `location_code`;
- metadata stores `catalog_key` and operation `create/update/delete`;
- physical inventory history remains separate because receive-default is routing configuration, not stock movement.

Dynamic API regression uses a dedicated two-location fixture and verifies exactly three audit rows:

1. create default -> audit create;
2. save same location -> no audit;
3. update location -> audit update;
4. delete default -> audit delete;
5. delete again -> no audit.


## 2026-09-21 — Receive-default audit production #796; catalog audit slice

Receive-default audit is production verified.

Production evidence:

- PR #130 merged as `21d376295b6194e48bfaa599fc6c5424256a6196`;
- Deploy Kitchen OS to VPS #796 / run `35500763361`: PASS;
- schema: `024`;
- backup: `kitchen_os_20260920T085648Z.dump`;
- `DATA_INTEGRITY_OK`;
- Web/API/Super Admin edge healthy;
- production UI smoke: PASS;
- GitHub Pages #929: PASS;
- Inventory Site Production Audit #54 / run `35500993290`: PASS;
- `inventory_site_integrity_violations = 0`;
- `inventory_hidden_integrity_violations = 0`;
- exact release check: `21d3762`.

### Active inventory slice — catalog configuration audit

Branch:

- `audit/inventory-config-next-20260921`
- schema change: none; remains `024`.

Confirmed gap:

- `POST /api/inventory/catalog/sync` changed item metadata and storage associations without a durable audit row;
- prior values for name/unit/work area/storage-only/catalog key/location associations were overwritten;
- repeated no-op saves still executed the item upsert path.

Candidate invariant:

- catalog sync runs in one transaction;
- same `itemKey` writes serialize through a transaction advisory lock;
- existing item row is locked before comparison;
- item metadata is updated only when values actually change;
- before/after snapshots include item metadata and configured site location codes;
- real create/update writes `audit_logs.action='inventory_catalog_change'`;
- `entity_type='inventory_item'`;
- `entity_id=item_key` for searchable audit history;
- metadata stores `item_key`, `catalog_key`, and operation `create/update`;
- no-op save creates no audit;
- request quantity/minimum remain ignored by catalog sync;
- new location associations are always created with quantity=0 and minimum=0;
- protected omitted associations with quantity/minimum > 0 remain blocked.

Dynamic API regression verifies:

1. create catalog item -> audit create;
2. identical save -> no audit;
3. metadata + location update -> audit update;
4. Super Admin Audit returns exactly two rows for that item key;
5. quantity/minimum stay zero despite non-zero values supplied in catalog payload.
