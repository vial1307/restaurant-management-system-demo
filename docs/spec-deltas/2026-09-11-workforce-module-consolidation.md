# Workforce module consolidation — 2026-09-11

## User decision

The generic success flash for pure UI controls is removed. Result notifications remain only for actions whose data write must be confirmed.

Attendance, work schedule and salary calculation are presented as one top-level workforce area with three internal views: attendance, schedule and payroll.

## Permission contract

- Settings shows one merged workforce permission row: `Chấm công · Lịch làm · Lương / 出勤 · 排班 · 薪資`.
- The existing `attendance` and `schedule` permission keys remain in storage/API for backward compatibility and to avoid a production permission migration.
- The top-level workforce entry is available when either legacy `attendance.view` or `schedule.view` is granted, so an existing schedule-only account cannot lose access during the UI consolidation.
- Internal tabs remain permission-aware: attendance and payroll require `attendance.view`; schedule requires `schedule.view`.
- `attendance.edit` has two different scopes depending on account role and MUST be enforced by the VPS, not inferred from hidden UI:
  - `admin` and `manager` may correct attendance records when `attendance.edit` is granted. `supervisor` remains non-management for workforce correction under the current approved role matrix.
  - `employee` and `parttime` use `attendance.edit` only for self-service clock-in/clock-out. It never grants branch-wide attendance replacement, payroll-policy editing, hourly-rate editing, or correction of completed attendance records.
- `schedule.edit` is an admin/manager capability. `employee`, `parttime`, and `supervisor` never receive schedule mutation authority through the workforce compatibility layer under the current role matrix.
- Unauthorized management controls must be actively hidden and disabled after every auth/render reconciliation; previously visible controls must not remain actionable after a role or permission change.
- Frontend visibility is not authorization. The VPS applies the same site, role, module and workforce record-scope rules to every read and write.
- On every authorization-changing transition (account/site/role/permission), any unsaved old-scope edits are captured to the existing recovery draft first, then the old local business snapshot is cleared before the new VPS-authorized modules are rendered. A lower-privilege account must never inherit an omitted module from a previous higher-privilege local session.

## Workforce record-scope contract

- For `employee` and `parttime`, attendance reads return only that employee's attendance rows and schedule reads return only that employee's schedule rows.
- The self employee is resolved from the server-controlled shared staff roster by a unique explicit account binding when available, otherwise by a unique exact account/display-name match. If identity cannot be resolved unambiguously, self-service attendance mutation is denied instead of widening access.
- The scoped VPS response includes the authenticated `activeStaffId`; after hydration the client selects that staff record instead of retaining a device-local manager/employee selection from a previous session.
- Shared staff data may still contain coworkers required for UI compatibility, but coworker `hourlyRate` values are removed from employee/part-time responses.
- Employee/part-time attendance writes are merged into the server's existing attendance module; they must never replace or delete coworkers' rows.
- A self-service clock-in may create only one new open row for the resolved employee. Server-controlled staff name, area and hourly rate are canonicalized from the staff roster.
- When clock-in is linked to a schedule, an explicit day schedule takes precedence. If no day schedule exists, a unique recurring monthly schedule matching the date's weekday supplies `scheduledStart`. Ambiguous multiple matching schedules fail closed by leaving `scheduledStart` unset rather than guessing.
- A self-service clock-out may only transition that employee's existing open row from `clockOut = null` to a clock-out timestamp. Other fields of the existing row are immutable through self-service.
- Completed attendance rows, payroll policy, coworker rows, hourly rate, clock-in time, scheduled start and break minutes cannot be corrected by employee/part-time self-service; those corrections require authorized management access.
- Conflict responses are scoped with the same read rules, so an employee/part-time account cannot receive coworkers' attendance or schedule data through an optimistic-concurrency conflict payload.

## Workforce UI contract

- Top-level navigation displays one visible workforce entry; the separate Schedule navigation entry does not occupy visual or interactive navigation space.
- The authorized legacy `#schedule` route remains present for compatibility/certification and remains functional as the Schedule tab so old links and existing app handlers do not break.
- The Salary tab provides month-level totals derived from the canonical attendance wage calculator: completed shifts, worked hours, gross pay, deductions and temporary net pay.
- Payroll UI aggregates the attendance rows already authorized and scoped by the VPS for the selected month. It must not re-filter authorization using device-local `activeStaffId`, because that identifier can be stale across account or permission transitions.
- Admin/manager attendance view exposes a correction editor for actual clock-in, actual clock-out, break minutes, scheduled start, hourly rate and note only when the authenticated account also has attendance edit authority.
- A corrected clock-out cannot precede clock-in.
- Manager time corrections are written to the existing `attendance` business-state module with an expected module revision and are only reported successful after VPS confirmation.

## Payroll calculation contract

- The current canonical wage calculation remains attendance-driven: completed worked minutes after unpaid break × hourly rate, then configured late deduction, producing gross, deduction and temporary net pay.
- Incomplete clock records contribute no payable completed-shift amount until clock-out exists.
- Hourly rate used for employee/part-time self-service is server-canonicalized from the staff roster; client-side manipulation must not change another employee's wage basis.
- `scheduledStart` used for late calculation must come from the server-resolved day/recurring schedule when a unique applicable schedule exists, not from employee-supplied clock-in payload data.
- Payroll results remain estimates until management has corrected exceptional attendance data. Overtime, statutory holiday multipliers, bonuses, insurance/tax deductions and monthly payroll locking are not silently invented by this change; they require an explicit business rule before becoming payroll logic.

## Data contract

- No PostgreSQL schema migration is required for this hardening stage; the existing shared staff roster is the server-side identity source for legacy accounts.
- Existing `attendance`, `payroll` and `schedule` business-state payload shapes remain backward compatible.
- Existing account permission data remains readable without rewriting historical records.
- No inventory or production stock data is modified by this feature.
