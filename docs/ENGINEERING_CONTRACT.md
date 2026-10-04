# Kitchen OS Engineering Contract

Version: 1.0  
Authority: mandatory for every human or AI coding session that changes Kitchen OS.

## 1. Authority order

When sources disagree, use this order:

1. The user's explicit current instruction.
2. `docs/CURRENT_HANDOFF.md` for the active workstream and production continuation state.
3. This Engineering Contract.
4. `docs/FEATURE_REGISTRY.md` and `docs/VERIFICATION_MATRIX.md`.
5. Current source code, tests and PostgreSQL/VPS runtime evidence.
6. AgentMemory recall.

AgentMemory is retrieval context only. It never overrides GitHub handoff or PostgreSQL/VPS runtime authority.

## 2. Non-negotiable engineering rules

- PostgreSQL/VPS is the runtime source of truth for business data and configuration.
- Do not hard-code inventory items, branches, roles, permissions, quantities, work areas, storage locations or other mutable business data into frontend code to fix a UI/data problem.
- Do not rewrite stable behavior when a scoped repair is sufficient.
- Preserve auditability: data mutations must continue through approved API/database lifecycle paths.
- Never mark a task DONE because code compiles or a screenshot looks correct.
- Never merge a commit that is different from the exact head SHA that passed the required checks.
- Never call a release production-verified until the VPS reports the intended release and post-deploy smoke/integrity checks pass.
- Do not weaken, skip, delete or relax a regression test merely to make a change green without proving the old expectation is obsolete.

## 3. Mandatory start-of-work baseline

Before changing code, the engineer/agent must:

1. Read `CURRENT_HANDOFF.md`, this contract, `AGENT_START_PROTOCOL.md`, `FEATURE_REGISTRY.md`, and `VERIFICATION_MATRIX.md`.
2. Resolve the active PR from `ACTIVE_PR`; do not automatically choose the newest open PR.
3. Record current main SHA, active PR head SHA, production release and schema.
4. Identify the feature/module contract that will be touched.
5. Reproduce the requested behavior or establish a baseline test result before modification when practical.
6. Separate pre-existing failures from failures introduced by the current change.
7. Declare scope: files/modules expected to change and invariants that must not change.

## 4. UI interaction contract

For every changed user path, verify all applicable items:

- target button/link/tab/select/list/form exists;
- target is visible and enabled when the role/state permits it;
- click/input actually changes the expected UI state;
- list/filter/sort/pagination returns the expected records;
- mutation reaches the intended API and receives an acceptable response;
- UI reflects the persisted result, not only an optimistic/local state;
- browser reload/F5 preserves persisted data when persistence is expected;
- no unexpected full-document reload occurs for an SPA-only interaction;
- URL/route changes are correct for navigation interactions;
- no uncaught `pageerror`;
- no unexpected same-origin API 5xx/request failure on the tested path;
- no horizontal overflow or unusable controls on required device profiles;
- related views stay synchronized when the same DB record is visible in Website and Super Admin.

A button merely being present is not evidence that the feature works.

## 5. Persistence contract

For every business-data mutation:

`UI action -> API -> PostgreSQL -> UI refresh -> browser reload -> same persisted value`

When multiple surfaces expose the same entity, also verify:

`Website -> DB -> Super Admin` and `Super Admin -> DB -> Website`

as applicable.

## 6. RBAC contract

Every feature with permissions must test both positive and negative access:

- an allowed role can see/use the function;
- a restricted role cannot use it;
- site-scoped roles cannot mutate another site;
- Super Admin behavior is not used as proof that branch roles work.

## 7. Regression contract

A change must run the targeted tests for the touched module and the repository-required gates. The default release gate includes:

- static/source contract regression;
- PostgreSQL/API regression;
- relevant module mutation/persistence regression;
- Desktop/mobile Chromium regression;
- Super Admin browser regression when Super Admin is touched;
- full-device cross-browser regression;
- production health/release verification after merge;
- `DATA_INTEGRITY_OK`;
- production UI smoke;
- module-specific production audit when one exists.

## 8. Definition of Done

A feature may be marked DONE only when all applicable conditions are true:

- implementation complete;
- expected UI behavior verified;
- persistence/F5 verified for mutations;
- RBAC positive/negative behavior verified where applicable;
- no unexpected reload/page crash;
- relevant API/database integrity verified;
- exact-head required CI is green;
- merge contains the tested head;
- exact merge SHA is deployed when runtime code changed;
- production release/schema are verified;
- production smoke/audit is green;
- handoff/status/work log updated;
- AgentMemory handoff sync is current.

Otherwise use an explicit intermediate state such as `CODE COMPLETE / NOT VERIFIED`, `CI BLOCKED`, or `DEPLOY BLOCKED`.

## 9. Evidence requirement

Every completed engineering task must be traceable to evidence:

- branch/PR;
- tested head SHA;
- required workflow run(s);
- merge SHA;
- deployed release SHA if applicable;
- schema;
- relevant regression/audit result;
- screenshots only as supplementary evidence, never as the sole proof of business behavior.

## 10. Failure handling

If a gate fails:

1. identify the first concrete failure;
2. determine whether it is introduced, pre-existing or flaky;
3. fix the root cause when introduced;
4. rerun the unchanged exact head when evidence supports a transient/flaky failure;
5. never claim completion while the required gate remains unresolved.
