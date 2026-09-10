# Inventory permission-driven controls — 2026-09-11

## Goal

Make effective permissions, not role names, the source of truth for inventory mutation controls. A staff account explicitly granted `inventory.edit` should receive the operational inventory controls for its allowed site. An account without `inventory.edit` must not see mutation controls and must be rejected by the API if it attempts a direct request.

## Reference models

This contract follows patterns used by mature inventory/business platforms instead of inventing a role-only model:

- Shopify separates inventory permissions from role labels and explicitly distinguishes `Manage inventory (excluding transfers)`, transfer management, shipment management, and location administration. Source: https://help.shopify.com/en/manual/your-account/users/roles/permissions/store-permissions
- Oracle NetSuite combines role permissions with location restrictions so a user can be limited to records/items belonging to an assigned location. Source: https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_N265799.html
- Odoo uses application/model access rights (`read`, `write`, `create`, `delete`) through groups and individual user access settings, with record rules as a second scope layer. Source: https://www.odoo.com/documentation/18.0/applications/general/users/access_rights.html

The local design therefore uses the same separation of concerns:

`role preset -> effective permission -> site scope -> action -> server enforcement`

Role remains useful as a preset and for explicitly elevated administrative operations, but it must not silently revoke an edit permission that an administrator has granted.

## Effective inventory contract

### View-only account

An account with `inventory.view=true` and `inventory.edit=false`:

- can view inventory for its assigned site;
- does not see inventory mutation tabs or direct `+ / -` controls;
- cannot edit quantity/minimum fields;
- cannot mutate inventory by calling the API directly.

### Inventory editor

An account with `inventory.edit=true`:

- receives inventory mutation controls for its assigned site;
- receives direct quantity/minimum adjustment controls (`+ / -`) where those controls are rendered;
- can save quantity/minimum changes through the inventory editor;
- remains constrained by its account site/location scope;
- cannot use edit permission to reach another branch's stock.

### Elevated master-data boundaries

The following remain intentionally narrower than ordinary inventory editing:

- receiving-default configuration: branch `manager` or `admin` only;
- catalog archive/delete: `admin` only;
- cross-site access remains constrained by existing shipping/site rules;
- historical branch inventory dates remain read-only;
- offline/localStorage fallback must never become a shared inventory write path.

## UI policy

Mutation controls are omitted when permission is absent rather than rendered as misleading disabled controls. The UI is a projection of server-authoritative permissions; hiding a control is not itself a security boundary.

Desktop and mobile use the same permission contract. Chromium and WebKit certification must cover both permitted and denied accounts.

## API policy

`POST /api/inventory/set-quantity` and `POST /api/inventory/set-minimum` require:

1. authenticated user;
2. `inventory.edit=true` (or admin full permission);
3. `siteAllowed(user, targetSite)`.

Denied requests return `403 INVENTORY_EDIT_NOT_ALLOWED`.

Inventory catalog sync must use the same effective edit permission when deciding whether quantity/minimum values may be persisted. This prevents a role-specific split where the UI grants editing but the server silently discards inventory values.

Existing transaction logging remains mandatory for quantity adjustment operations.

## Non-goals

This delta does not introduce a database migration, does not alter production stock quantities, and does not add per-item/per-bin ACL tables. If future operations require more separation, the next compatible extension is action-level inventory permissions such as `inventory.adjust`, `inventory.transfer`, `inventory.receive`, `inventory.catalog`, and `inventory.archive`, while retaining site scope.

## Regression requirements

CI must prove:

- employee fixture with explicit `inventory.edit` can edit quantity/minimum;
- central fixture with explicit `inventory.edit` can edit only Central inventory;
- part-time/view-only fixture cannot see mutation controls and receives HTTP 403 on direct mutation attempts;
- manager-only receiving-default ownership is preserved;
- admin-only archive ownership is preserved;
- no hard-coded manager/supervisor role gate is reintroduced into direct inventory adjustment;
- mobile Chromium and WebKit render the same permission result.
