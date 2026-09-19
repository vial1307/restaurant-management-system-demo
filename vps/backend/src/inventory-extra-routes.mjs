import crypto from "node:crypto";
import { pool, withTransaction } from "./db.mjs";
import { hasPermission, requireUser, siteAllowed } from "./auth.mjs";
import { activeSite, activeSiteCodes, isBranchSite } from "./site-registry.mjs";

function requireInventory(user, site, action, reply) {
  if (siteAllowed(user, site) && hasPermission(user, "inventory", action)) return true;
  reply.code(403).send({ error: action === "view" ? "INVENTORY_VIEW_NOT_ALLOWED" : "INVENTORY_EDIT_NOT_ALLOWED" });
  return false;
}

function canStocktakeRole(user, site) {
  return siteAllowed(user, site)
    && hasPermission(user, "inventory", "edit")
    && (user.role === "admin" || ["manager","supervisor"].includes(user.role));
}

function requireStocktakeRole(user, site, reply) {
  if (!requireInventory(user, site, "edit", reply)) return false;
  if (canStocktakeRole(user, site)) return true;
  reply.code(403).send({ error: "STOCKTAKE_ROLE_REQUIRED" });
  return false;
}

function requireCatalogManager(user, site, reply) {
  // Catalogue access follows the explicit inventory edit permission. Role
  // names must not silently override a permission granted by an administrator.
  return requireInventory(user, site, "edit", reply);
}

async function canManageReceiveDefault(user, site) {
  if (!siteAllowed(user, site) || !hasPermission(user, "inventory", "edit")) return false;
  if (user.role === "admin") return true;
  return user.role === "manager" && await isBranchSite(site);
}

async function requireReceiveDefaultManager(user, site, reply) {
  if (!requireInventory(user, site, "edit", reply)) return false;
  if (await canManageReceiveDefault(user, site)) return true;
  reply.code(403).send({ error: "RECEIVE_DEFAULT_MANAGER_REQUIRED" });
  return false;
}

export async function registerInventoryExtraRoutes(app) {
  app.get("/api/inventory/schema-version", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    return { version: 12 };
  });

  app.get("/api/inventory/destinations", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const source = String(request.query?.source || "").trim();
    const allowedSites = new Set(await activeSiteCodes());
    const sites = [...new Set(String(request.query?.sites || "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => allowedSites.has(value) && value !== source))];
    if (!(await activeSite(source))) return reply.code(400).send({ error:"INVALID_SITE" });
    if (!requireInventory(user, source, "edit", reply)) return;
    if (!sites.length) return { locations:[], catalog:[], receiveDefaults:[] };

    // Shipping users only receive routing metadata for other sites. Quantities
    // remain protected by the normal site-scoped inventory endpoint.
    const [locationResult, catalogResult, receiveDefaultResult] = await Promise.all([
      pool.query(
        `select id,code,name_zh_tw,name_vi,site,kind,sort_order,metadata
         from public.inventory_locations
         where site=any($1::text[]) and kind='storage' and active=true
         order by site,sort_order,code`,
        [sites]
      ),
      pool.query(
        `select i.id as item_id,i.item_key,i.catalog_key,i.name_zh_tw,i.name_vi,
                l.id as location_id,l.code as location_code,l.name_zh_tw as location_zh,
                l.name_vi as location_vi,l.site,l.metadata as location_metadata
         from public.inventory_items i
         join public.inventory_stock s on s.item_id=i.id
         join public.inventory_locations l on l.id=s.location_id
         where i.active=true and l.active=true and l.kind='storage'
           and l.site=any($1::text[])
         order by l.site,i.name_zh_tw,l.sort_order,l.code`,
        [sites]
      ),
      pool.query(
        `select d.site,d.catalog_key,d.location_id,d.updated_at,
                l.code as location_code,l.name_zh_tw,l.name_vi,l.kind,l.active,l.metadata
         from public.inventory_receive_defaults d
         join public.inventory_locations l on l.id=d.location_id
         where d.site=any($1::text[])
           and l.site=d.site
           and l.kind='storage'
           and l.active=true
         order by d.site,d.catalog_key`,
        [sites]
      ),
    ]);

    const catalog = [];
    const grouped = new Map();
    for (const row of catalogResult.rows) {
      const key = `${row.site}:${row.item_id}`;
      let item = grouped.get(key);
      if (!item) {
        item = {
          site:row.site,
          catalogKey:row.catalog_key,
          itemId:row.item_id,
          itemKey:row.item_key,
          zh:row.name_zh_tw,
          vi:row.name_vi,
          locations:[],
        };
        grouped.set(key,item);
        catalog.push(item);
      }
      item.locations.push({
        id:row.location_id,
        code:row.location_code,
        name_zh_tw:row.location_zh,
        name_vi:row.location_vi,
        site:row.site,
        metadata:row.location_metadata || {},
      });
    }

    return { locations:locationResult.rows, catalog, receiveDefaults:receiveDefaultResult.rows };
  });

  app.get("/api/inventory/receive-defaults", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    if (!hasPermission(user, "inventory", "view")) {
      return reply.code(403).send({ error: "INVENTORY_VIEW_NOT_ALLOWED" });
    }

    const allowedSites = new Set(await activeSiteCodes());
    const sites = String(request.query?.sites || "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => allowedSites.has(value));
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
              l.code as location_code,l.name_zh_tw,l.name_vi,l.kind,l.active,l.metadata
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

    if (!(await activeSite(site)) || !catalogKey) {
      return reply.code(400).send({ error: "INVALID_RECEIVE_DEFAULT" });
    }
    if (!(await requireReceiveDefaultManager(user, site, reply))) return;

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

    const configured = await pool.query(
      `select 1
       from public.inventory_items i
       join public.inventory_stock s on s.item_id=i.id
       where i.active=true
         and i.catalog_key=$1
         and i.item_key like $2
         and s.location_id=$3
       limit 1`,
      [catalogKey,site + ":%",loc.rows[0].id]
    );
    if (!configured.rowCount) {
      return reply.code(409).send({ error: "RECEIVE_DEFAULT_LOCATION_NOT_CONFIGURED" });
    }

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
        if (!requireStocktakeRole(user, row.site, reply)) {
          throw Object.assign(new Error("STOCKTAKE_ROLE_REQUIRED"), { statusCode:403, alreadySent:true });
        }
        if (!String(row.item_key || "").startsWith(row.site + ":")) {
          throw Object.assign(new Error("ITEM_SITE_MISMATCH"), { statusCode:400 });
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
               jsonb_build_object('before_quantity',$8::numeric,'after_quantity',$9::numeric)
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
      `select i.item_key,l.site
       from public.inventory_items i
       join public.inventory_locations l on l.id=$2 and l.active=true
       where i.id=$1 and i.active=true
       limit 1`,
      [itemId,locationId]
    );
    const row = ctx.rows[0];
    if (!row) return reply.code(404).send({ error: "ITEM_LOCATION_NOT_FOUND" });
    if (!requireStocktakeRole(user,row.site,reply)) return;
    if (!String(row.item_key || "").startsWith(row.site + ":")) {
      return reply.code(400).send({ error:"ITEM_SITE_MISMATCH" });
    }

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
    if (!item || !(await activeSite(site))) {
      return reply.code(400).send({ error: "INVALID_CATALOG_ITEM" });
    }
    if (!requireCatalogManager(user,site,reply)) return;

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
            String(item.work_area || ""),
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

          // Catalog sync owns only catalog/location association metadata.
          // Physical quantity and minimum configuration must use the dedicated
          // stocktake endpoints so quantity changes remain auditable and cannot
          // be replayed from a stale browser/catalog snapshot.
          await client.query(
            `insert into public.inventory_stock(item_id,location_id,quantity,minimum_quantity,updated_at)
             values($1,$2,0,0,now())
             on conflict(item_id,location_id) do nothing`,
            [savedItem.id,locationId]
          );
        }

        if (wantedLocationIds.length) {
          const protectedOmitted = await client.query(
            `select s.location_id,l.code as location_code,s.quantity,s.minimum_quantity
             from public.inventory_stock s
             join public.inventory_locations l on l.id=s.location_id
             where s.item_id=$1
               and l.site=$2
               and not(s.location_id=any($3::uuid[]))
               and (s.quantity>0 or s.minimum_quantity>0)
             order by l.code
             for update of s`,
            [savedItem.id,site,wantedLocationIds]
          );
          if (protectedOmitted.rowCount) {
            throw Object.assign(new Error("LOCATION_HAS_STOCK"), {
              statusCode:409,
              details:protectedOmitted.rows.map((row) => ({
                locationId:row.location_id,
                locationCode:row.location_code,
                quantity:Number(row.quantity || 0),
                minimum:Number(row.minimum_quantity || 0),
              })),
            });
          }

          await client.query(
            `delete from public.inventory_stock
             where item_id=$1
               and location_id in (
                 select l.id from public.inventory_locations l where l.site=$2
               )
               and not(location_id=any($3::uuid[]))
               and quantity=0
               and minimum_quantity=0`,
            [savedItem.id,site,wantedLocationIds]
          );
        }

        return savedItem;
      });
      return { item:saved };
    } catch (error) {
      if (error?.code === "23505") return reply.code(409).send({ error:"CATALOG_CONFLICT" });
      if (error?.message === "LOCATION_HAS_STOCK") {
        return reply.code(409).send({
          error:"LOCATION_HAS_STOCK",
          details:Array.isArray(error.details) ? error.details : [],
        });
      }
      return reply.code(error.statusCode || 500).send({ error:error.message || "CATALOG_SYNC_FAILED" });
    }
  });

  app.post("/api/inventory/catalog/archive", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    if (user.role !== "admin") return reply.code(403).send({ error:"ADMIN_REQUIRED" });

    const itemKey = String(request.body?.itemKey || "").trim();
    if (!itemKey) return reply.code(400).send({ error:"ITEM_KEY_REQUIRED" });

    try {
      const result = await withTransaction(async (client) => {
        const itemResult = await client.query(
          `select id,item_key,catalog_key,active
           from public.inventory_items
           where item_key=$1
           for update`,
          [itemKey]
        );
        const item = itemResult.rows[0];
        if (!item) return { archived:false };
        if (!item.active) return { archived:false, alreadyArchived:true };

        const site = String(item.item_key || "").split(":")[0];
        if (!(await activeSite(site))) {
          throw Object.assign(new Error("INVALID_SITE"), { statusCode:400 });
        }

        const stock = await client.query(
          `select s.location_id,l.code as location_code,s.quantity,s.minimum_quantity
           from public.inventory_stock s
           join public.inventory_locations l on l.id=s.location_id
           where s.item_id=$1
           order by l.code
           for update of s`,
          [item.id]
        );
        const protectedRows = stock.rows.filter((row) => (
          Number(row.quantity || 0) > 0 || Number(row.minimum_quantity || 0) > 0
        ));
        if (protectedRows.length) {
          throw Object.assign(new Error("ITEM_HAS_STOCK"), {
            statusCode:409,
            details:protectedRows.map((row) => ({
              locationId:row.location_id,
              locationCode:row.location_code,
              quantity:Number(row.quantity || 0),
              minimum:Number(row.minimum_quantity || 0),
            })),
          });
        }

        const receiveDefault = await client.query(
          `delete from public.inventory_receive_defaults d
           where d.site=$1
             and d.catalog_key=$2
             and not exists (
               select 1
               from public.inventory_items other
               where other.active=true
                 and other.id<>$3
                 and split_part(other.item_key,':',1)=d.site
                 and other.catalog_key=d.catalog_key
             )
           returning d.site,d.catalog_key,d.location_id`,
          [site,item.catalog_key,item.id]
        );

        const removedStock = await client.query(
          `delete from public.inventory_stock
           where item_id=$1
           returning location_id,quantity,minimum_quantity`,
          [item.id]
        );

        const archived = await client.query(
          `update public.inventory_items
           set active=false,updated_at=now()
           where id=$1 and active=true
           returning id`,
          [item.id]
        );

        if (archived.rowCount) {
          await client.query(
            `insert into public.audit_logs(
               actor_user_id,actor_username,action,entity_type,entity_id,site,
               before_data,after_data,metadata
             ) values(
               $1,$2,'inventory_catalog_archive','inventory_item',$3,$4,
               jsonb_build_object('active',true),
               jsonb_build_object('active',false),
               jsonb_build_object(
                 'item_key',$5::text,
                 'catalog_key',$6::text,
                 'stock_rows_removed',$7::int,
                 'receive_default_removed',$8::boolean
               )
             )`,
            [
              user.id,user.username,item.id,site,item.item_key,item.catalog_key,
              removedStock.rowCount,Boolean(receiveDefault.rowCount)
            ]
          );
        }

        return {
          archived:Boolean(archived.rowCount),
          stockRowsRemoved:removedStock.rowCount,
          receiveDefaultRemoved:Boolean(receiveDefault.rowCount),
        };
      });
      return result;
    } catch (error) {
      if (error?.message === "ITEM_HAS_STOCK") {
        return reply.code(409).send({
          error:"ITEM_HAS_STOCK",
          details:Array.isArray(error.details) ? error.details : [],
        });
      }
      return reply.code(error.statusCode || 500).send({
        error:error.message || "CATALOG_ARCHIVE_FAILED",
      });
    }
  });

  app.post("/api/inventory/relocate-storage", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const itemId = String(request.body?.itemId || "");
    const sourceLocationId = String(request.body?.sourceLocationId || "");
    const destinationLocationId = String(request.body?.destinationLocationId || "");
    const note = String(request.body?.note || "儲位移動 / Chuyển vị trí lưu");

    if (!itemId || !sourceLocationId || !destinationLocationId || sourceLocationId === destinationLocationId) {
      return reply.code(400).send({ error:"INVALID_STORAGE_RELOCATION" });
    }

    try {
      const data = await withTransaction(async (client) => {
        const ctx = await client.query(
          `select
             i.id,i.item_key,i.catalog_key,i.name_zh_tw,i.name_vi,i.unit,
             s.id as source_location_id,s.site as source_site,s.code as source_code,
             d.id as destination_location_id,d.site as destination_site,d.code as destination_code
           from public.inventory_items i
           join public.inventory_locations s
             on s.id=$2 and s.active=true and s.kind='storage'
           join public.inventory_locations d
             on d.id=$3 and d.active=true and d.kind='storage'
           where i.id=$1 and i.active=true
           limit 1`,
          [itemId,sourceLocationId,destinationLocationId]
        );
        const row = ctx.rows[0];
        if (!row) throw Object.assign(new Error("ITEM_LOCATION_NOT_FOUND"), { statusCode:404 });
        if (row.source_site !== row.destination_site) {
          throw Object.assign(new Error("RELOCATION_MUST_STAY_IN_SITE"), { statusCode:400 });
        }
        if (!requireCatalogManager(user,row.source_site,reply)) {
          throw Object.assign(new Error("CATALOG_EDIT_NOT_ALLOWED"), { statusCode:403, alreadySent:true });
        }
        if (!String(row.item_key || "").startsWith(row.source_site + ":")) {
          throw Object.assign(new Error("ITEM_SITE_MISMATCH"), { statusCode:400 });
        }

        const sourceResult = await client.query(
          `select quantity,minimum_quantity
           from public.inventory_stock
           where item_id=$1 and location_id=$2
           for update`,
          [itemId,sourceLocationId]
        );
        if (!sourceResult.rowCount) {
          throw Object.assign(new Error("SOURCE_STORAGE_NOT_CONFIGURED"), { statusCode:409 });
        }

        await client.query(
          `insert into public.inventory_stock(item_id,location_id,quantity,minimum_quantity,updated_at)
           values($1,$2,0,0,now())
           on conflict(item_id,location_id) do nothing`,
          [itemId,destinationLocationId]
        );

        const destinationResult = await client.query(
          `select quantity,minimum_quantity
           from public.inventory_stock
           where item_id=$1 and location_id=$2
           for update`,
          [itemId,destinationLocationId]
        );

        const sourceBefore = Number(sourceResult.rows[0].quantity || 0);
        const sourceMinimum = Number(sourceResult.rows[0].minimum_quantity || 0);
        const destinationBefore = Number(destinationResult.rows[0]?.quantity || 0);
        const destinationMinimumBefore = Number(destinationResult.rows[0]?.minimum_quantity || 0);
        const destinationAfter = destinationBefore + sourceBefore;
        const destinationMinimumAfter = Math.max(destinationMinimumBefore,sourceMinimum);

        await client.query(
          `update public.inventory_stock
           set quantity=$3,minimum_quantity=$4,updated_at=now()
           where item_id=$1 and location_id=$2`,
          [itemId,destinationLocationId,destinationAfter,destinationMinimumAfter]
        );
        await client.query(
          `delete from public.inventory_stock
           where item_id=$1 and location_id=$2`,
          [itemId,sourceLocationId]
        );

        const receiveDefault = await client.query(
          `update public.inventory_receive_defaults
           set location_id=$3,updated_by=$4,updated_at=now()
           where site=$1 and catalog_key=$2 and location_id=$5
           returning site,catalog_key,location_id`,
          [row.source_site,row.catalog_key,destinationLocationId,user.id,sourceLocationId]
        );

        let transaction = null;
        if (sourceBefore > 0) {
          transaction = (await client.query(
            `insert into public.inventory_transactions(
               item_id,source_location_id,destination_location_id,action,amount,note,
               actor_user_id,actor_username,metadata
             ) values(
               $1,$2,$3,'transfer',$4,$5,$6,$7,
               jsonb_build_object(
                 'operation','relocate_storage',
                 'source_before',$8::numeric,'source_after',0::numeric,
                 'destination_before',$9::numeric,'destination_after',$10::numeric,
                 'source_minimum',$11::numeric,'destination_minimum_before',$12::numeric,
                 'destination_minimum_after',$13::numeric
               )
             )
             returning id,created_at`,
            [
              itemId,sourceLocationId,destinationLocationId,sourceBefore,note,
              user.id,user.username,
              sourceBefore,destinationBefore,destinationAfter,
              sourceMinimum,destinationMinimumBefore,destinationMinimumAfter
            ]
          )).rows[0];
        }

        await client.query(
          `insert into public.audit_logs(
             actor_user_id,actor_username,action,entity_type,entity_id,site,
             before_data,after_data,metadata
           ) values(
             $1,$2,'inventory_storage_relocate','inventory_item',$3,$4,
             jsonb_build_object(
               'location_id',$5::uuid,'location_code',$6::text,
               'quantity',$7::numeric,'minimum',$8::numeric
             ),
             jsonb_build_object(
               'location_id',$9::uuid,'location_code',$10::text,
               'quantity',$11::numeric,'minimum',$12::numeric
             ),
             jsonb_build_object(
               'catalog_key',$13::text,
               'receive_default_moved',$14::boolean
             )
           )`,
          [
            user.id,user.username,itemId,row.source_site,
            sourceLocationId,row.source_code,sourceBefore,sourceMinimum,
            destinationLocationId,row.destination_code,destinationAfter,destinationMinimumAfter,
            row.catalog_key,Boolean(receiveDefault.rowCount)
          ]
        );

        return {
          ok:true,
          site:row.source_site,
          item_id:itemId,
          source_location_id:sourceLocationId,
          destination_location_id:destinationLocationId,
          source_before:sourceBefore,
          source_after:0,
          destination_before:destinationBefore,
          destination_after:destinationAfter,
          source_minimum:sourceMinimum,
          destination_minimum_before:destinationMinimumBefore,
          destination_minimum_after:destinationMinimumAfter,
          receive_default_moved:Boolean(receiveDefault.rowCount),
          transaction,
        };
      });
      return data;
    } catch (error) {
      if (error.alreadySent) return;
      return reply.code(error.statusCode || 500).send({ error:error.message || "STORAGE_RELOCATION_FAILED" });
    }
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
        if (!String(sourceItem.item_key || "").startsWith(sourceItem.from_site + ":")) {
          throw Object.assign(new Error("ITEM_SITE_MISMATCH"), { statusCode:400 });
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

        if (destinationItem && !String(destinationItem.item_key || "").startsWith(sourceItem.to_site + ":")) {
          throw Object.assign(new Error("DESTINATION_ITEM_SITE_MISMATCH"), { statusCode:409 });
        }

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

          if (configuredIds.length === 0) {
            throw Object.assign(new Error("DESTINATION_STORAGE_CONFIGURATION_REQUIRED"), { statusCode:409 });
          }

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
            if (!configuredIds.includes(fixedLocationId)) {
              throw Object.assign(new Error("DESTINATION_RECEIVE_DEFAULT_NOT_CONFIGURED"), { statusCode:409 });
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
               'destination_item_id',$8::uuid,
               'source_before',$9::numeric,'source_after',$10::numeric,
               'destination_before',$11::numeric,'destination_after',$12::numeric,
               'from_site',$13::text,'to_site',$14::text
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
