import assert from "node:assert/strict";
import pg from "pg";

const { Client } = pg;
const BASE = process.env.TEST_API_BASE || "http://127.0.0.1:8080";
const DB = new Client({
  host:process.env.DB_HOST || "127.0.0.1",
  port:Number(process.env.DB_PORT || 5432),
  database:process.env.POSTGRES_DB || "kitchen_test",
  user:process.env.POSTGRES_USER || "kitchen_test",
  password:process.env.POSTGRES_PASSWORD || "kitchen_test",
});

async function request(path, { method="GET", cookie="", body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers:{
      ...(cookie ? { cookie } : {}),
      ...(body === undefined ? {} : { "content-type":"application/json" }),
    },
    body:body === undefined ? undefined : JSON.stringify(body),
  });
  const type = response.headers.get("content-type") || "";
  const data = type.includes("application/json") ? await response.json().catch(() => null) : null;
  return { response, data };
}

async function login(username, password="KitchenTest!123") {
  const { response, data } = await request("/api/auth/login", {
    method:"POST",
    body:{ username, password },
  });
  assert.equal(response.status, 200, `login failed for ${username}: ${JSON.stringify(data)}`);
  const cookie = (response.headers.get("set-cookie") || "").split(";")[0];
  assert(cookie.includes("kitchen_session="), `session cookie missing for ${username}`);
  return { cookie, user:data.user };
}

async function removeUser(cookie, id) {
  if (!id) return;
  const result = await request(`/api/admin/users/${encodeURIComponent(id)}`, { method:"DELETE",cookie });
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
}

await DB.connect();
try {
  const schema = await DB.query("select version from public.schema_migrations order by version desc limit 1");
  assert.equal(schema.rows[0]?.version, "024");

  const ownerDb = await DB.query("select role,location,permission_overrides from public.app_users where username='yangchuadmin'");
  assert.equal(ownerDb.rows[0]?.role, "superadmin");
  assert.equal(ownerDb.rows[0]?.location, "all");
  assert.deepEqual(ownerDb.rows[0]?.permission_overrides, {});

  const owner = await login("yangchuadmin");
  assert.equal(owner.user.role, "admin", "legacy Kitchen OS role must remain admin-compatible");
  assert.equal(owner.user.roleCode, "superadmin");
  assert.equal(owner.user.policyRole, "admin");
  assert.equal(owner.user.capabilities["system.super_admin"], true);
  assert.equal(owner.user.capabilities["workforce.self_service"], false, "Super Admin must not inherit restrictive self-service capability");

  const overview = await request("/api/admin/super/overview", { cookie:owner.cookie });
  assert.equal(overview.response.status, 200, JSON.stringify(overview.data));
  assert.equal(overview.data.database.database_name, process.env.POSTGRES_DB || "kitchen_test");
  assert.equal(overview.data.schema.version, "024");
  assert(Number(overview.data.api.uptime_seconds) >= 0);

  const development = await request("/api/admin/super/development-status", { cookie:owner.cookie });
  assert.equal(development.response.status, 200, JSON.stringify(development.data));
  assert.equal(development.data.repository.name, "vial1307/restaurant-management-system-demo");
  assert.match(development.data.current_work.url, /github\.com\/vial1307\/restaurant-management-system-demo\/(tree|pull)\//);
  assert(["stable","in_progress"].includes(development.data.status));
  assert.equal(typeof development.data.current_work.branch, "string");
  assert(development.data.current_work.branch.length > 0);
  assert.equal(development.data.current_work.candidate_schema, "024");
  assert.equal(development.data.runtime.schema.version, "024");
  assert.equal(development.data.live_production.schema, "024");
  assert.equal(development.data.release_evidence.schema, "024");
  assert.equal(development.data.release_evidence.workflow_run_id, "35549929164");
  assert.equal(development.data.release_evidence.inventory_audit_run_id, "35549929164");
  assert.match(development.data.canonical_handoff.url, /vial1307\.github\.io\/restaurant-management-system-demo\/handoff\.html/);
  assert.equal(development.data.live_github.source, "github-api-live");
  assert.equal(typeof development.data.live_github.available, "boolean");
  assert(Array.isArray(development.data.live_github.commits));
  assert(Array.isArray(development.data.live_github.changed_files));
  assert(Array.isArray(development.data.live_github.workflows));
  assert(Array.isArray(development.data.documents) && development.data.documents.length >= 4);
  assert(Array.isArray(development.data.next_steps) && development.data.next_steps.length >= 3);

  const metrics = await request("/api/admin/super/system-metrics", { cookie:owner.cookie });
  assert.equal(metrics.response.status, 200, JSON.stringify(metrics.data));
  assert.equal(metrics.data.host.available, true);
  assert.equal(Number(metrics.data.host.memory.total_bytes), 4294967296);
  assert.equal(Number(metrics.data.host.disk.total_bytes), 85899345920);
  assert.equal(Number(metrics.data.host.network.rx_bytes_per_second), 1048576);
  assert(Array.isArray(metrics.data.table_sizes));
  assert(Number(metrics.data.database.max_connections) > 0);

  const accessModel = await request("/api/admin/access-model", { cookie:owner.cookie });
  assert.equal(accessModel.response.status, 200);
  const superRole = accessModel.data.roles.find((role) => role.code === "superadmin");
  assert(superRole, "superadmin role missing from owner access model");
  assert.equal(superRole.capabilities["system.super_admin"], true);
  assert.equal(superRole.capabilities["workforce.self_service"], false);

  const ordinaryAdminCreate = await request("/api/admin/users", {
    method:"POST",cookie:owner.cookie,
    body:{
      action:"create",username:"ordinaryadmin",display_name:"Ordinary Admin",password:"KitchenTest!123",
      role:"admin",location:"all",active:true,permissions:{},
    },
  });
  assert.equal(ordinaryAdminCreate.response.status, 200, JSON.stringify(ordinaryAdminCreate.data));
  const ordinaryAdminId = ordinaryAdminCreate.data.user.id;
  const ordinary = await login("ordinaryadmin");
  assert.equal(ordinary.user.capabilities["system.super_admin"], false);
  const ordinaryDenied = await request("/api/admin/super/overview", { cookie:ordinary.cookie });
  assert.equal(ordinaryDenied.response.status, 403);
  assert.equal(ordinaryDenied.data.error, "SUPER_ADMIN_REQUIRED");
  const ordinaryMetricsDenied = await request("/api/admin/super/system-metrics", { cookie:ordinary.cookie });
  assert.equal(ordinaryMetricsDenied.response.status, 403);
  assert.equal(ordinaryMetricsDenied.data.error, "SUPER_ADMIN_REQUIRED");
  const ordinaryDevelopmentDenied = await request("/api/admin/super/development-status", { cookie:ordinary.cookie });
  assert.equal(ordinaryDevelopmentDenied.response.status, 403);
  assert.equal(ordinaryDevelopmentDenied.data.error, "SUPER_ADMIN_REQUIRED");
  const ordinaryModel = await request("/api/admin/access-model", { cookie:ordinary.cookie });
  assert.equal(ordinaryModel.response.status, 200);
  assert.equal(ordinaryModel.data.roles.some((role) => role.code === "superadmin"), false, "ordinary admin must not see promotable Super Admin role");

  const overrideCreate = await request("/api/admin/users", {
    method:"POST",cookie:owner.cookie,
    body:{
      action:"create",username:"rbacoverride",display_name:"RBAC Override",password:"KitchenTest!123",
      role:"employee",location:"fuxing",active:true,
      permissions:{ inventory:{view:false,edit:true},dashboard:{view:true,edit:false} },
    },
  });
  assert.equal(overrideCreate.response.status, 200, JSON.stringify(overrideCreate.data));
  const overrideId = overrideCreate.data.user.id;
  assert.deepEqual(overrideCreate.data.user.permission_overrides.inventory,{view:false,edit:false});
  const overrideLogin = await login("rbacoverride");
  assert.equal(overrideLogin.user.permissions.inventory.view, false, "explicit override must beat employee role default");
  assert.equal(overrideLogin.user.permissions.inventory.edit, false, "edit must never survive when view=false");
  assert.equal(overrideLogin.user.permissions.dashboard.view, true);
  const overrideDb = await DB.query("select permission_overrides,permissions from public.app_users where id=$1",[overrideId]);
  assert.deepEqual(overrideDb.rows[0].permission_overrides.inventory,{view:false,edit:false});
  assert.notDeepEqual(overrideDb.rows[0].permissions, overrideDb.rows[0].permission_overrides, "new RBAC overrides must not overwrite legacy permissions column");

  const siteCode = "regression-super-site";
  const saveSite = await request("/api/admin/super/sites", {
    method:"POST",cookie:owner.cookie,
    body:{ code:siteCode,name_vi:"Chi nhánh Regression",name_zh_tw:"回歸分店",timezone_name:"Asia/Taipei",currency_code:"TWD",active:true,sort_order:999,metadata:{regression:true} },
  });
  assert.equal(saveSite.response.status, 200, JSON.stringify(saveSite.data));
  assert.equal(saveSite.data.site.code, siteCode);
  const disableSite = await request("/api/admin/super/sites", {
    method:"POST",cookie:owner.cookie,
    body:{ ...saveSite.data.site,active:false },
  });
  assert.equal(disableSite.response.status, 200, JSON.stringify(disableSite.data));
  assert.equal(disableSite.data.site.active, false);

  const settingSave = await request("/api/admin/super/settings", {
    method:"POST",cookie:owner.cookie,
    body:{ setting_key:"website.regression_banner",value:{enabled:true,text:"regression"} },
  });
  assert.equal(settingSave.response.status, 200, JSON.stringify(settingSave.data));
  assert.equal(Number(settingSave.data.setting.version), 1);
  const settingUpdate = await request("/api/admin/super/settings", {
    method:"POST",cookie:owner.cookie,
    body:{ setting_key:"website.regression_banner",value:{enabled:false,text:"regression-2"} },
  });
  assert.equal(settingUpdate.response.status, 200, JSON.stringify(settingUpdate.data));
  assert.equal(Number(settingUpdate.data.setting.version), 2);

  const announcement = await request("/api/admin/super/data/announcements", {
    method:"POST",cookie:owner.cookie,
    body:{ action:"save",values:{site_code:"fuxing",title_vi:"Thông báo regression",title_zh_tw:"回歸公告",body_vi:"Nội dung",body_zh_tw:"內容",status:"published"} },
  });
  assert.equal(announcement.response.status, 200, JSON.stringify(announcement.data));
  const announcementId = announcement.data.row.id;
  const table = await request("/api/admin/super/data/announcements?q=regression&site=fuxing&status=published&page=1&pageSize=10&sort=updated_at&direction=desc", { cookie:owner.cookie });
  assert.equal(table.response.status, 200, JSON.stringify(table.data));
  assert(table.data.rows.some((row) => row.id === announcementId));
  assert.equal(table.data.pagination.page, 1);
  assert(table.data.columns.includes("title_vi"));

  const forbiddenField = await request("/api/admin/super/data/announcements", {
    method:"POST",cookie:owner.cookie,
    body:{action:"save",values:{title_vi:"Blocked",title_zh_tw:"阻擋",raw_sql:"select 1"}},
  });
  assert.equal(forbiddenField.response.status,400,JSON.stringify(forbiddenField.data));
  assert.equal(forbiddenField.data.error,"ADMIN_FIELD_NOT_ALLOWED");

  const updatedAnnouncement = await request("/api/admin/super/data/announcements", {
    method:"POST",cookie:owner.cookie,
    body:{action:"save",id:announcementId,expectedRevision:announcement.data.row.row_revision,values:{body_vi:"Nội dung mới"}},
  });
  assert.equal(updatedAnnouncement.response.status,200,JSON.stringify(updatedAnnouncement.data));
  const staleAnnouncement = await request("/api/admin/super/data/announcements", {
    method:"POST",cookie:owner.cookie,
    body:{action:"save",id:announcementId,expectedRevision:announcement.data.row.row_revision,values:{body_vi:"Ghi đè cũ"}},
  });
  assert.equal(staleAnnouncement.response.status,409,JSON.stringify(staleAnnouncement.data));
  assert.equal(staleAnnouncement.data.error,"ADMIN_ROW_STALE");
  const archiveAnnouncement = await request("/api/admin/super/data/announcements", {
    method:"POST",cookie:owner.cookie,body:{action:"archive",id:announcementId,expectedRevision:updatedAnnouncement.data.row.row_revision},
  });
  assert.equal(archiveAnnouncement.response.status, 200, JSON.stringify(archiveAnnouncement.data));
  assert.equal(archiveAnnouncement.data.row.status, "archived");

  const inventoryLocation = await DB.query(
    "select id from public.inventory_locations where site='fuxing' and kind='storage' and active=true order by sort_order,code limit 1"
  );
  assert.equal(inventoryLocation.rowCount,1,"Fuxing storage fixture missing for Super Admin inventory lifecycle regression");

  const inventorySeed = await DB.query(
    `insert into public.inventory_items(
       item_key,catalog_key,name_vi,name_zh_tw,unit,work_area,storage_only,active
     ) values(
       'fuxing:super-admin-lifecycle-regression',
       'super-admin-lifecycle-regression',
       'Nguyên liệu lifecycle regression',
       '庫存生命週期回歸',
       '包','noodles',true,true
     )
     on conflict(item_key) do update set
       name_vi=excluded.name_vi,
       name_zh_tw=excluded.name_zh_tw,
       unit=excluded.unit,
       work_area=excluded.work_area,
       storage_only=excluded.storage_only,
       active=true,
       updated_at=now()
     returning id`
  );
  const inventoryId=inventorySeed.rows[0].id;
  await DB.query(
    `insert into public.inventory_stock(item_id,location_id,quantity,minimum_quantity)
     values($1,$2,0,0)
     on conflict(item_id,location_id) do update
     set quantity=0,minimum_quantity=0,updated_at=now()`,
    [inventoryId,inventoryLocation.rows[0].id]
  );

  const inventoryTable = await request(
    "/api/admin/super/data/inventory-products?q=super-admin-lifecycle-regression&page=1&pageSize=10&sort=updated_at&direction=desc",
    { cookie:owner.cookie }
  );
  assert.equal(inventoryTable.response.status,200,JSON.stringify(inventoryTable.data));
  assert.equal(inventoryTable.data.allowCreate,false);
  assert.equal(inventoryTable.data.allowArchive,false);
  assert.equal(inventoryTable.data.lifecycleManaged,true);
  assert(!inventoryTable.data.editable.includes("active"),"generic inventory CRUD must not expose active lifecycle edits");
  const inventoryRow=inventoryTable.data.rows.find((row)=>row.id===inventoryId);
  assert(inventoryRow,"seeded inventory row missing from Super Admin dataset");

  const createInventory = await request("/api/admin/super/data/inventory-products",{
    method:"POST",cookie:owner.cookie,
    body:{action:"save",values:{
      item_key:"fuxing:generic-create-must-fail",
      catalog_key:"generic-create-must-fail",
      name_vi:"Không được tạo",
      name_zh_tw:"不可建立",
      unit:"包",
      work_area:"noodles",
      storage_only:true
    }},
  });
  assert.equal(createInventory.response.status,409,JSON.stringify(createInventory.data));
  assert.equal(createInventory.data.error,"ADMIN_INVENTORY_LIFECYCLE_MANAGED");

  const activateToggle = await request("/api/admin/super/data/inventory-products",{
    method:"POST",cookie:owner.cookie,
    body:{action:"save",id:inventoryId,expectedRevision:inventoryRow.row_revision,values:{active:false}},
  });
  assert.equal(activateToggle.response.status,400,JSON.stringify(activateToggle.data));
  assert.equal(activateToggle.data.error,"ADMIN_FIELD_NOT_ALLOWED");
  assert.equal(activateToggle.data.field,"active");

  const archiveInventory = await request("/api/admin/super/data/inventory-products",{
    method:"POST",cookie:owner.cookie,
    body:{action:"archive",id:inventoryId,expectedRevision:inventoryRow.row_revision},
  });
  assert.equal(archiveInventory.response.status,400,JSON.stringify(archiveInventory.data));
  assert.equal(archiveInventory.data.error,"ADMIN_ARCHIVE_NOT_ALLOWED");

  const updateInventoryMetadata = await request("/api/admin/super/data/inventory-products",{
    method:"POST",cookie:owner.cookie,
    body:{
      action:"save",
      id:inventoryId,
      expectedRevision:inventoryRow.row_revision,
      values:{name_vi:"Nguyên liệu lifecycle regression đã sửa",unit:"袋"}
    },
  });
  assert.equal(updateInventoryMetadata.response.status,200,JSON.stringify(updateInventoryMetadata.data));
  assert.equal(updateInventoryMetadata.data.row.name_vi,"Nguyên liệu lifecycle regression đã sửa");
  assert.equal(updateInventoryMetadata.data.row.unit,"袋");
  assert.equal(updateInventoryMetadata.data.row.active,true);

  await DB.query("delete from public.inventory_stock where item_id=$1",[inventoryId]);
  await DB.query("delete from public.inventory_items where id=$1",[inventoryId]);

    const menuSeed = await DB.query(
    `insert into public.menu_items(site_code,item_code,name_vi,name_zh_tw,category,work_area,price,currency_code,active,metadata)
     values('fuxing','super-regression-menu','Món Regression','回歸菜品','test','noodles',120,'TWD',true,'{}'::jsonb)
     on conflict(site_code,item_code) do update set price=excluded.price,name_vi=excluded.name_vi,name_zh_tw=excluded.name_zh_tw,active=true,updated_at=now()\n     returning id,revision`
  );
  assert.equal(menuSeed.rowCount,1);
  const immutableMenuIdentity = await request("/api/admin/super/data/menu-items", {
    method:"POST",cookie:owner.cookie,
    body:{action:"save",id:menuSeed.rows[0].id,expectedRevision:String(menuSeed.rows[0].revision),values:{item_code:"must-not-change"}},
  });
  assert.equal(immutableMenuIdentity.response.status,409,JSON.stringify(immutableMenuIdentity.data));
  assert.equal(immutableMenuIdentity.data.error,"ADMIN_IMMUTABLE_FIELD");
  assert.equal(immutableMenuIdentity.data.field,"item_code");
  const menuSync = await request("/api/admin/super/menu-sync", {
    method:"POST",cookie:owner.cookie,body:{source:"fuxing",destination:"yongji",overwritePrices:true},
  });
  assert.equal(menuSync.response.status, 200, JSON.stringify(menuSync.data));
  const yongjiMenu = await DB.query("select price from public.menu_items where site_code='yongji' and item_code='super-regression-menu'");
  assert.equal(Number(yongjiMenu.rows[0]?.price),120);
  await DB.query("update public.menu_items set price=155 where site_code='yongji' and item_code='super-regression-menu'");
  const preservePrice = await request("/api/admin/super/menu-sync", {
    method:"POST",cookie:owner.cookie,body:{source:"fuxing",destination:"yongji",overwritePrices:false},
  });
  assert.equal(preservePrice.response.status, 200, JSON.stringify(preservePrice.data));
  const preserved = await DB.query("select price from public.menu_items where site_code='yongji' and item_code='super-regression-menu'");
  assert.equal(Number(preserved.rows[0]?.price),155,"destination-specific menu price must survive non-price sync");

  const document = await DB.query(
    `insert into public.sop_documents(site_code,sop_code,work_area,name_vi,name_zh_tw,active)
     values('fuxing','super-regression-sop','noodles','SOP Regression','回歸SOP',true)
     on conflict(site_code,sop_code) do update set active=true
     returning id`
  );
  const version = await DB.query(
    `insert into public.sop_versions(document_id,version_no,status,revision_note)
     values($1,99,'draft','super-admin regression') returning id`,[document.rows[0].id]
  );
  const review = await request(`/api/admin/super/sop-versions/${version.rows[0].id}/review`, {
    method:"POST",cookie:owner.cookie,body:{decision:"approved"},
  });
  assert.equal(review.response.status,200,JSON.stringify(review.data));
  assert.equal(review.data.version.status,"approved");
  assert(review.data.version.approved_at);

  const audit = await request("/api/admin/super/audit?q=super_admin&page=1&pageSize=100", { cookie:owner.cookie });
  assert.equal(audit.response.status, 200, JSON.stringify(audit.data));
  assert(audit.data.rows.some((row) => row.action === "super_admin_menu_sync"));
  assert(audit.data.rows.some((row) => row.action === "super_admin_setting_save"));

  const excel = await fetch(`${BASE}/api/admin/super/audit/export?format=excel&limit=50`, { headers:{cookie:owner.cookie} });
  assert.equal(excel.status,200);
  assert.match(excel.headers.get("content-type") || "",/application\/vnd\.ms-excel/);
  assert((await excel.arrayBuffer()).byteLength > 10);
  const pdf = await fetch(`${BASE}/api/admin/super/audit/export?format=pdf&limit=50`, { headers:{cookie:owner.cookie} });
  assert.equal(pdf.status,200);
  assert.match(pdf.headers.get("content-type") || "",/application\/pdf/);
  const pdfBytes = new Uint8Array(await pdf.arrayBuffer());
  assert.equal(new TextDecoder("ascii").decode(pdfBytes.slice(0,8)),"%PDF-1.4");

  await removeUser(owner.cookie, overrideId);
  await removeUser(owner.cookie, ordinaryAdminId);

  console.log("SUPER_ADMIN_API_REGRESSION_OK");
} finally {
  await DB.end();
}
