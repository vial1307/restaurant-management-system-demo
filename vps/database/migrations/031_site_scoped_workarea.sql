begin;

-- Inventory schema 031
-- Work Area classification is site-owned master data.
--
-- A shared catalog_key identifies the same product identity across sites, but
-- it does not mean Central, Fuxing, Yongji, or any future branch must use the
-- same Work Area. Each site can configure its own Work Area/storage layout
-- through PostgreSQL/Super Admin. The database continues to enforce the
-- important local invariant: an active item's Work stock must belong to the
-- same site and the same declared work_area.

drop trigger if exists inventory_items_catalog_work_area_guard
  on public.inventory_items;

drop function if exists public.inventory_items_catalog_work_area_guard();

-- Preserve the schema-030 site-local final-state guards.
do $inventory_031_verify$
declare
  v_stock_guard boolean;
  v_item_guard boolean;
begin
  select exists (
    select 1
    from pg_trigger t
    where t.tgrelid='public.inventory_stock'::regclass
      and t.tgname='inventory_stock_work_area_guard'
      and not t.tgisinternal
      and t.tgdeferrable
      and t.tginitdeferred
  ) into v_stock_guard;

  select exists (
    select 1
    from pg_trigger t
    where t.tgrelid='public.inventory_items'::regclass
      and t.tgname='inventory_item_work_area_stock_guard'
      and not t.tgisinternal
      and t.tgdeferrable
      and t.tginitdeferred
  ) into v_item_guard;

  if not coalesce(v_stock_guard,false) or not coalesce(v_item_guard,false) then
    raise exception 'INVENTORY_SITE_WORK_AREA_GUARDS_MISSING';
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

  if exists (
    select 1
    from public.inventory_items i
    join public.sites s
      on s.code=split_part(i.item_key,':',1)
     and s.active=true
     and coalesce(s.metadata->>'inventory_mode','')='branch'
    where i.active=true
      and not exists (
        select 1
        from public.inventory_stock st
        join public.inventory_locations l
          on l.id=st.location_id
         and l.site=s.code
         and l.kind='work'
         and l.active=true
         and coalesce(l.metadata->>'work_area','')=i.work_area
        where st.item_id=i.id
      )
  ) then
    raise exception 'ACTIVE_BRANCH_ITEM_WORK_PROJECTION_MISSING';
  end if;
end;
$inventory_031_verify$;

commit;
