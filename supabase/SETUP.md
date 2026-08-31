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


## 6. Enable cross-device inventory sync (v29)

After the original schema is installed, run:

`supabase/20260901_inventory_cloud_v2.sql`

in **Supabase → SQL Editor** once.

This migration adds:
- Fuxing storage/work locations
- stable cloud item keys
- Supabase Realtime for inventory stock
- audited in/out transactions
- direct stocktake correction for supervisor / manager / admin only
- management-level inventory history access

After running it, reload Kitchen OS on each device. The first Admin session seeds the current inventory catalog into Supabase without overwriting an already-existing cloud quantity.
