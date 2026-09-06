# Spec delta — Per-module business-state optimistic concurrency

Status: approved implementation scope for the business-state concurrency phase.
Parent specification: `docs/SYSTEM_SPECIFICATION.md`, especially the VPS/PostgreSQL authority and multi-device synchronization requirements.

## Problem

`public.business_state` stores all non-inventory business modules for one site in one JSONB row. The backend already serializes writes with `FOR UPDATE` and merges incoming top-level modules, so different modules do not erase one another. It does not know whether the same top-level module changed after a browser last read it.

Example:

1. device A and device B both read `reservations`;
2. A saves a new reservations snapshot;
3. B still holds the older snapshot and saves later;
4. without a module token, B can replace the whole `reservations` module and erase A's change.

This phase must stop that silent last-write-wins data loss.

## Scope

Implement optimistic concurrency per top-level business module.

This phase does not:

- change inventory transaction semantics;
- introduce third-party realtime infrastructure;
- normalize every business record into separate SQL tables;
- auto-select a winner for two users changing the same normal business module;
- silently discard a local conflicting edit;
- perform the whole-app renderer refactor.

## Database contract

Migration `006_business_module_revisions.sql` adds:

- `business_state.module_revisions jsonb not null default '{}'::jsonb`.

The existing site-level `revision bigint` remains and continues to represent overall row freshness for read polling / unchanged-read short-circuiting.

`module_revisions` is the concurrency token map for top-level modules, for example:

```json
{
  "settings": 7,
  "reservations": 12,
  "attendance": 4
}
```

Migration backfill assigns every already-stored top-level module a non-negative token derived from the current row revision. Existing `modules` payloads are not rewritten or deleted.

## GET API contract

`GET /api/business-state/:site` continues to return:

- `site`;
- permission-filtered `modules`;
- global `revision`;
- `updatedAt`.

It additionally returns `moduleRevisions` for modules the caller may view.

For a viewable module that is not currently stored on the server, GET returns an explicit revision token `0`. If a module is stored but its revision metadata is absent/invalid, GET must not invent `0`; the token is omitted so subsequent writes are rejected and production integrity checks can surface the corrupted baseline.

## POST API contract

Normal business writes use:

```json
{
  "modules": { "settings": {} },
  "expectedModuleRevisions": { "settings": 7 }
}
```

For every editable normal top-level module in the request, a valid non-negative expected revision is required. A cached/legacy client that omits required tokens is rejected instead of falling back to unguarded last-write-wins.

Missing required tokens return HTTP `409`:

```json
{
  "error": "BUSINESS_STATE_REVISION_REQUIRED",
  "site": "fuxing",
  "missingModules": ["settings"]
}
```

## Transaction semantics for normal modules

Inside the existing site-row transaction and `FOR UPDATE` lock:

1. read current `modules`, global `revision`, and `module_revisions`;
2. determine modules the user is actually authorized to edit;
3. verify each editable normal module's expected revision equals the current server revision;
4. if any normal module is stale, perform no business-state update;
5. otherwise merge the authorized top-level modules;
6. increment only confirmed saved modules' module revisions;
7. increment global site revision once;
8. write audit metadata for the confirmed save.

Concurrent writes to different normal modules can therefore both succeed even when global row revision changes between them.

## Conflict response

A stale normal module write returns HTTP `409`:

- `error: "BUSINESS_STATE_CONFLICT"`;
- `site`;
- `conflictingModules`;
- current server `moduleRevisions` for conflicting modules the caller may view;
- current server `modules` for conflicting modules the caller may view.

No conflicting business payload is written to PostgreSQL.

## Audit log exception

`audit` is not ordinary replaceable business state. Store actions append audit entries with unique IDs, and some employees are allowed to create audit entries without being allowed to view the protected audit history.

Requiring a normal read token for `audit` would create two bad outcomes:

- employees could not safely obtain a token for a payload they may not view; and
- harmless concurrent audit appends could block primary writes such as attendance or preparation.

Therefore `audit` uses conflict-free append semantics inside the same row lock:

- incoming and current audit arrays are unioned by unique entry `id`;
- an already persisted server entry wins if an incoming entry reuses the same `id`, so prior audit content is immutable;
- entries are sorted newest-first by `at`;
- at most 500 entries are retained;
- audit append does not require an expected module revision;
- its module revision still increments on confirmed append;
- audit payload remains hidden from users who lack audit view permission;
- a successful writer may receive the revision token for the audit module it just saved, but the token itself is not an authorization grant and exposes no audit payload.

This exception removes last-write-wins from audit while preventing audit metadata from blocking the primary business mutation.

## Successful write response

A successful POST requires:

- `ok: true`;
- `savedModules`;
- global `revision`;
- `updatedAt`;
- `moduleRevisions` for every confirmed saved module.

A frontend write is not confirmed unless every `savedModules` entry has a valid returned module revision.

## Frontend revision ownership

The accepted concurrency baseline belongs to `business-state-sync.js`, not the transport layer.

Contract:

- `vps-api.js` is stateless for business revision ownership; GET returns revision metadata but does not cache/adopt it;
- sync records `moduleRevisions` only after a GET is accepted for the exact current user/site and is allowed to become the local authoritative baseline;
- if a local edit appears while GET is in flight, the existing deferred-read guard returns before adopting that GET's module revisions;
- dirty saves send expected revisions only from the accepted sync baseline and only for dirty modules with a known token;
- a missing token is omitted rather than guessed as `0`, causing the backend to return `BUSINESS_STATE_REVISION_REQUIRED` unless GET explicitly established an absent module token `0`;
- confirmed POST responses advance only the saved modules' accepted revision tokens;
- failed/conflicting POSTs do not advance local tokens;
- identity/site changes reset the accepted module-revision baseline with the rest of loaded business scope;
- global site revision is never used as a module concurrency token.

The existing save-before-load and save coalescing rules remain in force. A failed/conflicting save prevents the normal focus/online refresh chain from issuing a GET that could overwrite the unresolved local edit.

## Conflict behavior in the browser

If VPS returns `BUSINESS_STATE_CONFLICT`:

- the local current business edit remains in memory/browser state;
- persistence status is `error` for the exact current user/site;
- no automatic GET merges remote conflicting data over that local edit;
- no `saved` state is emitted;
- safe reload and site switching remain blocked by the existing save-before-transition guard while the edit is unresolved;
- the visible warning explains that a newer server version exists and overwrite was blocked.

Vietnamese meaning:

`Dữ liệu này đã được thiết bị hoặc người dùng khác cập nhật. Hệ thống đã chặn ghi đè; thay đổi hiện tại chưa được lưu vào PostgreSQL.`

Traditional Chinese meaning:

`此資料已被其他裝置或使用者更新。系統已阻止覆寫；目前變更尚未儲存至 PostgreSQL。`

For `BUSINESS_STATE_REVISION_REQUIRED`, the UI explains that the browser lacks a valid version token and the write was blocked rather than treated as saved.

## Authorization and privacy

- Module payload visibility remains controlled by existing view permissions.
- Normal GET revision metadata follows view permission boundaries.
- Conflict responses never expose module payloads the current user cannot view.
- Server authorization always wins over revision metadata supplied by the client.
- Revision numbers are concurrency metadata, not permissions.
- The audit append exception does not expose audit history to an employee who cannot view it.

## Migration / rollback safety

- Migration 006 is additive; no existing business payload is deleted.
- Normal deployment creates the pre-deploy PostgreSQL backup before applying migration.
- Production data integrity requires schema `006` or newer.
- `business_state.module_revisions` must be a non-null JSON object.
- Every already-stored top-level module must have a non-negative integer revision token after migration.
- Old cached normal-module POST clients are rejected instead of bypassing concurrency protection.

## Acceptance criteria

1. Migration preserves existing `business_state.modules` and backfills revision tokens.
2. GET returns permission-filtered `moduleRevisions`, returns explicit `0` only for viewable absent modules, and does not expose protected module payloads.
3. Two clients reading the same normal module revision: first save succeeds; second stale save returns `409 BUSINESS_STATE_CONFLICT`; the first payload remains authoritative.
4. Two clients saving different normal modules from one initial site snapshot both succeed; global row revision creates no false conflict.
5. POST without a required normal-module expected revision returns `409 BUSINESS_STATE_REVISION_REQUIRED` and does not modify business payloads.
6. Unauthorized module writes remain blocked/omitted by existing permission rules; revision metadata cannot bypass permissions.
7. Sync derives dirty-module expected revisions only from the last accepted GET/confirmed POST baseline; a deferred GET must not advance tokens.
8. Transport has no hidden revision cache and a save response missing a revision for any reported saved module is treated as missing confirmation.
9. Client conflict preserves the current local edit, emits persistence error and does not stale-reload afterward.
10. Concurrent audit appends retain unique entries, duplicate IDs cannot rewrite existing audit content, and audit history remains hidden from users without audit view permission.
11. No-op focus/resume with no dirty business module performs no write and creates no conflict lifecycle.
12. Existing inventory concurrency, authorization-boundary recovery, persistence-status, desktop/mobile and full-device regressions remain green.
13. Production deploy applies migration 006 with backup, data-integrity verification, exact-SHA health/release check and production UI smoke before this phase is marked DONE.
