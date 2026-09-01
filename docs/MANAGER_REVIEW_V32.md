# Kitchen OS v41 — Manager Review Checklist

## Current staging rule

For this review phase, inventory actions apply immediately. There is no manager approval step and no separate receiving confirmation. The system records who performed each inbound, outbound and transfer action. Formal approval/confirmation will be added only in the VPS production phase.


Purpose: staging review before moving the system toward VPS deployment.

## Required setup before review

1. Run `supabase/schema.sql` only if the project database has not been initialized yet.
2. Run `supabase/20260901_inventory_ready_v7.sql` in Supabase SQL Editor.
3. Redeploy the `admin-users` Edge Function from `supabase/functions/admin-users/index.ts`.
4. Open Kitchen OS once as Admin so missing Fuxing / Yongji / central catalog rows can be seeded.
5. Hard refresh PC/laptop/mobile so all devices load release v41.

## Roles to review

### Employee / supervisor / manager
Inventory should be operation-first:
- 庫存總覽 / Tổng quan
- 進貨入庫 / Nhập kho
- 領貨 / Lấy hàng
- 庫存轉撥 / Điều chuyển
- 出貨 / Xuất hàng
- Cross-site 出貨 applies immediately to the exact destination storage; no separate receiving confirmation

Normal users should not see direct stocktake/catalog/safety-minimum controls.

### Admin
Admin can use the same operation-first screens and additionally receives deep inventory controls:
- 盤點調整
- 安全庫存
- catalog/location management
- audit/history
- account/workplace management
- site switching: 復興店 / 永吉店 / 央廚

## Cross-device acceptance test

### Test A — normal inbound
PC:
1. Log in to a site account with inventory.edit.
2. Open 進貨入庫.
3. Select item.
4. Select one of the site's four storage locations.
5. Set quantity with [-] [number] [+].
6. Confirm 入庫.

Mobile:
- Open the same account/site.
- Confirm stock quantity converges to the new cloud value.

### Test B — internal transfer
Laptop:
1. Open 庫存轉撥.
2. Select item.
3. Select source storage.
4. Select a different destination storage.
5. Transfer quantity.

PC/mobile:
- Source must decrease.
- Destination must increase by the same amount.
- No negative stock is allowed.

### Test C — 領貨 / use / return
復興 mobile:
1. Open 領貨.
2. Choose 牛肉 from 大冷凍.
3. 領貨 4 包.
4. Confirm 大冷凍 decreases by 4 and 使用區 increases by 4.
5. 使用 2 包.
6. Confirm 使用區 decreases to 2.
7. 歸位 the remaining 2 包 to 四門冰箱.
8. Confirm 使用區 becomes 0 and 四門冰箱 increases by 2.

### Test D — 出貨 between sites
1. Open 出貨.
2. Select source storage.
3. Select destination site.
4. Select the exact destination storage.
5. Submit quantity.

Expected:
- source decreases immediately
- exact destination storage increases immediately
- there is no 待收貨 / 確認收貨 step
- audit records operator, timestamp, item, amount, source and destination

Repeat for:
- 央廚 → 復興店
- 央廚 → 永吉店
- 復興店 → 永吉店
- 永吉店 → 央廚

### Test E — 永吉店
Repeat Test C for:
- 央廚 -> 永吉店
- 永吉店 -> 央廚

### Test F — bilingual and devices
- VI mode: Vietnamese + Traditional Chinese.
- 中文 mode: Traditional Chinese only.
- Verify same language preference on PC/laptop/mobile.
- Search an item by Chinese, Vietnamese, Pinyin, and Zhuyin.

## Review decision

Manager should evaluate:
- Is normal staff flow fast enough during service?
- Are source/destination choices understandable?
- Is the quantity control large enough on phones?
- Are 領貨 / 使用 / 歸位 meanings clear enough during service?
- Is 出貨 destination-site + destination-storage selection clear?
- Are admin-only controls separated enough from daily staff operations?
- Are terminology and labels natural for Taiwan restaurant operations?

If accepted, use this release as the functional baseline for the VPS migration. The current frontend data boundary is intentionally separated so Supabase RPC/Realtime can later be replaced with VPS API + PostgreSQL + WebSocket/SSE without redesigning the operational UI.


### 領貨 test
1. At 復興店, choose an item with stock in 大冷凍.
2. 領貨 4 units to the item's 使用區.
3. Confirm 大冷凍 decreases by 4 and 已領貨 increases by 4.
4. 使用 2 units; 已領貨 must decrease by 2.
5. 歸位 the remaining 2 to 四門冰箱; 使用中 must return to 0 and 四門冰箱 must increase by 2.

### 出貨 test
1. Open 出貨.
2. Select source storage.
3. Select destination site.
4. Confirm the destination-storage picker shows only storage locations belonging to that selected site.
5. Select the exact destination storage and submit.
6. Source decreases immediately and destination increases immediately.
7. Confirm the audit records the operator, time, item, amount, source and destination.

No manager approval or receive-confirmation step is used in the current staging phase.
