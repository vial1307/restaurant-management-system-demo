# SDD Delta — Branch empty catalog authority

Date: 2026-09-09
Base production: `0f1e34614b644e480a9cfa4eed07853e7d161a6e`
Priority: P1 inventory consistency

## Problem

`applyBranch()` legitimately persists an authoritative empty VPS inventory snapshot as `record.inventory = []`. `buildBranchCatalog()` treated an empty array as if branch inventory had never been initialized and substituted `DEFAULT_ITEMS`. A later catalog mutation could therefore rebuild a payload from seeded defaults instead of the authoritative empty branch state.

## Required behavior

- any array in `record.inventory`, including `[]`, is authoritative for catalog construction;
- `DEFAULT_ITEMS` is only a compatibility fallback when `record.inventory` is missing or malformed/non-array;
- do not change PostgreSQL schema, catalog archive permissions, quantity rules, transfers, receiving defaults, or UI copy;
- the normal preflight regression suite must fail if the non-empty-array guard returns.

## Acceptance

A contract regression must verify that `buildBranchCatalog()` directly accepts any array and rejects the old `record.inventory.length` condition. Existing inventory empty-snapshot and central empty-cache regressions remain mandatory so authoritative empty state is preserved end-to-end for both branch and central inventory.

Targeted validation must also keep inventory history-limit, sync-serialization and read-after-write cache regressions green before the full PR gate runs.
