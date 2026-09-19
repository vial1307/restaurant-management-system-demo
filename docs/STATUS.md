# Kitchen OS Engineering Status

> Read this after `docs/CURRENT_HANDOFF.md`. `docs/WORK_LOG.md` is the chronological evidence log.

## Current authority

- Repository: `vial1307/restaurant-management-system-demo`
- Runtime authority: Browser/UI -> VPS API -> PostgreSQL.
- Verified production release: Deploy Kitchen OS to VPS #774 / run `35458513691`.
- Verified production SHA: `267235bf9d406f84f982d05df10a46a30f937201`.
- Production schema: `023`.
- Production UI smoke: PASS.
- Post-deploy Inventory Site Production Audit #31 / run `35458782811`: PASS.
- Cross-site violations: 0.
- Hidden inventory violations: 0.

## DONE

- Schema 023 repaired the inactive-item hidden-stock defect found by deep production audit.
- The two affected Fuxing items were made visible again without changing physical quantities/minimums.
- Item archive is now protected by API transaction + DB triggers.
- Positive quantity/minimum cannot be written to an inactive item.
- Production verifier and post-deploy audit enforce the hidden-stock invariant.

## IN PROGRESS — inventory location archive integrity

Branch:

- `fix/inventory-location-archive-integrity-20260920`

Target schema:

- `024`

Confirmed design gap:

- location archive API checked only `quantity > 0`;
- `quantity = 0` with `minimum_quantity > 0` could be archived;
- production currently has zero such invalid rows, so this is preventive hardening.

Candidate changes:

- block archive when quantity or minimum remains;
- DB trigger guards location archive;
- DB trigger blocks positive stock/minimum on inactive location;
- DB trigger blocks receive-default routing to inactive/non-storage location;
- dedicated DB regression covers minimum-only + receive-default cases;
- release verifier requires three location-integrity triggers.

## NEXT

1. Run full CI for schema 024.
2. Merge only if DB/API/browser/full-device gates are green.
3. Deploy with PostgreSQL backup.
4. Confirm schema 024 and all location-integrity triggers in production.
5. Confirm post-deploy hidden inventory/location/default violations remain zero.
6. Then audit `catalog/sync` quantity writes for missing `inventory_transactions`.

## BLOCKED

- No production data blocker.
- Do not relax schema 023 item archive guards while implementing schema 024.
