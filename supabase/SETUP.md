# Supabase setup for 食徒 Kitchen OS

## Current rule: one SQL master file

From 2026-09-02 onward, use only:

`supabase/KITCHEN_OS_SUPABASE_MASTER_v11.sql`

This master contains the current SQL-side database contract:
- Supabase Auth profile model
- login/profile mapping support
- roles and JSON permissions
- Row Level Security (RLS)
- inventory tables and locations
- inventory transactions
- atomic inventory RPCs
- cross-site transfers
- receiving-location defaults
- manager permissions for central / Fuxing / Yongji
- manager + `location='all'` scope
- schema marker v11

It is intended to be safe for the existing staging database: it does not DROP or TRUNCATE the inventory data tables.

## Login architecture

Supabase Auth remains responsible for passwords/sessions.

Kitchen OS staff type a username such as `admin` or `yangchuadmin`. The frontend maps that username to `username@staff.shitu.local` for Supabase Auth.

The SQL master manages the matching `public.profiles` row, role, location and permissions.

Account creation, deletion, disabling and password reset cannot be safely moved into browser SQL. Those remain in the server-side Edge Function:

`supabase/functions/admin-users/index.ts`

Do not expose a service-role/admin secret in GitHub Pages.

## First administrator

For a fresh Supabase project:
1. Create `admin@staff.shitu.local` in Supabase Authentication and confirm the email.
2. Run `supabase/KITCHEN_OS_SUPABASE_MASTER_v11.sql`.
3. The included bootstrap section creates/updates the matching `public.profiles` admin row when that Auth user exists.
4. Deploy the `admin-users` Edge Function.
5. Create all later staff accounts through Kitchen OS Admin UI.

## Existing staging project

Run only `supabase/KITCHEN_OS_SUPABASE_MASTER_v11.sql`.

At the end, the result should show:
- `schema_version = 11`
- current profile row count
- active inventory item count
- stock row count

Current inventory remains in PostgreSQL and is not reset.

## Permissions contract

- Admin: all sites and all inventory management; operation history and delete/archive.
- Manager at `central`, `fuxing`, or `yongji`: inventory management for that site.
- Manager with `location='all'`: inventory management for the site currently selected in Kitchen OS.
- Employees: only modules/actions explicitly granted in `permissions`.
- Operation history and delete/archive remain Admin-only.

## GitHub migration files

Older SQL files remain as development/migration history. They do not need to be pasted into Supabase anymore.

For normal use, maintenance and future recovery, use the master file above. Future database changes should update the master and also add a small versioned migration for audit/history.

## Production VPS later

Supabase PostgreSQL is currently the staging source of truth. When moving to VPS, migrate the PostgreSQL data; do not rebuild inventory from browser localStorage.
