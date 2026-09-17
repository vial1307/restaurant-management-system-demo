import { pool } from "./db.mjs";
import { requireUser, siteAllowed } from "./auth.mjs";

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

    return {
      sites: rows.filter((site) => siteAllowed(user, site.code)),
    };
  });
}
