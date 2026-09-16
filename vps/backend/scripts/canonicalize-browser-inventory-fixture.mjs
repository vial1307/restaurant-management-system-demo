import assert from "node:assert/strict";
import pg from "pg";

const { Client } = pg;

const client = new Client({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.POSTGRES_DB || "kitchen_test",
  user: process.env.POSTGRES_USER || "kitchen_test",
  password: process.env.POSTGRES_PASSWORD || "kitchen_test",
});

const mappings = [
  ["fuxing", "fuxing-freezer", "fuxing-large-freezer"],
  ["fuxing", "fuxing-four", "fuxing-four-door"],
  ["yongji", "yongji-freezer", "yongji-large-freezer"],
  ["yongji", "yongji-four", "yongji-four-door"],
];

async function mergeLegacyLocation(legacyId, canonicalId) {
  await client.query(
    `insert into public.inventory_stock(item_id,location_id,quantity,minimum_quantity,updated_at)
     select item_id,$1,quantity,minimum_quantity,updated_at
     from public.inventory_stock
     where location_id=$2
     on conflict(item_id,location_id) do update set
       quantity=public.inventory_stock.quantity + excluded.quantity,
       minimum_quantity=greatest(public.inventory_stock.minimum_quantity,excluded.minimum_quantity),
       updated_at=greatest(public.inventory_stock.updated_at,excluded.updated_at)`,
    [canonicalId, legacyId]
  );
  await client.query("delete from public.inventory_stock where location_id=$1", [legacyId]);
  await client.query(
    "update public.inventory_transactions set source_location_id=$1 where source_location_id=$2",
    [canonicalId, legacyId]
  );
  await client.query(
    "update public.inventory_transactions set destination_location_id=$1 where destination_location_id=$2",
    [canonicalId, legacyId]
  );
  await client.query(
    "update public.inventory_receive_defaults set location_id=$1,updated_at=now() where location_id=$2",
    [canonicalId, legacyId]
  );
  await client.query("delete from public.inventory_locations where id=$1", [legacyId]);
}

await client.connect();
try {
  await client.query("begin");

  for (const [site, legacyCode, canonicalCode] of mappings) {
    const legacy = await client.query(
      "select id from public.inventory_locations where site=$1 and code=$2",
      [site, legacyCode]
    );
    const canonical = await client.query(
      "select id from public.inventory_locations where site=$1 and code=$2",
      [site, canonicalCode]
    );

    assert.equal(
      legacy.rowCount,
      1,
      `browser fixture legacy location missing before canonicalization: ${legacyCode}`
    );
    assert(
      canonical.rowCount <= 1,
      `browser fixture has multiple canonical location rows for ${site}: ${canonicalCode}`
    );

    if (canonical.rowCount === 0) {
      await client.query(
        `update public.inventory_locations
         set code=$1,
             metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object('canonical',true,'legacy_code',$2)
         where id=$3`,
        [canonicalCode, legacyCode, legacy.rows[0].id]
      );
    } else {
      await mergeLegacyLocation(legacy.rows[0].id, canonical.rows[0].id);
    }
  }

  await client.query("commit");

  const legacyCodes = mappings.map(([, legacyCode]) => legacyCode);
  const canonicalCodes = mappings.map(([, , canonicalCode]) => canonicalCode);
  const remainingLegacy = await client.query(
    "select code from public.inventory_locations where code = any($1::text[])",
    [legacyCodes]
  );
  const canonical = await client.query(
    "select code from public.inventory_locations where code = any($1::text[]) order by code",
    [canonicalCodes]
  );

  assert.equal(remainingLegacy.rowCount, 0, "legacy browser fixture location codes remain after canonicalization");
  assert.deepEqual(
    canonical.rows.map((row) => row.code).sort(),
    canonicalCodes.slice().sort(),
    "canonical browser fixture location set mismatch"
  );

  console.log("BROWSER_INVENTORY_FIXTURE_CANONICAL_OK");
} catch (error) {
  try { await client.query("rollback"); } catch {}
  throw error;
} finally {
  await client.end();
}
