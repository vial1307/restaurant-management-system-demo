import pg from "pg";

// Independent PostgreSQL pool. Never reuses Kitchen OS connection or its volume.
let financePool = null;
export function financeConfigured() {
  return Boolean(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(process.env.FINANCE_OWNER_USER_ID || "") &&
    process.env.FINANCE_DB_HOST && process.env.FINANCE_DB_NAME &&
    process.env.FINANCE_DB_USER && process.env.FINANCE_DB_PASSWORD
  );
}
export function getFinancePool() {
  if (!financeConfigured()) return null;
  if (!financePool) {
    financePool = new pg.Pool({
      host:process.env.FINANCE_DB_HOST,
      port:Number(process.env.FINANCE_DB_PORT || 5432),
      database:process.env.FINANCE_DB_NAME,
      user:process.env.FINANCE_DB_USER,
      password:process.env.FINANCE_DB_PASSWORD,
      max:Math.min(Number(process.env.FINANCE_DB_POOL_MAX || 3),5),
      idleTimeoutMillis:30000,
      connectionTimeoutMillis:4000,
    });
    financePool.on("error", error => console.error("finance db pool error",error.code || "ERROR"));
  }
  return financePool;
}
export async function financeTransaction(fn) {
  const pool=getFinancePool();
  if (!pool) throw new Error("FINANCE_NOT_CONFIGURED");
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    const result=await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(()=>{});
    throw error;
  } finally {
    client.release();
  }
}
