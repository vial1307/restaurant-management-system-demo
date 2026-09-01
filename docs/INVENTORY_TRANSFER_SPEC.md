# Kitchen OS — Inventory Transfer & Branch Shipping Specification

Status: implementation-ready design
Target sites: 央廚, 復興店, 永吉店
Primary goal: one cloud source of truth across PC / laptop / mobile, with auditable inventory movement and Taiwan restaurant terminology.

## 1. Product scope

Inventory must support four operational flows:

1. 進貨入庫 / Nhập hàng vào kho
2. 領料／出庫 / Xuất kho
3. 庫存轉撥 / Điều chuyển nội bộ giữa các vị trí trong cùng cơ sở
4. 分店出貨／回庫 / Xuất hàng giữa 央廚 và chi nhánh, theo luồng gửi -> nhận xác nhận

Existing stocktake correction remains separate:
- 盤點調整 / Điều chỉnh kiểm kê
- supervisor / manager / admin only
- must write before/after audit history

## 2. Sites and inventory locations

### 央廚
- central-freezer — 央廚冷凍 / Tủ đông bếp trung tâm
- central-fridge — 央廚冷藏 / Tủ mát bếp trung tâm
- central-four-door — 央廚4門 / Tủ 4 cánh bếp trung tâm
- central-chest — 央廚臥櫃 / Tủ đông nằm bếp trung tâm

### 復興店
Existing Fuxing storage/work locations remain unchanged.
For cross-site shipment destination selection, the UI may display only:
- 復興店 / Chi nhánh Fuxing

The receiving user chooses the final local storage location when confirming receipt.

### 永吉店
Add site code:
- yongji

Cross-site shipment destination selection initially displays:
- 永吉店 / Chi nhánh Yongji

Detailed Yongji storage locations can be added later without changing the transfer model.

## 3. Navigation

央廚庫存 has four primary tabs:

- 庫存總覽 / Tổng quan tồn kho
- 進貨入庫 / Nhập kho
- 領料／出庫 / Xuất kho
- 庫存轉撥 / Điều chuyển

Management accounts additionally see:
- 進出庫紀錄 / Lịch sử nhập xuất

Cross-site shipment status is surfaced inside 出庫 / 轉撥 and history, rather than creating a completely separate top-level module.

## 4. Quantity control

Inbound/outbound/transfer quantity input uses the same component everywhere:

[-] [ quantity ] [+]

Rules:
- minimum action quantity: 1
- minus never goes below 1 in transaction forms
- long-press behavior is not required initially
- direct typing remains available
- mobile input must not trigger iOS page zoom
- amount must never exceed source stock for outbound/transfer
- all server mutations validate the amount again

## 5. 進貨入庫 / Inbound flow

Purpose: new inventory enters a site from outside the tracked Kitchen OS network.

Fields:
- item
- destination storage location
- quantity
- note (optional)
- operator

央廚 destination options:
- 央廚冷凍
- 央廚冷藏
- 央廚4門
- 央廚臥櫃

Action:
- creates an audited inventory transaction with direction = in
- increases destination stock atomically

This flow is not used for a transfer from 復興店 or 永吉店. Cross-site return uses the shipment workflow below.

## 6. 領料／出庫 / Outbound flow

Fields:
- item
- source storage location
- destination type
- destination
- quantity
- note

Destination types:
- 使用／耗用 / Usage
- 分店出貨 / Ship to branch

If destination type = 使用／耗用:
- decrement the selected source stock
- write direction = out
- no destination stock is created

If destination type = 分店出貨:
- destination options are 復興店 / 永吉店
- create a shipment order
- do not immediately increase branch stock
- source stock is decremented only when shipment is dispatched
- branch stock is increased only when the receiving branch confirms receipt

## 7. 庫存轉撥 / Internal transfer

Used only inside the same site.

Example:
央廚冷凍 -> 央廚4門

Fields:
- item
- source location
- destination location
- quantity
- note

Rules:
- source and destination cannot be identical
- both locations must belong to the same site
- transfer uses one atomic RPC transaction
- source decrement + destination increment either both succeed or both fail
- creates two audit rows linked by the same transfer reference

The existing transfer_inventory RPC is the correct base for this operation.

## 8. Cross-site shipment workflow

Cross-site movement is not treated as an immediate two-location transfer because physical goods can be in transit.

Supported routes:
- 央廚 -> 復興店
- 央廚 -> 永吉店
- 復興店 -> 央廚
- 永吉店 -> 央廚

Initial states:
- draft / 草稿
- dispatched / 已出貨
- received / 已收貨
- cancelled / 已取消

### Dispatch
When a shipment changes to dispatched:
- lock shipment lines
- decrement source inventory atomically
- record dispatched_by and dispatched_at
- write inventory_transactions with direction = out and transfer reference
- quantity is now considered 在途 / in transit

### Receive
At destination:
- receiving user selects final destination storage location for each line when needed
- increment destination inventory atomically
- record received_by and received_at
- write direction = in with the same transfer reference
- set shipment status = received

### Cancel
- draft shipments can be cancelled without stock mutation
- dispatched shipments cannot be silently cancelled
- if physical goods are returned, use a reverse shipment / return flow

## 9. Database additions

### inventory_transfers

Fields:
- id uuid primary key
- transfer_no text unique
- from_site text
- to_site text
- from_location_id uuid nullable
- to_location_id uuid nullable
- transfer_type text
- status text
- note text
- created_by uuid
- dispatched_by uuid nullable
- received_by uuid nullable
- created_at timestamptz
- dispatched_at timestamptz nullable
- received_at timestamptz nullable
- cancelled_at timestamptz nullable

transfer_type:
- internal
- branch_out
- branch_return

status:
- draft
- dispatched
- received
- cancelled

### inventory_transfer_lines

Fields:
- id uuid primary key
- transfer_id uuid
- item_id uuid
- quantity numeric
- received_quantity numeric nullable
- unit text
- source_location_id uuid nullable
- destination_location_id uuid nullable

### inventory_transactions additions

Add:
- reference_type text nullable
- reference_id uuid nullable

Values:
- stocktake
- internal_transfer
- branch_transfer
- branch_return

This allows history screens to group related source/destination audit rows.

## 10. Server/RPC contract

Required RPCs:

### create_inventory_transfer(...)
Creates a draft shipment.

Validation:
- authenticated user
- inventory edit permission
- allowed workplace/site
- valid route
- positive quantities

### dispatch_inventory_transfer(p_transfer_id)
Atomic operation:
- lock transfer
- require draft status
- lock source stock rows
- validate available quantities
- decrement all lines
- insert audit rows
- update status to dispatched

Must be idempotent:
- calling dispatch twice must not decrement twice

### receive_inventory_transfer(p_transfer_id, p_destinations jsonb)
Atomic operation:
- lock transfer
- require dispatched status
- validate destination user/site
- validate destination locations
- increment destination stock
- insert audit rows
- update received quantities
- mark received

Must be idempotent:
- calling receive twice must not increment twice

### cancel_inventory_transfer(p_transfer_id)
Allowed only for draft status.

## 11. Permissions and role-oriented UX

Existing module permission remains:
- inventory.view
- inventory.edit

The UI is split into two layers:

### Operational layer — employee / supervisor / manager

The operational experience should stay intentionally simple.

If the account has inventory.edit:
- choose the item
- choose source or destination location
- choose branch when needed
- set quantity with [-] [quantity] [+]
- press the primary action

Operational users may:
- 進貨入庫 / inbound
- 領料／出庫 / outbound
- 庫存轉撥 / internal transfer
- create and dispatch branch shipments when assigned site matches source
- receive branch shipments when assigned site matches destination

Do not expose deep inventory administration by default to employee, supervisor, or manager accounts.

The workflow should not require users to understand database concepts, audit tables, stock IDs, or configuration screens.

### Administrative layer — admin only

Admin receives the deeper management interface:
- direct 盤點調整 / stocktake correction
- edit 安全庫存 / safety minimum
- add/edit/archive catalog items
- edit item location assignments
- full inventory audit/history
- cross-site shipment oversight
- cancel draft transfers
- exception handling and reconciliation tools
- reporting/export
- future inventory configuration

Admin may still use the same simplified operational inbound/outbound/transfer screens as staff.

### Permission principle

Role affects access to deep administration, but operational inventory actions remain permission-driven:
- inventory.view = can see inventory
- inventory.edit = can perform normal operational stock movements

The database must enforce site and permission checks; hiding UI is not sufficient authorization.

## 12. Mobile UI

Primary UX principle:
- employee / supervisor / manager see an operation-first interface
- admin sees the same operation-first interface, with a separate management entry for deeper controls
- avoid mixing admin controls into the normal stock movement screen

Target phone widths:
- <=359
- 360–389
- 390–429
- 430–599
- 600–760

Transaction card layout:

Row 1:
- item name Chinese
- Vietnamese subtitle
- current source stock

Row 2:
- only the selections needed for the chosen action
- 來源儲位 / Từ when outbound/transfer
- 目的儲位 or branch / Đến when inbound/transfer/shipment

Row 3:
- [-] [quantity] [+]
- one clear primary action button

Do not show safety minimum, catalog editing, audit metadata, or stocktake fields in the normal employee/manager transaction card.

For cross-site shipment:
- destination uses 復興店 / 永吉店 cards or compact select
- shipment status badge is always visible

Avoid squeezing source + destination + quantity + action into one horizontal phone row.

## 13. Desktop UI

Desktop/tablet follows the same operation-first hierarchy as mobile.

Desktop/tablet can use a compact table:

| 品項 | 來源 | 目的地 | 現有庫存 | 數量 | 操作 |

Quantity control:
[-] [1] [+]

Primary action:
- 入庫
- 出庫
- 轉撥
- 建立出貨單

Admin-only management controls should live behind a separate 管理 / Quản trị entry or management panel, not inline with every operational row.

## 14. Translation catalog

Use Taiwan operational terminology:

- 庫存總覽 — Tổng quan tồn kho
- 進貨入庫 — Nhập kho
- 領料／出庫 — Xuất kho
- 庫存轉撥 — Điều chuyển kho
- 來源儲位 — Vị trí nguồn
- 目的儲位 — Vị trí đích
- 分店出貨 — Xuất hàng tới chi nhánh
- 分店回庫 — Chi nhánh chuyển trả kho
- 在途 — Đang vận chuyển
- 已出貨 — Đã xuất hàng
- 已收貨 — Đã nhận hàng
- 草稿 — Nháp
- 已取消 — Đã hủy
- 盤點調整 — Điều chỉnh kiểm kê
- 進出庫紀錄 — Lịch sử nhập xuất

Vietnamese mode displays:
Vietnamese · Traditional Chinese

Traditional Chinese mode displays:
Traditional Chinese only

## 15. Search

Inventory and transfer search must match:
- Chinese
- Vietnamese
- Vietnamese without accents
- Pinyin
- Zhuyin

Search target fields:
- item name
- branch name
- location name
- transfer number

Examples:
- 麻辣湯
- nuoc lau mala
- mala
- ㄇㄚˊ ㄌㄚˋ
- 復興
- fuxing
- ㄈㄨˋ ㄒㄧㄥ

## 16. Realtime and multi-device synchronization

Cloud database is the source of truth.

After each mutation:
- update through RPC
- receive Supabase Realtime change
- refresh affected inventory/location
- foreground/focus refresh remains as fallback
- periodic polling remains as last fallback

Do not use localStorage as authoritative stock after cloud mode is enabled.

PC, laptop, and mobile must converge on:
- stock quantity
- transfer status
- shipment lines
- audit history
- permissions
- language preference

## 17. Audit history

Every stock mutation stores:
- operator
- time
- item
- unit
- quantity
- before
- after
- source
- destination
- action type
- transfer/shipment reference
- note

Management history should support filters:
- date
- operator
- site
- item
- action type
- transfer number

## 18. Safety and concurrency

Mandatory rules:
- no negative inventory
- use row locks for stock mutation RPCs
- shipment dispatch/receive is atomic
- RPCs are idempotent
- destination and item site must match
- RLS/RPC verifies account site and inventory permission
- disabled account cannot mutate
- direct stocktake requires supervisor/manager/admin
- stale mobile cache cannot overwrite newer cloud stock

## 19. VPS migration compatibility

Keep frontend APIs behind inventory data-service functions.

Current:
Frontend -> Supabase Auth / RPC / Realtime -> PostgreSQL

Future:
Frontend -> VPS API / OIDC / WebSocket -> PostgreSQL

The UI should not need redesign when Supabase is replaced or fronted by VPS services.

Recommended future API surface:
- GET /inventory
- POST /inventory/inbound
- POST /inventory/outbound
- POST /inventory/transfer
- POST /transfers
- POST /transfers/:id/dispatch
- POST /transfers/:id/receive
- GET /inventory/history

## 20. Acceptance tests

Before release:

- + / - quantity works on mobile and desktop
- cannot go below 1 in transaction form
- outbound cannot exceed stock
- internal transfer updates source and destination atomically
- 央廚 -> 復興 dispatch decrements only 央廚
- 復興 receipt increments only after confirmation
- same behavior for 永吉
- reverse branch -> 央廚 works
- employee/supervisor/manager use the same simplified operational flow
- employee/supervisor/manager do not see deep admin controls
- admin can stocktake and audit is written
- PC mutation appears on mobile
- mobile mutation appears on laptop/PC
- Vietnamese mode stays bilingual on all devices
- Chinese mode stays Traditional Chinese
- search works with Vietnamese/Pinyin/Zhuyin
- duplicate dispatch/receive requests do not double-change stock
- offline device cannot silently overwrite cloud stock
