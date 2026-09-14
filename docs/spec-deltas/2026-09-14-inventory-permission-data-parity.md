# Inventory Permission and Data Parity

## Problem
Inventory is backed by PostgreSQL, but the current client/server contracts can diverge in two ways:

1. Frontend permission normalization fills missing module permissions from role defaults while the backend currently treats missing permission keys as denied. A legacy or partially populated permission document can therefore render inventory controls that the API rejects, or hide controls that another surface assumes are available.
2. Fuxing and Yongji branch snapshots are mirrored into the same `record.inventory` / `record.workInventory` client record without a site identity. During account/site transitions, the UI can temporarily render the previous branch snapshot until the next server sync completes.

Existing mobile role/site certification checks control visibility and foreign-site request isolation, but does not certify cross-role inventory data equality or stale-site snapshot exclusion.

## Goals
- PostgreSQL remains the inventory source of truth.
- The backend and frontend resolve the same effective permission set for every account role.
- An explicit stored permission value overrides the role default; a missing permission entry inherits the role default.
- Inventory API authorization uses the same effective permissions returned to the client.
- Branch client mirrors carry an explicit site identity.
- A branch snapshot must never be rendered as another branch after account or site changes.
- Users with view access to the same site must see the same authoritative item identity, quantity, minimum, unit and location data, regardless of role.
- Role-specific differences are limited to permitted controls/actions, not underlying inventory values.
- No SQL/schema migration is required for this slice.

## Effective role defaults
The backend must match `src/account-permissions.js` role defaults:

- `admin`: all modules view/edit.
- `manager`: all modules view; all editable except settings.
- `supervisor`: current frontend supervisor defaults.
- `employee`: current frontend employee defaults.
- `parttime`: current frontend part-time defaults.
- `central`: inventory view/edit only.

Normalization rule:
1. Start with the role default permission map.
2. For each module explicitly present in stored/input permissions, replace that module with normalized `{ view, edit }`, where `edit` is false when `view` is false.
3. Admin remains full permission regardless of stored input.

## Inventory client mirror contract
- Every branch snapshot applied from `GET /api/inventory/:site` must be associated with the requested site.
- Maintain a site-keyed branch snapshot cache for `fuxing` and `yongji`.
- On site/auth transition:
  - if a cache for the target site exists, hydrate it immediately;
  - otherwise clear/suppress the previous branch snapshot and show the existing loading state until the authoritative target-site sync completes.
- The generic branch record may be used as the rendered mirror only when its inventory-site marker matches the current active inventory site.
- Switching from Fuxing to Yongji must never show Fuxing quantities under a Yongji heading, even transiently.
- Generic business-state persistence must not treat inventory mirrors as business-state authority.

## Authorization boundaries
Existing inventory role boundaries remain unchanged:
- inventory view: effective `inventory.view` and allowed site.
- ordinary inventory operations: effective `inventory.edit` and allowed site.
- direct stocktake/minimum adjustment: admin, manager or supervisor with effective edit and allowed site.
- receive-default ownership: admin; or manager for assigned branch with effective edit.
- archive catalog item: admin only.
- scoped accounts cannot request foreign-site inventory snapshots.

## Regression requirements
Add coverage proving:
1. frontend and backend role-default normalization produce equivalent effective permissions for all supported roles;
2. partial legacy permission JSON inherits missing role defaults on both sides;
3. explicit false overrides a role default on both sides;
4. same-site manager/supervisor/employee/part-time readers receive the same authoritative SKU quantities/minimums/labels when their view permission allows it;
5. authorized write by one role is visible to a fresh second role from the same site;
6. view-only role cannot mutate;
7. site-scoped account cannot fetch a foreign site;
8. admin branch switch never renders a snapshot whose site marker differs from the active site;
9. mobile and desktop inventory surfaces use the same effective data snapshot.

## Non-goals
- No wage/workforce behavior changes.
- No new inventory schema or migration.
- No change to existing stocktake, receiving-default or archive authority.
- No localStorage write path may become an inventory source of truth.
