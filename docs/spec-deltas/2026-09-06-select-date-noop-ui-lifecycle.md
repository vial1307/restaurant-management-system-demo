# Same-date select no-op + UI lifecycle — SDD delta

## Baseline
Production `bb034dcc7866fe339efc535c0b3df56406863aed` already suppresses normalized no-op scalar setters for settings, reservations, rice, procurement and inventory/work items. It intentionally leaves `selectDate()` on the legacy persist/notify path because an earlier Chromium regression exposed a view-lifecycle dependency.

## Problem
Selecting the already-active service date does not change persisted business state, yet `store.selectDate()` still enters generic `update()`, bumping `updatedAt`, incrementing offline `pendingSync`, serializing localStorage and notifying all subscribers solely so view-only state such as `view.calendarOpen = false` becomes visible.

That couples a UI lifecycle transition to a fake persisted mutation and keeps avoidable I/O/render/autosave work on a common calendar/inventory interaction.

## Design
1. `store.selectDate(date)` returns current state immediately when `state.selectedDate === date`.
2. Same-date selection performs zero persistence, subscriber notification, timestamp update and pending-sync increment.
3. `selectServiceDate(date)` captures whether the date was already active before calling the store.
4. For same-date selection only, `selectServiceDate()` explicitly calls `renderWhenAuthorized()` after `store.selectDate(date)` so the caller's prior view mutation (for example closing the calendar) is rendered deterministically.
5. Real date changes remain on the normal store update/subscriber render lifecycle and do not receive an extra explicit render.
6. Existing inventory-today cloud synchronization behavior remains unchanged.

## Acceptance
- Repeating `store.selectDate(currentDate)` causes zero additional storage writes and zero subscriber notifications.
- Same-date selection leaves selected date, `updatedAt` and offline `pendingSync` unchanged.
- `selectServiceDate()` detects same-date before calling the store, calls `store.selectDate(date)`, then has exactly one conditional explicit `renderWhenAuthorized()` path.
- Selecting today from an open calendar closes the popover immediately even though the store write is suppressed.
- Admin Central → Fuxing warehouse switching remains clickable; no stale calendar/topbar overlay intercepts pointer events.
- Real date changes continue to render through the store subscriber path without duplicate explicit rendering.
- Existing scalar no-op behavior, prepared inventory search, business persistence/concurrency and permissions remain unchanged.
- Full preflight, API/Postgres, Chromium desktop/mobile, recovery/persistence and Firefox/WebKit must pass before merge.
- Production requires exact-SHA deploy health and UI smoke.

## Non-goals
- No change to generic `update()`.
- No additional scalar no-op scope.
- No changes to database/API/auth/inventory mutation semantics.
- No debounce or delayed render.
