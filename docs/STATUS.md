# Kitchen OS Engineering Status

> Read this after `docs/CURRENT_HANDOFF.md`. `docs/WORK_LOG.md` is the chronological evidence log.

## Current authority

- Repository: `vial1307/restaurant-management-system-demo`
- Runtime authority: Browser/UI -> VPS API -> PostgreSQL.
- Verified production release: Deploy Kitchen OS to VPS #776 / run `35459291983`.
- Verified production SHA: `d3d5f4e73d4c5fd6f2f4f3971066f4d7e31497d2`.
- Production schema: `024`.
- Production UI smoke: PASS.
- Post-deploy Inventory Site Production Audit #33 / run `35459551373`: PASS.
- Cross-site violations: 0.
- Hidden item/location/default violations: 0.

## DONE

- Schema 023 repaired inactive-item hidden stock without changing physical quantity.
- Schema 024 protects location archive, inactive-location stock writes and receive-default routing.
- Production verifier reports 2 item archive-integrity triggers + 3 location-integrity triggers.
- Current production inventory structural audit is clean.

## IN PROGRESS — catalog stock authority hardening

Branch:

- `fix/inventory-catalog-sync-stock-authority-20260920`

Schema change:

- none; remains `024`.

Confirmed defect:

- product modal sends quantity/minimum inside catalog payload;
- `POST /api/inventory/catalog/sync` allowed stocktake-capable users to overwrite `inventory_stock.quantity/minimum_quantity`;
- those quantity writes bypassed `inventory_transactions`;
- a metadata-only edit could therefore replay stale browser quantity into PostgreSQL;
- catalog location removal also deleted quantity=0 rows even when minimum > 0.

Candidate fix:

- catalog sync becomes metadata/location-association only;
- new associations are zeroed and never seed quantity/minimum;
- omitted associations are removable only when quantity=0 and minimum=0;
- protected omitted location returns `409 LOCATION_HAS_STOCK`;
- product modal routes quantity through `set-quantity` and minimum through `set-minimum`;
- catalog sync may defer refresh while dedicated stock writes complete;
- API/static regression proves stocktake-capable catalog sync cannot overwrite stock.

## NEXT

1. Run full CI.
2. Fix any API/browser regression without restoring catalog quantity writes.
3. Merge only when all release gates are green.
4. Deploy exact tested commit; schema remains 024.
5. Re-run production inventory audit and release smoke.
6. After deploy, audit remaining direct writes to `inventory_stock` for transaction/audit consistency.

## BLOCKED

- No production structural-data blocker.
- Historical catalog-sync quantity overwrites cannot be reconstructed reliably when they left no inventory transaction; do not invent corrective quantities.
