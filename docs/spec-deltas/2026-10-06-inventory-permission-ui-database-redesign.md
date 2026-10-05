# Inventory Database + Permission + UI Redesign — Approved Direction (2026-10-06)

Status: DESIGN LOCKED FOR IMPLEMENTATION  
Scope: Inventory / Super Admin / Database / Desktop + Mobile  
Authority rule: mutable business configuration must live in PostgreSQL. Frontend source files may contain UI rendering logic and technical enums only; they must not become the source of truth for products, sites, locations, permissions, units, categories, routing or inventory state.

## 1. Approved visual references

### Super Admin — inventory permission redesign

![Approved Super Admin Inventory Permission UI](./mockups/super-admin-inventory-permissions-approved.svg)

Reference intent:
- permission editor is not driven by job title/role defaults;
- permissions can be assigned by account;
- site scope can be all sites or any selected combination such as A+B, A+C, A+D, B+C, etc.;
- permissions can be narrowed further by storage location / Work Area;
- action-level permissions are visible and editable from Super Admin;
- reusable presets are allowed for convenience, but effective user access is persisted as database policy, not inferred from title.

### Inventory — multi-location Desktop + Mobile

![Approved Inventory multi-location UI](./mockups/inventory-ui-multilocation-approved.svg)

Reference intent:
- one product = one row/card;
- location chip order: Primary Location -> Work Location -> other locations;
- show the first 3 location chips; with more than 3 locations, show “Xem thêm / 查看更多”;
- Desktop opens a compact location-detail popover/panel;
- Mobile opens a full-screen product detail;
- permitted users can quick-edit quantity with minus / direct number / plus;
- three-dot menu contains the available advanced actions, filtered by the effective permission policy.

## 2. Permission model — no inventory authority inferred from job title

Role/job title may remain an identity / organizational attribute. It must not be the final authority for Inventory actions.

The final decision for every mutable Inventory action must be derived from PostgreSQL and managed from Super Admin.

### Required behavior

1. Super Admin selects an account.
2. Super Admin selects the site scope:
   - all current and future inventory sites;
   - one site;
   - arbitrary combination of sites;
   - optionally reusable site-group presets.
3. Super Admin selects one or more action permissions.
4. Super Admin may narrow a permission to:
   - all Inventory locations within the chosen site scope;
   - selected storage locations;
   - selected Work Areas;
   - a mix of site + location scopes.
5. Explicit deny must be supported so a user can have broad access while one sensitive location/action remains locked.
6. Backend API authorization must enforce the same rule. Hiding a button in the frontend is never sufficient.
7. Every policy edit writes an audit log with actor, before/after, target user and scope.

### Recommended database model

#### inventory_permission_actions
- action_key PK
- name_vi
- name_zh_tw
- description
- category
- risk_level
- active
- sort_order

Initial action keys should include at minimum:
- inventory.view
- inventory.quantity.adjust_quick
- inventory.quantity.set_absolute
- inventory.minimum.edit
- inventory.product.create
- inventory.product.identity.edit
- inventory.product.unit.edit
- inventory.product.category.edit
- inventory.product.location.attach
- inventory.product.location.detach
- inventory.product.primary_location.edit
- inventory.receive_default.edit
- inventory.work_area.edit
- inventory.transfer.internal
- inventory.transfer.cross_site
- inventory.receive
- inventory.pick
- inventory.use
- inventory.return
- inventory.history.view
- inventory.history.full
- inventory.product.archive
- inventory.location.create
- inventory.location.edit
- inventory.location.archive

#### inventory_access_policies
Reusable named policies only. A policy is a convenience template, not a job title.
- id
- code
- name_vi
- name_zh_tw
- description
- active
- created_by
- created_at
- updated_at

#### inventory_policy_actions
- policy_id
- action_key
- effect: allow | deny
- primary key(policy_id, action_key)

#### inventory_user_policy_assignments
- id
- user_id
- policy_id
- active
- starts_at nullable
- ends_at nullable
- created_by
- created_at

#### inventory_access_rules
Direct per-user rules and overrides.
- id
- user_id
- action_key
- effect: allow | deny
- applies_all_sites boolean
- active
- note
- created_by
- created_at
- updated_at

#### inventory_access_rule_sites
Used only when applies_all_sites=false.
- rule_id
- site_code
- primary key(rule_id, site_code)

This supports A+B, A+C, A+D, B+C or any future combination without schema/code changes.

#### inventory_access_rule_locations
Optional narrowing by concrete inventory location.
- rule_id
- location_id
- primary key(rule_id, location_id)

If a rule has no location rows, it applies to all locations inside its selected site scope.

#### inventory_access_rule_work_areas
Optional narrowing by Work Area.
- rule_id
- site_code
- work_area_code
- primary key(rule_id, site_code, work_area_code)

#### inventory_site_groups + inventory_site_group_members
Optional convenience presets only:
- “North branches”
- “A+B”
- “B+C”
- etc.

A site group must not be stored as a hard-coded AB/AC/BC combination in JavaScript. It is a database object with members.

### Effective permission precedence

Recommended deterministic evaluation:
1. explicit user DENY at the most specific matching scope;
2. explicit user ALLOW at the most specific matching scope;
3. assigned policy DENY;
4. assigned policy ALLOW;
5. default DENY.

More specific scope wins over broader scope:
location/work-area > site > all-sites.

The UI must show the reason for the effective result:
- Allowed by direct rule
- Denied at Tủ bếp
- Allowed by policy “Inventory basic”
- No matching rule -> Denied

## 3. Site scope UX

Super Admin must support:

- “Toàn bộ chi nhánh / 全部據點”
  - dynamic: automatically includes newly activated inventory sites;
- “Tùy chọn / 自訂”
  - any arbitrary combination of sites;
- optional saved site-group presets.

Never create source-coded combinations such as:
`AB`, `AC`, `AD`, `BC`.
The UI may display those shorthand labels, but the persisted model is normalized rows in PostgreSQL.

## 4. Location-level editability

A location being editable is a permission decision, not a property derived from role.

Example:
- user can view Fuxing Tủ đông lớn;
- can adjust quantity in Fuxing Tủ đông 2;
- can edit minimum in Khu mì;
- cannot alter Tủ bếp;
- can transfer internally but cannot cross-site ship.

Super Admin must allow this matrix to be configured without deployment.

The same policy must control:
- visibility of quick-edit controls;
- three-dot menu options;
- Add/Edit Product form fields;
- backend mutations.

## 5. Multi-location product UI

### Desktop

One product occupies one main row.

Chip order:
1. Primary Location;
2. Work Location;
3. other configured locations by database sort/display order.

If total configured locations <= 3:
- show all chips.

If total configured locations > 3:
- show first 3 chips;
- show “Xem thêm / 查看更多” for the rest.

The row also shows:
- product identity;
- category;
- unit;
- total quantity;
- low-stock state;
- three-dot action menu.

Clicking a visible location chip opens the location detail directly.
Clicking “Xem thêm” opens all remaining locations.

### Mobile

Clicking the product/location chip opens Full Screen Detail.

Each permitted location row supports:
- minus;
- direct number edit;
- plus.

The three-dot menu contains all advanced actions available to that user at that site/location. Unauthorized actions are not actionable and backend enforcement remains mandatory.

## 6. Primary Location vs Work Location vs Receive Default

These are three different concepts and must not be conflated.

### Primary Location
Presentation/operational preference for the product inside one site.
Purpose:
- first storage chip;
- default focus in Inventory list;
- does not imply that all receiving/transfer operations must land there.

Database recommendation:
add item-location presentation metadata, either in a dedicated `inventory_item_locations` association or in the existing item/location association:
- is_primary
- display_order
- active/configured

Only one active primary storage location per item per site.

### Work Location
Derived from the site-scoped Work Area and its database-managed Work Location.
It ranks after Primary in display order.

### Receive Default
Routing destination used when inventory is arriving at a destination site and the product has multiple valid storage locations.

Example:
- 牛肉 exists in 大冷凍 and 廚房冰箱;
- Central ships 4 bags to Fuxing;
- the database needs to know where those 4 bags should initially land;
- if receive default is 大冷凍, the atomic transfer credits that location.

Rule:
- exactly one valid storage location -> database may auto-resolve it;
- multiple valid storage locations + configured receive default -> auto-select that location;
- multiple valid storage locations + no receive default -> user must choose destination before the transaction can commit.

Receive default is therefore routing metadata, not “main display location”.

## 7. Add/Edit Product form

All business fields must be database-backed.

### Product identity
- Vietnamese name
- Traditional Chinese name
- category
- unit
- active/archive state

### Category
Create a database master entity:
`inventory_categories`
- id
- code
- name_vi
- name_zh_tw
- sort_order
- active
- metadata

Category options must never be a JS array.

### Unit
Create a database master entity:
`inventory_units`
- id/code
- symbol
- name_vi
- name_zh_tw
- type
- sort_order
- active
- metadata

Users who have `inventory.product.unit.edit` may:
- select an existing unit;
- type a new unit;
- explicitly create/persist that unit through the database.

No source-coded unit list.

### Storage locations
The available storage-location checklist comes from `inventory_locations` for the selected site.

Per configured item-location:
- quantity;
- minimum;
- low-stock warning configuration;
- primary flag/display order.

### Minimum and low-stock notification

Minimum is useful but not mandatory for every row.

Recommended database behavior:
- minimum_enabled boolean;
- minimum_quantity numeric;
- warning_enabled boolean;
- warning_quantity numeric or database-managed warning buffer/policy.

Do not hard-code “near low” arithmetic in frontend.

Status examples:
- OK
- Near low / Gần hết
- Low
- Out of stock

Add a dedicated Inventory alert view:
- Gần hết
- Hết hàng
- location/site filters
- severity
- acknowledgment/history if later required.

## 8. Database-only mutation rule

Anything that stores or moves business data must be committed through backend + PostgreSQL.

Includes:
- create/edit/archive products;
- categories;
- units;
- storage locations;
- Work Areas;
- item-location configuration;
- primary location;
- receive default;
- quantity;
- minimum/warning rules;
- internal transfer;
- Work Area pick/use/return;
- cross-site transfer/shipping;
- receiving;
- permission policies/rules;
- user/site/location scope;
- audit history.

Frontend/localStorage may hold:
- ephemeral UI state;
- open tab;
- search/filter;
- unsaved draft form;
- short-lived cache.

Frontend/localStorage must not be authoritative for mutable Inventory business data.

## 9. Three-dot action menu contract

The menu is capability-driven.

Possible actions:
- Edit product
- Edit quantity
- Edit minimum
- Manage locations
- Set primary location
- Set receive default
- Internal transfer
- Cross-site transfer
- Receive
- Pick
- Return
- View history
- Archive product

The UI asks the effective-permission API/model which actions are allowed.
Do not map menu actions from role names such as manager/employee/admin.

## 10. Super Admin implementation requirements

The new Inventory permission screen should include:

1. Account selector.
2. Optional reusable policy/template selector.
3. Site scope:
   - all sites;
   - custom multi-site selection;
   - saved site groups.
4. Data scope.
5. Action permission matrix.
6. Per-location/Work Area overrides.
7. Effective permission preview.
8. Copy permissions/policy configuration.
9. Audit history showing who changed what.
10. Safe save with revision / stale-write protection.
11. Reload/F5 must reproduce the exact same effective permission from PostgreSQL.
12. Cross-device consistency.

## 11. Acceptance tests before production

### Permission
- same user, different sites -> different rights work correctly;
- arbitrary site combinations work without source changes;
- location deny overrides broad site allow;
- frontend hides/disables unauthorized actions;
- direct API request is also denied;
- F5 preserves rights;
- another device receives the new effective rights;
- audit log records before/after.

### Multi-location UI
- 1/2/3 locations -> no “Xem thêm”;
- 4+ -> first 3 + “Xem thêm”;
- order is Primary -> Work -> other;
- mobile full-screen detail;
- quick +/-/number writes PostgreSQL and reloads correctly;
- permission changes alter available controls without role change.

### Data integrity
- no quantity mutation without inventory transaction/audit where required;
- no cross-site mismatch;
- no orphan item-location relation;
- receive default belongs to the same destination site and configured item;
- exactly one primary storage location per item/site;
- Work Location remains site-scoped;
- category/unit references remain valid.

## 12. Explicit non-goals

- Do not duplicate A/B/C/D combinations in code.
- Do not derive Inventory mutation authority from job title.
- Do not use frontend-only guards as security.
- Do not reintroduce static Fuxing/Yongji/Central business lists.
- Do not make localStorage the Inventory source of truth.
