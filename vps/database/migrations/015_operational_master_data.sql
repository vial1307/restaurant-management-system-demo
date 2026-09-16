begin;

alter table public.inventory_locations
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.inventory_locations
  add column if not exists updated_by_user_id uuid references public.app_users(id) on delete set null;

alter table public.inventory_locations
  drop constraint if exists inventory_locations_metadata_object_check;
alter table public.inventory_locations
  add constraint inventory_locations_metadata_object_check
  check (jsonb_typeof(metadata) = 'object');

create table if not exists public.work_areas (
  site_code text not null references public.sites(code) on update cascade on delete restrict,
  code text not null,
  department_code text,
  name_vi text not null,
  name_zh_tw text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  updated_by_user_id uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (site_code,code),
  foreign key (site_code,department_code)
    references public.organization_departments(site_code,code)
    on update cascade on delete restrict,
  check (code ~ '^[a-z][a-z0-9._-]{1,39}$'),
  check (length(btrim(name_vi)) > 0),
  check (length(btrim(name_zh_tw)) > 0),
  check (jsonb_typeof(metadata) = 'object')
);

create index if not exists work_areas_site_active_sort_idx
  on public.work_areas(site_code,active,sort_order,code);

insert into public.work_areas(
  site_code,code,department_code,name_vi,name_zh_tw,active,sort_order
) values
  ('central','noodles','kitchen','Khu mì','麵區',true,10),
  ('central','soup','kitchen','Khu canh','湯區',true,20),
  ('central','seafood','kitchen','Khu hải sản','海鮮區',true,30),
  ('central','meat','kitchen','Khu thịt','肉區',true,40),
  ('fuxing','noodles','inside','Khu mì','麵區',true,10),
  ('fuxing','soup','inside','Khu canh','湯區',true,20),
  ('fuxing','seafood','inside','Khu hải sản','海鮮區',true,30),
  ('fuxing','meat','inside','Khu thịt','肉區',true,40),
  ('yongji','noodles','inside','Khu mì','麵區',true,10),
  ('yongji','soup','inside','Khu canh','湯區',true,20),
  ('yongji','seafood','inside','Khu hải sản','海鮮區',true,30),
  ('yongji','meat','inside','Khu thịt','肉區',true,40)
on conflict(site_code,code) do update set
  department_code=excluded.department_code,
  name_vi=excluded.name_vi,
  name_zh_tw=excluded.name_zh_tw,
  active=excluded.active,
  sort_order=excluded.sort_order,
  updated_at=now();

insert into public.inventory_locations(
  code,name_zh_tw,name_vi,site,kind,sort_order,active,metadata
) values
  ('central-freezer','央廚冷凍','Tủ đông bếp trung tâm','central','storage',10,true,'{"canonical":true}'::jsonb),
  ('central-fridge','央廚冷藏','Tủ mát bếp trung tâm','central','storage',20,true,'{"canonical":true}'::jsonb),
  ('central-four-door','央廚4門','Tủ lạnh 4 cánh bếp trung tâm','central','storage',30,true,'{"canonical":true}'::jsonb),
  ('central-chest','央廚臥櫃','Tủ đông nằm bếp trung tâm','central','storage',40,true,'{"canonical":true}'::jsonb),
  ('central-work-use','使用中','Đang sử dụng','central','work',100,true,'{"canonical":true}'::jsonb),

  ('fuxing-large-freezer','大冷凍','Tủ đông lớn','fuxing','storage',10,true,'{"canonical":true}'::jsonb),
  ('fuxing-large-fridge','大冷藏','Tủ mát lớn','fuxing','storage',20,true,'{"canonical":true}'::jsonb),
  ('fuxing-four-door','四門冰箱','Tủ lạnh 4 cánh','fuxing','storage',30,true,'{"canonical":true}'::jsonb),
  ('fuxing-kitchen','廚房冰箱','Tủ lạnh bếp','fuxing','storage',40,true,'{"canonical":true}'::jsonb),
  ('fuxing-work-noodles','麵區','Khu mì','fuxing','work',100,true,'{"canonical":true,"work_area":"noodles"}'::jsonb),
  ('fuxing-work-soup','湯區','Khu canh','fuxing','work',110,true,'{"canonical":true,"work_area":"soup"}'::jsonb),
  ('fuxing-work-seafood','海鮮區','Khu hải sản','fuxing','work',120,true,'{"canonical":true,"work_area":"seafood"}'::jsonb),
  ('fuxing-work-meat','肉區','Khu thịt','fuxing','work',130,true,'{"canonical":true,"work_area":"meat"}'::jsonb),

  ('yongji-large-freezer','大冷凍','Tủ đông lớn','yongji','storage',10,true,'{"canonical":true}'::jsonb),
  ('yongji-large-fridge','大冷藏','Tủ mát lớn','yongji','storage',20,true,'{"canonical":true}'::jsonb),
  ('yongji-four-door','四門冰箱','Tủ lạnh 4 cánh','yongji','storage',30,true,'{"canonical":true}'::jsonb),
  ('yongji-kitchen','廚房冰箱','Tủ lạnh bếp','yongji','storage',40,true,'{"canonical":true}'::jsonb),
  ('yongji-work-noodles','麵區','Khu mì','yongji','work',100,true,'{"canonical":true,"work_area":"noodles"}'::jsonb),
  ('yongji-work-soup','湯區','Khu canh','yongji','work',110,true,'{"canonical":true,"work_area":"soup"}'::jsonb),
  ('yongji-work-seafood','海鮮區','Khu hải sản','yongji','work',120,true,'{"canonical":true,"work_area":"seafood"}'::jsonb),
  ('yongji-work-meat','肉區','Khu thịt','yongji','work',130,true,'{"canonical":true,"work_area":"meat"}'::jsonb)
on conflict(code) do update set
  name_zh_tw=excluded.name_zh_tw,
  name_vi=excluded.name_vi,
  site=excluded.site,
  kind=excluded.kind,
  sort_order=excluded.sort_order,
  active=excluded.active,
  metadata=public.inventory_locations.metadata || excluded.metadata,
  updated_at=now();

insert into public.permission_capabilities(capability_key,description,active) values
  ('inventory.locations.manage','Create, edit and archive inventory storage/work locations inside authorized site scope',true),
  ('operations.work_areas.manage','Create, edit and archive work-area master data inside authorized site scope',true),
  ('system.master_data.manage','Administer all-site operational master data from Admin Panel',true)
on conflict(capability_key) do update set
  description=excluded.description,
  active=excluded.active,
  updated_at=now();

insert into public.role_capabilities(role_code,capability_key,allowed) values
  ('admin','inventory.locations.manage',true),
  ('admin','operations.work_areas.manage',true),
  ('admin','system.master_data.manage',true),
  ('manager','inventory.locations.manage',true),
  ('manager','operations.work_areas.manage',true),
  ('manager','system.master_data.manage',false),
  ('supervisor','inventory.locations.manage',false),
  ('supervisor','operations.work_areas.manage',false),
  ('supervisor','system.master_data.manage',false),
  ('employee','inventory.locations.manage',false),
  ('employee','operations.work_areas.manage',false),
  ('employee','system.master_data.manage',false),
  ('parttime','inventory.locations.manage',false),
  ('parttime','operations.work_areas.manage',false),
  ('parttime','system.master_data.manage',false),
  ('central','inventory.locations.manage',false),
  ('central','operations.work_areas.manage',false),
  ('central','system.master_data.manage',false)
on conflict(role_code,capability_key) do update set
  allowed=excluded.allowed,
  updated_at=now();

drop trigger if exists work_areas_set_updated_at on public.work_areas;
create trigger work_areas_set_updated_at
before update on public.work_areas
for each row execute function public.set_updated_at();

commit;