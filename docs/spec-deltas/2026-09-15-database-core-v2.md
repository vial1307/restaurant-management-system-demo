# Database Core v2 normalization — 2026-09-15

Status: implementation target for additive migrations 010-013 on top of production schema 001-009.

## Goal

Move Kitchen OS from the current hybrid PostgreSQL + `business_state.modules` JSONB architecture toward a durable relational core without deleting or rewriting existing production data.

This change establishes the schema foundation only. Existing frontend/API behavior remains compatible until each module is explicitly cut over in a later migration/API change.

## Non-negotiable invariants

1. PostgreSQL remains the only authoritative shared database.
2. Existing migrations 001-009 are immutable history and must not be rewritten.
3. New schema is additive and backward compatible.
4. Existing `business_state` payloads remain readable during the transition.
5. No existing inventory quantity, transaction, user, permission, schedule, attendance, payroll, SOP, reservation, preparation, or audit record may be deleted by this migration.
6. Every future authoritative business record must have a stable primary key, site scope where applicable, timestamps, and referential integrity.
7. A syntactically valid foreign UUID is not sufficient when the relation is site- or employee-scoped. PostgreSQL must also enforce the owning site/staff identity where semantic drift is possible.
8. Historical facts use append-only or revision/snapshot models rather than destructive overwrite where the business contract requires history.
9. Account deletion must not destroy business history; historical actor references use `ON DELETE SET NULL` plus copied display/identity fields where needed.
10. Monetary values use numeric columns and explicit currency codes. Floating point is prohibited for money.
11. Service dates are stored separately from timestamps. Operational timestamps remain timezone-aware (`timestamptz`); site timezone defaults to `Asia/Taipei`.
12. Soft deactivation is preferred for master data referenced by history.
13. JSONB remains allowed for immutable snapshots, extension metadata, or compatibility payloads, but not as the long-term primary representation of core transactional entities.
14. Mutations that can be retried by a client/network must support durable idempotency where duplicate execution can change business state.
15. A backup artifact is not considered proven recoverable until a restore verification has been recorded.

## Domain boundaries

### System / organization

Relational source-of-truth tables:

- `sites`
- `organization_departments`
- `staff_members`
- `user_staff_bindings`
- `site_settings`
- `system_settings`
- `system_jobs`
- `api_idempotency_keys`
- `backup_history`
- `backup_restore_verifications`
- `data_migration_checkpoints`

`app_users`, sessions, database-backed RBAC tables from schema 009, inventory tables, `audit_logs`, and `schema_migrations` remain authoritative and are reused.

### Workforce

Relational source-of-truth target tables:

- `workforce_schedule_entries`
- `workforce_schedule_publications`
- `workforce_schedule_publication_entries`
- `workforce_schedule_requests`
- `workforce_schedule_exceptions`
- `attendance_records`
- `attendance_corrections`
- `payroll_policies`
- `payroll_periods`
- `payroll_snapshots`

The existing JSONB workforce payload remains compatibility data until a tested backfill and API cutover are completed.

### Restaurant operations

Relational source-of-truth target tables:

- `reservation_bookings`
- `preparation_task_templates`
- `preparation_tasks`
- `suppliers`
- `supplier_site_rules`
- `supplier_delivery_days`
- `procurement_catalog_rules`
- `procurement_orders`
- `procurement_order_lines`
- `menu_items`
- `sop_documents`
- `sop_versions`
- `sop_steps`
- `skill_definitions`
- `staff_skill_assessments`
- `staff_sop_training`
- `remote_job_templates`
- `remote_job_runs`

## Identity model

`app_users` is login identity. `staff_members` is employment/worker identity. They are not the same concept.

`user_staff_bindings` provides the explicit one-account-to-one-staff mapping required by self-service attendance/schedule authorization. This replaces ambiguous display-name matching after module cutover.

A staff member may remain in history after their login account is removed or disabled.

## Site model

Current sites are seeded as `central`, `fuxing`, and `yongji`. New domain tables reference `sites(code)` instead of repeating closed check constraints. New branches can therefore be added as data rather than requiring a schema rewrite.

Existing inventory/location check constraints remain unchanged in this migration for compatibility; later branch-expansion work may migrate them explicitly.

Site-scoped templates, publications and workforce source relations must not be linkable to a row owned by another site merely because its UUID exists.

## Workforce model

### Schedule draft and publication

Manager working schedules are normalized into `workforce_schedule_entries`.

Each entry is either:

- date-specific; or
- recurring for one month + weekday.

Split shifts are supported with `slot_no`. Publication is versioned by site. Each publish creates a `workforce_schedule_publications` row and an immutable snapshot in `workforce_schedule_publication_entries`.

A publication snapshot must belong to the same site as the publication. When it retains a source schedule reference, that schedule must belong to the same site and employee represented by the snapshot.

### Requests and exceptions

Leave/change requests are lifecycle records, not generic schedule JSON. Approved requests produce explicit schedule exceptions. A unique active exception per staff/service-date prevents ambiguous stacking.

A request or exception may only reference a source schedule belonging to the same site and employee. An exception materialized from a request must preserve the request's site, employee and service date.

### Attendance

`attendance_records` stores canonical worked-shift facts including actual timestamps, scheduled start, break, wage basis, source, approval state, version, and server actor metadata.

An employee may have at most one active open attendance row at a time. Completed rows remain addressable by stable UUID. Corrections are recorded in `attendance_corrections`; corrections do not erase the prior state.

When an attendance record points to a schedule entry, that entry must belong to the same site and employee.

### Payroll

`payroll_policies` stores effective-dated policy configuration. No new wage rule is invented by the schema.

For one site, active payroll policy effective-date ranges must not overlap. PostgreSQL serializes competing policy-range writes for that site and rejects conflicting ranges.

`payroll_periods` stores month lifecycle (`open`/`locked`) and lock/reopen metadata.

Every successful lock appends an immutable `payroll_snapshots` revision containing formula version, policy snapshot, approved attendance IDs, attendance pay facts, per-staff totals, and period totals. Reopen/relock creates a later revision and never overwrites an earlier snapshot.

## Operations model

Reservations become booking records instead of aggregate JSON blobs. Preparation tasks distinguish templates from daily generated/manual task instances. Procurement separates supplier configuration, catalog ordering rules, order headers, and order lines. SOP uses document/version/step tables so an approved revision is immutable history. Skill assessments and SOP training link directly to staff identity.

A preparation task or remote-job run may only reference a template owned by the same site.

## Mutation idempotency

`api_idempotency_keys` is the durable coordination ledger for future mutation endpoints where retries could duplicate a business action.

Contract:

- `(scope, idempotency_key)` is unique;
- a stored request hash identifies the payload protected by the key;
- a reused key with a different payload must be rejected by the API service;
- key reservation and the protected business mutation occur in one transactional flow;
- a completed response may be replayed instead of repeating the business mutation;
- expired keys may be cleaned by a controlled maintenance job.

The table being present does not automatically make existing endpoints idempotent; endpoints are cut over explicitly and tested individually.

## Backup recoverability

`backup_history` records creation of database backup artifacts. `backup_restore_verifications` records actual restore/drill outcomes and is immutable evidence.

A failed restore verification is never edited into success. A later verification appends a new record. Production operations may report backup health and restore-verification health separately.

## Migration/cutover strategy

1. **Schema foundation:** migrations 010-013 create normalized tables and hard integrity constraints; do not switch reads/writes.
2. **Backfill adapters:** parse each current JSONB module into normalized tables using deterministic legacy IDs and migration checkpoints.
3. **Dual-read verification:** compare relational projections with existing JSONB responses in regression/staging.
4. **API cutover by domain:** backend becomes relational authority for one domain at a time.
5. **Compatibility mirror:** when required, generate old client payload shape from relational data rather than maintaining two independent authorities.
6. **Frontend cutover:** route/module frontend consumes normalized endpoints.
7. **JSONB retirement:** only after production verification, stop authoritative writes to that module in `business_state`. Historical JSONB is retained until a separately approved archival migration.

No phase may silently create two independent writable sources of truth.

## Required indexes and integrity rules

- Every FK commonly used for filtering/joining is indexed.
- Site/date and staff/date access paths are indexed for workforce/operations tables.
- Active/open uniqueness uses partial unique indexes where the business invariant is conditional.
- Check constraints enforce non-negative wages/amounts/table counts/break minutes and valid lifecycle enums.
- Composite foreign keys enforce site/staff ownership where a bare UUID would permit semantic cross-linking.
- Active payroll policies for the same site cannot cover the same business date.
- `updated_at` triggers are attached to mutable master/current-state tables.
- Immutable history tables reject update/delete after insertion.
- Restore-verification evidence is append-only.

## Admin Console contract

The future Admin Console operates through API services, not raw arbitrary SQL from the browser. It may expose database health, migration version, backup history, restore verification, jobs, settings, role/access model and safe maintenance actions.

Production browser UI must not expose unrestricted `DROP`, `TRUNCATE`, arbitrary `DELETE`, or raw-SQL execution.

## Acceptance criteria for this schema phase

- Fresh PostgreSQL 16 can apply migrations 001 through 013 in lexical order.
- Current regression setup can still seed users/inventory after the new migrations.
- Existing production tables/columns are not dropped or rewritten.
- New site/staff/workforce/operations/training tables have PK/FK/check/index coverage.
- Cross-site/cross-staff semantic references covered by migration 013 are rejected by PostgreSQL.
- Overlapping active payroll policy periods are rejected.
- Duplicate mutation idempotency keys are rejected for the same scope.
- New history/snapshot/restore-verification records are immutable where specified.
- Current three sites are seeded idempotently.
- No existing UI/API behavior changes solely because the schema exists.
- A later data backfill can map legacy staff, attendance, schedule, payroll, SOP and operations records without relying on display names as persistent identity.
