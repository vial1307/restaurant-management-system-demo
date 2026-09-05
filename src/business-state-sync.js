import { isVpsApiConfigured, vpsBusinessState, vpsSaveBusinessState } from "./vps-api.js";

const AUTH_KEY = "shitu-kitchen-auth-v1";
const ACTIVE_SITE_KEY = "shitu-admin-active-site-v1";
const RECOVERY_KEY = "shitu-business-recovery-v1";
const MAX_RECOVERY_DRAFTS = 12;

function readJson(key) {
  try { return JSON.parse(localStorage.getItem(key) || "null"); }
  catch { return null; }
}

function readSession() {
  return readJson(AUTH_KEY);
}

function sameJson(a, b) {
  try { return JSON.stringify(a) === JSON.stringify(b); }
  catch { return false; }
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

function snapshotModules(snapshot = "") {
  if (!snapshot) return {};
  try {
    const parsed = JSON.parse(snapshot);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function dirtyBusinessModules(modules, baselineSnapshot) {
  const baseline = snapshotModules(baselineSnapshot);
  return Object.fromEntries(
    Object.entries(modules || {}).filter(([name, value]) => !sameJson(value, baseline[name]))
  );
}

function recoveryState() {
  const stored = readJson(RECOVERY_KEY);
  const drafts = stored?.drafts && typeof stored.drafts === "object" && !Array.isArray(stored.drafts)
    ? stored.drafts
    : {};
  return { version: 1, drafts: { ...drafts } };
}

export function businessRecoveryMetadataForUser(userId = "") {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) return [];
  return Object.values(recoveryState().drafts)
    .filter((draft) => draft?.userId === normalizedUserId)
    .map((draft) => ({
      userId: draft.userId,
      site: String(draft.site || ""),
      capturedAt: draft.capturedAt || null,
      baseRevision: Number.isFinite(Number(draft.baseRevision)) ? Number(draft.baseRevision) : null,
      changedModules: Array.isArray(draft.changedModules)
        ? [...draft.changedModules].map(String).filter(Boolean)
        : Object.keys(draft.modules || {}),
      reason: String(draft.reason || "authorization-transition"),
    }))
    .filter((draft) => draft.site)
    .sort((a, b) => String(b.capturedAt || "").localeCompare(String(a.capturedAt || "")));
}

function writeRecoveryDraft(draft) {
  try {
    const state = recoveryState();
    const key = `${draft.userId}:${draft.site}`;
    state.drafts[key] = draft;
    const entries = Object.entries(state.drafts)
      .sort((a, b) => String(b[1]?.capturedAt || "").localeCompare(String(a[1]?.capturedAt || "")))
      .slice(0, MAX_RECOVERY_DRAFTS);
    localStorage.setItem(RECOVERY_KEY, JSON.stringify({ version: 1, drafts: Object.fromEntries(entries) }));
    return true;
  } catch {
    return false;
  }
}

function recoveryDraftForKey(key) {
  return recoveryState().drafts[key] || null;
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
  let replayingSiteSwitch = false;
  let siteSwitchPending = false;
  let safeReloadPending = false;
  let saveInFlight = null;
  let saveInFlightKey = "";
  let saveInFlightSnapshot = "";

  const identityKey = () => {
    const user = readSession();
    const site = currentSite();
    return user?.id && site ? `${user.id}:${site}` : "";
  };

  const surfaceRecovery = (key = identityKey()) => {
    const draft = key ? recoveryDraftForKey(key) : null;
    if (!draft) return false;
    window.dispatchEvent(new CustomEvent("shitu:business-state-status", {
      detail: {
        status: "recovery-pending",
        site: draft.site,
        modules: draft.changedModules || Object.keys(draft.modules || {}),
        capturedAt: draft.capturedAt || null,
      },
    }));
    return true;
  };

  const captureAuthorizationRecovery = (event) => {
    if (!event.detail?.authorizationChanged) return;
    const previous = event.detail?.previous;
    const site = currentSite();
    const key = previous?.id && site ? `${previous.id}:${site}` : "";
    if (!key || key !== loadedKey || !lastSavedSnapshot) return;
    const modules = businessModulesFromState(store.getState());
    const snapshot = JSON.stringify(modules);
    if (snapshot === lastSavedSnapshot) return;
    const dirtyModules = dirtyBusinessModules(modules, lastSavedSnapshot);
    const changedModules = Object.keys(dirtyModules);
    if (!changedModules.length) return;

    const draft = {
      userId: previous.id,
      site,
      capturedAt: new Date().toISOString(),
      baseRevision: loadedRevisionKey === key && Number.isFinite(loadedRevision) ? loadedRevision : null,
      changedModules,
      modules: dirtyModules,
      reason: "authorization-transition",
    };
    if (!writeRecoveryDraft(draft)) {
      window.dispatchEvent(new CustomEvent("shitu:business-state-status", {
        detail: { status: "error", site, error: "BUSINESS_STATE_RECOVERY_WRITE_FAILED" },
      }));
      return;
    }
    window.dispatchEvent(new CustomEvent("shitu:business-state-status", {
      detail: { status: "recovery-pending", site, modules: changedModules, capturedAt: draft.capturedAt },
    }));
  };

  async function save() {
    const key = identityKey();
    const site = currentSite();
    if (!key || key !== loadedKey || !site || !hasBusinessEdit()) return true;
    const modules = businessModulesFromState(store.getState());
    const snapshot = JSON.stringify(modules);

    if (saveInFlight && saveInFlightKey === key) {
      if (saveInFlightSnapshot === snapshot) return saveInFlight;
      const activeSave = saveInFlight;
      return activeSave.then(() => save());
    }

    const dirtyModules = dirtyBusinessModules(modules, lastSavedSnapshot);
    const dirtyNames = Object.keys(dirtyModules);
    if (!dirtyNames.length) {
      clearTimeout(saveTimer);
      saveTimer = 0;
      return true;
    }
    if (document.documentElement.dataset.vpsAuthReady !== "true" || navigator.onLine === false) {
      const error = navigator.onLine === false ? "BUSINESS_STATE_OFFLINE" : "BUSINESS_STATE_NOT_READY";
      window.dispatchEvent(new CustomEvent("shitu:business-state-status", { detail:{ status:"error", site, error } }));
      return false;
    }

    clearTimeout(saveTimer);
    saveTimer = 0;
    const request = (async () => {
      try {
        const saved = await vpsSaveBusinessState(site, dirtyModules);
        // Production VPS responses are validated by vps-api.js and always carry
        // savedModules. Direct legacy test adapters without an `ok` field predate
        // that transport contract and are treated as confirming their input.
        const savedModuleNames = Array.isArray(saved?.savedModules)
          ? saved.savedModules
          : saved?.ok === undefined ? dirtyNames : [];
        const confirmed = new Set(savedModuleNames);
        const missingModules = dirtyNames.filter((name) => !confirmed.has(name));
        if (missingModules.length) {
          window.dispatchEvent(new CustomEvent("shitu:business-state-status", {
            detail: { status:"error", site, error:"BUSINESS_STATE_PARTIAL_SAVE", modules:missingModules },
          }));
          return false;
        }
        if (key === loadedKey) {
          // The write revision cannot be used as a read/merge shortcut because
          // another device may have changed an unrelated module since this
          // browser's baseline. Keep the last loaded revision so the next GET
          // still merges the authoritative post-write server snapshot.
          lastSavedSnapshot = snapshot;
        }
        window.dispatchEvent(new CustomEvent("shitu:business-state-status", { detail:{ status:"saved", site, modules:dirtyNames } }));
        const currentSnapshot = JSON.stringify(businessModulesFromState(store.getState()));
        if (key !== identityKey()) return false;
        return currentSnapshot === snapshot;
      } catch (error) {
        window.dispatchEvent(new CustomEvent("shitu:business-state-status", { detail:{ status:"error", site, error:error.message } }));
        return false;
      }
    })();
    let trackedSave;
    trackedSave = request.finally(() => {
      if (saveInFlight === trackedSave) {
        saveInFlight = null;
        saveInFlightKey = "";
        saveInFlightSnapshot = "";
      }
    });
    saveInFlight = trackedSave;
    saveInFlightKey = key;
    saveInFlightSnapshot = snapshot;
    return trackedSave;
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
    if (!key || !site || !hasBusinessView() || navigator.onLine === false) {
      if (key) surfaceRecovery(key);
      return;
    }
    const localSnapshotBeforeLoad = identityChanged
      ? ""
      : JSON.stringify(businessModulesFromState(store.getState()));
    try {
      const result = await vpsBusinessState(site);
      if (token !== loadToken || key !== identityKey()) return;
      if (!identityChanged && localSnapshotBeforeLoad !== JSON.stringify(businessModulesFromState(store.getState()))) {
        window.dispatchEvent(new CustomEvent("shitu:business-state-status", { detail:{ status:"ready", site, deferred:true } }));
        surfaceRecovery(key);
        return;
      }
      loadedKey = key;
      const revision = Math.max(0, Number(result?.revision) || 0);
      if (loadedRevisionKey === key && loadedRevision === revision) {
        window.dispatchEvent(new CustomEvent("shitu:business-state-status", { detail:{ status:"ready", site, unchanged:true } }));
        surfaceRecovery(key);
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
      surfaceRecovery(key);
    } catch (error) {
      if (token !== loadToken) return;
      window.dispatchEvent(new CustomEvent("shitu:business-state-status", { detail:{ status:"error", site, error:error.message } }));
      surfaceRecovery(key);
    } finally {
      applyingRemote = false;
    }
  }

  const guardSiteSwitch = (event) => {
    if (replayingSiteSwitch) return;
    const button = event.target?.closest?.("[data-warehouse]");
    const targetSite = String(button?.dataset?.warehouse || "");
    const sourceSite = currentSite();
    const user = readSession();
    if (!button || user?.location !== "all" || !["central", "fuxing", "yongji"].includes(targetSite) || !sourceSite || targetSite === sourceSite) return;
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
    if (siteSwitchPending) return;
    siteSwitchPending = true;
    clearTimeout(saveTimer);
    void (async () => {
      const saved = await save();
      if (saved === false) {
        window.dispatchEvent(new CustomEvent("shitu:business-state-status", {
          detail:{ status:"switch-blocked", site:sourceSite, targetSite },
        }));
        siteSwitchPending = false;
        return;
      }
      replayingSiteSwitch = true;
      try {
        button.click();
      } finally {
        replayingSiteSwitch = false;
        siteSwitchPending = false;
      }
    })();
  };

  const guardSafeReload = (event) => {
    event.preventDefault?.();
    if (safeReloadPending) return;
    safeReloadPending = true;
    void (async () => {
      const saved = await save();
      if (saved === false) {
        safeReloadPending = false;
        window.dispatchEvent(new CustomEvent("shitu:business-state-status", {
          detail:{ status:"reload-blocked", site:currentSite(), reason:event.detail?.reason || "reload" },
        }));
        return;
      }
      safeReloadPending = false;
      location.reload();
    })();
  };

  const unsubscribe = store.subscribe(scheduleSave);
  const reload = () => { void load(); };
  const saveThenReload = () => { void (async () => { const saved = await save(); if (saved !== false) await load(); })(); };
  const authReload = (event) => {
    if (event.detail?.safeReloadRequested) return;
    if (event.detail?.authorizationChanged) {
      void load();
      return;
    }
    saveThenReload();
  };
  const resumeVisible = () => {
    if (document.visibilityState === "visible") saveThenReload();
  };
  window.addEventListener("shitu:auth-transition-preparing", captureAuthorizationRecovery);
  window.addEventListener("shitu:auth-synced", authReload);
  window.addEventListener("shitu:vps-auth-ready", saveThenReload);
  window.addEventListener("shitu:active-site-changed", reload);
  window.addEventListener("shitu:safe-reload-requested", guardSafeReload);
  window.addEventListener("online", saveThenReload);
  window.addEventListener("focus", saveThenReload);
  document.addEventListener("visibilitychange", resumeVisible);
  document.addEventListener("click", guardSiteSwitch, true);
  window.setTimeout(reload, 0);
  return () => {
    unsubscribe();
    clearTimeout(saveTimer);
    window.removeEventListener("shitu:auth-transition-preparing", captureAuthorizationRecovery);
    window.removeEventListener("shitu:auth-synced", authReload);
    window.removeEventListener("shitu:vps-auth-ready", saveThenReload);
    window.removeEventListener("shitu:active-site-changed", reload);
    window.removeEventListener("shitu:safe-reload-requested", guardSafeReload);
    window.removeEventListener("online", saveThenReload);
    window.removeEventListener("focus", saveThenReload);
    document.removeEventListener("visibilitychange", resumeVisible);
    document.removeEventListener("click", guardSiteSwitch, true);
  };
}
