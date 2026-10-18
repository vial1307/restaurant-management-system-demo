# Finance OS — Responsive spreadsheet parity with Super Admin
Date: 2026-10-19
Reference: `/.admindev.html#development`, `docs/DEVELOPMENT_RULES.md`, `docs/FRONTEND_DATA_RULES.md`
PR: #273 (exact release SHA must be verified after CI and VPS deploy)

## Goals / invariants

- Finance plan works through one responsive DOM on PC, laptop, tablets, and phone; **no separate hard-coded mobile business data**.
- Desktop remains dense editable spreadsheet with clear focus, readable labels and selected/deleted/unallocated states.
- Mobile 320–760px uses full-width editable **cards** instead of horizontal 900px scroll. All fields and Add, Save, Cancel, Delete, Copy, Paste, Select All, Filter and Sort remain reachable.
- Mobile action tap targets at least 44px. Inputs use 16px text to avoid unexpected iOS zoom.
- Layout breakpoints: 320, 360, 390, 430, 600, 760, 1024 and 1440px; phone landscape 740×390.
- Common top bar, six navigation tabs, account settings, month selection and logout must remain reachable at phone widths.
- No frontend-only persisted financial state. All changes continue through owner-scoped finance batch API and PostgreSQL. Optimistic concurrency, all-or-nothing transactions, audit, ledger immutability and reload synchronization remain mandatory.
- Unallocated debt/goal master rows stay **reference only**: checkbox disabled; cannot be bulk-deleted. Master record can only be edited via its dedicated workflow. Missing allocation is distinct from missing FX. VND principal must not show spurious trailing decimals.
- Financial data should never be substituted with demo/hard-coded amounts in production.

## Implementation

- `src/finance-plan-sheet.js`: field data labels for both existing and new rows; selection summary and synchronized mobile/desktop select-all; preserves the same source row keys and API calls.
- `src/personal-finance.css`: Finance-only Super Admin-style spacing, focus/control semantics, responsive forms/cards, 44px touch targets, mobile six-tab navigation and a wrap-safe month toolbar.
- `tests/personal-finance-browser-regression.mjs`: geometry, label, action visibility, selection and mobile 44px invariant assertions for each breakpoint, plus existing owner-only add/edit/delete/paste/F5/ledger checks.

## Explicit limits

- UI follows the Super Admin **responsive/component interaction rules**; Finance retains its blue brand and its current Vietnamese copy. This change does not install a parallel Bootstrap/CDN runtime or replace the Finance product language system.
- An unallocated creditor is not an editable monthly fund. Creating a fund requires explicit user action.
- The spreadsheet remains a bounded typed editor; formulas, multiuser coediting, and real Google Sheets synchronization are not included.
- Browser test accounts use isolated mocks. Production smoke may verify public assets and authentication boundaries, not the owner's private financial amounts without an authorized session.

## Release acceptance

PASS requirements: Finance UI regression, Finance DB regression, staging, full Kitchen regression on exact candidate SHA, merged-main gated VPS deploy, Finance asset and authenticated-boundary smoke, and five read-only Kitchen inventory/workforce audits.
