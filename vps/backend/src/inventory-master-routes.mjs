import { pool } from "./db.mjs";
import { requireUser } from "./auth.mjs";
import { inventoryActionAllowed, inventoryActionSnapshot } from "./inventory-access.mjs";

export async function registerInventoryMasterRoutes(app) {
  app.get("/api/inventory/sites", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const { rows } = await pool.query(
      `select code,name_vi,name_zh_tw,timezone_name,currency_code,sort_order,metadata
       from public.sites
       where active=true
       order by sort_order,code`
    );

    const visible=[];
    for (const site of rows) {
      if (await inventoryActionAllowed(user,"inventory.view",{site:site.code})) visible.push(site);
    }
    return { sites:visible };
  });
  app.get("/api/inventory/access", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const site=String(request.query?.site || "").trim();
    if (!site) return reply.code(400).send({ error:"SITE_REQUIRED" });
    return inventoryActionSnapshot(user,site);
  });

}
