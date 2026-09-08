# SDD Delta — Authoritative empty inventory snapshots

Date: 2026-09-09
Base candidate: PR #57 head `a0a1c71a600eb6e8c829504e6f66b4f84da29a78`
Priority: P1 inventory consistency / stale-local cleanup

## Problem

`fetchSite(site)` currently collapses both a complete but empty VPS inventory snapshot and a malformed/incomplete payload into the same empty `[]` row list. `applyCentral()` and `applyBranch()` then refuse to apply empty row lists.

This preserves stale local inventory indefinitely when the authoritative VPS state legitimately becomes empty, for example after the final active item/stock entry is archived or removed. At the same time, simply applying every empty result would be unsafe because a malformed payload missing `items`, `locations`, or `stock` must not erase local recovery/UI state.

## Required behavior

- require the VPS inventory response to contain array-valued `items`, `locations`, and `stock` fields;
- treat a missing/non-array field as an invalid snapshot and fail the sync without modifying local inventory mirrors;
- treat complete arrays that are all or partly empty as an authoritative empty snapshot;
- clear shared ID/location caches when an authoritative snapshot is empty;
- allow branch empty snapshots to replace stale `inventory` and `workInventory` with empty arrays;
- allow central empty snapshots to replace stale central storage/work mirrors with `[]` and `{}`;
- preserve all existing permission, date, migration, mutation and status semantics.

## Acceptance

A runtime regression must prove:

1. a complete empty Fuxing snapshot clears stale branch storage and work inventory;
2. a malformed Central snapshot does not clear stale central mirrors and returns a failed sync;
3. after cache invalidation, a complete empty Central snapshot clears both central mirrors.

Normal preflight, API/PostgreSQL concurrency, Chromium desktop/mobile, recovery/persistence, full-device cross-browser, exact-SHA VPS deploy, health/release and production UI smoke remain mandatory.
