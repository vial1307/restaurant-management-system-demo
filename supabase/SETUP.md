# Supabase setup for 食徒 Kitchen OS

## 1. Create/connect a Supabase project

From the Supabase Dashboard, copy:
- Project URL
- Publishable key (`sb_publishable_...`)

Do **not** put a secret key or legacy `service_role` key in the browser or GitHub source.

## 2. Initialize the database

Open **SQL Editor** in Supabase and run `supabase/schema.sql`.

This creates:
- `profiles`
- inventory items / storage locations / stock
- inventory transaction history
- Row Level Security (RLS)
- atomic `adjust_inventory(...)` RPC
- the 4 央廚 storage locations

## 3. Configure GitHub Pages client

Edit `src/supabase-config.js`:

```js
export const SUPABASE_URL = "https://YOUR_PROJECT.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_...";
```

Only the publishable key belongs in browser code.

## 4. Deploy admin account function

Deploy `supabase/functions/admin-users/index.ts` as an Edge Function named `admin-users`.

The function uses Supabase-provided server-side secrets and verifies the caller is an active `admin` before creating, editing, deleting, disabling accounts, or resetting a staff password.

## 5. Bootstrap the first admin

Create the first Auth user in Supabase Dashboard, then insert a matching row into `public.profiles` with role `admin`, location `all`, active `true`, and full module permissions.

After the first admin exists, other staff accounts should be created through the Kitchen OS Admin UI / Edge Function rather than directly in the browser.

## Login model

Staff continue to type a simple username such as `admin`, `yangchu`, or `fuxing`.
The frontend maps it internally to `username@staff.shitu.local` for Supabase Auth, so staff do not need to remember an email address.

Usernames must use lowercase Latin letters, digits, dots, underscores, or hyphens.


## 6. Enable cross-device inventory sync (v7)

For the current staging/demo database, run the canonical migration once:

`supabase/20260901_inventory_ready_v7.sql`

in **Supabase → SQL Editor** after `supabase/schema.sql`.

This single migration includes:
- 復興店 storage/work locations
- 永吉店 storage/work locations
- 央廚 storage locations
- stable cloud item keys and shared catalog keys
- audited inventory in/out/transfer transactions
- Admin-only stocktake/catalog controls
- atomic internal stock transfer
- immediate cross-site 出貨 across 央廚 / 復興店 / 永吉店 with exact destination storage
- 領貨 workflow with 使用 and 歸位 handling
- central 使用中 work location for staged/active use
- Supabase Realtime for stock and transfer status
- immediate cross-site transfer: source decreases and exact destination storage increases in one atomic RPC
- actor/user audit for every inventory transaction; no manager confirmation in staging
- inventory cloud contract version 7

The older split/full files remain in the repository as migration history. For the current staging database, use only the canonical `20260901_inventory_ready_v7.sql` file above.

After the SQL succeeds:
1. Redeploy the `admin-users` Edge Function so account workplace validation supports `yongji`.
2. Reload Kitchen OS on PC/laptop/mobile.
3. Sign in as Admin once so missing catalog rows can be seeded without overwriting existing cloud quantities.
4. Test one stock movement from PC and confirm it appears on mobile, then reverse the test.



### Inventory workflow v7

- 領貨 / Lấy hàng: move stock from a storage location into the site's in-use/work location.
- 使用 / Sử dụng: subtract the actually consumed amount from the in-use quantity.
- 歸位 / Cất lại: move leftovers from the in-use quantity back to a selected storage location.
- 出貨 / Xuất hàng: choose source site/storage → destination site → destination storage; source decreases and destination increases in one atomic transaction.
- Every mutation records the authenticated operator through inventory transaction audit fields.
- Manager approval/receipt confirmation is intentionally deferred to the VPS production phase.
