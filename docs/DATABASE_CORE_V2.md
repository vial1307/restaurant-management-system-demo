# Kitchen OS Database Core v2

This document is an implementation map for developers. Normative behavior remains in `docs/SYSTEM_SPECIFICATION.md` plus approved spec deltas.

## 1. Database authority

PostgreSQL on the VPS is the only shared source of truth.

Core v2 is introduced additively by migrations 010-012. Existing `business_state.modules` JSONB remains compatibility storage until each domain completes an explicit backfill/parity/API cutover. A domain must never have two independent writable authorities.

## 2. Identity and organization

| Table | Purpose | Mutability |
| --- | --- | --- |
| `app_users` | Login/authentication identity | Mutable/soft-disable |
| `sessions` | Server-side login sessions | Ephemeral |
| `account_roles` + RBAC tables | Database-driven access model | Mutable master data |
| `sites` | Branch/central-kitchen master | Mutable/soft-disable |
| `organization_departments` | Site department master | Mutable/soft-disable |
| `staff_members` | Employment identity | Mutable/soft-disable |
| `user_staff_bindings` | Explicit login↔staff mapping | Mutable controlled mapping |

Do not use display names as persistent employee identity. Business records reference `staff_members.id`.

## 3. System/control-plane tables

| Table | Purpose |
| --- | --- |
| `site_settings` | Versioned per-site configuration values |
| `system_settings` | Versioned global configuration values |
| `data_migration_checkpoints` | Backfill/cutover checkpoint and verification state |
| `system_jobs` | Long-running/queued maintenance job state |
| `backup_history` | Backup metadata for Admin Console/operations visibility |
| `schema_migrations` | Applied migration ledger |
| `audit_logs` | Append-oriented actor/action audit history |

The Admin Console must access these through safe APIs. Browser-side arbitrary SQL is not part of the production contract.

## 4. Inventory

Existing relational inventory remains authoritative:

- `inventory_items`
- `inventory_locations`
- `inventory_stock`
- `inventory_transactions`
- `inventory_receive_defaults`

`inventory_transactions` is historical evidence. Quantity-changing operations must remain transactional and auditable.

## 5. Workforce

### Current-state/master tables

- `workforce_schedule_entries`
- `workforce_schedule_requests`
- `workforce_schedule_exceptions`
- `attendance_records`
- `payroll_policies`
- `payroll_periods`

### Immutable history/snapshot tables

- `workforce_schedule_publications`
- `workforce_schedule_publication_entries`
- `attendance_corrections`
- `payroll_snapshots`

Important invariants enforced by PostgreSQL include:

- a staff identity is scoped to its site;
- only one active schedule slot exists for the same staff/date/slot;
- only one pending schedule request exists for the same staff/date;
- only one active schedule exception exists for the same staff/date;
- only one active open attendance record exists for a staff member;
- approved attendance must be closed and carry approval metadata;
- payroll month uses first-of-month identity;
- payroll lock snapshots are immutable;
- correction records are immutable.

The existing workforce JSON payload is not yet retired. Do not make relational workforce tables authoritative until backfill and parity checks are completed.

## 6. Restaurant operations

Normalized target tables:

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

Orders separate header lifecycle from line items. Supplier rules separate vendor identity from branch-specific ordering/delivery behavior.

## 7. SOP, skills and remote work

Normalized target tables:

- `sop_documents`
- `sop_versions`
- `sop_steps`
- `skill_definitions`
- `staff_skill_assessments`
- `staff_sop_training`
- `remote_job_templates`
- `remote_job_runs`

An approved SOP revision and its steps become immutable. A future edit creates a new version rather than overwriting approved history. Skill assessments are immutable evidence; later assessments append new rows.

## 8. Data-type rules

- Stable entity IDs: UUID.
- Audit sequence: bigint/bigserial where ordering is useful.
- Money/wage: `numeric`, never floating point.
- Quantity: fixed-precision `numeric`.
- Service/business day: `date`.
- Actual event time: `timestamptz`.
- Recurring shift clock time: `time` plus explicit next-day flag.
- Currency: ISO-style 3-letter code, currently `TWD`.
- Site timezone: currently `Asia/Taipei`.
- JSONB: snapshots, metadata, extension/configuration values, or compatibility only—not the long-term primary representation of core transactions.

## 9. Foreign-key deletion policy

- Master/business history uses `RESTRICT` where deleting the referenced entity would destroy meaning.
- Actor login references normally use `SET NULL`, while historical display/actor text is copied where the record must remain human-readable.
- Authentication session rows may cascade with account deletion.
- Operational master records are generally deactivated rather than physically deleted after they are referenced by history.

## 10. Index policy

Every common site/date, staff/date, lifecycle/status and FK access path is indexed. Conditional business uniqueness uses partial unique indexes where applicable. New feature work must include query/index review in the same change when it introduces a new high-frequency access pattern.

## 11. Migration policy

1. Never edit a migration already deployed to production.
2. New changes use a new numbered migration.
3. Production deployment makes a database backup before migrations.
4. Migrations must pass fresh PostgreSQL 16 application in CI.
5. Migration-specific integrity regressions must cover important constraints.
6. Destructive cleanup of compatibility data requires a separate, explicitly reviewed migration after production parity has been demonstrated.

## 12. Domain cutover checklist

For each JSONB domain being migrated:

1. inventory all current legacy fields and IDs;
2. define deterministic legacy→relational identity mapping;
3. backfill transactionally;
4. record checkpoint counts/checksum;
5. compare legacy projection and relational projection;
6. make API relational authority;
7. retain compatibility projection if older frontend still needs it;
8. cut frontend to normalized endpoint;
9. monitor/audit production parity;
10. only then stop legacy authoritative writes.

This sequence prevents silent divergence and makes rollback possible during the transition.
