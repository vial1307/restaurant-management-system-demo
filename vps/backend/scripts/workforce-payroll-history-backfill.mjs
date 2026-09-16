import crypto from "node:crypto";
import pg from "pg";

const { Client } = pg;
pg.types.setTypeParser(1082, (value) => value);

const APPLY = process.argv.includes("--apply");
const SITE_FILTER = (() => {
  const flag = process.argv.find((arg) => arg.startsWith("--site="));
  return flag ? flag.slice("--site=".length).trim() : "";
})();
const MIGRATION_KEY = "workforce.payroll-history.v1";
const MONTH_RE = /^\d{4}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalJson(value[key])]));
}

function checksum(value) {
  return crypto.createHash("sha256").update(JSON.stringify(canonicalJson(value))).digest("hex");
}

function validIso(value, { optional = false } = {}) {
  if ((value === null || value === undefined || text(value) === "") && optional) return null;
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function databaseTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  return validIso(value, { optional:true }) || text(value);
}

function uuidOrNull(value, knownUsers) {
  const raw = text(value);
  return UUID_RE.test(raw) && knownUsers.has(raw) ? raw : null;
}

function positiveInteger(value, fallback = null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInteger(value, fallback = null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function jsonEqual(left, right) {
  return JSON.stringify(canonicalJson(left)) === JSON.stringify(canonicalJson(right));
}

function periodSignature(row) {
  return canonicalJson({
    month:text(row.month),
    status:text(row.status),
    policySnapshot:row.policySnapshot ?? null,
    currentSnapshotRevision:Number(row.currentSnapshotRevision || 0),
    lockedAt:databaseTimestamp(row.lockedAt),
    lockedByUserId:row.lockedByUserId ? text(row.lockedByUserId) : null,
    lockedByName:row.lockedByName || null,
    reopenedAt:databaseTimestamp(row.reopenedAt),
    reopenedByUserId:row.reopenedByUserId ? text(row.reopenedByUserId) : null,
    reopenedByName:row.reopenedByName || null,
    reopenReason:row.reopenReason || null,
    version:Number(row.version || 1),
  });
}

function snapshotSignature(row) {
  return canonicalJson({
    revision:Number(row.revision),
    formulaVersion:Number(row.formulaVersion),
    currencyCode:text(row.currencyCode),
    lockedAt:databaseTimestamp(row.lockedAt),
    lockedByUserId:row.lockedByUserId ? text(row.lockedByUserId) : null,
    lockedByName:text(row.lockedByName),
    policySnapshot:row.policySnapshot,
    approvedAttendanceIds:array(row.approvedAttendanceIds).map(String).sort(),
    attendanceFacts:row.attendanceFacts,
    staffTotals:row.staffTotals,
    periodTotals:row.periodTotals,
    reopenMetadata:row.reopenMetadata ?? null,
  });
}

function differences(actualRows, expectedRows, keyOf, signatureOf) {
  const actual = new Map(actualRows.map((row) => [keyOf(row), signatureOf(row)]));
  const expected = new Map(expectedRows.map((row) => [keyOf(row), signatureOf(row)]));
  const keys = [...new Set([...actual.keys(), ...expected.keys()])].sort();
  const result = [];
  for (const key of keys) {
    const actualValue = actual.get(key);
    const expectedValue = expected.get(key);
    if (!actualValue || !expectedValue) {
      result.push({ key, fields:[actualValue ? "unexpected_database_row" : "missing_database_row"] });
      continue;
    }
    const fields = Object.keys(expectedValue).filter((field) => !jsonEqual(actualValue[field], expectedValue[field]));
    if (fields.length) result.push({ key, fields });
  }
  return result.slice(0, 25);
}

async function loadUsers(client) {
  const result = await client.query(`select id from public.app_users`);
  return new Set(result.rows.map((row) => text(row.id)));
}

async function loadAttendance(client, site) {
  const result = await client.query(
    `select id,legacy_attendance_id from public.attendance_records
     where site_code=$1 and legacy_attendance_id is not null`,
    [site]
  );
  return new Map(result.rows.map((row) => [text(row.legacy_attendance_id), text(row.id)]));
}

function mapAttendanceIds(ids, attendanceByLegacy, errors, context) {
  const mapped = [];
  const seen = new Set();
  for (const legacyIdValue of array(ids)) {
    const legacyId = text(legacyIdValue);
    if (!legacyId) {
      errors.push(`${context}:missing_attendance_id`);
      continue;
    }
    const relationalId = attendanceByLegacy.get(legacyId);
    if (!relationalId) {
      errors.push(`${context}:attendance_unresolved:${legacyId}`);
      continue;
    }
    if (seen.has(relationalId)) {
      errors.push(`${context}:duplicate_attendance_id:${legacyId}`);
      continue;
    }
    seen.add(relationalId);
    mapped.push(relationalId);
  }
  return mapped;
}

function inspectSnapshot(snapshot, { month, knownUsers, attendanceByLegacy, seenRevisions }) {
  const errors = [];
  const revision = positiveInteger(snapshot?.revision);
  const formulaVersion = positiveInteger(snapshot?.formulaVersion, 1);
  const snapshotMonth = text(snapshot?.month);
  const lockedAt = validIso(snapshot?.lockedAt);
  const lockedByName = text(snapshot?.lockedByName);
  const policySnapshot = snapshot?.policySnapshot;
  const attendanceFacts = snapshot?.attendanceRows;
  const staffTotals = snapshot?.staffRows;
  const periodTotals = snapshot?.totals;
  const currencyCode = text(snapshot?.currency || "TWD");
  const reopenMetadata = snapshot?.sourceReopen == null ? null : snapshot.sourceReopen;

  if (!revision) errors.push("invalid_revision");
  else if (seenRevisions.has(revision)) errors.push(`duplicate_revision:${revision}`);
  else seenRevisions.add(revision);
  if (snapshotMonth && snapshotMonth !== month) errors.push("month_mismatch");
  if (!lockedAt) errors.push("invalid_locked_at");
  if (!lockedByName) errors.push("locked_by_name_missing");
  if (!policySnapshot || typeof policySnapshot !== "object" || Array.isArray(policySnapshot)) errors.push("invalid_policy_snapshot");
  if (!Array.isArray(attendanceFacts)) errors.push("invalid_attendance_facts");
  if (!Array.isArray(staffTotals)) errors.push("invalid_staff_totals");
  if (!periodTotals || typeof periodTotals !== "object" || Array.isArray(periodTotals)) errors.push("invalid_period_totals");
  if (!/^[A-Z]{3}$/.test(currencyCode)) errors.push("invalid_currency");
  if (reopenMetadata !== null && (!reopenMetadata || typeof reopenMetadata !== "object" || Array.isArray(reopenMetadata))) {
    errors.push("invalid_reopen_metadata");
  }

  const approvedAttendanceIds = mapAttendanceIds(
    snapshot?.approvedAttendanceIds,
    attendanceByLegacy,
    errors,
    `revision_${revision || "invalid"}`
  );
  if (Array.isArray(snapshot?.attendanceRows)) {
    const factIds = snapshot.attendanceRows.map((row) => text(row?.attendanceId)).filter(Boolean).sort();
    const approvedLegacyIds = array(snapshot?.approvedAttendanceIds).map(text).filter(Boolean).sort();
    if (JSON.stringify(factIds) !== JSON.stringify(approvedLegacyIds)) errors.push("attendance_fact_ids_mismatch");
  }

  return {
    revision:revision || 0,
    formulaVersion,
    currencyCode,
    lockedAt,
    lockedByUserId:uuidOrNull(snapshot?.lockedByUserId, knownUsers),
    lockedByName,
    policySnapshot:policySnapshot && typeof policySnapshot === "object" && !Array.isArray(policySnapshot) ? structuredClone(policySnapshot) : {},
    approvedAttendanceIds,
    attendanceFacts:Array.isArray(attendanceFacts) ? structuredClone(attendanceFacts) : [],
    staffTotals:Array.isArray(staffTotals) ? structuredClone(staffTotals) : [],
    periodTotals:periodTotals && typeof periodTotals === "object" && !Array.isArray(periodTotals) ? structuredClone(periodTotals) : {},
    reopenMetadata:reopenMetadata === null ? null : structuredClone(reopenMetadata),
    errors,
  };
}

function inspectPeriod(monthKey, period, { knownUsers, attendanceByLegacy }) {
  const errors = [];
  const month = text(monthKey);
  const sourceMonth = text(period?.month);
  const status = text(period?.status);
  const history = array(period?.history);
  const seenRevisions = new Set();
  const snapshots = history.map((snapshot) => inspectSnapshot(snapshot, { month, knownUsers, attendanceByLegacy, seenRevisions }));
  const maxRevision = snapshots.reduce((max, snapshot) => Math.max(max, snapshot.revision), 0);
  const explicitCurrentRevision = period?.currentRevision === undefined || period?.currentRevision === null
    ? null
    : nonNegativeInteger(period.currentRevision);
  const currentSnapshotRevision = explicitCurrentRevision === null ? maxRevision : explicitCurrentRevision;
  const lockedAt = validIso(period?.lockedAt, { optional:true });
  const reopenedAt = validIso(period?.reopenedAt, { optional:true });
  const lockedByName = text(period?.lockedByName);
  const reopenedByName = text(period?.reopenedByName);
  const reopenReason = text(period?.reopenReason);
  const policySnapshot = period?.policySnapshot == null ? null : period.policySnapshot;

  if (!MONTH_RE.test(month)) errors.push("invalid_month_key");
  if (sourceMonth && sourceMonth !== month) errors.push("month_mismatch");
  if (!["open", "locked"].includes(status)) errors.push("invalid_status");
  if (!Array.isArray(period?.history)) errors.push("history_missing");
  if (snapshots.some((snapshot) => snapshot.errors.length)) errors.push("invalid_snapshot_history");
  if (explicitCurrentRevision === null && period?.currentRevision !== undefined && period?.currentRevision !== null) errors.push("invalid_current_revision");
  if (currentSnapshotRevision !== maxRevision) errors.push("current_revision_mismatch");
  if (maxRevision !== history.length && history.length > 0) errors.push("non_contiguous_revisions");
  if (status === "locked" && maxRevision < 1) errors.push("locked_period_without_snapshot");
  if (status === "locked" && !lockedAt) errors.push("locked_at_missing");
  if (status === "locked" && !lockedByName) errors.push("locked_by_name_missing");
  if (period?.lockedAt && !lockedAt) errors.push("invalid_locked_at");
  if (period?.reopenedAt && !reopenedAt) errors.push("invalid_reopened_at");
  if (reopenedAt && !reopenReason) errors.push("reopen_reason_missing");
  if (reopenedAt && !reopenedByName) errors.push("reopened_by_name_missing");
  if (policySnapshot !== null && (!policySnapshot || typeof policySnapshot !== "object" || Array.isArray(policySnapshot))) errors.push("invalid_policy_snapshot");

  if (status === "locked" && maxRevision > 0) {
    const latest = snapshots.find((snapshot) => snapshot.revision === maxRevision);
    if (latest) {
      if (lockedAt && latest.lockedAt && lockedAt !== latest.lockedAt) errors.push("locked_at_snapshot_mismatch");
      if (lockedByName && latest.lockedByName && lockedByName !== latest.lockedByName) errors.push("locked_actor_snapshot_mismatch");
      if (policySnapshot && !jsonEqual(policySnapshot, latest.policySnapshot)) errors.push("policy_snapshot_mismatch");
    }
  }

  return {
    month,
    status:["open", "locked"].includes(status) ? status : "open",
    policySnapshot:policySnapshot && typeof policySnapshot === "object" && !Array.isArray(policySnapshot) ? structuredClone(policySnapshot) : null,
    currentSnapshotRevision,
    lockedAt,
    lockedByUserId:uuidOrNull(period?.lockedByUserId, knownUsers),
    lockedByName:lockedByName || null,
    reopenedAt,
    reopenedByUserId:uuidOrNull(period?.reopenedByUserId, knownUsers),
    reopenedByName:reopenedByName || null,
    reopenReason:reopenReason || null,
    version:1,
    snapshots,
    errors:[...errors, ...snapshots.flatMap((snapshot) => snapshot.errors.map((error) => `snapshot_${snapshot.revision || "invalid"}:${error}`))],
  };
}

function sourceProjection(site, revision, periods) {
  return { site, revision, periods };
}

async function inspectSite(client, state, knownUsers) {
  const site = text(state.site);
  const attendanceByLegacy = await loadAttendance(client, site);
  const payroll = object(object(state.modules).attendance?.payroll);
  const periodsObject = object(payroll.periods);
  const periods = Object.entries(periodsObject)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, period]) => inspectPeriod(month, object(period), { knownUsers, attendanceByLegacy }));
  const invalidPeriods = periods.filter((period) => period.errors.length).map((period) => ({ month:period.month, errors:period.errors }));
  return {
    site,
    sourceRevision:Number(state.module_revision || 0),
    checksum:checksum(sourceProjection(site, Number(state.module_revision || 0), periodsObject)),
    periods,
    diagnostics:{ invalidPeriods, blocking:invalidPeriods.length },
  };
}

async function readTargetPeriods(client, plan) {
  const months = plan.periods.map((period) => `${period.month}-01`);
  if (!months.length) return [];
  const result = await client.query(
    `select
       id,
       to_char(payroll_month,'YYYY-MM') as month,
       status,
       policy_snapshot as "policySnapshot",
       current_snapshot_revision as "currentSnapshotRevision",
       locked_at as "lockedAt",
       locked_by_user_id as "lockedByUserId",
       locked_by_name as "lockedByName",
       reopened_at as "reopenedAt",
       reopened_by_user_id as "reopenedByUserId",
       reopened_by_name as "reopenedByName",
       reopen_reason as "reopenReason",
       version
     from public.payroll_periods
     where site_code=$1 and payroll_month = any($2::date[])
     order by payroll_month`,
    [plan.site, months]
  );
  return result.rows;
}

async function readTargetSnapshots(client, plan) {
  if (!plan.periods.length) return [];
  const result = await client.query(
    `select
       to_char(p.payroll_month,'YYYY-MM') as month,
       s.revision,
       s.formula_version as "formulaVersion",
       s.currency_code as "currencyCode",
       s.locked_at as "lockedAt",
       s.locked_by_user_id as "lockedByUserId",
       s.locked_by_name as "lockedByName",
       s.policy_snapshot as "policySnapshot",
       s.approved_attendance_ids as "approvedAttendanceIds",
       s.attendance_facts as "attendanceFacts",
       s.staff_totals as "staffTotals",
       s.period_totals as "periodTotals",
       s.reopen_metadata as "reopenMetadata"
     from public.payroll_snapshots s
     join public.payroll_periods p on p.id=s.payroll_period_id
     where p.site_code=$1 and to_char(p.payroll_month,'YYYY-MM') = any($2::text[])
     order by p.payroll_month,s.revision`,
    [plan.site, plan.periods.map((period) => period.month)]
  );
  return result.rows;
}

function expectedSnapshots(plan) {
  return plan.periods.flatMap((period) => period.snapshots.map((snapshot) => ({ month:period.month, ...snapshot })));
}

function targetDiffs(actualPeriods, actualSnapshots, plan) {
  const periodDiffs = differences(
    actualPeriods,
    plan.periods,
    (row) => text(row.month),
    periodSignature
  );
  const snapshotDiffs = differences(
    actualSnapshots,
    expectedSnapshots(plan),
    (row) => `${text(row.month)}#${Number(row.revision)}`,
    snapshotSignature
  );
  return { periodDiffs, snapshotDiffs };
}

async function upsertCheckpoint(client, plan, status, rowsWritten, extra = {}) {
  await client.query(
    `insert into public.data_migration_checkpoints(
       migration_key,site_code,source_revision,status,rows_read,rows_written,checksum,details,
       started_at,completed_at,updated_at
     ) values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,now(),case when $4 in ('verified','completed','failed') then now() else null end,now())
     on conflict (migration_key,coalesce(site_code,'__global__'))
     do update set
       source_revision=excluded.source_revision,
       status=excluded.status,
       rows_read=excluded.rows_read,
       rows_written=excluded.rows_written,
       checksum=excluded.checksum,
       details=excluded.details,
       started_at=coalesce(public.data_migration_checkpoints.started_at,excluded.started_at),
       completed_at=excluded.completed_at,
       updated_at=now()`,
    [
      MIGRATION_KEY,
      plan.site,
      plan.sourceRevision,
      status,
      plan.periods.length + expectedSnapshots(plan).length,
      rowsWritten,
      plan.checksum,
      JSON.stringify({ authority:"business_state", targets:["payroll_periods","payroll_snapshots"], ...extra }),
    ]
  );
}

async function applySite(client, plan) {
  let rowsWritten = 0;
  for (const period of plan.periods) {
    const periodResult = await client.query(
      `insert into public.payroll_periods(
         site_code,payroll_month,status,policy_snapshot,current_snapshot_revision,
         locked_at,locked_by_user_id,locked_by_name,reopened_at,reopened_by_user_id,
         reopened_by_name,reopen_reason,version
       ) values($1,$2::date,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       on conflict (site_code,payroll_month)
       do update set
         status=excluded.status,
         policy_snapshot=excluded.policy_snapshot,
         current_snapshot_revision=excluded.current_snapshot_revision,
         locked_at=excluded.locked_at,
         locked_by_user_id=excluded.locked_by_user_id,
         locked_by_name=excluded.locked_by_name,
         reopened_at=excluded.reopened_at,
         reopened_by_user_id=excluded.reopened_by_user_id,
         reopened_by_name=excluded.reopened_by_name,
         reopen_reason=excluded.reopen_reason,
         version=excluded.version,
         updated_at=now()
       returning id`,
      [
        plan.site,
        `${period.month}-01`,
        period.status,
        period.policySnapshot === null ? null : JSON.stringify(period.policySnapshot),
        period.currentSnapshotRevision,
        period.lockedAt,
        period.lockedByUserId,
        period.lockedByName,
        period.reopenedAt,
        period.reopenedByUserId,
        period.reopenedByName,
        period.reopenReason,
        period.version,
      ]
    );
    rowsWritten += 1;
    const payrollPeriodId = periodResult.rows[0].id;

    for (const snapshot of period.snapshots) {
      const inserted = await client.query(
        `insert into public.payroll_snapshots(
           payroll_period_id,revision,formula_version,currency_code,locked_at,locked_by_user_id,
           locked_by_name,policy_snapshot,approved_attendance_ids,attendance_facts,staff_totals,
           period_totals,reopen_metadata
         ) values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::uuid[],$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb)
         on conflict (payroll_period_id,revision) do nothing
         returning id`,
        [
          payrollPeriodId,
          snapshot.revision,
          snapshot.formulaVersion,
          snapshot.currencyCode,
          snapshot.lockedAt,
          snapshot.lockedByUserId,
          snapshot.lockedByName,
          JSON.stringify(snapshot.policySnapshot),
          snapshot.approvedAttendanceIds,
          JSON.stringify(snapshot.attendanceFacts),
          JSON.stringify(snapshot.staffTotals),
          JSON.stringify(snapshot.periodTotals),
          snapshot.reopenMetadata === null ? null : JSON.stringify(snapshot.reopenMetadata),
        ]
      );
      rowsWritten += inserted.rowCount;
    }
  }

  const actualPeriods = await readTargetPeriods(client, plan);
  const actualSnapshots = await readTargetSnapshots(client, plan);
  const diff = targetDiffs(actualPeriods, actualSnapshots, plan);
  if (diff.periodDiffs.length || diff.snapshotDiffs.length) {
    throw new Error(`WORKFORCE_PAYROLL_HISTORY_VERIFY_MISMATCH:${plan.site}:${JSON.stringify(diff)}`);
  }
  await upsertCheckpoint(client, plan, "verified", rowsWritten, {
    periodRows:actualPeriods.length,
    snapshotRows:actualSnapshots.length,
    periodDiffs:[],
    snapshotDiffs:[],
  });
  return { rowsWritten, periodRows:actualPeriods.length, snapshotRows:actualSnapshots.length };
}

const client = new Client({
  host:process.env.DB_HOST || "127.0.0.1",
  port:Number(process.env.DB_PORT || 5432),
  database:process.env.POSTGRES_DB || process.env.DB_NAME || "kitchen",
  user:process.env.POSTGRES_USER || process.env.DB_USER || "kitchen",
  password:process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD || "",
});

await client.connect();
try {
  const knownUsers = await loadUsers(client);
  const states = await client.query(
    `select b.site,b.modules,coalesce((b.module_revisions->>'attendance')::bigint,0) as module_revision
     from public.business_state b
     join public.sites s on s.code=b.site and s.active=true
     where ($1::text='' or b.site=$1)
     order by b.site`,
    [SITE_FILTER]
  );

  const report = [];
  for (const state of states.rows) {
    const plan = await inspectSite(client, state, knownUsers);
    const actualPeriods = await readTargetPeriods(client, plan);
    const actualSnapshots = await readTargetSnapshots(client, plan);
    const diff = targetDiffs(actualPeriods, actualSnapshots, plan);

    if (!APPLY) {
      report.push({
        site:plan.site,
        mode:"verify-only",
        sourceRevision:plan.sourceRevision,
        periods:plan.periods.length,
        snapshots:expectedSnapshots(plan).length,
        diagnostics:plan.diagnostics,
        relationalPeriods:actualPeriods.length,
        relationalSnapshots:actualSnapshots.length,
        relationalMatch:diff.periodDiffs.length === 0 && diff.snapshotDiffs.length === 0
          && actualPeriods.length === plan.periods.length
          && actualSnapshots.length === expectedSnapshots(plan).length,
        ...diff,
        checksum:plan.checksum,
      });
      if (plan.diagnostics.blocking > 0) {
        throw new Error(`WORKFORCE_PAYROLL_HISTORY_BLOCKED:${plan.site}:${JSON.stringify(plan.diagnostics)}`);
      }
      continue;
    }

    if (plan.diagnostics.blocking > 0) {
      throw new Error(`WORKFORCE_PAYROLL_HISTORY_BLOCKED:${plan.site}:${JSON.stringify(plan.diagnostics)}`);
    }

    await client.query("begin");
    try {
      await upsertCheckpoint(client, plan, "running", 0, { diagnostics:plan.diagnostics });
      const result = await applySite(client, plan);
      await client.query("commit");
      report.push({
        site:plan.site,
        mode:"apply",
        sourceRevision:plan.sourceRevision,
        periods:plan.periods.length,
        snapshots:expectedSnapshots(plan).length,
        diagnostics:plan.diagnostics,
        checksum:plan.checksum,
        ...result,
      });
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }

  console.log(JSON.stringify({ migrationKey:MIGRATION_KEY, apply:APPLY, sites:report }, null, 2));
  console.log(APPLY ? "WORKFORCE_PAYROLL_HISTORY_BACKFILL_OK" : "WORKFORCE_PAYROLL_HISTORY_BACKFILL_VERIFY_OK");
} finally {
  await client.end();
}
