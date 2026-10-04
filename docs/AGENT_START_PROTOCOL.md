# Kitchen OS Agent Start Protocol

Version: 1.0  
Purpose: deterministic startup sequence for a new chat, coding agent or developer with no prior context.

## Trigger

Run this protocol before implementing any new feature, bug fix, refactor, database change or production repair.

## Phase A — Recover project state

Read in this order:

1. `docs/CURRENT_HANDOFF.md`
2. `docs/ENGINEERING_CONTRACT.md`
3. `docs/FEATURE_REGISTRY.md`
4. `docs/VERIFICATION_MATRIX.md`
5. `docs/DEVELOPMENT_RULES.md`
6. `docs/STATUS.md`
7. relevant recent entries in `docs/WORK_LOG.md`

Then query live GitHub/VPS state:

- `main` SHA;
- explicit `ACTIVE_PR`;
- active PR head/base SHA;
- exact-head workflow results;
- production release;
- schema;
- AgentMemory health/recall status.

Do not infer the active PR from recency.

## Phase B — Classify the requested change

Identify:

- feature/module;
- user-visible flows affected;
- API endpoints involved;
- PostgreSQL tables/data authority involved;
- roles/sites affected;
- whether the change is UI-only, runtime logic, DB/schema, RBAC, deployment, or mixed.

Use `FEATURE_REGISTRY.md` as the starting map, then inspect source before changing anything.

## Phase C — Baseline before modification

When practical:

- reproduce the issue/request;
- run the smallest relevant existing regression;
- record pre-existing failures;
- verify current production/main behavior if the task depends on a production bug.

A new failure after the patch must not be dismissed as pre-existing without baseline evidence.

## Phase D — Implement with minimum scope

- prefer the smallest correct change;
- preserve existing stable handlers and data lifecycle;
- do not duplicate backend/business state into frontend constants;
- add/extend a regression test for the user-visible failure mode;
- update feature registry/verification matrix when a new invariant or test surface is introduced.

## Phase E — Verify the user path

For each touched path, verify applicable items:

1. control exists/visible/enabled;
2. click/input works;
3. expected list/card/modal state changes;
4. API response is correct;
5. DB-backed state is correct;
6. F5/reload preserves persisted data;
7. no unexpected SPA full reload;
8. no page error / unexpected API failure;
9. role/site restrictions are correct;
10. desktop/mobile layout is usable.

## Phase F — Exact-head gate

Before merge:

- confirm PR head SHA;
- confirm required workflows belong to that exact SHA;
- require all mandatory workflows green;
- do not add commits after the green run without rerunning gates.

## Phase G — Production gate

After merge of runtime code:

- deploy exact merge SHA;
- verify `/api/health`;
- verify release SHA and schema;
- require `DATA_INTEGRITY_OK`;
- run production UI smoke;
- run module-specific production audit when available;
- confirm no rollback occurred.

Documentation-only changes may not require VPS deployment, but must not change the recorded runtime authority.

## Phase H — Close the loop

Update:

- `CURRENT_HANDOFF.md`;
- `STATUS.md`;
- `WORK_LOG.md`;
- relevant feature/test registry when changed;
- AgentMemory handoff sync.

A new chat should be able to continue using only the canonical handoff plus these engineering documents.
