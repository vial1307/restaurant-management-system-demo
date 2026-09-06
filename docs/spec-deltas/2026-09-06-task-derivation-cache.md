# SDD Delta — Task Derivation Cache

Date: 2026-09-06
Status: specification / acceptance design
Priority: P1 render performance
Base production: `ade41eda377c5e96b7415bea3be5246b6fa0c1a2`

## Problem

The lazy render-context phase defers expensive derived calculations until read, but `.sidebar` reads `progress` on every authorized render. `progress` depends on `tasks`, so `buildGeneratedTasks()` still runs on every render, including unrelated UI/store changes such as attendance, schedule, modal state, route-local interactions and other operations that do not affect preparation tasks.

`store-core.js` mutates state in place, so cross-render memoization by object identity is unsafe. `record.updatedAt` also changes on every `store.update()` and therefore cannot distinguish task-affecting from unrelated mutations.

## Goal

Reuse generated task/progress derivation across renders only while the exact task dependencies remain semantically unchanged, without changing store mutation semantics, task output, completion semantics, permissions, persistence, API or database behavior.

## Cache model

Use a single-entry dependency-fingerprint cache.

Task fingerprint includes only values that can affect the current task list:
- selected service `date`;
- `record.reservation`;
- `record.riceRemaining`;
- `record.inventory`;
- `record.workInventory`;
- `record.customTasks`;
- `settings.reservationBuffer`;
- `settings.riceWeekday`;
- `settings.riceWeekend`;
- `settings.riceSkipAbove`;
- `settings.checklist`.

Completion/progress fingerprint additionally includes the truthy completed-task IDs from `record.completedTasks` in deterministic order.

The fingerprint must deliberately exclude unrelated state such as attendance, schedules, SOP, skills, jobs, payroll, audit, active staff and `record.updatedAt`.

## Required behavior

1. First `tasks(state,date)` call derives the exact existing task array:
   `buildGeneratedTasks(state,date) + record.customTasks`.
2. Repeated reads with an unchanged task fingerprint return the cached task array and do not call the task factory again.
3. In-place mutation of unrelated state (for example attendance/schedule/audit) does not invalidate the task cache.
4. Any change to a listed task dependency invalidates the task cache and derives again.
5. Changing date invalidates the task cache.
6. `progress(state,date)` reuses cached tasks and computes the exact existing `completionSummary(tasks, completedTasks)` result.
7. A completed-task change invalidates progress but does not invalidate tasks.
8. A task-fingerprint change invalidates both tasks and progress.
9. Failed task/progress factories are never committed as successful cache entries; a later read may retry.
10. Cache storage is one-entry only and must not grow by route/date/user history.
11. Cache output must not depend on object identity; state is mutated in place by the existing store.
12. No business/store/API/database/auth/permission/inventory mutation semantics change.

## Acceptance tests before implementation

Pure regression must verify:
- first task read calls the task factory once;
- second read without changes reuses the same task reference;
- in-place attendance/schedule/audit mutations do not call task factory again;
- completed-task mutation recomputes progress only;
- reservation/rice/inventory/workInventory/customTasks/checklist/date mutations each invalidate tasks;
- task invalidation also invalidates progress;
- task-factory throw does not poison the cache;
- progress-factory throw does not poison the progress cache;
- `clear()` forces recomputation;
- cache remains a single-entry implementation.

Static app contract must verify:
- `app.js` creates one task derivation cache outside `currentContext()`;
- `currentContext().tasks` reads through the cache;
- `currentContext().progress` reads through the cache;
- direct per-render composition `buildGeneratedTasks(...) + record.customTasks` is removed from the context getter;
- no store update semantics are modified in this slice.

Existing full preflight, API/Postgres concurrency, Chromium, recovery/persistence, Firefox/WebKit full-device, exact-SHA deploy and production smoke gates remain required.

## Out of scope

- changing sidebar UX or removing its progress summary;
- changing task-generation rules;
- immutable-store migration;
- database/schema/API changes;
- long-lived multi-entry memoization;
- production load/stress tests.

## Rollback

Remove the task cache import/instance and restore the prior lazy getters:
- `tasks: () => [...buildGeneratedTasks(state, date), ...record.customTasks]`
- `progress: () => completionSummary(context.tasks, record.completedTasks)`

No migration or data rollback is required.
