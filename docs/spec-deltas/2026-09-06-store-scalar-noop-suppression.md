# Store scalar no-op suppression — SDD delta

## Problem
`store-core.js` routes scalar setters through `update(mutator)`. `update()` always bumps the selected record `updatedAt`, increments offline `pendingSync`, serializes the whole state to localStorage, and notifies subscribers. Today those side effects also happen when a setter receives a value that normalizes to the value already stored, or when a targeted item does not exist.

This creates avoidable localStorage I/O, render scheduling, business-state dirty evaluation/autosave work, and offline pending-sync inflation.

## Scope
Suppress exact scalar no-op calls before they enter `update()` for:
- `updateSetting`
- `updateReservation`
- `updateRemaining`
- `updateRice`
- `updateProcurementLine`
- `updateProcurementOrderDate`
- `updateItem`
- `updateWorkItem`

`selectDate` is explicitly excluded. Existing UI callers can mutate view-only state such as `view.calendarOpen = false` immediately before calling `store.selectDate()`, and they rely on the store subscriber notification to render that view-state change even when the selected service date itself is unchanged.

No generic deep comparison is added to `update()`. No action/audit mutation (`toggleTask`, restock, SOP, skills, attendance, etc.) changes in this slice.

## Design
1. Normalize the incoming scalar exactly as the existing setter already does.
2. Compare the normalized value with the current authoritative in-memory value before calling `update()`.
3. If no state shape/value change is required, return the current state immediately. Do not persist, notify, bump `updatedAt`, or increment `pendingSync`.
4. Missing item/work-item targets are no-ops and must not enter `update()`.
5. `selectDate` retains the existing update/notify lifecycle, including selecting the already-active date, because subscriber rendering is part of its UI contract.
6. `updateProcurementLine` must still materialize an absent bucket key even when the normalized value is `0`; only an existing key with the same normalized value is a no-op.
7. For `updateItem` propagated catalog fields (`workArea`, `label`, `labelVi`, `unit`), skip only when the primary item and every linked inventory/work row already contain the normalized target value. This preserves the setter's ability to repair inconsistent linked copies.
8. For `updateWorkItem(workArea)`, skip only when the work item and all linked storage sources already have that value.

## Acceptance
- A real scalar change persists once and notifies subscribers once.
- Repeating the same normalized value for in-scope setters causes zero additional localStorage writes and zero additional subscriber notifications.
- A scalar no-op leaves `record.updatedAt` unchanged.
- While offline, a scalar no-op does not increment `operations.pendingSync`.
- Numeric strings that normalize to the current number are treated as no-ops.
- Invalid procurement order dates and missing item/work-item IDs do not persist or notify.
- Existing linked-value propagation remains intact when linked copies are inconsistent.
- Selecting the already-active date must continue the existing persistence/subscriber lifecycle so view-only calendar state is rendered closed; the Chromium warehouse-switch flow must remain clickable after same-date selection.
- Existing full static/runtime, API/Postgres, Chromium mobile/desktop and Firefox/WebKit regressions remain mandatory before merge. Production still requires exact-SHA deploy health and UI smoke.

## Regression correction
The first PR browser run exposed a lifecycle dependency that the scalar-only test did not model. Suppressing a same-date `selectDate()` call left `view.calendarOpen = false` unrendered; the stale calendar/topbar then intercepted pointer events on `[data-warehouse="fuxing"]` in the admin desktop Chromium flow. `selectDate` is therefore excluded from scalar no-op suppression and remains a subscriber-render lifecycle boundary. The corrected runtime contract now requires a same-date selection to retain its existing write/notification lifecycle, and the browser regression remains the end-to-end acceptance for this dependency.

## Non-goals
- No deep equality check inside generic `update()`.
- No suppression of `selectDate` lifecycle notifications in this slice.
- No change to audit/action semantics.
- No change to PostgreSQL module concurrency or inventory API semantics.
- No debounce or delayed rendering.
