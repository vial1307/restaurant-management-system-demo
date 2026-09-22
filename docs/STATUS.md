# Kitchen OS Engineering Status


## Active correction — 2026-09-22 (not deployed)

- Cross-surface CI additionally reproduced a branch editor bug: cloud-hydrated items were displayed from the authoritative mirror, but saves were rebuilt from the stale legacy store. Branch add/edit now sends the explicit form draft to the existing catalog API, preserves failed forms and closes only after confirmed operations. Site switching explicitly activates the target master snapshot after the site commit.

- User reported Super Admin location/ingredient changes not reflected on the main website.
- Root causes found: Central rendered hard-coded work-area/storage labels; stock-only equality skipped master-only fallback refresh; cross-site shipping reads could replace active branch choices. Central overview edit also set editor state without rendering its modal.
- Candidate branch: `fix/inventory-admin-main-sync-20260922`, based on verified production #832 (`5cc4f90`) and docs main `eb9e38d`.
- Changes: site-scoped database labels/options, master-only and SSE reconnect reconciliation, open-editor protection, compact ingredient actions with storage context.
- Verification: local static/performance/admin contracts PASS. New CI test uses two independent browser sessions for main ↔ Super Admin edits, master labels, minimums and reload persistence on all three sites, at 320px and 1366px. CI and deployment pending; do not treat the existing #832 evidence as verification of this correction.

> Canonical continuation entry: https://vial1307.github.io/restaurant-management-system-demo/handoff.html

Open the Live Handoff page first. It determines the latest open PR, branch/head SHA, changed files, recent commits and CI. Then read CURRENT_HANDOFF / WORK_LOG / DEVELOPMENT_RULES.

## Current production authority

- Repository: `vial1307/restaurant-management-system-demo`
- Runtime authority: Browser/UI -> VPS API -> PostgreSQL.
- Verified production release: Deploy Kitchen OS to VPS #832 / run `35672333632`.
- Verified production SHA: `5cc4f907387873367d78dfbdfb3183971846e968`.
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
