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


## 6. Staging database: Supabase PostgreSQL

Until the production VPS is launched, **Supabase PostgreSQL is the single source of truth for inventory data**. Browser localStorage is only a read/cache fallback and must not accept inventory writes while Supabase is configured.

For a fresh staging database:

1. Run `supabase/schema.sql`
2. Run `supabase/20260901_inventory_staging_latest.sql`

The consolidated staging file applies the required inventory migrations in order: v7 → v8 → v9 → v10.

For an existing staging database that already has the base schema, you can run only:

`supabase/20260901_inventory_staging_latest.sql`

The current frontend requires **inventory schema v10** before enabling inventory writes.

v10 includes:
- 復興店 / 永吉店 manager inventory edit rights for their own branch
- 央廚 manager inventory edit rights for 央廚
- add/edit inventory catalog and storage locations
- per-location current quantity and minimum quantity
- optional 央廚出貨收貨儲位
- automatic 出貨 destination routing from receiving-branch configuration
- cross-site atomic stock movements and audit history
- Supabase Realtime inventory synchronization
- SQL-backed data shared across phones, tablets, and PCs

### 出貨 routing

- If the receiving branch already has the product in exactly one storage location, the factory UI selects it automatically.
- If the product has multiple storage locations, the branch manager sets the receiving location in 庫存管理.
- If that setting is missing, 出貨 is blocked until the branch manager completes it.
- Only products not yet present at the receiving branch allow factory staff to choose a destination manually.
- A one-time factory choice never becomes a permanent branch setting automatically.

### Production VPS later

When the production version moves to VPS, keep the same logical inventory model and migrate PostgreSQL data from staging. Do not change the frontend back to device-local inventory storage.

After SQL succeeds:
1. Reload Kitchen OS.
2. Sign out and sign back in so profile permissions refresh.
3. Confirm the SQL status banner shows `SQL staging · 已連線`.
4. Test one edit from a branch-manager account and verify it appears on a second device.
5. Test one 央廚 → branch 出貨 and verify the receiving storage is selected from the branch configuration.

