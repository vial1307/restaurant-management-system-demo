# Workforce schedule relational backfill

Date: 2026-09-16
Status: implementation target after workforce staff identity backfill

## Goal

Populate the relational Schedule domain without changing production authority. `business_state.modules.schedule` remains writable/canonical until a later parity-gated API cutover.

## Scope

The backfill covers the complete compatibility schedule domain:

- manager draft `schedules` → `workforce_schedule_entries`;
- immutable `publishedSchedules` + `publication` → publication header/snapshot tables;
- `requests` → `workforce_schedule_requests`;
- approved `exceptions` → `workforce_schedule_exceptions`.

Legacy schedule notes and legacy request/exception identifiers are retained by additive migration 014. Legacy shift `full` maps to relational `full_day`. A clock range whose end is earlier than its start sets `ends_next_day=true`.

## Identity and safety

- Staff is resolved only through same-site `staff_members.legacy_staff_id` created by the staff backfill. No display-name guessing is allowed.
- Draft rows retain `legacy_schedule_id`; requests/exceptions retain compatibility identifiers.
- Invalid schedule identity, staff identity, dates, times, departments or lifecycle fields are blocking diagnostics.
- Historical request/exception source schedule links may be null when the old draft no longer contains that schedule; the legacy source snapshot/ID remains historical evidence.
- `--apply` runs one PostgreSQL transaction per site and refuses a site with blocking diagnostics.
- Default invocation is verify-only and performs no business writes.
- Checkpoint key is `workforce.schedule.v1` and records source revision, row counts, checksum and diagnostics.

## Publication immutability

Published schedule history is immutable. Migration 014 rejects UPDATE/DELETE on publication headers and entries. Backfill behavior is therefore:

1. insert a publication version only when absent;
2. insert its snapshot entries once;
3. on rerun, compare the stored header/snapshot with the compatibility source;
4. fail on parity mismatch rather than rewriting history.

Manager draft rows remain mutable and are refreshed idempotently before authority cutover.

## Cutover boundary

This phase does **not** change frontend reads, schedule request routes, schedule publishing routes, attendance schedule lookup, or generic business-state persistence to relational authority. Those changes require a separate cutover after production verify-only reports show zero blockers and relational-vs-legacy parity is demonstrated.

## Acceptance

- PostgreSQL 16 fresh-schema regression applies migration 014.
- Verify-only writes no relational schedule rows.
- Date and monthly recurring schedules migrate with stable relational UUIDs.
- Notes, work area, department, shift type and overnight semantics are preserved.
- Publication version and entries are created once and remain immutable.
- Requests and approved exceptions preserve lifecycle, staff/date scope and source references when available.
- Re-running apply is idempotent and refreshes only mutable draft state.
- A verified migration checkpoint records zero blocking diagnostics before later cutover work can proceed.
