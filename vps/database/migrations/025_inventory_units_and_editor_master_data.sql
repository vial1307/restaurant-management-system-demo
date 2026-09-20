begin;

create table if not exists public.inventory_units (
  code text primary key,
  name_zh_tw text not null,
  name_vi text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  updated_by_user_id uuid references public.app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_units_metadata_object_check
    check (jsonb_typeof(metadata)='object')
);

-- Preserve every unit already used in production before enforcing the FK.
insert into public.inventory_units(code,name_zh_tw,name_vi,sort_order,active,metadata)
select distinct
  btrim(unit),
  btrim(unit),
  btrim(unit),
  900,
  true,
  jsonb_build_object('source','existing_inventory_item')
from public.inventory_items
where btrim(unit)<>''
on conflict(code) do nothing;

-- Canonical units currently used by the ingredient editor.
insert into public.inventory_units(code,name_zh_tw,name_vi,sort_order,active,metadata) values
  ('盒','盒','Hộp',10,true,'{"canonical":true}'::jsonb),
  ('包','包','Gói',20,true,'{"canonical":true}'::jsonb),
  ('箱','箱','Thùng',30,true,'{"canonical":true}'::jsonb),
  ('斤','斤','Cân Đài Loan (斤)',40,true,'{"canonical":true}'::jsonb),
  ('片','片','Miếng / lát',50,true,'{"canonical":true}'::jsonb),
  ('個','個','Cái',60,true,'{"canonical":true}'::jsonb),
  ('隻','隻','Con',70,true,'{"canonical":true}'::jsonb),
  ('塊','塊','Khối / miếng',80,true,'{"canonical":true}'::jsonb),
  ('條','條','Thanh / con dài',90,true,'{"canonical":true}'::jsonb),
  ('kg','kg','kg',100,true,'{"canonical":true}'::jsonb)
on conflict(code) do update set
  name_zh_tw=excluded.name_zh_tw,
  name_vi=excluded.name_vi,
  sort_order=excluded.sort_order,
  active=true,
  metadata=public.inventory_units.metadata || excluded.metadata,
  updated_at=now();

create index if not exists inventory_units_active_sort_idx
  on public.inventory_units(active,sort_order,code);

drop trigger if exists inventory_units_set_updated_at on public.inventory_units;
create trigger inventory_units_set_updated_at
before update on public.inventory_units
for each row execute function public.set_updated_at();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname='inventory_items_unit_fkey'
      and conrelid='public.inventory_items'::regclass
  ) then
    alter table public.inventory_items
      add constraint inventory_items_unit_fkey
      foreign key(unit)
      references public.inventory_units(code)
      on update cascade;
  end if;
end
$$;

commit;
