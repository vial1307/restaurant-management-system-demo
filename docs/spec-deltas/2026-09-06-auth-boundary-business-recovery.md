# Spec delta — Authorization-boundary business-state recovery

Status: required behavior for the 2026-09-06 security/synchronization hardening phase.
Parent specification: `docs/SYSTEM_SPECIFICATION.md`, sections 3, 4, 21, 22 and 24.

## Problem

A validated VPS profile refresh can change an account's role, workplace/location or module permissions while the browser still contains a pending local business-state edit from the previous authorization scope.

Today the local session is replaced before `business-state-sync` handles `shitu:auth-synced`. If the workplace changes, the business-state identity immediately changes from for example `user:fuxing` to `user:yongji`. The pending Fuxing edit can then no longer be persisted through the normal old identity path and a new-site refresh may overwrite the in-memory state. Permission revocation at the same site has the same class of risk.

The backend correctly evaluates the account's current database role/location/permissions on every protected request. The client must not keep or simulate revoked authorization merely to finish an old write.

A second related risk exists when PostgreSQL accepts only a subset of submitted business modules. The business-state API returns `savedModules`; the client must not mark a full local snapshot as saved if one or more actually changed modules were omitted by current authorization.

## Security invariant

Validated authorization changes take effect immediately on the client. Recovery logic must never:

- preserve an old role/location/permission after the VPS has changed it;
- retry a protected write by impersonating the old authorization state;
- auto-copy data from one site to another site;
- auto-apply a recovery draft under a different user identity;
- treat local recovery storage as the shared source of truth.

PostgreSQL/VPS remains authoritative. A recovery draft is only a device-local safety copy of an edit that could not be confirmed under the new authorization boundary.

## Required behavior

### 1. Pre-transition capture

Before replacing the local authenticated session with a validated profile whose authorization boundary changed, the client must synchronously give business-state synchronization a chance to capture pending edits from the **previous** loaded identity.

An authorization-boundary change means any change to:

- account role;
- workplace/location;
- effective module permissions.

Display-name, username or language-only changes do not by themselves require an authorization recovery draft.

### 2. Dirty-module recovery draft

If the current business snapshot differs from the last confirmed VPS baseline for the previous loaded identity, save a durable device-local recovery draft keyed by:

`userId + site`

The draft must contain only top-level business modules that changed relative to that confirmed baseline, plus recovery metadata such as:

- userId;
- site;
- captured timestamp;
- last known server revision;
- changed module names;
- changed module payloads;
- reason (`authorization-transition`).

Do not duplicate unrelated unchanged modules into the draft.

### 3. Scope isolation

A recovery draft may only be associated with the exact user/site identity from which it was captured.

It must never be silently merged into:

- another user;
- another branch/site;
- a newly assigned workplace;
- a server state whose conflict has not been explicitly evaluated.

### 4. Transition continues with new security

After synchronous recovery capture, apply the validated new session normally and refresh/render according to the new role/location/permissions. The existence of a recovery draft must not delay or override revocation.

If the old edit is no longer authorized, the browser may replace the visible old-site working state with the new authorized scope because the pending old edit has already been preserved separately.

### 5. Recovery visibility

A captured draft must surface a `recovery-pending` business-state status containing at least the original site and changed module names. If the same user later returns to the exact site, the pending recovery state must remain detectable; it must not disappear merely because the page reloads.

This phase does not require automatic conflict resolution. Explicit restore/compare UI may be added separately, but silent loss is not allowed.

### 6. Confirmed module writes

Normal business-state saves must derive the top-level modules that actually changed from the last confirmed baseline.

A successful API response is fully confirmed only when every changed module sent for persistence is present in the backend `savedModules` response.

If one or more changed modules are missing:

- do not advance the local confirmed snapshot as though all edits were saved;
- return/report persistence failure for refresh/reload guards;
- preserve the unconfirmed changed modules as recovery-pending data when an authorization transition is involved.

Unchanged modules filtered by backend permissions do not constitute a failure because they were not part of the dirty write set.

## Acceptance criteria

1. Start on Fuxing with a confirmed business-state baseline, make an unsaved Fuxing edit, then receive a validated profile that moves the same user to Yongji.
2. Before local auth identity changes, exactly the dirty Fuxing module(s) are captured in a durable recovery draft keyed to that user + Fuxing.
3. The local session still changes to Yongji immediately; no old Fuxing authorization is retained.
4. Loading Yongji does not delete or re-scope the Fuxing recovery draft.
5. A same-site permission revocation also captures dirty modules before the new permissions take effect locally.
6. A username/display-name-only profile update creates no recovery draft and retains the normal save-before-refresh path.
7. When the backend response omits one dirty module from `savedModules`, the client does not mark the full snapshot confirmed.
8. When all dirty modules are listed in `savedModules`, the confirmed snapshot/revision advances normally.
9. Existing coalescing, failed-save, safe-reload, site-switch, mobile resume, API/PostgreSQL concurrency and cross-browser regressions remain green.

No database schema or restaurant/inventory business semantics change in this phase.
