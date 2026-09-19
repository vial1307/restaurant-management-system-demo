import { pool } from "./db.mjs";
import { hasPermission, requireUser, siteAllowed } from "./auth.mjs";
import { scopeWorkforceModules } from "./workforce-policy.mjs";
import { loadWorkforceScheduleRelationalState } from "./workforce-schedule-relational-state.mjs";
import { workforceScheduleRelationalReadEnabled } from "./workforce-schedule-read-authority.mjs";

const VALID_SITES = new Set(["central", "fuxing", "yongji"]);

function text(value) {
  return String(value ?? "").trim();
}

export async function registerWorkforceScheduleRelationalRoutes(app) {
  app.get("/api/workforce/:site/schedule-relational-state", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const site = text(request.params.site);
    if (!VALID_SITES.has(site)) return reply.code(400).send({ error:"INVALID_SITE" });
    if (!siteAllowed(user, site)) return reply.code(403).send({ error:"SITE_NOT_ALLOWED" });
    if (!hasPermission(user, "schedule", "view")) {
      return reply.code(403).send({ error:"WORKFORCE_SCHEDULE_VIEW_REQUIRED" });
    }

    const state = await loadWorkforceScheduleRelationalState(pool, site);
    const scoped = scopeWorkforceModules(
      user,
      { schedule:state.module, shared:state.identityModules.shared },
      state.identityModules
    );

    const cutover = workforceScheduleRelationalReadEnabled();
    return {
      site,
      authority:cutover ? "relational-primary" : state.authority,
      cutover,
      compatibilityModuleRevision:state.compatibilityModuleRevision,
      counts:state.counts,
      schedule:scoped.schedule || { schedules:[], requests:[], exceptions:[] },
    };
  });
}
