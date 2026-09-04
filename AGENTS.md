# AGENTS.md — Kitchen OS Engineering Contract

This file is mandatory guidance for every human engineer and AI coding agent working in this repository.

Primary specification: `docs/SYSTEM_SPECIFICATION.md`
Supporting rules:
- `docs/DEVELOPMENT_RULES.md`
- `docs/INVENTORY_TRANSFER_SPEC.md`
- `docs/DATABASE_PERSISTENCE_AUDIT.md`

## 1. Read the spec first

Before changing code, identify the affected section of `docs/SYSTEM_SPECIFICATION.md`.

If the requested behavior differs from the current specification:
1. update the specification first;
2. write acceptance criteria/examples;
3. then change code and tests.

Do not implement a new interpretation only from conversation context while leaving the canonical spec unchanged.

## 2. Never remove existing behavior accidentally

A fix/refactor must not silently remove:
- admin functions;
- branch inventory controls;
- central-kitchen operations;
- mobile controls;
- desktop controls;
- persistence/sync;
- authentication/permission enforcement;
- audit history.

If intentional removal is required, it must be explicitly documented in the spec and tested.

## 3. PostgreSQL is the shared source of truth

Business data that is shared across devices must persist through the VPS API into PostgreSQL.

`localStorage` is cache/fallback/UI state only.

Never report a save as successful merely because local cache changed.

Never overwrite newer server stock with stale browser state.

## 4. Database changes

Do not rewrite an already-applied production migration to change history.

For schema changes:
1. add a new numbered migration;
2. make it backward compatible where practical;
3. preserve existing data;
4. update docs;
5. add/adjust API regression tests;
6. verify backup/restore implications.

No destructive migration without explicit product approval and a recovery plan.

## 5. Inventory invariants

All stock mutations must preserve these invariants:

- quantity never becomes negative;
- source availability is validated server-side;
- multi-row stock movement is atomic;
- same-site transfer does not change total physical stock;
- cross-site shipment decrements and increments as one transaction;
- receiving-location policy belongs to the receiving branch;
- actor/timestamp/action/item/amount/source/destination are auditable;
- server/database failure must not leave a fake successful UI state.

Do not change the semantics of:
- `領貨` = storage -> use/work stock;
- `使用` = actual consumption;
- `歸位` = use/work stock -> storage;
- `庫存轉撥` = same-site storage movement;
- `出貨` = cross-site shipment.

## 6. Permissions

Every permission-sensitive feature must be enforced in both:
- frontend interaction/visibility;
- backend/API authorization.

Test at minimum:
- admin;
- one restricted account;
- correct site scope.

A hidden button is not authorization.

## 7. Cross-device and responsive requirement

Every functional UI change must be verified on desktop and mobile.

Critical inventory and Save controls must not disappear, clip, or become unreachable at small widths.

Check representative mobile widths and landscape when the changed layout can be affected.

## 8. Synchronization

After changes involving shared business data, verify:
- one-device write;
- second-device/fresh-session read;
- focus/visibility refresh;
- active-site switching;
- stale state convergence;
- no unintended device-data erasure from partial server state.

## 9. Service worker/release cache

When frontend assets change, ensure release/service-worker cache behavior cannot serve mixed versions.

Do not solve cache problems by deleting business data.

## 10. Mandatory validation before completion

Run all applicable checks:

1. syntax/static validation;
2. automated regression tests;
3. backend/API regression tests when backend/database is affected;
4. database persistence round-trip;
5. auth/session test when auth is affected;
6. permission test;
7. inventory atomicity/audit test when inventory is affected;
8. desktop browser smoke test;
9. mobile browser smoke test;
10. production smoke test after deployment.

A feature is not complete just because the edited page looks correct locally.

## 11. Git discipline

Every completed stage must be committed to GitHub with the complete coherent change set.

Do not leave required migration, test, module include, service-worker reference, or documentation change outside the commit.

## 12. Definition of Done

A change is `DONE` only when:
- implementation matches the canonical spec;
- data persists correctly;
- permissions are correct;
- regression tests pass;
- mobile and desktop behavior is verified;
- existing adjacent functions remain present;
- documentation is current;
- GitHub contains the completed change;
- deployed production behavior passes smoke verification when deployment is part of the task.

Otherwise report the exact remaining failure and keep status `NOT DONE`.
