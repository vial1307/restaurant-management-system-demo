# Spec Delta — Database-driven role hierarchy and permissions

Date: 2026-09-15
Status: approved product direction
Applies to: authentication, account administration, module permissions, inventory/workforce authorization

## 1. Product decision

PostgreSQL is the authority for account ranks/roles and permissions. The frontend and backend must not contain a closed hard-coded list of business ranks that must be edited whenever a new rank is introduced.

A new rank must be able to become usable by inserting/configuring database rows only. Application code may continue to know stable application module/action/capability semantics, but it must discover which ranks exist and what they are allowed to do from PostgreSQL.

## 2. Database model

The authorization model is stored in PostgreSQL using these concepts:

- `account_roles`: rank code, bilingual display names, hierarchy level, optional parent rank, scope policy, active state and sort order.
- `permission_modules`: registered application modules exposed to role permissions.
- `role_module_permissions`: per-rank module overrides (`view`, `edit`).
- `permission_capabilities`: registered sensitive business capabilities that are more specific than module view/edit.
- `role_capabilities`: per-rank capability overrides.
- `app_users.role`: foreign key to `account_roles.code`.

The legacy `app_users.permissions` JSON column may remain temporarily for backward compatibility/migration safety, but it is not an authorization authority after this delta is active.

## 3. Hierarchy and inheritance

Each rank may reference a parent rank. Effective module permissions and sensitive capabilities are resolved from the selected rank upward through its parent chain.

Nearest rank wins:

1. an explicit rule on the user's own rank overrides the parent;
2. otherwise the nearest ancestor rule is inherited;
3. otherwise the permission/capability is denied.

This lets a new rank inherit an existing rank without source-code changes. Example: adding `assistant_manager` with parent `supervisor` immediately gives it supervisor access; only differences need additional database override rows.

`hierarchy_level` is metadata used for ordering/comparison and does not itself grant access. Authorization is determined by resolved database permissions/capabilities.

## 4. Scope policy

Rank scope is database-configured:

- `all`: effective location is `all` and the account may operate across allowed sites.
- `central`: effective location is forced to `central`.
- `assigned`: account location must be an assigned branch/site.

The server normalizes/validates user location using the selected rank's scope policy. The frontend only displays the resulting server profile.

## 5. Sensitive capabilities

Business operations that previously depended on hard-coded role names must use database capabilities. Initial capabilities include:

- `accounts.manage`: create/edit/archive accounts and read the access model.
- `inventory.stocktake`: set absolute quantity/minimum values.
- `inventory.receive_defaults.manage`: change receiving-location ownership rules.
- `inventory.direct_adjust`: direct stock adjustment controls.
- `workforce.self_service`: restrict workforce data/mutations to the signed-in employee's own identity.

Additional capabilities can be registered later without adding a new rank enum to application code.

## 6. Existing rank seed

Migration seeds the current ranks so existing behavior remains available:

- `parttime`
- `employee`
- `supervisor`
- `manager`
- `admin`
- `central`

The branch hierarchy is `parttime -> employee -> supervisor -> manager -> admin`. `central` is an independent central-kitchen rank with central-only scope.

Current module defaults are migrated into `role_module_permissions`. Existing users keep their existing role codes; their effective permissions are thereafter resolved from the role database rather than their per-user permission JSON.

## 7. API contract

Authenticated user payloads include:

- actual database rank code in `role`;
- effective normalized location;
- fully resolved module permissions;
- fully resolved capability map;
- rank metadata needed by the UI (where appropriate).

Account administration exposes a database-backed access-model endpoint containing active ranks, modules and effective rank permissions/capabilities. The account editor must populate its rank selector from this endpoint.

Client-submitted per-user permission JSON is not authoritative and must not be used to bypass rank permissions.

## 8. Frontend behavior

On the VPS runtime:

- navigation/action visibility is driven by the effective permission/capability payload returned by the server;
- rank labels/options are loaded from the database-backed access model;
- choosing a rank previews that rank's effective permissions;
- the account editor does not create an independent per-user permission policy that can diverge from the database rank.

Local storage is only a cached presentation of the server profile.

## 9. Acceptance criteria

1. Existing accounts can log in after migration without recreating users.
2. `app_users.role` is constrained by a foreign key, not a hard-coded SQL `CHECK (...role list...)`.
3. Adding a new active rank row with a parent rank makes it selectable in account administration without editing frontend/backend role arrays.
4. A user assigned to that new rank receives inherited module permissions/capabilities without source-code changes.
5. Role permission changes in PostgreSQL are reflected on the next authenticated profile refresh/login.
6. Backend authorization uses the database-resolved profile; hiding/showing controls remains only a UI layer.
7. Inventory stocktake and receiving-default rules are capability-driven rather than `role === 'manager'`/`role === 'supervisor'` checks.
8. Workforce self-service classification is capability-driven rather than a fixed employee/part-time role set.
9. Existing site isolation, session invalidation, inventory atomicity and audit history remain intact.
10. Desktop and mobile receive the same effective permissions for the same account.
