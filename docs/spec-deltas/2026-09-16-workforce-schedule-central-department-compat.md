# Workforce Schedule Central Department Compatibility

## Problem

The legacy workforce UI normalizes schedule departments to `inside` or `outside` for every site. Database Core v2 intentionally models the central kitchen with the canonical department code `kitchen`, while branch sites use `inside` and `outside`.

Production verify-only backfill therefore blocked the central schedule with `invalid_department` even though the legacy `inside` value represents central-kitchen work in the old model.

## Compatibility rule

During relational Schedule backfill only:

- `central + inside` maps to canonical department `kitchen`.
- A missing Schedule department still follows the legacy Schedule default `inside`, and therefore maps to `kitchen` for `central`.
- Branch sites preserve `inside` / `outside` unchanged.
- `central + outside` and any other unsupported department remain invalid and block verification/apply.
- Approved override exceptions use the same site-aware mapping when an explicit legacy `inside` department exists.

This does not add `inside` as a central relational department and does not weaken the `(site_code, department_code)` foreign key.

## Safety and authority

- `business_state.modules.schedule` remains the runtime/write authority in this phase.
- The compatibility rule is a deterministic migration transform only; it does not rewrite legacy Schedule JSON.
- Staff identity continues to resolve only through same-site `staff_members.legacy_staff_id`; no display-name guessing is introduced.
- Production Schedule `--apply` remains blocked until Staff relational data has been applied and verify-only Schedule parity returns zero blocking diagnostics.
- Production apply continues to require a server-side backup through the maintenance workflow.

## Regression requirements

The relational Schedule regression must prove that:

1. `central + inside` verifies successfully when the referenced Staff relational identity exists.
2. Apply persists `department_code = kitchen`.
3. `central + outside` still produces `invalid_department` and a blocked verify-only exit.
4. Verify-only mode does not mutate previously migrated relational rows.
