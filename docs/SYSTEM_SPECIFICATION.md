# 食徒 Kitchen OS — Master System Specification

Status: canonical specification for current production/staging system
Baseline repository: `vial1307/restaurant-management-system-demo`
Baseline commit: `88e80a9a4320da3b6e0ead37d083fb2bec187c32`
Last consolidated: 2026-09-06

> This document is the primary product and engineering specification. Future feature work, bug fixes, refactors, database changes, permission changes, and UI changes must preserve this specification unless the specification itself is deliberately updated first.

---

## 1. Product purpose

Kitchen OS is an internal restaurant operations system for 食徒. It is designed for Taiwan restaurant operations, bilingual Vietnamese / Traditional Chinese usage, mobile-first daily work, and multi-site inventory/operations management.

Primary sites:

- `central` — 央廚 / Bếp trung tâm
- `fuxing` — 復興店 / Chi nhánh Fuxing
- `yongji` — 永吉店 / Chi nhánh Yongji

Primary goals:

1. One shared source of truth for accounts, permissions, inventory, and business data.
2. Same data and permissions on PC, laptop, and mobile.
3. Every sensitive stock mutation is auditable.
4. Restaurant business rules are explicit and testable.
5. Application updates must not erase existing business data.
6. New functionality must not silently remove previously working functionality.

---

## 2. Current architecture

### 2.1 Frontend

Current frontend is a browser/PWA-style JavaScript application.

Key modules:

- `src/app.js` — application UI, navigation, dashboard and page integration
- `src/store.js` — client state and local cache
- `src/rules.js` — business rules for reservation, rice, procurement, inventory alerts and generated tasks
- `src/operations.js` — SOP, staff, scheduling, attendance and workload logic
- `src/management.js` — management UI, SOP, schedules, reports and remote management
- `src/skills.js` — employee competency model
- `src/account-permissions.js` — frontend module permission model
- `src/auth-layer.js` / `src/vps-auth-bridge.js` — authentication/session integration
- `src/inventory-cloud.js` — server-backed inventory state
- `src/inventory-operations.js` — inventory UI operations
- `src/inventory-transfer-service.js` — transfer/shipment service layer
- `src/business-state-sync.js` — shared non-inventory business-state synchronization
- `src/vps-api.js` — VPS API client
- `src/search-utils.js` / `src/search-i18n-layer.js` — multilingual search

### 2.2 Backend

Current backend runs on VPS using Node.js API + PostgreSQL.

Important boundaries:

`UI -> VPS API -> PostgreSQL`

The browser must not connect directly to PostgreSQL.

Backend modules include:

- authentication and session handling
- account administration
- permission checks
- inventory routes and atomic stock mutations
- business-state read/write routes
- audit recording
- database transactions

### 2.3 Data authority

PostgreSQL on the VPS is the authoritative shared database.

`localStorage` is allowed only for:

- UI/cache acceleration
- selected date/tab/filter/search state
- offline fallback/cache
- local session presentation state

It must never become the authoritative shared database for multi-device business data.

---

## 3. Authentication, account roles and workplaces

### 3.1 Supported account roles

- `admin` — system administrator
- `manager` — branch/operations manager
- `supervisor` — team leader
- `employee` — employee
- `parttime` — part-time employee
- `central` — central-kitchen inventory account

### 3.2 Supported account locations

- `all` — all sites; reserved for administrator scope
- `central`
- `fuxing`
- `yongji`

Rules:

- Admin location is normalized to `all`.
- Central role location is normalized to `central`.
- Non-admin users must remain site-scoped unless a future explicit policy expands this.
- Disabled accounts cannot continue protected operations.
- Updating another account invalidates that account's active sessions where applicable.
- An administrator cannot remove their own admin access through the normal update flow.

### 3.3 Account management

Admin can:

- create accounts
- edit username/display name
- change role
- change workplace
- grant/revoke module view/edit permissions
- change password
- enable/disable account
- archive/delete accounts according to audit references

If an account already has historical inventory/audit references, deleting it must preserve historical referential integrity; the current backend archives/deactivates instead of physically deleting such a user.

---

## 4. Module permission model

Canonical application modules:

1. `dashboard`
2. `inventory`
3. `procurement`
4. `reservations`
5. `preparation`
6. `menu`
7. `sop`
8. `skills`
9. `attendance`
10. `schedule`
11. `reports`
12. `remote`
13. `settings`

Each module supports `view` and `edit` permission.

Rules:

- `edit=true` is valid only when `view=true`.
- Admin always receives full view/edit permissions.
- Permission checks must exist in both frontend UI and backend API.
- Hiding a button is never considered a security control by itself.

### 4.1 Default role behavior

#### Admin

Full view/edit access to all modules.

#### Manager

Default view access to all modules and edit access to all except Settings, unless explicit account permission configuration changes the effective rule.

#### Supervisor

Default operational access focuses on dashboard, inventory, procurement, reservations, preparation and skills. Management-only modules remain restricted unless explicitly configured.

#### Employee

Default access focuses on dashboard, inventory operational actions, preparation, menu/SOP viewing, skills viewing, own attendance, and schedule viewing.

#### Part-time

Default access focuses on dashboard viewing, preparation work, menu/SOP viewing, own attendance, schedule viewing, and read-only inventory.

#### Central kitchen

Inventory only by default.

---

## 5. Site and storage model

### 5.1 Central kitchen — 央廚

Current inventory locations:

- `central-freezer` — 央廚冷凍
- `central-fridge` — 央廚冷藏
- `central-four-door` — 央廚4門
- `central-chest` — 央廚臥櫃
- `central-work-use` — 使用中

### 5.2 Fuxing — 復興店

Storage locations:

- 大冷凍 — large freezer
- 大冷藏 — large fridge
- 四門冰箱 — four-door fridge
- 廚房冰箱 — kitchen fridge

Work locations:

- 麵區
- 湯區
- 海鮮區
- 肉區

### 5.3 Yongji — 永吉店

Same current branch storage/work model as Fuxing.

### 5.4 Product/location rule

A product may exist in multiple locations at the same site.

For each item/location combination the system stores independent:

- current quantity
- minimum/safety quantity

The same logical product is correlated through catalog identity, while stock is site/location specific.

---

## 6. Inventory module

Inventory is one of the most critical modules and must always use PostgreSQL-backed mutations.

### 6.1 Main user flows

1. `庫存總覽` — Inventory overview
2. `進貨入庫` — Inbound
3. `領貨` — Take stock for use
4. `庫存轉撥` — Internal transfer
5. `出貨` — Cross-site shipment

Administrative controls:

- `盤點調整` — Stocktake correction
- safety/minimum stock configuration
- item/catalog management
- location management
- receiving-location configuration
- audit/history

Current staging/production policy: stock mutations apply immediately; no second manager approval or receiving confirmation is required.

### 6.2 進貨入庫 — Inbound

Input:

- item
- destination location
- quantity

Effect:

- destination quantity increases immediately
- authenticated operator and timestamp are recorded
- quantity must be positive

### 6.3 領貨 — Take for use

`領貨` means moving product from storage to the site's use/work location. It does not mean the whole quantity has been consumed.

Example:

- 大冷凍 = 10 包
- 領貨 4 包
- 大冷凍 -> 6
- 使用中 -> 4

The goods in `使用中` then support:

#### 使用 — Consume

Actually consumes part/all of use stock.

#### 歸位 — Return leftover

Moves unused stock from `使用中` to an actual storage location.

Example:

- 使用中 = 2
- return to 四門冰箱 = 2
- 使用中 -> 0
- 四門冰箱 +2

This is an internal transfer, not new stock.

### 6.4 庫存轉撥 — Same-site internal transfer

Moves stock between locations in the same site.

Rules:

- source and destination must differ
- source quantity cannot become negative
- decrement and increment are one database transaction
- total physical stock remains unchanged
- transaction must be auditable

### 6.5 出貨 — Cross-site shipment

`出貨` is separate from `領貨`.

Input:

- item
- source storage
- destination site
- exact destination storage
- quantity

Supported routes:

- 央廚 <-> 復興店
- 央廚 <-> 永吉店
- 復興店 <-> 永吉店

Effect is immediate and atomic:

- source decreases
- destination increases
- linked audit/transaction data records both sides

### 6.6 Receiving-location ownership rule

The receiving branch owns its own product storage configuration.

If the destination branch already has a product:

- exactly one configured storage location -> shipment must use it automatically
- multiple configured storage locations -> branch manager must configure `央廚出貨收貨儲位` / default receiving location
- multiple locations + no receiving default -> shipment is blocked

Factory/central-kitchen staff may not arbitrarily choose a different location when the branch already owns the configuration.

Only when the receiving branch does not yet have the product may the shipping operator choose a destination location for that shipment.

That one-time choice must not silently become the branch's permanent receiving default.

### 6.7 Quantity controls

User interface:

`[-] [quantity] [+]`

Rules:

- minimum operation quantity = 1
- numeric input is allowed
- source-based action cannot exceed available stock
- backend validates again
- mobile numeric inputs must avoid iOS zoom/layout regression

### 6.8 Direct stock correction

Stocktake correction is sensitive.

Rules:

- correction cannot set quantity below zero
- server locks/rechecks current stock
- before and after values must be recorded
- supervisor/manager/admin stocktake controls remain role/permission constrained

### 6.9 Catalog editing

Users with authorized inventory edit access can manage allowed catalog data at their site.

Admin retains archive/deactivation control.

Saving a product must persist to VPS PostgreSQL. A failed VPS write must not be shown as successful simply because local cache changed.

---

## 7. Inventory alert and pre-shift rules

### 7.1 Inventory status

- quantity = 0 -> `empty`
- 0 < quantity < minimum -> `low`
- quantity >= minimum -> `ok`

### 7.2 Refill priority

For kitchen/work usage, source priority is generally:

1. 大冷藏
2. 大冷凍
3. other allowed internal storage only when explicitly applicable

Specific internal rules:

- refill 大冷藏 from 大冷凍
- refill 四門冰箱 from 大冷藏 first, then 大冷凍
- refill 廚房冰箱 from 大冷藏 first, then 大冷凍

### 7.3 Factory-order warning

`通知工廠叫貨` is generated only when the relevant 大冷凍 stock is empty for an item with a meaningful safety minimum.

Do not call the factory merely because:

- 四門冰箱 is empty
- 廚房冰箱 is empty
- 大冷藏 is empty while 大冷凍 still has stock

If 大冷凍 is empty even while another use location still has product, the reserve stock warning may still be generated.

### 7.4 Generated task ordering

Current priority order emphasizes:

1. factory procurement / zero reserve
2. storage refill
3. blocked inventory refill
4. normal inventory refill
5. reservation preparation
6. rice preparation
7. normal checklist tasks

Empty/high-priority items must appear ahead of normal low-stock work.

---

## 8. Procurement / calling suppliers

Current planned products include operational rules for:

- 粗麵 / thick noodles: 5 斤 per package
- 細麵 / thin noodles: 2.5 斤 per package
- 冷凍麵 / frozen noodles: 30 pieces per box
- 顆白菜 / baby cabbage: 2 斤 per package
- 高麗菜 / cabbage: counted by head

Current demand examples in code:

- thick noodles: 5 斤 weekday/weekend baseline
- thin noodles: 2.5 斤 weekday/weekend baseline
- frozen noodles: 30 weekday, 45 weekend baseline
- 顆白菜: 4 斤 weekday, 6 斤 weekend

Procurement calculation considers:

- current stock
- incoming stock
- expected demand
- supplier closed days
- coverage until next orderable date
- package size rounding

Factory-item planning is based on 大冷凍 current quantity versus minimum quantity.

Supplier/closed-day rules must remain configurable rather than hard-coded as restaurant policy forever.

---

## 9. Reservations

Reservation input tracks lunch and dinner tables.

Current preparation target:

`target = total reserved tables + reservation buffer`

Default buffer is 2 when there are reservations.

Preparation portions include:

- vegetable tray
- 滷三寶 portion
- hotpot

Required quantity:

`max(0, target - remaining)`

If there are no tables, target remains 0.

---

## 10. Rice preparation

Current standard:

- Monday-Thursday: 2,000 g
- Friday-Sunday: 3,000 g

For every 1,000 g rice:

- water = 1,000 g
- ice = 7 pieces
- oil = 1 spoon

Current rule:

- if remaining rice is above the configured skip threshold (default 2,000 g), no new batch is required
- otherwise cook the day's full standard amount

These values are settings/business rules and may be changed later through an explicit spec update.

---

## 11. Preparation / 開班前需處理

The preparation module combines generated and manual tasks.

Sources include:

- reservations
- inventory shortages
- storage refill needs
- factory-order warnings
- rice
- configured checklist tasks
- manager-assigned custom work

Custom tasks can include:

- title
- quantity/unit
- priority
- work area
- assignee
- due time

Assignment-specific fields require the appropriate task-management permission.

Existing legacy tasks with only a title must remain compatible.

---

## 12. Menu and training

Menu catalog supports common and less-frequent items and connects items to:

- work area
- SOP where available
- training records

Training records support statuses:

- `assigned`
- `practicing`
- `pending_check`
- `passed`

Training can cover:

- menu items
- station skills
- external/operational tasks such as inventory count and ordering

---

## 13. SOP module

Work areas:

- 麵區
- 湯區
- 海鮮區
- 肉區

A SOP may contain:

- Traditional Chinese name
- Vietnamese name
- cooking time
- dine-in container
- takeaway container
- dine-in notes
- takeaway notes
- utensil name
- utensil capacity (cc)
- number of scoops/uses
- plating rules
- procedural steps
- real restaurant photos

### 13.1 SOP versioning

Required lifecycle:

1. authorized editor changes SOP
2. change becomes a draft/pending revision
3. currently approved revision remains effective until approval
4. authorized manager approves new revision
5. approved revision becomes active
6. historical revisions remain available

Changing an approved SOP version invalidates the assumption that previously trained employees still know the current version; retraining/reconfirmation is required.

### 13.2 QR

QR can open the relevant work-area SOP page and can be printed for station use.

---

## 14. Employee skills / competency

Skills are tracked by employee and work area.

Current competency levels include:

- D
- C
- B
- A

A user is considered fully qualified for a work area only when they satisfy the current approved SOP/training requirements for that area.

Competency data supports:

- profiles
- assessments
- approvals
- custom skills
- area-level evaluation

---

## 15. Schedule and staffing load

Schedule supports:

- morning shift
- evening shift
- full-day shift
- custom shift

Application scope:

- one selected day
- same weekday through the selected month

Departments:

- 內場 / inside
- 外場 / outside

Current evening staffing rule:

- 4-6 dinner tables -> 3 inside staff; rotation allowed
- 7-12 dinner tables -> 4 inside staff; fixed coverage expected for 麵/湯/海鮮/肉
- below 4 -> management review state rather than a final automatic staffing judgment
- above 12 -> management review / exception

When fixed-area coverage is required, having four people is not enough if one required work area lacks a qualified person.

---

## 16. Attendance and payroll

Attendance records can contain:

- staff
- date
- clock in/out
- scheduled start
- break minutes
- work area
- hourly rate

Calculation:

`paid minutes = clock-out - clock-in - break`

`gross = paid hours * hourly rate`

Late minutes are calculated against scheduled start.

Late penalty framework exists but is disabled by default.

No deduction may be invented or applied until a manager explicitly configures:

- enabled/disabled state
- grace minutes
- fixed or per-minute mode
- penalty amount

Net pay cannot become negative.

---

## 17. Remote management and standard jobs

Management model:

`Branch -> Department -> Position/Area -> Job template + related SOP + evidence type`

Evidence types:

- check
- photo
- approval

Standard job catalog exists to prevent reports from fragmenting because every employee writes different free-text names for the same operational task.

---

## 18. Reports

Reports may include:

- daily operations
- inventory
- SOP/training
- attendance/payroll
- image inspections
- staffing/capacity

Filters can include:

- date/date range
- employee
- department
- work category

Export behavior includes Excel-compatible output and browser print/save-to-PDF where supported.

Report permission is separate from normal operational edit permission.

---

## 19. Settings and language

Supported language modes:

- Traditional Chinese (Taiwan)
- Vietnamese + Traditional Chinese

Requirements:

- Chinese terminology follows Taiwan restaurant/operations usage
- Vietnamese mode may include Traditional Chinese for operational clarity
- search supports Chinese, Vietnamese, accentless Vietnamese, Pinyin and Zhuyin where implemented
- new UI text must be added to translation catalogs
- account language preference is synchronized to VPS where applicable

Business settings include restaurant parameters such as:

- reservation buffer
- rice weekday/weekend values
- rice skip threshold
- procurement/supplier schedules
- checklist/business configuration

---

## 20. Database schema — current authoritative design

Database: PostgreSQL.

### 20.1 `app_users`

Purpose: account identity and authorization profile.

Important fields:

- id UUID
- username unique
- display_name
- password_hash
- role
- location
- permissions JSONB
- preferred_language
- active
- created_at / updated_at

### 20.2 `sessions`

Purpose: authenticated VPS sessions.

Important fields:

- id UUID
- user_id FK -> app_users
- token_hash unique
- expires_at
- last_seen_at
- created_at

### 20.3 `inventory_locations`

Purpose: physical/work stock locations.

Important fields:

- code unique
- bilingual names
- site
- kind: storage/work
- sort_order
- active

### 20.4 `inventory_items`

Purpose: site-specific item identity linked through catalog identity.

Important fields:

- item_key unique
- catalog_key
- bilingual names
- unit
- work_area
- storage_only
- active

### 20.5 `inventory_stock`

Purpose: quantity and safety minimum per item/location.

Composite primary key:

`(item_id, location_id)`

Fields:

- quantity >= 0
- minimum_quantity >= 0
- updated_at

### 20.6 `inventory_transactions`

Purpose: auditable stock mutation history.

Action types currently include:

- in
- out
- use
- transfer
- adjust
- ship
- receive
- return

Stores:

- item
- source/destination
- amount
- note
- actor
- metadata
- timestamp

### 20.7 `inventory_receive_defaults`

Purpose: branch-controlled receiving location by logical catalog item.

Primary key:

`(site, catalog_key)`

### 20.8 `audit_logs`

Purpose: general business/admin audit trail.

Stores:

- actor
- action
- entity type/id
- site
- before/after JSON
- metadata
- timestamp

### 20.9 `business_state`

Purpose: shared non-inventory business modules while the system remains in its current incremental migration architecture.

Primary key:

- site

Fields:

- modules JSONB
- revision
- updated_by
- updated_at

Current JSON module groups:

- settings
- reservations
- procurement
- preparation
- menu
- sop
- skills
- attendance
- schedule
- remote
- shared
- audit

`shared.staff` excludes PIN from the shared payload.

---

## 21. Persistence rules

The following must survive frontend code updates and deployments:

- users and permissions
- inventory catalog
- inventory quantities
- safety minimums
- receiving defaults
- inventory transactions
- reservation data
- procurement data
- preparation/checklist data
- menu/training data
- SOP versions/training/inspections
- competency data
- attendance/payroll data
- schedule data
- remote job catalog
- business settings
- shared staff profile data
- audit/history

Deployment must never initialize the database by replacing existing production data.

Schema change must use migration files.

Database backup is required before deployment/migration when the deployment pipeline supports it.

---

## 22. Synchronization rules

- VPS/PostgreSQL is source of truth.
- Inventory must refresh from VPS after relevant account/site/date/navigation changes.
- Non-inventory business state syncs by site and account permission.
- Focus, transition back to visible state, and online recovery must refresh shared business state until a future SSE/WebSocket implementation replaces polling/fallback behavior.
- Before any business-state refresh or full-page reload that could discard an eligible unsaved local business edit, the client must attempt to persist the current edit to VPS first.
- If that persistence attempt fails, a stale business-state reload or language/profile-triggered page reload must be blocked rather than silently discarding the local edit.
- When an authentication/profile refresh and a language-triggered safe reload happen in the same synchronization cycle, exactly one persistence path owns the business-state save; duplicate writes/revision bumps are not allowed.
- A profile/language-triggered full-page reload must use a cancelable safe-reload contract while business-state synchronization is active. Direct reload is only an allowed fallback when no business-state persistence guard is attached.
- A stale device must not silently overwrite newer cloud quantity.
- Failed VPS writes must surface as failure and must not be presented as successful local saves.
- Partial server state must not erase device data that has not yet been migrated/saved to the server.

---

## 23. Responsive and browser rules

Every changed screen must be reviewed for:

- <=359 px
- 360-389 px
- 390-429 px
- 430-599 px
- 600-760 px
- desktop/tablet
- phone landscape

Critical controls may not disappear on mobile.

Inventory product names, quantities, units, primary action controls, Save actions and permission-sensitive controls must remain usable without horizontal clipping.

Service Worker/cache updates must not leave users on mixed frontend releases.

---

## 24. Security rules

- Do not expose database password or server secrets in frontend code.
- Browser never receives direct PostgreSQL credentials.
- Passwords are stored as hashes, never plaintext.
- Sessions use hashed token storage server-side.
- Server validates site and module permissions for protected operations.
- Input must be validated at API/database boundary.
- Inventory source stock must be rechecked inside a transaction.
- Account disabling/session invalidation must prevent continued protected edits.

---

## 25. Audit rules

At minimum, sensitive inventory mutations record:

- actor ID/username
- timestamp
- action
- item
- quantity/unit
- source
- destination
- before/after quantity where applicable

General business-state saves also write audit metadata describing the changed module set.

Historical operator identity must remain understandable even when an account is later disabled.

---

## 26. Deferred features — NOT current behavior

The following are intentionally deferred and must not be assumed to exist unless a new spec is approved:

- mandatory manager approval before each stock mutation
- separate receiving confirmation for every 出貨
- changing the meaning of 領貨 into direct consumption
- allowing factory staff to override an existing branch's receiving-location policy

When approval is added later, it must be a policy/workflow layer on top of the existing stock semantics rather than redefining the core meanings of 領貨, 使用, 歸位, 轉撥 and 出貨.

---

## 27. Definition of Done for future changes

A change is complete only when all applicable items pass:

1. Relevant spec updated first.
2. Impact on permissions identified.
3. Impact on PostgreSQL/schema identified.
4. Migration added for schema change; never edit historical migration to rewrite production history.
5. Existing production data remains compatible.
6. Frontend and backend permission checks agree.
7. Desktop test passes.
8. Mobile test passes.
9. Restricted account test passes.
10. Admin test passes.
11. Database round-trip persistence passes.
12. Inventory mutation, if affected, is atomic and auditable.
13. Cross-device refresh/sync behavior passes.
14. Regression tests for adjacent functions pass.
15. Service-worker/release cache version is updated when required.
16. Documentation updated.
17. Complete change set committed to GitHub.
18. Production smoke test passes after deployment.

If any applicable item fails, status is `NOT DONE`.

---

## 28. Mandatory change workflow

Future work must follow:

`Request -> Spec delta -> Impact analysis -> Test/acceptance criteria -> Implementation -> Migration if needed -> Automated regression -> Desktop/mobile verification -> Commit -> Deploy -> Production smoke test`

### 28.1 Small UI fix

Even a UI-only fix must verify:

- no permission button disappeared
- mobile and desktop remain consistent
- data-save control is still reachable
- service-worker cache does not serve the old UI

### 28.2 Business-rule change

Before code changes:

- change this specification/rule file
- write concrete examples and edge cases
- update tests
- then change implementation

### 28.3 Database change

Rules:

- create a new numbered migration
- prefer additive/backward-compatible change
- backup before risky migration
- test migration on non-production data
- preserve existing rows
- document rollback/repair path for risky changes

### 28.4 Permission change

Must update and test all three layers where relevant:

- role/account permission model
- UI visibility/edit state
- backend authorization

### 28.5 Inventory change

Must test at least:

- sufficient stock
- insufficient stock
- zero stock
- source/destination difference
- same-site transfer
- cross-site transfer
- receiving default behavior
- audit actor
- before/after quantity
- rollback on server/database failure

---

## 29. Source-of-truth hierarchy

When information conflicts, use this order:

1. Latest deliberately approved product/system specification.
2. Current PostgreSQL migration/schema and backend authorization rules.
3. Current automated tests.
4. Current application implementation.
5. Historical README/chat notes.

A historical chat message must not silently override an approved current rule. The spec must be changed explicitly first.

---

## 30. Repository policy

The active development baseline is `restaurant-management-system-demo` until a deliberate repository consolidation/migration is performed.

The older `restaurant-management-system` repository contains important historical/core implementation context but must not be mistaken for the latest production baseline.

Future engineering work should update this master specification whenever behavior changes, so a new engineer or AI agent can reconstruct the intended system without relying on conversation history.
