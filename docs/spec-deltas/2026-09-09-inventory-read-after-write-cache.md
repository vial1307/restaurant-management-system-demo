# SDD Delta — Inventory read-after-write cache consistency

Date: 2026-09-09
Base production: `368d8399720225f4ab26f122a79f55951c7f4af3`
Priority: P1 inventory consistency / immediate UI refresh

## Problem

`vpsInventory(site)` reuses a successful inventory GET for 1.2 seconds. Several successful inventory mutation wrappers (`set-quantity`, `set-minimum`, `adjust`, `transfer`, `ship`) did not invalidate that cache. Their callers commonly write to PostgreSQL and immediately call `syncInventoryNow()`, which can therefore consume the pre-write cached snapshot and temporarily render stale quantities or minimums.

`direct-transfer`, catalog sync and catalog archive already invalidate inventory cache after successful writes, so mutation behavior is inconsistent.

## Required behavior

- every successful inventory mutation that can change the inventory read model must invalidate the shared inventory GET cache before returning;
- the next `vpsInventory(site)` after a successful write must issue a fresh GET even inside the normal 1.2 second cache window;
- failed mutations must not discard an otherwise valid cached GET because PostgreSQL state did not change;
- keep request deduplication/cache behavior for normal repeated reads;
- keep receive-default cache semantics unchanged;
- do not change backend routes, database schema, permissions, quantity semantics, transfer semantics or UI copy.

## Acceptance

A Node runtime regression must seed a cached Fuxing inventory GET, execute each mutation wrapper (`set quantity`, `set minimum`, `adjust`, `transfer`, `ship`, `direct transfer`), and prove the immediate next inventory read performs a fresh GET. It must also prove a failed mutation leaves the existing cache usable.

Targeted runtime and performance regressions passed on the patch branch before PR certification.

Normal static/performance/runtime, API/PostgreSQL concurrency, Chromium desktop/mobile, recovery/persistence, full-device cross-browser, exact-SHA VPS deploy, health/release and production UI smoke remain mandatory.
