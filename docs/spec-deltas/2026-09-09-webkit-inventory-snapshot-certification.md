# WebKit inventory snapshot certification readiness

Date: 2026-09-09

## Problem

The mobile role/site certification treated `shitu-inventory-cloud-v2=ready` as if branch inventory data had already been synchronized. That flag only proves the inventory backend/schema is available. `boot()` performs `syncInventoryNow(site)` afterward, and branch data becomes authoritative in the client only after `applyBranch()` writes the snapshot and emits `shitu:inventory-cloud-updated`.

On slower browser timing, especially WebKit in CI, the test could enter the Manage tab between schema readiness and snapshot application. The Manage tab was authorized, but its edit rows had not yet been populated, so the certification timed out waiting for `open-edit-item` even though the same role/site behavior passed once synchronization completed.

## Contract

For role/site inventory certification:

- Backend/schema readiness and inventory snapshot readiness are separate states.
- Before asserting inventory catalog controls for a site, the certification must observe `shitu:inventory-cloud-updated` for that exact site after requesting the current service date.
- The current-date action remains the synchronization trigger; the test must not rely on arbitrary sleeps or longer element timeouts.
- If the site snapshot never applies, certification must fail rather than masking a real backend/synchronization defect.
- No production inventory, authorization, database, or catalog semantics change in this delta.

## Regression coverage

`tests/mobile-role-site-certification.mjs` records inventory-applied events before selecting Today and waits for the expected site event before role-specific inventory assertions. Chromium and WebKit continue to execute the same authorization and UI assertions after that deterministic readiness boundary.
