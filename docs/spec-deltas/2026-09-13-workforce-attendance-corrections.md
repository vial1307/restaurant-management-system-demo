# Workforce attendance correction requests

## Goal

Add an auditable self-service correction workflow for attendance without weakening the existing payroll-period lock or inventing wage rules:

1. employee and part-time accounts may request a correction only for one of their own attendance rows;
2. admin/manager with attendance edit permission may approve or reject pending correction requests;
3. an approved correction atomically updates the attendance row and clears its approval metadata so the row must be reviewed again before payroll locking;
4. a correction for a locked payroll month cannot be approved until an authorized manager explicitly reopens that month through the existing payroll-period workflow;
5. request/decision metadata is server-owned and generic business-state writes cannot edit or delete it.

## Storage

No SQL migration is required. Correction requests are stored in the existing PostgreSQL `business_state.modules.attendance` JSONB document under:

- `attendance.correctionRequests`

Each request stores the server-resolved attendance/staff identity, a snapshot of the source attendance row, requested corrected values, reason, status, creation metadata, and decision metadata.

Supported statuses:

- `pending`
- `approved`
- `rejected`
- `cancelled`

## Requestable fields

The first correction slice supports correction of attendance facts already represented by the existing attendance model:

- `clockIn`
- `clockOut`
- `breakMinutes`
- `note`

The request cannot change attendance ID, date, staff identity, hourly rate, scheduled start, site, approval metadata, or payroll policy.

Requested timestamps must be valid ISO-compatible timestamps and, when both are present, `clockOut >= clockIn`. `breakMinutes` must be a finite non-negative number. A reason of at least 3 trimmed characters is required.

## Authority and visibility

### Employee / part-time

- requires attendance view permission;
- VPS resolves the authenticated account to one canonical staff ID;
- may create requests only for their own existing attendance rows;
- may see only their own correction requests;
- may cancel only their own `pending` correction request;
- cannot directly correct an existing completed attendance row through the generic business-state write path.

### Admin / manager

- requires attendance edit permission;
- may view correction requests within authorized site scope;
- may approve or reject pending requests;
- rejection requires a decision note of at least 3 trimmed characters;
- supervisor is not workforce management authority even if legacy permission bits contain attendance edit.

## Approval transition

`pending -> approved`

Preconditions:

- source attendance row still exists;
- source row still belongs to the request staff ID;
- source attendance facts covered by the request still match the source snapshot so stale requests do not overwrite newer corrections;
- payroll period for the row is not locked;
- requested values remain valid.

Effects in the same PostgreSQL transaction:

1. update only the requestable attendance fields;
2. remove `approvalStatus`, `approvedAt`, `approvedByUserId`, and `approvedByName` from the corrected row;
3. mark the request approved with server-generated decision metadata;
4. increment the attendance module revision;
5. write an audit-log entry containing request ID, attendance ID, month, staff ID, and changed fields.

The corrected row therefore returns to pending approval and is excluded from approved payroll totals until an authorized manager approves the attendance row again.

## Reject and cancel transitions

`pending -> rejected`

- admin/manager only;
- rejection note is required;
- attendance row is unchanged.

`pending -> cancelled`

- requester only;
- attendance row is unchanged.

Processed requests are immutable through this workflow.

## Generic business-state protection

- `attendance.correctionRequests` is server-owned and is preserved from stored state on generic attendance writes.
- Generic manager corrections keep the existing behavior: changed attendance rows lose approval and locked months cannot be modified.
- Self-service clock-in/clock-out keeps the existing behavior and cannot mutate correction requests.

## UI acceptance criteria

- Attendance route shows a bilingual Vietnamese / Traditional Chinese correction workspace.
- Employee/part-time can select one of their own attendance rows, enter corrected time/break/note and reason, submit, view history, and cancel pending requests.
- Admin/manager can see pending correction requests plus history, approve, or reject with a reason.
- Locked-period requests visibly explain that the period must be reopened before approval.
- Controls have pending/disabled states during VPS writes and show explicit success/failure feedback.
- Desktop and mobile use the same API and data source; no separate local-only mutation path exists.

## Regression acceptance criteria

- API contract covers own-only submission, spoof resistance, manager authority, supervisor denial, locked-period denial, stale-source denial, approval invalidation, reject-note validation, cancellation ownership, and audit/module-revision persistence.
- Browser contract covers bilingual self-service and manager UI, mobile-safe markup, and API route usage.
- Existing workforce approval, payroll lock, schedule request, role/site, desktop/mobile, and production release gates remain green.
