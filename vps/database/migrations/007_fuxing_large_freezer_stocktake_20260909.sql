begin;

-- One-time Fuxing 大冷凍 stocktake supplied on 2026-09-09.
-- CI has no production location when migrations run, so this block is a no-op there.
-- Production must have the canonical fuxing-large-freezer location.
do $stocktake$
declare
  v_location_id uuid;
  v_item_id uuid;
  v_before numeric(14,3);
  v_after numeric(14,3);
  v_row record;
  v_applied integer := 0;
begin
  select id into v_location_id
  from public.inventory_locations
  where code='fuxing-large-freezer' and site='fuxing' and kind='storage' and active=true
  limit 1;

  if v_location_id is null then
    raise notice 'Skipping Fuxing 2026-09-09 stocktake: production location not present.';
    return;
  end if;

  for v_row in
    select * from (values
      ('fuxing:freezer-beef-noodle-broth','牛麵湯','Nước dùng mì bò','包','soup',29::numeric,'8/31:5+3000; 9/1:5+3720; 9/4:5+3980; 9/8:5+3590; 9/8:5+3200; 9/8:4+2640+2430 (29包 + 22560g散量)'),
      ('fuxing:freezer-clear-stew-broth','清燉湯','Nước dùng bò hầm trong','包','soup',25,'9/1:5+2480; 9/1:5+3010; 9/3:5+3370; 9/8:5+3380; 9/8:5+2920 (25包 + 15160g散量)'),
      ('fuxing:freezer-kombu-broth-large','昆布湯(大)','Nước dùng kombu túi lớn','包','soup',21,'21'),
      ('fuxing:freezer-kombu-broth-small','昆布湯(小)','Nước dùng kombu túi nhỏ','包','soup',40,'40'),
      ('fuxing:freezer-taro-chicken-soup','芋頭雞湯','Canh gà khoai môn','包','soup',5,'9/7:5+2530 (5包 + 2530g散量)'),
      ('fuxing:freezer-light-mala-broth','輕麻湯包','Gói nước dùng mala nhẹ','包','soup',93,'78+15 = 93袋'),
      ('fuxing:freezer-heavy-mala-broth','重麻湯包','Gói nước dùng mala đậm','包','soup',36,'36袋'),
      ('fuxing:oxtail-rice','牛尾追飯','Cơm đuôi bò','包','noodles',91,'91'),
      ('fuxing:freezer-oxtail-meat-2kg','牛尾肉袋(2K/包)','Túi thịt đuôi bò 2 kg','包','soup',7,'7包（2k/包），6包生'),
      ('fuxing:freezer-beef-bag','牛肉袋','Túi thịt bò','包','soup',7,'7'),
      ('fuxing:freezer-beef-tendon-3kg','牛筋(3K)熬湯','Gân bò 3 kg nấu nước dùng','包','soup',0,'0'),
      ('fuxing:freezer-braised-tofu','滷膠豆干','Đậu phụ khô kho 滷膠','包','noodles',110,'110'),
      ('fuxing:freezer-braised-duck-wing','滷膠鴨翅（剁）','Cánh vịt kho 滷膠 (chặt)','包','noodles',32,'32（剁）'),
      ('fuxing:freezer-braised-duck-tongue','滷膠鴨舌','Lưỡi vịt kho 滷膠','包','noodles',56,'56'),
      ('fuxing:freezer-braised-duck-intestine','滷膠鴨腸','Lòng vịt kho 滷膠','包','noodles',94,'94'),
      ('fuxing:freezer-tiger-skin-chicken-feet','虎皮雞腳','Chân gà da hổ','包','noodles',75,'75'),
      ('fuxing:freezer-rice-cake','追飯糕','Bánh 追飯糕','包','meat',30,'8/10:30'),
      ('fuxing:freezer-tender-beef','滑牛','Thịt bò mềm ướp','包','meat',21,'21'),
      ('fuxing:freezer-sichuan-mala-broth','川麻湯包','Gói nước dùng mala Tứ Xuyên','包','soup',35,'35'),
      ('fuxing:freezer-noodle-oil-1kg','麵油(1K)','Dầu mì 1 kg','包','soup',57,'57'),
      ('fuxing:freezer-heavy-mala-oil','重麻油','Dầu mala đậm','包','soup',39,'39'),
      ('fuxing:freezer-yellow-throat','黃喉','Hoàng hầu','包','seafood',4,'4+880 (4包 + 880g散量)'),
      ('fuxing:duck-intestine','鴨腸','Lòng vịt','包','seafood',4,'4+749 (4包 + 749g散量)'),
      ('fuxing:freezer-frog','田雞','Thịt ếch','包','seafood',49,'49'),
      ('fuxing:freezer-large-intestine','大腸','Lòng già','包','seafood',60,'60'),
      ('fuxing:freezer-braised-tripe','滷牛肚','Dạ dày bò kho','包','seafood',130,'130'),
      ('fuxing:freezer-grass-prawn','草蝦','Tôm sú','箱','seafood',0,'0箱'),
      ('fuxing:freezer-french-bread','法國麵包','Bánh mì Pháp','條','seafood',71,'71條'),
      ('fuxing:freezer-pr-short-rib','PR牛小排','Sườn bò non PR','塊','meat',1,'1塊'),
      ('fuxing:freezer-pr-marbled-beef','PR雪花','Bò vân mỡ PR','塊','meat',0,'0塊'),
      ('fuxing:freezer-ch-marbled-beef','CH雪花','Bò vân mỡ CH','塊','meat',1,'1塊'),
      ('fuxing:freezer-lamb-shoulder','羊肩包','Gói vai cừu','塊','meat',3,'3塊'),
      ('fuxing:freezer-ribeye','肋眼','Thịt bò ribeye','塊','meat',3,'3塊'),
      ('fuxing:freezer-yellow-beef-brisket','黃牛胸','Ức bò vàng','塊','seafood',6,'6塊'),
      ('fuxing:freezer-wagyu','和牛','Thịt bò Wagyu','塊','seafood',0,'0塊'),
      ('fuxing:freezer-pork-collar-box','梅花豬','Nạc vai heo','條','meat',7,'7條'),
      ('fuxing:freezer-hell-tripe','地獄牛肚','Dạ dày bò địa ngục','包','noodles',27,'27'),
      ('fuxing:freezer-rice-sauce-180g','地獄燴飯180克','Sốt cơm địa ngục 180 g','包','noodles',28,'28（地獄燴飯180克）'),
      ('fuxing:freezer-hell-beef-rice','地獄牛肉燴飯','Cơm sốt thịt bò địa ngục','包','noodles',27,'27'),
      ('fuxing:freezer-sous-vide-steak','舒肥牛排','Bít tết bò sous-vide','包','noodles',44,'44'),
      ('fuxing:freezer-secret-garlic-sauce','秘蒜醬','Sốt tỏi bí truyền','包','noodles',50,'50'),
      ('fuxing:freezer-mild-dipping-sauce','微辣沾醬','Sốt chấm cay nhẹ','包','noodles',20,'20'),
      ('fuxing:frozen-noodles','冷凍麵','Mì đông lạnh','片','noodles',30,'1箱 = 30片'),
      ('fuxing:freezer-crispy-ribs','排骨酥','Sườn non chiên giòn','斤','soup',3,'3斤'),
      ('fuxing:freezer-fried-taro','炸芋頭','Khoai môn chiên','包','soup',5,'5'),
      ('fuxing:freezer-fried-squid','炸魷魚','Mực chiên','包','soup',1,'1'),
      ('fuxing:freezer-buniu-concentrate','不牛濃縮','Cốt cô đặc 不牛','包','soup',3,'3'),
      ('fuxing:freezer-sous-vide-chicken','舒肥雞','Gà sous-vide','包','soup',51,'11+40 = 51包'),
      ('fuxing:freezer-pork-knuckle','豬腳','Chân giò heo','包','soup',6,'6'),
      ('fuxing:freezer-sous-vide-pork-shoulder','舒肥梅花豬','Nạc vai heo sous-vide','包','soup',10,'10'),
      ('fuxing:freezer-croissant','可頌','Bánh croissant','個','seafood',15,'15')
    ) as x(item_key,name_zh_tw,name_vi,unit,work_area,quantity,raw_detail)
  loop
    insert into public.inventory_items(
      item_key,catalog_key,name_zh_tw,name_vi,unit,work_area,storage_only,active
    ) values (
      v_row.item_key,
      regexp_replace(translate(lower(v_row.name_zh_tw),'（）',''),'[[:space:][:punct:]]','','g'),
      v_row.name_zh_tw,v_row.name_vi,v_row.unit,v_row.work_area,true,true
    )
    on conflict(item_key) do update set
      name_zh_tw=excluded.name_zh_tw,
      name_vi=excluded.name_vi,
      unit=excluded.unit,
      work_area=excluded.work_area,
      active=true
    returning id into v_item_id;

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
        '復興大冷凍盤點 2026-09-09 / Kiểm kê tủ đông lớn Fuxing 2026-09-09',
        null,'system:stocktake-2026-09-09',
        jsonb_build_object(
          'source','user_stocktake','site','fuxing','location_code','fuxing-large-freezer',
          'counted_at','2026-09-09','raw_detail',v_row.raw_detail,
          'before_quantity',v_before,'after_quantity',v_row.quantity,'unit',v_row.unit
        )
      );
    end if;

    v_applied := v_applied + 1;
  end loop;

  if v_applied <> 51 then
    raise exception 'FUXING_STOCKTAKE_ROW_COUNT_MISMATCH: expected 51, got %',v_applied;
  end if;

  insert into public.audit_logs(
    actor_user_id,actor_username,action,entity_type,entity_id,site,before_data,after_data,metadata
  ) values (
    null,'system:stocktake-2026-09-09','stocktake_import','inventory_location',
    v_location_id::text,'fuxing',null,
    jsonb_build_object('rows',v_applied,'location_code','fuxing-large-freezer'),
    jsonb_build_object(
      'source','user_stocktake','counted_at','2026-09-09',
      'mixed_weight_policy','whole packages stored as quantity; residual grams preserved in transaction raw_detail'
    )
  );
end
$stocktake$;

commit;
