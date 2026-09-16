import { pool } from "./db.mjs";

function cleanSite(value) {
  return String(value || "").trim();
}

export async function activeSite(site, client = pool) {
  const code = cleanSite(site);
  if (!code) return null;
  const { rows } = await client.query(
    `select code,name_vi,name_zh_tw,timezone_name,currency_code,sort_order,metadata
     from public.sites
     where code=$1 and active=true
     limit 1`,
    [code]
  );
  return rows[0] || null;
}

export async function activeSiteCodes(client = pool) {
  const { rows } = await client.query(
    `select code
     from public.sites
     where active=true
     order by sort_order,code`
  );
  return rows.map((row) => String(row.code));
}

export async function inventorySiteMode(site, client = pool) {
  const row = await activeSite(site, client);
  return String(row?.metadata?.inventory_mode || "");
}

export async function isBranchSite(site, client = pool) {
  return (await inventorySiteMode(site, client)) === "branch";
}
