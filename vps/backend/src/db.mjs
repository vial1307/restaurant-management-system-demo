import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.DB_HOST || "db",
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (error) => {
  console.error("postgres pool error", error);
});

export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    try { await client.query("rollback"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}


let schemaFingerprintPromise = null;

export function schemaFingerprint() {
  if (schemaFingerprintPromise) return schemaFingerprintPromise;
  schemaFingerprintPromise = pool.query(`
    with object_lines as (
      select format('table|%I.%I|%s', n.nspname, c.relname, c.relkind) as line
      from pg_class c
      join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind in ('r','p','S','v','m')
      union all
      select format(
        'column|%I.%I|%s|%I|%s|%s|%s',
        n.nspname,c.relname,a.attnum,a.attname,
        pg_catalog.format_type(a.atttypid,a.atttypmod),
        a.attnotnull,
        coalesce(pg_get_expr(d.adbin,d.adrelid),'')
      )
      from pg_attribute a
      join pg_class c on c.oid=a.attrelid
      join pg_namespace n on n.oid=c.relnamespace
      left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
      where n.nspname='public' and a.attnum>0 and not a.attisdropped
        and c.relkind in ('r','p','v','m')
      union all
      select format(
        'constraint|%I.%I|%I|%s|%s',
        n.nspname,c.relname,con.conname,con.contype,pg_get_constraintdef(con.oid,true)
      )
      from pg_constraint con
      join pg_class c on c.oid=con.conrelid
      join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public'
      union all
      select format(
        'index|%I.%I|%I|%s',
        n.nspname,t.relname,i.relname,pg_get_indexdef(i.oid)
      )
      from pg_index x
      join pg_class t on t.oid=x.indrelid
      join pg_class i on i.oid=x.indexrelid
      join pg_namespace n on n.oid=t.relnamespace
      where n.nspname='public'
      union all
      select format(
        'trigger|%I.%I|%I|%s',
        n.nspname,c.relname,t.tgname,pg_get_triggerdef(t.oid,true)
      )
      from pg_trigger t
      join pg_class c on c.oid=t.tgrelid
      join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and not t.tgisinternal
      union all
      select format(
        'function|%I.%I|%s',
        n.nspname,p.proname,pg_get_functiondef(p.oid)
      )
      from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public'
    )
    select md5(coalesce(string_agg(line,E'\\n' order by line),'')) as fingerprint
    from object_lines
  `).then(({ rows }) => rows[0]?.fingerprint || null).catch((error) => {
    schemaFingerprintPromise = null;
    throw error;
  });
  return schemaFingerprintPromise;
}
