import Fastify from "fastify";
import cookie from "@fastify/cookie";
import crypto from "node:crypto";
import { pool, withTransaction } from "./db.mjs";
import { hashPassword, verifyPassword } from "./password.mjs";
import {
  createSession,
  destroySession,
  hasPermission,
  publicUser,
  requireUser,
  resolveSession,
  siteAllowed,
} from "./auth.mjs";

const app = Fastify({
  logger: true,
  trustProxy: true,
  requestIdHeader: "x-request-id",
  genReqId: () => crypto.randomUUID(),
});

await app.register(cookie);

app.get("/api/health", async () => {
  const db = await pool.query("select now() as now");
  const migration = await pool.query(
    "select version from public.schema_migrations order by version desc limit 1"
  );
  return {
    app: "ok",
    database: db.rowCount === 1 ? "ok" : "error",
    schema: migration.rows[0]?.version || null,
    release: process.env.APP_RELEASE || "dev",
  };
});

app.post("/api/auth/login", async (request, reply) => {
  const username = String(request.body?.username || "").trim().toLowerCase();
  const password = String(request.body?.password || "");

  if (!username || !password) {
    return reply.code(400).send({ error: "USERNAME_PASSWORD_REQUIRED" });
  }

  const { rows } = await pool.query(
    `select id,username,display_name,password_hash,role,location,permissions,
            preferred_language,active
     from public.app_users
     where username=$1
     limit 1`,
    [username]
  );

  const user = rows[0];
  const valid = user?.active && user.password_hash
    ? await verifyPassword(password, user.password_hash)
    : false;

  if (!valid) {
    return reply.code(401).send({ error: "INVALID_CREDENTIALS" });
  }

  await createSession(user.id, reply);
  return { user: publicUser(user) };
});

app.get("/api/auth/me", async (request, reply) => {
  const user = await resolveSession(request);
  if (!user) return reply.code(401).send({ error: "AUTH_REQUIRED" });
  return { user: publicUser(user) };
});

app.post("/api/auth/logout", async (request, reply) => {
  await destroySession(request, reply);
  return { ok: true };
});

app.post("/api/auth/change-password", async (request, reply) => {
  const user = await requireUser(request, reply);
  if (!user) return;

  const current = String(request.body?.currentPassword || "");
  const next = String(request.body?.newPassword || "");
  if (next.length < 10) return reply.code(400).send({ error: "PASSWORD_TOO_SHORT" });

  const { rows } = await pool.query(
    "select password_hash from public.app_users where id=$1",
    [user.id]
  );
  const ok = await verifyPassword(current, rows[0]?.password_hash);
  if (!ok) return reply.code(401).send({ error: "CURRENT_PASSWORD_INVALID" });

  const nextHash = await hashPassword(next);
  await withTransaction(async (client) => {
    await client.query(
      "update public.app_users set password_hash=$1,password_changed_at=now() where id=$2",
      [nextHash, user.id]
    );
    await client.query("delete from public.sessions where user_id=$1", [user.id]);
  });
  reply.clearCookie("kitchen_session", { path: "/" });
  return { ok: true, reloginRequired: true };
});

app.get("/api/inventory/:site", async (request, reply) => {
  const user = await requireUser(request, reply);
  if (!user) return;

  const site = String(request.params.site || "");
  if (!["central", "fuxing", "yongji"].includes(site)) {
    return reply.code(400).send({ error: "INVALID_SITE" });
  }
  if (!siteAllowed(user, site) || !hasPermission(user, "inventory", "view")) {
    return reply.code(403).send({ error: "INVENTORY_VIEW_NOT_ALLOWED" });
  }

  const [locations, items, stock, defaults] = await Promise.all([
    pool.query(
      `select id,code,name_zh_tw,name_vi,site,kind,sort_order,active
       from public.inventory_locations
       where site=$1 and active=true
       order by sort_order,code`,
      [site]
    ),
    pool.query(
      `select id,item_key,catalog_key,name_zh_tw,name_vi,unit,work_area,
              storage_only,active,created_at,updated_at
       from public.inventory_items
       where active=true and item_key like $1
       order by name_zh_tw,item_key`,
      [site + ":%"]
    ),
    pool.query(
      `select s.item_id,s.location_id,s.quantity,s.minimum_quantity,s.updated_at
       from public.inventory_stock s
       join public.inventory_locations l on l.id=s.location_id
       where l.site=$1 and l.active=true`,
      [site]
    ),
    pool.query(
      `select d.site,d.catalog_key,d.location_id,d.updated_at,l.code as location_code
       from public.inventory_receive_defaults d
       join public.inventory_locations l on l.id=d.location_id
       where d.site=$1`,
      [site]
    ),
  ]);

  return {
    site,
    items: items.rows,
    locations: locations.rows,
    stock: stock.rows,
    receiveDefaults: defaults.rows,
  };
});

app.get("/api/inventory/:site/transactions", async (request, reply) => {
  const user = await requireUser(request, reply);
  if (!user) return;

  const site = String(request.params.site || "");
  if (!["central", "fuxing", "yongji"].includes(site)) {
    return reply.code(400).send({ error: "INVALID_SITE" });
  }
  if (!siteAllowed(user, site) || !hasPermission(user, "inventory", "view")) {
    return reply.code(403).send({ error: "INVENTORY_VIEW_NOT_ALLOWED" });
  }

  const limit = Math.min(Math.max(Number(request.query?.limit || 100), 1), 500);
  const { rows } = await pool.query(
    `select distinct
       t.id,t.item_id,t.source_location_id,t.destination_location_id,t.action,
       t.amount,t.note,t.actor_user_id,t.actor_username,t.metadata,t.created_at
     from public.inventory_transactions t
     left join public.inventory_locations s on s.id=t.source_location_id
     left join public.inventory_locations d on d.id=t.destination_location_id
     where s.site=$1 or d.site=$1
     order by t.created_at desc
     limit $2`,
    [site, limit]
  );

  return { site, transactions: rows };
});

app.post("/api/inventory/adjust", async (request, reply) => {
  const user = await requireUser(request, reply);
  if (!user) return;

  const itemId = String(request.body?.itemId || "");
  const locationId = String(request.body?.locationId || "");
  const direction = String(request.body?.direction || "");
  const amount = Number(request.body?.amount);
  const note = String(request.body?.note || "");

  if (!["in", "out"].includes(direction) || !Number.isFinite(amount) || amount <= 0) {
    return reply.code(400).send({ error: "INVALID_ADJUSTMENT" });
  }

  try {
    const result = await withTransaction(async (client) => {
      const ctx = await client.query(
        `select i.id as item_id,i.item_key,l.id as location_id,l.site
         from public.inventory_items i
         join public.inventory_locations l on l.id=$2
         where i.id=$1 and i.active=true and l.active=true
         limit 1`,
        [itemId, locationId]
      );
      const row = ctx.rows[0];
      if (!row) throw Object.assign(new Error("ITEM_LOCATION_NOT_FOUND"), { statusCode: 404 });
      if (!siteAllowed(user, row.site) || !hasPermission(user, "inventory", "edit")) {
        throw Object.assign(new Error("INVENTORY_EDIT_NOT_ALLOWED"), { statusCode: 403 });
      }
      if (!String(row.item_key || "").startsWith(row.site + ":")) {
        throw Object.assign(new Error("ITEM_SITE_MISMATCH"), { statusCode: 400 });
      }

      await client.query(
        `insert into public.inventory_stock(item_id,location_id,quantity,minimum_quantity)
         values($1,$2,0,0)
         on conflict (item_id,location_id) do nothing`,
        [itemId, locationId]
      );

      const locked = await client.query(
        `select quantity,minimum_quantity
         from public.inventory_stock
         where item_id=$1 and location_id=$2
         for update`,
        [itemId, locationId]
      );

      const before = Number(locked.rows[0]?.quantity || 0);
      const after = direction === "in" ? before + amount : before - amount;
      if (after < 0) {
        throw Object.assign(new Error("INSUFFICIENT_STOCK"), { statusCode: 409 });
      }

      await client.query(
        `update public.inventory_stock
         set quantity=$3,updated_at=now()
         where item_id=$1 and location_id=$2`,
        [itemId, locationId, after]
      );

      const tx = await client.query(
        `insert into public.inventory_transactions(
           item_id,source_location_id,destination_location_id,action,amount,note,
           actor_user_id,actor_username,metadata
         ) values(
           $1,$2,$3,$4,$5,$6,$7,$8,
           jsonb_build_object('before_quantity',$9,'after_quantity',$10)
         )
         returning *`,
        [
          itemId,
          direction === "out" ? locationId : null,
          direction === "in" ? locationId : null,
          direction,
          amount,
          note,
          user.id,
          user.username,
          before,
          after,
        ]
      );

      return { before, after, transaction: tx.rows[0] };
    });

    return result;
  } catch (error) {
    return reply.code(error.statusCode || 500).send({ error: error.message || "ADJUST_FAILED" });
  }
});

app.post("/api/inventory/transfer", async (request, reply) => {
  const user = await requireUser(request, reply);
  if (!user) return;

  const itemId = String(request.body?.itemId || "");
  const sourceLocationId = String(request.body?.sourceLocationId || "");
  const destinationLocationId = String(request.body?.destinationLocationId || "");
  const amount = Number(request.body?.amount);
  const note = String(request.body?.note || "");

  if (!itemId || !sourceLocationId || !destinationLocationId ||
      sourceLocationId === destinationLocationId ||
      !Number.isFinite(amount) || amount <= 0) {
    return reply.code(400).send({ error: "INVALID_TRANSFER" });
  }

  try {
    const result = await withTransaction(async (client) => {
      const ctx = await client.query(
        `select i.item_key,
           s.site as source_site,
           d.site as destination_site
         from public.inventory_items i
         join public.inventory_locations s on s.id=$2 and s.active=true
         join public.inventory_locations d on d.id=$3 and d.active=true
         where i.id=$1 and i.active=true
         limit 1`,
        [itemId, sourceLocationId, destinationLocationId]
      );
      const row = ctx.rows[0];
      if (!row) throw Object.assign(new Error("ITEM_LOCATION_NOT_FOUND"), { statusCode: 404 });
      if (row.source_site !== row.destination_site) {
        throw Object.assign(new Error("CROSS_SITE_TRANSFER_REQUIRES_SHIP"), { statusCode: 400 });
      }
      if (!siteAllowed(user, row.source_site) || !hasPermission(user, "inventory", "edit")) {
        throw Object.assign(new Error("INVENTORY_EDIT_NOT_ALLOWED"), { statusCode: 403 });
      }
      if (!String(row.item_key || "").startsWith(row.source_site + ":")) {
        throw Object.assign(new Error("ITEM_SITE_MISMATCH"), { statusCode: 400 });
      }

      for (const locationId of [sourceLocationId, destinationLocationId]) {
        await client.query(
          `insert into public.inventory_stock(item_id,location_id,quantity,minimum_quantity)
           values($1,$2,0,0)
           on conflict (item_id,location_id) do nothing`,
          [itemId, locationId]
        );
      }

      const locked = await client.query(
        `select location_id,quantity
         from public.inventory_stock
         where item_id=$1 and location_id=any($2::uuid[])
         order by location_id
         for update`,
        [itemId, [sourceLocationId, destinationLocationId]]
      );

      const quantities = new Map(locked.rows.map((r) => [r.location_id, Number(r.quantity)]));
      const sourceBefore = quantities.get(sourceLocationId) ?? 0;
      const destinationBefore = quantities.get(destinationLocationId) ?? 0;
      if (sourceBefore < amount) {
        throw Object.assign(new Error("INSUFFICIENT_STOCK"), { statusCode: 409 });
      }

      const sourceAfter = sourceBefore - amount;
      const destinationAfter = destinationBefore + amount;

      await client.query(
        `update public.inventory_stock set quantity=$3,updated_at=now()
         where item_id=$1 and location_id=$2`,
        [itemId, sourceLocationId, sourceAfter]
      );
      await client.query(
        `update public.inventory_stock set quantity=$3,updated_at=now()
         where item_id=$1 and location_id=$2`,
        [itemId, destinationLocationId, destinationAfter]
      );

      const tx = await client.query(
        `insert into public.inventory_transactions(
          item_id,source_location_id,destination_location_id,action,amount,note,
          actor_user_id,actor_username,metadata
        ) values(
          $1,$2,$3,'transfer',$4,$5,$6,$7,
          jsonb_build_object(
            'source_before',$8,'source_after',$9,
            'destination_before',$10,'destination_after',$11
          )
        ) returning *`,
        [
          itemId, sourceLocationId, destinationLocationId, amount, note,
          user.id, user.username,
          sourceBefore, sourceAfter, destinationBefore, destinationAfter,
        ]
      );

      return {
        sourceBefore,
        sourceAfter,
        destinationBefore,
        destinationAfter,
        transaction: tx.rows[0],
      };
    });

    return result;
  } catch (error) {
    return reply.code(error.statusCode || 500).send({ error: error.message || "TRANSFER_FAILED" });
  }
});

app.setErrorHandler((error, request, reply) => {
  request.log.error(error);
  if (reply.sent) return;
  reply.code(error.statusCode || 500).send({ error: "INTERNAL_ERROR" });
});

const port = Number(process.env.PORT || 8080);
await app.listen({ host: "0.0.0.0", port });

async function shutdown(signal) {
  app.log.info({ signal }, "shutting down");
  try { await app.close(); } finally { await pool.end(); }
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
