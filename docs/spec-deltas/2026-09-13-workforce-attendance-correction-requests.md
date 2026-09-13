# Workforce attendance correction requests

Date: 2026-09-13

## Goal

Add an audited self-service attendance correction workflow without allowing direct employee edits to authoritative attendance or payroll data.

- Employee and part-time accounts may request changes to their own attendance row.
- Manager/admin accounts with attendance edit permission may approve or reject pending requests.
- Approval updates the VPS attendance row, clears prior attendance approval metadata, and requires the corrected row to be approved again before payroll can use it.
- Locked payroll periods cannot be changed by correction approval; the period must be reopened first.
- Approval fails if the attendance row changed after the request was submitted.
- Payroll calculations and wage rules remain unchanged.

## Storage

Use the existing PostgreSQL `business_state.modules.attendance` JSONB document. No SQL migration is required.

Server-owned collection: `attendance.correctionRequests[]`.

Each request stores the target attendance ID, staff identity, date, source snapshot, requested clock-in/clock-out, reason, status, and server-generated creation/decision metadata.

## Validation

Creation requires an existing attendance row owned by the authenticated employee, valid proposed timestamps, at least one changed timestamp, a reason of at least 3 characters, and no other pending correction for the same row.

Approval requires a pending request, an unchanged source attendance row, a valid corrected time range, and an unlocked payroll month.

## Approval effect

Approval changes only requested clock-in/clock-out values, keeps canonical staff/date/rate/schedule identity, clears prior attendance approval fields, records correction metadata on the row, marks the request approved, increments the attendance module revision, and writes an audit entry.

## Privacy and authority

- Employee/part-time reads show only their own correction requests.
- Employee/part-time may cancel only their own pending request.
- Manager/admin may view the branch queue and decide requests.
- Supervisor has no decision authority.
- Generic business-state writes must preserve server-owned correction request state.

## UI and regression

Attendance self-service rows expose a request-correction action and manager attendance view exposes pending requests with approve/reject controls. Desktop and mobile share the same actions and backend endpoints.

Regression coverage must include ownership/privacy, duplicate pending request, cancellation, manager/supervisor boundary, stale source, locked-period block, approval invalidating prior attendance approval, reject reason, browser submit/decision flow, and existing workforce/full-device gates.
