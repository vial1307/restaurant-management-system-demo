# Kitchen OS — Inventory Operations Specification

Status: implemented on VPS API + PostgreSQL
Target sites: 央廚, 復興店, 永吉店
Primary goal: one inventory source of truth across PC / laptop / mobile with auditable operator actions and Taiwan restaurant terminology.

## 1. Current operational model

The inventory module has five staff-facing flows:

1. 庫存總覽 / Tổng quan kho
2. 進貨入庫 / Nhập kho
3. 領貨 / Lấy hàng để sử dụng
4. 庫存轉撥 / Điều chuyển nội bộ
5. 出貨 / Xuất hàng sang cơ sở khác

Admin-only stocktake/catalog controls remain separate:
- 盤點調整 / Điều chỉnh kiểm kê
- 安全庫存 / Tồn an toàn
- item/catalog/location management
- audit/history

The current staging phase does not require manager approval or receiving confirmation. Every mutation applies immediately and records the authenticated operator.

## 2. Sites and storage locations

### 央廚
- central-freezer — 央廚冷凍 / Tủ đông bếp trung tâm
- central-fridge — 央廚冷藏 / Tủ mát bếp trung tâm
- central-four-door — 央廚4門 / Tủ 4 cánh bếp trung tâm
- central-chest — 央廚臥櫃 / Tủ đông nằm bếp trung tâm
- central-work-use — 使用中 / Đang sử dụng

### 復興店
- 大冷凍 / Tủ đông lớn
- 大冷藏 / Tủ mát lớn
- 四門冰箱 / Tủ lạnh 4 cánh
- 廚房冰箱 / Tủ lạnh bếp
- work locations for 麵區 / 湯區 / 海鮮區 / 肉區

### 永吉店
Same current storage model as 復興店:
- 大冷凍
- 大冷藏
- 四門冰箱
- 廚房冰箱
- work locations for 麵區 / 湯區 / 海鮮區 / 肉區

## 3. 進貨入庫 / Inbound

Purpose: inventory enters the selected site from outside Kitchen OS.

Fields:
- item
- destination storage
- quantity

Effect:
- destination stock increases immediately
- actor, timestamp, item, quantity and destination are audited

## 4. 領貨 / Take for use

Purpose: remove goods from a storage location for actual kitchen use without treating the full amount as consumed.

Example:
- 復興店 大冷凍 has 10 包牛肉
- 領貨 4 包
- 大冷凍 becomes 6
- 使用區 / 使用中 becomes 4

After that, two actions are available:

### 使用 / Consume
If 2 of the 4 packages are actually used:
- 使用中 4 → 2
- those 2 are considered consumed
- audit records the operator and quantity used

### 歸位 / Return leftover
If the remaining 2 packages are placed in 四門冰箱:
- 使用中 2 → 0
- 四門冰箱 increases by 2
- this is an atomic internal transfer, not new stock

Therefore 領貨 does not mean 出貨 and does not automatically consume the whole quantity.

## 5. 庫存轉撥 / Internal transfer

Used to move stock directly between two storage locations in the same site.

Example:
- 大冷凍 10
- 四門冰箱 2
- transfer 3
- result: 大冷凍 7, 四門冰箱 5

Rules:
- source and destination must differ
- source cannot go negative
- source decrement and destination increment are one atomic transaction
- total physical stock does not change

## 6. 出貨 / Cross-site shipment

出貨 is a separate flow from 領貨.

Fields:
- item
- source storage
- destination site
- exact destination storage
- quantity

Destination-storage rule:
- 復興店 / 永吉店 managers own the product storage configuration for their branch.
- If the receiving branch already has the product and it has exactly one configured storage location, 出貨 selects that location automatically.
- If the receiving branch has the product in multiple storage locations, the branch manager must set 央廚出貨收貨儲位 / receiving location for factory shipments. Factory staff cannot choose arbitrarily.
- If an existing branch product has multiple locations and no receiving location is configured, 出貨 is blocked until the branch manager completes the setting.
- Only when the receiving branch does not yet have that product may factory staff choose the destination storage for that shipment.
- A factory staff shipment choice never automatically becomes the branch's permanent receiving-location setting.

Example:
- 復興店 → 永吉店
- source: 復興店 大冷凍
- destination: 永吉店 四門冰箱
- quantity: 4 包

Effect:
- 復興店 大冷凍 decreases by 4 immediately
- 永吉店 四門冰箱 increases by 4 immediately
- if the destination item has a configured 固定收貨儲位, the exact destination is taken from that configuration
- no separate 待收貨 / 確認收貨 step in the current staging phase
- audit records operator, time, item, amount, source site/location and destination site/location

Supported routes:
- 央廚 ↔ 復興店
- 央廚 ↔ 永吉店
- 復興店 ↔ 永吉店

## 7. Quantity controls

Every operation uses:

[-] [ quantity ] [+]

Rules:
- minimum action quantity = 1
- direct numeric input is allowed
- source-based actions cannot exceed available quantity
- server-side RPCs validate again
- mobile inputs must avoid iOS page zoom

## 8. Audit requirements

Every effective mutation records:
- authenticated user / actor_id
- timestamp
- action type
- item
- quantity and unit
- source
- destination
- before/after quantity where applicable

Current staging does not require a second manager approval record.

Formal approval/confirmation is intentionally deferred to the VPS production phase.

## 9. VPS API contract

### adjust_inventory(...)
Used for:
- 進貨入庫
- 使用

### transfer_inventory(...)
Used for same-site movement:
- 領貨: storage → work/use location
- 歸位: work/use location → storage
- 庫存轉撥: storage → storage

The operation is atomic and writes source/destination audit rows.

### direct_branch_transfer(...)
Used for 出貨 between different sites.

The operation:
- locks source and destination stock
- validates source availability
- decrements source
- increments exact destination storage
- creates an inventory transfer reference
- writes two linked inventory transaction rows
- records actor_id
- returns source/destination before/after values

## 10. Staging vs VPS production

### Current VPS production
- immediate atomic mutation through the API
- no manager approval
- no receiving confirmation
- operator audit stored in PostgreSQL
- focus/visibility refresh plus periodic polling
- automatic PostgreSQL backups before deployment

Approval should be added as a policy layer, not by changing the meaning of 領貨 or 出貨.
