begin;

create table if not exists public.account_roles (
  code text primary key,
  name_vi text not null,
  name_zh_tw text not null,
  hierarchy_level integer not null default 0,
  parent_role_code text references public.account_roles(code) on update cascade on delete restrict,
  scope_policy text not null default 'assigned' check (scope_policy in ('all','assigned','central')),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (code ~ '^[a-z][a-z0-9._-]{1,39}$'),
  check (parent_role_code is null or parent_role_code <> code)
);

create table if not exists public.permission_modules (
  module_key text primary key,
  name_vi text not null,
  name_zh_tw text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (module_key ~ '^[a-z][a-z0-9._-]{1,63}$')
);

create table if not exists public.role_module_permissions (
  role_code text not null references public.account_roles(code) on update cascade on delete cascade,
  module_key text not null references public.permission_modules(module_key) on update cascade on delete cascade,
  can_view boolean not null default false,
  can_edit boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (role_code,module_key),
  check (not can_edit or can_view)
);

create table if not exists public.permission_capabilities (
  capability_key text primary key,
  description text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (capability_key ~ '^[a-z][a-z0-9._-]{1,95}$')
);

create table if not exists public.role_capabilities (
  role_code text not null references public.account_roles(code) on update cascade on delete cascade,
  capability_key text not null references public.permission_capabilities(capability_key) on update cascade on delete cascade,
  allowed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (role_code,capability_key)
);

insert into public.permission_modules(module_key,name_vi,name_zh_tw,sort_order,active) values
  ('dashboard','Tổng quan','總覽',10,true),
  ('inventory','Kho','庫存',20,true),
  ('procurement','Gọi hàng','叫貨',30,true),
  ('reservations','Đặt bàn','訂位',40,true),
  ('preparation','Chuẩn bị','開班前準備',50,true),
  ('menu','Thực đơn','菜單',60,true),
  ('sop','SOP','SOP',70,true),
  ('skills','Năng lực','能力',80,true),
  ('attendance','Chấm công','考勤',90,true),
  ('schedule','Xếp lịch','排班',100,true),
  ('reports','Báo cáo','報表',110,true),
  ('remote','Quản lý từ xa','遠端管理',120,true),
  ('settings','Cài đặt','設定',130,true)
on conflict(module_key) do update set
  name_vi=excluded.name_vi,
  name_zh_tw=excluded.name_zh_tw,
  sort_order=excluded.sort_order,
  active=excluded.active,
  updated_at=now();

insert into public.account_roles(code,name_vi,name_zh_tw,hierarchy_level,parent_role_code,scope_policy,sort_order,active) values
  ('parttime','Nhân viên part-time','兼職人員',10,null,'assigned',10,true),
  ('employee','Nhân viên','員工',20,'parttime','assigned',20,true),
  ('supervisor','Tổ trưởng','組長',30,'employee','assigned',30,true),
  ('manager','Quản lý','主管',40,'supervisor','assigned',40,true),
  ('admin','Quản trị hệ thống','系統管理員',100,'manager','all',50,true),
  ('central','Nhân viên bếp trung tâm','央廚人員',20,null,'central',60,true)
on conflict(code) do update set
  name_vi=excluded.name_vi,
  name_zh_tw=excluded.name_zh_tw,
  hierarchy_level=excluded.hierarchy_level,
  parent_role_code=excluded.parent_role_code,
  scope_policy=excluded.scope_policy,
  sort_order=excluded.sort_order,
  active=excluded.active,
  updated_at=now();

-- Existing rank defaults are stored explicitly so this migration preserves the
-- current product contract. Parent inheritance is available for future ranks.
insert into public.role_module_permissions(role_code,module_key,can_view,can_edit) values
  ('admin','dashboard',true,true),('admin','inventory',true,true),('admin','procurement',true,true),
  ('admin','reservations',true,true),('admin','preparation',true,true),('admin','menu',true,true),
  ('admin','sop',true,true),('admin','skills',true,true),('admin','attendance',true,true),
  ('admin','schedule',true,true),('admin','reports',true,true),('admin','remote',true,true),('admin','settings',true,true),

  ('manager','dashboard',true,true),('manager','inventory',true,true),('manager','procurement',true,true),
  ('manager','reservations',true,true),('manager','preparation',true,true),('manager','menu',true,true),
  ('manager','sop',true,true),('manager','skills',true,true),('manager','attendance',true,true),
  ('manager','schedule',true,true),('manager','reports',true,true),('manager','remote',true,true),('manager','settings',true,false),

  ('supervisor','dashboard',true,false),('supervisor','inventory',true,true),('supervisor','procurement',true,true),
  ('supervisor','reservations',true,true),('supervisor','preparation',true,true),('supervisor','menu',true,false),
  ('supervisor','sop',true,false),('supervisor','skills',true,true),('supervisor','attendance',true,false),
  ('supervisor','schedule',true,false),('supervisor','reports',true,false),('supervisor','remote',false,false),('supervisor','settings',false,false),

  ('employee','dashboard',true,false),('employee','inventory',true,true),('employee','procurement',false,false),
  ('employee','reservations',true,false),('employee','preparation',true,true),('employee','menu',true,false),
  ('employee','sop',true,false),('employee','skills',true,false),('employee','attendance',true,true),
  ('employee','schedule',true,false),('employee','reports',false,false),('employee','remote',false,false),('employee','settings',false,false),

  ('parttime','dashboard',true,false),('parttime','inventory',true,false),('parttime','procurement',false,false),
  ('parttime','reservations',false,false),('parttime','preparation',true,true),('parttime','menu',true,false),
  ('parttime','sop',true,false),('parttime','skills',true,false),('parttime','attendance',true,true),
  ('parttime','schedule',true,false),('parttime','reports',false,false),('parttime','remote',false,false),('parttime','settings',false,false),

  ('central','dashboard',false,false),('central','inventory',true,true),('central','procurement',false,false),
  ('central','reservations',false,false),('central','preparation',false,false),('central','menu',false,false),
  ('central','sop',false,false),('central','skills',false,false),('central','attendance',false,false),
  ('central','schedule',false,false),('central','reports',false,false),('central','remote',false,false),('central','settings',false,false)
on conflict(role_code,module_key) do update set
  can_view=excluded.can_view,
  can_edit=excluded.can_edit,
  updated_at=now();

insert into public.permission_capabilities(capability_key,description,active) values
  ('accounts.manage','Create, edit, archive accounts and read access model',true),
  ('inventory.stocktake','Set absolute inventory quantity and minimum values',true),
  ('inventory.receive_defaults.manage','Manage branch receiving-location defaults',true),
  ('inventory.direct_adjust','Use direct stock adjustment controls',true),
  ('inventory.history.full','Read full inventory transaction history',true),
  ('workforce.self_service','Restrict workforce access and writes to the signed-in staff identity',true)
on conflict(capability_key) do update set
  description=excluded.description,
  active=excluded.active,
  updated_at=now();

insert into public.role_capabilities(role_code,capability_key,allowed) values
  ('admin','accounts.manage',true),
  ('admin','inventory.stocktake',true),
  ('admin','inventory.receive_defaults.manage',true),
  ('admin','inventory.direct_adjust',true),
  ('admin','inventory.history.full',true),
  ('admin','workforce.self_service',false),

  ('manager','accounts.manage',false),
  ('manager','inventory.stocktake',true),
  ('manager','inventory.receive_defaults.manage',true),
  ('manager','inventory.direct_adjust',true),
  ('manager','inventory.history.full',false),
  ('manager','workforce.self_service',false),

  ('supervisor','accounts.manage',false),
  ('supervisor','inventory.stocktake',true),
  ('supervisor','inventory.receive_defaults.manage',false),
  ('supervisor','inventory.direct_adjust',true),
  ('supervisor','inventory.history.full',false),
  ('supervisor','workforce.self_service',false),

  ('employee','accounts.manage',false),
  ('employee','inventory.stocktake',false),
  ('employee','inventory.receive_defaults.manage',false),
  ('employee','inventory.direct_adjust',false),
  ('employee','inventory.history.full',false),
  ('employee','workforce.self_service',true),

  ('parttime','accounts.manage',false),
  ('parttime','inventory.stocktake',false),
  ('parttime','inventory.receive_defaults.manage',false),
  ('parttime','inventory.direct_adjust',false),
  ('parttime','inventory.history.full',false),
  ('parttime','workforce.self_service',true),

  ('central','accounts.manage',false),
  ('central','inventory.stocktake',false),
  ('central','inventory.receive_defaults.manage',false),
  ('central','inventory.direct_adjust',false),
  ('central','inventory.history.full',false),
  ('central','workforce.self_service',false)
on conflict(role_code,capability_key) do update set
  allowed=excluded.allowed,
  updated_at=now();

-- Remove the closed role enum and replace it with a relational constraint.
alter table public.app_users drop constraint if exists app_users_role_check;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='app_users_role_fkey'
      and conrelid='public.app_users'::regclass
  ) then
    alter table public.app_users
      add constraint app_users_role_fkey
      foreign key(role) references public.account_roles(code)
      on update cascade on delete restrict;
  end if;
end;
$$;

create index if not exists app_users_role_idx on public.app_users(role);

create or replace function public.resolve_role_module_permissions(p_role text)
returns table(module_key text, can_view boolean, can_edit boolean)
language sql
stable
as $$
  with recursive role_chain as (
    select r.code,r.parent_role_code,0 as depth
    from public.account_roles r
    where r.code=p_role and r.active=true
    union all
    select parent.code,parent.parent_role_code,child.depth+1
    from public.account_roles parent
    join role_chain child on parent.code=child.parent_role_code
    where parent.active=true
  ), ranked as (
    select rp.module_key,rp.can_view,rp.can_edit,rc.depth,
           row_number() over(partition by rp.module_key order by rc.depth asc) as rn
    from role_chain rc
    join public.role_module_permissions rp on rp.role_code=rc.code
  )
  select m.module_key,
         coalesce(r.can_view,false) as can_view,
         coalesce(r.can_edit,false) as can_edit
  from public.permission_modules m
  left join ranked r on r.module_key=m.module_key and r.rn=1
  where m.active=true
  order by m.sort_order,m.module_key;
$$;

create or replace function public.resolve_role_capabilities(p_role text)
returns table(capability_key text, allowed boolean)
language sql
stable
as $$
  with recursive role_chain as (
    select r.code,r.parent_role_code,0 as depth
    from public.account_roles r
    where r.code=p_role and r.active=true
    union all
    select parent.code,parent.parent_role_code,child.depth+1
    from public.account_roles parent
    join role_chain child on parent.code=child.parent_role_code
    where parent.active=true
  ), ranked as (
    select rcaps.capability_key,rcaps.allowed,rc.depth,
           row_number() over(partition by rcaps.capability_key order by rc.depth asc) as rn
    from role_chain rc
    join public.role_capabilities rcaps on rcaps.role_code=rc.code
  )
  select c.capability_key,coalesce(r.allowed,false) as allowed
  from public.permission_capabilities c
  left join ranked r on r.capability_key=c.capability_key and r.rn=1
  where c.active=true
  order by c.capability_key;
$$;

create or replace function public.effective_location_for_role(p_role text,p_location text)
returns text
language sql
stable
as $$
  select case r.scope_policy
    when 'all' then 'all'
    when 'central' then 'central'
    else p_location
  end
  from public.account_roles r
  where r.code=p_role and r.active=true;
$$;

drop trigger if exists account_roles_set_updated_at on public.account_roles;
create trigger account_roles_set_updated_at
before update on public.account_roles
for each row execute function public.set_updated_at();

drop trigger if exists permission_modules_set_updated_at on public.permission_modules;
create trigger permission_modules_set_updated_at
before update on public.permission_modules
for each row execute function public.set_updated_at();

drop trigger if exists permission_capabilities_set_updated_at on public.permission_capabilities;
create trigger permission_capabilities_set_updated_at
before update on public.permission_capabilities
for each row execute function public.set_updated_at();

commit;
