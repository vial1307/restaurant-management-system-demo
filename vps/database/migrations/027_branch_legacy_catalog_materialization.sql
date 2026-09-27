begin;

-- Materialize the remaining browser-era branch catalog in PostgreSQL.
-- This migration is intentionally non-destructive:
--   * existing item metadata is not overwritten;
--   * existing quantity/minimum rows are never rewritten;
--   * only missing catalog rows and missing item/location associations are created.
-- Fuxing/Yongji are discovered through sites.metadata.inventory_mode='branch',
-- so the migration also covers future branch sites that opt into this model.

create temporary table legacy_branch_catalog(
  item_suffix text primary key,
  name_zh_tw text not null,
  name_vi text not null,
  unit text not null,
  work_area text not null,
  storage_only boolean not null
) on commit drop;

insert into legacy_branch_catalog(item_suffix,name_zh_tw,name_vi,unit,work_area,storage_only) values
  ('tofu','豆乾','Đậu khô','盒','noodles',false),
  ('duck-tongue','鴨舌','Lưỡi vịt','盒','noodles',false),
  ('duck-wing','鴨翅','Cánh vịt','盒','noodles',false),
  ('duck-intestine-box','鴨腸','Lòng vịt','盒','noodles',false),
  ('thick-noodles','粗麵','Mì sợi to','包','noodles',false),
  ('thin-noodles','細麵','Mì sợi nhỏ','包','noodles',false),
  ('handmade-noodles','手工麵','Mì thủ công','塊','noodles',false),
  ('oxtail-rice-box','牛尾追飯','Cơm đuôi bò','盒','noodles',false),
  ('tripe-noodles','牛肚沾麵','Mì chấm dạ dày bò','盒','noodles',false),
  ('stewed-rice','燴飯','Cơm sốt','盒','noodles',false),
  ('dry-noodle-sauce','乾麵醬','Sốt mì khô','包','noodles',false),
  ('beef-juice','牛肉汁','Nước sốt bò','包','noodles',false),
  ('frozen-noodles','冷凍麵','Mì đông lạnh','片','noodles',false),
  ('baby-cabbage','顆白菜','Cải thìa','斤','noodles',false),
  ('cabbage','高麗菜','Bắp cải','顆','noodles',false),
  ('duck-intestine','鴨腸','Lòng vịt','包','seafood',true),
  ('freezer-fried-squid','炸魷魚','Mực chiên','包','soup',true),
  ('freezer-crispy-ribs','排骨酥','Sườn non chiên giòn','斤','soup',true),
  ('freezer-fried-taro','炸芋頭','Khoai môn chiên','包','soup',true),
  ('freezer-buniu-concentrate','不牛濃縮','Cốt cô đặc 不牛','包','soup',true),
  ('freezer-pork-knuckle','豬腳','Chân giò heo','包','soup',true),
  ('freezer-sous-vide-pork-shoulder','舒肥梅花豬','Nạc vai heo sous-vide','包','soup',true),
  ('freezer-beef-noodle-broth','牛麵湯','Nước dùng mì bò','包','soup',true),
  ('freezer-clear-stew-broth','清燉湯','Nước dùng bò hầm trong','包','soup',true),
  ('freezer-kombu-broth-large','昆布湯(大)','Nước dùng kombu túi lớn','包','soup',true),
  ('freezer-kombu-broth-small','昆布湯(小)','Nước dùng kombu túi nhỏ','包','soup',true),
  ('freezer-taro-chicken-soup','芋頭雞湯','Canh gà khoai môn','包','soup',true),
  ('freezer-light-mala-broth','輕麻湯包','Gói nước dùng mala nhẹ','包','soup',true),
  ('freezer-heavy-mala-broth','重麻湯包','Gói nước dùng mala đậm','包','soup',true),
  ('freezer-sichuan-mala-broth','川麻湯包','Gói nước dùng mala Tứ Xuyên','包','soup',true),
  ('freezer-oxtail-meat-2kg','牛尾肉袋(2K/包)','Túi thịt đuôi bò 2 kg','包','soup',true),
  ('freezer-noodle-oil-1kg','麵油(1K)','Dầu mì 1 kg','包','soup',true),
  ('freezer-heavy-mala-oil-3kg','重麻油(3K/包)','Dầu mala đậm 3 kg','包','soup',true),
  ('freezer-beef-tendon-3kg','牛筋(3K)蒸湯','Gân bò 3 kg nấu nước dùng','包','soup',true),
  ('freezer-beef-bag','牛肉袋','Túi thịt bò','包','soup',true),
  ('freezer-noodle-oil','麵油','Dầu mì','包','soup',true),
  ('freezer-heavy-mala-oil','重麻油','Dầu mala đậm','包','soup',true),
  ('freezer-hell-beef-rice','地獄牛肉燴飯','Cơm sốt thịt bò địa ngục','包','noodles',true),
  ('freezer-rice-sauce-180g','燴飯汁(180g)','Sốt cơm 180 g','包','noodles',true),
  ('freezer-hell-tripe','地獄牛肚','Dạ dày bò địa ngục','包','noodles',true),
  ('freezer-sous-vide-steak','舒肥牛排','Bít tết bò sous-vide','包','noodles',true),
  ('freezer-secret-garlic-sauce','秘蒜醬','Sốt tỏi bí truyền','包','noodles',true),
  ('freezer-mild-dipping-sauce','微辣沾醬','Sốt chấm cay nhẹ','包','noodles',true),
  ('oxtail-rice','牛尾追飯','Cơm đuôi bò','包','noodles',true),
  ('freezer-braised-tofu','滷膠豆干','Đậu phụ khô kho 滷膠','包','noodles',true),
  ('freezer-braised-duck-wing','滷膠鴨翅','Cánh vịt kho 滷膠','包','noodles',true),
  ('freezer-braised-duck-tongue','滷膠鴨舌','Lưỡi vịt kho 滷膠','包','noodles',true),
  ('freezer-braised-duck-intestine','滷膠鴨腸','Lòng vịt kho 滷膠','包','noodles',true),
  ('freezer-tiger-skin-chicken-feet','虎皮G腳(包)','Chân gà da hổ','包','noodles',true),
  ('freezer-tender-beef','滑牛肉(包)','Thịt bò mềm ướp','包','meat',true),
  ('freezer-rice-cake','追飯糕(包)','Bánh 追飯糕','包','meat',true),
  ('freezer-pr-short-rib','PR牛小排','Sườn bò non PR','包','meat',true),
  ('freezer-pr-marbled-beef','PR雪花','Bò vân mỡ PR','包','meat',true),
  ('freezer-ch-marbled-beef','CH雪花','Bò vân mỡ CH','包','meat',true),
  ('freezer-lamb-shoulder','羊肩包','Gói vai cừu','包','meat',true),
  ('freezer-ribeye','肋眼','Thịt bò ribeye','包','meat',true),
  ('freezer-pork-collar-box','梅花豬','Nạc vai heo','箱','meat',true),
  ('freezer-yellow-beef-brisket','黃牛胸','Ức bò vàng','包','seafood',true),
  ('freezer-wagyu','和牛','Thịt bò Wagyu','包','seafood',true),
  ('freezer-yellow-throat','黃喉','Hoàng hầu','包','seafood',true),
  ('freezer-frog','田雞','Thịt ếch','包','seafood',true),
  ('freezer-large-intestine','大腸','Lòng già','包','seafood',true),
  ('freezer-braised-tripe','滷牛肚','Dạ dày bò kho','包','seafood',true),
  ('freezer-grass-prawn','草蝦','Tôm sú','箱','seafood',true),
  ('freezer-beef-egg-dumpling','牛肉蛋餃','Há cảo trứng nhân bò','包','seafood',true),
  ('freezer-french-bread','法國麵包','Bánh mì Pháp','個','seafood',true),
  ('freezer-croissant','可頌','Bánh croissant','個','seafood',true),
  ('freezer-cuttlefish-paste','花枝漿','Chả mực','包','seafood',true),
  ('freezer-pork-egg-dumpling','豬肉蛋餃','Há cảo trứng nhân heo','包','seafood',true),
  ('freezer-sanji-fish-dumpling','三記魚餃','Sủi cảo cá Sanji','包','seafood',true),
  ('freezer-duck-meatball','鴨肉丸','Viên thịt vịt','包','seafood',true),
  ('freezer-tofu-skin','腐皮','Tàu hũ ky','斤','seafood',true),
  ('freezer-taro-ball','芋頭丸','Viên khoai môn','包','seafood',true),
  ('freezer-lobster','龍蝦','Tôm hùm','隻','seafood',true),
  ('freezer-sous-vide-chicken','舒肥雞','Gà sous-vide','包','soup',true);

create temporary table legacy_branch_catalog_locations(
  item_suffix text not null references legacy_branch_catalog(item_suffix),
  storage_ui_key text not null,
  minimum_quantity numeric(14,3) not null default 0,
  primary key(item_suffix,storage_ui_key)
) on commit drop;

insert into legacy_branch_catalog_locations(item_suffix,storage_ui_key,minimum_quantity) values
  ('tofu','kitchen',10.000),
  ('duck-tongue','kitchen',10.000),
  ('duck-wing','kitchen',5.000),
  ('duck-intestine-box','kitchen',5.000),
  ('thick-noodles','kitchen',4.000),
  ('thin-noodles','kitchen',4.000),
  ('handmade-noodles','four-door',8.000),
  ('oxtail-rice-box','four-door',5.000),
  ('tripe-noodles','four-door',5.000),
  ('stewed-rice','four-door',5.000),
  ('dry-noodle-sauce','large-fridge',2.000),
  ('beef-juice','large-fridge',2.000),
  ('frozen-noodles','large-freezer',60.000),
  ('baby-cabbage','large-fridge',4.000),
  ('cabbage','large-fridge',2.000),
  ('tofu','large-fridge',20.000),
  ('duck-tongue','large-fridge',20.000),
  ('duck-wing','large-freezer',10.000),
  ('duck-intestine','large-freezer',3.000),
  ('freezer-fried-squid','large-freezer',2.000),
  ('freezer-crispy-ribs','large-freezer',3.000),
  ('freezer-fried-taro','large-freezer',3.000),
  ('freezer-buniu-concentrate','large-freezer',3.000),
  ('freezer-pork-knuckle','large-freezer',5.000),
  ('freezer-sous-vide-pork-shoulder','large-freezer',0.000),
  ('freezer-beef-noodle-broth','large-freezer',0.000),
  ('freezer-clear-stew-broth','large-freezer',0.000),
  ('freezer-kombu-broth-large','large-freezer',5.000),
  ('freezer-kombu-broth-small','large-freezer',15.000),
  ('freezer-taro-chicken-soup','large-freezer',0.000),
  ('freezer-light-mala-broth','large-freezer',30.000),
  ('freezer-heavy-mala-broth','large-freezer',50.000),
  ('freezer-sichuan-mala-broth','large-freezer',15.000),
  ('freezer-oxtail-meat-2kg','large-freezer',10.000),
  ('freezer-noodle-oil-1kg','large-freezer',0.000),
  ('freezer-heavy-mala-oil-3kg','large-freezer',0.000),
  ('freezer-beef-tendon-3kg','large-freezer',0.000),
  ('freezer-beef-bag','large-freezer',0.000),
  ('freezer-noodle-oil','large-freezer',0.000),
  ('freezer-heavy-mala-oil','large-freezer',0.000),
  ('freezer-hell-beef-rice','large-freezer',30.000),
  ('freezer-rice-sauce-180g','large-freezer',10.000),
  ('freezer-hell-tripe','large-freezer',20.000),
  ('freezer-sous-vide-steak','large-freezer',15.000),
  ('freezer-secret-garlic-sauce','large-freezer',20.000),
  ('freezer-mild-dipping-sauce','large-freezer',20.000),
  ('oxtail-rice','large-freezer',100.000),
  ('freezer-braised-tofu','large-freezer',30.000),
  ('freezer-braised-duck-wing','large-freezer',10.000),
  ('freezer-braised-duck-tongue','large-freezer',20.000),
  ('freezer-braised-duck-intestine','large-freezer',20.000),
  ('freezer-tiger-skin-chicken-feet','large-freezer',10.000),
  ('freezer-tender-beef','large-freezer',10.000),
  ('freezer-rice-cake','large-freezer',10.000),
  ('freezer-pr-short-rib','large-freezer',1.000),
  ('freezer-pr-marbled-beef','large-freezer',2.000),
  ('freezer-ch-marbled-beef','large-freezer',1.000),
  ('freezer-lamb-shoulder','large-freezer',1.000),
  ('freezer-ribeye','large-freezer',1.000),
  ('freezer-pork-collar-box','large-freezer',1.000),
  ('freezer-yellow-beef-brisket','large-freezer',3.000),
  ('freezer-wagyu','large-freezer',0.000),
  ('freezer-yellow-throat','large-freezer',3.000),
  ('freezer-frog','large-freezer',20.000),
  ('freezer-large-intestine','large-freezer',30.000),
  ('freezer-braised-tripe','large-freezer',30.000),
  ('freezer-grass-prawn','large-freezer',1.000),
  ('freezer-beef-egg-dumpling','large-freezer',10.000),
  ('freezer-french-bread','large-freezer',20.000),
  ('freezer-croissant','large-freezer',15.000),
  ('freezer-cuttlefish-paste','large-freezer',20.000),
  ('freezer-pork-egg-dumpling','large-freezer',1.000),
  ('freezer-sanji-fish-dumpling','large-freezer',20.000),
  ('freezer-duck-meatball','large-freezer',1.000),
  ('freezer-tofu-skin','large-freezer',4.000),
  ('freezer-taro-ball','large-freezer',1.000),
  ('freezer-lobster','large-freezer',5.000),
  ('freezer-sous-vide-chicken','large-freezer',0.000);

create temporary table legacy_branch_sites on commit drop as
select s.code,s.sort_order
from public.sites s
where s.active=true
  and coalesce(s.metadata->>'inventory_mode','')='branch'
  and exists (
    select 1
    from public.inventory_locations l
    where l.site=s.code
      and l.active=true
      and l.kind='storage'
  );

create temporary table legacy_branch_catalog_before on commit drop as
select
  s.code as site,
  count(i.id)::int as item_count
from legacy_branch_sites s
left join public.inventory_items i
  on split_part(i.item_key,':',1)=s.code
group by s.code;

-- Refuse to create branch items whose declared Work Area is not configured in
-- PostgreSQL. Work Area identity remains master data, never a browser fallback.
do $legacy_work_area_guard$
begin
  if exists (
    select 1
    from legacy_branch_sites s
    cross join legacy_branch_catalog p
    left join public.work_areas w
      on w.site_code=s.code
     and w.code=p.work_area
     and w.active=true
    where w.code is null
  ) then
    raise exception 'LEGACY_BRANCH_CATALOG_WORK_AREA_MISSING';
  end if;
end;
$legacy_work_area_guard$;

-- Create only missing item identities. When the same suffix already exists on
-- another branch, reuse its catalog identity and operational metadata so the
-- second branch does not fork the same product into another identity.
with branch_sites as (
  select code,sort_order
  from legacy_branch_sites
),
missing as (
  select
    b.code as site,
    p.*,
    template.catalog_key as template_catalog_key,
    template.name_zh_tw as template_name_zh_tw,
    template.name_vi as template_name_vi,
    template.unit as template_unit,
    template.work_area as template_work_area,
    template.storage_only as template_storage_only
  from branch_sites b
  cross join legacy_branch_catalog p
  left join public.inventory_items current
    on current.item_key=b.code||':'||p.item_suffix
  left join lateral (
    select i.catalog_key,i.name_zh_tw,i.name_vi,i.unit,i.work_area,i.storage_only
    from public.inventory_items i
    join public.sites ts
      on ts.code=split_part(i.item_key,':',1)
     and ts.active=true
    where substring(i.item_key from position(':' in i.item_key)+1)=p.item_suffix
      and split_part(i.item_key,':',1)<>b.code
      and coalesce(ts.metadata->>'inventory_mode','')='branch'
    order by i.active desc,ts.sort_order,i.updated_at desc
    limit 1
  ) template on true
  where current.id is null
)
insert into public.inventory_items(
  item_key,catalog_key,name_zh_tw,name_vi,unit,work_area,storage_only,active
)
select
  site||':'||item_suffix,
  coalesce(nullif(template_catalog_key,''),'legacy-'||item_suffix),
  coalesce(nullif(template_name_zh_tw,''),name_zh_tw),
  coalesce(nullif(template_name_vi,''),name_vi),
  coalesce(nullif(template_unit,''),unit),
  coalesce(nullif(template_work_area,''),work_area),
  coalesce(template_storage_only,storage_only),
  true
from missing
on conflict(item_key) do nothing;

-- Materialize the storage associations represented by the old browser catalog.
-- Existing physical quantities and minimums remain untouched; the legacy minimum
-- is used only when an association did not previously exist.
insert into public.inventory_stock(item_id,location_id,quantity,minimum_quantity,updated_at)
select
  i.id,
  l.id,
  0,
  mapping.minimum_quantity,
  now()
from legacy_branch_sites s
join legacy_branch_catalog_locations mapping on true
join public.inventory_items i
  on i.item_key=s.code||':'||mapping.item_suffix
 and i.active=true
join public.inventory_locations l
  on l.site=s.code
 and l.kind='storage'
 and l.active=true
 and l.metadata->>'ui_key'=mapping.storage_ui_key
on conflict(item_id,location_id) do nothing;

-- Every active branch product with a configured work_area must be recognized
-- by its database-owned Work Location, even when it is reserve-heavy or carries
-- the historical storage_only flag. The work row represents the item at the
-- workstation and starts at zero; it does not move or duplicate storage quantity.
insert into public.inventory_stock(item_id,location_id,quantity,minimum_quantity,updated_at)
select
  i.id,
  l.id,
  0,
  0,
  now()
from legacy_branch_sites s
join public.inventory_items i
  on split_part(i.item_key,':',1)=s.code
 and i.active=true
join public.inventory_locations l
  on l.site=s.code
 and l.kind='work'
 and l.active=true
 and l.metadata->>'work_area'=i.work_area
on conflict(item_id,location_id) do nothing;

-- A branch item with a valid work_area but no corresponding work-stock row
-- would disappear from the 工作區 UI because hydration is database-driven.
do $branch_work_stock_guard$
begin
  if exists (
    select 1
    from legacy_branch_sites s
    join public.inventory_items i
      on split_part(i.item_key,':',1)=s.code
     and i.active=true
    join public.work_areas w
      on w.site_code=s.code
     and w.code=i.work_area
     and w.active=true
    where not exists (
      select 1
      from public.inventory_stock st
      join public.inventory_locations l
        on l.id=st.location_id
       and l.site=s.code
       and l.kind='work'
       and l.active=true
       and l.metadata->>'work_area'=i.work_area
      where st.item_id=i.id
    )
  ) then
    raise exception 'BRANCH_ACTIVE_ITEM_WORK_STOCK_MISSING';
  end if;
end;
$branch_work_stock_guard$;

-- Keep the invariant after this one-time migration as well. This is important
-- for Super Admin/direct SQL/API edits: branch catalog identity and 工作區
-- projection cannot silently diverge again.
create or replace function public.sync_branch_inventory_item_work_projection()
returns trigger
language plpgsql
as $branch_item_work_projection$
declare
  v_site text;
  v_mode text;
  v_target uuid;
  v_protected integer;
begin
  v_site := split_part(new.item_key,':',1);

  select coalesce(s.metadata->>'inventory_mode','')
  into v_mode
  from public.sites s
  where s.code=v_site;

  if coalesce(v_mode,'')<>'branch' or new.active=false then
    return new;
  end if;

  select l.id
  into v_target
  from public.inventory_locations l
  where l.site=v_site
    and l.kind='work'
    and l.active=true
    and l.metadata->>'work_area'=new.work_area
  order by l.sort_order,l.code
  limit 1;

  if v_target is null then
    raise exception 'BRANCH_WORK_LOCATION_NOT_FOUND:%:%',v_site,new.work_area;
  end if;

  if tg_op='UPDATE' and old.work_area is distinct from new.work_area then
    select count(*)::int
    into v_protected
    from public.inventory_stock st
    join public.inventory_locations l on l.id=st.location_id
    where st.item_id=new.id
      and l.site=v_site
      and l.kind='work'
      and l.id<>v_target
      and (st.quantity>0 or st.minimum_quantity>0);

    if v_protected>0 then
      raise exception 'BRANCH_WORK_AREA_HAS_PROTECTED_STOCK:%',new.item_key;
    end if;

    delete from public.inventory_stock st
    using public.inventory_locations l
    where st.location_id=l.id
      and st.item_id=new.id
      and l.site=v_site
      and l.kind='work'
      and l.id<>v_target
      and st.quantity=0
      and st.minimum_quantity=0;
  end if;

  insert into public.inventory_stock(
    item_id,location_id,quantity,minimum_quantity,updated_at
  ) values(
    new.id,v_target,0,0,now()
  )
  on conflict(item_id,location_id) do nothing;

  return new;
end;
$branch_item_work_projection$;

drop trigger if exists inventory_items_sync_branch_work_projection on public.inventory_items;
create trigger inventory_items_sync_branch_work_projection
after insert or update of item_key,work_area,active
on public.inventory_items
for each row execute function public.sync_branch_inventory_item_work_projection();

-- Every branch must now contain every historical catalog identity, and every
-- active branch item must be projected exactly once into the Work Area declared
-- by inventory_items.work_area.
do $legacy_catalog_verify$
begin
  if exists (
    select 1
    from legacy_branch_sites s
    cross join legacy_branch_catalog p
    left join public.inventory_items i
      on i.item_key=s.code||':'||p.item_suffix
    where i.id is null
  ) then
    raise exception 'LEGACY_BRANCH_CATALOG_MATERIALIZATION_INCOMPLETE';
  end if;

  if exists (
    select 1
    from legacy_branch_sites s
    join public.inventory_items i
      on split_part(i.item_key,':',1)=s.code
     and i.active=true
    left join public.inventory_stock st on st.item_id=i.id
    left join public.inventory_locations l
      on l.id=st.location_id
     and l.site=s.code
     and l.kind='work'
     and l.active=true
     and l.metadata->>'work_area'=i.work_area
    group by i.id
    having count(l.id)<>1
  ) then
    raise exception 'BRANCH_ITEM_WORK_PROJECTION_INCOMPLETE';
  end if;
end;
$legacy_catalog_verify$;

insert into public.audit_logs(
  actor_user_id,actor_username,action,entity_type,entity_id,site,
  before_data,after_data,metadata
)
select
  null,
  'system:migration-027',
  'system_branch_legacy_catalog_materialize',
  'inventory_catalog',
  s.code,
  s.code,
  jsonb_build_object('item_count',coalesce(b.item_count,0)),
  jsonb_build_object(
    'item_count',(
      select count(*)::int
      from public.inventory_items i
      where split_part(i.item_key,':',1)=s.code
    ),
    'legacy_catalog_rows',(select count(*)::int from legacy_branch_catalog),
    'legacy_storage_associations',(
      select count(*)::int
      from public.inventory_stock st
      join public.inventory_items i on i.id=st.item_id
      join public.inventory_locations l on l.id=st.location_id
      where split_part(i.item_key,':',1)=s.code
        and l.site=s.code
        and l.kind='storage'
        and substring(i.item_key from position(':' in i.item_key)+1)
            in (select item_suffix from legacy_branch_catalog)
    ),
    'work_area_products',(
      select count(distinct i.id)::int
      from public.inventory_items i
      join public.inventory_stock st on st.item_id=i.id
      join public.inventory_locations l
        on l.id=st.location_id
       and l.site=s.code
       and l.kind='work'
       and l.active=true
       and l.metadata->>'work_area'=i.work_area
      where i.active=true
        and split_part(i.item_key,':',1)=s.code
    )
  ),
  jsonb_build_object(
    'source','migration_027',
    'policy','insert_missing_catalog_and_associations_without_rewriting_existing_stock',
    'legacy_runtime_rows',77,
    'materialized_catalog_identities',75,
    'historical_extra_items',1,
    'item_suffixes',(
      select jsonb_agg(item_suffix order by item_suffix)
      from legacy_branch_catalog
    )
  )
from legacy_branch_sites s
left join legacy_branch_catalog_before b on b.site=s.code;

commit;
