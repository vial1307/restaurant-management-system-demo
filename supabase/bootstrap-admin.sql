-- One-time bootstrap for the first Kitchen OS administrator.
-- 1) First create an Auth user in Supabase Dashboard:
--    email: admin@staff.shitu.local
--    password: choose a temporary password (minimum 6 chars)
--    mark email as confirmed / auto-confirm if the Dashboard offers the option.
-- 2) Then run this SQL in SQL Editor.

insert into public.profiles (
  id,
  username,
  display_name,
  role,
  location,
  active,
  permissions,
  preferred_language
)
select
  u.id,
  'admin',
  '系統管理員',
  'admin',
  'all',
  true,
  jsonb_build_object(
    'dashboard',    jsonb_build_object('view', true, 'edit', true),
    'inventory',    jsonb_build_object('view', true, 'edit', true),
    'procurement',  jsonb_build_object('view', true, 'edit', true),
    'reservations', jsonb_build_object('view', true, 'edit', true),
    'preparation',  jsonb_build_object('view', true, 'edit', true),
    'menu',         jsonb_build_object('view', true, 'edit', true),
    'sop',          jsonb_build_object('view', true, 'edit', true),
    'skills',       jsonb_build_object('view', true, 'edit', true),
    'attendance',   jsonb_build_object('view', true, 'edit', true),
    'schedule',     jsonb_build_object('view', true, 'edit', true),
    'reports',      jsonb_build_object('view', true, 'edit', true),
    'remote',       jsonb_build_object('view', true, 'edit', true),
    'settings',     jsonb_build_object('view', true, 'edit', true)
  ),
  'vi'
from auth.users u
where lower(u.email) = 'admin@staff.shitu.local'
on conflict (id) do update set
  username = excluded.username,
  display_name = excluded.display_name,
  role = excluded.role,
  location = excluded.location,
  active = excluded.active,
  permissions = excluded.permissions,
  preferred_language = excluded.preferred_language,
  updated_at = now();

-- Verify:
select
  p.id,
  p.username,
  p.display_name,
  p.role,
  p.location,
  p.active
from public.profiles p
where p.username = 'admin';
