# Kitchen OS Engineering Status

> Read this after `docs/CURRENT_HANDOFF.md`. `docs/WORK_LOG.md` is the chronological evidence log.

## Current authority

- Repository: `vial1307/restaurant-management-system-demo`
- Runtime authority: Browser/UI -> VPS API -> PostgreSQL.
- Verified production release: Deploy Kitchen OS to VPS #783 / run `35475816625`.
- Verified production SHA: `5bc9d92e878510c0646acced2b8070750778529c`.
- Production schema: `024`.
- Production UI smoke: PASS.
- Post-deploy Inventory Site Production Audit #40 / run `35476066953`: PASS.
- Cross-site violations: 0.
- Hidden item/location/default violations: 0.
- Production quantities unchanged by the catalog-authority release:
  - central: 71
  - fuxing: 1792
  - yongji: 6

## DONE

- Schema 023 repaired inactive-item hidden stock.
- Schema 024 protects location lifecycle and receive-default routing.
- Catalog sync is metadata/location-association only; it no longer overwrites quantity/minimum.
- Product-modal stock changes use dedicated stocktake/minimum APIs.
- Existing physical quantity runtime writes all have transaction history.

## IN PROGRESS — Super Admin inventory lifecycle hardening

Branch:

- `fix/super-admin-inventory-lifecycle-20260920`

Schema change:

- none; remains `024`.

Confirmed gap:

- generic Super Admin `inventory-products` CRUD could create active inventory items with no stock/storage association;
- generic active toggle/reactivation could bypass Inventory lifecycle;
- generic archive bypassed dedicated cleanup of stock associations and receive-default routing.

Candidate behavior:

- generic inventory dataset is metadata-only;
- create disabled;
- archive disabled;
- `active` not editable;
- existing metadata remains editable;
- backend exposes lifecycle policy to frontend;
- frontend hides unsupported lifecycle controls;
- dynamic/static regression enforce the boundary.

## NEXT

1. Run full CI.
2. Merge only after Super Admin API/browser + full release regression pass.
3. Deploy exact tested commit; schema remains 024.
4. Confirm production UI smoke and Inventory Site Production Audit remain clean.
5. Audit minimum-change history/audit semantics and remaining non-quantity inventory mutations.

## BLOCKED

- No production data blocker.
- Do not re-enable generic inventory create/archive/active lifecycle in Data Tables & CRUD.
