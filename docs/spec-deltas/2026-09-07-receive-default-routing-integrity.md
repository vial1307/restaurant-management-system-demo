# Receiving-default routing integrity

Date: 2026-09-07
Base release: `bcf08fba21b3850fd2ba4e90f77a549790d97424`

## Problem

`央廚出貨收貨儲位` is branch-owned routing configuration, but the current API only proves that the selected code is an active storage location at the destination site. It does not prove that the product itself is configured to use that location.

For a destination product with multiple configured storage locations, `direct-transfer` trusts the persisted receiving-default and then creates `inventory_stock` at the requested destination when missing. A stale/corrupt/default value that points outside the product's configured location set can therefore create a new stock location during `出貨`, bypassing branch catalog/location configuration.

## Required behavior

1. `POST /api/inventory/receive-default` keeps the existing manager/admin ownership boundary.
2. A non-empty receiving default is valid only when:
   - the destination location is active, `kind='storage'`, and belongs to the requested site; and
   - an active destination inventory item with the requested `catalogKey` is already configured at that exact location through `inventory_stock`.
3. A manager/admin attempt to save a location outside that product's configured storage set must return HTTP `409` with `RECEIVE_DEFAULT_LOCATION_NOT_CONFIGURED`; it must not mutate the persisted default.
4. Clearing a receiving default remains allowed and unchanged.
5. `direct-transfer` must defensively revalidate an existing receiving-default when the destination product has multiple configured storage locations. If the persisted default is not one of those configured location IDs, return HTTP `409` with `DESTINATION_RECEIVE_DEFAULT_NOT_CONFIGURED` before any destination stock row or quantity mutation is created.
6. Existing single-location routing remains unchanged: shipment must use the one configured destination location.
7. Cross-site routing metadata remains readable by authorized shipping roles; destination quantities remain site-protected as before.
8. No database schema change is required.

## Acceptance regression

- branch manager can still save a configured default;
- supervisor/employee/Central ownership denials remain unchanged;
- manager cannot save Fuxing tofu to `fuxing-four` because tofu is configured only in `fuxing-freezer`;
- the rejected default is not persisted;
- a deliberately corrupted multi-location default injected directly into the isolated regression database is rejected by `direct-transfer` before stock creation;
- no `inventory_stock` row is created at that unconfigured destination location;
- normal API, PostgreSQL concurrency, desktop/mobile and full-device suites remain green;
- production completion still requires exact-SHA VPS deploy and production smoke after merge.
