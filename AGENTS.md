# AGENTS.md — Kitchen OS Engineering Contract

This file is mandatory guidance for every human engineer and AI coding agent working in this repository.

Primary specification: `docs/SYSTEM_SPECIFICATION.md`
Supporting rules:
- `docs/DEVELOPMENT_RULES.md`
- `docs/FRONTEND_DATA_RULES.md`
- `docs/PERFORMANCE_RULES.md`
- `docs/INVENTORY_TRANSFER_SPEC.md`
- `docs/DATABASE_PERSISTENCE_AUDIT.md`

## 1. Read the spec first

Before changing code, identify the affected section of `docs/SYSTEM_SPECIFICATION.md` and the applicable supporting rule documents.

If the requested behavior differs from the current specification:
1. update the specification/rule first;
2. write acceptance criteria/examples;
3. then change code and tests.

Do not implement a new interpretation only from conversation context while leaving the canonical repository documentation unchanged.

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

All shared business data must persist through the Kitchen OS VPS API into PostgreSQL.

`localStorage`, IndexedDB, service-worker cache and in-memory state are cache/fallback/UI state only unless a future explicit specification says otherwise.

Never report a save as successful merely because local cache changed.

Never overwrite newer server state with stale browser state.

## 4. Every interactive control must have a verified result

A button is not complete just because it renders or receives a click event.

For every data-changing action:
- show pending/processing state where appropriate;
- send the operation through the VPS API;
- validate permission/input/business rules server-side;
- persist the database change;
- show success only after VPS confirmation;
- show a useful error on validation, permission, network, API or database failure;
- reconcile the visible state with the server result;
- prevent accidental duplicate submissions where relevant.

Fake-success UI states are prohibited.

## 5. Frontend and responsive standard

All text, buttons, forms, cards, modals, tables, alerts and navigation must follow the responsive/component rules in `docs/FRONTEND_DATA_RULES.md`.

Bootstrap-style responsive standards are required. If Bootstrap itself is used, it must be self-hosted with the application; do not add a third-party Bootstrap CDN dependency.

Long Vietnamese/Traditional Chinese labels and user-entered text must remain readable. Prefer wrapping, stacking, responsive sizing and safe overflow over clipping or hiding important text.

Equivalent desktop/mobile layouts may rearrange, but must preserve the same functional meaning and access unless an explicit product rule says otherwise.

## 6. Performance and frame stability

Every frontend/data-sync change must also follow `docs/PERFORMANCE_RULES.md`.

A change is incomplete if it causes visible lag, frame drops, repeated flashes, unnecessary full-page reloads, self-triggering DOM observer loops, avoidable whole-application rerenders, or unchanged VPS state to be merged/rendered again.

At minimum review:
- route/module switching;
- Central/Fuxing/Yongji switching;
- data entry and save flows;
- focus/visibility refresh;
- inventory polling;
- translation/DOM patching;
- modal/table/list rendering;
- desktop and mobile scroll/frame stability.

Fix root causes rather than masking lag with arbitrary delays.

## 7. Database changes

Do not rewrite an already-applied production migration to change history.

For schema changes:
1. add a new numbered migration;
2. make it backward compatible where practical;
3. preserve existing data;
4. update docs;
5. add/adjust API regression tests;
6. verify backup/restore implications.

No destructive migration without explicit product approval and a recovery plan.

## 8. Inventory invariants

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

## 9. Permissions

Every permission-sensitive feature must be enforced in both:
- frontend interaction/visibility;
- backend/API authorization.

Test at minimum:
- admin;
- one restricted account;
- correct site scope.

A hidden button is not authorization.

## 10. Cross-device and translation consistency

Every functional UI change must be verified on desktop and mobile.

Critical controls must not disappear, clip, become unreadable or become unreachable at small widths.

The same account/site must converge to the same:
- data;
- permissions;
- business rules;
- module visibility;
- language preference;
- translated labels;
- action semantics;
- audit/history.

New UI text must enter the translation catalog and be checked for responsive overflow.

## 11. Cross-module and cross-branch synchronization

Shared business facts must not be maintained as independent unsynchronized copies.

Review all affected dependencies, including examples such as:
- inventory <-> procurement/shortage alerts;
- reservations <-> preparation/staffing;
- SOP revision <-> training/skills qualification;
- schedules <-> staffing assessment.

Equivalent features in Central Kitchen, Fuxing and Yongji must remain functionally consistent unless the canonical spec explicitly defines a branch-specific difference.

A common feature fix must include a branch-parity review.

## 12. VPS-only runtime authority

Core runtime architecture is:

`Browser/UI -> Kitchen OS VPS API -> PostgreSQL`

Do not introduce Supabase, Firebase or another parallel hosted backend as an authoritative runtime path without an explicit architecture-spec change.

Core authentication, permission, inventory mutation, business-state persistence and critical synchronization must remain under Kitchen OS VPS control.

GitHub is the approved external service for source-code storage, version history, CI/CD workflow and deployment source.

Any other external integration must be documented and must not silently become the authoritative business-data processor.

## 13. Synchronization

After changes involving shared business data, verify:
- one-device write;
- second-device/fresh-session read;
- focus/visibility refresh;
- active-site switching;
- stale state convergence;
- no unintended device-data erasure from partial server state.

## 14. Service worker/release cache

When frontend assets change, ensure release/service-worker cache behavior cannot serve mixed versions.

Do not solve cache problems by deleting business data.

## 15. Mandatory validation before completion

Run all applicable checks:

1. syntax/static validation;
2. automated regression tests;
3. backend/API regression tests when backend/database is affected;
4. database persistence round-trip;
5. auth/session test when auth is affected;
6. permission test;
7. inventory atomicity/audit test when inventory is affected;
8. desktop browser smoke test;
9. mobile browser smoke test across representative breakpoints;
10. long-label/bilingual responsive test;
11. cross-module dependency test when shared facts change;
12. branch-parity test when a shared branch feature changes;
13. route/data/focus performance regression review;
14. production smoke test after deployment.

A feature is not complete just because the edited page looks correct locally.

## 16. Git discipline

Every completed stage must be committed to GitHub with the complete coherent change set.

Do not leave required migration, test, module include, service-worker reference, translation, documentation or dependency update outside the commit.

## 17. Definition of Done

A change is `DONE` only when:
- implementation matches the canonical spec;
- every changed control produces correct pending/success/error behavior;
- VPS/API confirms data-changing success;
- PostgreSQL persistence is verified;
- permissions are correct frontend and backend;
- cross-module dependencies remain synchronized;
- branch-equivalent behavior remains consistent unless explicitly exempted;
- responsive desktop/mobile behavior and translations are verified;
- performance/frame-stability regression checks pass for affected flows;
- regression tests pass;
- existing adjacent functions remain present;
- documentation is current;
- GitHub contains the completed change;
- deployed production behavior passes smoke verification when deployment is part of the task.

Otherwise report the exact remaining failure and keep status `NOT DONE`.
