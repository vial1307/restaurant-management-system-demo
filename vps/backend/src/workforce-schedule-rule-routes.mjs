import { withTransaction } from "./db.mjs";
import { hasPermission, requireUser, siteAllowed } from "./auth.mjs";

const VALID_SITES = new Set(["central", "fuxing", "yongji"]);
const SHIFT_IDS = ["morning", "evening", "full"];

export const DEFAULT_SCHEDULE_RULES = Object.freeze({
  version:0,
  updatedAt:null,
  updatedByUserId:"",
  updatedByName:"",
  shifts:{
    morning:{ start:"10:00", end:"16:00" },
    evening:{ start:"16:00", end:"22:00" },
    full:{ start:"10:00", end:"22:00" },
  },
  staffingBands:[
    { minTables:0, maxTables:3, requiredInside:2, fixedAreas:false, needsReview:true },
    { minTables:4, maxTables:6, requiredInside:3, fixedAreas:false, needsReview:false },
    { minTables:7, maxTables:12, requiredInside:4, fixedAreas:true, needsReview:false },
    { minTables:13, maxTables:null, requiredInside:4, fixedAreas:true, needsReview:true },
  ],
});

function text(value) {
  return String(value ?? "").trim();
}

function validTime(value) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(text(value));
}

function actorName(user) {
  return text(user?.display_name || user?.displayName || user?.username || "manager");
}

function canManageSchedule(user) {
  return Boolean(
    user
    && ["admin", "manager"].includes(String(user.role || ""))
    && hasPermission(user, "schedule", "edit")
  );
}

function scheduleModule(modules = {}) {
  const input = modules?.schedule && typeof modules.schedule === "object" && !Array.isArray(modules.schedule)
    ? structuredClone(modules.schedule)
    : {};
  if (!Array.isArray(input.schedules)) input.schedules = [];
  if (!Array.isArray(input.requests)) input.requests = [];
  if (!Array.isArray(input.exceptions)) input.exceptions = [];
  return input;
}

function currentModuleRevision(revisions = {}) {
  const value = Number(revisions?.schedule);
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function canonicalRuleValue(rules) {
  return {
    shifts:Object.fromEntries(SHIFT_IDS.map((id) => [id, {
      start:text(rules?.shifts?.[id]?.start),
      end:text(rules?.shifts?.[id]?.end),
    }])),
    staffingBands:Array.isArray(rules?.staffingBands)
      ? rules.staffingBands.map((band) => ({
          minTables:band?.minTables,
          maxTables:band?.maxTables === null ? null : band?.maxTables,
          requiredInside:band?.requiredInside,
          fixedAreas:band?.fixedAreas,
          needsReview:band?.needsReview,
        }))
      : [],
  };
}

function defaultRuleValue() {
  return canonicalRuleValue(DEFAULT_SCHEDULE_RULES);
}

function validateRuleValue(value) {
  const shifts = value?.shifts;
  if (!shifts || typeof shifts !== "object" || Array.isArray(shifts)) {
    return { ok:false, error:"WORKFORCE_SCHEDULE_RULE_SHIFTS_INVALID" };
  }
  for (const id of SHIFT_IDS) {
    const shift = shifts[id];
    if (!shift || typeof shift !== "object" || Array.isArray(shift)) {
      return { ok:false, error:"WORKFORCE_SCHEDULE_RULE_SHIFTS_INVALID" };
    }
    if (!validTime(shift.start) || !validTime(shift.end) || text(shift.start) === text(shift.end)) {
      return { ok:false, error:"WORKFORCE_SCHEDULE_RULE_TIME_INVALID" };
    }
  }

  const bands = value?.staffingBands;
  if (!Array.isArray(bands) || bands.length !== 4) {
    return { ok:false, error:"WORKFORCE_SCHEDULE_RULE_BANDS_INVALID" };
  }
  for (let index = 0; index < bands.length; index += 1) {
    const band = bands[index];
    if (!band || typeof band !== "object" || Array.isArray(band)) {
      return { ok:false, error:"WORKFORCE_SCHEDULE_RULE_BANDS_INVALID" };
    }
    const { minTables, maxTables, requiredInside } = band;
    if (!Number.isInteger(minTables) || minTables < 0) {
      return { ok:false, error:"WORKFORCE_SCHEDULE_RULE_BANDS_INVALID" };
    }
    if (index === 0 && minTables !== 0) {
      return { ok:false, error:"WORKFORCE_SCHEDULE_RULE_BANDS_INVALID" };
    }
    if (index < bands.length - 1) {
      if (!Number.isInteger(maxTables) || maxTables < minTables) {
        return { ok:false, error:"WORKFORCE_SCHEDULE_RULE_BANDS_INVALID" };
      }
    } else if (maxTables !== null) {
      return { ok:false, error:"WORKFORCE_SCHEDULE_RULE_BANDS_INVALID" };
    }
    if (!Number.isInteger(requiredInside) || requiredInside < 1 || requiredInside > 20) {
      return { ok:false, error:"WORKFORCE_SCHEDULE_RULE_BANDS_INVALID" };
    }
    if (typeof band.fixedAreas !== "boolean" || typeof band.needsReview !== "boolean") {
      return { ok:false, error:"WORKFORCE_SCHEDULE_RULE_BANDS_INVALID" };
    }
    if (index > 0) {
      const priorMax = bands[index - 1]?.maxTables;
      if (!Number.isInteger(priorMax) || minTables !== priorMax + 1) {
        return { ok:false, error:"WORKFORCE_SCHEDULE_RULE_BANDS_INVALID" };
      }
    }
  }
  return { ok:true };
}

function normalizedStoredRules(input) {
  const fallback = defaultRuleValue();
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ...fallback, version:0, updatedAt:null, updatedByUserId:"", updatedByName:"" };
  }
  const candidate = canonicalRuleValue(input);
  if (!validateRuleValue(candidate).ok) {
    return { ...fallback, version:0, updatedAt:null, updatedByUserId:"", updatedByName:"" };
  }
  return {
    ...candidate,
    version:Math.max(0, Number(input.version) || 0),
    updatedAt:input.updatedAt || null,
    updatedByUserId:text(input.updatedByUserId),
    updatedByName:text(input.updatedByName),
  };
}

function equalRuleValue(left, right) {
  return JSON.stringify(canonicalRuleValue(left)) === JSON.stringify(canonicalRuleValue(right));
}

function equalSchedules(left, right) {
  const a = Array.isArray(left) ? left : [];
  const b = Array.isArray(right) ? right : [];
  try { return JSON.stringify(a) === JSON.stringify(b); }
  catch { return false; }
}

function auditPayload(value) {
  return value === undefined ? null : JSON.stringify(value);
}

export async function registerWorkforceScheduleRuleRoutes(app) {
  app.post("/api/workforce/:site/schedule-rules", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const site = text(request.params.site);
    if (!VALID_SITES.has(site)) return reply.code(400).send({ error:"INVALID_SITE" });
    if (!siteAllowed(user, site)) return reply.code(403).send({ error:"SITE_NOT_ALLOWED" });
    if (!canManageSchedule(user)) return reply.code(403).send({ error:"WORKFORCE_SCHEDULE_MANAGER_REQUIRED" });

    const candidate = canonicalRuleValue(request.body || {});
    const validation = validateRuleValue(candidate);
    if (!validation.ok) return reply.code(400).send({ error:validation.error });

    const result = await withTransaction(async (client) => {
      await client.query(
        `insert into public.business_state(site,modules,module_revisions,revision,updated_by)
         values($1,'{}'::jsonb,'{}'::jsonb,0,$2)
         on conflict (site) do nothing`,
        [site, user.id]
      );
      const current = await client.query(
        "select modules,module_revisions,revision from public.business_state where site=$1 for update",
        [site]
      );
      const stored = current.rows[0] || {};
      const modules = stored.modules && typeof stored.modules === "object" ? stored.modules : {};
      const revisions = stored.module_revisions && typeof stored.module_revisions === "object" ? stored.module_revisions : {};
      const module = scheduleModule(modules);
      const previous = normalizedStoredRules(module.rules);
      if (equalRuleValue(previous, candidate)) {
        return { unchanged:true, rules:previous, moduleRevision:currentModuleRevision(revisions) };
      }

      const now = new Date().toISOString();
      const rules = {
        ...candidate,
        version:Math.max(0, Number(previous.version) || 0) + 1,
        updatedAt:now,
        updatedByUserId:String(user.id || ""),
        updatedByName:actorName(user),
      };
      module.rules = rules;
      const nextModules = { ...modules, schedule:module };
      const nextModuleRevision = currentModuleRevision(revisions) + 1;
      const nextRevisions = { ...revisions, schedule:nextModuleRevision };
      const saved = await client.query(
        `update public.business_state
         set modules=$2::jsonb,module_revisions=$3::jsonb,revision=revision+1,updated_by=$4,updated_at=now()
         where site=$1
         returning revision,updated_at`,
        [site, JSON.stringify(nextModules), JSON.stringify(nextRevisions), user.id]
      );
      await client.query(
        `insert into public.audit_logs(
           actor_user_id,actor_username,action,entity_type,entity_id,site,before_data,after_data,metadata
         ) values($1,$2,'workforce-schedule-rules-update','schedule_rules',$3,$3,$4::jsonb,$5::jsonb,$6::jsonb)`,
        [
          user.id,
          user.username,
          site,
          auditPayload(previous),
          auditPayload(rules),
          JSON.stringify({ version:rules.version, moduleRevision:nextModuleRevision }),
        ]
      );
      return {
        unchanged:false,
        rules,
        moduleRevision:nextModuleRevision,
        revision:Number(saved.rows[0]?.revision || 0),
        updatedAt:saved.rows[0]?.updated_at || null,
      };
    });

    return {
      ok:true,
      unchanged:Boolean(result.unchanged),
      rules:result.rules,
      moduleRevision:result.moduleRevision,
      revision:result.revision,
      updatedAt:result.updatedAt,
    };
  });

  app.post("/api/workforce/:site/schedule-publish", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const site = text(request.params.site);
    if (!VALID_SITES.has(site)) return reply.code(400).send({ error:"INVALID_SITE" });
    if (!siteAllowed(user, site)) return reply.code(403).send({ error:"SITE_NOT_ALLOWED" });
    if (!canManageSchedule(user)) return reply.code(403).send({ error:"WORKFORCE_SCHEDULE_MANAGER_REQUIRED" });

    const result = await withTransaction(async (client) => {
      await client.query(
        `insert into public.business_state(site,modules,module_revisions,revision,updated_by)
         values($1,'{}'::jsonb,'{}'::jsonb,0,$2)
         on conflict (site) do nothing`,
        [site, user.id]
      );
      const current = await client.query(
        "select modules,module_revisions,revision from public.business_state where site=$1 for update",
        [site]
      );
      const stored = current.rows[0] || {};
      const modules = stored.modules && typeof stored.modules === "object" ? stored.modules : {};
      const revisions = stored.module_revisions && typeof stored.module_revisions === "object" ? stored.module_revisions : {};
      const module = scheduleModule(modules);
      const draftSchedules = structuredClone(module.schedules);
      const priorPublication = module.publication && typeof module.publication === "object" && !Array.isArray(module.publication)
        ? structuredClone(module.publication)
        : null;
      const priorPublishedSchedules = Array.isArray(module.publishedSchedules)
        ? module.publishedSchedules
        : [];
      const moduleRevision = currentModuleRevision(revisions);

      if (priorPublication && equalSchedules(draftSchedules, priorPublishedSchedules)) {
        return {
          unchanged:true,
          publication:priorPublication,
          moduleRevision,
          revision:Number(stored.revision || 0),
        };
      }

      const now = new Date().toISOString();
      const publication = {
        version:Math.max(0, Number(priorPublication?.version) || 0) + 1,
        publishedAt:now,
        publishedByUserId:String(user.id || ""),
        publishedByName:actorName(user),
        scheduleCount:draftSchedules.length,
        sourceModuleRevision:moduleRevision,
      };
      module.publishedSchedules = draftSchedules;
      module.publication = publication;
      const nextModules = { ...modules, schedule:module };
      const nextModuleRevision = moduleRevision + 1;
      const nextRevisions = { ...revisions, schedule:nextModuleRevision };
      const saved = await client.query(
        `update public.business_state
         set modules=$2::jsonb,module_revisions=$3::jsonb,revision=revision+1,updated_by=$4,updated_at=now()
         where site=$1
         returning revision,updated_at`,
        [site, JSON.stringify(nextModules), JSON.stringify(nextRevisions), user.id]
      );
      await client.query(
        `insert into public.audit_logs(
           actor_user_id,actor_username,action,entity_type,entity_id,site,before_data,after_data,metadata
         ) values($1,$2,'workforce-schedule-publish','schedule_publication',$3,$3,$4::jsonb,$5::jsonb,$6::jsonb)`,
        [
          user.id,
          user.username,
          site,
          auditPayload(priorPublication),
          auditPayload(publication),
          JSON.stringify({
            version:publication.version,
            scheduleCount:publication.scheduleCount,
            sourceModuleRevision:moduleRevision,
            moduleRevision:nextModuleRevision,
          }),
        ]
      );
      return {
        unchanged:false,
        publication,
        moduleRevision:nextModuleRevision,
        revision:Number(saved.rows[0]?.revision || 0),
        updatedAt:saved.rows[0]?.updated_at || null,
      };
    });

    return {
      ok:true,
      unchanged:Boolean(result.unchanged),
      publication:result.publication,
      moduleRevision:result.moduleRevision,
      revision:result.revision,
      updatedAt:result.updatedAt,
    };
  });
}
