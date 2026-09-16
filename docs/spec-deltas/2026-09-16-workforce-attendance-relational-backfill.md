# Workforce attendance relational backfill — 2026-09-16

## Goal

Backfill the canonical worked-shift facts currently stored in `business_state.modules.attendance.attendance[]` into `attendance_records` without changing the current attendance API authority or deleting legacy JSONB data.

This is Database Core v2 phase 2 for attendance only. It is deliberately narrower than payroll/correction cutover.

## Authority and scope

- Current authority remains `business_state.modules.attendance.attendance[]`.
- Target table is `attendance_records`.
- Migration checkpoint key is `workforce.attendance.v1`.
- The backfill does not change frontend reads/writes.
- The backfill does not migrate `attendance.correctionRequests` into `attendance_corrections`; a correction request lifecycle is not equivalent to an applied immutable correction event.
- The backfill does not invent an effective date for the current payroll policy. Payroll policy/period/snapshot backfill remains a separate migration slice.

## Dependencies

1. Database Core v2 migrations 010-013 are applied.
2. Staff backfill has populated `staff_members.legacy_staff_id` for every attendance `staffId`.
3. If an attendance row contains a source schedule reference, Schedule backfill must have populated the matching `workforce_schedule_entries.legacy_schedule_id`.

An unresolved staff identity or unresolved explicit schedule link is blocking. Display-name matching is never used as a persistent attendance identity.

## Deterministic mapping

For each legacy attendance row:

- `id` -> `legacy_attendance_id`;
- legacy `staffId` -> relational `staff_id` through `(site_code, legacy_staff_id)`;
- `date` -> `service_date`;
- `clockIn` / `clockOut` -> `clock_in_at` / `clock_out_at`;
- `scheduledStart` is interpreted as local site time using `sites.timezone_name` and stored as `scheduled_start_at`;
- `breakMinutes` -> `break_minutes` without rounding;
- `area` -> `work_area`;
- `hourlyRate` -> `hourly_rate`;
- site currency -> `currency_code`;
- `note` -> `note`;
- migrated records use `source='migration'`;
- explicit legacy source schedule id -> same-site/same-staff relational schedule id;
- absent approval metadata -> `pending`;
- complete legacy approval metadata -> `approved` with copied timestamp/name and a user UUID only when it resolves to an existing account;
- absent record status -> `active`;
- absent/invalid non-positive version -> `1`.

Relational UUID identity is created once and preserved on idempotent reruns through the `(site_code, legacy_attendance_id)` unique key.

## Blocking validation

Verify/apply is blocked by any source row with:

- missing legacy attendance id;
- missing or unresolved staff id;
- invalid service date;
- invalid clock-in/clock-out timestamp or `clockOut < clockIn`;
- invalid scheduled-start local time;
- non-integer or negative break minutes;
- negative/non-finite hourly rate;
- unsupported approval or record status;
- approved open attendance;
- approved attendance without approval timestamp/name;
- unresolved explicit schedule reference or schedule/staff mismatch;
- duplicate legacy attendance ids;
- more than one active open attendance for the same staff member.

Apply also blocks if the relational table already contains a different active open attendance for a staff member represented by an open legacy row. The migration never silently deletes that target row to make the constraint pass.

## Verify-only behavior

The default mode is read-only:

- validates source readiness;
- calculates source revision/checksum;
- reports relational row count and field differences for already-backfilled legacy ids;
- performs no database writes, including no checkpoint writes.

Production automatic runs are verify-only and only start after a successful canonical `main` deployment. The workflow verifies that the public release SHA, VPS repository SHA, and deployed migration-script checksum all match the workflow source.

## Apply behavior

Production apply is manual only.

Before apply, the workflow creates the mandatory database backup. Each site is migrated in one PostgreSQL transaction. Rows are inserted/upserted by deterministic legacy identity, then read back and compared field-by-field with the planned relational projection. The checkpoint is marked `verified` only after the target projection matches.

No source JSONB row is deleted or rewritten.

## Regression acceptance

Regression must prove:

1. verify-only performs no attendance writes;
2. completed approved and active open shifts map correctly;
3. scheduled local time respects the site timezone;
4. approval actor UUID is preserved only when it exists;
5. apply creates a verified checkpoint with source revision/checksum;
6. rerunning apply does not duplicate rows or change relational UUIDs;
7. a later source revision refreshes mutable pre-cutover projection fields without changing identity;
8. an unresolved staff identity blocks verify/apply and leaves relational attendance unchanged;
9. production workflow remains deploy-sequenced, SHA/checksum pinned, backup-gated and automatic verify-only.

## Follow-up cutover slices

After attendance v1 is verified in production:

1. payroll period/snapshot backfill;
2. correction/audit history strategy without conflating pending/rejected requests with applied corrections;
3. relational attendance dual-read comparison endpoint/regression;
4. backend attendance write cutover with compatibility projection for old clients;
5. frontend cutover;
6. retirement of authoritative attendance writes inside `business_state` only after production parity is proven.
