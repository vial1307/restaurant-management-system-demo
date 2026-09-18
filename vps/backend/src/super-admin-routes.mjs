import { pool, withTransaction } from "./db.mjs";
import { hasCapability, requireUser } from "./auth.mjs";

const CODE_RE = /^[a-z][a-z0-9._-]{1,39}$/;
const DATASETS = {
  announcements: {
    table:"public.system_announcements",
    id:"id",
    columns:["id","site_code","title_vi","title_zh_tw","body_vi","body_zh_tw","status","starts_at","ends_at","created_at","updated_at"],
    editable:["site_code","title_vi","title_zh_tw","body_vi","body_zh_tw","status","starts_at","ends_at"],
    searchable:["title_vi","title_zh_tw","body_vi","body_zh_tw","status"],
    sortable:["created_at","updated_at","status","title_vi","title_zh_tw","site_code"],
    defaultSort:"updated_at",
    siteColumn:"site_code",
    archive:{ column:"status", value:"archived" },
  },
  media: {
    table:"public.media_assets",
    id:"id",
    columns:["id","site_code","asset_type","label","asset_url","alt_vi","alt_zh_tw","entity_type","entity_id","active","metadata","created_at","updated_at"],
    editable:["site_code","asset_type","label","asset_url","alt_vi","alt_zh_tw","entity_type","entity_id","active","metadata"],
    searchable:["label","asset_url","alt_vi","alt_zh_tw","entity_type","entity_id"],
    sortable:["created_at","updated_at","label","asset_type","site_code","active"],
    defaultSort:"updated_at",
    siteColumn:"site_code",
    archive:{ column:"active", value:false },
  },
  "menu-items": {
    table:"public.menu_items",
    id:"id",
    columns:["id","site_code","item_code","name_vi","name_zh_tw","category","work_area","price","currency_code","active","metadata","created_at","updated_at"],
    editable:["site_code","item_code","name_vi","name_zh_tw","category","work_area","price","currency_code","active","metadata"],
    searchable:["item_code","name_vi","name_zh_tw","category","work_area"],
    sortable:["updated_at","item_code","name_vi","name_zh_tw","site_code","price","active"],
    defaultSort:"updated_at",
    siteColumn:"site_code",
    archive:{ column:"active", value:false },
  },
  "inventory-products": {
    table:"public.inventory_items",
    id:"id",
    columns:["id","item_key","catalog_key","name_vi","name_zh_tw","unit","work_area","storage_only","active","created_at","updated_at"],
    editable:["item_key","catalog_key","name_vi","name_zh_tw","unit","work_area","storage_only","active"],
    searchable:["item_key","catalog_key","name_vi","name_zh_tw","unit","work_area"],
    sortable:["updated_at","item_key","catalog_key","name_vi","name_zh_tw","active"],
    defaultSort:"updated_at",
    siteExpression:"split_part(item_key,':',1)",
    archive:{ column:"active", value:false },
  },
  "sop-documents": {
    table:"public.sop_documents",
    id:"id",
    columns:["id","site_code","sop_code","menu_item_id","work_area","name_vi","name_zh_tw","active","created_at","updated_at"],
    editable:["site_code","sop_code","menu_item_id","work_area","name_vi","name_zh_tw","active"],
    searchable:["sop_code","name_vi","name_zh_tw","work_area"],
    sortable:["updated_at","sop_code","name_vi","name_zh_tw","site_code","active"],
    defaultSort:"updated_at",
    siteColumn:"site_code",
    archive:{ column:"active", value:false },
  },
};

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function integer(value, fallback = 0) {
  const n = Number(value);
  return Number.isInteger(n) ? n : fallback;
}

function requireSuperAdmin(user, reply) {
  if (hasCapability(user, "system.super_admin")) return true;
  reply.code(403).send({ error:"SUPER_ADMIN_REQUIRED" });
  return false;
}

async function superUser(request, reply) {
  const user = await requireUser(request, reply);
  if (!user || !requireSuperAdmin(user, reply)) return null;
  return user;
}

async function audit(client, user, { action, entityType, entityId = null, site = null, before = null, after = null, metadata = {} }) {
  await client.query(
    `insert into public.audit_logs(
       actor_user_id,actor_username,action,entity_type,entity_id,site,before_data,after_data,metadata
     ) values($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb)`,
    [
      user.id,user.username,action,entityType,entityId ? String(entityId) : null,site || null,
      before === null ? null : JSON.stringify(before),
      after === null ? null : JSON.stringify(after),
      JSON.stringify(object(metadata)),
    ]
  );
}

function pageArgs(query) {
  const page = Math.max(1, integer(query?.page, 1));
  const pageSize = Math.min(100, Math.max(10, integer(query?.pageSize, 25)));
  return { page, pageSize, offset:(page - 1) * pageSize };
}

function normalizeValue(column, value) {
  if (value === "" && ["site_code","menu_item_id","work_area","category","entity_type","entity_id","starts_at","ends_at","price"].includes(column)) return null;
  if (column === "metadata") return object(value);
  if (["active","storage_only"].includes(column)) return value !== false && value !== "false";
  return value;
}

async function listDataset(name, query) {
  const config = DATASETS[name];
  if (!config) throw Object.assign(new Error("ADMIN_DATASET_NOT_FOUND"), { statusCode:404 });
  const { page, pageSize, offset } = pageArgs(query);
  const q = text(query?.q);
  const site = text(query?.site);
  const status = text(query?.status);
  const sort = config.sortable.includes(text(query?.sort)) ? text(query.sort) : config.defaultSort;
  const direction = text(query?.direction).toLowerCase() === "asc" ? "asc" : "desc";
  const where = [];
  const values = [];
  if (q) {
    values.push(`%${q}%`);
    const p = `$${values.length}`;
    where.push(`(${config.searchable.map((column) => `coalesce(${column}::text,'') ilike ${p}`).join(" or ")})`);
  }
  if (site && (config.siteColumn || config.siteExpression)) {
    values.push(site);
    where.push(`${config.siteColumn || config.siteExpression}=$${values.length}`);
  }
  if (status) {
    if (config.columns.includes("status")) {
      values.push(status);
      where.push(`status=$${values.length}`);
    } else if (config.columns.includes("active") && ["active","inactive"].includes(status)) {
      values.push(status === "active");
      where.push(`active=$${values.length}`);
    }
  }
  values.push(pageSize, offset);
  const rows = await pool.query(
    `select ${config.columns.join(",")},count(*) over()::int as __total
     from ${config.table}
     ${where.length ? `where ${where.join(" and ")}` : ""}
     order by ${sort} ${direction},${config.id} asc
     limit $${values.length - 1} offset $${values.length}`,
    values
  );
  const total = Number(rows.rows[0]?.__total || 0);
  return {
    dataset:name,
    columns:config.columns,
    editable:config.editable,
    rows:rows.rows.map(({ __total, ...row }) => row),
    pagination:{ page,pageSize,total,pages:Math.max(1,Math.ceil(total / pageSize)) },
    sort:{ key:sort,direction },
  };
}

async function saveDatasetRow(user, name, body) {
  const config = DATASETS[name];
  if (!config) throw Object.assign(new Error("ADMIN_DATASET_NOT_FOUND"), { statusCode:404 });
  const action = text(body?.action || "save");
  const id = text(body?.id);
  return withTransaction(async (client) => {
    if (action === "archive") {
      if (!id || !config.archive) throw Object.assign(new Error("ADMIN_ARCHIVE_NOT_ALLOWED"), { statusCode:400 });
      const current = (await client.query(`select * from ${config.table} where ${config.id}=$1 for update`, [id])).rows[0];
      if (!current) throw Object.assign(new Error("ADMIN_ROW_NOT_FOUND"), { statusCode:404 });
      const saved = (await client.query(
        `update ${config.table} set ${config.archive.column}=$2${config.columns.includes("updated_at") ? ",updated_at=now()" : ""} where ${config.id}=$1 returning *`,
        [id,config.archive.value]
      )).rows[0];
      await audit(client,user,{ action:`super_admin_${name}_archive`,entityType:name,entityId:id,site:saved.site_code || null,before:current,after:saved });
      return saved;
    }
    if (action !== "save") throw Object.assign(new Error("INVALID_ADMIN_DATA_ACTION"), { statusCode:400 });
    const raw = object(body?.values);
    const entries = config.editable
      .filter((column) => Object.prototype.hasOwnProperty.call(raw,column))
      .map((column) => [column,normalizeValue(column,raw[column])]);
    if (!entries.length) throw Object.assign(new Error("ADMIN_VALUES_REQUIRED"), { statusCode:400 });

    if (id) {
      const current = (await client.query(`select * from ${config.table} where ${config.id}=$1 for update`, [id])).rows[0];
      if (!current) throw Object.assign(new Error("ADMIN_ROW_NOT_FOUND"), { statusCode:404 });
      const values = [id,...entries.map(([,value]) => value)];
      const setSql = entries.map(([column],index) => `${column}=$${index + 2}`).join(",");
      const saved = (await client.query(
        `update ${config.table} set ${setSql}${config.columns.includes("updated_at") ? ",updated_at=now()" : ""} where ${config.id}=$1 returning *`,
        values
      )).rows[0];
      await audit(client,user,{ action:`super_admin_${name}_update`,entityType:name,entityId:id,site:saved.site_code || null,before:current,after:saved });
      return saved;
    }

    const columns = entries.map(([column]) => column);
    const values = entries.map(([,value]) => value);
    const placeholders = values.map((_,index) => `$${index + 1}`).join(",");
    const saved = (await client.query(
      `insert into ${config.table}(${columns.join(",")}) values(${placeholders}) returning *`,
      values
    )).rows[0];
    await audit(client,user,{ action:`super_admin_${name}_create`,entityType:name,entityId:saved[config.id],site:saved.site_code || null,after:saved });
    return saved;
  });
}

function auditFilters(query) {
  const values = [];
  const where = [];
  const q = text(query?.q);
  const site = text(query?.site);
  const action = text(query?.action);
  const actor = text(query?.actor);
  if (q) {
    values.push(`%${q}%`);
    const p = `$${values.length}`;
    where.push(`(coalesce(actor_username,'') ilike ${p} or action ilike ${p} or entity_type ilike ${p} or coalesce(entity_id,'') ilike ${p})`);
  }
  if (site) { values.push(site); where.push(`site=$${values.length}`); }
  if (action) { values.push(action); where.push(`action=$${values.length}`); }
  if (actor) { values.push(`%${actor}%`); where.push(`coalesce(actor_username,'') ilike $${values.length}`); }
  return { values, where };
}

async function auditRows(query, { limitOverride = null } = {}) {
  const { page, pageSize, offset } = pageArgs(query);
  const filters = auditFilters(query);
  const limit = limitOverride ?? pageSize;
  const values = [...filters.values,limit,limitOverride === null ? offset : 0];
  const result = await pool.query(
    `select id,actor_user_id,actor_username,action,entity_type,entity_id,site,before_data,after_data,metadata,created_at,
            count(*) over()::int as __total
     from public.audit_logs
     ${filters.where.length ? `where ${filters.where.join(" and ")}` : ""}
     order by created_at desc,id desc
     limit $${values.length - 1} offset $${values.length}`,
    values
  );
  const total = Number(result.rows[0]?.__total || 0);
  return {
    rows:result.rows.map(({ __total, ...row }) => row),
    pagination:{ page,pageSize:limit,total,pages:Math.max(1,Math.ceil(total / limit)) },
  };
}

function tab(value) {
  return String(value ?? "").replace(/[\t\r\n]+/g," ").trim();
}

function excelBuffer(rows) {
  const header = ["Time","User","Action","Entity","Entity ID","Site","Metadata"];
  const lines = [header.join("\t"),...rows.map((row) => [
    row.created_at,row.actor_username,row.action,row.entity_type,row.entity_id,row.site,JSON.stringify(row.metadata || {}),
  ].map(tab).join("\t"))];
  return Buffer.from(`\ufeff${lines.join("\r\n")}`,"utf8");
}

function pdfAscii(value) {
  return String(value ?? "").replace(/[^\x20-\x7E]/g,"?").replace(/([\\()])/g,"\\$1");
}

function pdfBuffer(rows) {
  const lines = ["Kitchen OS - Audit Log Report",`Generated: ${new Date().toISOString()}`,"",...rows.map((row) =>
    `${row.created_at} | ${row.actor_username || "-"} | ${row.action} | ${row.entity_type}:${row.entity_id || "-"} | ${row.site || "-"}`
  )];
  const pages = [];
  for (let i=0;i<lines.length;i+=48) pages.push(lines.slice(i,i+48));
  const objects = new Map();
  const pageIds = pages.map((_,index) => 4 + index * 2);
  objects.set(1,"<< /Type /Catalog /Pages 2 0 R >>");
  objects.set(2,`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
  objects.set(3,"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  pages.forEach((pageLines,index) => {
    const pageId = pageIds[index];
    const contentId = pageId + 1;
    const stream = `BT\n/F1 9 Tf\n40 800 Td\n12 TL\n${pageLines.map((line) => `(${pdfAscii(line).slice(0,130)}) Tj\nT*`).join("\n")}\nET`;
    objects.set(pageId,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects.set(contentId,`<< /Length ${Buffer.byteLength(stream,"ascii")} >>\nstream\n${stream}\nendstream`);
  });
  const maxId = Math.max(...objects.keys());
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let id=1;id<=maxId;id+=1) {
    offsets[id] = Buffer.byteLength(pdf,"ascii");
    pdf += `${id} 0 obj\n${objects.get(id) || "<<>>"}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf,"ascii");
  pdf += `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
  for (let id=1;id<=maxId;id+=1) pdf += `${String(offsets[id]).padStart(10,"0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf,"ascii");
}

async function inventoryCatalogAudit() {
  const siteResult = await pool.query(
    \`select code,name_vi,name_zh_tw,metadata
     from public.sites
     where active=true
       and coalesce(metadata->>'inventory_mode','') in ('central','branch')
     order by sort_order,code\`
  );
  const sites = siteResult.rows;
  const siteCodes = sites.map((site) => site.code);
  if (!siteCodes.length) {
    return {
      generatedAt:new Date().toISOString(),
      sites:[],
      summary:{ activeItems:0,catalogKeys:0,partialCoverage:0,metadataVariants:0,duplicatesWithinSite:0,multiLocationMissingReceiveDefault:0,unconfiguredStorage:0 },
      coverage:[],
      metadataVariants:[],
      duplicatesWithinSite:[],
      multiLocationMissingReceiveDefault:[],
      unconfiguredStorage:[],
    };
  }

  const itemResult = await pool.query(
    \`select
       i.id,i.item_key,split_part(i.item_key,':',1) as site,i.catalog_key,
       i.name_vi,i.name_zh_tw,i.unit,i.work_area,i.storage_only,i.updated_at,
       count(distinct l.id) filter (where l.active=true and l.kind='storage')::int as storage_location_count,
       coalesce(
         jsonb_agg(distinct jsonb_build_object(
           'id',l.id,'code',l.code,'name_vi',l.name_vi,'name_zh_tw',l.name_zh_tw,'sort_order',l.sort_order
         )) filter (where l.id is not null and l.active=true and l.kind='storage'),
         '[]'::jsonb
       ) as storage_locations,
       d.location_id as receive_default_location_id,
       dl.code as receive_default_location_code,
       dl.name_vi as receive_default_name_vi,
       dl.name_zh_tw as receive_default_name_zh_tw
     from public.inventory_items i
     left join public.inventory_stock s on s.item_id=i.id
     left join public.inventory_locations l on l.id=s.location_id
     left join public.inventory_receive_defaults d
       on d.site=split_part(i.item_key,':',1) and d.catalog_key=i.catalog_key
     left join public.inventory_locations dl on dl.id=d.location_id
     where i.active=true
       and split_part(i.item_key,':',1)=any($1::text[])
     group by
       i.id,i.item_key,i.catalog_key,i.name_vi,i.name_zh_tw,i.unit,i.work_area,i.storage_only,i.updated_at,
       d.location_id,dl.code,dl.name_vi,dl.name_zh_tw
     order by i.catalog_key,site,i.item_key\`,
    [siteCodes]
  );

  const items = itemResult.rows;
  const byCatalog = new Map();
  for (const item of items) {
    const key = text(item.catalog_key);
    if (!key) continue;
    const rows = byCatalog.get(key) || [];
    rows.push(item);
    byCatalog.set(key, rows);
  }

  const coverage = [];
  const metadataVariants = [];
  for (const [catalogKey, rows] of byCatalog) {
    const presentSites = [...new Set(rows.map((row) => row.site))].sort();
    const missingSites = siteCodes.filter((site) => !presentSites.includes(site));
    const variants = {
      name_vi:[...new Set(rows.map((row) => text(row.name_vi)).filter(Boolean))],
      name_zh_tw:[...new Set(rows.map((row) => text(row.name_zh_tw)).filter(Boolean))],
      unit:[...new Set(rows.map((row) => text(row.unit)).filter(Boolean))],
      work_area:[...new Set(rows.map((row) => text(row.work_area)).filter(Boolean))],
      storage_only:[...new Set(rows.map((row) => Boolean(row.storage_only)))],
    };
    const hasVariance = Object.values(variants).some((values) => values.length > 1);
    const detail = {
      catalogKey,
      presentSites,
      missingSites,
      variants,
      items:rows.map((row) => ({
        id:row.id,itemKey:row.item_key,site:row.site,nameVi:row.name_vi,nameZhTw:row.name_zh_tw,
        unit:row.unit,workArea:row.work_area,storageOnly:row.storage_only,
        storageLocationCount:Number(row.storage_location_count || 0),
        storageLocations:row.storage_locations || [],
        receiveDefaultLocationCode:row.receive_default_location_code || "",
      })),
    };
    if (missingSites.length) coverage.push(detail);
    if (hasVariance) metadataVariants.push(detail);
  }

  const duplicateMap = new Map();
  for (const item of items) {
    const key = \`\${item.site}|\${item.catalog_key}\`;
    const rows = duplicateMap.get(key) || [];
    rows.push(item);
    duplicateMap.set(key, rows);
  }
  const duplicatesWithinSite = [...duplicateMap.entries()]
    .filter(([,rows]) => rows.length > 1)
    .map(([key,rows]) => ({
      site:key.split("|")[0],
      catalogKey:key.slice(key.indexOf("|") + 1),
      items:rows.map((row) => ({ id:row.id,itemKey:row.item_key,nameVi:row.name_vi,nameZhTw:row.name_zh_tw,unit:row.unit })),
    }));

  const branchSites = new Set(sites.filter((site) => site.metadata?.inventory_mode === "branch").map((site) => site.code));
  const multiLocationMissingReceiveDefault = items
    .filter((item) =>
      branchSites.has(item.site)
      && Number(item.storage_location_count || 0) > 1
      && !item.receive_default_location_id
    )
    .map((item) => ({
      id:item.id,itemKey:item.item_key,site:item.site,catalogKey:item.catalog_key,
      nameVi:item.name_vi,nameZhTw:item.name_zh_tw,unit:item.unit,
      storageLocations:item.storage_locations || [],
    }));

  const unconfiguredStorage = items
    .filter((item) => Number(item.storage_location_count || 0) === 0)
    .map((item) => ({
      id:item.id,itemKey:item.item_key,site:item.site,catalogKey:item.catalog_key,
      nameVi:item.name_vi,nameZhTw:item.name_zh_tw,unit:item.unit,workArea:item.work_area,
    }));

  return {
    generatedAt:new Date().toISOString(),
    sites,
    summary:{
      activeItems:items.length,
      catalogKeys:byCatalog.size,
      partialCoverage:coverage.length,
      metadataVariants:metadataVariants.length,
      duplicatesWithinSite:duplicatesWithinSite.length,
      multiLocationMissingReceiveDefault:multiLocationMissingReceiveDefault.length,
      unconfiguredStorage:unconfiguredStorage.length,
    },
    coverage:coverage.slice(0,250),
    metadataVariants:metadataVariants.slice(0,250),
    duplicatesWithinSite:duplicatesWithinSite.slice(0,250),
    multiLocationMissingReceiveDefault:multiLocationMissingReceiveDefault.slice(0,250),
    unconfiguredStorage:unconfiguredStorage.slice(0,250),
  };
}

export async function registerSuperAdminRoutes(app) {
  app.get("/api/admin/super/overview", async (request, reply) => {
    const user = await superUser(request, reply); if (!user) return;
    const [migration, backup, database, counts] = await Promise.all([
      pool.query("select version,filename,applied_at from public.schema_migrations order by version desc limit 1"),
      pool.query("select * from public.backup_history order by started_at desc limit 1"),
      pool.query(`select current_database() as database_name,current_setting('server_version') as server_version,
                         pg_database_size(current_database())::bigint as size_bytes,
                         (select count(*)::int from pg_stat_activity where datname=current_database()) as connections`),
      pool.query(`select
        (select count(*)::int from public.app_users) as users,
        (select count(*)::int from public.app_users where active=true) as active_users,
        (select count(*)::int from public.sites) as sites,
        (select count(*)::int from public.sites where active=true) as active_sites,
        (select count(*)::int from public.inventory_items where active=true) as products,
        (select count(*)::int from public.sop_documents where active=true) as sops,
        (select count(*)::int from public.sop_versions where status='draft') as pending_sops,
        (select count(*)::int from public.system_announcements where status='published') as announcements,
        (select count(*)::int from public.audit_logs) as audit_logs
      `),
    ]);
    const memory = process.memoryUsage();
    return {
      release:process.env.APP_RELEASE || "dev",
      api:{ uptime_seconds:Math.floor(process.uptime()),node_version:process.version,pid:process.pid,memory_rss_bytes:memory.rss,memory_heap_used_bytes:memory.heapUsed,memory_heap_total_bytes:memory.heapTotal },
      database:database.rows[0] || null,
      schema:migration.rows[0] || null,
      latestBackup:backup.rows[0] || null,
      counts:counts.rows[0] || {},
    };
  });

  app.get("/api/admin/super/inventory-catalog-audit", async (request, reply) => {
    const user = await superUser(request, reply); if (!user) return;
    try { return await inventoryCatalogAudit(); }
    catch (error) { return reply.code(500).send({ error:error.message || "INVENTORY_CATALOG_AUDIT_FAILED" }); }
  });

  app.get("/api/admin/super/sites", async (request, reply) => {
    const user = await superUser(request, reply); if (!user) return;
    const { rows } = await pool.query(`select code,name_vi,name_zh_tw,timezone_name,currency_code,active,sort_order,metadata,created_at,updated_at from public.sites order by sort_order,code`);
    return { sites:rows };
  });

  app.post("/api/admin/super/sites", async (request, reply) => {
    const user = await superUser(request, reply); if (!user) return;
    const body = object(request.body);
    const code = text(body.code);
    if (!CODE_RE.test(code)) return reply.code(400).send({ error:"INVALID_SITE_CODE" });
    const nameVi = text(body.name_vi); const nameZh = text(body.name_zh_tw);
    const timezone = text(body.timezone_name || "Asia/Taipei"); const currency = text(body.currency_code || "TWD").toUpperCase();
    if (!nameVi || !nameZh || !/^[A-Z]{3}$/.test(currency)) return reply.code(400).send({ error:"INVALID_SITE_DATA" });
    try {
      const saved = await withTransaction(async (client) => {
        const current = (await client.query("select * from public.sites where code=$1 for update",[code])).rows[0] || null;
        const params = [code,nameVi,nameZh,timezone,currency,body.active !== false,integer(body.sort_order,0),JSON.stringify(object(body.metadata))];
        const row = (await client.query(`insert into public.sites(code,name_vi,name_zh_tw,timezone_name,currency_code,active,sort_order,metadata)
          values($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
          on conflict(code) do update set name_vi=excluded.name_vi,name_zh_tw=excluded.name_zh_tw,timezone_name=excluded.timezone_name,
            currency_code=excluded.currency_code,active=excluded.active,sort_order=excluded.sort_order,metadata=excluded.metadata,updated_at=now()
          returning *`,params)).rows[0];
        await audit(client,user,{ action:current?"super_admin_site_update":"super_admin_site_create",entityType:"site",entityId:code,site:code,before:current,after:row });
        return row;
      });
      return { ok:true,site:saved };
    } catch (error) {
      return reply.code(error?.code === "23505" ? 409 : 500).send({ error:error.message || "SITE_SAVE_FAILED" });
    }
  });

  app.post("/api/admin/super/menu-sync", async (request, reply) => {
    const user = await superUser(request, reply); if (!user) return;
    const source = text(request.body?.source); const destination = text(request.body?.destination);
    const overwritePrices = request.body?.overwritePrices === true;
    if (!source || !destination || source === destination) return reply.code(400).send({ error:"INVALID_MENU_SYNC" });
    try {
      const count = await withTransaction(async (client) => {
        const valid = await client.query("select code from public.sites where code=any($1::text[])",[[source,destination]]);
        if (valid.rowCount !== 2) throw Object.assign(new Error("SITE_NOT_FOUND"),{statusCode:404});
        const result = await client.query(`insert into public.menu_items(site_code,item_code,name_vi,name_zh_tw,category,work_area,price,currency_code,active,metadata)
          select $2,item_code,name_vi,name_zh_tw,category,work_area,price,currency_code,active,metadata || jsonb_build_object('synced_from',$1::text)
          from public.menu_items where site_code=$1
          on conflict(site_code,item_code) do update set
            name_vi=excluded.name_vi,name_zh_tw=excluded.name_zh_tw,category=excluded.category,work_area=excluded.work_area,
            price=case when $3::boolean then excluded.price else public.menu_items.price end,
            currency_code=case when $3::boolean then excluded.currency_code else public.menu_items.currency_code end,
            active=excluded.active,metadata=public.menu_items.metadata || jsonb_build_object('last_synced_from',$1::text),updated_at=now()
          returning id`,[source,destination,overwritePrices]);
        await audit(client,user,{ action:"super_admin_menu_sync",entityType:"menu",entityId:`${source}->${destination}`,site:destination,metadata:{source,destination,overwritePrices,count:result.rowCount} });
        return result.rowCount;
      });
      return { ok:true,count };
    } catch (error) {
      return reply.code(error.statusCode || 500).send({ error:error.message || "MENU_SYNC_FAILED" });
    }
  });

  app.get("/api/admin/super/settings", async (request, reply) => {
    const user = await superUser(request, reply); if (!user) return;
    const { rows } = await pool.query("select setting_key,value,version,updated_by_user_id,updated_at from public.system_settings order by setting_key");
    return { settings:rows };
  });

  app.post("/api/admin/super/settings", async (request, reply) => {
    const user = await superUser(request, reply); if (!user) return;
    const key = text(request.body?.setting_key); const value = request.body?.value;
    if (!/^[a-z][a-z0-9._-]{1,95}$/.test(key)) return reply.code(400).send({ error:"INVALID_SETTING_KEY" });
    const saved = await withTransaction(async (client) => {
      const current = (await client.query("select * from public.system_settings where setting_key=$1 for update",[key])).rows[0] || null;
      const result = (await client.query(`insert into public.system_settings(setting_key,value,version,updated_by_user_id,updated_at)
        values($1,$2::jsonb,1,$3,now())
        on conflict(setting_key) do update set value=excluded.value,version=public.system_settings.version+1,updated_by_user_id=excluded.updated_by_user_id,updated_at=now()
        returning *`,[key,JSON.stringify(value),user.id])).rows[0];
      await audit(client,user,{ action:"super_admin_setting_save",entityType:"system_setting",entityId:key,before:current,after:result });
      return result;
    });
    return { ok:true,setting:saved };
  });

  app.get("/api/admin/super/content", async (request, reply) => {
    const user = await superUser(request, reply); if (!user) return;
    const [announcements,pending,media,counts] = await Promise.all([
      pool.query("select id,site_code,title_vi,title_zh_tw,status,starts_at,ends_at,updated_at from public.system_announcements order by updated_at desc limit 8"),
      pool.query(`select v.id as version_id,v.version_no,v.status,v.created_at,d.id as document_id,d.site_code,d.sop_code,d.name_vi,d.name_zh_tw
                  from public.sop_versions v join public.sop_documents d on d.id=v.document_id
                  where v.status='draft' and d.active=true order by v.created_at desc limit 12`),
      pool.query("select id,site_code,asset_type,label,asset_url,entity_type,entity_id,active,updated_at from public.media_assets order by updated_at desc limit 8"),
      pool.query(`select
        (select count(*)::int from public.system_announcements where status<>'archived') as announcements,
        (select count(*)::int from public.sop_versions where status='draft') as pending_sops,
        (select count(*)::int from public.inventory_items where active=true) as inventory_products,
        (select count(*)::int from public.menu_items where active=true) as menu_items,
        (select count(*)::int from public.media_assets where active=true) as media_assets`),
    ]);
    return { announcements:announcements.rows,pendingSops:pending.rows,media:media.rows,counts:counts.rows[0] || {} };
  });

  app.post("/api/admin/super/sop-versions/:id/review", async (request, reply) => {
    const user = await superUser(request, reply); if (!user) return;
    const id = text(request.params?.id); const decision = text(request.body?.decision);
    if (!id || !["approved","rejected"].includes(decision)) return reply.code(400).send({ error:"INVALID_SOP_REVIEW" });
    try {
      const saved = await withTransaction(async (client) => {
        const current = (await client.query(`select v.*,d.site_code,d.sop_code from public.sop_versions v join public.sop_documents d on d.id=v.document_id where v.id=$1 for update`,[id])).rows[0];
        if (!current) throw Object.assign(new Error("SOP_VERSION_NOT_FOUND"),{statusCode:404});
        if (current.status !== "draft") throw Object.assign(new Error("SOP_VERSION_ALREADY_REVIEWED"),{statusCode:409});
        const result = decision === "approved"
          ? (await client.query(`update public.sop_versions set status='approved',approved_by_user_id=$2,approved_by_name=$3,approved_at=now() where id=$1 returning *`,[id,user.id,user.display_name || user.username])).rows[0]
          : (await client.query(`update public.sop_versions set status='rejected',approved_by_user_id=null,approved_by_name=null,approved_at=null where id=$1 returning *`,[id])).rows[0];
        await audit(client,user,{ action:`super_admin_sop_${decision}`,entityType:"sop_version",entityId:id,site:current.site_code,before:current,after:result,metadata:{sop_code:current.sop_code} });
        return result;
      });
      return { ok:true,version:saved };
    } catch (error) {
      return reply.code(error.statusCode || 500).send({ error:error.message || "SOP_REVIEW_FAILED" });
    }
  });

  app.get("/api/admin/super/data/:dataset", async (request, reply) => {
    const user = await superUser(request, reply); if (!user) return;
    try { return await listDataset(text(request.params?.dataset),request.query); }
    catch (error) { return reply.code(error.statusCode || 500).send({ error:error.message || "ADMIN_DATA_LOAD_FAILED" }); }
  });

  app.post("/api/admin/super/data/:dataset", async (request, reply) => {
    const user = await superUser(request, reply); if (!user) return;
    try { return { ok:true,row:await saveDatasetRow(user,text(request.params?.dataset),request.body) }; }
    catch (error) {
      const status = ["23503","23505","23514"].includes(error?.code) ? 409 : (error.statusCode || 500);
      return reply.code(status).send({ error:error.message || "ADMIN_DATA_SAVE_FAILED" });
    }
  });

  app.get("/api/admin/super/audit", async (request, reply) => {
    const user = await superUser(request, reply); if (!user) return;
    return auditRows(request.query);
  });

  app.get("/api/admin/super/audit/export", async (request, reply) => {
    const user = await superUser(request, reply); if (!user) return;
    const format = text(request.query?.format).toLowerCase();
    const data = await auditRows(request.query,{limitOverride:Math.min(2000,Math.max(1,integer(request.query?.limit,1000)))});
    const stamp = new Date().toISOString().slice(0,10);
    if (format === "excel") {
      reply.header("content-type","application/vnd.ms-excel; charset=utf-8");
      reply.header("content-disposition",`attachment; filename="kitchen-os-audit-${stamp}.xls"`);
      return reply.send(excelBuffer(data.rows));
    }
    if (format === "pdf") {
      reply.header("content-type","application/pdf");
      reply.header("content-disposition",`attachment; filename="kitchen-os-audit-${stamp}.pdf"`);
      return reply.send(pdfBuffer(data.rows));
    }
    return reply.code(400).send({ error:"INVALID_EXPORT_FORMAT" });
  });
}
