# Kitchen OS Engineering Status

> Canonical continuation entry: https://vial1307.github.io/restaurant-management-system-demo/handoff.html

Open the Live Handoff page first. It determines the latest open PR, branch/head SHA, changed files, recent commits and CI. Then read CURRENT_HANDOFF / WORK_LOG / DEVELOPMENT_RULES.

## Current production authority

- Repository: `vial1307/restaurant-management-system-demo`
- Runtime authority: Browser/UI -> VPS API -> PostgreSQL.
- Verified production release: Deploy Kitchen OS to VPS #828 / run `35573596640`.
- Verified production SHA: `00949bec772bcc04441626903411020f2e3e7023`.
- Production schema: `024`.
- Production UI smoke: PASS.
- GitHub Pages #933: PASS.
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

## IN PROGRESS — branch-scoped Super Admin inventory database

Branch:

- `feat/super-admin-branch-inventory-database-20260921`;
- baseline is verified production `00949bec772bcc04441626903411020f2e3e7023`.

Schema:

- remains `024`.

Five views: ingredients, locations/work areas, per-location quantities/minimums, movement history and integrity. All writes use existing business APIs; the UI preserves per-site layouts, metadata and archive guards. Optional revision/expected-value checks reject stale saves; append-only association saves cannot prune other locations. Master-data writes now publish inventory SSE invalidations. No migration or new database authority.

Local static/performance/Super Admin contract tests pass. Full API/PostgreSQL and desktop/mobile UI checks are wired into CI, not yet certified for this candidate. Cloud Browser cannot reach the local development server (`ERR_BLOCKED_BY_CLIENT`); do not claim a local visual pass or a production deployment of this workspace.

## NEXT

1. Require the exact candidate's API branch-roundtrip, stale-write, archive and restricted-account checks to pass.
2. Require Super Admin desktop/mobile forms, persistence after reload, and generic-CRUD regression to pass.
3. Only then merge/deploy the tested SHA and verify production smoke; update handoff evidence afterwards.
4. Preserve the existing schedule read flag and compatibility writes; this inventory UI stage does not alter that domain.

## BLOCKED

- No production data blocker.
- Production load/stress testing, deeper per-record business concurrency and literal physical-device certification remain approval/operational-setup items in `docs/PENDING_APPROVAL.md`.
