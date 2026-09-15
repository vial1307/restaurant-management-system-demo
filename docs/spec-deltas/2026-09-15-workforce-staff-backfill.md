# Workforce staff identity backfill — 2026-09-15

Status: implementation target after Database Core v2 schema 010-013.

## Scope

This phase backfills only workforce identity master data from the legacy `business_state.modules.shared.staff` roster into `staff_members` and `user_staff_bindings`.

It does **not** switch schedule, attendance, payroll, or frontend authority away from `business_state` yet.

## Source and target authority

During this phase:

- `business_state.modules.shared.staff` remains the compatibility/source authority for legacy staff roster fields;
- `staff_members` is populated as the future relational identity master;
- `user_staff_bindings` stores only deterministic one-account-to-one-staff mappings;
- `data_migration_checkpoints` records source revision, row counts and checksum for each site;
- no API is allowed to maintain an independent second writable roster authority.

## Identity rules

1. `(site_code, legacy_staff_id)` identifies a migrated legacy staff row.
2. Existing safe legacy IDs are reused as `staff_code`; unsafe IDs receive a deterministic hash-based code.
3. Login identity and worker identity remain separate concepts.
4. A binding may be created only when exactly one account is resolved by, in order: explicit user ID, explicit username, or a unique display-name match.
5. Ambiguous matches are left unbound; the migration must not guess.
6. Existing incompatible bindings fail the apply transaction instead of being silently overwritten.
7. PIN/password-like legacy values are not copied into relational metadata.

## Binding diagnostics

Verify and apply reports must expose aggregate binding outcomes without printing staff names, usernames, IDs, passwords, PINs, or other sensitive roster data.

The stable outcome classes are:

- `bound`: exactly one eligible account was resolved and may be bound;
- `no_match`: a deterministic lookup key existed but no eligible account matched it;
- `ambiguous`: more than one eligible account matched, so the row must remain unbound;
- `claimed`: the only matching account was already claimed by another staff row in the same migration plan;
- `missing_identity`: the legacy row provided no usable account key or display name.

The report must also aggregate the attempted match method (`explicit_user_id`, `explicit_username`, `display_name`, or `none`). A non-`bound` outcome must never be converted into a guessed binding during apply. The same aggregate diagnostics are persisted in the migration checkpoint after a successful apply.

## Employment data rules

- Explicit valid legacy `employmentType` values are preserved.
- Legacy role `parttime` maps to employment type `parttime`; `intern` maps to `intern`.
- Generic role labels such as `employee`, `manager`, or `supervisor` do not prove full-time employment and therefore map to neutral `other` unless explicit employment-type data exists.
- Hourly rate must be non-negative; invalid legacy values are normalized to zero pending later business review.
- Department is migrated only when it matches an active department configured for the same site.

## Execution contract

`vps/backend/scripts/workforce-staff-backfill.mjs` defaults to verify-only mode.

- Without `--apply`, it reads and reports but performs no writes.
- `--apply` performs each site's backfill in one PostgreSQL transaction.
- `--site=<code>` limits execution to one site.
- The operation is idempotent: rerunning the same source updates mutable staff master fields but preserves relational staff identity and does not duplicate account bindings.
- A successful site transaction records checkpoint status `verified` with source `shared` module revision and SHA-256 checksum.

## Production orchestration

Production automation must avoid racing the deployment that installs the backfill script.

- Automatic verification is triggered only after `Deploy Kitchen OS to VPS` completes successfully for `main`.
- The automatic run is verify-only; it may not enter apply mode.
- A deployment-triggered verification must pin the deployment workflow `head_sha` and require the public `RELEASE` marker to equal that deployed SHA.
- Before verify or apply, the workflow must require the public release marker to match the VPS repository HEAD and require the checked-out backfill script SHA-256 to match the script on the VPS.
- `apply` remains `workflow_dispatch` only and must create the mandatory database backup before any relational write.
- Production health must be checked again after verify or apply.

## Safety / cutover boundary

This phase is additive. It must not delete legacy staff rows, change existing workforce authorization behavior, or make relational tables authoritative for schedule/attendance/payroll.

The next workforce phases may proceed only after production backfill reports are reviewed for unresolved/ambiguous bindings and relational-vs-legacy parity can be demonstrated.

## Acceptance

- Fresh PostgreSQL 16 regression setup can run the backfill.
- Verify-only mode writes no staff rows.
- Verify reports distinguish deterministic binding outcomes without exposing roster identity details.
- Apply creates one relational row per valid legacy staff ID.
- A second apply does not create duplicate staff or binding rows and preserves UUID identity.
- Mutable master fields can refresh from a later source revision before authority cutover.
- Explicit username binding is deterministic.
- Generic employee role is not incorrectly converted to full-time employment.
- A verified migration checkpoint records source revision, row counts, checksum and aggregate binding diagnostics.
- Production auto-verification cannot race deployment and cannot enter apply mode.
