# Kitchen OS Verification Matrix

Version: 1.0  
Purpose: minimum evidence expected before an engineering task can be marked DONE.

Status vocabulary used by Super Admin:

- `REQUIRED`: this check applies to the current change.
- `COVERED`: an existing regression exercises this behavior.
- `PARTIAL`: some paths are covered; a changed uncovered path needs a new targeted assertion.
- `PASS/FAIL/PENDING`: live exact-head workflow state.
- `N/A`: demonstrably not applicable.

| Verification area | Current repository evidence | Default coverage | Required when |
| --- | --- | --- | --- |
| Static/source contract | static regressions in Deploy workflow | COVERED | every code change |
| PostgreSQL/API | isolated regression DB + API regression | COVERED | API/data/runtime changes |
| Buttons/tabs/forms | `tests/browser-regression.mjs`, Super Admin browser regression | PARTIAL | any touched interactive surface |
| Lists/filter/sort/pagination | module-specific browser/API assertions | PARTIAL | touched list/search UI |
| Unexpected full reload | Inventory warehouse switch assertion uses navigation-entry count | PARTIAL | SPA navigation/state interactions |
| Page crash / uncaught JS | browser + Super Admin `pageerror` collection | COVERED | every browser change |
| Same-origin API failures | browser diagnostics reject same-origin API 5xx/request failures; only expected teardown abort of `/api/inventory/events` SSE is exempt + explicit mutation assertions | COVERED | every changed API-driven interaction |
| Console error monitoring | not globally enforced on every browser surface | PARTIAL | add targeted guard when relevant |
| Persistence / F5 | Super Admin RBAC and master-data reload checks; DB round-trip tests | PARTIAL | every persisted mutation |
| Cross-view synchronization | Inventory/master-data realtime and peer-browser tests | PARTIAL | entity visible on multiple surfaces |
| RBAC positive/negative | API role regressions + Super Admin account tests | PARTIAL | permission/site-scoped change |
| Responsive/overflow | Desktop/mobile Chromium + overflow assertions | COVERED | UI changes |
| Cross-browser/full-device | full-device regression | COVERED | runtime/UI changes before merge |
| Production release/schema | deploy workflow health check | COVERED | runtime deploy |
| Data integrity | `DATA_INTEGRITY_OK` | COVERED | runtime deploy |
| Finance goals ↔ debt funds ↔ monthly/yearly planned cashflow | `vps/backend/scripts/finance-api-regression.mjs`, `tests/personal-finance-browser-regression.mjs`, migration 003 | REQUIRED | Goal allocation create/edit, no invented commitment, zero double-count, owner-only upsert, same data on both tabs/F5, annual carryover, no wallet effects |
| Finance rolling forward liquidity advisor | `tests/finance-advisor-engine-regression.mjs`, `vps/backend/scripts/finance-api-regression.mjs`, `tests/personal-finance-browser-regression.mjs` | REQUIRED | 30/60/90d chronological schedule, BigInt TWD accuracy, posted actual debt deducted, non-TWD excluded, overdue/estimated warnings, buffer shortfall suggestions, owner-only 401/403, 320/390/1440 UI |
| Finance planning & debt-fund actual repayment | migration 002, finance API regression + browser `tests/personal-finance-browser-regression.mjs` | REQUIRED | planned/posted cash flow, monthly/year projections, debt reserve vs actual wallet payment, duplicate, unauthorized access, F5 and mobile overflow |
| Personal Finance OS owner-scoped planning and ledger | `vps/backend/scripts/finance-api-regression.mjs`, `tests/personal-finance-browser-regression.mjs` | COVERED | owner-only goal/debt/FX plan mutations, retry/F5, simultaneous opposite transfer, or Finance UI changes |
| Production UI smoke | deploy workflow production smoke | COVERED | runtime deploy |
| Module production audit | Inventory/workforce production workflows where available | COVERED where defined | touched audited module |

## Mandatory interaction assertion pattern

For a changed interactive feature, tests should prove:

`locate -> visible/enabled -> interact -> expected UI -> expected API -> persisted state -> reload -> expected persisted UI`

Use only the applicable parts for read-only actions.

## Reload rule

SPA actions must not trigger a full document reload unless the product explicitly requires navigation/reload. A changed SPA state action should preserve the current application shell and route state.

## Network/error rule

For a changed path:

- unexpected same-origin API 5xx is a failure;
- failed mutation requests are a failure;
- uncaught browser `pageerror` is a failure;
- console errors should be captured for the changed path when they can indicate functional failure.

## Definition-of-Done matrix

A runtime feature is DONE only if:

- targeted regression: PASS;
- exact-head mandatory CI: PASS;
- merge SHA contains tested head: PASS;
- deploy exact merge SHA: PASS;
- release/schema check: PASS;
- data integrity: PASS;
- production UI smoke: PASS;
- module production audit: PASS when available;
- handoff/evidence updated: PASS.
