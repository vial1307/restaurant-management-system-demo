# SDD Delta — Lazy Derived Render Context

Date: 2026-09-06
Status: specification / acceptance design
Priority: P1 render performance

## Problem

`currentContext()` currently computes every derived render value before the active route or shell section asks for it. Every authorized render therefore calculates reservations, rice, generated tasks, completion progress, reserve inventory summary, inventory alerts and shift capacity even on routes that do not consume most of those values.

The stable-shell phase reduces DOM replacement but intentionally keeps the existing template API. It does not remove this eager calculation cost.

## Goal

Keep the existing `context.<field>` API and all visible/business results unchanged while evaluating derived fields only when a shell/page actually reads them. A derived field must be memoized for the lifetime of one render context so repeated reads do not recalculate it.

## Scope

Base/eager fields remain immediately available:
- `state`
- `record`
- `language`
- `text`

Derived fields become lazy and memoized:
- `reservations`
- `rice`
- `tasks`
- `progress`
- `reserves`
- `alerts`
- `workAlerts`
- `reserveAlerts`
- `capacity`

Dependencies must remain semantically identical:
- `progress` reads the same `tasks` value and `record.completedTasks`.
- `workAlerts` and `reserveAlerts` derive from the same memoized `alerts` value.
- all calculators receive the same state/date/settings/record inputs as before.

## Required behavior

1. Creating a render context must not execute any derived factory by itself.
2. Reading one derived property executes only that property and its actual dependencies.
3. Re-reading a derived property in the same context returns the same resolved value without re-running its factory.
4. Reading `progress` may resolve `tasks`, but must not resolve unrelated reservations/rice/alerts/reserves/capacity.
5. Reading `workAlerts` or `reserveAlerts` may resolve `alerts`, but must not resolve unrelated derived fields.
6. Derived properties remain enumerable so existing object inspection/serialization semantics are not silently hidden.
7. A factory that throws must not be marked successfully resolved; a later read may retry it.
8. Existing page/shell code continues using `context.<field>` without route-specific rewrites.
9. Dashboard and every existing route must render the same business values and permissions as before.
10. No store mutation, persistence, revision, database, API, auth, permission or inventory transaction semantics change.

## Acceptance tests before implementation

A pure runtime regression for the lazy-property helper must prove:
- zero factory calls at construction;
- dependency-only resolution;
- exactly-once memoization after successful resolution;
- unrelated factories remain untouched;
- enumeration includes lazy keys;
- thrown factories are retryable rather than cached as success.

A static app contract regression must prove:
- `currentContext()` keeps the four eager base fields;
- all nine existing derived fields are registered lazily;
- the dependency relationships for `progress`, `workAlerts` and `reserveAlerts` use the same lazy context;
- the old unconditional eager derived calculation block is absent.

Existing browser/full-device suites remain authoritative for visible and cross-browser parity.

## Performance expectation

On routes that only need base fields plus sidebar `progress`, unrelated reservations/rice/reserve-summary/alert/capacity calculations must no longer run. `tasks/progress` are intentionally still required by the current global sidebar and are out of scope for elimination in this slice.

## Out of scope

- changing calculation formulas;
- caching derived values across different store snapshots/renders;
- route-specific context shapes;
- sidebar progress caching;
- page component redesign;
- database/API/schema changes;
- production load/stress testing.

## Rollback

Remove the lazy helper/import and restore the existing eager assignments inside `currentContext()`. No data migration or server rollback is required.
