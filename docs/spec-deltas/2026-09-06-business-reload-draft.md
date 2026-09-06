# Spec Delta — Durable Business Draft Across Reload

Date: 2026-09-06
Status: Proposed / implementation gated by regression
Scope: non-inventory business-state persistence only

## Problem

Business edits are written immediately to the device-local store (`shitu-kitchen-os-v1`) and are then persisted to PostgreSQL by the debounced business-state synchronizer.

If a business write is still pending or has failed, a manual browser refresh, tab/process crash, or OS/browser restart can recreate the local store with the unsaved edit still present. On the first business-state load of the new page instance, however, the synchronizer currently treats the identity as newly loaded and merges the VPS snapshot over the device state. A server-confirmed older value can therefore silently replace a newer local edit before that edit is retried.

Application-triggered safe reload guards do not cover browser-level refresh/crash/restart.

## Goals

1. A real dirty business edit must gain a durable, user-and-site-scoped recovery draft synchronously before the debounce/network window.
2. Reload/restart must not silently overwrite that draft with an older or concurrently changed VPS snapshot.
3. The draft must retain the exact accepted per-module revision tokens that existed when the local change was based on them. A GET observed after reload must never upgrade those tokens for dirty draft modules.
4. A same-revision draft may automatically retry and clear only after complete PostgreSQL confirmation.
5. If the server module advanced while the device was away, the device must preserve the local draft and attempt the old accepted token, producing the existing optimistic conflict instead of overwriting the server.
6. Drafts must be invisible to other users/sites and must not restore modules the current account can no longer view.
7. Existing inventory mutation semantics, database schema, authorization-recovery drafts, renderer architecture, and business conflict semantics remain unchanged.

## Non-goals

- No automatic record-level merge inside one conflicting top-level module.
- No manual conflict-resolution editor in this phase.
- No database schema migration.
- No replacement of the existing authorization-transition recovery store.
- No renderer/event-centralization optimization.
- No guarantee after the user explicitly clears browser storage, because both the local store and device recovery data are removed by that action.

## Durable draft format

Use a separate device-local key:

`shitu-business-pending-v1`

Shape:

```text
{
  version: 1,
  drafts: {
    "<userId>:<site>": {
      userId,
      site,
      capturedAt,
      changedModules: [topLevelModuleName...],
      modules: { ...dirtyTopLevelModules },
      expectedModuleRevisions: { <module>: <acceptedIntegerRevision> }
    }
  }
}
```

Rules:

- Key by exact `userId:site` identity.
- Store only top-level business modules that are actually dirty according to the existing comparison contract.
- `businessModulesFromState()` remains the source payload, so staff PINs remain excluded.
- Keep at most 12 most-recent identity drafts, matching the bounded device-recovery pattern already used by business authorization recovery.
- Draft payload must never be copied/stringified into DOM text, DOM attributes, analytics, error messages, or downloadable UI.
- Missing/corrupted accepted revision metadata must remain missing. Never synthesize revision `0` in the draft.

## Capture contract

When `scheduleSave()` observes at least one real dirty business module for a loaded editable identity:

1. Calculate dirty modules using the existing comparison rules.
2. Capture the accepted revision token only for dirty modules whose token is currently known.
3. Persist/update the scoped pending draft synchronously before starting/resetting the 450 ms debounce timer.
4. Then emit the existing `pending` persistence lifecycle event.

Timestamp-only record movement remains excluded by the existing dirty comparison and must not create a durable draft.

If durable draft persistence itself fails, emit an explicit operational persistence error (`BUSINESS_STATE_PENDING_DRAFT_WRITE_FAILED`). The network write may still proceed, but a failed network write must never be reported as safely recoverable when the device draft could not be recorded.

## Save confirmation contract

A pending draft may be removed only after the backend explicitly confirms every dirty module for the corresponding accepted snapshot.

After a confirmed write:

- advance accepted module revisions only from confirmed `moduleRevisions` returned by the POST;
- set the confirmed snapshot as the current server baseline, as today;
- if no newer local dirty module exists, remove that identity's pending draft;
- if a newer edit exists, immediately rewrite the pending draft from the current local state against the newly confirmed baseline so its expected tokens match the new accepted revisions;
- an older in-flight confirmation must never delete or downgrade a newer pending draft.

Partial confirmation, timeout, offline, API failure, revision-required, or conflict must leave the pending draft intact.

## Initial load / reload contract

For the first accepted GET of an identity:

### No pending draft

Keep the existing behavior.

### Pending draft exists for the same `userId:site`

1. Fetch the authoritative VPS snapshot and permission-filtered module revision map.
2. Determine recoverable draft modules. A draft module is recoverable only if the current GET exposes that module in `moduleRevisions`, proving the current account can still view it.
3. Merge the current VPS modules first while remote-application suppression is active.
4. Capture the resulting VPS-only business snapshot as the comparison baseline.
5. Overlay only the recoverable pending draft modules back onto the local store while suppression is still active.
6. Adopt current GET revision tokens for non-draft modules.
7. For recoverable dirty draft modules, keep the draft's stored expected revision token; do not replace it with a newer token from this GET.
8. Set the VPS-only snapshot as `lastSavedSnapshot`, so the overlaid draft remains dirty.
9. Surface the existing scoped persistence lifecycle as pending and retry persistence when the account is allowed to edit.

If the current server token for a draft module has advanced, the retry must use the older draft token and receive the normal `BUSINESS_STATE_CONFLICT`. The local draft remains intact.

If current permissions no longer expose a draft module, do not overlay that module into the active UI. Keep the durable draft on-device for existing authorization/recovery handling; never broaden permissions to restore it.

## Offline first load

If a pending draft exists and the page starts offline:

- do not delete the pending draft;
- do not claim PostgreSQL confirmation;
- keep the device-local store available;
- surface the existing offline persistence error for the scoped identity;
- retry the normal save/load chain after connectivity returns.

## Identity/site boundaries

- A draft for user A / Fuxing must never apply to user B / Fuxing.
- A draft for Fuxing must never apply while the same user is operating Yongji/Central.
- Auth/site transitions continue using the existing save/recovery guards.
- Pending drafts are not globally cleared by login/logout unless that exact draft was fully confirmed; they remain scoped and dormant for other identities.

## Acceptance tests

1. **Manual reload after failed write**
   - Load server settings at token 11.
   - Edit a real settings value locally.
   - Ensure a durable pending draft is recorded before the debounce write.
   - Fail the write.
   - Recreate the store/synchronizer from the same device storage.
   - Server still returns token 11 / old value.
   - The local edit survives initial GET, retries with expected token 11, and the draft clears only after confirmed save.

2. **Server advanced while device was away**
   - Draft was based on token 11.
   - Reload GET observes server token 12 with different server content.
   - Local draft content remains active.
   - Retry sends token 11, not 12.
   - Backend conflict is surfaced; local draft remains durable.

3. **Newer edit during older in-flight save**
   - Draft A is saved while edit B appears.
   - Confirmation of A advances the accepted token.
   - Durable draft is rewritten for B with the new token and B content.
   - Reload before B confirmation recovers B, not A.

4. **User/site isolation**
   - A pending draft for user A/Fuxing is not applied or deleted by user B/Fuxing or A/Yongji.

5. **Permission safety**
   - If reload GET no longer exposes a drafted module, that module is not overlaid into active state and its payload is not emitted to UI status events.

6. **No false draft**
   - timestamp-only dirty comparison and no-op updates create no durable pending business draft.

7. **Failure lifecycle**
   - conflict, revision-required, offline, timeout, API error, or partial confirmation cannot clear the draft.

## Deployment gate

Before merge/deploy:

- add a runtime regression that recreates the store/sync from the same fake localStorage to model browser reload;
- add stale-server-token conflict coverage across that reload boundary;
- add newer-edit/in-flight reconciliation coverage;
- include the new regression in the existing runtime synchronization CI step;
- keep all current desktop/mobile/full-device and production smoke gates green;
- deploy only by exact tested SHA with existing backup/rollback/integrity checks.
