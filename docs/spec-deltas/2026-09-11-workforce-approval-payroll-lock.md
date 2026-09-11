# Workforce attendance approval and payroll-period locking

## Goal

Introduce an auditable payroll preparation workflow without inventing new wage rules:

1. completed attendance is reviewed and approved by admin/manager;
2. payroll uses approved completed attendance only;
3. a payroll month can be locked only when there are no open shifts and every completed shift in that month is approved;
4. once locked, attendance rows in that month cannot be changed through the generic business-state write path;
5. a locked month must be explicitly reopened with a reason before corrections can be made;
6. correcting an approved attendance row in an open month invalidates its approval and requires re-approval;
7. locking captures the payroll policy snapshot used for that month.

## Authority

- Admin and manager with attendance edit permission may approve attendance, lock a payroll month, or reopen a locked month.
- Supervisor is not workforce management authority for this workflow.
- Employee and part-time accounts cannot approve, lock, reopen, or correct attendance.
- Self-service clock-in/clock-out remains limited to the authenticated employee's own VPS-resolved staff identity.

## Server-owned fields

Attendance approval metadata is server generated:

- `approvalStatus`
- `approvedAt`
- `approvedByUserId`
- `approvedByName`

Payroll-period state is stored under `attendance.payroll.periods[YYYY-MM]` and is also server generated. Generic business-state writes may not directly mutate those period records.

A locked period stores a payroll policy snapshot excluding the periods map itself. This prevents later policy changes from silently changing the policy basis shown for an already locked month.

## State transitions

### Attendance approval

`pending -> approved`

Preconditions:

- attendance row exists;
- `clockOut` is present and valid;
- the row's payroll month is not locked.

### Payroll period

`open -> locked`

Preconditions:

- month is valid `YYYY-MM`;
- at least one completed attendance row exists in the month;
- no open attendance row exists in the month;
- every completed row is approved.

`locked -> open`

Preconditions:

- caller has workforce management authority;
- a non-empty reopening reason is provided.

The reopen transition is written to the database audit log. Corrections made after reopening invalidate approval on the changed row.

## Payroll presentation

- Draft/open payroll totals are calculated from approved completed rows only.
- Locked payroll totals use approved completed rows and the policy snapshot captured at lock time.
- Open, unapproved, and approved counts remain visible so managers can reconcile what is blocking lock.
- No overtime, holiday multiplier, bonus, insurance, tax, or statutory deduction rule is inferred by this change.

## Audit requirements

The VPS audit log records:

- attendance approval;
- payroll-period lock;
- payroll-period reopen with reason;
- generic attendance corrections with the changed attendance IDs.

## Compatibility

- No SQL migration is required; state remains inside the existing PostgreSQL `business_state.modules` JSONB document.
- Existing attendance/payroll data without approval fields is treated as pending approval.
- Existing payroll policy fields remain unchanged.
