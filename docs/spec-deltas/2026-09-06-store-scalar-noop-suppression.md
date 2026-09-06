# Store scalar no-op suppression — SDD delta

## Problem
`store-core.js` routes scalar setters through `update(mutator)`. `update()` always bumps the selected record `updatedAt`, increments offline `pendingSync`, serializes the whole state to localStorage, and notifies subscribers. Today those side effects also happen when a setter receives a value that normalizes to the value already stored, or when a targeted item does not exist.

This creates avoidable localStorage I/O, render scheduling, business-state dirty evaluation/autosave work, and offline pending-sync inflation.

A browser regression also exposed a separate architectural coupling: calendar view state was relying on a same-date `store.selectDate()` write/notification to close the popover. View-only state must not require a fake persisted store mutation.

## Scope
Suppress exact scalar no-op calls before they enter `update()` for:
- `selectDate` when the selected service date is already active
- `updateSetting`
- `updateReservation`
- `updateRemaining`
- `updateRice`
- `updateProcurementLine`
- `updateProcurementOrderDate`
- `updateItem`
- `updateWorkItem`

No generic deep comparison is added to `update()`. No action/audit mutation (`toggleTask`, restock, SOP, skills, attendance, etc.) changes in this slice.

## Design
1. Normalize the incoming scalar exactly as the existing setter already does.
2. Compare the normalized value with the current authoritative in-memory value before calling `update()`.
3. If no state shape/value change is required, return the current state immediately. Do not persist, notify, bump `updatedAt`, or increment `pendingSync`.
4. Missing item/work-item targets are no-ops and must not enter `update()`.
5. Same-date `selectDate(date)` is a store no-op. `selectServiceDate(date)` owns the view lifecycle: when the requested date is already active, it must explicitly call the authorized renderer after setting `view.calendarOpen = false` instead of relying on a store notification.
6. A real date change keeps the existing store update/subscriber lifecycle; the explicit same-date render must not run for a changed date.
7. `updateProcurementLine` must still materialize an absent bucket key even when the normalized value is `0`; only an existing key with the same normalized value is a no-op.
8. For `updateItem` propagated catalog fields (`workArea`, `label`, `labelVi`, `unit`), skip only when the primary item and every linked inventory/work row already contain the normalized target value. This preserves the setter's ability to repair inconsistent linked copies.
9. For `updateWorkItem(workArea)`, skip only when the work item and all linked storage sources already have that value.

## Acceptance
- A real scalar change persists once and notifies subscribers once.
- Repeating the same normalized value for in-scope setters causes zero additional localStorage writes and zero additional subscriber notifications.
- A scalar no-op leaves `record.updatedAt` unchanged.
- While offline, a scalar no-op does not increment `operations.pendingSync`.
- Selecting the already-active service date causes zero store writes/notifications/pendingSync increments.
- `selectServiceDate()` explicitly renders view-only state for a same-date selection so the calendar closes immediately without a store notification.
- A different service date still uses the normal store update/subscriber render path.
- Numeric strings that normalize to the current number are treated as no-ops.
- Invalid procurement order dates and missing item/work-item IDs do not persist or notify.
- Existing linked-value propagation remains intact when linked copies are inconsistent.
- Chromium warehouse switching must remain clickable after selecting today; no stale calendar/topbar may intercept pointer events.
- PR CI must test the merge candidate against the current `main`, including the already-deployed render-time empty-search bypass; passing only the feature-branch files in isolation is insufficient.
- Existing full static/runtime, API/Postgres, Chromium mobile/desktop and Firefox/WebKit regressions remain mandatory before merge. Production still requires exact-SHA deploy health and UI smoke.

## Regression correction
The first browser failure showed that suppressing same-date selection without moving the view lifecycle left `view.calendarOpen = false` unrendered. A first correction kept the same-date store write solely to obtain a subscriber notification, but Chromium still exposed the coupling around Central/branch switching. The final contract separates concerns: same-date selection is a true store no-op, while the app explicitly renders the view-only calendar close. This removes persisted churn and makes the UI lifecycle deterministic.

## Merge-candidate rerun
The scalar no-op subset excluding `selectDate` is already production-certified at `bb034dcc7866fe339efc535c0b3df56406863aed`. This follow-up must therefore be tested as a merge candidate on top of that exact behavior, with the additional same-date store no-op and explicit app-level view render. The previously failing calendar → Fuxing warehouse click is a mandatory Chromium acceptance path before this follow-up can merge.

## Non-goals
- No deep equality check inside generic `update()`.
- No change to audit/action semantics.
- No change to PostgreSQL module concurrency or inventory API semantics.
- No debounce or delayed rendering.
