# Spec delta — Per-module business-state optimistic concurrency

Status: approved implementation scope for the business-state concurrency phase.
Parent specification: `docs/SYSTEM_SPECIFICATION.md`, especially the VPS/PostgreSQL authority and multi-device synchronization requirements.

## Problem

`public.business_state` currently stores all non-inventory business modules for one site in one JSONB row. The backend serializes writes with `FOR UPDATE` and merges incoming top-level modules, which correctly prevents two different modules from erasing one another. It does not, however, know whether the same top-level module changed after a browser last read it.

Example:

1. device A and device B both read `reservations`;
2. A edits one reservation and saves;
3. B still holds the older `reservations` snapshot, edits another reservation and saves;
4. the current API accepts B and replaces the whole `reservations` module, potentially erasing A's newer change.

This phase must stop that silent last-write-wins data loss.

## Scope

Implement optimistic concurrency per top-level business module.

This phase does not:

- change inventory transaction semantics;
- introduce third-party realtime infrastructure;
- normalize every business record into new SQL tables;
- auto-resolve two users changing the same logical field;
- silently discard a local conflicting edit;
- perform the whole-app renderer refactor.

## Database contract

Add migration `006_business_module_revisions.sql`.

`public.business_state` gains:

- `module_revisions jsonb not null default '{}'::jsonb`.

The existing site-level `revision bigint` remains. It continues to represent overall row freshness for read polling and unchanged-read short-circuiting.

`module_revisions` is the concurrency token map for top-level modules, for example:

```json
{
  "settings": 7,
  "reservations": 12,
  "attendance": 4
}
```

Migration backfill must assign every already-stored top-level module a non-negative revision derived from the current row revision. Existing business payloads must not be rewritten or dropped.

## GET API contract

`GET /api/business-state/:site` continues to return:

- `site`;
- permission-filtered `modules`;
- global `revision`;
- `updatedAt`.

It additionally returns:

- `moduleRevisions` containing only top-level modules the current user is permitted to view.

A module absent from `moduleRevisions` is treated as revision `0` only when that module is not currently stored on the server.

## POST API contract

`POST /api/business-state/:site` must receive:

```json
{
  "modules": { "settings": {} },
  "expectedModuleRevisions": { "settings": 7 }
}
```

For every requested top-level module, the request must carry an expected module revision.

Cached/legacy clients that omit expected revisions must not be allowed to perform an unguarded write. The API returns a conflict-class response instead of silently reverting to last-write-wins.

## Transaction semantics

Inside the existing site-row transaction and `FOR UPDATE` lock:

1. read current `modules`, global `revision`, and `module_revisions`;
2. determine modules the user is actually authorized to edit;
3. verify each editable incoming module's expected revision equals the current server revision for that module;
4. if any editable module is stale, perform no business-state update;
5. otherwise merge the authorized top-level modules as today;
6. increment only the saved modules' module revisions by one;
7. increment the global site revision by one;
8. write audit metadata for the confirmed save.

This means concurrent writes to different top-level modules can both succeed even when the global site revision changes between them.

## Conflict response

A stale module write returns HTTP `409` with:

- `error: "BUSINESS_STATE_CONFLICT"`;
- `site`;
- `conflictingModules`;
- current server `moduleRevisions` for those conflicting modules;
- current server `modules` for those conflicting modules, filtered to data the caller may view.

No conflicting payload is written to PostgreSQL.

A request that does not provide required expected revisions returns HTTP `409` with:

- `error: "BUSINESS_STATE_REVISION_REQUIRED"`;
- `site`;
- `missingModules`.

## Successful write response

A successful POST continues to require:

- `ok: true`;
- `savedModules`;
- global `revision`;
- `updatedAt`.

It additionally returns:

- `moduleRevisions` for every confirmed saved module.

A frontend write is not fully confirmed unless each dirty saved module has both:

- membership in `savedModules`; and
- a valid returned module revision.

## Frontend synchronization contract

For the currently loaded exact `userId + site` scope, business synchronization tracks the last authoritative per-module revision map returned by VPS.

When saving dirty modules:

- send only the existing dirty top-level modules;
- send expected revisions only for those dirty modules;
- never infer an expected revision from the global site revision;
- after confirmed success, update the local revision tokens only for confirmed saved modules;
- preserve the existing rule that the POST global revision is not used to skip the next authoritative GET merge.

On identity/site change, per-module revision state must reset with the rest of the loaded business scope.

## Conflict behavior in the browser

If VPS returns `BUSINESS_STATE_CONFLICT`:

- the local current business edit remains in memory/local browser state;
- the synchronization chain reports persistence `error` for the exact current user/site;
- no automatic GET may merge the remote conflicting module over the local edit after that failed save;
- no `saved` state may be emitted;
- safe reload and site switching remain blocked by the existing save-before-transition guard while the local edit is unresolved;
- the visible persistence warning explains that a newer server version exists and that overwrite was blocked.

This phase prioritizes preventing silent data loss. It does not invent an automatic winner for a true same-module conflict.

## Bilingual conflict message

Vietnamese meaning:

`Dữ liệu này đã được thiết bị hoặc người dùng khác cập nhật. Hệ thống đã chặn ghi đè; thay đổi hiện tại chưa được lưu vào PostgreSQL.`

Traditional Chinese meaning:

`此資料已被其他裝置或使用者更新。系統已阻止覆寫；目前變更尚未儲存至 PostgreSQL。`

For `BUSINESS_STATE_REVISION_REQUIRED`, the message should explain that the current browser session lacks a valid concurrency token and must not assume the write succeeded.

## Authorization and privacy

- Module revision metadata follows the same view/edit permission boundary as module data.
- Conflict responses must not expose modules the current user cannot view.
- Server authorization always wins over expected revision metadata supplied by the client.
- Revision numbers are concurrency metadata, never authorization grants.

## Migration / rollback safety

- The migration is additive; no existing business payload is deleted.
- Deployment still creates the normal pre-deploy PostgreSQL backup.
- Production integrity verification must require schema `006` or newer and verify `business_state.module_revisions` is non-null JSON object data.
- Old cached POST clients are rejected rather than allowed to bypass the new concurrency contract.

## Acceptance criteria

1. Migration preserves every existing `business_state.modules` payload and backfills module revision tokens.
2. GET returns permission-filtered `moduleRevisions`.
3. Two clients reading the same module revision: first save succeeds, second stale save returns `409 BUSINESS_STATE_CONFLICT`, and the first saved payload remains authoritative.
4. Two clients saving different modules from the same initial site snapshot both succeed; no false conflict is created by the global row revision changing.
5. POST without required expected module revisions is rejected and writes nothing.
6. Unauthorized module writes remain rejected/omitted exactly as existing permission rules require; revision metadata cannot bypass permissions.
7. Client sends expected revisions for dirty modules only.
8. Client accepts `saved` only when `savedModules` and returned `moduleRevisions` confirm every dirty module.
9. Client conflict preserves the current local edit, emits persistence error, and does not perform a stale reload afterward.
10. No-op focus/resume with no dirty business module performs no write and creates no conflict lifecycle.
11. Existing cross-module concurrency, inventory concurrency, authorization-boundary recovery, persistence-status, desktop/mobile and full-device regressions remain green.
12. Production deploy applies migration 006 with backup, data-integrity verification, exact-SHA health/release check and production UI smoke before this phase is marked DONE.
