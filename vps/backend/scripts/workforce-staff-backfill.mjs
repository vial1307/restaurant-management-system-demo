import crypto from "node:crypto";
import pg from "pg";

const { Client } = pg;
const APPLY = process.argv.includes("--apply");
const SITE_FILTER = (() => {
  const flag = process.argv.find((arg) => arg.startsWith("--site="));
  return flag ? flag.slice("--site=".length).trim() : "";
})();
const MIGRATION_KEY = "workforce.staff.v1";

function text(value) {
  return String(value ?? "").trim();
}

function identity(value) {
  return text(value).toLocaleLowerCase("en-US");
}

function jsonObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function stableStaffCode(site, legacyId) {
  const raw = text(legacyId);
  if (/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(raw)) return raw;
  const digest = crypto.createHash("sha256").update(`${site}:${raw}`).digest("hex").slice(0, 16);
  return `legacy-${digest}`;
}

function employmentType(member) {
  const explicit = identity(member?.employmentType || member?.employment_type);
  if (["fulltime", "parttime", "contract", "intern", "other"].includes(explicit)) return explicit;
  const role = identity(member?.role);
  if (role === "parttime") return "parttime";
  if (role === "intern") return "intern";
  return "other";
}

function safeRate(value) {
  const rate = Number(value);
  return Number.isFinite(rate) && rate >= 0 ? rate : 0;
}

function rosterFromModules(modules) {
  return Array.isArray(modules?.shared?.staff)
    ? modules.shared.staff.filter((member) => member && text(member.id))
    : [];
}

function checksumRoster(site, roster) {
  const normalized = roster
    .map((member) => ({
      id:text(member.id),
      name:text(member.name),
      role:text(member.role),
      area:text(member.area),
      department:text(member.department || member.departmentCode || member.department_code),
      employmentType:employmentType(member),
      hourlyRate:safeRate(member.hourlyRate ?? member.hourly_rate),
      active:member.active !== false,
      accountUserId:text(member.accountUserId || member.account_user_id || member.userId || member.user_id),
      accountUsername:identity(member.accountUsername || member.account_username),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return crypto.createHash("sha256").update(JSON.stringify({ site, normalized })).digest("hex");
}

async function activeDepartmentCodes(client, site) {
  const result = await client.query(
    `select code from public.organization_departments where site_code=$1 and active=true`,
    [site]
  );
  return new Set(result.rows.map((row) => row.code));
}

function departmentFor(member, allowed) {
  const value = text(member?.department || member?.departmentCode || member?.department_code);
  return allowed.has(value) ? value : null;
}

async function candidateUsers(client, site) {
  const result = await client.query(
    `select u.id,u.username,u.display_name,u.role,u.location
     from public.app_users u
     where u.active=true
       and (u.location=$1 or u.location='all')
     order by u.username`,
    [site]
  );
  return result.rows;
}

function resolveBinding(member, users, claimedUserIds) {
  const explicitUserId = text(member?.accountUserId || member?.account_user_id || member?.userId || member?.user_id);
  const explicitUsername = identity(member?.accountUsername || member?.account_username);

  let matches = [];
  if (explicitUserId) matches = users.filter((user) => String(user.id) === explicitUserId);
  else if (explicitUsername) matches = users.filter((user) => identity(user.username) === explicitUsername);
  else {
    const name = identity(member?.name);
    if (name) matches = users.filter((user) => identity(user.display_name) === name);
  }

  matches = matches.filter((user) => !claimedUserIds.has(String(user.id)));
  return matches.length === 1 ? matches[0] : null;
}

async function upsertCheckpoint(client, { site, sourceRevision, status, rowsRead, rowsWritten, checksum, details }) {
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
    [MIGRATION_KEY, site, sourceRevision, status, rowsRead, rowsWritten, checksum, JSON.stringify(details)]
  );
}

async function inspectSite(client, row) {
  const site = row.site;
  const modules = jsonObject(row.modules);
  const roster = rosterFromModules(modules);
  const checksum = checksumRoster(site, roster);
  const departments = await activeDepartmentCodes(client, site);
  const users = await candidateUsers(client, site);
  const claimed = new Set();
  const planned = [];

  for (const member of roster) {
    const binding = resolveBinding(member, users, claimed);
    if (binding) claimed.add(String(binding.id));
    planned.push({
      legacyStaffId:text(member.id),
      staffCode:stableStaffCode(site, member.id),
      displayName:text(member.name) || text(member.id),
      departmentCode:departmentFor(member, departments),
      employmentType:employmentType(member),
      workArea:text(member.area) || null,
      hourlyRate:safeRate(member.hourlyRate ?? member.hourly_rate),
      active:member.active !== false,
      bindingUserId:binding?.id || null,
      bindingUsername:binding?.username || null,
    });
  }

  return { site, sourceRevision:Number(row.module_revision || 0), roster, checksum, planned };
}

async function applySite(client, plan) {
  let staffWritten = 0;
  let bindingsWritten = 0;
  const staffIds = new Map();

  for (const member of plan.planned) {
    const result = await client.query(
      `insert into public.staff_members(
         site_code,staff_code,legacy_staff_id,display_name,department_code,employment_type,
         default_work_area,hourly_rate,active,metadata
       ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
       on conflict (site_code,staff_code)
       do update set
         legacy_staff_id=excluded.legacy_staff_id,
         display_name=excluded.display_name,
         department_code=excluded.department_code,
         employment_type=excluded.employment_type,
         default_work_area=excluded.default_work_area,
         hourly_rate=excluded.hourly_rate,
         active=excluded.active,
         metadata=public.staff_members.metadata || excluded.metadata,
         updated_at=now()
       returning id`,
      [
        plan.site,
        member.staffCode,
        member.legacyStaffId,
        member.displayName,
        member.departmentCode,
        member.employmentType,
        member.workArea,
        member.hourlyRate,
        member.active,
        JSON.stringify({ migratedFrom:"business_state.shared.staff", legacyRole:plan.roster.find((row) => text(row.id) === member.legacyStaffId)?.role || null }),
      ]
    );
    staffIds.set(member.legacyStaffId, result.rows[0].id);
    staffWritten += 1;
  }

  for (const member of plan.planned) {
    if (!member.bindingUserId) continue;
    const staffId = staffIds.get(member.legacyStaffId);
    const conflict = await client.query(
      `select user_id,staff_id from public.user_staff_bindings
       where user_id=$1 or staff_id=$2`,
      [member.bindingUserId, staffId]
    );
    const incompatible = conflict.rows.some((row) => String(row.user_id) !== String(member.bindingUserId) || String(row.staff_id) !== String(staffId));
    if (incompatible) {
      throw new Error(`WORKFORCE_BINDING_CONFLICT:${plan.site}:${member.legacyStaffId}:${member.bindingUsername || member.bindingUserId}`);
    }
    await client.query(
      `insert into public.user_staff_bindings(user_id,staff_id)
       values($1,$2)
       on conflict (user_id) do update set staff_id=excluded.staff_id,updated_at=now()`,
      [member.bindingUserId, staffId]
    );
    bindingsWritten += 1;
  }

  const count = await client.query(
    `select count(*)::int as count from public.staff_members where site_code=$1 and legacy_staff_id is not null`,
    [plan.site]
  );
  if (Number(count.rows[0]?.count || 0) < plan.roster.length) {
    throw new Error(`WORKFORCE_STAFF_BACKFILL_COUNT_MISMATCH:${plan.site}`);
  }

  await upsertCheckpoint(client, {
    site:plan.site,
    sourceRevision:plan.sourceRevision,
    status:"verified",
    rowsRead:plan.roster.length,
    rowsWritten:staffWritten,
    checksum:plan.checksum,
    details:{ staffWritten, bindingsWritten, authority:"business_state", target:"staff_members" },
  });

  return { staffWritten, bindingsWritten };
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
  const states = await client.query(
    `select b.site,b.modules,coalesce((b.module_revisions->>'shared')::bigint,0) as module_revision
     from public.business_state b
     join public.sites s on s.code=b.site and s.active=true
     where ($1::text='' or b.site=$1)
     order by b.site`,
    [SITE_FILTER]
  );

  const report = [];
  for (const row of states.rows) {
    const plan = await inspectSite(client, row);
    if (!APPLY) {
      report.push({
        site:plan.site,
        mode:"verify-only",
        sourceRevision:plan.sourceRevision,
        rosterRows:plan.roster.length,
        bindableRows:plan.planned.filter((member) => member.bindingUserId).length,
        checksum:plan.checksum,
      });
      continue;
    }

    await client.query("begin");
    try {
      await upsertCheckpoint(client, {
        site:plan.site,
        sourceRevision:plan.sourceRevision,
        status:"running",
        rowsRead:plan.roster.length,
        rowsWritten:0,
        checksum:plan.checksum,
        details:{ authority:"business_state", target:"staff_members" },
      });
      const result = await applySite(client, plan);
      await client.query("commit");
      report.push({ site:plan.site, mode:"apply", sourceRevision:plan.sourceRevision, checksum:plan.checksum, ...result });
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }

  console.log(JSON.stringify({ migrationKey:MIGRATION_KEY, apply:APPLY, sites:report }, null, 2));
  console.log(APPLY ? "WORKFORCE_STAFF_BACKFILL_OK" : "WORKFORCE_STAFF_BACKFILL_VERIFY_OK");
} finally {
  await client.end();
}
