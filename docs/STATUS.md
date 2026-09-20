# Kitchen OS Engineering Status

> Start at the canonical Live Handoff URL, then read this repository handoff set.

## Canonical continuation link

- https://vial1307.github.io/restaurant-management-system-demo/handoff.html

This public page determines the latest open PR, branch/head SHA, changed files, recent commits and CI. When an active PR exists, it is newer work authority than stale branch strings in older log sections.

## Current production authority

- Repository: `vial1307/restaurant-management-system-demo`
- Runtime authority: Browser/UI -> VPS API -> PostgreSQL.
- Verified production release: Deploy Kitchen OS to VPS #789 / run `35495483199`.
- Verified production SHA: `19feaa88744939eba6c6b28cdcc57b290ad72029`.
- Production schema: `024`.
- Production UI smoke: PASS.
- Inventory Site Production Audit #47 / run `35495707381`: PASS.

## DONE

- Schema 023 protects item archive integrity.
- Schema 024 protects location lifecycle and receive-default routing.
- Catalog sync no longer writes physical quantity/minimum.
- Product stock changes use dedicated stocktake/minimum APIs.
- Super Admin generic `inventory-products` CRUD is metadata-only; create/archive/active lifecycle is blocked there.
- PR #126 lifecycle hardening is deployed in production #786.

## IN PROGRESS — Live Handoff main/release evidence patch

Branch:

- `fix/live-handoff-main-release-evidence-20260920`

Goal:

- keep the already-deployed live PR handoff behavior;
- when no PR is open, hydrate main SHA, main commit chain and CI instead of an empty fallback;
- derive release milestone SHA from the running VPS;
- match Deploy/Audit evidence to the exact runtime SHA when available;
- keep the public one-link page useful between workstreams.

Files:

- `vps/backend/src/github-handoff.mjs`
- `vps/backend/src/super-admin-routes.mjs`
- `src/admin-panel.js`
- `handoff.html`
- `tests/live-handoff-contract-regression.mjs`

Schema change:

- none; remains `024`.

## NEXT

1. Run full CI for the main/release evidence patch.
2. Deploy exact tested commit.
3. Confirm public Live Handoff shows main SHA/CI when no PR is open.
4. Confirm Super Admin release milestone matches runtime SHA instead of a stale static release.
5. Start a separate inventory minimum-history slice.

## BLOCKED

- No production data blocker.
- Do not expose credentials/secrets in Live Handoff.
- Do not make CI depend on GitHub API availability.
