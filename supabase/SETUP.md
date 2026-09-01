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


## 6. Enable cross-device inventory sync (v32)

For the current staging/demo database, run the canonical migration once:

`supabase/20260901_inventory_ready_v5.sql`

in **Supabase → SQL Editor** after `supabase/schema.sql`.

This single migration includes:
- 復興店 storage/work locations
- 永吉店 storage/work locations
- 央廚 storage locations
- stable cloud item keys and shared catalog keys
- audited inventory in/out/transfer transactions
- Admin-only stocktake/catalog controls
- atomic internal stock transfer
- 央廚 ↔ 復興店 ↔ 永吉店 shipment dispatch/receipt
- pending receipt workflow
- Supabase Realtime for stock and shipment status
- inventory cloud contract version 5

The older `20260901_inventory_cloud_v2.sql` and `20260901_inventory_transfers_v3.sql` remain in the repository as migration history, but for a fresh/staging setup use the canonical v5 file above.

After the SQL succeeds:
1. Redeploy the `admin-users` Edge Function so account workplace validation supports `yongji`.
2. Reload Kitchen OS on PC/laptop/mobile.
3. Sign in as Admin once so missing catalog rows can be seeded without overwriting existing cloud quantities.
4. Test one stock movement from PC and confirm it appears on mobile, then reverse the test.

