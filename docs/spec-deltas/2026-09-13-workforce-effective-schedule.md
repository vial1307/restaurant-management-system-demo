# Workforce effective schedule resolution

## Problem
Approved leave and shift-change requests are stored as server-owned `schedule.exceptions`, but schedule capacity currently evaluates only base `schedule.schedules`. A manager can therefore approve leave while the schedule page still counts that employee as available, or approve a shift override while the page still shows the old effective time.

## Scope
This slice makes schedule capacity and the rendered scheduled-person list use the effective schedule derived from base assignments plus approved exceptions.

It does not change payroll formulas, leave pay semantics, request approval rules, shift taxonomy, or previously stored base assignments. No SQL/schema migration is required.

## Effective resolution
For one date and selected shift:

1. Resolve base day/month assignments exactly as today.
2. Find an approved server-owned exception for the same staff/date.
3. A `leave` exception removes that staff assignment from the effective schedule for that date.
4. An `override` exception preserves assignment identity, department, area and shift, but uses the approved exception `start` / `end` as effective times.
5. With no matching exception, the base assignment is returned unchanged.
6. Resolution is pure: the stored base schedule and exception arrays are never mutated.

The backend request workflow already enforces at most one approved exception per staff/date. If legacy/invalid duplicate exceptions are present, effective resolution must fail closed for that staff/date by leaving the base assignment unchanged rather than selecting an arbitrary exception.

## Runtime state
`business_state.modules.schedule.exceptions` remains server-owned and must not be sent back by generic schedule saves.

Authorized business-state hydration may mirror the already-scoped remote exceptions into read-only local runtime state as `operations.scheduleExceptions` so synchronous schedule/capacity rendering can use them. Employee/part-time users still receive only their own scoped exceptions from the existing backend privacy policy.

## Capacity integration
- `assessShiftCapacity()` must use effective assignments.
- Configurable schedule-rule capacity must use the same effective assignments.
- The scheduled-person list must therefore exclude approved leave and show override times immediately after synchronized state is applied.
- Existing callers that explicitly need raw/base assignments keep a base-schedule helper and are not silently changed.

## Persistence boundary
Generic outbound business-state serialization continues to send only editable base `schedule.schedules`. It must not serialize `scheduleExceptions`, `requests`, `exceptions` or schedule rules.

## Synchronization
After the request UI refreshes schedule state following approve/reject/cancel/create, it must make the newly authorized schedule module available to the main store in the same session so the capacity/person list does not require a page reload.

## Regression contract
Tests must prove:
- base schedule resolution remains unchanged;
- approved leave removes the employee from effective entries and can change capacity to overloaded;
- approved override changes effective start/end without mutating the base assignment;
- duplicate legacy exceptions do not select an arbitrary result;
- remote scoped exceptions hydrate into read-only runtime state;
- generic outbound schedule save does not include exceptions;
- configurable schedule-rule capacity uses effective entries;
- request approval followed by schedule refresh updates desktop/mobile capacity without reload;
- existing attendance correction, payroll history, schedule-rule, load and full release gates remain green.
