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
      canonical.rowCount,
      0,
      `browser fixture unexpectedly contains both legacy and canonical location codes for ${site}: ${canonicalCode}`
    );
    assert.equal(
      legacy.rowCount,
      1,
      `browser fixture legacy location missing before canonicalization: ${legacyCode}`
    );

    await client.query(
      "update public.inventory_locations set code=$1 where id=$2",
      [canonicalCode, legacy.rows[0].id]
    );
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
