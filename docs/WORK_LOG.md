# Kitchen OS Work Log

## 2026-09-25 — Inventory main website ↔ Super Admin correction deployed

- PR #139 merged as `ee5316b8ae5f12f2288aebf54e9e9cede3756ba0`. Final head `19ff741` passed Super Admin Browser `36142056162` (all six device profiles and two independent sessions for Central/Fuxing/Yongji at 320px and 1366px), full-system/API/PostgreSQL regression `36142055831`, API load `36142055866` and workforce diagnostic `36142055825`.
- A clean open ingredient editor now reconciles per-location minimums and metadata on remote inventory updates; an unsaved editor preserves its draft and blocks stale submission until reopened. Branch add/edit saves the explicit cloud-backed form draft. Central uses site master labels and exposes overview Edit. Super Admin ingredient rows show storage/work area and compact secondary actions.
- WebKit mobile testing isolated native select option text contributing to page `scrollWidth`; the editor contains that internal overflow and dataset tabs wrap on narrow screens. All six Super Admin profiles subsequently passed.
- Production deploy #843 / run `36142844487` passed exact-release full regression, database backup `kitchen_os_20260925T134859Z.dump`, integrity checks, deployment and `PRODUCTION_UI_SMOKE_OK`. Runtime health: `release=ee5316b`, `schema=024`, `app=ok`, `database=ok`. No migration or production data rewrite.


## 2026-09-22 — Cross-surface verification follow-up

- Head 66f0080: independent browser sessions passed Central/Fuxing/Yongji round-trips at 320px, including renamed master labels, main ingredient saves, per-location minimums, reloads, stale draft retention and Fuxing creation.
- WebKit then exposed intrinsic select overflow with the new long bilingual area names. Set explicit zero minimum widths and shrinkable label grid tracks; re-run the six-device gate.
- Seed the per-document snapshot on a successful site switch to avoid treating the subsequent identical SSE refresh as an edit conflict.

## 2026-09-22 — Main website / Super Admin synchronization correction

- Cross-surface CI additionally reproduced a branch editor bug: cloud-hydrated items were displayed from the authoritative mirror, but saves were rebuilt from the stale legacy store. Branch add/edit now sends the explicit form draft to the existing catalog API, preserves failed forms and closes only after confirmed operations. Site switching explicitly activates the target master snapshot after the site commit.

- Specification updated before implementation with cross-surface, branch-isolation and compact-action acceptance criteria.
- Removed Central's hard-coded master lists and translated labels; database UI keys remain stable identities. Central overview editor now opens outside the Manage tab.
- Master-only changes repaint on fallback refresh; SSE ready reconciles missed updates; background destination reads no longer replace active-site choices.
- Per-document snapshot comparison includes master data and handles same-origin shared-cache peers, but does not repaint unchanged forced refreshes from other-site writes. Runtime checks cover this no-op behavior.
- Background reconciliation preserves open ingredient forms and requires reopening before a stale form can submit.
- Super Admin ingredient table shows configured storage, compact status and Edit / expandable secondary actions. All actions retain existing authorized PostgreSQL paths.
- First cross-surface CI verified Central master labels, item edits in both directions and main minimum API success; corrected the test to compare PostgreSQL NUMERIC values numerically (9.000 equals 9), scoped to the storage row.
- Static/performance/admin validation PASS locally. Added isolated main ↔ Super Admin browser round-trip on Central/Fuxing/Yongji for small mobile and desktop. Exact-head CI/deployment pending.

## 2026-09-22 — Super Admin inventory Database production verification

- PR #138 final head `923f36a5320b4afb4a47caa11c3016940b9ce9c4`: all PR checks passed; production-only jobs were correctly skipped on the PR.
- Super Admin Browser run `35671898006`: six desktop/mobile profiles, save/reload, peer-edit notifications, stale-submit rejection, input retention and retry PASS. Screenshots are in that workflow's artifacts.
- Master Data/Admin API run `35671897948`, isolated load smoke `35671897952`, workforce diagnostic `35671897940`, full-system premerge workflow `35671898004`: PASS.
- Merged as `5cc4f907387873367d78dfbdfb3183971846e968`.
- Deploy #832 / run `35672333632`: preflight, complete API/PostgreSQL/browser/device regression, backup/deploy, health/release and production UI smoke PASS.
- Production response: `app=ok`, `database=ok`, `schema=024`, `release=5cc4f90`. Deploy-integrated inventory audit PASS; stock/default site mismatch counts zero.
- No schema migration, production business-data rewrite or automatic copying of branch configuration. Database workspace is available at `/.admindev.html#data`.
- Handoff documents now supersede the predeployment static development-status wording; updating that fallback text can accompany the next runtime stage.

## 2026-09-21 — Branch-scoped Super Admin inventory database candidate

CI follow-up (2026-09-22): initial PR #138 API round-trip passed for Central/Fuxing/Yongji. Browser CI caught a real foreground/background read race: an SSE ready event superseded a foreground request, leaving navigation disabled when the data was unchanged. Background refresh now queues behind foreground reads and cannot own their controls. Corrected handoff status to the existing `in_progress` enum, and locked existing catalog identities/storage-only transitions that could orphan receiving policy or hide work stock. Re-run exact-head CI before release.

The first correction (`b21bb384`) passed Super Admin Browser Regression run 35671696281 on all six device profiles and Master Data/Admin API run 35671696278. Final follow-up also preserves dirty forms on background-read failure and verifies peer-edit notification, stale-submit rejection, retained input and retry. Inventory screenshots are included in CI artifacts. Full final-head CI and deployment must still be verified.

- Updated the specification first with acceptance criteria for independent branch layouts, real database saves, stale-write rejection and archive protection.
- Added five database views and bilingual catalog: ingredients, locations/work areas, stock/minimum, history and integrity. Preserved generic CRUD for other datasets and existing Stores transfer/audit tools.
- Used existing inventory/master APIs, optional optimistic concurrency checks and append-only association changes. No migration; no localStorage business authority.
- Extended successful-write SSE invalidations to master data and Super Admin catalog edits; protected dirty forms, duplicate submissions, stale site loads and background-refresh focus.
- Local checks: static-regression, performance-regression, admin-panel-static-regression, admin-panel-ui-v2-static-regression and new admin-inventory-database-contract-regression PASS. New API round-trip script and device/reload checks are committed for CI.
- Cloud Browser cannot access the local development server (`ERR_BLOCKED_BY_CLIENT`); no local visual or live-production verification claimed.
- Baseline GitHub production deploy #828 / run 35573596640 was rechecked: completed/success at SHA 00949bec772bcc04441626903411020f2e3e7023. This candidate is not that production release.

This file is the canonical continuation log for implementation, CI, merge and deployment work. Do not record credentials, secret values or private keys here.

## 2026-09-18 — Inventory site authority + PostgreSQL storage relocation

### Scope
- Fixed cross-site inventory switching so 央廚 / 復興 / 永吉 do not render stale inventory from the previous site.
- Fixed storage-location changes so 大冷凍 -> 4門冰箱 / 廚房冰箱 / 大冷藏 is a real PostgreSQL inventory relocation instead of a local/catalog-only edit.
- Added canonical continuation document: `docs/CURRENT_HANDOFF.md`.

### Cross-site synchronization fixes
- Interactive warehouse switching now hydrates the target site before emitting the active-site-changed event.
- Late sync responses from an inactive branch can no longer overwrite the currently active branch record.
- Interactive site switching bypasses short-lived inventory/master-data caches and forces a fresh VPS snapshot.
- Failed target-site hydration rolls back the site preference instead of showing a new site with old data.
- Production workflow #682 verified real site transitions and production smoke.
- Runtime force-refresh fix passed full-device cross-browser regression and production deployment in workflow #690, commit `483833a95f95822fa32e275579b3890f34c27598`.

### Storage relocation
- Added `POST /api/inventory/relocate-storage`.
- Relocation is one PostgreSQL transaction:
  - lock source/destination stock rows;
  - merge source quantity into destination;
  - preserve minimum safely by using the greater destination/source minimum;
  - remove the old source stock association;
  - move fixed receive-default when it pointed to the old location;
  - write inventory transaction when quantity moves;
  - always write `inventory_storage_relocate` audit log.
- Branch storage dropdown now calls the relocation API and does not optimistically mutate local state.
- Added regression proving source row removal, destination quantity/minimum and receive-default movement.
- Existing stocktake permission boundary remains intact.

### CI / deployment state at handoff
- #690 / `483833a95f95822fa32e275579b3890f34c27598`: SUCCESS, deployed to production, production UI smoke PASS.
- #691 / `d15ae2087d293111b989b5e5efe7d56ac3bebb84`: SUCCESS, preflight + API/inventory + browser/full-device + SSH deploy + production UI smoke all PASS.
- Current verified production SHA: `d15ae2087d293111b989b5e5efe7d56ac3bebb84`.
- Do not claim a newer production SHA until deploy + production smoke are green.

### Next continuation point
1. Confirm newest production workflow and live SHA.
2. Begin secure database redesign/data-admin work behind the VPS API; no browser-direct PostgreSQL.
3. Keep `docs/CURRENT_HANDOFF.md` and this work log updated with every significant fix/deploy.
4. Add Super Admin VPS metrics: disk, RAM, CPU/load, uptime, PostgreSQL size/connections, backup footprint, deployed SHA/schema and safe network/bandwidth counters.
5. Preserve all inventory invariants and release gates documented in `docs/CURRENT_HANDOFF.md`.

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


## 2026-09-18 — Secure DB admin surface + VPS metrics continuation

### Starting baseline

- Read `docs/CURRENT_HANDOFF.md`, `docs/WORK_LOG.md`, and `docs/DEVELOPMENT_RULES.md` before coding.
- Main HEAD before branch: `d84484a15bd835e7890921267ba59984ca37967a` (documentation-only commits after the runtime release).
- Last verified production runtime: `d15ae2087d293111b989b5e5efe7d56ac3bebb84`, workflow #691.
- Production DB schema: `020`.
- Inventory baseline kept intact: VPS API + PostgreSQL authority, cross-site refresh guards, transactional relocation, receiving defaults and audit history.

### Database/Admin hardening implemented on branch

- Kept the existing relational Core v2 and static backend dataset allowlist; did not introduce a second database or browser-side SQL path.
- Added dataset-specific validation and strict rejection of unknown fields.
- Made persistent identity columns immutable after creation for menu, inventory catalog and SOP datasets.
- Added optimistic stale-write protection using a database-owned integer row revision while holding the row `FOR UPDATE`; update/archive now returns conflict rather than overwriting a newer edit.
- Generic inventory archive now refuses to deactivate an item while relational stock is non-zero.
- Audit logging remains mandatory for successful generic mutations.

### VPS metrics implemented on branch

- Added root-owned host collector + systemd timer producing a filtered snapshot under `/opt/kitchen-os/runtime`.
- API container mounts only that runtime directory read-only; no Docker socket, host shell, host filesystem, DB port or credentials are exposed to the browser.
- Added Super Admin-only `/api/admin/super/system-metrics` with CPU/load/uptime, RAM/swap, disk/inodes, app/backup/PostgreSQL footprint, service status, network counters/rate/link speed, PostgreSQL connections and table/index sizes.
- Super Admin Overview renders the new capacity/network/database metrics.
- Provider traffic quota is intentionally reported as unconfigured because the operating system cannot infer the VPS vendor billing cap.

### GitHub handoff organization

- Added `docs/STATUS.md` as a concise active workboard.
- Added `.github/PULL_REQUEST_TEMPLATE.md` with persistence/security/verification/handoff gates.
- Added `.github/ISSUE_TEMPLATE/engineering-handoff.yml` for structured continuation issues.
- Updated development/database docs with the new handoff and security contracts.

### Regression coverage added

- Super Admin authorization for system metrics.
- Host metrics fixture and browser rendering across existing device profiles.
- Unknown admin field rejection.
- Stale-write conflict.
- Immutable menu identity.
- VPS shell-script syntax and required production file checks.

### Current stopping point

- Candidate branch: `fix/secure-admin-data-vps-metrics-20260918`.
- CI/PR, merge, production deploy and production capacity capture are the next actions in this same workstream.

- CI exposed that using serialized `updated_at` as an optimistic-lock token can lose PostgreSQL sub-millisecond precision in JavaScript. The timestamp approach was replaced by migration `021_admin_row_revisions.sql`, which gives each generic admin row a DB-owned integer revision incremented by trigger.


## 2026-09-19 — Super Admin GitHub handoff + deploy recovery

### Production state discovered

- PR #107 merged to main as `d2acef474866460c75ce66b6f5675306481bb65b`.
- Main schema candidate is 021.
- Production deploy workflow `35372160924` passed all regression gates.
- Deploy then failed while installing the filtered host-metrics snapshot.
- `kitchen-os-host-metrics.service` exited 1 before backup/migration/restart.
- Last verified production therefore remains `d15ae2087d293111b989b5e5efe7d56ac3bebb84`, schema 020.

### Current continuation

- Created branch `fix/host-metrics-deploy-resilience-20260919`.
- Opened draft PR #108: `https://github.com/vial1307/restaurant-management-system-demo/pull/108`.
- Exact recovery focus is the host metrics collector/timer/deploy path.

### Super Admin engineering handoff UI

Added a dedicated `GitHub & Handoff · 開發交接` section that exposes only safe development metadata through `GET /api/admin/super/development-status`.

The UI now shows:

- current branch and PR;
- main baseline and failed workflow;
- runtime release/schema vs verified production release/schema;
- exact stopping point and files to resume;
- ordered next steps;
- direct links to CURRENT_HANDOFF / WORK_LOG / STATUS / DEVELOPMENT_RULES.

Regression coverage was extended for static contracts, authorization and cross-device browser rendering.


## 2026-09-19 — Release #724 production verification

### PR #108 result

- PR #108 passed Master Data/Admin, Super Admin cross-device browser, isolated load, workforce diagnostics and the full release workflow.
- The deploy workflow YAML was briefly corrupted while adding the collector runtime smoke; this was detected because GitHub showed the workflow by filename with zero jobs. The workflow was rebuilt from the clean `main` copy and the smoke step was reinserted safely.
- Final PR head `b8a6d4d05a335107605b448d4443830fbcab8f56` passed:
  - preflight;
  - executable host-metrics collector smoke;
  - API/inventory regression;
  - PostgreSQL concurrency regression;
  - desktop/mobile Chromium;
  - workforce/persistence browser coverage;
  - full-device cross-browser regression.
- PR #108 merged as `3a3392133483c6575a63d61a04d085a2d50df692`.

### Production workflow #724

Run ID: `35377327661`.

Verified:

- exact tested commit deployment;
- host-metrics install passed on the real VPS;
- pre-deploy backup created;
- migration 021 applied;
- schema 021 integrity audit passed;
- 5 Super Admin revision columns present;
- 5 revision triggers present;
- API/Web/Super Admin health passed;
- release check returned `3a33921`;
- production UI smoke passed.

This makes `3a3392133483c6575a63d61a04d085a2d50df692` the verified production milestone, replacing the old schema-020 production baseline.

### Capacity audit

Run `35377327695` succeeded. Observed host values included 2 vCPU, Ubuntu 22.04.5 LTS, 49 GB root disk with ~44 GB available, ~38 MB Kitchen OS footprint, ~15 MB backup directory and 72 backup files at audit time.

### Follow-up started

Created `chore/runtime-handoff-status-20260919` to remove manually maintained production SHA/schema from the Super Admin handoff view. The endpoint will surface live runtime release/schema while static metadata records the current continuation and release milestone.


## 2026-09-19 — Release #726 final production verification

### PR #109

Purpose:
- make Super Admin GitHub/Handoff read live release/schema from the serving runtime;
- keep static metadata for continuation context rather than manually pinning production state.

PR validation:
- Super Admin browser regression: PASS;
- Master Data/Admin regression: PASS;
- isolated API load smoke: PASS;
- workforce approval diagnostic: PASS;
- full Deploy Kitchen OS regression: PASS.

One preflight attempt failed only because the GitHub runner timed out pulling `caddy:2.10-alpine` from Docker Hub. The code/Caddyfile was not changed. The failed jobs were rerun unchanged; Caddy validation then passed. No gate was weakened.

PR #109 merged as:
- `9aae83a329541e2f65d968c7b1b6adc8bf56097c`.

### Production workflow #726

Run ID: `35378902959`.

Verified:
- preflight PASS;
- executable host metrics collector smoke PASS;
- API/inventory PASS;
- PostgreSQL concurrency PASS;
- desktop/mobile Chromium PASS;
- workforce/persistence browser coverage PASS;
- full-device cross-browser PASS;
- exact tested SSH deployment PASS;
- pre-deploy backup created;
- API healthy;
- schema 021 verified;
- Super Admin revision columns = 5;
- Super Admin revision triggers = 5;
- Web/API/Super Admin edge healthy;
- release check returned `9aae83a`;
- production UI smoke PASS.

Current verified production is therefore:
- SHA `9aae83a329541e2f65d968c7b1b6adc8bf56097c`;
- schema `021`;
- workflow #726 / run `35378902959`.

### Runtime-backed handoff result

`GET /api/admin/super/development-status` now derives:
- live release from the serving runtime;
- live schema from `schema_migrations`;
- current release commit URL.

This removes the need to manually edit production SHA/schema in the Super Admin handoff view after each release.

### Capacity audit #5

Run `35378899688` passed.

Observed:
- Ubuntu 22.04.5 LTS;
- 2 vCPU;
- ~3.85 GiB visible memory;
- root disk 49 GB total / 44 GB available;
- healthy Kitchen OS web/API/PostgreSQL containers;
- `eth0` primary interface;
- host network counters ~16.29 GB RX / ~0.73 GB TX since boot;
- HTTPS sample totals mostly ~0.51–0.70 seconds.

Provider monthly bandwidth quota remains unknown without provider-plan data.

### Next continuation point

The secure Admin/Data + VPS metrics + GitHub/Handoff workstream is complete.

Next work:
1. start normalized-domain/database redesign from the verified schema-021 baseline;
2. migrate one business domain at a time;
3. preserve VPS API/PostgreSQL as the only authoritative write path;
4. define migration/backfill/rollback + verification before destructive changes;
5. preserve dedicated transactional APIs for inventory/workforce/payroll/SOP invariants.


## 2026-09-19 — Inventory site isolation production release #754

### User-reported issue

- Editing/viewing Fuxing could appear to affect Yongji.
- Internal storage relocation could be unreliable from the user's perspective.
- The product owner required confirmation whether Central/Fuxing/Yongji are separate databases or separate site data inside one database.

### Architecture confirmed

- Central, Fuxing and Yongji use one PostgreSQL database.
- Inventory is isolated by site-prefixed item identity and site-owned locations.
- Normal edits are site-local.
- Only explicit cross-site shipment/direct-transfer updates two sites.

### Root cause and hardening

The production database read path was already site-filtered, but browser branch state had a shared-record/cache risk and several mutation routes needed stronger item/location site checks.

PR #115 hardened all three layers:

- PostgreSQL schema 022 site guards;
- API item/location site validation;
- Fuxing/Yongji site-scoped browser mirrors;
- fetch-before-commit site switching;
- failed switch rollback;
- no cross-branch staging draft seeding;
- storage relocation regression;
- pre/post production inventory site audits.

### Production data audit

Before schema 022:

- `stock_site_mismatch = 0`;
- `receive_default_site_mismatch = 0`;
- `unknown_item_site = 0`.

Therefore production PostgreSQL did not contain cross-site contamination from the reported incident.

### CI stabilization

Main deploy was temporarily blocked by pre-existing browser-test timing races:

- WebKit mobile schedule permission visibility race;
- repeated role-login browser hydration race.

PR #116 made WebKit permission certification atomic.
PR #117 kept primary login-form coverage while using a proven UI-first/backend-fallback pattern for repeated role certification.

No inventory authority or production auth behavior was weakened to pass these gates.

### Release #754

Verified production:

- commit `6f391421881e6e4aa687ed8cca85d751f96efadb`;
- workflow run `35430241680`;
- schema `022`;
- backup created;
- pre-migration inventory audit PASS;
- migration 022 applied;
- inventory site-isolation triggers = 3;
- API/inventory/concurrency/browser/full-device gates PASS;
- production health/release check PASS;
- production UI smoke PASS;
- post-deploy Inventory Site Production Audit #8 PASS.

### Next

- add visible pending feedback while a target warehouse snapshot is loading;
- keep all warehouse buttons disabled until hydration completes;
- preserve site-scoped cache and schema-022 invariants in subsequent work.


## 2026-09-20 — Workforce schedule relational read cutover preparation

### Starting point

Verified production before this work:

- commit `fc563c7f147327656aff304a0c621754d38b4591`;
- Deploy Kitchen OS to VPS #765 / run `35443223746`;
- schema `022`;
- production UI smoke PASS;
- Inventory Site Production Audit PASS;
- Workforce Schedule Production Parity PASS;
- Workforce Schedule Production Backfill PASS.

PR #119 had already made schedule runtime writes transactional write-through to relational tables while keeping `business_state.schedule` as compatibility/read authority.

### Work performed

Created branch:

- `feat/workforce-schedule-read-cutover-gate-20260920`

Added:

- `vps/backend/src/workforce-schedule-read-authority.mjs`
- server-side `WORKFORCE_SCHEDULE_RELATIONAL_READ` flag parsing;
- rollback-safe authority resolver;
- Docker Compose default `WORKFORCE_SCHEDULE_RELATIONAL_READ=false`;
- business-state GET integration for schedule-only relational projection when enabled;
- read-authority diagnostic metadata;
- relational diagnostic endpoint metadata aligned to the same gate;
- static contract regression;
- PostgreSQL integration coverage proving OFF reads compatibility input while ON reads relational rows;
- deploy and dedicated relational workflow gates.

No schema migration was introduced.

### Safety model

- Gate defaults OFF.
- Production behavior is unchanged unless the server flag is explicitly enabled.
- PostgreSQL remains the only shared data store behind the VPS API.
- Compatibility module revisions remain the optimistic-concurrency token during the cutover phase.
- Schedule writes continue to update compatibility + relational state transactionally.
- Dedicated relational endpoint remains read-only.
- Production enablement must be a separate reviewed step after an OFF deployment is verified.

### Next

- open PR;
- run full CI;
- fix any regression before merge;
- deploy with gate OFF;
- verify production parity/backfill;
- only then consider an explicit relational-read enablement step.


## 2026-09-20 — Deep inventory database audit and hidden-stock repair

### Production audit

PR #122 expanded the existing read-only Inventory Site Production Audit.
Audit #24 / run `35457497470` queried production schema 022.

Clean checks:

- cross-site stock mismatch: 0;
- receive-default site mismatch: 0;
- unknown item site: 0;
- duplicate active catalog per site: 0;
- blank catalog keys: 0;
- invalid item-key suffix: 0;
- invalid receive-default location/config: 0;
- active items without stock rows: 0;
- active items without active storage rows: 0;
- inactive-location protected stock: 0.

Detected defect:

- 4 stock rows belonged to inactive inventory items.
- `fuxing:duck-tongue`:
  - kitchen: 4 / minimum 10
  - large fridge: 14 / minimum 20
  - work noodles: 4 / minimum 10
- `fuxing:freezer-kombu-broth-small`:
  - large freezer: 40 / minimum 15

### Root cause

`POST /api/inventory/catalog/archive` directly set `inventory_items.active=false` without checking stock.
The frontend already contained an `ITEM_HAS_STOCK` error path, proving the intended contract existed but the backend guard was missing.

### Candidate repair

Branch `fix/inventory-hidden-stock-archive-integrity-20260920`:

- migration 023 reactivates inactive items with positive physical quantity while preserving quantity/minimum exactly;
- recovery writes `system_inventory_hidden_stock_reactivate` audit entries;
- `inventory_items_archive_guard` prevents archive while quantity/minimum configuration remains;
- `inventory_stock_active_item_guard` prevents positive stock/minimum writes to inactive items;
- catalog archive is transactional, stock-safe and audit logged;
- API regression now requires `409 ITEM_HAS_STOCK` before clearing stock;
- dedicated DB regression recreates the pre-023 defect, reruns migration 023, validates recovery and both DB guards;
- production verifier requires schema 023 and zero hidden-stock conditions after deploy.

No production quantities are guessed, deleted or zeroed by this repair.


## 2026-09-20 — Release #774 production verification and location-integrity continuation

### Schema 023 release

PR #123 merged as `267235bf9d406f84f982d05df10a46a30f937201`.

Deploy Kitchen OS to VPS #774 / run `35458513691` passed:

- preflight;
- inventory archive integrity DB regression;
- API/inventory regression;
- PostgreSQL concurrency regression;
- desktop/mobile Chromium;
- workforce browser coverage;
- full-device cross-browser regression;
- exact tested commit deploy;
- server-side PostgreSQL backup;
- production health/release check;
- production UI smoke.

Production deployment evidence:

- backup: `/opt/kitchen-os/backups/kitchen_os_20260919T173838Z.dump`;
- migration 023 applied;
- `OK: schema version 023`;
- `OK: inventory archive-integrity triggers = 2`;
- `DATA_INTEGRITY_OK`;
- release endpoint: `267235b`.

Post-deploy Inventory Site Production Audit #31 / run `35458782811`:

- stock-site mismatch = 0;
- receive-default site mismatch = 0;
- unknown item site = 0;
- inactive item positive quantity = 0;
- inactive item positive minimum = 0;
- inactive location positive quantity = 0;
- inactive location positive minimum = 0;
- invalid receive-default checks = 0;
- duplicate active catalog/site groups = 0;
- active items missing stock/storage = 0;
- `inventory_site_integrity_violations = 0`;
- `inventory_hidden_integrity_violations = 0`;
- deployed release exact-match PASS.

The previously hidden Fuxing stock remained in PostgreSQL and became visible again; no quantity was guessed or zeroed.

### Next inventory defect found

The dedicated location archive API checked only positive physical quantity.
A location with quantity 0 but minimum > 0 could be archived and hide configuration.

Created branch:

- `fix/inventory-location-archive-integrity-20260920`

Schema 024 candidate:

- `inventory_locations_archive_guard`;
- `inventory_stock_active_location_guard`;
- `inventory_receive_defaults_active_location_guard`;
- API archive checks quantity OR minimum;
- DB regression for minimum-only location + receive-default routing;
- production verifier requires three new location-integrity triggers.

After this slice, inspect catalog sync stocktake writes so every physical quantity mutation has auditable transaction history.


## 2026-09-20 — Release #776 schema 024 and catalog stock-authority audit

### Release #776 verified

PR #124 merged as `d3d5f4e73d4c5fd6f2f4f3971066f4d7e31497d2`.

Deploy #776 / run `35459291983`:

- full DB/API/browser/full-device regression PASS;
- pre-deploy backup `kitchen_os_20260919T175402Z.dump`;
- migration 024 applied;
- schema 024 verified;
- inventory archive-integrity triggers = 2;
- inventory location-integrity triggers = 3;
- DATA_INTEGRITY_OK;
- exact release check PASS;
- production UI smoke PASS.

Post-deploy Inventory Site Production Audit #33 / run `35459551373`:

- cross-site mismatch = 0;
- inactive item quantity/minimum = 0;
- inactive location quantity/minimum = 0;
- invalid receive-default checks = 0;
- duplicate active catalog/site groups = 0;
- active items missing stock/storage = 0;
- hidden integrity violations = 0;
- exact release match PASS.

### Catalog stock-authority defect

Write-path audit found that `catalog/sync` directly overwrote quantity/minimum for stocktake-capable users.
The product modal calls this route after editing metadata and includes local quantity/minimum values, so a stale browser snapshot could overwrite PostgreSQL without an `inventory_transactions` record.

The same route deleted omitted stock rows when quantity was zero without requiring minimum to be zero.

Created branch:

- `fix/inventory-catalog-sync-stock-authority-20260920`

Implemented candidate behavior:

- catalog sync no longer writes physical quantity/minimum;
- catalog sync creates only zeroed new associations;
- protected omitted associations return 409;
- omitted association deletion requires quantity=0 and minimum=0;
- product modal quantity uses `set-quantity`;
- product modal minimum/work minimum uses `set-minimum`;
- metadata sync can defer refresh until dedicated stock writes finish;
- dynamic regression proves a stocktake-capable supervisor cannot overwrite stock via catalog sync;
- dynamic regression proves minimum-only location removal is blocked.

No schema migration is required; schema remains 024.


## 2026-09-20 — Release #783 and Super Admin inventory lifecycle audit

### Release #783

PR #125 merged as `5bc9d92e878510c0646acced2b8070750778529c`.

Deploy #783 / run `35475816625` passed:

- full static regression;
- API/inventory regression including catalog stock-authority tests;
- PostgreSQL concurrency;
- desktop/mobile Chromium;
- workforce/browser regressions;
- full-device cross-browser;
- exact tested commit deploy;
- server-side backup `kitchen_os_20260919T232353Z.dump`;
- schema 024 verifier;
- DATA_INTEGRITY_OK;
- production UI smoke.

Post-deploy Inventory Site Production Audit #40 / run `35476066953`:

- schema 024;
- central quantity 71;
- fuxing quantity 1792;
- yongji quantity 6;
- stock-site mismatch = 0;
- receive-default mismatch = 0;
- inactive item/location quantity/minimum = 0;
- invalid receive-default checks = 0;
- duplicate active catalog/site = 0;
- active item missing stock/storage = 0;
- hidden/site integrity violations = 0;
- exact release match PASS.

### Super Admin lifecycle gap

Runtime inventory write scan found physical quantity paths are now transaction-backed.
The next bypass was generic Super Admin `inventory-products` CRUD:

- could create active item rows without storage association;
- exposed `active` lifecycle toggle;
- exposed generic archive instead of dedicated Inventory archive cleanup.

Created branch:

- `fix/super-admin-inventory-lifecycle-20260920`

Candidate changes:

- remove `active` from generic editable inventory fields;
- disable generic inventory create;
- disable generic inventory archive;
- return `allowCreate=false`, `allowArchive=false`, `lifecycleManaged=true`;
- frontend hides create/archive and explains Inventory owns lifecycle;
- existing item metadata remains editable;
- dynamic API regression covers create/active/archive denial + metadata edit;
- static contract prevents future lifecycle re-exposure.

No schema migration is required.


## 2026-09-20 — Production #786 and Live GitHub Handoff

### Production #786

PR #126 (Super Admin inventory lifecycle hardening) merged as:

- `60684bb3bb38d5f6af3a4c25f8991fc2ecc1c17c`.

Deploy Kitchen OS to VPS #786 / run `35482680596`:

- preflight/static: PASS;
- API/inventory: PASS;
- PostgreSQL concurrency: PASS;
- desktop/mobile Chromium: PASS;
- workforce/browser regressions: PASS;
- full-device cross-browser: PASS;
- SSH deploy: PASS;
- production release/health: PASS;
- production UI smoke: PASS.

Inventory Site Production Audit #44 / run `35482912054`: PASS.

VPS Capacity Audit #7 / run `35482680608`: PASS.

Observed read-only capacity snapshot:

- 2 vCPU;
- 3.8 GiB RAM;
- host memory snapshot: about 332 MiB used, about 3.4 GiB available;
- root virtual disk device: 50 GiB;
- PostgreSQL data directory: about 67 MiB;
- backup directory: about 20 MiB / 80 dump files;
- kitchen-os-web: about 13.88 MiB memory;
- kitchen-os-api: about 24.5 MiB memory;
- kitchen-os-db: about 32.63 MiB memory.

### Live GitHub & Handoff request

User requested that Super Admin GitHub & Handoff update the current development chain/fix directly from VPS/GitHub and provide one link that another developer or a future chat can use to continue.

Created branch:

- `feat/live-github-handoff-20260920`.

Implementation candidate:

- cached VPS GitHub feed discovers latest open PR;
- active PR supplies branch/head/base/title/body;
- PR changed files become code focus;
- recent PR commits become development chain;
- Actions runs are filtered to the exact PR head SHA;
- Super Admin displays live/fallback state and a copyable canonical handoff link;
- public `handoff.html` independently reads public GitHub state for new-dev/new-chat access;
- CI disables external GitHub calls and checks deterministic response shape;
- static regression protects the one-link/live-feed contract.

Canonical continuation URL:

- https://vial1307.github.io/restaurant-management-system-demo/handoff.html

Next separate defect already confirmed during read-only audit:

- `POST /api/inventory/set-minimum` mutates `minimum_quantity` without transaction/audit history;
- this must be fixed in a separate slice after Live Handoff production verification.


## 2026-09-20 — Live Handoff production #789 and minimum-history continuation

### Live Handoff verified

PR #127 merged as `19feaa88744939eba6c6b28cdcc57b290ad72029`.

Deploy #789 / run `35495483199`:

- preflight/static: PASS;
- API/inventory regression: PASS;
- PostgreSQL concurrency: PASS;
- desktop/mobile Chromium: PASS;
- workforce/browser regression: PASS;
- full-device cross-browser: PASS;
- server backup: `kitchen_os_20260920T065921Z.dump`;
- schema 024: PASS;
- item archive-integrity triggers = 2;
- location-integrity triggers = 3;
- DATA_INTEGRITY_OK;
- Web/API/Super Admin edge healthy;
- production UI smoke: PASS;
- release: `19feaa8`.

GitHub Pages #927 deployed the canonical handoff page successfully.

Inventory Site Production Audit #47 / run `35495707381`:

- schema 024;
- stock-site mismatch = 0;
- receive-default mismatch = 0;
- inactive item quantity/minimum = 0;
- inactive location quantity/minimum = 0;
- invalid receive-default checks = 0;
- duplicate active catalog/site groups = 0;
- active items missing stock/storage = 0;
- site integrity violations = 0;
- hidden integrity violations = 0;
- exact release `19feaa8` PASS.

Canonical continuation URL:

- https://vial1307.github.io/restaurant-management-system-demo/handoff.html

### Minimum-history defect

Created branch:

- `fix/inventory-minimum-history-20260920`

Existing behavior:

- `set-minimum` wrote `inventory_stock.minimum_quantity` directly;
- no inventory transaction was created;
- Inventory History only reads `inventory_transactions`, so the change was invisible.

Candidate implementation:

- wrap `set-minimum` in `withTransaction`;
- create zero association only if missing;
- lock stock row and read current minimum;
- update minimum;
- if changed, insert an `adjust` transaction with:
  - `operation=set_minimum`;
  - `before_minimum`;
  - `after_minimum`;
- no-op saves create no transaction;
- cloud history maps these rows to direction `minimum`;
- UI renders `標準量調整 / Điều chỉnh định mức` and before/after;
- dynamic regression validates change/no-op/clear history.


## 2026-09-20 — Minimum history production #793 and receive-default audit continuation

### Minimum history production verification

PR #129 merged as:

- `ccef35dad7027808d60b3a691925fbebc29b9eb4`.

Deploy Kitchen OS to VPS #793 / run `35496998332`:

- preflight/static: PASS;
- API/inventory regression: PASS;
- PostgreSQL concurrency: PASS;
- desktop/mobile Chromium: PASS;
- workforce/browser regression: PASS;
- full-device cross-browser: PASS;
- backup: `kitchen_os_20260920T073331Z.dump`;
- schema 024: PASS;
- item archive-integrity triggers = 2;
- location-integrity triggers = 3;
- DATA_INTEGRITY_OK;
- Web/API/Super Admin edge healthy;
- production UI smoke: PASS;
- exact release: `ccef35d`.

GitHub Pages #928: PASS.

Inventory Site Production Audit #51 / run `35497249172`:

- first attempt: FAILED before SQL execution because SSH connection was reset by peer;
- same audit job rerun without code/data changes: PASS;
- schema 024;
- all cross-site / hidden inventory structural counters = 0;
- exact release `ccef35d` PASS.

### Receive-default audit defect

Created branch:

- `fix/inventory-receive-default-audit-20260920`.

Existing behavior:

- `inventory_receive_defaults` stored only latest `location_id`, `updated_by`, `updated_at`;
- update replaced prior state;
- delete removed the row;
- direct configuration changes had no durable before/after history.

Candidate implementation:

- use `withTransaction`;
- take a transaction advisory lock per `site + catalogKey`;
- lock current receive-default row when present;
- validate destination storage configuration inside the transaction;
- suppress no-op set and no-op delete;
- create `audit_logs` row only for real create/update/delete;
- action: `inventory_receive_default_change`;
- entity: `inventory_receive_default`, id `site:catalogKey`;
- before/after store location id/code;
- metadata stores catalog key and operation.

Dynamic API regression:

- dedicated two-location item;
- create -> audit;
- same-location save -> no audit;
- update -> audit;
- delete -> audit;
- second delete -> no audit;
- Super Admin Audit endpoint must return exactly three matching rows.


## 2026-09-21 — Receive-default audit production #796 and catalog audit continuation

### Receive-default audit production verification

PR #130 merged as:

- `21d376295b6194e48bfaa599fc6c5424256a6196`.

Deploy Kitchen OS to VPS #796 / run `35500763361`:

- preflight/static: PASS;
- API/inventory regression: PASS;
- PostgreSQL concurrency: PASS;
- desktop/mobile Chromium: PASS;
- workforce/browser regression: PASS;
- full-device cross-browser: PASS;
- backup: `kitchen_os_20260920T085648Z.dump`;
- schema 024: PASS;
- inventory location-integrity triggers = 3;
- DATA_INTEGRITY_OK;
- Web/API/Super Admin edge healthy;
- production UI smoke: PASS;
- exact release: `21d3762`.

GitHub Pages #929: PASS.

Inventory Site Production Audit #54 / run `35500993290`:

- schema 024;
- stock-site mismatch = 0;
- receive-default site mismatch = 0;
- inactive item/location positive quantity/minimum = 0;
- invalid receive-default checks = 0;
- duplicate active catalog/site groups = 0;
- active items missing stock/storage rows = 0;
- site integrity violations = 0;
- hidden integrity violations = 0;
- exact release `21d3762` PASS.

### Catalog configuration audit defect

Created branch:

- `audit/inventory-config-next-20260921`.

Existing behavior:

- `catalog/sync` updated item metadata and zero-stock storage associations without persistent before/after audit;
- no-op saves still passed through the upsert path;
- quantity/minimum values in catalog payload were already intentionally ignored and must remain ignored.

Candidate implementation:

- transaction + advisory lock per `itemKey`;
- lock current item row;
- compare metadata before update;
- skip item update when metadata is unchanged;
- snapshot item metadata + site location associations before/after;
- write `audit_logs` only when actual configuration changed;
- action `inventory_catalog_change`;
- entity `inventory_item`;
- entity id uses `item_key`;
- operation metadata `create/update`;
- new association rows stay at quantity=0/minimum=0.

Dynamic API regression:

- create dedicated catalog item in one location;
- identical save with different payload quantity/minimum -> no audit and no physical stock change;
- update metadata and add second location -> audit update;
- Super Admin Audit must return exactly create + update for that item key;
- both stock rows must remain 0/0.


## 2026-09-21 — Inventory round-trip persistence and rapid-adjustment candidate

Created continuation branch:

- `fix/inventory-roundtrip-performance-20260921`;
- prerequisite catalog-audit PR #131 merged as `35ec19d3c89f43313a6d6895db446a6c7d5a5ea9` and PR #132 is based on that merge;
- production remains Deploy #796 / `21d376295b6194e48bfaa599fc6c5424256a6196`, schema 024.

Confirmed defects:

- every rapid branch/central `+ / -` action updated the store or page and triggered a full render, then cloud synchronization triggered another full inventory fetch/render;
- work-area changes used catalog sync, but a stocked old work-location association cannot be removed by catalog configuration, so reload restored the old value;
- branch item form submit referenced `state` without declaring it and could fail before persistence;
- central modal quantity/minimum values were only present in the catalog payload, where physical stock fields are intentionally ignored;
- stocked storage replacements in edit modals did not consistently use `relocate-storage`.

Candidate implementation:

- coalesce rapid controls for 120 ms, serialize net adjustments and perform one final authoritative reconciliation;
- add pending/saved/error row feedback without whole-page render per tap;
- add `POST /api/inventory/relocate-work-area` with site/capability validation, advisory and row locks, atomic source-to-destination quantity/minimum move, item metadata update, transfer history and `inventory_work_area_relocate` audit;
- route branch work-area controls through the relocation endpoint;
- route protected branch/central storage replacements through `relocate-storage`;
- persist branch/central quantity and minimum through dedicated stock APIs;
- restore branch edit submit state declaration;
- add static contract coverage and dynamic API regression for both 復興 and 永吉 work-area relocation.

Local verification:

- syntax checks: PASS;
- `tests/static-regression.mjs`: PASS;
- `tests/performance-regression.mjs`: PASS;
- focused scalar no-op, hydration authority, empty snapshot, sync serialization, cache invalidation and branch/central stocktake-boundary regressions: PASS;
- `git diff --check`: PASS.

Pending CI proof:

- PostgreSQL/API regression;
- PostgreSQL concurrency regression;
- desktop/mobile Chromium regression;
- full-device cross-browser regression.

Local Docker was unavailable and Playwright Chromium download timed out, so no local dynamic database/browser result is claimed.


## 2026-09-21 — Inventory overview/editor real-time convergence candidate

Verified baseline before this slice:

- PR #132 merged and deployed as `9bc9ad5f3571e197070a9430ff9e4c7bc3123f6a`;
- Deploy Kitchen OS to VPS #802 / run `35526347373`: PASS;
- GitHub Pages #931: PASS;
- Inventory Site Production Audit #61 / run `35526617408`: PASS;
- schema remains `024`.

Branch:

- `fix/inventory-live-editor-sync-20260921`.

Confirmed gaps:

- direct quantity/minimum APIs and UI controls still used a legacy manager/supervisor/admin name gate after explicit `inventory.edit` was granted;
- Central overview rendered work area and storage location as read-only;
- Central product save referenced an out-of-scope `stocktakeWritable` variable before dedicated quantity/minimum persistence;
- branch overview scalar edits wrote local cache and rendered before VPS confirmation;
- `subscribeRealtime()` did not create any transport, so another tab/device depended on focus or 60-second polling.

Candidate implementation:

- `inventory.edit` plus allowed site scope is the shared frontend/backend authority for quantity, minimum, catalog, relocation and receive-default controls;
- Central overview work-area changes use catalog sync; storage changes use the transactional relocation endpoint; both force PostgreSQL reconciliation and update the editor;
- branch overview quantity/minimum inputs wait for their dedicated VPS APIs and one forced snapshot before success;
- authenticated `/api/inventory/events` SSE broadcasts payload-free invalidation metadata after successful inventory writes;
- each browser tab sends a stable source client id, ignores its own SSE echo, coalesces remote events for 120 ms and force-refreshes the active permitted site;
- polling/focus/visibility remain fallback convergence paths;
- server shutdown closes SSE clients cleanly.

Local verification:

- JavaScript syntax checks: PASS;
- `tests/static-regression.mjs`: PASS;
- `tests/performance-regression.mjs`: PASS;
- `tests/vps-inventory-cache-invalidation-regression.mjs`: PASS;
- live-edit/realtime contract regression: PASS;
- `git diff --check`: PASS.

Pending CI proof:

- PostgreSQL/API SSE delivery and permission round-trip;
- concurrency regression;
- desktop/mobile Chromium and full-device browser certification;
- exact tested-head merge, VPS deploy, production smoke and Inventory Site Production Audit.

First PR #133 CI attempt:

- Deploy workflow #803 / run `35528428165` preflight: PASS;
- API regression stopped before browser/deploy because the SSE listener had been opened before earlier catalog/receive-default fixtures, so the assertion consumed an older valid invalidation with an empty source id instead of the writer event;
- runtime behavior was correct; the test ordering was corrected by opening the listener immediately before the mutation under test;
- production was not changed by the failed candidate run.

Second PR #133 CI attempt:

- Deploy workflow #804 / run `35528594733` preflight, API inventory/SSE, workforce API and PostgreSQL concurrency: PASS;
- Chromium stopped in the new two-tab browser check because Playwright `fill()` + `Tab` did not emit the expected change mutation in this form; backend logs confirmed that no browser `set-minimum` request was sent;
- the test now dispatches the native bubbling `change` event explicitly for the write and restore steps;
- production was not changed by the failed candidate run.

Third PR #133 CI attempt:

- Deploy workflow #805 / run `35528786380` again passed preflight, API inventory/SSE, workforce API and PostgreSQL concurrency;
- Chromium proved the failure was not a Playwright event issue: the visible branch row came from the current site-scoped cloud mirror, but its change handler looked up the item in the stale long-lived store and therefore returned before sending `set-minimum`;
- `authoritativeBranchRecord()` now layers today's branch mirror over the store for rendering, overview handlers, quick `+ / -`, restock plans and editor submit comparisons;
- contract coverage now prevents the overview/editor lookup paths from drifting back to the stale store;
- production was not changed by the failed candidate run.

Fourth PR #133 CI attempt:

- Deploy workflow #806 / run `35529217177` again passed preflight and reached the browser two-tab check, while independent approval/load workflows passed;
- the source overview still produced no `set-minimum` request in the synthetic interaction, so deploy remained skipped;
- rendered branch controls now carry immutable `stockKey` plus rendered zone/work-area identity and can construct the database mutation target even if both the store and mirror lookup lag;
- the browser regression now waits for HTTP 200 from the actual overview mutation before asserting SSE convergence in the already-open peer editor, and restores the fixture through the same UI/API path;
- production was not changed by the failed candidate run.

Fifth PR #133 CI attempt:

- Deploy workflow #807 / run `35529510211` passed preflight; Super Admin Browser Regression #93, Workforce Approval Diagnostic #217 and Isolated API Load Smoke #408 all passed independently;
- the database mutation assertion timed out before any `set-minimum` request, proving the rendered identity was present but the delegated bubble-phase `change` handler was not reached;
- the root change handler now runs in capture phase, before nested feature/compatibility layers can stop bubbling, while retaining the same permission and PostgreSQL mutation checks;
- production was not changed by the failed candidate run.

Sixth PR #133 CI attempt:

- Deploy workflow #808 / run `35547995698` passed preflight; its browser mutation still stopped before POST while API logs showed schema/snapshot resolution requests;
- the remaining failure boundary was frontend cache lookup from rendered `stockKey + ui location` back to PostgreSQL UUIDs;
- branch quantity/minimum and rapid `+ / -` controls now carry the authoritative item/location UUIDs already returned in the rendered snapshot and send those IDs directly to the mutation API, with the former key/code resolver retained only as backward-compatible fallback;
- the two-tab browser gate explicitly requires both rendered PostgreSQL IDs before executing the overview write;
- production was not changed by the failed candidate run.

Seventh PR #133 CI attempt:

- Deploy workflow #809 / run `35548327477` passed preflight and confirmed both rendered PostgreSQL IDs were present, but still observed no mutation response;
- the next browser gate records whether the synthetic change reaches `#app`, whether the application disables the control at mutation start, and the exact edit permission/date/cloud readiness state;
- this diagnostic is intentionally before merge/deploy so the final correction is based on the actual failed boundary rather than another assumption;
- production was not changed by the failed candidate run.

Eighth PR #133 CI attempt:

- Deploy workflow #810 / run `35548488809` passed preflight, API inventory/SSE, workforce API and PostgreSQL concurrency before the browser gate stopped;
- the added boundary probe exposed the exact frontend exception: the delegated root `change` handler referenced `state` without initializing it, so every inventory overview change returned through the global error observer before a mutation could start;
- the handler now captures one current store snapshot at event entry, restoring the shared state needed by quantity, minimum, work-area and storage-location writes while keeping the rendered PostgreSQL identity path;
- static, performance and syntax regression suites pass after the correction;
- production was not changed by the failed candidate run.

Ninth PR #133 CI attempt:

- Deploy workflow #811 / run `35548641153` passed preflight, API inventory/SSE, workforce API and PostgreSQL concurrency;
- Chromium confirmed the outside minimum edit now reached `POST /api/inventory/set-minimum`; only the already-open peer editor failed to repaint before its timeout;
- the cause was cross-tab `localStorage`: the writer tab stored the new snapshot first, so the peer's forced SSE fetch compared equal and suppressed its document-local update event even though that peer's DOM was stale;
- every forced remote reconciliation now emits the inventory-updated event when data compares equal, making each tab repaint from the authoritative snapshot without adding another database write;
- production was not changed by the failed candidate run.

## 2026-09-21 — Inventory realtime production #815 and next domain handoff

Final inventory verification:

- PR #133 passed Deploy workflow #812, including API/SSE, PostgreSQL concurrency, two-tab overview-to-editor convergence, desktop/mobile Chromium and full-device cross-browser coverage;
- PR #133 merged as `a5da75d4dac54c38abbf825bc1d247798d25ba14`;
- main deploy #813 was blocked only by unrelated mobile permission-test hydration timeouts at different accounts;
- PR #134 changed only that existing test's per-attempt wait budget from 10 to 20 seconds without changing predicates, retries, assertions or application behavior;
- PR #134 passed workflow #814 and merged as `09e2fffc80bf186d15054002c00421a2a5525e8f`.

Deploy Kitchen OS to VPS #815 / run `35549929164`:

- preflight/static/performance/runtime sync: PASS;
- API inventory/SSE and workforce API: PASS;
- PostgreSQL concurrency: PASS;
- desktop/mobile Chromium: PASS;
- full-device cross-browser: PASS;
- exact tested-SHA deploy with backup/rollback: PASS;
- deploy-integrated inventory site/data-integrity audit: PASS;
- schema `024`: PASS;
- API/database health and release `09e2fff`: PASS;
- production UI smoke: PASS;
- GitHub Pages #933: PASS.

The inventory overview/editor persistence and realtime workstream is complete. The next non-approval workstream is normalized-domain continuation. Workforce schedule is the nearest prepared domain: verify current production parity/backfill, then enable relational read only through a separate reviewed flag change while compatibility writes and rollback remain active.

## 2026-09-21 — Workforce production verification queue correction

Production evidence review found:

- Schedule Parity #96 / run `35550219935` passed against exact release `09e2fff`.
- Schedule Backfill #307 / run `35550219973` was cancelled before its job started.
- GitHub reported `Canceling since a higher priority waiting request for kitchen-os-production-maintenance exists`.
- Staff, schedule and attendance workflow-run verification all used the same workflow-level concurrency group. GitHub retains at most one running and one pending member of a group, so simultaneous post-deploy verification could cancel a required domain check even with `cancel-in-progress: false`.

Candidate correction:

- automatic/read-only staff, schedule and attendance verification each use a domain-specific concurrency group;
- all manually dispatched `apply` modes continue to share `kitchen-os-production-maintenance-apply`, preserving serialized production writes and backups;
- regression coverage requires both the shared apply group and each unique verify group;
- no schema, application read authority or business data changes are included;
- `WORKFORCE_SCHEDULE_RELATIONAL_READ` remains OFF until corrected parity and backfill verification pass on the same production release.

CI follow-up:

- main deploy #817 first hit, then passed after rerun, a WebKit-only page error for the local test reverse proxy's authenticated inventory SSE URL;
- PR #136 reproduced the same local proxy warning in the mobile role/site certification while API/SSE, PostgreSQL concurrency, Chromium and the independent relational backfill regression all passed;
- the browser gate now suppresses only the exact WebKit + local test proxy + `/api/inventory/events` access-control message;
- Chromium, non-local URLs, other API paths and every other page error remain blocking; dedicated SSE API/two-tab coverage remains unchanged.

## 2026-09-21 — Workforce schedule relational read cutover candidate

Cutover prerequisite is now complete on one exact production release:

- queue correction PR #136 merged/deployed as `30fd1ddff89cd821b5a66fe54ececca9f9e9825f` through deploy #823 / run `35571481421`;
- Schedule Parity #105 / run `35571899839` passed against release `30fd1dd`;
- Schedule Backfill verify #316 / run `35571899835` passed against the same release `30fd1dd`.

The separate read-cutover candidate:

- defaults `WORKFORCE_SCHEDULE_RELATIONAL_READ=true` in VPS Compose;
- executes the entire deploy API/browser/PostgreSQL regression job with the gate enabled;
- keeps the backend parser fail-closed when no environment configuration is supplied;
- keeps compatibility JSON writes and module revision concurrency active;
- retains immediate rollback by setting `WORKFORCE_SCHEDULE_RELATIONAL_READ=false` in VPS `.env` and recreating the app container;
- does not change schema or retire compatibility data.


## 2026-09-27 — Super Admin / Database control-plane direction

- Product direction confirmed: Super Admin should be the normal business-database administration surface; operators should not need VPS/SSH for routine master-data changes.
- PostgreSQL remains authoritative behind VPS APIs; Super Admin must not expose unrestricted raw SQL/credentials.
- Opened PR #144 on branch refactor/inventory-db-control-plane-20260927.
- Updated canonical spec with Database-control-plane rules and acceptance criteria.
- Refactored legacy inventory helper functions to read storage/work locations and site registry from inventory master data instead of hard-coded Central/Fuxing/Yongji lists and Central storage labels.
- Updated Super Admin Database wording to make the control-plane role explicit.
- Added static regression guards for reintroduction of removed site/location hard-codes.
- No schema migration or production stock mutation. Production remains at the previously verified release until PR #144 passes CI, merges, deploys and production smoke passes.
