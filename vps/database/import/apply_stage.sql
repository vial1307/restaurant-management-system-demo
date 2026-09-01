begin;

insert into public.app_users(
  id,username,display_name,password_hash,role,location,permissions,
  preferred_language,active,created_at,updated_at
)
select
  p.id,
  lower(trim(p.username)),
  coalesce(nullif(trim(p.display_name),''),trim(p.username)),
  null,
  case
    when p.role='admin' then 'admin'
    when p.role in ('manager','supervisor','central') then 'manager'
    else 'employee'
  end,
  case when p.location in ('all','central','fuxing','yongji') then p.location else 'fuxing' end,
  coalesce(p.permissions,'{}'::jsonb),
  case when p.preferred_language in ('vi','zh-TW') then p.preferred_language else 'vi' end,
  coalesce(p.active,true),
  coalesce(p.created_at,now()),
  coalesce(p.updated_at,now())
from import_stage.profiles p
on conflict (id) do update set
  username=excluded.username,
  display_name=excluded.display_name,
  role=excluded.role,
  location=excluded.location,
  permissions=excluded.permissions,
  preferred_language=excluded.preferred_language,
  active=excluded.active,
  updated_at=excluded.updated_at;

insert into public.inventory_locations(
  id,code,name_zh_tw,name_vi,site,kind,sort_order,active,created_at,updated_at
)
select
  l.id,l.code,l.name_zh_tw,l.name_vi,l.site,
  case when l.kind in ('storage','work') then l.kind else 'storage' end,
  coalesce(l.sort_order,0),coalesce(l.active,true),now(),now()
from import_stage.locations l
on conflict (id) do update set
  code=excluded.code,
  name_zh_tw=excluded.name_zh_tw,
  name_vi=excluded.name_vi,
  site=excluded.site,
  kind=excluded.kind,
  sort_order=excluded.sort_order,
  active=excluded.active,
  updated_at=now();

insert into public.inventory_items(
  id,item_key,catalog_key,name_zh_tw,name_vi,unit,work_area,
  storage_only,active,created_at,updated_at
)
select
  i.id,
  coalesce(nullif(trim(i.item_key),''),'legacy:'||i.id::text),
  coalesce(
    nullif(trim(i.catalog_key),''),
    lower(regexp_replace(coalesce(i.name_zh_tw,i.id::text),'[[:space:][:punct:]]+','','g'))
  ),
  i.name_zh_tw,
  i.name_vi,
  i.unit,
  case when i.work_area in ('noodles','soup','seafood','meat') then i.work_area else 'noodles' end,
  coalesce(i.storage_only,false),
  coalesce(i.active,true),
  coalesce(i.created_at,now()),
  coalesce(i.updated_at,now())
from import_stage.items i
on conflict (id) do update set
  item_key=excluded.item_key,
  catalog_key=excluded.catalog_key,
  name_zh_tw=excluded.name_zh_tw,
  name_vi=excluded.name_vi,
  unit=excluded.unit,
  work_area=excluded.work_area,
  storage_only=excluded.storage_only,
  active=excluded.active,
  updated_at=excluded.updated_at;

insert into public.inventory_stock(
  item_id,location_id,quantity,minimum_quantity,updated_at
)
select
  s.item_id,s.location_id,
  greatest(coalesce(s.quantity,0),0),
  greatest(coalesce(s.minimum_quantity,0),0),
  coalesce(s.updated_at,now())
from import_stage.stock s
join public.inventory_items i on i.id=s.item_id
join public.inventory_locations l on l.id=s.location_id
on conflict (item_id,location_id) do update set
  quantity=excluded.quantity,
  minimum_quantity=excluded.minimum_quantity,
  updated_at=excluded.updated_at;

insert into public.inventory_transactions(
  id,item_id,source_location_id,destination_location_id,action,amount,note,
  actor_user_id,actor_username,metadata,created_at
)
select
  t.id,
  t.item_id,
  case
    when t.direction='out' then t.location_id
    when t.direction='adjust' and coalesce(t.after_quantity,0) < coalesce(t.before_quantity,0) then t.location_id
    else null
  end,
  case
    when t.direction='in' then t.location_id
    when t.direction='adjust' and coalesce(t.after_quantity,0) >= coalesce(t.before_quantity,0) then t.location_id
    else null
  end,
  case when t.direction in ('in','out','adjust') then t.direction else 'adjust' end,
  greatest(coalesce(t.amount,0),0.001),
  coalesce(t.note,''),
  u.id,
  p.username,
  jsonb_build_object(
    'legacy_source','supabase',
    'legacy_direction',t.direction,
    'legacy_location_id',t.location_id,
    'legacy_before_quantity',t.before_quantity,
    'legacy_after_quantity',t.after_quantity
  ),
  coalesce(t.created_at,now())
from import_stage.transactions t
join public.inventory_items i on i.id=t.item_id
left join public.app_users u on u.id=t.actor_id
left join import_stage.profiles p on p.id=t.actor_id
on conflict (id) do nothing;

insert into public.inventory_receive_defaults(
  site,catalog_key,location_id,updated_by,updated_at
)
select
  r.site,r.catalog_key,r.location_id,u.id,coalesce(r.updated_at,now())
from import_stage.receive_defaults r
join public.inventory_locations l on l.id=r.location_id
left join public.app_users u on u.id=r.updated_by
on conflict (site,catalog_key) do update set
  location_id=excluded.location_id,
  updated_by=excluded.updated_by,
  updated_at=excluded.updated_at;

commit;
