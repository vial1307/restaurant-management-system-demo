# Kitchen OS Engineering Status

## ACTIVE — Database control plane / inventory hard-code retirement

- PR #144: Super Admin is being formalized as the business Database control plane.
- First stage removes closed Central/Fuxing/Yongji and Central-location mappings from legacy inventory helper paths and derives them from PostgreSQL-loaded master data.
- Super Admin Database wording now reflects PostgreSQL authority and shared API/event synchronization.
- No schema migration, no stock rewrite and no claim that PR #144 is production yet.
- Next inventory stages: continue removing obsolete local draft authority/mappings, then redesign Central Kitchen UI on top of database-declared site/location/work-area structure.


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
- Verified production release: Deploy Kitchen OS to VPS #849 / run `36153187681`.
- Verified production SHA: `f2ea2b3713e610c98e9ec90cd2178f5a2d5e682f`.
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
