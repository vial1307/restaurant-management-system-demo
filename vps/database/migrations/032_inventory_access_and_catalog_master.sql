begin;

-- Inventory authorization, multi-location presentation metadata and mutable
-- catalog master data are PostgreSQL authority from this migration onward.
-- Runtime code may interpret these rows but must not re-create the business
-- configuration from role names or frontend constants.

create table if not exists public.inventory_permission_actions (
  action_key text primary key,
  name_vi text not null,
  name_zh_tw text not null,
  description text not null default '',
  category text not null default 'general',
  risk_level text not null default 'normal'
    check (risk_level in ('low','normal','high','critical')),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (action_key ~ '^inventory[.][a-z0-9._-]+$')
);

insert into public.inventory_permission_actions(
  action_key,name_vi,name_zh_tw,description,category,risk_level,sort_order,active
) values
  ('inventory.view','Xem tồn kho','查看庫存','Read inventory lists and product/location detail.','view','low',10,true),
  ('inventory.quantity.adjust_quick','Chỉnh nhanh số lượng','快速調整數量','Use plus/minus quantity adjustment controls.','quantity','normal',20,true),
  ('inventory.quantity.set_absolute','Nhập số lượng tuyệt đối','設定絕對數量','Replace a stock quantity with an explicit value.','quantity','high',30,true),
  ('inventory.minimum.edit','Chỉnh minimum/cảnh báo','編輯安全量/提醒','Edit minimum and low-stock warning thresholds.','quantity','normal',40,true),
  ('inventory.product.create','Thêm sản phẩm','新增庫存品項','Create an inventory catalog item for an allowed site.','catalog','high',50,true),
  ('inventory.product.identity.edit','Sửa tên sản phẩm','編輯品項名稱','Edit catalog identity fields.','catalog','normal',60,true),
  ('inventory.product.unit.edit','Sửa/tạo đơn vị','編輯/新增單位','Select or create database-backed units.','catalog','normal',70,true),
  ('inventory.product.category.edit','Sửa danh mục','編輯分類','Assign or manage database-backed inventory categories.','catalog','normal',80,true),
  ('inventory.product.location.attach','Thêm vị trí sản phẩm','新增品項儲位','Attach an item to an allowed storage location.','location','high',90,true),
  ('inventory.product.location.detach','Gỡ vị trí sản phẩm','移除品項儲位','Detach an item from an allowed storage location.','location','high',100,true),
  ('inventory.product.primary_location.edit','Đặt vị trí chính','設定主要儲位','Change the primary presentation/operational location.','location','normal',110,true),
  ('inventory.receive_default.edit','Đặt vị trí nhận mặc định','設定預設收貨儲位','Change inbound routing default for a catalog item.','location','high',120,true),
  ('inventory.work_area.edit','Đổi Work Area sản phẩm','變更品項工作區','Move a product between site-scoped Work Areas.','location','high',130,true),
  ('inventory.transfer.internal','Điều chuyển nội bộ','店內調撥','Move stock between locations inside one site.','movement','normal',140,true),
  ('inventory.transfer.cross_site','Điều chuyển liên chi nhánh','跨店調撥','Move stock between sites.','movement','critical',150,true),
  ('inventory.receive','Nhập/nhận hàng','進貨/收貨','Receive inventory into an allowed destination.','movement','normal',160,true),
  ('inventory.pick','Lĩnh hàng vào Work Area','領貨至工作區','Pick stock from storage into a Work Area.','movement','normal',170,true),
  ('inventory.use','Sử dụng tồn Work Area','使用工作區庫存','Consume quantity from a Work Area.','movement','normal',180,true),
  ('inventory.return','Trả hàng về kho','歸還庫存','Return Work Area stock to storage.','movement','normal',190,true),
  ('inventory.history.view','Xem lịch sử cơ bản','查看基本紀錄','Read inventory transaction history allowed by scope.','history','low',200,true),
  ('inventory.history.full','Xem lịch sử đầy đủ','查看完整紀錄','Read full inventory history and actor metadata.','history','high',210,true),
  ('inventory.product.archive','Archive sản phẩm','封存品項','Archive an inventory catalog item.','catalog','critical',220,true),
  ('inventory.location.create','Thêm vị trí kho','新增庫存位置','Create an inventory location.','master','critical',230,true),
  ('inventory.location.edit','Sửa vị trí kho','編輯庫存位置','Edit inventory location master data.','master','critical',240,true),
  ('inventory.location.archive','Archive vị trí kho','封存庫存位置','Archive inventory location master data.','master','critical',250,true)
on conflict(action_key) do update set
  name_vi=excluded.name_vi,
  name_zh_tw=excluded.name_zh_tw,
  description=excluded.description,
  category=excluded.category,
  risk_level=excluded.risk_level,
  sort_order=excluded.sort_order,
  active=excluded.active,
  updated_at=now();

create table if not exists public.inventory_access_policies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_vi text not null,
  name_zh_tw text not null,
  description text not null default '',
  active boolean not null default true,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (code ~ '^[a-z][a-z0-9._-]{1,63}$')
);

create table if not exists public.inventory_policy_actions (
  policy_id uuid not null references public.inventory_access_policies(id) on delete cascade,
  action_key text not null references public.inventory_permission_actions(action_key) on update cascade on delete cascade,
  effect text not null check (effect in ('allow','deny')),
  updated_at timestamptz not null default now(),
  primary key(policy_id,action_key)
);

create table if not exists public.inventory_user_policy_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  policy_id uuid not null references public.inventory_access_policies(id) on delete cascade,
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at >= starts_at)
);
create index if not exists inventory_user_policy_assignments_user_idx
  on public.inventory_user_policy_assignments(user_id,active);

create table if not exists public.inventory_access_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  action_key text not null references public.inventory_permission_actions(action_key) on update cascade on delete cascade,
  effect text not null check (effect in ('allow','deny')),
  applies_all_sites boolean not null default false,
  active boolean not null default true,
  note text not null default '',
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists inventory_access_rules_user_action_idx
  on public.inventory_access_rules(user_id,action_key,active);

create table if not exists public.inventory_access_rule_sites (
  rule_id uuid not null references public.inventory_access_rules(id) on delete cascade,
  site_code text not null references public.sites(code) on update cascade on delete cascade,
  primary key(rule_id,site_code)
);

create table if not exists public.inventory_access_rule_locations (
  rule_id uuid not null references public.inventory_access_rules(id) on delete cascade,
  location_id uuid not null references public.inventory_locations(id) on delete cascade,
  primary key(rule_id,location_id)
);

create table if not exists public.inventory_access_rule_work_areas (
  rule_id uuid not null references public.inventory_access_rules(id) on delete cascade,
  site_code text not null references public.sites(code) on update cascade on delete cascade,
  work_area_code text not null,
  primary key(rule_id,site_code,work_area_code)
);

create table if not exists public.inventory_site_groups (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_vi text not null,
  name_zh_tw text not null,
  active boolean not null default true,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (code ~ '^[a-z][a-z0-9._-]{1,63}$')
);

create table if not exists public.inventory_site_group_members (
  group_id uuid not null references public.inventory_site_groups(id) on delete cascade,
  site_code text not null references public.sites(code) on update cascade on delete cascade,
  primary key(group_id,site_code)
);

create table if not exists public.inventory_access_subject_revisions (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  revision bigint not null default 1 check (revision >= 1),
  updated_at timestamptz not null default now()
);

insert into public.inventory_access_subject_revisions(user_id)
select id from public.app_users
on conflict(user_id) do nothing;

-- Category and unit catalogs are mutable master data.
create table if not exists public.inventory_categories (
  code text primary key,
  name_vi text not null,
  name_zh_tw text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (code ~ '^[a-z][a-z0-9._-]{1,63}$'),
  check (jsonb_typeof(metadata)='object')
);

create table if not exists public.inventory_units (
  code text primary key,
  symbol text not null,
  name_vi text not null,
  name_zh_tw text not null,
  unit_type text not null default 'custom',
  sort_order integer not null default 0,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(btrim(code)) > 0),
  check (length(btrim(symbol)) > 0),
  check (jsonb_typeof(metadata)='object')
);

insert into public.inventory_units(code,symbol,name_vi,name_zh_tw,unit_type,sort_order,active)
select distinct btrim(unit),btrim(unit),btrim(unit),btrim(unit),'legacy',500,true
from public.inventory_items
where btrim(coalesce(unit,''))<>''
on conflict(code) do nothing;

alter table public.inventory_items
  add column if not exists category_code text references public.inventory_categories(code) on update cascade on delete set null;
alter table public.inventory_items
  add column if not exists unit_code text references public.inventory_units(code) on update cascade on delete restrict;

update public.inventory_items
set unit_code=btrim(unit)
where unit_code is null and btrim(coalesce(unit,''))<>''
  and exists(select 1 from public.inventory_units u where u.code=btrim(inventory_items.unit));

create index if not exists inventory_items_category_idx on public.inventory_items(category_code) where active=true;
create index if not exists inventory_items_unit_code_idx on public.inventory_items(unit_code) where active=true;

-- Storage configuration is separate from stock quantity. This table controls
-- configured locations, primary location and display ordering.
create table if not exists public.inventory_item_locations (
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  location_id uuid not null references public.inventory_locations(id) on delete cascade,
  is_primary boolean not null default false,
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(item_id,location_id)
);
create unique index if not exists inventory_item_locations_one_primary_uidx
  on public.inventory_item_locations(item_id)
  where active=true and is_primary=true;

insert into public.inventory_item_locations(item_id,location_id,is_primary,display_order,active)
select
  ranked.item_id,
  ranked.location_id,
  ranked.rn=1,
  ranked.sort_order,
  true
from (
  select s.item_id,s.location_id,l.sort_order,
         row_number() over(
           partition by s.item_id
           order by
             case when l.metadata->>'storage_group'='primary' then 0 else 1 end,
             l.sort_order,l.code
         ) as rn
  from public.inventory_stock s
  join public.inventory_locations l on l.id=s.location_id
  join public.inventory_items i on i.id=s.item_id
  where i.active=true and l.active=true and l.kind='storage'
    and split_part(i.item_key,':',1)=l.site
) ranked
on conflict(item_id,location_id) do update set
  display_order=excluded.display_order,
  active=true;

create or replace function public.inventory_item_location_guard()
returns trigger
language plpgsql
as $$
declare
  item_site text;
  location_site text;
  location_kind text;
begin
  select split_part(item_key,':',1)
  into item_site
  from public.inventory_items
  where id=new.item_id;

  select site,kind
  into location_site,location_kind
  from public.inventory_locations
  where id=new.location_id;

  if item_site is null or location_site is null then
    raise exception using errcode='23503',message='INVENTORY_ITEM_LOCATION_REFERENCE_NOT_FOUND';
  end if;
  if item_site<>location_site then
    raise exception using errcode='23514',message='INVENTORY_ITEM_LOCATION_SITE_MISMATCH';
  end if;
  if location_kind<>'storage' then
    raise exception using errcode='23514',message='INVENTORY_ITEM_LOCATION_STORAGE_REQUIRED';
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_item_location_guard on public.inventory_item_locations;
create trigger inventory_item_location_guard
before insert or update of item_id,location_id on public.inventory_item_locations
for each row execute function public.inventory_item_location_guard();

alter table public.inventory_stock
  add column if not exists minimum_enabled boolean not null default false;
alter table public.inventory_stock
  add column if not exists warning_enabled boolean not null default false;
alter table public.inventory_stock
  add column if not exists warning_quantity numeric(14,3)
    check (warning_quantity is null or warning_quantity >= 0);

update public.inventory_stock
set minimum_enabled=(minimum_quantity>0)
where minimum_quantity>0 and minimum_enabled=false;

-- Validate granular Work Area scopes against site-scoped master data.
create or replace function public.inventory_access_work_area_guard()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.work_areas w
    where w.site_code=new.site_code
      and w.code=new.work_area_code
      and w.active=true
  ) then
    raise exception using errcode='23503',message='INVENTORY_ACCESS_WORK_AREA_NOT_FOUND';
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_access_work_area_guard on public.inventory_access_rule_work_areas;
create trigger inventory_access_work_area_guard
before insert or update of site_code,work_area_code on public.inventory_access_rule_work_areas
for each row execute function public.inventory_access_work_area_guard();

-- One-time compatibility materialization. After this migration runtime
-- authorization reads inventory_access_rules; changing a user's job title does
-- not silently change Inventory rights.
with user_access as (
  select
    u.id as user_id,
    public.effective_location_for_role(u.role,u.location) as effective_location,
    coalesce((
      select p.can_view
      from public.resolve_role_module_permissions(u.role) p
      where p.module_key='inventory'
    ),false) as can_view,
    coalesce((
      select p.can_edit
      from public.resolve_role_module_permissions(u.role) p
      where p.module_key='inventory'
    ),false) as can_edit,
    coalesce((
      select c.allowed
      from public.resolve_role_capabilities(u.role) c
      where c.capability_key='inventory.history.full'
    ),false) as history_full,
    coalesce((
      select c.allowed
      from public.resolve_role_capabilities(u.role) c
      where c.capability_key='system.super_admin'
    ),false) as super_admin,
    (u.role in ('admin','superadmin')) as catalog_archive
  from public.app_users u
  where u.active=true
), grants as (
  select ua.user_id,ua.effective_location,a.action_key
  from user_access ua
  join public.inventory_permission_actions a on a.active=true
  where
    (a.action_key in ('inventory.view','inventory.history.view') and ua.can_view)
    or (
      a.action_key in (
        'inventory.quantity.adjust_quick','inventory.quantity.set_absolute','inventory.minimum.edit',
        'inventory.product.create','inventory.product.identity.edit','inventory.product.unit.edit',
        'inventory.product.category.edit','inventory.product.location.attach','inventory.product.location.detach',
        'inventory.product.primary_location.edit','inventory.receive_default.edit','inventory.work_area.edit',
        'inventory.transfer.internal','inventory.transfer.cross_site','inventory.receive','inventory.pick',
        'inventory.use','inventory.return'
      ) and ua.can_edit
    )
    or (a.action_key='inventory.product.archive' and ua.catalog_archive)
    or (a.action_key='inventory.history.full' and ua.history_full)
    or (
      a.action_key in ('inventory.location.create','inventory.location.edit','inventory.location.archive')
      and ua.super_admin
    )
), inserted as (
  insert into public.inventory_access_rules(
    user_id,action_key,effect,applies_all_sites,active,note
  )
  select
    g.user_id,g.action_key,'allow',
    (g.effective_location='all' or g.action_key='inventory.receive'),
    true,'MIGRATION_032_COMPAT_SEED'
  from grants g
  where not exists (
    select 1 from public.inventory_access_rules r
    where r.user_id=g.user_id and r.action_key=g.action_key and r.active=true
  )
  returning id,user_id,applies_all_sites
)
insert into public.inventory_access_rule_sites(rule_id,site_code)
select i.id,u.effective_location
from inserted i
join user_access u on u.user_id=i.user_id
where not i.applies_all_sites
  and exists(select 1 from public.sites s where s.code=u.effective_location)
on conflict do nothing;

drop trigger if exists inventory_permission_actions_set_updated_at on public.inventory_permission_actions;
create trigger inventory_permission_actions_set_updated_at
before update on public.inventory_permission_actions
for each row execute function public.set_updated_at();

drop trigger if exists inventory_access_policies_set_updated_at on public.inventory_access_policies;
create trigger inventory_access_policies_set_updated_at
before update on public.inventory_access_policies
for each row execute function public.set_updated_at();

drop trigger if exists inventory_user_policy_assignments_set_updated_at on public.inventory_user_policy_assignments;
create trigger inventory_user_policy_assignments_set_updated_at
before update on public.inventory_user_policy_assignments
for each row execute function public.set_updated_at();

drop trigger if exists inventory_access_rules_set_updated_at on public.inventory_access_rules;
create trigger inventory_access_rules_set_updated_at
before update on public.inventory_access_rules
for each row execute function public.set_updated_at();

drop trigger if exists inventory_categories_set_updated_at on public.inventory_categories;
create trigger inventory_categories_set_updated_at
before update on public.inventory_categories
for each row execute function public.set_updated_at();

drop trigger if exists inventory_units_set_updated_at on public.inventory_units;
create trigger inventory_units_set_updated_at
before update on public.inventory_units
for each row execute function public.set_updated_at();

drop trigger if exists inventory_item_locations_set_updated_at on public.inventory_item_locations;
create trigger inventory_item_locations_set_updated_at
before update on public.inventory_item_locations
for each row execute function public.set_updated_at();

commit;
