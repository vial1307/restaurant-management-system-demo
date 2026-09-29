begin;

-- Inventory schema 030
-- Shared catalog Work Area updates are coordinated across Central + branches.
-- Schema 029's immediate row trigger correctly blocked drift, but it also
-- blocked a legitimate atomic multi-row move because the first row was checked
-- before its peers were updated. Convert the same invariant into a deferred
-- database constraint: partial writes still fail at COMMIT, while a complete
-- transaction can move the shared catalog together.

create or replace function public.inventory_items_catalog_work_area_guard()
returns trigger
language plpgsql
as $catalog_work_area_guard$
declare
  v_site text;
  v_mode text;
  v_canonical_area text;
  v_canonical_count integer;
  v_conflicts integer;
begin
  if tg_op='UPDATE' then
    if new.item_key is not distinct from old.item_key
       and new.catalog_key is not distinct from old.catalog_key
       and new.work_area is not distinct from old.work_area
       and new.active is not distinct from old.active then
      return null;
    end if;
  end if;

  if new.active=false then
    return null;
  end if;

  v_site := split_part(new.item_key,':',1);
  select coalesce(s.metadata->>'inventory_mode','')
  into v_mode
  from public.sites s
  where s.code=v_site;

  if coalesce(v_mode,'')='branch' then
    select min(i.work_area),count(distinct i.work_area)::int
    into v_canonical_area,v_canonical_count
    from public.inventory_items i
    join public.sites s
      on s.code=split_part(i.item_key,':',1)
     and s.active=true
     and coalesce(s.metadata->>'inventory_mode','')='central'
    where i.active=true
      and i.catalog_key=new.catalog_key;

    if coalesce(v_canonical_count,0)=1
       and new.work_area is distinct from v_canonical_area then
      raise exception 'BRANCH_CATALOG_WORK_AREA_MISMATCH:%:%:%',
        new.catalog_key,new.work_area,v_canonical_area;
    end if;
  elsif coalesce(v_mode,'')='central' then
    select count(*)::int
    into v_conflicts
    from public.inventory_items i
    join public.sites s
      on s.code=split_part(i.item_key,':',1)
     and s.active=true
     and coalesce(s.metadata->>'inventory_mode','')='branch'
    where i.active=true
      and i.catalog_key=new.catalog_key
      and i.work_area is distinct from new.work_area;

    if coalesce(v_conflicts,0)>0 then
      raise exception 'CENTRAL_CATALOG_WORK_AREA_BRANCH_CONFLICT:%:%',
        new.catalog_key,new.work_area;
    end if;

    if exists (
      select 1
      from public.inventory_items i
      join public.sites s
        on s.code=split_part(i.item_key,':',1)
       and s.active=true
       and coalesce(s.metadata->>'inventory_mode','')='central'
      where i.active=true
        and i.catalog_key=new.catalog_key
        and i.id is distinct from new.id
        and i.work_area is distinct from new.work_area
    ) then
      raise exception 'CENTRAL_CATALOG_WORK_AREA_AMBIGUOUS:%',new.catalog_key;
    end if;
  end if;

  return null;
end;
$catalog_work_area_guard$;

drop trigger if exists inventory_items_catalog_work_area_guard on public.inventory_items;
create constraint trigger inventory_items_catalog_work_area_guard
after insert or update
on public.inventory_items
deferrable initially deferred
for each row execute function public.inventory_items_catalog_work_area_guard();

-- Hot-path indexes for database-driven inventory. These do not change data or
-- business authority; they accelerate site-scoped catalog/location/history
-- reads used by Website, Super Admin and transfer operations.
create index if not exists inventory_items_site_active_catalog_idx
  on public.inventory_items(
    (split_part(item_key,':',1)),
    catalog_key
  )
  where active=true;

create index if not exists inventory_locations_site_kind_active_sort_idx
  on public.inventory_locations(site,kind,sort_order,code)
  where active=true;

create index if not exists inventory_transactions_item_created_at_idx
  on public.inventory_transactions(item_id,created_at desc);

create index if not exists audit_logs_site_created_at_idx
  on public.audit_logs(site,created_at desc)
  where site is not null;

-- Migration-time safety verification: the database must still reject any
-- existing shared-catalog drift and the replacement trigger must truly be
-- deferred.
do $inventory_030_verify$
declare
  v_deferrable boolean;
  v_initdeferred boolean;
begin
  select t.tgdeferrable,t.tginitdeferred
  into v_deferrable,v_initdeferred
  from pg_trigger t
  where t.tgrelid='public.inventory_items'::regclass
    and t.tgname='inventory_items_catalog_work_area_guard'
    and not t.tgisinternal;

  if coalesce(v_deferrable,false)=false or coalesce(v_initdeferred,false)=false then
    raise exception 'INVENTORY_CATALOG_WORK_AREA_GUARD_NOT_DEFERRED';
  end if;

  if exists (
    with central_catalog as (
      select i.catalog_key,min(i.work_area) as work_area
      from public.inventory_items i
      join public.sites s
        on s.code=split_part(i.item_key,':',1)
       and s.active=true
       and coalesce(s.metadata->>'inventory_mode','')='central'
      where i.active=true
      group by i.catalog_key
      having count(distinct i.work_area)=1
    )
    select 1
    from public.inventory_items i
    join public.sites s
      on s.code=split_part(i.item_key,':',1)
     and s.active=true
     and coalesce(s.metadata->>'inventory_mode','')='branch'
    join central_catalog c using(catalog_key)
    where i.active=true
      and i.work_area is distinct from c.work_area
  ) then
    raise exception 'BRANCH_CATALOG_WORK_AREA_MISMATCH_REMAINS';
  end if;

  if exists (
    select 1
    from public.inventory_stock st
    join public.inventory_items i on i.id=st.item_id and i.active=true
    join public.inventory_locations l
      on l.id=st.location_id
     and l.kind='work'
     and l.active=true
    where l.site<>split_part(i.item_key,':',1)
       or coalesce(l.metadata->>'work_area','')<>i.work_area
  ) then
    raise exception 'INVENTORY_WORK_PROJECTION_DRIFT_REMAINS';
  end if;
end;
$inventory_030_verify$;

commit;
