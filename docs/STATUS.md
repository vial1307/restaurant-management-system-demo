# Kitchen OS Engineering Status

## DONE — inventory UI master-data cutover, 2026-09-27

- PR #150 merged as `b1447b727e310b7a3095f5782c0a933916ef6234`; Deploy #885 / run `36270568342` is verified in production.
- Branch/Central inventory storage groups, work areas, primary/service grouping, location labels, site labels and item-unit entry are driven by PostgreSQL-loaded master data.
- Branch runtime inventory cannot fall back to source-seeded stock.
- Fixed Central unit/work-area/location defaults and remaining branch/site label fallbacks were removed from inventory UI paths.
- Mobile Settings accepts long database-provided site names without clipping.
- Exact PR head `b588b6673af3b0ec9dacc012dc59f06e77fc6ec0` passed Deploy #884, Super Admin Browser #155 and Workforce #280.
- Production #885 passed backup/deploy, `DATA_INTEGRITY_OK`, health `release=b1447b7` / schema `024`, and production UI smoke. Backup: `kitchen_os_20260926T204907Z.dump`.
- No schema migration and no production stock rewrite.
- NEXT: redesign Central Kitchen (央廚) inventory UI on the database-declared model.

## DONE — PostgreSQL-only inventory runtime authority, 2026-09-27

- PR #148 merged as `d88a90d9487d8edbb5f7e8020397893a5a5e9849`; Deploy #872 / run `36265842924` is verified in production.
- Removed branch/Central browser-local writable inventory drafts, local operation history, Central hard-coded product seed, fallback-success paths, `canInventoryDraftCount`, and the draft operation controller.
- Browser inventory caches now remain read-only server projections only; failed writes reconcile from PostgreSQL.
- Empty PostgreSQL snapshots remain authoritative and cannot trigger a hard-coded catalog reseed.
- Warehouse/site switching is driven by the PostgreSQL-backed site registry.
- Exact PR head `95d9ce407f27a96240fcc261b15671a8f1a77e43` passed preflight/full regression #871 and Workforce #268; merge production #872 passed backup/deploy, `DATA_INTEGRITY_OK`, health `release=d88a90d` / schema `024`, and `PRODUCTION_UI_SMOKE_OK`.
- Backup: `kitchen_os_20260926T192740Z.dump`.
- No schema migration and no production stock rewrite.
- NEXT: retire remaining mutable inventory master/rule hard-codes, then redesign Central Kitchen UI.

## DONE — realtime Database site registry, 2026-09-27

- PR #146 merged as `95a39088a33f61c218412c1dd2e2d253306a0471`; Deploy #867 / run `36262880282` is verified in production.
- Super Admin site create/update emits authenticated `site-registry` SSE invalidation; already-open Website and Super Admin sessions re-read the PostgreSQL registry without manual reload.
- Site registry cache is scoped to the authenticated user and ignores stale responses from a previous login.
- Inventory branch logic uses database-declared `inventory_mode`; the remaining Fuxing/Yongji closed lists in the inventory page were removed.
- Dirty/pending Super Admin Database editors defer active-site replacement, preventing old-site snapshots from being shown under a new site.
- Unrelated site-registry edits do not force an unnecessary active-stock reload.
- Exact PR head `eedaaca8244e880152d5273bccb71bd1e231b4f9` passed Master Data/Admin #242, Load #461, Workforce #264, Super Admin Browser #139 and Deploy preflight/full regression #866.
- Production #867 passed backup/deploy, `DATA_INTEGRITY_OK`, health `release=95a3908` / schema `024`, and `PRODUCTION_UI_SMOKE_OK`. Backup: `kitchen_os_20260926T183652Z.dump`.
- No schema migration and no production stock rewrite.
- NEXT: retire obsolete local inventory mutation/draft compatibility paths while preserving safe read-only cache/recovery behavior, then redesign Central Kitchen UI.


## DONE — Database control plane / inventory hard-code retirement stage 1

- PR #144 merged as `15ba0013f15daa9dcdc04152c95f12bd9f7fc793` and is verified in production through Deploy #856 / run `36259731875`.
- Super Admin is now formally defined as the normal business Database control plane; PostgreSQL remains authoritative behind VPS APIs.
- Legacy inventory helper paths derive site/storage/work structure from PostgreSQL-loaded master data instead of closed Central/Fuxing/Yongji and fixed Central-location mappings.
- Pre-merge Master Data/Admin Panel, six-profile Super Admin Browser and workforce diagnostics passed; merge release passed preflight, database/API round-trip, PostgreSQL concurrency, desktop/mobile + full-device browser regression, backup/rollback deploy, production health/release and production UI smoke.
- Schema remains `024`; no production stock rewrite or schema migration.
- Next inventory stage: real-time site-registry propagation, retire more obsolete local draft/master-data compatibility paths, then redesign Central Kitchen UI on database-declared structure.

## Role/location correction — production 2026-09-25

- PR #140 fixed `INVALID_LOCATION` when changing an all-scope user to an assigned branch Role. The workplace choices now follow Role scope; custom permissions and the selected branch survive switching. The isolated six-device UI and PostgreSQL account round-trip passed.
- Deploy #847 was blocked before frontend activation by an obsolete audit of legacy permission JSON. PR #141 updated the verifier to check effective database Role plus overrides without changing production accounts.
- **Verified production:** `f2ea2b3713e610c98e9ec90cd2178f5a2d5e682f`, Deploy #849 / run `36153187681`. Full regression, corrected `DATA_INTEGRITY_OK`, backup, health (`release=f2ea2b3`, `schema=024`, app/database `ok`) and `PRODUCTION_UI_SMOKE_OK` all passed. Backup: `kitchen_os_20260925T152227Z.dump`.


## Production correction — 2026-09-25

- PR #139 merged as `ee5316b8ae5f12f2288aebf54e9e9cede3756ba0`; VPS deploy #843 / run `36142844487` passed complete regression, backup/deploy and production UI smoke. Runtime: `release=ee5316b`, PostgreSQL schema `024`, app/database `ok`.
- Main inventory and Super Admin now reconcile site-specific work areas, storage and ingredient/stock metadata for Central, Fuxing and Yongji through PostgreSQL. Clean editors accept remote changes; dirty drafts retain input and block stale submission. The branch editor sends its actual form values, and Central overview Edit opens correctly.
- Six-device Super Admin browser regression `36142056162` and full API/PostgreSQL/browser regression `36142055831` passed; the merged release passed regression and production smoke in `36142844487`. No schema migration or production data rewrite.

> Canonical continuation entry: https://vial1307.github.io/restaurant-management-system-demo/handoff.html

Open the Live Handoff page first. It determines the latest open PR, branch/head SHA, changed files, recent commits and CI. Then read CURRENT_HANDOFF / WORK_LOG / DEVELOPMENT_RULES.

## Current production authority

- Repository: `vial1307/restaurant-management-system-demo`
- Runtime authority: Browser/UI -> VPS API -> PostgreSQL.
- Verified production release: Deploy Kitchen OS to VPS #885 / run `36270568342`.
- Verified production SHA: `b1447b727e310b7a3095f5782c0a933916ef6234`.
- Production schema: `024`.
- Production UI smoke: PASS.
- GitHub Pages #937: PASS (PR #138 source).
- Deploy-integrated inventory site/data-integrity audit: PASS.
- Inventory site integrity violations: 0.
- Hidden inventory violations: 0.

## DONE

- Item/location lifecycle and site-integrity hardening.
- Catalog sync removed from quantity/minimum authority.
- Minimum changes are transactional and visible in Inventory History.
- Receive-default create/update/delete are durably audited.
- No-op receive-default saves/deletes create no audit.
- Live GitHub & Handoff deployed.
- Inventory catalog/work/storage/modal round-trip and rapid `+ / -` performance fix (PR #132) deployed.
- Inventory overview/editor writes persist with explicit `inventory.edit` + site scope and synchronize through authenticated SSE (PR #133).
- Central/Fuxing/Yongji two-tab database round-trip and peer-editor repaint regression: PASS.
- Production #823 verified on schema 024.
- Schedule Parity #105 / `35571899839` and Schedule Backfill verify #316 / `35571899835` both passed against exact release `30fd1dd`.

## DONE — branch-scoped Super Admin inventory database

Branch:

- PR #138 merged into `main` as `5cc4f907387873367d78dfbdfb3183971846e968`;
- production deployment #832 passed on that exact release.

Schema:

- remains `024`.

Five views: ingredients, locations/work areas, per-location quantities/minimums, movement history and integrity. All writes use existing business APIs; the UI preserves per-site layouts, metadata and archive guards. Optional revision/expected-value checks reject stale saves; append-only association saves cannot prune other locations. Master-data writes now publish inventory SSE invalidations. No migration or new database authority.

Local static/performance/Super Admin contracts, API/PostgreSQL round trips on all three sites, six-profile browser tests, peer-edit conflict/input retention, full-system regression and production UI smoke passed. Runs: Super Admin Browser `35671898006`, Master Data/Admin API `35671897948`, final production `35672333632`. Runtime health returned release `5cc4f90`, schema `024`, app/database `ok`; inventory isolation audit found zero violations. Cloud Browser local preview was blocked; automated CI screenshots provide device evidence.

## NEXT

1. Owner can configure each branch's work areas and storage independently through Super Admin → Database; no setup values were copied automatically.
2. Preserve transactional relocation, expected-value conflict checks and PostgreSQL authority in follow-up work.
3. Refresh the static development-status fallback wording during the next runtime change; live release/workflow evidence and CURRENT_HANDOFF already record completion.
4. Preserve the existing schedule read flag and compatibility writes; this inventory UI stage does not alter that domain.

## BLOCKED

- No production data blocker.
- Production load/stress testing, deeper per-record business concurrency and literal physical-device certification remain approval/operational-setup items in `docs/PENDING_APPROVAL.md`.
