# Repository authority cleanup

Date: 2026-09-08
Base release: `219cbc05dfc298c30332ac7ecb2744320d3b6a44`

## Decision

`restaurant-management-system-demo` is the sole production source for Kitchen OS. The retired `restaurant-management-system` repository must not be used as an automated source of code changes.

## Changes

- remove `.github/workflows/port-system-recent-fixes.yml`;
- remove `scripts/port-system-recent-fixes.py`;
- remove `scripts/port-system-recent-fixes-v2.py`;
- keep `tests/system-port-regression.mjs` as regression coverage only; it does not perform cross-repository writes.

## Safety

This cleanup does not change application runtime, database schema, VPS configuration, permissions, inventory behavior, or business persistence. Normal preflight, API/PostgreSQL, desktop/mobile, cross-browser, deploy, health/release, and production UI smoke gates remain authoritative.
