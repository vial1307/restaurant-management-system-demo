# SDD Delta — Inventory hydration authority

Date: 2026-09-09
Base production: `00b9679e8fc94dc217a7e8c9ba4109f062e6a65b`
Priority: P1 inventory consistency

## Problem

`hydrateState()` runs whenever the application store is recreated. It currently performs legacy inventory migrations that add selected `DEFAULT_ITEMS`, rewrite specific minimum/unit values, and derive missing work rows even when the persisted arrays came from an authoritative VPS inventory snapshot.

This means an archived catalog item or intentionally removed work location can disappear after VPS sync but reappear locally after reload. A subsequent catalog save can then send that resurrected local configuration back to PostgreSQL.

## Required behavior

- hydration may normalize identity/presentation fields on inventory rows that already exist;
- hydration must not insert catalog items into an explicit `record.inventory` array;
- hydration must not rewrite authoritative quantity/minimum/unit/work-area business values using legacy hard-coded migrations;
- an explicit `record.workInventory` array, including `[]`, is authoritative and must not be auto-filled with derived work rows;
- when `workInventory` is missing or malformed/non-array, deriving it from existing inventory remains a compatibility fallback;
- a brand-new state may still use `createDefaultState()` and `DEFAULT_ITEMS` bootstrap data;
- no PostgreSQL schema, API route, archive permission, transfer, receiving-default or UI-copy changes.

## Acceptance

A runtime regression must prove that hydration preserves a partial authoritative inventory array without adding defaults, preserves legacy-looking minimum/unit values exactly, preserves an explicit empty work array, and still derives work inventory only when the work array is absent/malformed. The regression must run in normal preflight with the existing empty-snapshot, central-empty-cache and branch-empty-catalog authority guards.
