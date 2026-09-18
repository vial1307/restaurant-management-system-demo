import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(".admindev.html", "utf8");
const legacyAdmin = fs.readFileSync("admin.html", "utf8");
const js = fs.readFileSync("src/admin-panel.js", "utf8");
const inventoryJs = fs.readFileSync("src/admin-panel-inventory.js", "utf8");
const css = fs.readFileSync("src/admin-panel.css", "utf8");
const adminRoutes = fs.readFileSync("vps/backend/src/admin-routes.mjs", "utf8");
const superRoutes = fs.readFileSync("vps/backend/src/super-admin-routes.mjs", "utf8");
const accessControl = fs.readFileSync("vps/backend/src/access-control.mjs", "utf8");
const auth = fs.readFileSync("vps/backend/src/auth.mjs", "utf8");
const migration = fs.readFileSync("vps/database/migrations/018_super_admin_panel_v2.sql", "utf8");
const deploy = fs.readFileSync("vps/scripts/deploy-api.sh", "utf8");
const caddy = fs.readFileSync("vps/Caddyfile", "utf8");

assert.match(html, /id="admin-app"/);
assert.match(html, /Kitchen OS · Super Admin/);
assert.match(html, /src\/admin-panel\.js/);
assert.match(html, /src\/admin-panel-inventory\.js/);
assert.match(html, /src\/admin-panel\.css/);
assert.doesNotMatch(html, /inventory-master-admin\.js/, "standalone Super Admin console must not load the old inventory master-data panel");
assert.match(html, /noindex,nofollow/);
assert.match(legacyAdmin, /\.admindev\.html/, "legacy admin URL must redirect to the dedicated Super Admin entry");
assert.match(caddy, /@legacyAdmin path \/admin\.html/);
assert.match(caddy, /redir @legacyAdmin \/\.admindev\.html 308/);

assert.match(js, /vpsMe\(\)/, "Super Admin Panel must authenticate against VPS session");
assert.match(js, /system\.super_admin/, "Super Admin Panel must require the dedicated system-owner capability");
assert.match(js, /\/api\/admin\/super\/overview/, "overview must read live VPS/PostgreSQL information");
assert.match(js, /\/api\/admin\/users/, "user administration must use database-backed API");
assert.match(js, /\/api\/admin\/access-model/, "RBAC editor must read roles/modules from database access model");
assert.match(js, /\/api\/admin\/super\/content/, "content moderation must use Super Admin API");
assert.match(js, /\/api\/admin\/super\/data\//, "Data Tables CRUD must be server-backed");
assert.match(js, /\/api\/admin\/super\/sites/, "multi-store management must be server-backed");
assert.match(js, /\/api\/admin\/super\/menu-sync/, "menu synchronization must be server-backed");
assert.match(js, /\/api\/admin\/super\/settings/, "system settings must be server-backed");
assert.match(js, /\/api\/admin\/super\/audit/, "audit logs must be server-backed");
assert.match(js, /await loadCore\(\);[\s\S]*if\(section==="data"\)await loadDataset\(\);[\s\S]*else if\(section==="logs"\)await loadAudit\(\);/, "every tab switch must refresh PostgreSQL-backed state and section-specific data");
assert.doesNotMatch(js, /section==="data"&&!state\.data\.result|section==="logs"&&!state\.audit\.result/, "tab switching must not reuse stale cached section snapshots");
assert.match(js, /sectionLoadSeq/, "tab refresh must guard against stale async responses overwriting a newer tab");
assert.match(js, /data-export="excel"|data-export=\"excel\"/);
assert.match(js, /data-export="pdf"|data-export=\"pdf\"/);
assert.doesNotMatch(js, /localStorage\.setItem/, "standalone Admin Panel must not use browser storage as system data authority");

assert.match(inventoryJs, /system\.super_admin/, "inventory management extension must also require Super Admin session");
assert.match(inventoryJs, /\/api\/inventory\/\$\{encodeURIComponent\(site\)\}/, "inventory overview must read canonical site inventory API");
assert.match(inventoryJs, /\/api\/inventory\/direct-transfer/, "cross-store stock movement must use canonical atomic transfer API");
assert.match(inventoryJs, /receiveDefaults/, "destination branch receiving-location policy must be respected in Admin Panel");
assert.match(inventoryJs, /\/api\/admin\/super\/inventory-catalog-audit/, "Super Admin inventory panel must expose PostgreSQL-backed cross-site catalog audit");
assert.match(inventoryJs, /multiLocationMissingReceiveDefault/, "catalog audit UI must surface missing receiving-default policy");
assert.match(inventoryJs, /identityVariants/, "catalog audit UI must separate identity drift");
assert.match(inventoryJs, /operationalVariants/, "catalog audit UI must separate operational variance");
assert.match(inventoryJs, /\/api\/admin\/super\/inventory-catalog-identity/, "Super Admin UI must use audited catalog identity resolver API");
assert.match(inventoryJs, /data-identity-resolve/, "catalog identity drift rows must expose an explicit resolve action");
assert.match(inventoryJs, /host\.isConnected/, "inventory extension must detect host replacement during live tab refresh");
assert.match(inventoryJs, /queueMicrotask\(\(\) => \{ void mount\(\); \}\)/, "inventory extension must remount after a live tab refresh replaces its host");
assert.doesNotMatch(inventoryJs, /set-quantity|update public\.inventory_stock/, "Super Admin UI must not bypass inventory transaction invariants");

assert.match(css, /@media\(max-width:960px\)/, "Admin Panel must include tablet/mobile navigation layout");
assert.match(css, /@media\(max-width:640px\)/, "Admin Panel must include compact mobile layout");

assert.match(superRoutes, /system\.super_admin/, "all Super Admin routes must enforce system.super_admin");
assert.match(superRoutes, /\/api\/admin\/super\/inventory-catalog-audit/, "cross-site catalog audit must be protected by Super Admin route");
assert.match(superRoutes, /metadataVariants/, "catalog audit must report cross-site metadata variance");
assert.match(superRoutes, /identityVariants/, "catalog audit must report cross-site identity drift");
assert.match(superRoutes, /operationalVariants/, "catalog audit must report cross-site operational variance");
assert.match(superRoutes, /\/api\/admin\/super\/inventory-catalog-identity/, "manual catalog identity resolution must be server-backed");
assert.match(superRoutes, /super_admin_inventory_identity_resolve/, "manual catalog identity resolution must write audit logs");
assert.match(superRoutes, /multiLocationMissingReceiveDefault/, "catalog audit must report receiving-default gaps");
assert.match(superRoutes, /const DATASETS = \{/, "generic CRUD must use an explicit server-side whitelist");
assert.match(superRoutes, /announcements:/);
assert.match(superRoutes, /"menu-items":/);
assert.match(superRoutes, /"inventory-products":/);
assert.match(superRoutes, /"sop-documents":/);
assert.match(superRoutes, /audit_logs/);
assert.match(superRoutes, /application\/vnd\.ms-excel/);
assert.match(superRoutes, /application\/pdf/);
assert.match(superRoutes, /super_admin_menu_sync/);
assert.match(superRoutes, /jsonb_build_object\('synced_from',\$1::text\)/, "menu sync metadata parameter must be explicitly typed for PostgreSQL");
assert.match(superRoutes, /for update/, "sensitive Super Admin updates must preserve transaction locking where applicable");

assert.match(adminRoutes, /permission_overrides/, "user overrides must persist in the dedicated RBAC column");
assert.doesNotMatch(adminRoutes, /permissions as permission_overrides/, "legacy app_users.permissions must not be reinterpreted as new RBAC overrides");
assert.match(adminRoutes, /SUPER_ADMIN_REQUIRED/, "ordinary admin must not be able to promote/edit Super Admin accounts");
assert.match(adminRoutes, /system\.super_admin/);
assert.match(adminRoutes, /account_update/);

assert.match(accessControl, /mergePermissionOverrides/);
assert.match(accessControl, /select permission_overrides from public\.app_users/);
assert.doesNotMatch(accessControl, /select permissions from public\.app_users/);
assert.match(auth, /u\.permission_overrides/);
assert.match(auth, /roleCode === "superadmin" \? user\.role : roleCode/, "Kitchen OS must receive admin-compatible role semantics for the Super Admin owner");

assert.match(migration, /'superadmin','Super Admin'/);
assert.match(migration, /system\.super_admin/);
assert.match(migration, /parent_role_code/);
assert.match(migration, /add column if not exists permission_overrides jsonb/);
assert.match(migration, /permission_overrides='\{\}'::jsonb/);
assert.match(migration, /create table if not exists public\.system_announcements/);
assert.match(migration, /create table if not exists public\.media_assets/);
assert.match(migration, /add column if not exists price numeric/);
assert.match(migration, /website\.brand_name/);
assert.doesNotMatch(migration, /select 'superadmin',capability_key,true\s+from public\.permission_capabilities/, "restriction-like capabilities must not be blindly granted to Super Admin");

assert.match(deploy, /cp -a "\$\{REPO_DIR\}\/\.admindev\.html"/, "deployment must publish the dedicated Super Admin entry");
assert.match(deploy, /cp -a "\$\{REPO_DIR\}\/admin\.html"/, "deployment must keep the legacy redirect file available");
assert.match(deploy, /curl -fsS http:\/\/127\.0\.0\.1\/\.admindev\.html/, "deployment must smoke the dedicated Super Admin entry before success");

console.log("SUPER_ADMIN_PANEL_STATIC_REGRESSION_OK");
