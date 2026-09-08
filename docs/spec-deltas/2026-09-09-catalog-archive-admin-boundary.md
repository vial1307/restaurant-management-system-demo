# SDD Delta — Catalog archive admin boundary

Date: 2026-09-09
Base main candidate: `73f89cc895fc352db21e1514de275c25893a9fb6`
Priority: P1 permission parity

## Problem

The canonical archive endpoint and both branch/Central delete UIs are admin-only, but the exported inventory-cloud archive helpers still gate through `canDirectInventoryAdjust()`. That stocktake boundary is intentionally broader and includes manager/supervisor roles. The backend prevents privilege escalation today, but the frontend helper contract is inconsistent and can produce a misleading allowed path that ends in `403 ADMIN_REQUIRED` if invoked outside the current UI.

For branch catalog management, the stocktake guard also inherits the selected service-date restriction, even though catalog master-data management is intentionally not historical-date locked.

## Required behavior

- `cloudArchiveCentralItem()` and `cloudArchiveBranchItem()` must reject every non-admin role before calling the VPS archive API;
- archive helpers must not reuse `canDirectInventoryAdjust()`;
- the backend `/api/inventory/catalog/archive` remains admin-only;
- catalog editing, quantity/minimum stocktake, receiving defaults, transfer/shipment and history permissions are unchanged;
- no database schema or API route change.

## Acceptance

A normal preflight regression must lock frontend helper and backend archive permission parity. Full PR certification remains required before merge and exact-SHA production certification remains required after merge.
