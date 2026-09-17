begin;

-- Dedicated system-owner role. It remains compatible with the legacy admin UI
-- through access-control compatibility mapping, but only this role receives the
-- system.super_admin capability used by the standalone Admin Panel.
insert into public.account_roles(
  code,name_vi,name_zh_tw,hierarchy_level,parent_role_code,scope_policy,sort_order,active
) values (
  'superadmin','Super Admin','超級系統管理員',1000,'admin','all',1000,true
)
on conflict(code) do update set
  name_vi=excluded.name_vi,
  name_zh_tw=excluded.name_zh_tw,
  hierarchy_level=excluded.hierarchy_level,
  parent_role_code=excluded.parent_role_code,
  scope_policy=excluded.scope_policy,
  sort_order=excluded.sort_order,
  active=true,
  updated_at=now();

insert into public.permission_capabilities(capability_key,description,active) values
  ('system.super_admin','Open the standalone Super Admin console and use direct system/database administration APIs',true)
on conflict(capability_key) do update set
  description=excluded.description,
  active=true,
  updated_at=now();

insert into public.role_module_permissions(role_code,module_key,can_view,can_edit)
select 'superadmin',module_key,true,true
from public.permission_modules
where active=true
on conflict(role_code,module_key) do update set
  can_view=true,
  can_edit=true,
  updated_at=now();

insert into public.role_capabilities(role_code,capability_key,allowed)
select 'superadmin',capability_key,true
from public.permission_capabilities
where active=true
on conflict(role_code,capability_key) do update set
  allowed=true,
  updated_at=now();

-- Ordinary administrators keep their existing operational/admin capabilities,
-- but must not gain the standalone system-owner console implicitly.
insert into public.role_capabilities(role_code,capability_key,allowed)
values ('admin','system.super_admin',false)
on conflict(role_code,capability_key) do update set
  allowed=false,
  updated_at=now();

-- Do not reinterpret the legacy app_users.permissions JSON as new RBAC data.
-- The dedicated column starts empty and only receives explicit Super Admin/user
-- editor overrides from this release onward.
alter table public.app_users
  add column if not exists permission_overrides jsonb not null default '{}'::jsonb;

alter table public.app_users
  drop constraint if exists app_users_permission_overrides_object_check;
alter table public.app_users
  add constraint app_users_permission_overrides_object_check
  check (jsonb_typeof(permission_overrides) = 'object');

-- Preserve access for the canonical owner account without changing password.
update public.app_users
set role='superadmin',location='all',active=true,updated_at=now()
where lower(username)='yangchuadmin';

-- Site-specific pricing. Menu rows are already site-scoped, so the same item
-- code may intentionally carry a different price at different branches.
alter table public.menu_items
  add column if not exists price numeric(12,2) check (price is null or price >= 0);

alter table public.menu_items
  add column if not exists currency_code text not null default 'TWD';

alter table public.menu_items
  drop constraint if exists menu_items_currency_code_check;
alter table public.menu_items
  add constraint menu_items_currency_code_check
  check (currency_code ~ '^[A-Z]{3}$');

create table if not exists public.system_announcements (
  id uuid primary key default gen_random_uuid(),
  site_code text references public.sites(code) on update cascade on delete restrict,
  title_vi text not null,
  title_zh_tw text not null,
  body_vi text not null default '',
  body_zh_tw text not null default '',
  status text not null default 'draft'
    check (status in ('draft','published','archived')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_by_user_id uuid references public.app_users(id) on delete set null,
  updated_by_user_id uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(btrim(title_vi)) > 0),
  check (length(btrim(title_zh_tw)) > 0),
  check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

create index if not exists system_announcements_status_idx
  on public.system_announcements(status,starts_at desc,created_at desc);
create index if not exists system_announcements_site_idx
  on public.system_announcements(site_code,status,created_at desc);

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  site_code text references public.sites(code) on update cascade on delete restrict,
  asset_type text not null default 'image'
    check (asset_type in ('image','document','other')),
  label text not null,
  asset_url text not null,
  alt_vi text not null default '',
  alt_zh_tw text not null default '',
  entity_type text,
  entity_id text,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references public.app_users(id) on delete set null,
  updated_by_user_id uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(btrim(label)) > 0),
  check (length(btrim(asset_url)) > 0),
  check (jsonb_typeof(metadata) = 'object')
);

create index if not exists media_assets_entity_idx
  on public.media_assets(entity_type,entity_id)
  where entity_type is not null;
create index if not exists media_assets_site_active_idx
  on public.media_assets(site_code,active,created_at desc);

-- Seed only stable website-level defaults. All values remain editable from the
-- Super Admin Settings page and are versioned by the existing table contract.
insert into public.system_settings(setting_key,value) values
  ('website.brand_name',to_jsonb('食徒 Kitchen OS'::text)),
  ('website.page_title',to_jsonb('食徒 Kitchen OS'::text)),
  ('website.default_language',to_jsonb('zh-TW'::text)),
  ('website.maintenance_mode','false'::jsonb)
on conflict(setting_key) do nothing;

drop trigger if exists system_announcements_set_updated_at on public.system_announcements;
create trigger system_announcements_set_updated_at
before update on public.system_announcements
for each row execute function public.set_updated_at();

drop trigger if exists media_assets_set_updated_at on public.media_assets;
create trigger media_assets_set_updated_at
before update on public.media_assets
for each row execute function public.set_updated_at();

commit;
