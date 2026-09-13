import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { hashPassword } from "../src/password.mjs";

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, "../../database/migrations");

const client = new Client({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.POSTGRES_DB || "kitchen_test",
  user: process.env.POSTGRES_USER || "kitchen_test",
  password: process.env.POSTGRES_PASSWORD || "kitchen_test",
});

const MODULES = ["dashboard","inventory","procurement","reservations","preparation","menu","sop","skills","attendance","schedule","reports","remote","settings"];
const all = (view, edit) => Object.fromEntries(MODULES.map((key) => [key, { view, edit: view && edit }]));
const managerPermissions = Object.fromEntries(MODULES.map((key) => [key, { view:true, edit:key !== "settings" }]));
managerPermissions.settings = { view:false, edit:false };

const supervisorPermissions = {
  dashboard:{view:true,edit:false}, inventory:{view:true,edit:true}, procurement:{view:true,edit:true},
  reservations:{view:true,edit:true}, preparation:{view:true,edit:true}, menu:{view:true,edit:false},
  sop:{view:true,edit:false}, skills:{view:true,edit:true}, attendance:{view:true,edit:false},
  schedule:{view:true,edit:false}, reports:{view:true,edit:false}, remote:{view:false,edit:false},
  settings:{view:false,edit:false},
};
const employeePermissions = {
  dashboard:{view:true,edit:false}, inventory:{view:true,edit:true}, procurement:{view:false,edit:false},
  reservations:{view:true,edit:false}, preparation:{view:true,edit:true}, menu:{view:true,edit:false},
  sop:{view:true,edit:false}, skills:{view:true,edit:false}, attendance:{view:true,edit:true},
  schedule:{view:true,edit:false}, reports:{view:false,edit:false}, remote:{view:false,edit:false},
  settings:{view:false,edit:false},
};
const parttimePermissions = {
  dashboard:{view:true,edit:false}, inventory:{view:true,edit:false}, procurement:{view:false,edit:false},
  reservations:{view:false,edit:false}, preparation:{view:true,edit:true}, menu:{view:true,edit:false},
  sop:{view:true,edit:false}, skills:{view:true,edit:false}, attendance:{view:true,edit:true},
  schedule:{view:true,edit:false}, reports:{view:false,edit:false}, remote:{view:false,edit:false},
  settings:{view:false,edit:false},
};
const centralPermissions = Object.fromEntries(MODULES.map((key) => [key, { view:key === "inventory", edit:key === "inventory" }]));
const remotePermissions = Object.fromEntries(MODULES.map((key) => [key, { view:key === "remote", edit:key === "remote" }]));

async function applyMigration(file) {
  const version = file.split("_")[0];
  const applied = await client.query("select 1 from public.schema_migrations where version=$1", [version]);
  if (applied.rowCount) return;
  const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
  await client.query(sql);
  await client.query(
    "insert into public.schema_migrations(version,filename) values($1,$2)",
    [version,file]
  );
}

async function insertUser(username, role, location, permissions) {
  const passwordHash = await hashPassword("KitchenTest!123");
  const { rows } = await client.query(
    `insert into public.app_users(username,display_name,password_hash,password_changed_at,role,location,permissions,preferred_language,active)
     values($1,$2,$3,now(),$4,$5,$6::jsonb,'vi',true)
     returning *`,
    [username,username,passwordHash,role,location,JSON.stringify(permissions)]
  );
  return rows[0];
}

await client.connect();
try {
  await client.query(`
    create table if not exists public.schema_migrations (
      version text primary key,
      filename text not null,
      applied_at timestamptz not null default now()
    )
  `);

  const migrations = fs.readdirSync(migrationsDir).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
  for (const file of migrations.filter((name) => name < "004_")) await applyMigration(file);

  await client.query(`
    truncate table
      public.sessions,
      public.inventory_receive_defaults,
      public.inventory_transactions,
      public.inventory_stock,
      public.inventory_items,
      public.inventory_locations,
      public.audit_logs,
      public.app_users
    restart identity cascade
  `);

  // Simulate the imported account state that lost admin permissions.
  await insertUser("yangchuadmin","manager","all",all(false,false));

  for (const file of migrations.filter((name) => name >= "004_")) await applyMigration(file);

  await client.query("truncate table public.business_state");

  const users = {};
  users.admin = (await client.query("select * from public.app_users where username='yangchuadmin'")).rows[0];
  users.managerfx = await insertUser("managerfx","manager","fuxing",managerPermissions);
  users.manageryj = await insertUser("manageryj","manager","yongji",managerPermissions);
  users.supervisorfx = await insertUser("supervisorfx","supervisor","fuxing",supervisorPermissions);
  users.employeefx = await insertUser("employeefx","employee","fuxing",employeePermissions);
  users.parttimefx = await insertUser("parttimefx","parttime","fuxing",parttimePermissions);
  users.centralreg = await insertUser("centralreg","central","central",centralPermissions);
  users.remoteonly = await insertUser("remoteonly","employee","fuxing",remotePermissions);

  const locations = {};
  for (const entry of [
    ["central-freezer","央廚冷凍","Tủ đông bếp trung tâm","central","storage",10],
    ["central-fridge","央廚冷藏","Tủ mát bếp trung tâm","central","storage",20],
    ["central-work-use","使用中","Đang sử dụng","central","work",90],
    ["fuxing-freezer","大冷凍","Tủ đông lớn","fuxing","storage",10],
    ["fuxing-four","四門冰箱","Tủ lạnh 4 cánh","fuxing","storage",20],
    ["fuxing-work-noodles","麵區","Khu mì","fuxing","work",90],
    ["yongji-freezer","大冷凍","Tủ đông lớn","yongji","storage",10],
    ["yongji-four","四門冰箱","Tủ lạnh 4 cánh","yongji","storage",20],
    ["yongji-work-noodles","麵區","Khu mì","yongji","work",90]
  ]) {
    const { rows } = await client.query(
      `insert into public.inventory_locations(code,name_zh_tw,name_vi,site,kind,sort_order,active)
       values($1,$2,$3,$4,$5,$6,true) returning *`,
      entry
    );
    locations[entry[0]] = rows[0];
  }

  const items = {};
  for (const entry of [
    ["fuxing:beef","beef","牛肉","Thịt bò","包","meat",false],
    ["yongji:beef","beef","牛肉","Thịt bò","包","meat",false],
    ["central:beef","beef","牛肉","Thịt bò","包","meat",false],
    ["fuxing:tofu","tofu","豆腐","Đậu phụ","盒","noodles",false],
    ["yongji:tofu","tofu","豆腐","Đậu phụ","盒","noodles",false],
    ["central:mala","mala-broth","麻辣湯","Nước lẩu mala","包","soup",false]
  ]) {
    const { rows } = await client.query(
      `insert into public.inventory_items(item_key,catalog_key,name_zh_tw,name_vi,unit,work_area,storage_only,active)
       values($1,$2,$3,$4,$5,$6,$7,true) returning *`,
      entry
    );
    items[entry[0]] = rows[0];
  }

  const addStock = async (itemKey, locationCode, quantity, minimum=0) => {
    await client.query(
      `insert into public.inventory_stock(item_id,location_id,quantity,minimum_quantity)
       values($1,$2,$3,$4)`,
      [items[itemKey].id,locations[locationCode].id,quantity,minimum]
    );
  };

  await addStock("fuxing:beef","fuxing-freezer",10,4);
  await addStock("fuxing:beef","fuxing-four",1,1);
  await addStock("fuxing:beef","fuxing-work-noodles",0,0);
  await addStock("yongji:beef","yongji-freezer",2,1);
  await addStock("yongji:beef","yongji-four",3,1);
  await addStock("central:beef","central-freezer",20,5);
  await addStock("fuxing:tofu","fuxing-freezer",5,1);
  // yongji:tofu intentionally has no configured stock location.
  await addStock("central:mala","central-freezer",8,2);

  await client.query(
    `insert into public.inventory_receive_defaults(site,catalog_key,location_id,updated_by)
     values('yongji','beef',$1,$2)`,
    [locations["yongji-four"].id,users.manageryj.id]
  );

  console.log(JSON.stringify({
    users:Object.fromEntries(Object.entries(users).map(([key,value]) => [key,value.id])),
    items:Object.fromEntries(Object.entries(items).map(([key,value]) => [key,value.id])),
    locations:Object.fromEntries(Object.entries(locations).map(([key,value]) => [key,value.id])),
  }));
  console.log("REGRESSION_DB_READY");
} finally {
  await client.end();
}
