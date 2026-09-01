import crypto from "node:crypto";
import { pool, withTransaction } from "./db.mjs";
import { hasPermission, requireUser, siteAllowed } from "./auth.mjs";

const SITES = new Set(["central","fuxing","yongji"]);

function requireInventory(user, site, action, reply) {
  if (siteAllowed(user, site) && hasPermission(user, "inventory", action)) return true;
  reply.code(403).send({ error: action === "view" ? "INVENTORY_VIEW_NOT_ALLOWED" : "INVENTORY_EDIT_NOT_ALLOWED" });
  return false;
}

export async function registerInventoryExtraRoutes(app) {
  app.get("/api/inventory/schema-version", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    return { version: 11 };
  });

  app.get("/api/inventory/receive-defaults", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    if (!hasPermission(user, "inventory", "view")) {
      return reply.code(403).send({ error: "INVENTORY_VIEW_NOT_ALLOWED" });
    }

    const sites = String(request.query?.sites || "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => SITES.has(value));
    const catalogKeys = String(request.query?.catalogKeys || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    const values = [];
    const where = [];
    if (sites.length) {
      values.push(sites);
      where.push(`d.site=any($${values.length}::text[])`);
    }
    if (catalogKeys.length) {
      values.push(catalogKeys);
      where.push(`d.catalog_key=any($${values.length}::text[])`);
    }

    const { rows } = await pool.query(
      `select d.site,d.catalog_key,d.location_id,d.updated_at,
              l.code as location_code,l.name_zh_tw,l.name_vi,l.kind,l.active
       from public.inventory_receive_defaults d
       join public.inventory_locations l on l.id=d.location_id
       ${where.length ? "where " + where.join(" and ") : ""}
       order by d.site,d.catalog_key`,
      values
    );

    return { defaults: rows };
  });

  app.post("/api/inventory/receive-default", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const site = String(request.body?.site || "");
    const catalogKey = String(request.body?.catalogKey || "").trim();
    const locationCode = String(request.body?.locationCode || "").trim();

    if (!SITES.has(site) || !catalogKey) {
      return reply.code(400).send({ error: "INVALID_RECEIVE_DEFAULT" });
    }
    if (!requireInventory(user, site, "edit", reply)) return;

    if (!locationCode) {
      await pool.query(
        "delete from public.inventory_receive_defaults where site=$1 and catalog_key=$2",
        [site,catalogKey]
      );
      return { ok:true, deleted:true };
    }

    const loc = await pool.query(
      `select id
       from public.inventory_locations
       where site=$1 and code=$2 and kind='storage' and active=true
       limit 1`,
      [site,locationCode]
    );
    if (!loc.rowCount) return reply.code(404).send({ error: "LOCATION_NOT_FOUND" });

    await pool.query(
      `insert into public.inventory_receive_defaults(site,catalog_key,location_id,updated_by,updated_at)
       values($1,$2,$3,$4,now())
       on conflict(site,catalog_key) do update
       set location_id=excluded.location_id,
           updated_by=excluded.updated_by,
           updated_at=now()`,
      [site,catalogKey,loc.rows[0].id,user.id]
    );

    return { ok:true };
  });

  app.post("/api/inventory/set-quantity", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const itemId = String(request.body?.itemId || "");
    const locationId = String(request.body?.locationId || "");
    const quantity = Number(request.body?.quantity);
    const note = String(request.body?.note || "盤點調整 / Điều chỉnh kiểm kê");

    if (!itemId || !locationId || !Number.isFinite(quantity) || quantity < 0) {
      return reply.code(400).send({ error: "INVALID_QUANTITY" });
    }

    try {
      const result = await withTransaction(async (client) => {
        const ctx = await client.query(
          `select i.item_key,l.site
           from public.inventory_items i
           join public.inventory_locations l on l.id=$2 and l.active=true
           where i.id=$1 and i.active=true
           limit 1`,
          [itemId,locationId]
        );
        const row = ctx.rows[0];
        if (!row) throw Object.assign(new Error("ITEM_LOCATION_NOT_FOUND"), { statusCode:404 });
        if (!requireInventory(user, row.site, "edit", reply)) {
          throw Object.assign(new Error("INVENTORY_EDIT_NOT_ALLOWED"), { statusCode:403, alreadySent:true });
        }

        await client.query(
          `insert into public.inventory_stock(item_id,location_id,quantity,minimum_quantity)
           values($1,$2,0,0)
           on conflict(item_id,location_id) do nothing`,
          [itemId,locationId]
        );
        const locked = await client.query(
          "select quantity from public.inventory_stock where item_id=$1 and location_id=$2 for update",
          [itemId,locationId]
        );
        const before = Number(locked.rows[0]?.quantity || 0);

        await client.query(
          "update public.inventory_stock set quantity=$3,updated_at=now() where item_id=$1 and location_id=$2",
          [itemId,locationId,quantity]
        );

        if (before !== quantity) {
          await client.query(
            `insert into public.inventory_transactions(
               item_id,source_location_id,destination_location_id,action,amount,note,
               actor_user_id,actor_username,metadata
             ) values(
               $1,$2,$3,'adjust',$4,$5,$6,$7,
               jsonb_build_object('before_quantity',$8,'after_quantity',$9)
             )`,
            [
              itemId,
              quantity < before ? locationId : null,
              quantity >= before ? locationId : null,
              Math.abs(quantity-before),
              note,user.id,user.username,before,quantity
            ]
          );
        }

        return { before, after:quantity };
      });
      return result;
    } catch (error) {
      if (error.alreadySent) return;
      return reply.code(error.statusCode || 500).send({ error:error.message || "SET_QUANTITY_FAILED" });
    }
  });

  app.post("/api/inventory/set-minimum", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const itemId = String(request.body?.itemId || "");
    const locationId = String(request.body?.locationId || "");
    const minimum = Number(request.body?.minimum);

    if (!itemId || !locationId || !Number.isFinite(minimum) || minimum < 0) {
      return reply.code(400).send({ error: "INVALID_MINIMUM" });
    }

    const ctx = await pool.query(
      `select l.site
       from public.inventory_items i
       join public.inventory_locations l on l.id=$2 and l.active=true
       where i.id=$1 and i.active=true
       limit 1`,
      [itemId,locationId]
    );
    const row = ctx.rows[0];
    if (!row) return reply.code(404).send({ error: "ITEM_LOCATION_NOT_FOUND" });
    if (!requireInventory(user,row.site,"edit",reply)) return;

    await pool.query(
      `insert into public.inventory_stock(item_id,location_id,quantity,minimum_quantity)
       values($1,$2,0,$3)
       on conflict(item_id,location_id) do update
       set minimum_quantity=excluded.minimum_quantity,updated_at=now()`,
      [itemId,locationId,minimum]
    );
    return { ok:true };
  });

  app.post("/api/inventory/catalog/sync", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const item = request.body?.item;
    const itemKey = String(item?.key || "");
    const site = itemKey.split(":")[0];
    if (!item || !SITES.has(site)) {
      return reply.code(400).send({ error: "INVALID_CATALOG_ITEM" });
    }
    if (!requireInventory(user,site,"edit",reply)) return;

    try {
      const saved = await withTransaction(async (client) => {
        const upsert = await client.query(
          `insert into public.inventory_items(
             item_key,catalog_key,name_zh_tw,name_vi,unit,work_area,storage_only,active
           ) values($1,$2,$3,$4,$5,$6,$7,true)
           on conflict(item_key) do update set
             catalog_key=excluded.catalog_key,
             name_zh_tw=excluded.name_zh_tw,
             name_vi=excluded.name_vi,
             unit=excluded.unit,
             work_area=excluded.work_area,
             storage_only=excluded.storage_only,
             active=true
           returning *`,
          [
            itemKey,
            String(item.catalog_key || ""),
            String(item.zh || itemKey),
            String(item.vi || item.zh || itemKey),
            String(item.unit || "個"),
            String(item.work_area || "noodles"),
            Boolean(item.storage_only),
          ]
        );
        const savedItem = upsert.rows[0];

        const wantedLocationIds = [];
        for (const loc of Array.isArray(item.locations) ? item.locations : []) {
          const code = String(loc.code || "");
          if (!code) continue;

          const location = await client.query(
            "select id,site from public.inventory_locations where code=$1 and active=true limit 1",
            [code]
          );
          if (!location.rowCount || location.rows[0].site !== site) continue;
          const locationId = location.rows[0].id;
          wantedLocationIds.push(locationId);

          await client.query(
            `insert into public.inventory_stock(item_id,location_id,quantity,minimum_quantity,updated_at)
             values($1,$2,$3,$4,now())
             on conflict(item_id,location_id) do update set
               quantity=excluded.quantity,
               minimum_quantity=excluded.minimum_quantity,
               updated_at=now()`,
            [
              savedItem.id,locationId,
              Math.max(0,Number(loc.quantity) || 0),
              Math.max(0,Number(loc.minimum) || 0),
            ]
          );
        }

        if (wantedLocationIds.length) {
          await client.query(
            `delete from public.inventory_stock
             where item_id=$1
               and location_id in (
                 select l.id from public.inventory_locations l where l.site=$2
               )
               and not(location_id=any($3::uuid[]))
               and quantity=0`,
            [savedItem.id,site,wantedLocationIds]
          );
        }

        return savedItem;
      });
      return { item:saved };
    } catch (error) {
      if (error?.code === "23505") return reply.code(409).send({ error:"CATALOG_CONFLICT" });
      return reply.code(500).send({ error:error.message || "CATALOG_SYNC_FAILED" });
    }
  });

  app.post("/api/inventory/catalog/archive", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    if (user.role !== "admin") return reply.code(403).send({ error:"ADMIN_REQUIRED" });

    const itemKey = String(request.body?.itemKey || "");
    if (!itemKey) return reply.code(400).send({ error:"ITEM_KEY_REQUIRED" });

    const result = await pool.query(
      "update public.inventory_items set active=false where item_key=$1 returning id",
      [itemKey]
    );
    return { archived:Boolean(result.rowCount) };
  });

  app.post("/api/inventory/direct-transfer", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const itemId = String(request.body?.itemId || "");
    const sourceLocationId = String(request.body?.sourceLocationId || "");
    const destinationLocationId = String(request.body?.destinationLocationId || "");
    const quantity = Number(request.body?.quantity);
    const note = String(request.body?.note || "");

    if (!itemId || !sourceLocationId || !destinationLocationId ||
        sourceLocationId === destinationLocationId ||
        !Number.isFinite(quantity) || quantity <= 0) {
      return reply.code(400).send({ error:"INVALID_DIRECT_TRANSFER" });
    }

    try {
      const data = await withTransaction(async (client) => {
        const ctx = await client.query(
          `select
             i.id,i.item_key,i.catalog_key,i.name_zh_tw,i.name_vi,i.unit,i.work_area,i.storage_only,
             s.site as from_site,d.site as to_site
           from public.inventory_items i
           join public.inventory_locations s on s.id=$2 and s.active=true and s.kind='storage'
           join public.inventory_locations d on d.id=$3 and d.active=true and d.kind='storage'
           where i.id=$1 and i.active=true
           limit 1`,
          [itemId,sourceLocationId,destinationLocationId]
        );
        const sourceItem = ctx.rows[0];
        if (!sourceItem) throw Object.assign(new Error("ITEM_LOCATION_NOT_FOUND"), { statusCode:404 });
        if (sourceItem.from_site === sourceItem.to_site) {
          throw Object.assign(new Error("USE_INTERNAL_TRANSFER"), { statusCode:400 });
        }
        if (!(siteAllowed(user,sourceItem.from_site) && hasPermission(user,"inventory","edit"))) {
          throw Object.assign(new Error("INVENTORY_EDIT_NOT_ALLOWED"), { statusCode:403 });
        }

        const destinationItemResult = await client.query(
          `select *
           from public.inventory_items
           where active=true and catalog_key=$1 and item_key like $2
           order by created_at
           limit 1`,
          [sourceItem.catalog_key,sourceItem.to_site + ":%"]
        );

        let destinationItem = destinationItemResult.rows[0];

        if (destinationItem) {
          const configured = await client.query(
            `select s.location_id
             from public.inventory_stock s
             join public.inventory_locations l on l.id=s.location_id
             where s.item_id=$1
               and l.site=$2
               and l.kind='storage'
               and l.active=true
             order by l.sort_order,l.code`,
            [destinationItem.id,sourceItem.to_site]
          );
          const configuredIds = configured.rows.map((row)=>row.location_id);

          if (configuredIds.length === 1 && configuredIds[0] !== destinationLocationId) {
            throw Object.assign(new Error("DESTINATION_LOCATION_MUST_USE_CONFIGURED_SINGLE"), { statusCode:409 });
          }

          if (configuredIds.length > 1) {
            const fixed = await client.query(
              `select location_id
               from public.inventory_receive_defaults
               where site=$1 and catalog_key=$2
               limit 1`,
              [sourceItem.to_site,sourceItem.catalog_key]
            );
            const fixedLocationId = fixed.rows[0]?.location_id || "";
            if (!fixedLocationId) {
              throw Object.assign(new Error("DESTINATION_RECEIVE_DEFAULT_REQUIRED"), { statusCode:409 });
            }
            if (fixedLocationId !== destinationLocationId) {
              throw Object.assign(new Error("DESTINATION_LOCATION_MUST_USE_RECEIVE_DEFAULT"), { statusCode:409 });
            }
          }
        }

        if (!destinationItem) {
          const suffix = String(sourceItem.item_key).split(":").slice(1).join(":") || crypto.randomUUID();
          const created = await client.query(
            `insert into public.inventory_items(
               item_key,catalog_key,name_zh_tw,name_vi,unit,work_area,storage_only,active
             ) values($1,$2,$3,$4,$5,$6,$7,true)
             returning *`,
            [
              sourceItem.to_site + ":" + suffix,
              sourceItem.catalog_key,
              sourceItem.name_zh_tw,
              sourceItem.name_vi,
              sourceItem.unit,
              sourceItem.work_area,
              sourceItem.storage_only
            ]
          );
          destinationItem = created.rows[0];
        }

        await client.query(
          `insert into public.inventory_stock(item_id,location_id,quantity,minimum_quantity)
           values($1,$2,0,0)
           on conflict(item_id,location_id) do nothing`,
          [sourceItem.id,sourceLocationId]
        );
        await client.query(
          `insert into public.inventory_stock(item_id,location_id,quantity,minimum_quantity)
           values($1,$2,0,0)
           on conflict(item_id,location_id) do nothing`,
          [destinationItem.id,destinationLocationId]
        );

        const sourceStock = await client.query(
          "select quantity from public.inventory_stock where item_id=$1 and location_id=$2 for update",
          [sourceItem.id,sourceLocationId]
        );
        const destinationStock = await client.query(
          "select quantity from public.inventory_stock where item_id=$1 and location_id=$2 for update",
          [destinationItem.id,destinationLocationId]
        );

        const sourceBefore = Number(sourceStock.rows[0]?.quantity || 0);
        const destinationBefore = Number(destinationStock.rows[0]?.quantity || 0);
        if (sourceBefore < quantity) {
          throw Object.assign(new Error("INSUFFICIENT_STOCK"), { statusCode:409 });
        }

        const sourceAfter = sourceBefore - quantity;
        const destinationAfter = destinationBefore + quantity;

        await client.query(
          "update public.inventory_stock set quantity=$3,updated_at=now() where item_id=$1 and location_id=$2",
          [sourceItem.id,sourceLocationId,sourceAfter]
        );
        await client.query(
          "update public.inventory_stock set quantity=$3,updated_at=now() where item_id=$1 and location_id=$2",
          [destinationItem.id,destinationLocationId,destinationAfter]
        );

        const tx = await client.query(
          `insert into public.inventory_transactions(
             item_id,source_location_id,destination_location_id,action,amount,note,
             actor_user_id,actor_username,metadata
           ) values(
             $1,$2,$3,'ship',$4,$5,$6,$7,
             jsonb_build_object(
               'destination_item_id',$8,
               'source_before',$9,'source_after',$10,
               'destination_before',$11,'destination_after',$12,
               'from_site',$13,'to_site',$14
             )
           )
           returning id,created_at`,
          [
            sourceItem.id,sourceLocationId,destinationLocationId,quantity,note,
            user.id,user.username,destinationItem.id,
            sourceBefore,sourceAfter,destinationBefore,destinationAfter,
            sourceItem.from_site,sourceItem.to_site
          ]
        );

        return {
          id:tx.rows[0].id,
          from_site:sourceItem.from_site,
          to_site:sourceItem.to_site,
          source_item_id:sourceItem.id,
          destination_item_id:destinationItem.id,
          source_location_id:sourceLocationId,
          destination_location_id:destinationLocationId,
          quantity,
          created_at:tx.rows[0].created_at,
        };
      });
      return data;
    } catch (error) {
      return reply.code(error.statusCode || 500).send({ error:error.message || "DIRECT_TRANSFER_FAILED" });
    }
  });
}
