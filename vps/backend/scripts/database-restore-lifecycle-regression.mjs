import pg from "pg";

const { Client } = pg;
const client = new Client({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.POSTGRES_DB || "kitchen_test",
  user: process.env.POSTGRES_USER || "kitchen_test",
  password: process.env.POSTGRES_PASSWORD || "kitchen_test",
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function expectPgError(label, expectedCode, fn) {
  try {
    await fn();
  } catch (error) {
    if (error?.code !== expectedCode) {
      throw new Error(`${label}: expected PostgreSQL ${expectedCode}, got ${error?.code || "unknown"}: ${error?.message || error}`);
    }
    return;
  }
  throw new Error(`${label}: expected PostgreSQL ${expectedCode}`);
}

await client.connect();
try {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const { rows: backupRows } = await client.query(
    `insert into public.backup_history(backup_key,status,database_name,completed_at)
     values($1,'succeeded',$2,now()) returning id`,
    [`restore-lifecycle-${suffix}`, process.env.POSTGRES_DB || "kitchen_test"]
  );
  const backupId = backupRows[0].id;

  const { rows: runningRows } = await client.query(
    `insert into public.backup_restore_verifications(backup_id,status,target_environment)
     values($1,'running','ci-restore-lifecycle') returning id,status,completed_at`,
    [backupId]
  );
  const verificationId = runningRows[0].id;
  assert(runningRows[0].status === "running", "restore verification did not start as running");
  assert(runningRows[0].completed_at === null, "running restore verification must not have completed_at");

  await expectPgError("running verification cannot mutate without finalizing", "55000", () => client.query(
    `update public.backup_restore_verifications
     set metadata='{"progress":50}'::jsonb
     where id=$1`,
    [verificationId]
  ));

  const { rows: finalizedRows } = await client.query(
    `update public.backup_restore_verifications
     set status='succeeded',
         schema_version='013',
         row_checks='{"core":true}'::jsonb,
         checksum_verified=true,
         verified_by_name='DB Regression',
         completed_at=now(),
         metadata='{"source":"ci"}'::jsonb
     where id=$1
     returning status,completed_at,checksum_verified`,
    [verificationId]
  );
  assert(finalizedRows[0]?.status === "succeeded", "running restore verification did not finalize");
  assert(Boolean(finalizedRows[0]?.completed_at), "finalized restore verification is missing completed_at");
  assert(finalizedRows[0]?.checksum_verified === true, "finalized restore verification lost checksum evidence");

  await expectPgError("terminal restore verification cannot be rewritten", "55000", () => client.query(
    `update public.backup_restore_verifications
     set status='failed',error_message='rewritten history'
     where id=$1`,
    [verificationId]
  ));

  await expectPgError("terminal restore verification cannot be deleted", "55000", () => client.query(
    `delete from public.backup_restore_verifications where id=$1`,
    [verificationId]
  ));

  console.log("DATABASE_RESTORE_LIFECYCLE_REGRESSION_OK");
} finally {
  await client.end();
}
