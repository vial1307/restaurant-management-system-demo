# Master data + Admin Panel — 2026-09-16

## Scope

Attendance/payroll migration work is paused. This slice focuses on PostgreSQL-backed operational master data and administrator tooling.

The affected business facts are:

- sites/branches;
- work areas/stations;
- inventory storage/work locations;
- site-scoped permission to edit those master records;
- an administrator panel that reads/writes these records through the VPS API.

PostgreSQL remains authoritative. Browser cache and hard-coded fallback lists may exist temporarily for compatibility, but a successful edit must be confirmed by the VPS API and persisted in PostgreSQL.

## Canonical master data

### Work areas

A new relational `work_areas` table is authoritative for work-area definitions per site.

Canonical work-area codes:

- `noodles` — 麵區 / Khu mì
- `soup` — 湯區 / Khu canh
- `seafood` — 海鮮區 / Khu hải sản
- `meat` — 肉區 / Khu thịt

Fuxing and Yongji map these work areas to the `inside` department. Central maps them to the `kitchen` department so existing inventory items using the same work-area codes remain valid.

Work-area code is a stable machine identity. After creation it is not renamed through normal UI; display names, department, sort order and active status are editable.

### Inventory locations

`inventory_locations` remains the authoritative location table.

Canonical central locations:

- `central-freezer` — 央廚冷凍
- `central-fridge` — 央廚冷藏
- `central-four-door` — 央廚4門
- `central-chest` — 央廚臥櫃
- `central-work-use` — 使用中

Canonical Fuxing storage locations:

- `fuxing-large-freezer` — 大冷凍
- `fuxing-large-fridge` — 大冷藏
- `fuxing-four-door` — 四門冰箱
- `fuxing-kitchen` — 廚房冰箱

Canonical Yongji storage locations:

- `yongji-large-freezer` — 大冷凍
- `yongji-large-fridge` — 大冷藏
- `yongji-four-door` — 四門冰箱
- `yongji-kitchen` — 廚房冰箱

Branch work-stock locations are also relational and match the work-area codes:

- `<site>-work-noodles`
- `<site>-work-soup`
- `<site>-work-seafood`
- `<site>-work-meat`

Location code is a stable machine identity. Normal UI can edit display names, kind, sort order and active state; it cannot rename an existing location code.

## Permissions

New database capabilities:

- `inventory.locations.manage`
- `operations.work_areas.manage`
- `system.master_data.manage`

Default grants:

- `admin`: all three capabilities;
- `manager`: site-scoped `inventory.locations.manage` and `operations.work_areas.manage`;
- `supervisor`, `employee`, `parttime`, `central`: no master-data edit capability by default.

`system.master_data.manage` is administrator-only and allows all-site administration through Admin Panel.

Backend authorization is mandatory. Frontend button visibility alone is not authorization.

## Edit invariants

### Location update

- requested site must be inside the account scope;
- user must have `inventory.locations.manage` or administrator master-data capability;
- location code cannot change after creation;
- location kind must be `storage` or `work`;
- display names cannot be blank;
- disabling a location is blocked while it has positive stock;
- disabling a location is blocked while it is the active receiving default;
- all creates/updates/archives are written to `audit_logs`.

### Work-area update

- requested site must be inside the account scope;
- user must have `operations.work_areas.manage` or administrator master-data capability;
- work-area code cannot change after creation;
- department must belong to the same site when provided;
- display names cannot be blank;
- records are archived by `active=false`; historical references are never deleted;
- all creates/updates/archives are written to `audit_logs`.

## Admin Panel

A dedicated `/admin.html` page is administrator-only.

Initial sections:

1. System overview
   - API/database health;
   - deployed release;
   - schema migration version;
   - counts of users, sites, locations and work areas.
2. Site master data
   - choose Central/Fuxing/Yongji;
   - list/add/edit/archive inventory locations;
   - list/add/edit/archive work areas.
3. Account administration
   - link to the existing account editor while account CRUD remains on `/api/admin/users`.

The panel must never report success before the server confirms the write. On save it reloads the affected site from the VPS and renders the persisted result.

## Compatibility

Existing frontend constants for zones/work areas remain temporary fallbacks during this slice. The database/API becomes authoritative first; later frontend refactors may replace hard-coded dropdown lists with live master data without changing inventory semantics.

No attendance or payroll behavior is changed by this slice.

## Acceptance criteria

1. A clean database migration creates `work_areas` and seeds canonical locations/work areas for all current sites.
2. Existing canonical location rows are updated idempotently without deleting stock/history.
3. Admin can create/update/archive locations at any site.
4. Manager can create/update/archive locations only at their own site.
5. Restricted employee receives `403` for location/work-area writes.
6. A positive-stock location cannot be archived.
7. A receiving-default location cannot be archived.
8. Admin/manager work-area writes are site-scoped and audited.
9. `/admin.html` loads only for an authenticated administrator and displays PostgreSQL-backed master data.
10. Saving from Admin Panel round-trips through VPS API and survives fresh reload.
11. Desktop/mobile layout remains usable and no existing inventory/account functions are removed.
