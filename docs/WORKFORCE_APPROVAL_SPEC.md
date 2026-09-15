# Workforce Approval / Payroll UI Specification

Status: normative extension to `docs/SYSTEM_SPECIFICATION.md` section 16 (Attendance and payroll).

## Scope

This specification covers attendance approval, payroll-period lock/reopen controls, and authorization-sensitive rendering on desktop and mobile.

## Authorization contract

1. Payroll-period management controls are management controls. They may be rendered only when the current effective account is an `admin` or `manager` and has `attendance:edit` permission.
2. Employee/part-time/restricted accounts must not receive payroll lock or reopen controls merely because stale DOM from a previous account/render remains on screen.
3. Frontend visibility is not the security boundary. Every approve, lock, and reopen mutation must still be authorized by the VPS API.
4. Site scope continues to apply to the mutation endpoint; UI capability must not grant cross-site authority.

## Render reconciliation invariant

Authorization state is part of the rendered payroll state.

When authentication/account synchronization changes the effective role or permission matrix, the payroll approval panel must reconcile even if all payroll business data is otherwise unchanged. A render cache/signature may skip an update only when both business state **and effective management capability** are unchanged.

The renderer must use one capability snapshot per render. It must not calculate the render signature with one authorization state and generate controls using a second independently-read authorization state.

This prevents both failure modes:

- manager controls missing because the first render occurred before the account session finished synchronizing;
- manager controls remaining visible after effective permission/session state becomes restricted.

## Payroll-period behavior

For a selected month:

- payroll summary counts only completed attendance records that have been approved;
- an open period may be locked only when at least one completed shift exists, there are no incomplete/open shifts in the month, and every completed shift is approved;
- a locked period exposes reopen controls only to an authorized manager/admin;
- restricted users may view payroll content only to the extent allowed by their module permissions, but never receive management mutation controls;
- locked-period policy snapshots remain authoritative for locked payroll calculations.

## Acceptance criteria

1. Manager/admin with `attendance:edit` sees an enabled lock control when the month is ready to lock.
2. After lock, the same authorized manager/admin sees a reopen form and no lock button.
3. Employee/restricted account sees neither lock nor reopen controls.
4. If the effective account permissions change while the payroll panel is already mounted, dispatching the normal account-sync lifecycle updates the management controls without requiring payroll data to change.
5. Restoring management permission through the same sync lifecycle restores the appropriate controls from current payroll state.
6. Desktop and mobile viewports preserve the same authorization semantics.
7. Backend/API authorization remains mandatory and is covered separately from UI visibility tests.
