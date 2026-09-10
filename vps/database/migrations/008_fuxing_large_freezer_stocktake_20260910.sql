begin;

-- One-time Fuxing 大冷凍 stocktake supplied on 2026-09-10.
-- PostgreSQL remains authoritative. Mixed-unit residual detail is preserved
-- verbatim in transaction metadata; no package/weight or package/piece
-- conversion is inferred when no conversion factor was supplied.
do $stocktake$
declare
  v_location_id uuid;
  v_item_id uuid;
  v_before numeric(14,3);
  v_after numeric(14,3);
  v_unit text;
  v_row record;
  v_applied integer := 0;
begin
  select id into v_location_id
  from public.inventory_locations
  where code='fuxing-large-freezer' and site='fuxing' and kind='storage' and active=true
  limit 1;

  if v_location_id is null then
    raise notice 'Skipping Fuxing 2026-09-10 stocktake: production location not present.';
    return;
  end if;

  for v_row in
    select * from (values
      ('fuxing:freezer-beef-noodle-broth',20::numeric,'8/31:5+3000; 9/1:5+3720; 9/4:5+3980; 9/8:5+3590 (20包 + 14290g散量)'),
      ('fuxing:freezer-clear-stew-broth',20,'9/1:5+2480; 9/1:5+3010; 9/3:5+3370; 9/8:5+2920 (20包 + 11780g散量)'),
      ('fuxing:freezer-kombu-broth-large',21,'21'),
      ('fuxing:freezer-kombu-broth-small',40,'40'),
      ('fuxing:freezer-taro-chicken-soup',5,'9/7:5+2530 (5包 + 2530g散量)'),
      ('fuxing:freezer-light-mala-broth',78,'78袋'),
      ('fuxing:freezer-heavy-mala-broth',67,'16+51 = 67袋'),
      ('fuxing:oxtail-rice',91,'91'),
      ('fuxing:freezer-oxtail-meat-2kg',9,'9包（2K/包），其中6包生'),
      ('fuxing:freezer-beef-bag',7,'7'),
      ('fuxing:freezer-beef-tendon-3kg',0,'0'),
      ('fuxing:freezer-braised-tofu',105,'105'),
      ('fuxing:freezer-braised-duck-wing',57,'57（剁）'),
      ('fuxing:freezer-braised-duck-tongue',54,'54'),
      ('fuxing:freezer-braised-duck-intestine',94,'94'),
      ('fuxing:freezer-tiger-skin-chicken-feet',75,'75'),
      ('fuxing:freezer-rice-cake',26,'8/10:26'),
      ('fuxing:freezer-tender-beef',17,'17'),
      ('fuxing:freezer-sichuan-mala-broth',35,'35'),
      ('fuxing:freezer-noodle-oil-1kg',57,'57'),
      ('fuxing:freezer-heavy-mala-oil',39,'39'),
      ('fuxing:freezer-yellow-throat',4,'4+880 (4包 + 880g散量)'),
      ('fuxing:duck-intestine',4,'4+749 (4包 + 749g散量)'),
      ('fuxing:freezer-frog',31,'31'),
      ('fuxing:freezer-large-intestine',40,'40'),
      ('fuxing:freezer-braised-tripe',110,'110'),
      ('fuxing:freezer-grass-prawn',0,'0箱'),
      ('fuxing:freezer-french-bread',71,'71條'),
      ('fuxing:freezer-pr-short-rib',1,'1塊'),
      ('fuxing:freezer-pr-marbled-beef',0,'0塊'),
      ('fuxing:freezer-ch-marbled-beef',1,'1塊'),
      ('fuxing:freezer-lamb-shoulder',3,'3塊'),
      ('fuxing:freezer-ribeye',3,'3塊'),
      ('fuxing:freezer-yellow-beef-brisket',6,'6塊'),
      ('fuxing:freezer-wagyu',0,'0塊'),
      ('fuxing:freezer-pork-collar-box',7,'7條'),
      ('fuxing:freezer-hell-tripe',24,'24'),
      ('fuxing:freezer-rice-sauce-180g',28,'28（地獄燴飯180克）'),
      ('fuxing:freezer-hell-beef-rice',18,'18'),
      ('fuxing:freezer-sous-vide-steak',44,'44'),
      ('fuxing:freezer-secret-garlic-sauce',50,'50'),
      ('fuxing:freezer-mild-dipping-sauce',20,'20'),
      ('fuxing:frozen-noodles',30,'1箱 = 30片'),
      ('fuxing:freezer-crispy-ribs',3,'3斤'),
      ('fuxing:freezer-fried-taro',3,'3'),
      ('fuxing:freezer-fried-squid',1,'1'),
      ('fuxing:freezer-buniu-concentrate',3,'3'),
      ('fuxing:freezer-sous-vide-chicken',18,'18包 + 44片 + 96片（未提供包/片換算，庫存數量保留18包；140片保留於盤點明細）'),
      ('fuxing:freezer-pork-knuckle',6,'6'),
      ('fuxing:freezer-sous-vide-pork-shoulder',5,'5'),
      ('fuxing:freezer-croissant',15,'15')
    ) as x(item_key,quantity,raw_detail)
  loop
    select id, unit into v_item_id, v_unit
    from public.inventory_items
    where item_key=v_row.item_key
    limit 1
    for update;

    if v_item_id is null then
      raise exception 'FUXING_STOCKTAKE_ITEM_MISSING: %', v_row.item_key;
    end if;

    -- A product included in the user's current physical stocktake is current
    -- inventory and must remain visible in the active branch catalog.
    update public.inventory_items
    set active=true
    where id=v_item_id and active=false;

    select quantity into v_before
    from public.inventory_stock
    where item_id=v_item_id and location_id=v_location_id
    for update;

    if not found then
      v_before := 0;
      insert into public.inventory_stock(item_id,location_id,quantity,minimum_quantity,updated_at)
      values(v_item_id,v_location_id,v_row.quantity,0,now());
    else
      update public.inventory_stock
      set quantity=v_row.quantity, updated_at=now()
      where item_id=v_item_id and location_id=v_location_id;
    end if;

    select quantity into v_after
    from public.inventory_stock
    where item_id=v_item_id and location_id=v_location_id;

    if v_after is distinct from v_row.quantity then
      raise exception 'FUXING_STOCKTAKE_VERIFY_FAILED: % expected %, got %',
        v_row.item_key,v_row.quantity,v_after;
    end if;

    if v_before is distinct from v_row.quantity then
      insert into public.inventory_transactions(
        item_id,source_location_id,destination_location_id,action,amount,note,
        actor_user_id,actor_username,metadata
      ) values (
        v_item_id,
        case when v_row.quantity < v_before then v_location_id else null end,
        case when v_row.quantity >= v_before then v_location_id else null end,
        'adjust',abs(v_row.quantity-v_before),
        '復興大冷凍盤點 2026-09-10 / Kiểm kê tủ đông lớn Fuxing 2026-09-10',
        null,'system:stocktake-2026-09-10',
        jsonb_build_object(
          'source','user_stocktake','site','fuxing','location_code','fuxing-large-freezer',
          'counted_at','2026-09-10','raw_detail',v_row.raw_detail,
          'before_quantity',v_before,'after_quantity',v_row.quantity,'unit',v_unit
        )
      );
    end if;

    v_applied := v_applied + 1;
    v_item_id := null;
    v_unit := null;
  end loop;

  if v_applied <> 51 then
    raise exception 'FUXING_STOCKTAKE_ROW_COUNT_MISMATCH: expected 51, got %',v_applied;
  end if;

  insert into public.audit_logs(
    actor_user_id,actor_username,action,entity_type,entity_id,site,before_data,after_data,metadata
  ) values (
    null,'system:stocktake-2026-09-10','stocktake_import','inventory_location',
    v_location_id::text,'fuxing',null,
    jsonb_build_object('rows',v_applied,'location_code','fuxing-large-freezer'),
    jsonb_build_object(
      'source','user_stocktake','counted_at','2026-09-10',
      'mixed_unit_policy','configured stock unit retained; residual grams/pieces preserved in transaction raw_detail when no conversion factor was supplied'
    )
  );
end
$stocktake$;

commit;
