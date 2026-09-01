# Kitchen OS v32 — Manager Review Checklist

Purpose: staging review before moving the system toward VPS deployment.

## Required setup before review

1. Run `supabase/schema.sql` only if the project database has not been initialized yet.
2. Run `supabase/20260901_inventory_ready_v5.sql` in Supabase SQL Editor.
3. Redeploy the `admin-users` Edge Function from `supabase/functions/admin-users/index.ts`.
4. Open Kitchen OS once as Admin so missing Fuxing / Yongji / central catalog rows can be seeded.
5. Hard refresh PC/laptop/mobile so all devices load release v32.

## Roles to review

### Employee / supervisor / manager
Inventory should be operation-first:
- 庫存總覽 / Tổng quan
- 進貨入庫 / Nhập kho
- 領料／出庫 / Xuất kho
- 庫存轉撥 / Điều chuyển
- 待收貨 / Nhận hàng

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

### Test C — 央廚 -> 復興店
央廚 PC:
1. Open 領料／出庫.
2. Select source storage and item.
3. Destination = 復興店.
4. Dispatch quantity.

Expected:
- 央廚 source stock decreases immediately.
- 復興 stock does NOT increase yet.
- Shipment appears as 已出貨 / 待收貨.

復興 mobile:
1. Open 待收貨.
2. Select the actual receiving storage: 大冷凍 / 大冷藏 / 四門冰箱 / 廚房冰箱.
3. Confirm receipt.

Expected:
- 復興 stock increases only now.
- Shipment becomes 已收貨.

### Test D — 永吉店
Repeat Test C for:
- 央廚 -> 永吉店
- 永吉店 -> 央廚

### Test E — bilingual and devices
- VI mode: Vietnamese + Traditional Chinese.
- 中文 mode: Traditional Chinese only.
- Verify same language preference on PC/laptop/mobile.
- Search an item by Chinese, Vietnamese, Pinyin, and Zhuyin.

## Review decision

Manager should evaluate:
- Is normal staff flow fast enough during service?
- Are source/destination choices understandable?
- Is the quantity control large enough on phones?
- Is the receiving confirmation clear enough to prevent mistaken stock additions?
- Are admin-only controls separated enough from daily staff operations?
- Are terminology and labels natural for Taiwan restaurant operations?

If accepted, use this release as the functional baseline for the VPS migration. The current frontend data boundary is intentionally separated so Supabase RPC/Realtime can later be replaced with VPS API + PostgreSQL + WebSocket/SSE without redesigning the operational UI.
