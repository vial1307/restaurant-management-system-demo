# Store scalar no-op suppression v2 — SDD delta

## Problem
Several scalar setters route through the generic store `update()` even when the incoming value normalizes to the value already stored. That creates unnecessary localStorage writes, subscriber notifications, `updatedAt` changes, business dirty evaluation and offline `pendingSync` increments.

The first optimization attempt incorrectly included `selectDate`. Browser regression proved that same-date selection still participates in the current UI lifecycle: calendar handlers set view-only state and rely on the normal store notification/render path to materialize that state. Suppressing same-date `selectDate` left the calendar overlay open and blocked later warehouse interaction.

## Scope
No-op suppression is limited to these eight scalar setters:
- `updateSetting`
- `updateReservation`
- `updateRemaining`
- `updateRice`
- `updateProcurementLine`
- `updateProcurementOrderDate`
- `updateItem`
- `updateWorkItem`

`selectDate` is explicitly excluded and must retain its existing update/persist/notify lifecycle even when the requested date equals the active date.

## Design
1. Normalize input exactly as the existing setter does, then compare before entering generic `update()`.
2. For the eight in-scope setters, an exact normalized no-op returns current state without persistence, notification, timestamp bump or offline pending-sync increment.
3. Missing inventory/work targets are no-ops.
4. An absent procurement bucket key must still materialize even when its normalized value is numeric zero.
5. Invalid procurement order dates remain no-ops.
6. Propagated catalog fields (`workArea`, `label`, `labelVi`, `unit`) may skip only when every linked copy already matches; inconsistent linked rows must still be repaired.
7. `updateWorkItem(workArea)` may skip only when linked storage sources already match.
8. Do not add generic deep equality inside `update()` and do not change action/audit/restock semantics.
9. Do not add explicit app-level render compensation for same-date selection; preserve the production lifecycle instead.

## Acceptance
- A real scalar change persists exactly once and notifies once.
- Repeating the same normalized value for the eight in-scope setters causes zero additional writes/notifications and leaves `updatedAt`/`pendingSync` unchanged.
- Same-date `selectDate` still persists once and notifies once; this is a lifecycle requirement, not an optimization target.
- Numeric strings matching stored numeric values are no-ops for in-scope setters.
- Absent zero-valued procurement keys still materialize.
- Invalid procurement order date and missing inventory/work IDs do not persist or notify.
- Linked-copy repair remains functional even when the primary row already contains the requested value.
- Existing Chromium calendar → warehouse interaction must pass without force-click or browser-test relaxation.
- PR CI must pass preflight, API/Postgres, Chromium desktop/mobile, recovery/persistence and Firefox/WebKit; feature-branch deploy/smoke remain skipped.
- Production requires exact-SHA deploy health and production UI smoke.

## Non-goals
- No `selectDate` suppression.
- No view lifecycle refactor.
- No generic deep comparison.
- No API/database/auth/business concurrency change.
