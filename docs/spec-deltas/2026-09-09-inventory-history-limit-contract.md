# SDD Delta — Inventory history limit contract

Date: 2026-09-09
Base production candidate: `b73a8caaaadc541336b11a2b91a7dfa34be14f0e`
Priority: P2 inventory history correctness

## Problem

`vpsInventoryHistory(site, { limit = 250 } = {})` accepts its limit through an options object, while `getCloudInventoryHistory(site, limit)` passed the numeric limit as the second positional argument. JavaScript destructuring therefore ignored the caller-provided number and the VPS request always used the wrapper default of 250.

## Required behavior

- `getCloudInventoryHistory(site, limit)` must forward the requested limit as `{ limit }`;
- `vpsInventoryHistory` keeps its existing options-object contract and default limit;
- no backend route, transaction ordering, authorization, PostgreSQL schema, inventory mutation behavior or UI copy changes;
- the normal preflight regression suite must fail if the scalar call shape returns.

## Acceptance

A contract regression must verify the VPS wrapper accepts an options object, inventory-cloud passes `{ limit }`, and the obsolete scalar call shape is absent. Existing static/performance/runtime, API/PostgreSQL, Chromium, recovery/persistence, full-device, exact-SHA deploy, health/release and production UI smoke gates remain mandatory.

Targeted validation passed together with the authoritative-empty-snapshot, sync-serialization, and read-after-write cache regressions before PR certification.
