# Kitchen OS Database Core v2

This document is an implementation map for developers. Normative behavior remains in `docs/SYSTEM_SPECIFICATION.md` plus approved spec deltas.

## 1. Database authority

PostgreSQL on the VPS is the only shared source of truth.

Core v2 is introduced additively by migrations 010-013. Existing `business_state.modules` JSONB remains compatibility storage until each domain completes an explicit backfill/parity/API cutover. A domain must never have two independent writable authorities.

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

A UUID being valid is not sufficient proof that a relation is valid. Site-scoped and employee-scoped relations must use composite foreign keys where a wrong-site or wrong-employee reference would otherwise be possible.

## 3. System/control-plane tables

| Table | Purpose |
| --- | --- |
| `site_settings` | Versioned per-site configuration values |
| `system_settings` | Versioned global configuration values |
| `data_migration_checkpoints` | Backfill/cutover checkpoint and verification state |
| `system_jobs` | Long-running/queued maintenance job state |
| `api_idempotency_keys` | Durable mutation retry/idempotency ledger |
| `backup_history` | Backup metadata for Admin Console/operations visibility |
| `backup_restore_verifications` | Append-only evidence that a backup was actually restorable |
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
- schedule/request/exception/attendance references cannot silently point at another site or another employee;
- publication entries must belong to the same site as their publication;
- only one active open attendance record exists for a staff member;
- approved attendance must be closed and carry approval metadata;
- active payroll policy effective-date ranges for the same site cannot overlap;
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

Orders separate header lifecycle from line items. Supplier rules separate vendor identity from branch-specific ordering/delivery behavior. Daily preparation tasks and remote-job runs may only reference templates owned by the same site.

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

Database timestamps represent instants. Business dates are explicit fields and are not inferred later from a UTC timestamp without the owning site's timezone.

## 9. Foreign-key deletion and scope policy

- Master/business history uses `RESTRICT` where deleting the referenced entity would destroy meaning.
- Actor login references normally use `SET NULL`, while historical display/actor text is copied where the record must remain human-readable.
- Authentication session rows may cascade with account deletion.
- Operational master records are generally deactivated rather than physically deleted after they are referenced by history.
- Site-scoped references use `(entity_id, site_code)` or a stronger composite key when site ownership matters.
- Staff-scoped references use `(entity_id, site_code, staff_id)` where a valid foreign UUID owned by another employee would be semantically invalid.
- A new feature must not rely on API validation alone for a relationship that PostgreSQL can enforce declaratively.

## 10. Index policy

Every common site/date, staff/date, lifecycle/status and FK access path is indexed. Conditional business uniqueness uses partial unique indexes where applicable. New feature work must include query/index review in the same change when it introduces a new high-frequency access pattern.

Indexes are not added merely because a column exists. They are added for an identified lookup, join, uniqueness rule, ordering path, or operational cleanup path.

## 11. Mutation and concurrency policy

Business mutations that change multiple related rows must use a single PostgreSQL transaction. Read-modify-write flows that can race must use row locks, an optimistic `version`, a unique/exclusion invariant, or another database-enforced serialization mechanism.

Retryable external/API mutations should use `api_idempotency_keys`:

1. scope + idempotency key is unique;
2. request hash must match when a key is reused;
3. the key is reserved in the same transaction as the protected mutation;
4. completed response metadata can be replayed instead of executing the mutation twice;
5. expired rows may be cleaned by a controlled system job.

Idempotency does not replace transaction isolation; it prevents duplicate execution caused by client/network retry.

## 12. Effective-dated policy rule

For the same site, two active payroll policies may not cover the same business date. PostgreSQL serializes policy-range writes per site and rejects an overlapping active range. Historical/inactive policy rows may remain for auditability.

Future effective-dated rule tables should use the same principle: non-overlapping active periods unless the business specification explicitly supports stacking.

## 13. Backup/restore policy

A successful dump entry in `backup_history` proves only that a backup artifact was produced. Operational recoverability is proven by a separate `backup_restore_verifications` record created by a restore drill or automated verification environment.

Restore verification records are immutable evidence. A failed verification is appended, not edited into success. A later successful verification creates a new record.

## 14. Migration policy

1. Never edit a migration already deployed to production.
2. New changes use a new numbered migration.
3. Production deployment makes a database backup before migrations.
4. Migrations must pass fresh PostgreSQL 16 application in CI.
5. Migration-specific integrity regressions must cover important constraints.
6. Destructive cleanup of compatibility data requires a separate, explicitly reviewed migration after production parity has been demonstrated.
7. Backfills must be restartable/idempotent and record `data_migration_checkpoints` counts/checksums.
8. A migration introducing a new invariant must include a regression proving invalid data is rejected.
9. Production cutover and compatibility-data retirement are separate stages; schema availability alone is not authority cutover.

## 15. Domain cutover checklist

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

## 16. Definition of done for future database changes

A database-affecting feature is not complete merely because the UI works. It is complete only when its source of truth is explicit, migration is additive/reversible by backup restore, constraints model critical invariants, concurrency behavior is defined, history semantics are defined, indexes match access paths, PostgreSQL 16 regression is green, and the relevant SDD/spec documentation is updated.


## 17. Secure Super Admin mutation model

The Super Admin data editor is an API surface, not a SQL console. PostgreSQL remains private to the VPS network and the browser must never receive database credentials, Docker access, host shell access, or arbitrary table/column/query capability.

Generic administrative CRUD is allowed only when the backend owns an explicit dataset policy containing the table, selectable columns, editable columns, sortable/searchable fields and archive semantics. Unknown fields are rejected. Domain-specific operations that carry stronger invariants (inventory relocation, cross-site shipment, receiving-default changes, workforce approval, payroll locking, SOP approval) stay on dedicated transactional endpoints and must not be reimplemented through generic CRUD.

Persistent identity columns are create-time identity, not casual edit fields. Examples include menu `(site_code,item_code)`, inventory `(item_key,catalog_key)`, and SOP `(site_code,sop_code)`. Changing identity requires an explicit migration/domain operation with referential-integrity review rather than a generic row edit.

Admin updates and archives must reject stale writes. Migration `021_admin_row_revisions.sql` adds a database-owned `revision bigint` to each generic Super Admin dataset and increments it with a PostgreSQL `BEFORE UPDATE` trigger. The UI sends the row's current `expectedRevision`; the API locks the row `FOR UPDATE` and requires an exact revision match before mutating it. This avoids timestamp-precision ambiguity and also detects changes made by dedicated domain routes. `updated_at` remains a human/audit timestamp, not the concurrency token.

Inventory generic CRUD may edit approved catalog metadata but must not bypass stock invariants. In particular, an item with non-zero relational stock cannot be archived through generic CRUD; quantity/location changes continue through dedicated inventory transactions so history remains auditable.

Every successful Super Admin mutation writes `audit_logs` with actor, action, entity, site and before/after data when applicable.

## 18. Host metrics security boundary

VPS host metrics are collected by a root-owned host service into a filtered snapshot. The API container receives only that snapshot directory read-only. The application/browser is not given the Docker socket, `/proc` from the host, SSH access, database host port, or arbitrary filesystem access.

The Super Admin metrics endpoint is capability-gated by `system.super_admin` and may expose only operational capacity data such as CPU/load, memory, disk/inodes, service health, network byte counters/rates, backup footprint, PostgreSQL logical size/connections, schema/release and table/index sizes. Secrets, environment variables, credentials, command output and unrestricted process/container metadata are forbidden.

Host network counters describe traffic observed by the operating system. They do not establish a VPS provider's monthly billing quota; that value must be configured separately if the provider plan has a traffic cap.
