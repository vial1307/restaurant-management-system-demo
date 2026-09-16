# Workforce Schedule Central Department Compatibility

Date: 2026-09-16

## Context

The legacy workforce schedule UI normalizes schedule departments to `inside` or `outside`. The relational database model uses site-scoped departments, and the `central` site has the canonical active department `kitchen`.

Production verification found one central legacy schedule whose department was `inside`. Treating that value literally blocks the relational Schedule backfill even though the value was produced by the legacy UI's branch-oriented normalization.

## Compatibility rule

During the legacy `business_state.modules.schedule` to relational Schedule backfill:

- For site `central`, legacy department `inside` maps deterministically to canonical department `kitchen` when `kitchen` is active for that site.
- A missing department on a legacy schedule follows the legacy schedule default of `inside`, then maps to `kitchen` for `central`.
- The same `central: inside -> kitchen` mapping applies to published schedule snapshots and approved override exceptions.
- Blank override departments remain invalid because an override requires an explicit department.
- `outside` and any other unknown department at `central` remain blocking validation errors. The backfill must not guess arbitrary mappings.
- Branch sites continue using their own active `inside` / `outside` department codes without conversion.

## Safety boundary

This change is compatibility-only. It does not:

- mutate the legacy `business_state` Schedule authority;
- create an `inside` department for `central`;
- infer or guess staff identity;
- relax `staff_members.legacy_staff_id` resolution;
- apply production backfill automatically;
- switch API or frontend Schedule authority to relational tables.

Production writes remain gated by a clean verify-only run, mandatory database backup, transactional apply, parity/idempotency verification, and production health checks.

## Regression requirements

The relational Schedule regression must prove that:

1. a central legacy schedule with department `inside` verifies without `invalid_department` once staff identity is resolvable;
2. apply stores canonical `department_code = 'kitchen'` for draft, publication snapshot, and approved override rows;
3. an unsupported central department such as `outside` remains blocked with `invalid_department`.
