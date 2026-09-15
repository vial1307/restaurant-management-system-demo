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
    if (expectedCode && error?.code !== expectedCode) {
      throw new Error(`${label}: expected PostgreSQL ${expectedCode}, got ${error?.code || "unknown"}: ${error?.message || error}`);
    }
    return;
  }
  throw new Error(`${label}: expected PostgreSQL error ${expectedCode || ""}`);
}

const requiredTables = [
  "sites",
  "organization_departments",
  "staff_members",
  "user_staff_bindings",
  "site_settings",
  "system_settings",
  "data_migration_checkpoints",
  "system_jobs",
  "backup_history",
  "workforce_schedule_entries",
  "workforce_schedule_publications",
  "workforce_schedule_publication_entries",
  "workforce_schedule_requests",
  "workforce_schedule_exceptions",
  "attendance_records",
  "attendance_corrections",
  "payroll_policies",
  "payroll_periods",
  "payroll_snapshots",
  "reservation_bookings",
  "preparation_task_templates",
  "preparation_tasks",
  "suppliers",
  "supplier_site_rules",
  "supplier_delivery_days",
  "procurement_catalog_rules",
  "procurement_orders",
  "procurement_order_lines",
  "menu_items",
  "sop_documents",
  "sop_versions",
  "sop_steps",
  "skill_definitions",
  "staff_skill_assessments",
  "staff_sop_training",
  "remote_job_templates",
  "remote_job_runs",
];

await client.connect();
try {
  for (const table of requiredTables) {
    const { rows } = await client.query("select to_regclass($1) as relation", [`public.${table}`]);
    assert(rows[0]?.relation === table || rows[0]?.relation === `public.${table}`, `missing public.${table}`);
  }

  const { rows: siteRows } = await client.query(
    "select code from public.sites where code in ('central','fuxing','yongji') order by code"
  );
  assert(siteRows.map((row) => row.code).join(",") === "central,fuxing,yongji", "current sites were not seeded");

  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const staffCode = `dbv2-${suffix}`;
  const { rows: staffRows } = await client.query(
    `insert into public.staff_members(site_code,staff_code,display_name,department_code,employment_type,hourly_rate)
     values('fuxing',$1,'DB V2 Regression','inside','parttime',230)
     returning id`,
    [staffCode]
  );
  const staffId = staffRows[0].id;

  await expectPgError("negative hourly rate", "23514", () => client.query(
    `insert into public.staff_members(site_code,staff_code,display_name,employment_type,hourly_rate)
     values('fuxing',$1,'Invalid rate','parttime',-1)`,
    [`invalid-${suffix}`]
  ));

  const { rows: scheduleRows } = await client.query(
    `insert into public.workforce_schedule_entries(
       site_code,staff_id,schedule_kind,service_date,slot_no,shift_type,start_time,end_time,department_code
     ) values('fuxing',$1,'date','2026-09-20',1,'custom','17:00','23:59','inside')
     returning id`,
    [staffId]
  );
  const scheduleId = scheduleRows[0].id;

  await expectPgError("cross-site staff schedule", "23503", () => client.query(
    `insert into public.workforce_schedule_entries(
       site_code,staff_id,schedule_kind,service_date,slot_no,shift_type,start_time,end_time
     ) values('yongji',$1,'date','2026-09-20',1,'custom','17:00','23:59')`,
    [staffId]
  ));

  await expectPgError("duplicate active schedule slot", "23505", () => client.query(
    `insert into public.workforce_schedule_entries(
       site_code,staff_id,schedule_kind,service_date,slot_no,shift_type,start_time,end_time
     ) values('fuxing',$1,'date','2026-09-20',1,'custom','18:00','23:00')`,
    [staffId]
  ));

  const { rows: attendanceRows } = await client.query(
    `insert into public.attendance_records(
       site_code,staff_id,service_date,clock_in_at,scheduled_start_at,hourly_rate,source,source_schedule_entry_id
     ) values('fuxing',$1,'2026-09-20','2026-09-20T17:00:00+08','2026-09-20T17:00:00+08',230,'manager',$2)
     returning id`,
    [staffId,scheduleId]
  );
  const attendanceId = attendanceRows[0].id;

  await expectPgError("multiple open attendance rows", "23505", () => client.query(
    `insert into public.attendance_records(site_code,staff_id,service_date,clock_in_at,hourly_rate,source)
     values('fuxing',$1,'2026-09-20','2026-09-20T18:00:00+08',230,'manager')`,
    [staffId]
  ));

  await client.query(
    `insert into public.attendance_corrections(attendance_id,reason,before_data,after_data,corrected_by_name)
     values($1,'Regression correction','{}'::jsonb,'{"breakMinutes":30}'::jsonb,'DB Regression')`,
    [attendanceId]
  );
  await expectPgError("attendance correction immutability", "55000", () => client.query(
    `update public.attendance_corrections set reason='mutated' where attendance_id=$1`,
    [attendanceId]
  ));

  const { rows: periodRows } = await client.query(
    `insert into public.payroll_periods(site_code,payroll_month,status)
     values('fuxing','2026-09-01','open') returning id`,
  );
  const periodId = periodRows[0].id;
  const { rows: snapshotRows } = await client.query(
    `insert into public.payroll_snapshots(
       payroll_period_id,revision,formula_version,currency_code,locked_at,locked_by_name,
       policy_snapshot,approved_attendance_ids,attendance_facts,staff_totals,period_totals
     ) values($1,1,1,'TWD',now(),'DB Regression','{}'::jsonb,'{}'::uuid[],'[]'::jsonb,'[]'::jsonb,'{}'::jsonb)
     returning id`,
    [periodId]
  );
  await expectPgError("payroll snapshot immutability", "55000", () => client.query(
    `update public.payroll_snapshots set formula_version=2 where id=$1`,
    [snapshotRows[0].id]
  ));

  const menuCode = `menu-${suffix}`;
  const { rows: menuRows } = await client.query(
    `insert into public.menu_items(site_code,item_code,name_vi,name_zh_tw,work_area)
     values('fuxing',$1,'Món test','測試品項','noodles') returning id`,
    [menuCode]
  );
  const { rows: documentRows } = await client.query(
    `insert into public.sop_documents(site_code,sop_code,menu_item_id,work_area,name_vi,name_zh_tw)
     values('fuxing',$1,$2,'noodles','SOP test','測試SOP') returning id`,
    [`sop-${suffix}`,menuRows[0].id]
  );
  const { rows: versionRows } = await client.query(
    `insert into public.sop_versions(document_id,version_no,status,created_at)
     values($1,1,'draft',now()) returning id`,
    [documentRows[0].id]
  );
  const sopVersionId = versionRows[0].id;
  const { rows: stepRows } = await client.query(
    `insert into public.sop_steps(sop_version_id,step_no,instruction_vi,instruction_zh_tw)
     values($1,1,'Bước test','測試步驟') returning id`,
    [sopVersionId]
  );
  await client.query(
    `update public.sop_versions
     set status='approved',approved_at=now(),approved_by_name='DB Regression'
     where id=$1`,
    [sopVersionId]
  );
  await expectPgError("approved SOP version immutability", "55000", () => client.query(
    `update public.sop_versions set revision_note='mutated' where id=$1`,
    [sopVersionId]
  ));
  await expectPgError("approved SOP step immutability", "55000", () => client.query(
    `update public.sop_steps set instruction_vi='mutated' where id=$1`,
    [stepRows[0].id]
  ));

  const { rows: migrationRows } = await client.query(
    `select version from public.schema_migrations where version in ('010','011','012') order by version`
  );
  assert(migrationRows.map((row) => row.version).join(",") === "010,011,012", "core v2 migrations were not recorded");

  console.log("DATABASE_CORE_V2_REGRESSION_OK");
} finally {
  await client.end();
}
