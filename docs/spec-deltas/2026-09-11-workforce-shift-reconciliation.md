# Workforce shift reconciliation — 2026-09-11

## Goal

Evolve the merged **Attendance · Schedule · Payroll** workspace from a basic record view into an operational reconciliation surface while preserving the existing authorization and payroll contracts.

This slice is intentionally read/derived-state focused. It does not introduce a new database schema, a new payroll formula, or new employee write authority.

## Scope

### Attendance reconciliation

For attendance records already returned by the authenticated VPS business-state API, the UI may derive an operational status from the canonical `calculateAttendance()` result:

- **Open**: the attendance record does not have a valid clock-out (`complete === false`).
- **Late**: the attendance record is complete and `lateMinutes > 0`.
- **Complete / on time**: the attendance record is complete and `lateMinutes === 0`.

The status is informational. It must not create an additional monetary deduction or alter attendance timestamps.

Manager/admin daily attendance rows should distinguish:

- scheduled start (`scheduledStart`, when present),
- actual clock-in / clock-out,
- paid hours after the recorded unpaid break,
- the derived reconciliation status.

Daily summary should expose the number of late records and open records so that exceptions are visible without opening every row.

### Monthly payroll reconciliation

The payroll panel continues to use only attendance records already scoped by the VPS response and the existing canonical wage calculator.

For every staff group in the selected month, derive and display:

- completed shifts,
- paid hours,
- gross wage,
- configured late deductions,
- estimated net wage,
- count of late attendance records,
- count of open attendance records.

Exception counts are operational indicators only. They do not add new deductions.

The UI must state that payroll is an estimate based on confirmed attendance data and that overtime, holiday multipliers, bonuses, insurance/tax and other payroll rules are not applied unless those rules are explicitly specified and implemented later.

### Schedule reconciliation

The Schedule panel remains the existing schedule editor and existing permission boundary.

A read-only reconciliation summary may be added above it using the already-loaded `operations.schedules` data:

- entries applicable to the selected service date,
- planned staff count,
- planned inside/outside staff count,
- planned hours based on each schedule entry's start/end times.

Monthly recurring schedule entries apply only when their stored month and weekday match the selected service date, exactly as the current schedule model defines them.

This slice does not infer overtime, legal staffing compliance, or payroll from planned schedule hours.

### Authorization

- Admin/manager behavior remains governed by existing account permissions.
- Employee/parttime data remains server-scoped; the reconciliation frontend must not trust a device-local `activeStaffId` to authorize or filter rows.
- The module must never expose a second source of authority for attendance, payroll, or schedule writes.
- Existing server-side self-service clock-in/out isolation remains authoritative.

## Non-goals

This slice does **not** add or assume:

- overtime multipliers,
- holiday/rest-day multipliers,
- bonuses or allowances,
- labor/health insurance,
- tax withholding,
- payroll approval/locking,
- leave accounting,
- automatic penalties beyond the existing configured late-deduction policy,
- schedule-to-payroll substitution when an attendance record has no `scheduledStart`.

## Persistence

No migration is required. All new values are derived from existing `attendance`, `payroll`, `schedules`, and selected-date state. PostgreSQL remains the authority for the underlying business modules.

## Regression contract

Automated checks must verify that:

1. the reconciliation runtime is release-stamped in both canonical shells;
2. attendance status uses `calculateAttendance()` output rather than an independent wage formula;
3. monthly exception counts are derived from the VPS-scoped attendance set;
4. schedule summary uses existing schedule records and does not write schedule data;
5. no local `activeStaffId` authorization is introduced;
6. the canonical and VPS shells remain byte-identical;
7. existing full-device and production smoke tests continue to pass.
