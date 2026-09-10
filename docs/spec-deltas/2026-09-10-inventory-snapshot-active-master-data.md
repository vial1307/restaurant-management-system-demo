# Inventory snapshot active-master-data integrity — 2026-09-10

## Incident

Production inventory UI could report `INVENTORY_SNAPSHOT_INVALID` even while VPS PostgreSQL was connected. The failure affected the shared inventory snapshot consumed by overview, inbound, pick, transfer, shipping, management and history entry points.

## Root cause

`GET /api/inventory/:site` returned only active catalog items, but its stock query returned stock rows for active locations without also requiring the referenced inventory item to remain active. Archiving a catalog item intentionally preserves its historical stock row, so the API could return a stock `item_id` that was absent from `items`. The frontend correctly rejected that internally inconsistent snapshot.

## Required behavior

For `central`, `fuxing` and `yongji`:

- `items` contains only active catalog items for the requested site.
- `locations` contains only active locations for the requested site.
- every row in `stock` references an item present in `items` and a location present in `locations`.
- archived catalog items and their retained historical stock rows remain in PostgreSQL but are excluded from the active operational snapshot.
- no production stock quantity is rewritten or deleted by this fix.
- all inventory tabs use the same valid site snapshot; no tab-specific workaround is allowed.

## Regression contract

The API regression must exercise all three sites by creating an item with stock, archiving it, reloading the site snapshot, and verifying that the archived item and its retained stock row do not leak into the active response. It must also verify that every returned stock row resolves to an active returned item and location.

Desktop/mobile and cross-browser certification remain mandatory before merge and production deployment.
