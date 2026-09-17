import { pool, withTransaction } from "./db.mjs";
import { hasCapability, requireUser, siteAllowed } from "./auth.mjs";
import { activeSite } from "./site-registry.mjs";

const LOCATION_KINDS = new Set(["storage", "work"]);
const CODE_RE = /^[a-z][a-z0-9._-]{1,39}$/;

function text(value) {
  return String(value ?? "").trim();
}

function bool(value, fallback = true) {
  return value === undefined ? fallback : value !== false;
}

function integer(value, fallback = 0) {
  const number = Number(value);
  return Number.isInteger(number) ? number : fallback;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function canManageAll(user) {
  return hasCapability(user, "system.master_data.manage");
}

function canManageLocations(user, site) {
  return siteAllowed(user, site)
    && (canManageAll(user) || hasCapability(user, "inventory.locations.manage"));
}

function canManageWorkAreas(user, site) {
  return siteAllowed(user, site)
    && (canManageAll(user) || hasCapability(user, "operations.work_areas.manage"));
}

async function validateSite(site, reply) {
  if (await activeSite(site)) return true;
  reply.code(400).send({ error: "INVALID_SITE" });
  return false;
}

async function requireSiteRead(user, site, reply) {
  if (!(await validateSite(site, reply))) return false;
  if (siteAllowed(user, site)) return true;
  reply.code(403).send({ error: "SITE_NOT_ALLOWED" });
  return false;
}

async function requireLocationManager(user, site, reply) {
  if (!(await requireSiteRead(user, site, reply))) return false;
  if (canManageLocations(user, site)) return true;
  reply.code(403).send({ error: "LOCATION_MANAGE_NOT_ALLOWED" });
  return false;
}

async function requireWorkAreaManager(user, site, reply) {
  if (!(await requireSiteRead(user, site, reply))) return false;
  if (canManageWorkAreas(user, site)) return true;
  reply.code(403).send({ error: "WORK_AREA_MANAGE_NOT_ALLOWED" });
  return false;
}

async function writeAudit(client, user, {
  action,
  entityType,
  entityId,
  site,
  before = null,
  after = null,
  metadata = {},
}) {
  await client.query(
    `insert into public.audit_logs(
       actor_user_id,actor_username,action,entity_type,entity_id,site,before_data,after_data,metadata
     ) values($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb)`,
    [
      user.id,
      user.username,
      action,
      entityType,
      entityId ? String(entityId) : null,
      site,
      before === null ? null : JSON.stringify(before),
      after === null ? null : JSON.stringify(after),
      JSON.stringify(object(metadata)),
    ]
  );
}

async function siteSnapshot(site, includeInactive) {
  const activeClause = includeInactive ? "" : "and active=true";
  const [siteResult, departments, locations, workAreas] = await Promise.all([
    pool.query(
      `select code,name_vi,name_zh_tw,timezone_name,currency_code,active,sort_order,metadata,created_at,updated_at
       from public.sites where code=$1 limit 1`,
      [site]
    ),
    pool.query(
      `select site_code,code,name_vi,name_zh_tw,active,sort_order,created_at,updated_at
       from public.organization_departments
       where site_code=$1 ${activeClause}
       order by sort_order,code`,
      [site]
    ),
    pool.query(
      `select id,code,name_zh_tw,name_vi,site,kind,sort_order,active,metadata,updated_by_user_id,created_at,updated_at
       from public.inventory_locations
       where site=$1 ${activeClause}
       order by kind,sort_order,code`,
      [site]
    ),
    pool.query(
      `select site_code,code,department_code,name_vi,name_zh_tw,active,sort_order,metadata,
              updated_by_user_id,created_at,updated_at
       from public.work_areas
       where site_code=$1 ${activeClause}
       order by sort_order,code`,
      [site]
    ),
  ]);

  return {
    site: siteResult.rows[0] || null,
    departments: departments.rows,
    locations: locations.rows,
    workAreas: workAreas.rows,
  };
}

async function assertLocationCanChangeKind(client, locationId) {
  const [stock, defaults] = await Promise.all([
    client.query(
      `select count(*)::int as count
       from public.inventory_stock
       where location_id=$1`,
      [locationId]
    ),
    client.query(
      `select count(*)::int as count
       from public.inventory_receive_defaults
       where location_id=$1`,
      [locationId]
    ),
  ]);
  if (Number(stock.rows[0]?.count || 0) > 0 || Number(defaults.rows[0]?.count || 0) > 0) {
    throw Object.assign(new Error("LOCATION_KIND_IN_USE"), { statusCode: 409 });
  }
}

async function assertLocationCanArchive(client, locationId) {
  const [positiveStock, defaults] = await Promise.all([
    client.query(
      `select count(*)::int as count
       from public.inventory_stock
       where location_id=$1 and quantity>0`,
      [locationId]
    ),
    client.query(
      `select count(*)::int as count
       from public.inventory_receive_defaults
       where location_id=$1`,
      [locationId]
    ),
  ]);
  if (Number(positiveStock.rows[0]?.count || 0) > 0) {
    throw Object.assign(new Error("LOCATION_HAS_POSITIVE_STOCK"), { statusCode: 409 });
  }
  if (Number(defaults.rows[0]?.count || 0) > 0) {
    throw Object.assign(new Error("LOCATION_IS_RECEIVE_DEFAULT"), { statusCode: 409 });
  }
}

function validateDisplayNames(nameVi, nameZhTw) {
  if (!nameVi || !nameZhTw) {
    throw Object.assign(new Error("MASTER_DATA_NAME_REQUIRED"), { statusCode: 400 });
  }
}

export async function registerMasterDataRoutes(app) {
  app.get("/api/master-data/:site", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const site = text(request.params?.site);
    if (!(await requireSiteRead(user, site, reply))) return;

    const includeInactiveRequested = ["1", "true", "yes"].includes(text(request.query?.includeInactive).toLowerCase());
    const manageLocations = canManageLocations(user, site);
    const manageWorkAreas = canManageWorkAreas(user, site);
    const includeInactive = includeInactiveRequested && (manageLocations || manageWorkAreas || canManageAll(user));
    const snapshot = await siteSnapshot(site, includeInactive);

    return {
      ...snapshot,
      permissions: {
        manageAll: canManageAll(user),
        manageLocations,
        manageWorkAreas,
      },
    };
  });

  app.post("/api/master-data/locations", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const action = text(request.body?.action || "save");
    const id = text(request.body?.id);
    const site = text(request.body?.site);
    if (!(await requireLocationManager(user, site, reply))) return;

    try {
      const saved = await withTransaction(async (client) => {
        if (action === "archive") {
          if (!id) throw Object.assign(new Error("LOCATION_ID_REQUIRED"), { statusCode: 400 });
          const currentResult = await client.query(
            `select * from public.inventory_locations where id=$1 for update`,
            [id]
          );
          const current = currentResult.rows[0];
          if (!current) throw Object.assign(new Error("LOCATION_NOT_FOUND"), { statusCode: 404 });
          if (current.site !== site) throw Object.assign(new Error("LOCATION_SITE_MISMATCH"), { statusCode: 409 });
          await assertLocationCanArchive(client, id);
          const result = await client.query(
            `update public.inventory_locations
             set active=false,updated_by_user_id=$2,updated_at=now()
             where id=$1
             returning *`,
            [id, user.id]
          );
          await writeAudit(client, user, {
            action: "master_location_archive",
            entityType: "inventory_location",
            entityId: id,
            site,
            before: current,
            after: result.rows[0],
          });
          return result.rows[0];
        }

        if (action !== "save") {
          throw Object.assign(new Error("INVALID_LOCATION_ACTION"), { statusCode: 400 });
        }

        const code = text(request.body?.code);
        const nameVi = text(request.body?.name_vi ?? request.body?.nameVi);
        const nameZhTw = text(request.body?.name_zh_tw ?? request.body?.nameZhTw);
        const kind = text(request.body?.kind || "storage");
        const sortOrder = integer(request.body?.sort_order ?? request.body?.sortOrder, 0);
        const active = bool(request.body?.active, true);
        const metadata = object(request.body?.metadata);
        validateDisplayNames(nameVi, nameZhTw);
        if (!LOCATION_KINDS.has(kind)) {
          throw Object.assign(new Error("INVALID_LOCATION_KIND"), { statusCode: 400 });
        }

        if (!id) {
          if (!CODE_RE.test(code) || !code.startsWith(`${site}-`)) {
            throw Object.assign(new Error("INVALID_LOCATION_CODE"), { statusCode: 400 });
          }
          const result = await client.query(
            `insert into public.inventory_locations(
               code,name_zh_tw,name_vi,site,kind,sort_order,active,metadata,updated_by_user_id
             ) values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
             returning *`,
            [code, nameZhTw, nameVi, site, kind, sortOrder, active, JSON.stringify(metadata), user.id]
          );
          await writeAudit(client, user, {
            action: "master_location_create",
            entityType: "inventory_location",
            entityId: result.rows[0].id,
            site,
            after: result.rows[0],
          });
          return result.rows[0];
        }

        const currentResult = await client.query(
          `select * from public.inventory_locations where id=$1 for update`,
          [id]
        );
        const current = currentResult.rows[0];
        if (!current) throw Object.assign(new Error("LOCATION_NOT_FOUND"), { statusCode: 404 });
        if (current.site !== site) throw Object.assign(new Error("LOCATION_SITE_MISMATCH"), { statusCode: 409 });
        if (code && code !== current.code) {
          throw Object.assign(new Error("LOCATION_CODE_IMMUTABLE"), { statusCode: 409 });
        }
        if (kind !== current.kind) await assertLocationCanChangeKind(client, id);
        if (!active && current.active) await assertLocationCanArchive(client, id);

        const result = await client.query(
          `update public.inventory_locations
           set name_zh_tw=$2,name_vi=$3,kind=$4,sort_order=$5,active=$6,
               metadata=$7::jsonb,updated_by_user_id=$8,updated_at=now()
           where id=$1
           returning *`,
          [id, nameZhTw, nameVi, kind, sortOrder, active, JSON.stringify(metadata), user.id]
        );
        await writeAudit(client, user, {
          action: "master_location_update",
          entityType: "inventory_location",
          entityId: id,
          site,
          before: current,
          after: result.rows[0],
        });
        return result.rows[0];
      });
      return { ok: true, location: saved };
    } catch (error) {
      if (error?.code === "23505") return reply.code(409).send({ error: "LOCATION_CODE_EXISTS" });
      if (error?.code === "23503") return reply.code(409).send({ error: "LOCATION_REFERENCE_CONFLICT" });
      return reply.code(error.statusCode || 500).send({ error: error.message || "LOCATION_SAVE_FAILED" });
    }
  });

  app.post("/api/master-data/work-areas", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const action = text(request.body?.action || "save");
    const site = text(request.body?.site);
    const code = text(request.body?.code);
    if (!(await requireWorkAreaManager(user, site, reply))) return;

    try {
      const saved = await withTransaction(async (client) => {
        if (!CODE_RE.test(code)) {
          throw Object.assign(new Error("INVALID_WORK_AREA_CODE"), { statusCode: 400 });
        }

        const currentResult = await client.query(
          `select * from public.work_areas where site_code=$1 and code=$2 for update`,
          [site, code]
        );
        const current = currentResult.rows[0] || null;

        if (action === "archive") {
          if (!current) throw Object.assign(new Error("WORK_AREA_NOT_FOUND"), { statusCode: 404 });
          const result = await client.query(
            `update public.work_areas
             set active=false,updated_by_user_id=$3,updated_at=now()
             where site_code=$1 and code=$2
             returning *`,
            [site, code, user.id]
          );
          await writeAudit(client, user, {
            action: "master_work_area_archive",
            entityType: "work_area",
            entityId: `${site}:${code}`,
            site,
            before: current,
            after: result.rows[0],
          });
          return result.rows[0];
        }

        if (action !== "save") {
          throw Object.assign(new Error("INVALID_WORK_AREA_ACTION"), { statusCode: 400 });
        }

        const nameVi = text(request.body?.name_vi ?? request.body?.nameVi);
        const nameZhTw = text(request.body?.name_zh_tw ?? request.body?.nameZhTw);
        const departmentCode = text(request.body?.department_code ?? request.body?.departmentCode) || null;
        const sortOrder = integer(request.body?.sort_order ?? request.body?.sortOrder, 0);
        const active = bool(request.body?.active, true);
        const metadata = object(request.body?.metadata);
        validateDisplayNames(nameVi, nameZhTw);

        if (departmentCode) {
          const department = await client.query(
            `select 1 from public.organization_departments
             where site_code=$1 and code=$2 and active=true`,
            [site, departmentCode]
          );
          if (!department.rowCount) {
            throw Object.assign(new Error("WORK_AREA_DEPARTMENT_NOT_FOUND"), { statusCode: 409 });
          }
        }

        if (!current) {
          const result = await client.query(
            `insert into public.work_areas(
               site_code,code,department_code,name_vi,name_zh_tw,active,sort_order,metadata,updated_by_user_id
             ) values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
             returning *`,
            [site, code, departmentCode, nameVi, nameZhTw, active, sortOrder, JSON.stringify(metadata), user.id]
          );
          await writeAudit(client, user, {
            action: "master_work_area_create",
            entityType: "work_area",
            entityId: `${site}:${code}`,
            site,
            after: result.rows[0],
          });
          return result.rows[0];
        }

        const result = await client.query(
          `update public.work_areas
           set department_code=$3,name_vi=$4,name_zh_tw=$5,active=$6,sort_order=$7,
               metadata=$8::jsonb,updated_by_user_id=$9,updated_at=now()
           where site_code=$1 and code=$2
           returning *`,
          [site, code, departmentCode, nameVi, nameZhTw, active, sortOrder, JSON.stringify(metadata), user.id]
        );
        await writeAudit(client, user, {
          action: "master_work_area_update",
          entityType: "work_area",
          entityId: `${site}:${code}`,
          site,
          before: current,
          after: result.rows[0],
        });
        return result.rows[0];
      });
      return { ok: true, workArea: saved };
    } catch (error) {
      if (error?.code === "23503") return reply.code(409).send({ error: "WORK_AREA_REFERENCE_CONFLICT" });
      return reply.code(error.statusCode || 500).send({ error: error.message || "WORK_AREA_SAVE_FAILED" });
    }
  });

  app.get("/api/admin/overview", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    if (!canManageAll(user)) return reply.code(403).send({ error: "ADMIN_REQUIRED" });

    const [migration, counts, backup] = await Promise.all([
      pool.query(`select version,filename,applied_at from public.schema_migrations order by version desc limit 1`),
      pool.query(`
        select
          (select count(*)::int from public.app_users where active=true) as active_users,
          (select count(*)::int from public.sites where active=true) as active_sites,
          (select count(*)::int from public.inventory_locations where active=true) as active_locations,
          (select count(*)::int from public.work_areas where active=true) as active_work_areas,
          (select count(*)::int from public.inventory_items where active=true) as active_inventory_items,
          (select count(*)::int from public.inventory_transactions) as inventory_transactions
      `),
      pool.query(`
        select backup_key,status,database_name,schema_version,size_bytes,checksum_sha256,storage_location,
               started_at,completed_at,metadata
        from public.backup_history
        order by started_at desc
        limit 1
      `),
    ]);

    return {
      release: process.env.APP_RELEASE || "dev",
      schema: migration.rows[0] || null,
      counts: counts.rows[0] || {},
      latestBackup: backup.rows[0] || null,
    };
  });
}
