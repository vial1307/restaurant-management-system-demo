import { loadWorkforceScheduleRelationalState } from "./workforce-schedule-relational-state.mjs";

function enabledValue(value) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

export function workforceScheduleRelationalReadEnabled(env = process.env) {
  return enabledValue(env?.WORKFORCE_SCHEDULE_RELATIONAL_READ);
}

export async function resolveWorkforceScheduleReadAuthority(
  client,
  { site, modules, enabled = workforceScheduleRelationalReadEnabled() }
) {
  const baseModules = modules && typeof modules === "object" && !Array.isArray(modules)
    ? modules
    : {};

  if (!enabled) {
    return {
      modules:baseModules,
      authority:"compatibility-json",
      cutover:false,
      relationalState:null,
    };
  }

  const relationalState = await loadWorkforceScheduleRelationalState(client, site);
  return {
    modules:{
      ...baseModules,
      schedule:relationalState.module,
    },
    authority:"relational-primary",
    cutover:true,
    relationalState,
  };
}
