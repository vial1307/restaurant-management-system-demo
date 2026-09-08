# SDD Delta — Central empty cache authority

Date: 2026-09-09
Base production candidate: `1e8dc1b29fcfd4b7c3b2b1e564425464dd5e0464`
Priority: P1 inventory consistency

## Problem

The VPS inventory sync can legitimately persist the authoritative central inventory mirror as `[]`. `auth-layer.loadBaseStock()` only reused saved central stock when the array had at least one row; an explicit empty array therefore fell through to `DEFAULT_PRODUCTS`, reseeding items that the authoritative VPS snapshot had already removed/archived.

## Required behavior

- an explicit JSON array stored under the central stock key is authoritative even when empty;
- seed `DEFAULT_PRODUCTS` only when no valid array cache exists;
- malformed/non-array cache data may still fall back to defaults;
- do not change PostgreSQL, archive rules, catalog permissions, stock quantities, receiving defaults or UI copy;
- the normal preflight regression suite must fail if `loadBaseStock()` again requires `saved.length` before honoring the persisted array.

## Acceptance

A contract regression must verify that `loadBaseStock()` returns any persisted array directly, including `[]`, and must reject the old non-empty-only guard. It must run together with the authoritative-empty-snapshot regression so both halves of the flow remain locked: sync may clear the cache, and the UI must not immediately reseed it.

Targeted validation passed together with empty-snapshot, history-limit, sync-serialization and read-after-write cache regressions before PR certification.
