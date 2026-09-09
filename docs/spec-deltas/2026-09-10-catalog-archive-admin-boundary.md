# SDD Delta — Catalog archive admin boundary

Date: 2026-09-10
Base production main: `98da8e6287a57bfb2ec10c9035b7cd672c75a067`
Priority: permission-boundary parity

## Problem

The canonical backend archive endpoint and both branch/Central delete UIs are admin-only, but the exported inventory-cloud archive helpers still gate through `canDirectInventoryAdjust()`. That stocktake boundary is intentionally broader and includes manager/supervisor roles. The backend prevents privilege escalation, but the frontend helper contract is inconsistent and can expose an allowed frontend path that ultimately fails with `403 ADMIN_REQUIRED`.

For branch catalog management, the stocktake helper also inherits the current-service-date restriction even though catalog master-data management is not historical-date locked.

## Required behavior

- `cloudArchiveCentralItem()` and `cloudArchiveBranchItem()` reject every non-admin role before calling the VPS archive API.
- Archive helpers do not reuse `canDirectInventoryAdjust()`.
- Backend `/api/inventory/catalog/archive` remains admin-only.
- Catalog editing, stocktake, receiving defaults, transfers, history and database semantics remain unchanged.

## Acceptance

- Static regression locks frontend helper and backend permission parity.
- Targeted archive/inventory regressions pass on the current production-main baseline before PR certification.
- Full PR certification must pass before merge.
- Exact-SHA production certification must pass after merge.
