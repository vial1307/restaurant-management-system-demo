# Workforce module consolidation — 2026-09-11

## User decision

The generic success flash for pure UI controls is removed. Result notifications remain only for actions whose data write must be confirmed.

Attendance, work schedule and salary calculation are presented as one top-level workforce area with three internal views: attendance, schedule and payroll.

## Permission contract

- Settings shows one merged workforce permission row: `Chấm công · Lịch làm · Lương / 出勤 · 排班 · 薪資`.
- The existing `attendance` and `schedule` permission keys remain in storage/API for backward compatibility and to avoid a production permission migration.
- The visible merged row synchronizes both legacy view permissions. Schedule edit is mirrored only for manager/admin accounts; employee/part-time attendance self-service keeps the prior attendance permission model.
- The top-level workforce entry is available when either legacy `attendance.view` or `schedule.view` is granted, so an existing schedule-only account cannot lose access during the UI consolidation.
- Internal tabs remain permission-aware: attendance and payroll require `attendance.view`; schedule requires `schedule.view`. If a legacy schedule-only account enters the merged attendance route, it is redirected to its permitted Schedule panel.
- Manager/admin rank is required in addition to the relevant account edit permission: attendance time correction uses `attendance.edit`, while schedule management uses `schedule.edit`.
- Manager/admin accounts are the only UI authority for correcting actual work times or using schedule management controls.
- This change does not introduce per-record authorization or alter the approved module-level concurrency model.

## Workforce UI contract

- Top-level navigation displays one visible workforce entry; the separate Schedule navigation entry does not occupy visual or interactive navigation space.
- The authorized legacy `#schedule` route remains present for compatibility/certification and remains functional as the Schedule tab so old links and existing app handlers do not break.
- The Salary tab provides month-level totals derived from the canonical attendance wage calculator: completed shifts, worked hours, gross pay, deductions and temporary net pay.
- Manager/admin attendance view exposes a correction editor for actual clock-in, actual clock-out, break minutes, scheduled start, hourly rate and note.
- A corrected clock-out cannot precede clock-in.
- Manager time corrections are written to the existing `attendance` business-state module with an expected module revision and are only reported successful after VPS confirmation.

## Data contract

- No schema migration is required.
- Existing `attendance`, `payroll` and `schedule` business-state payloads remain unchanged.
- Existing account permission data remains readable without rewriting historical records.
- No inventory or production stock data is modified by this feature.