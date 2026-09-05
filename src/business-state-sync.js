import { isVpsApiConfigured, vpsBusinessState, vpsSaveBusinessState } from "./vps-api.js";

const AUTH_KEY = "shitu-kitchen-auth-v1";
const ACTIVE_SITE_KEY = "shitu-admin-active-site-v1";

function readSession() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY) || "null"); }
  catch { return null; }
}

function currentSite() {
  const user = readSession();
  if (["central", "fuxing", "yongji"].includes(user?.location)) return user.location;
  if (user?.location === "all") {
    const saved = localStorage.getItem(ACTIVE_SITE_KEY);
    return ["central", "fuxing", "yongji"].includes(saved) ? saved : "fuxing";
  }
  return "";
}

function hasBusinessEdit() {
  const permissions = readSession()?.permissions || {};
  return Object.entries(permissions).some(([key, value]) => key !== "inventory" && value?.edit);
}

function hasBusinessView() {
  const permissions = readSession()?.permissions || {};
  return Object.entries(permissions).some(([key, value]) => key !== "inventory" && value?.view);
}

function recordsBy(state, mapper) {
  return Object.fromEntries(Object.entries(state.records || {}).map(([date, record]) => [date, {
    ...mapper(record),
    updatedAt: record.updatedAt || null,
  }]));
}

export function businessModulesFromState(state) {
  const settings = structuredClone(state.settings || {});
  delete settings.language;
  delete settings.employeeName;
  delete settings.workstation;
  const procurementSchedules = settings.procurementSchedules;
  delete settings.procurementSchedules;
  const operations = state.operations || {};
  return {
    settings,
    reservations: {
      records: recordsBy(state, (record) => ({
        reservation: structuredClone(record.reservation || {}),
        riceRemaining: Number(record.riceRemaining || 0),
      })),
    },
    procurement: {
      procurementSchedules: structuredClone(procurementSchedules || {}),
      records: recordsBy(state, (record) => ({ procurement: structuredClone(record.procurement || {}) })),
    },
    preparation: {
      records: recordsBy(state, (record) => ({
        completedTasks: structuredClone(record.completedTasks || {}),
        customTasks: structuredClone(record.customTasks || []),
      })),
    },
    menu: {
      menuCatalog: structuredClone(operations.menuCatalog || []),
      trainingRecords: structuredClone(operations.trainingRecords || []),
    },
    sop: {
      sops: structuredClone(operations.sops || []),
      learning: structuredClone(operations.learning || []),
      inspections: structuredClone(operations.inspections || []),
    },
    skills: {
      customSkills: structuredClone(operations.customSkills || []),
      skillProfiles: structuredClone(operations.skillProfiles || {}),
      skillAssessments: structuredClone(operations.skillAssessments || []),
      skillApprovals: structuredClone(operations.skillApprovals || []),
      trainingRecords: structuredClone(operations.trainingRecords || []),
    },
    attendance: {
      attendance: structuredClone(operations.attendance || []),
      payroll: structuredClone(operations.payroll || {}),
    },
    schedule: { schedules: structuredClone(operations.schedules || []) },
    remote: { jobCatalog: structuredClone(operations.jobCatalog || []) },
    shared: {
      staff: structuredClone(operations.staff || []).map(({ pin: _pin, ...member }) => member),
    },
    audit: { audit: structuredClone(operations.audit || []).slice(0, 500) },
  };
}

export function attachBusinessStateSync(store) {
  if (!isVpsApiConfigured()) return () => {};
  let applyingRemote = false;
  let loadedKey = "";
  let loadToken = 0;
  let saveTimer = 0;
  let lastSavedSnapshot = "";
  let loadedRevisionKey = "";
  let loadedRevision = -1;

  const identityKey = () => {
    const user = readSession();
    const site = currentSite();
    return user?.id && site ? `${user.id}:${site}` : "";
  };

  async function save() {
    if (document.documentElement.dataset.vpsAuthReady !== "true") return true;
    const key = identityKey();
    const site = currentSite();
    if (!key || key !== loadedKey || !site || !hasBusinessEdit() || navigator.onLine === false) return true;
    const modules = businessModulesFromState(store.getState());
    const snapshot = JSON.stringify(modules);
    if (snapshot === lastSavedSnapshot) return true;
    try {
      const saved = await vpsSaveBusinessState(site, modules);
      lastSavedSnapshot = snapshot;
      const revision = Number(saved?.revision);
      if (Number.isFinite(revision)) {
        loadedRevisionKey = key;
        loadedRevision = revision;
      }
      window.dispatchEvent(new CustomEvent("shitu:business-state-status", { detail:{ status:"saved", site } }));
      const currentSnapshot = JSON.stringify(businessModulesFromState(store.getState()));
      return currentSnapshot === snapshot;
    } catch (error) {
      window.dispatchEvent(new CustomEvent("shitu:business-state-status", { detail:{ status:"error", site, error:error.message } }));
      return false;
    }
  }

  function scheduleSave() {
    if (applyingRemote || !loadedKey || !hasBusinessEdit()) return;
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => { void save(); }, 450);
  }

  async function load() {
    if (document.documentElement.dataset.vpsAuthReady !== "true") return;
    const key = identityKey();
    const site = currentSite();
    const token = ++loadToken;
    clearTimeout(saveTimer);
    const identityChanged = key !== loadedKey;
    if (identityChanged) {
      loadedKey = "";
      lastSavedSnapshot = "";
    }
    if (!key || !site || !hasBusinessView() || navigator.onLine === false) return;
    const localSnapshotBeforeLoad = identityChanged
      ? ""
      : JSON.stringify(businessModulesFromState(store.getState()));
    try {
      const result = await vpsBusinessState(site);
      if (token !== loadToken || key !== identityKey()) return;
      if (!identityChanged && localSnapshotBeforeLoad !== JSON.stringify(businessModulesFromState(store.getState()))) {
        window.dispatchEvent(new CustomEvent("shitu:business-state-status", { detail:{ status:"ready", site, deferred:true } }));
        return;
      }
      loadedKey = key;
      const revision = Math.max(0, Number(result?.revision) || 0);
      if (loadedRevisionKey === key && loadedRevision === revision) {
        window.dispatchEvent(new CustomEvent("shitu:business-state-status", { detail:{ status:"ready", site, unchanged:true } }));
        return;
      }

      const modules = result?.modules || {};
      if (revision > 0) {
        applyingRemote = true;
        // Merge only modules that already exist on the server. Modules not yet
        // migrated must keep their device copy until an authorized real edit
        // persists them, especially when the first writer has limited rights.
        store.mergeBusinessModules(modules);
        applyingRemote = false;
        lastSavedSnapshot = JSON.stringify(businessModulesFromState(store.getState()));
      } else {
        // An empty server row means this browser may still hold the only copy of
        // existing operational data. Treat it as the baseline and wait for a
        // real user mutation before creating the first database revision.
        lastSavedSnapshot = JSON.stringify(businessModulesFromState(store.getState()));
      }
      loadedRevisionKey = key;
      loadedRevision = revision;
      window.dispatchEvent(new CustomEvent("shitu:business-state-status", { detail:{ status:"ready", site } }));
    } catch (error) {
      if (token !== loadToken) return;
      window.dispatchEvent(new CustomEvent("shitu:business-state-status", { detail:{ status:"error", site, error:error.message } }));
    } finally {
      applyingRemote = false;
    }
  }

  const unsubscribe = store.subscribe(scheduleSave);
  const reload = () => { void load(); };
  window.addEventListener("shitu:auth-synced", reload);
  window.addEventListener("shitu:vps-auth-ready", reload);
  window.addEventListener("shitu:active-site-changed", reload);
  const saveThenReload = () => { void (async () => { const saved = await save(); if (saved !== false) await load(); })(); };
  window.addEventListener("online", saveThenReload);
  window.addEventListener("focus", saveThenReload);
  window.setTimeout(reload, 0);
  return () => {
    unsubscribe();
    clearTimeout(saveTimer);
    window.removeEventListener("shitu:auth-synced", reload);
    window.removeEventListener("shitu:vps-auth-ready", reload);
    window.removeEventListener("shitu:active-site-changed", reload);
    window.removeEventListener("online", saveThenReload);
    window.removeEventListener("focus", saveThenReload);
  };
}
