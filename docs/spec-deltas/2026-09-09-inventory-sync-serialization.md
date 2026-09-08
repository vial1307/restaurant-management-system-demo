# SDD Delta — Inventory sync serialization

Date: 2026-09-09
Base candidate: PR #56 head `e06d509109342ff302fe272290a55871a0352eb0`
Priority: P1 inventory freshness / cross-site synchronization

## Problem

`inventory-cloud.js` uses one module-level `syncing` boolean. `syncInventoryNow(site)` returns immediately when that flag is true, so a refresh requested while another refresh is running is silently dropped.

This is unsafe in two common flows:

- an inventory write succeeds and awaits `syncInventoryNow()`, but a poll/focus refresh is already active, so the write's immediate UI refresh is skipped;
- an admin switches warehouses while the previous site's sync is active, so the destination site's sync is skipped and the UI can keep an old local mirror until a later focus/poll.

The module also uses shared `itemsByKey` and `locationsByCode` maps, so simply allowing multiple site syncs to run concurrently would introduce a cross-site ID-cache race.

## Required behavior

- never silently drop a requested inventory sync merely because another sync is active;
- serialize sync requests through one global promise queue so shared inventory ID/location caches are never mutated concurrently;
- preserve each call's requested site and return a promise that resolves only after that requested sync has run or been rejected by normal permission/date/backend guards;
- a Fuxing sync followed by a Yongji sync must finish in Fuxing -> Yongji order;
- keep existing migration checks, permissions, historical-readonly behavior, status events and local mirror application semantics;
- do not change backend routes, database schema, inventory mutation semantics or permissions.

## Acceptance

A Node runtime regression must hold a Fuxing inventory GET open, request a Yongji sync while Fuxing is active, prove Yongji neither settles early nor runs concurrently, release Fuxing, then prove Yongji runs afterward.

Normal preflight, API/PostgreSQL concurrency, Chromium desktop/mobile, recovery/persistence, full-device cross-browser, exact-SHA VPS deploy, health/release and production UI smoke remain mandatory.
