# Kitchen OS Engineering Status

> Start at the canonical Live Handoff URL, then read this repository handoff set.

## Canonical continuation link

- https://vial1307.github.io/restaurant-management-system-demo/handoff.html

This public page determines the latest open PR, branch/head SHA, changed files, recent commits and CI. When an active PR exists, it is newer work authority than stale branch strings in older log sections.

## Current production authority

- Repository: `vial1307/restaurant-management-system-demo`
- Runtime authority: Browser/UI -> VPS API -> PostgreSQL.
- Verified production release: Deploy Kitchen OS to VPS #786 / run `35482680596`.
- Verified production SHA: `60684bb3bb38d5f6af3a4c25f8991fc2ecc1c17c`.
- Production schema: `024`.
- Production UI smoke: PASS.
- Inventory Site Production Audit #44 / run `35482912054`: PASS.

## DONE

- Schema 023 protects item archive integrity.
- Schema 024 protects location lifecycle and receive-default routing.
- Catalog sync no longer writes physical quantity/minimum.
- Product stock changes use dedicated stocktake/minimum APIs.
- Super Admin generic `inventory-products` CRUD is metadata-only; create/archive/active lifecycle is blocked there.
- PR #126 lifecycle hardening is deployed in production #786.

## IN PROGRESS — Live GitHub & Handoff

Branch:

- `feat/live-github-handoff-20260920`

Goal:

- VPS Super Admin discovers current work directly from GitHub;
- latest open PR supplies current branch/head/fix body;
- changed files and commit chain are shown automatically;
- CI is filtered to exact PR head SHA;
- production release/schema remain runtime-derived;
- one stable public URL is the continuation entry for dev/chat handoff.

Files:

- `vps/backend/src/github-handoff.mjs`
- `vps/backend/src/super-admin-routes.mjs`
- `src/admin-panel.js`
- `handoff.html`
- `tests/live-handoff-contract-regression.mjs`

Schema change:

- none; remains `024`.

## NEXT

1. Run full CI for Live Handoff.
2. Verify Super Admin API/browser still passes with deterministic CI fallback.
3. Verify public `handoff.html` is published by GitHub Pages after merge.
4. Deploy exact tested commit and verify `#development` shows live PR/main state correctly.
5. Start a separate inventory minimum-history slice; do not mix it into this PR.

## BLOCKED

- No production data blocker.
- Do not expose credentials/secrets in Live Handoff.
- Do not make CI depend on GitHub API availability.
