import { clampNumber, formatDateKey, inventorySources } from "./rules.js";
import { createOperationalState, currentStaff, hydrateOperations, normalizeJob, normalizeSchedule, normalizeSop, TRAINING_STATUSES } from "./operations.js";
import { assessEmployeeSkills, flatSkillCatalog, normalizeCustomSkill, normalizeSkillAssessment, SKILL_ASSIGNMENT_STATUSES } from "./skills.js";
import { accountCanBusinessAction, currentAccountSession } from "./account-permissions.js";

export const STORAGE_KEY = "shitu-kitchen-os-v1";

// Inventory catalog, storage locations and Work Areas are PostgreSQL master data.
// The application store only keeps the latest server projection/cache. It must
// never invent catalog identities, storage locations or Work Areas in JavaScript.
export function stockKeyFor(item = {}) {
  return String(item?.stockKey || item?.id || "").trim();
}

function normalizeStorageLocations(item = {}) {
  const requested = Array.isArray(item.locations) && item.locations.length
    ? item.locations
    : String(item.zone || "").trim()
      ? [{ zone: item.zone, quantity: item.quantity, minimum: item.minimum }]
      : [];
  const locations = new Map();

  for (const location of requested) {
    const zone = String(location?.zone || "").trim();
    if (!zone) continue;
    locations.set(zone, {
      zone,
      quantity: clampNumber(location.quantity),
      minimum: clampNumber(location.minimum),
    });
  }

  return [...locations.values()];
}

// Work stock is independent PostgreSQL stock at kind='work' locations. A
// storage row must never be promoted into a work row by browser fallback logic.
export function buildWorkInventory(_inventory = []) {
  return [];
}

export const DEFAULT_SETTINGS = {
  language: "vi",
  organizationName: "食徒",
  branchName: "",
  employeeName: "阿南",
  workstation: "麵台",
  reservationBuffer: 2,
  riceWeekday: 2000,
  riceWeekend: 3000,
  riceSkipAbove: 2000,
  procurementSchedules: {
    noodles: { closedDays: ["sat"] },
    vegetables: { closedDays: ["sat"] },
    factory: { closedDays: [] },
  },
  checklist: [
    { id: "check-soup", zh: "檢查湯底是否變酸", vi: "Kiểm tra nước lẩu có bị chua" },
    { id: "check-squid", zh: "花枝漿退冰並貼日期", vi: "Rã đông chả mực và dán ngày" },
    { id: "check-cleaning", zh: "掃拖一樓並清洗抹布", vi: "Quét lau tầng một và giặt khăn" },
    { id: "check-ice", zh: "補冰塊與整理置物籃", vi: "Bổ sung đá và sắp xếp giỏ đồ" },
  ],
};

export function createDefaultRecord(date, inventory = [], workInventory = []) {
  const normalizedInventory = (Array.isArray(inventory) ? structuredClone(inventory) : []).map((item) => ({
    ...item,
    stockKey: stockKeyFor(item),
    workArea: String(item.workArea || "").trim(),
  }));
  const normalizedWorkInventory = (Array.isArray(workInventory) ? structuredClone(workInventory) : []).map((item) => ({
    ...item,
    stockKey: stockKeyFor(item),
    workArea: String(item.workArea || "").trim(),
  }));

  return {
    date,
    reservation: {
      lunchTables: 4,
      dinnerTables: 8,
      remaining: { vegetables: 5, braised: 3, hotpot: 4 },
    },
    riceRemaining: 800,
    inventory: normalizedInventory,
    workInventory: normalizedWorkInventory,
    procurement: { planned: {}, incoming: {}, orderDates: { noodles: date, vegetables: date, factory: date } },
    completedTasks: {},
    customTasks: [],
    updatedAt: new Date().toISOString(),
  };
}

export function createDefaultState(date = formatDateKey()) {
  const settings = structuredClone(DEFAULT_SETTINGS);
  return {
    version: 1,
    settings,
    selectedDate: date,
    records: { [date]: createDefaultRecord(date) },
    operations: createOperationalState(settings),
  };
}

export function ensureRecord(state, date) {
  if (state.records[date]) return state.records[date];

  const priorDate = Object.keys(state.records)
    .filter((key) => key <= date)
    .sort()
    .at(-1);
  const priorRecord = priorDate ? state.records[priorDate] : null;
  const record = createDefaultRecord(
    date,
    Array.isArray(priorRecord?.inventory) ? priorRecord.inventory : [],
    Array.isArray(priorRecord?.workInventory) ? priorRecord.workInventory : [],
  );
  record.reservation = { lunchTables: 0, dinnerTables: 0, remaining: { vegetables: 0, braised: 0, hotpot: 0 } };
  record.riceRemaining = 0;
  state.records[date] = record;
  return record;
}

export function hydrateState(raw, date = formatDateKey()) {
  if (!raw) return createDefaultState(date);

  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!parsed || parsed.version !== 1 || typeof parsed.records !== "object") {
      return createDefaultState(date);
    }

    for (const record of Object.values(parsed.records)) {
      if (!Array.isArray(record?.inventory)) continue;
      record.inventory = record.inventory.map((item) => ({
        ...item,
        stockKey: stockKeyFor(item),
        workArea: String(item.workArea || "").trim(),
      }));
      record.workInventory = Array.isArray(record.workInventory)
        ? record.workInventory.map((item) => ({
            ...item,
            stockKey: stockKeyFor(item),
            workArea: String(item.workArea || "").trim(),
          }))
        : [];
      record.procurement = record.procurement && typeof record.procurement === "object"
        ? { planned: record.procurement.planned ?? {}, incoming: record.procurement.incoming ?? {}, orderDates: { noodles: record.date, vegetables: record.date, factory: record.date, ...(record.procurement.orderDates ?? {}) } }
        : { planned: {}, incoming: {}, orderDates: { noodles: record.date, vegetables: record.date, factory: record.date } };
    }

    const defaults = structuredClone(DEFAULT_SETTINGS);
    const savedSchedules = parsed.settings?.procurementSchedules ?? {};
    const settings = {
      ...defaults,
      ...(parsed.settings ?? {}),
      procurementSchedules: Object.fromEntries(["noodles", "vegetables", "factory"].map((category) => [category, {
        ...defaults.procurementSchedules[category],
        ...(savedSchedules[category] ?? {}),
        closedDays: Array.isArray(savedSchedules[category]?.closedDays) ? savedSchedules[category].closedDays.filter((day) => ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].includes(day)) : defaults.procurementSchedules[category].closedDays,
      }])),
    };
    const state = {
      version: 1,
      settings,
      selectedDate: parsed.selectedDate || date,
      records: parsed.records,
      operations: hydrateOperations(parsed.operations, settings),
    };
    ensureRecord(state, state.selectedDate);
    return state;
  } catch {
    return createDefaultState(date);
  }
}

export function createStore(storage = globalThis.localStorage) {
  let state = hydrateState(storage.getItem(STORAGE_KEY));
  const listeners = new Set();

  function persist() {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    for (const listener of listeners) listener(state);
  }

  function update(mutator) {
    mutator(state);
    const record = state.records[state.selectedDate];
    if (record) record.updatedAt = new Date().toISOString();
    if (globalThis.navigator?.onLine === false && state.operations) state.operations.pendingSync += 1;
    persist();
    return state;
  }

  function permitted(_draft, permission) {
    return accountCanBusinessAction(currentAccountSession(storage), permission);
  }

  function audit(draft, kind, label, details = "") {
    draft.operations.audit.unshift({
      id: globalThis.crypto?.randomUUID?.() ?? `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      kind,
      label,
      details,
      staffId: currentStaff(draft)?.id,
      staffName: currentStaff(draft)?.name || draft.settings.employeeName,
      at: new Date().toISOString(),
    });
    draft.operations.audit = draft.operations.audit.slice(0, 500);
  }

  function mergeBusinessModules(modules = {}) {
    if (!modules || typeof modules !== "object") return state;
    const activeStaffId = state.operations?.activeStaffId;
    const language = state.settings?.language;

    if (modules.settings && typeof modules.settings === "object") {
      state.settings = { ...state.settings, ...structuredClone(modules.settings), language };
    }
    if (modules.procurement?.procurementSchedules) {
      state.settings.procurementSchedules = structuredClone(modules.procurement.procurementSchedules);
    }

    const recordModules = ["reservations", "procurement", "preparation"];
    for (const moduleName of recordModules) {
      const records = modules[moduleName]?.records;
      if (!records || typeof records !== "object") continue;
      for (const [date, input] of Object.entries(records)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !input || typeof input !== "object") continue;
        const record = ensureRecord(state, date);
        if (moduleName === "reservations") {
          if (input.reservation) record.reservation = structuredClone(input.reservation);
          if (Object.hasOwn(input, "riceRemaining")) record.riceRemaining = clampNumber(input.riceRemaining);
        }
        if (moduleName === "procurement" && input.procurement) {
          record.procurement = structuredClone(input.procurement);
        }
        if (moduleName === "preparation") {
          if (input.completedTasks) record.completedTasks = structuredClone(input.completedTasks);
          if (Array.isArray(input.customTasks)) record.customTasks = structuredClone(input.customTasks);
        }
        if (input.updatedAt) record.updatedAt = input.updatedAt;
      }
    }

    const operationKeys = {
      menu: ["menuCatalog", "trainingRecords"],
      sop: ["sops", "learning", "inspections"],
      skills: ["customSkills", "skillProfiles", "skillAssessments", "skillApprovals", "trainingRecords"],
      attendance: ["attendance", "payroll"],
      schedule: ["schedules"],
      remote: ["jobCatalog"],
      shared: ["staff"],
      audit: ["audit"],
    };
    const operationPatch = {};
    for (const [moduleName, keys] of Object.entries(operationKeys)) {
      const input = modules[moduleName];
      if (!input || typeof input !== "object") continue;
      for (const key of keys) {
        if (!Object.hasOwn(input, key)) continue;
        if (moduleName === "shared" && key === "staff" && Array.isArray(input.staff)) {
          operationPatch.staff = input.staff.map((member) => ({
            ...structuredClone(member),
            pin: state.operations.staff.find((existing) => existing.id === member.id)?.pin || "",
          }));
        } else {
          operationPatch[key] = structuredClone(input[key]);
        }
      }
    }
    state.operations = hydrateOperations({ ...state.operations, ...operationPatch }, state.settings);
    if (state.operations.staff.some((member) => member.id === activeStaffId && member.active)) {
      state.operations.activeStaffId = activeStaffId;
    }
    state.operations.pendingSync = 0;
    ensureRecord(state, state.selectedDate);
    persist();
    return state;
  }

  function resetBusinessModules() {
    const language = state.settings?.language || "vi";
    const defaults = createDefaultState(state.selectedDate);
    state.settings = { ...defaults.settings, language };
    for (const [date, record] of Object.entries(state.records)) {
      const clean = createDefaultRecord(date);
      record.reservation = clean.reservation;
      record.riceRemaining = clean.riceRemaining;
      record.procurement = clean.procurement;
      record.completedTasks = clean.completedTasks;
      record.customTasks = clean.customTasks;
    }
    state.operations = createOperationalState(state.settings);
    persist();
    return state;
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    mergeBusinessModules,
    resetBusinessModules,
    update,
    selectDate(date) {
      if (state.selectedDate === date) return state;
      return update((draft) => {
        ensureRecord(draft, date);
        draft.selectedDate = date;
      });
    },
    updateSetting(key, value) {
      const next = ["language", "employeeName", "workstation"].includes(key) ? value : clampNumber(value);
      if (state.settings[key] === next) return state;
      return update((draft) => { draft.settings[key] = next; });
    },
    saveGeneralSettings(input = {}) {
      const next = {
        organizationName: String(input.organizationName ?? state.settings.organizationName ?? "").trim(),
        branchName: String(input.branchName ?? state.settings.branchName ?? "").trim(),
        employeeName: String(input.employeeName ?? state.settings.employeeName ?? "").trim(),
        workstation: String(input.workstation ?? state.settings.workstation ?? "").trim(),
        reservationBuffer: clampNumber(input.reservationBuffer ?? state.settings.reservationBuffer),
        riceWeekday: clampNumber(input.riceWeekday ?? state.settings.riceWeekday),
        riceWeekend: clampNumber(input.riceWeekend ?? state.settings.riceWeekend),
        riceSkipAbove: clampNumber(input.riceSkipAbove ?? state.settings.riceSkipAbove),
      };
      const keys = Object.keys(next);
      if (keys.every((key) => state.settings[key] === next[key])) return state;
      return update((draft) => {
        for (const key of keys) draft.settings[key] = next[key];
        audit(draft, "settings-update", next.branchName || "site", next.organizationName);
      });
    },
    updateReservation(key, value) {
      const next = clampNumber(value);
      if (state.records[state.selectedDate].reservation[key] === next) return state;
      return update((draft) => { draft.records[draft.selectedDate].reservation[key] = next; });
    },
    updateRemaining(key, value) {
      const next = clampNumber(value);
      if (state.records[state.selectedDate].reservation.remaining[key] === next) return state;
      return update((draft) => { draft.records[draft.selectedDate].reservation.remaining[key] = next; });
    },
    updateRice(value) {
      const next = clampNumber(value);
      if (state.records[state.selectedDate].riceRemaining === next) return state;
      return update((draft) => { draft.records[draft.selectedDate].riceRemaining = next; });
    },
    updateProcurementLine(id, key, value) {
      const next = clampNumber(value);
      const record = state.records[state.selectedDate];
      const bucketName = key === "planned" ? "planned" : "incoming";
      const currentBucket = record.procurement?.[bucketName];
      if (currentBucket && Object.hasOwn(currentBucket, id) && currentBucket[id] === next) return state;
      return update((draft) => {
        const targetRecord = draft.records[draft.selectedDate];
        targetRecord.procurement ??= { planned: {}, incoming: {} };
        const bucket = bucketName === "planned" ? targetRecord.procurement.planned : targetRecord.procurement.incoming;
        bucket[id] = next;
      });
    },
    updateProcurementOrderDate(category, value) {
      const next = String(value);
      if (!["noodles", "vegetables", "factory"].includes(category) || !/^\d{4}-\d{2}-\d{2}$/.test(next)) return state;
      if (state.records[state.selectedDate].procurement?.orderDates?.[category] === next) return state;
      return update((draft) => {
        const record = draft.records[draft.selectedDate];
        record.procurement ??= { planned: {}, incoming: {}, orderDates: {} };
        record.procurement.orderDates ??= {};
        record.procurement.orderDates[category] = next;
      });
    },
    toggleProcurementClosedDay(category, day) {
      return update((draft) => {
        if (!["noodles", "vegetables", "factory"].includes(category) || !["sun", "mon", "tue", "wed", "thu", "fri", "sat"].includes(day)) return;
        draft.settings.procurementSchedules ??= structuredClone(DEFAULT_SETTINGS.procurementSchedules);
        draft.settings.procurementSchedules[category] ??= { closedDays: [] };
        const closedDays = draft.settings.procurementSchedules[category].closedDays ?? [];
        draft.settings.procurementSchedules[category].closedDays = closedDays.includes(day)
          ? closedDays.filter((entry) => entry !== day)
          : [...closedDays, day];
      });
    },
    updateItem(id, key, value) {
      const record = state.records[state.selectedDate];
      const item = record.inventory.find((entry) => entry.id === id);
      if (!item) return state;
      const next = ["quantity", "minimum"].includes(key) ? clampNumber(value) : value;
      const propagated = ["workArea", "label", "labelVi", "unit"].includes(key);
      if (item[key] === next) {
        if (!propagated) return state;
        const workItem = record.workInventory.find((entry) => entry.stockKey === item.stockKey);
        const inventoryMatches = record.inventory.filter((entry) => entry.stockKey === item.stockKey).every((entry) => entry[key] === next);
        const workMatches = !workItem || workItem[key] === next;
        if (inventoryMatches && workMatches) return state;
      }
      return update((draft) => {
        const targetRecord = draft.records[draft.selectedDate];
        const targetItem = targetRecord.inventory.find((entry) => entry.id === id);
        if (!targetItem) return;
        targetItem[key] = next;
        if (propagated) {
          const workItem = targetRecord.workInventory.find((entry) => entry.stockKey === targetItem.stockKey);
          if (workItem) workItem[key] = next;
          for (const source of targetRecord.inventory) if (source.stockKey === targetItem.stockKey) source[key] = next;
        }
      });
    },
    updateWorkItem(id, key, value) {
      const record = state.records[state.selectedDate];
      const item = record.workInventory.find((entry) => entry.id === id);
      if (!item) return state;
      const next = ["quantity", "minimum"].includes(key) ? clampNumber(value) : value;
      if (item[key] === next) {
        if (key !== "workArea") return state;
        const sourcesMatch = record.inventory.filter((entry) => entry.stockKey === item.stockKey).every((entry) => entry.workArea === next);
        if (sourcesMatch) return state;
      }
      return update((draft) => {
        const targetRecord = draft.records[draft.selectedDate];
        const targetItem = targetRecord.workInventory.find((entry) => entry.id === id);
        if (!targetItem) return;
        targetItem[key] = next;
        if (key === "workArea") for (const source of targetRecord.inventory) if (source.stockKey === targetItem.stockKey) source.workArea = next;
      });
    },
    restockWorkItem(id) {
      return update((draft) => {
        const record = draft.records[draft.selectedDate];
        const item = record.workInventory.find((entry) => entry.id === id);
        if (!item) return;

        let remaining = Math.max(0, clampNumber(item.minimum) - clampNumber(item.quantity));
        const sources = inventorySources(record, item);

        for (const source of sources) {
          const transferred = Math.min(remaining, clampNumber(source.quantity));
          source.quantity -= transferred;
          item.quantity += transferred;
          remaining -= transferred;
          if (remaining <= 0) break;
        }
      });
    },
    restockStorageItem(id) {
      return update((draft) => {
        const record = draft.records[draft.selectedDate];
        const item = record.inventory.find((entry) => entry.id === id);
        if (!item) return;

        let remaining = Math.max(0, clampNumber(item.minimum) - clampNumber(item.quantity));
        for (const source of inventorySources(record, item, item.zone)) {
          const transferred = Math.min(remaining, clampNumber(source.quantity));
          source.quantity -= transferred;
          item.quantity += transferred;
          remaining -= transferred;
          if (remaining <= 0) break;
        }
      });
    },
    addItem(item) {
      let createdStockKey = "";
      update((draft) => {
        const record = draft.records[draft.selectedDate];
        const identifier = globalThis.crypto?.randomUUID?.() ?? `item-${Date.now()}`;
        const locations = normalizeStorageLocations(item);
        if (!locations.length) return;

        const workArea = String(item.workArea || "").trim();
        const unit = String(item.unit || "").trim();
        if (!workArea || !unit) return;
        const stockKey = `stock-${identifier}`;
        createdStockKey = stockKey;
        const shared = {
          stockKey,
          label: item.label,
          labelVi: item.labelVi,
          unit,
          workArea,
          catalogKey: item.catalogKey || "",
          receiveZone: item.receiveZone || "",
        };

        for (const [index, location] of locations.entries()) {
          record.inventory.push({
            ...shared,
            id: index ? `${identifier}-${location.zone}` : identifier,
            ...location,
          });
        }

        const storageItem = record.inventory.find((entry) => entry.stockKey === stockKey);
        record.workInventory.push({
          id: `work-${storageItem.stockKey}`,
          stockKey: storageItem.stockKey,
          label: storageItem.label,
          labelVi: storageItem.labelVi,
          workArea: storageItem.workArea,
          quantity: 0,
          minimum: clampNumber(item.workMinimum),
          unit: storageItem.unit,
        });
      });
      return createdStockKey;
    },
    updateIngredient(stockKey, item) {
      return update((draft) => {
        const record = draft.records[draft.selectedDate];
        const existing = record.inventory.filter((entry) => entry.stockKey === stockKey);
        const locations = normalizeStorageLocations(item);
        if (!existing.length || !locations.length) return;

        const base = existing[0];
        const shared = {
          stockKey,
          label: item.label || base.label,
          labelVi: item.labelVi || base.labelVi,
          catalogKey: item.catalogKey || base.catalogKey || "",
          receiveZone: item.receiveZone ?? base.receiveZone ?? "",
          unit: item.unit || base.unit,
          workArea: item.workArea || base.workArea,
        };
        const selectedZones = new Set(locations.map((location) => location.zone));
        record.inventory = record.inventory.filter((entry) => entry.stockKey !== stockKey || selectedZones.has(entry.zone));

        for (const location of locations) {
          const current = record.inventory.find((entry) => entry.stockKey === stockKey && entry.zone === location.zone);
          if (current) {
            Object.assign(current, shared, location);
            continue;
          }
          const identifier = globalThis.crypto?.randomUUID?.() ?? `${stockKey}-${location.zone}-${Date.now()}`;
          record.inventory.push({ id: identifier, ...shared, ...location });
        }

        const workItem = record.workInventory.find((entry) => entry.stockKey === stockKey);
        if (workItem) {
          Object.assign(workItem, shared);
          if (item.workMinimum !== undefined) workItem.minimum = clampNumber(item.workMinimum);
        }
      });
    },
    removeIngredient(stockKey) {
      return update((draft) => {
        const record = draft.records[draft.selectedDate];
        record.inventory = record.inventory.filter((item) => item.stockKey !== stockKey);
        record.workInventory = record.workInventory.filter((item) => item.stockKey !== stockKey);
      });
    },
    toggleTask(id) {
      return update((draft) => {
        const completed = draft.records[draft.selectedDate].completedTasks;
        completed[id] = !completed[id];
      });
    },
    addTask(input) {
      return update((draft) => {
        const details = typeof input === "string" ? { title: input } : input || {};
        if ((details.assigneeId || details.area || details.dueAt) && !permitted(draft, "tasks:assign")) return;
        const title = String(details.title || "").trim();
        if (!title) return;
        draft.records[draft.selectedDate].customTasks.push({
          id: globalThis.crypto?.randomUUID?.() ?? `task-${Date.now()}`,
          kind: "custom",
          title,
          priority: details.priority === "high" ? "high" : "normal",
          quantity: clampNumber(details.quantity ?? 1, 1),
          unit: String(details.unit || "mục"),
          area: String(details.area || ""),
          assigneeId: String(details.assigneeId || ""),
          assigneeName: String(details.assigneeName || ""),
          dueAt: String(details.dueAt || ""),
        });
      });
    },
    saveSop(input) {
      return update((draft) => {
        if (!permitted(draft, "sop:edit")) return;
        const normalized = normalizeSop(input);
        if (!normalized.label && !normalized.labelVi) return;
        const existing = draft.operations.sops.find((item) => item.id === normalized.id);
        const now = new Date().toISOString();
        const employee = currentStaff(draft);
        const number = existing ? existing.revision + 1 : 1;
        const version = { number, status: "draft", at: now, editor: employee.name, approver: null, snapshot: structuredClone(normalized) };

        if (existing) {
          existing.pending = normalized;
          existing.status = "pending";
          existing.updatedAt = now;
          existing.updatedBy = employee.name;
          existing.versions = existing.versions.filter((entry) => !(entry.number === number && entry.status === "draft"));
          existing.versions.unshift(version);
        } else {
          draft.operations.sops.push({ ...normalized, revision: 0, status: "draft", pending: normalized, updatedAt: now, updatedBy: employee.name, versions: [version] });
        }
        audit(draft, "sop-edit", normalized.label || normalized.labelVi, `v${number}`);
      });
    },
    approveSop(id) {
      return update((draft) => {
        if (!permitted(draft, "sop:approve")) return;
        const sop = draft.operations.sops.find((item) => item.id === id);
        if (!sop?.pending) return;
        const number = sop.revision + 1;
        const employee = currentStaff(draft);
        const snapshot = structuredClone(sop.pending);
        Object.assign(sop, snapshot, { revision: number, status: "published", pending: null, updatedAt: new Date().toISOString(), updatedBy: employee.name });
        const version = sop.versions.find((entry) => entry.number === number && entry.status === "draft");
        if (version) { version.status = "published"; version.approver = employee.name; version.approvedAt = new Date().toISOString(); }
        audit(draft, "sop-approve", sop.label || sop.labelVi, `v${number}`);
      });
    },
    restoreSop(id, number) {
      return update((draft) => {
        if (!permitted(draft, "sop:edit")) return;
        const sop = draft.operations.sops.find((item) => item.id === id);
        const prior = sop?.versions.find((entry) => entry.number === Number(number) && entry.status === "published");
        if (!sop || !prior?.snapshot) return;
        const next = normalizeSop(prior.snapshot);
        const employee = currentStaff(draft);
        const revision = sop.revision + 1;
        sop.pending = next;
        sop.status = "pending";
        sop.versions = sop.versions.filter((entry) => !(entry.number === revision && entry.status === "draft"));
        sop.versions.unshift({ number: revision, status: "draft", at: new Date().toISOString(), editor: employee.name, approver: null, snapshot: structuredClone(next), restoredFrom: Number(number) });
        audit(draft, "sop-restore", sop.label || sop.labelVi, `v${number} → v${revision}`);
      });
    },
    removeSop(id) {
      return update((draft) => {
        if (!permitted(draft, "sop:delete")) return;
        const sop = draft.operations.sops.find((item) => item.id === id);
        if (!sop) return;
        draft.operations.sops = draft.operations.sops.filter((item) => item.id !== id);
        audit(draft, "sop-delete", sop.label || sop.labelVi);
      });
    },
    setSkillAssignment(area, skillId, status) {
      return update((draft) => {
        if (!permitted(draft, "skills:manage")) return;
        if (!["noodles", "soup", "seafood", "meat"].includes(area)) return;
        const valid = flatSkillCatalog(draft.operations.customSkills).some((skill) => skill.id === skillId);
        if (!valid || !SKILL_ASSIGNMENT_STATUSES.includes(status)) return;
        draft.operations.skillProfiles[area] ??= {};
        if (status === "inactive") delete draft.operations.skillProfiles[area][skillId];
        else draft.operations.skillProfiles[area][skillId] = status;
        draft.operations.skillApprovals = draft.operations.skillApprovals.filter((entry) => entry.area !== area);
        const skill = flatSkillCatalog(draft.operations.customSkills).find((item) => item.id === skillId);
        audit(draft, "skill-profile", skill?.zh?.title || skill?.vi?.title || skillId, `${area} · ${status}`);
      });
    },
    addCustomSkill(input) {
      return update((draft) => {
        if (!permitted(draft, "skills:manage")) return;
        const skill = normalizeCustomSkill(input);
        if (!skill) return;
        draft.operations.customSkills.push(skill);
        audit(draft, "skill-add", skill.zh.title, skill.vi.title);
      });
    },
    removeCustomSkill(id) {
      return update((draft) => {
        if (!permitted(draft, "skills:manage")) return;
        const skill = draft.operations.customSkills.find((item) => item.id === id);
        if (!skill) return;
        draft.operations.customSkills = draft.operations.customSkills.filter((item) => item.id !== id);
        for (const area of ["noodles", "soup", "seafood", "meat"]) delete draft.operations.skillProfiles[area]?.[id];
        draft.operations.skillApprovals = [];
        audit(draft, "skill-delete", skill.zh.title, skill.vi.title);
      });
    },
    saveSkillAssessment(input) {
      return update((draft) => {
        if (!permitted(draft, "skills:evaluate")) return;
        const member = draft.operations.staff.find((item) => item.id === input.staffId && item.active);
        const evaluator = currentStaff(draft);
        if (!member || !evaluator) return;
        const activeIds = Object.keys(draft.operations.skillProfiles?.[input.area] || {});
        const normalized = normalizeSkillAssessment({
          ...input,
          staffName: member.name,
          evaluatorId: evaluator.id,
          evaluatorName: evaluator.name,
          evaluatorRole: evaluator.role,
          at: new Date().toISOString(),
        }, activeIds);
        if (!normalized) return;
        draft.operations.skillAssessments.unshift(normalized);
        draft.operations.skillAssessments = draft.operations.skillAssessments.slice(0, 1000);
        audit(draft, "skill-assessment", member.name, `${normalized.area} · ${normalized.ratings.length}`);
      });
    },
    approveSkillLevel(staffId, area) {
      return update((draft) => {
        if (!permitted(draft, "skills:approve")) return;
        const member = draft.operations.staff.find((item) => item.id === staffId && item.active);
        const result = assessEmployeeSkills(draft.operations, staffId, area);
        if (!member || !result.approvalReady || !result.suggestedLevel) return;
        const approver = currentStaff(draft);
        draft.operations.skillApprovals.unshift({
          id: globalThis.crypto?.randomUUID?.() ?? `skill-approval-${Date.now()}`,
          staffId,
          staffName: member.name,
          area,
          level: result.suggestedLevel,
          coverage: result.coverage,
          average: result.average,
          evaluatorCount: result.evaluatorCount,
          approverId: approver.id,
          approverName: approver.name,
          at: new Date().toISOString(),
        });
        draft.operations.skillApprovals = draft.operations.skillApprovals.slice(0, 500);
        audit(draft, "skill-level-approve", member.name, `${area} · ${result.suggestedLevel}`);
      });
    },
    updateTrainingStatus(id, status) {
      return update((draft) => {
        if (!permitted(draft, "skills:evaluate") || !TRAINING_STATUSES.includes(status)) return;
        const record = draft.operations.trainingRecords.find((entry) => entry.id === id);
        if (!record) return;
        record.status = status;
        if (status === "passed") record.checkedAt = new Date().toISOString();
        audit(draft, "training-status", record.label || record.labelVi, `${record.assigneeName} · ${status}`);
      });
    },
    markSopLearned(sopId, staffId = state.operations.activeStaffId) {
      return update((draft) => {
        const employee = currentStaff(draft);
        if (staffId !== employee.id && !permitted(draft, "staff:manage")) return;
        const sop = draft.operations.sops.find((item) => item.id === sopId);
        if (!sop || sop.revision < 1) return;
        draft.operations.learning = draft.operations.learning.filter((item) => !(item.sopId === sopId && item.staffId === staffId));
        draft.operations.learning.push({ sopId, staffId, revision: sop.revision, at: new Date().toISOString() });
        audit(draft, "sop-learned", sop.label || sop.labelVi, `v${sop.revision}`);
      });
    },
    addInspection(input) {
      return update((draft) => {
        if (!permitted(draft, "checks:record")) return;
        if (!String(input.photo || "").startsWith("data:image/")) return;
        const employee = currentStaff(draft);
        draft.operations.inspections.unshift({
          id: globalThis.crypto?.randomUUID?.() ?? `check-${Date.now()}`,
          date: draft.selectedDate,
          area: input.area || employee.area,
          sopId: input.sopId || null,
          note: String(input.note || "").trim(),
          photo: String(input.photo),
          staffId: employee.id,
          staffName: employee.name,
          at: new Date().toISOString(),
        });
        audit(draft, "photo-check", input.note || input.area || employee.area);
      });
    },
    saveStaff(input) {
      return update((draft) => {
        if (!permitted(draft, "staff:manage")) return;
        const name = String(input.name || "").trim();
        if (!name) return;
        const existing = draft.operations.staff.find((item) => item.id === input.id);
        const member = {
          id: existing?.id || globalThis.crypto?.randomUUID?.() || `staff-${Date.now()}`,
          name,
          role: ["manager", "supervisor", "employee", "parttime"].includes(input.role) ? input.role : "employee",
          area: ["noodles", "soup", "seafood", "meat"].includes(input.area) ? input.area : "noodles",
          hourlyRate: clampNumber(input.hourlyRate),
          active: input.active !== false,
          pin: String(input.pin ?? existing?.pin ?? ""),
        };
        if (member.id === "staff-manager") {
          member.role = "manager";
          member.active = true;
        }
        if (existing) Object.assign(existing, member);
        else draft.operations.staff.push(member);
        audit(draft, "staff-save", member.name, member.role);
      });
    },
    switchStaff(id, pin = "") {
      const member = state.operations.staff.find((item) => item.id === id && item.active);
      if (!member || (member.pin && member.pin !== String(pin))) return false;
      update((draft) => { draft.operations.activeStaffId = id; draft.settings.employeeName = member.name; });
      return true;
    },
    clockIn(staffId, options = {}) {
      return update((draft) => {
        const employee = currentStaff(draft);
        if (staffId !== employee.id && !permitted(draft, "attendance:manage")) return;
        const member = draft.operations.staff.find((item) => item.id === staffId && item.active);
        if (!member || draft.operations.attendance.some((entry) => entry.staffId === staffId && !entry.clockOut)) return;
        const at = options.at || new Date().toISOString();
        draft.operations.attendance.unshift({
          id: globalThis.crypto?.randomUUID?.() ?? `attendance-${Date.now()}`,
          date: draft.selectedDate,
          staffId,
          staffName: member.name,
          area: member.area,
          hourlyRate: clampNumber(options.hourlyRate ?? member.hourlyRate),
          scheduledStart: String(options.scheduledStart || ""),
          clockIn: at,
          clockOut: null,
          breakMinutes: clampNumber(options.breakMinutes),
          note: String(options.note || ""),
        });
        audit(draft, "clock-in", member.name);
      });
    },
    clockOut(id, at = new Date().toISOString()) {
      return update((draft) => {
        const entry = draft.operations.attendance.find((item) => item.id === id);
        const employee = currentStaff(draft);
        if (!entry || entry.clockOut || (entry.staffId !== employee.id && !permitted(draft, "attendance:manage"))) return;
        entry.clockOut = at;
        audit(draft, "clock-out", entry.staffName);
      });
    },
    updateAttendance(id, input) {
      return update((draft) => {
        if (!permitted(draft, "attendance:manage")) return;
        const entry = draft.operations.attendance.find((item) => item.id === id);
        if (!entry) return;
        if (input.clockIn) entry.clockIn = String(input.clockIn);
        if (Object.hasOwn(input, "clockOut")) entry.clockOut = input.clockOut ? String(input.clockOut) : null;
        if (Object.hasOwn(input, "scheduledStart")) entry.scheduledStart = String(input.scheduledStart || "");
        if (Object.hasOwn(input, "breakMinutes")) entry.breakMinutes = clampNumber(input.breakMinutes);
        if (Object.hasOwn(input, "hourlyRate")) entry.hourlyRate = clampNumber(input.hourlyRate);
        if (Object.hasOwn(input, "note")) entry.note = String(input.note || "");
        audit(draft, "attendance-edit", entry.staffName);
      });
    },
    updatePayroll(key, value) {
      return update((draft) => {
        if (!permitted(draft, "staff:manage")) return;
        if (key === "latePenaltyEnabled") draft.operations.payroll[key] = Boolean(value);
        else if (["latePenaltyMode", "note"].includes(key)) draft.operations.payroll[key] = String(value);
        else draft.operations.payroll[key] = clampNumber(value);
        audit(draft, "payroll-policy", key);
      });
    },
    saveSchedule(input) {
      return update((draft) => {
        if (!permitted(draft, "schedule:manage")) return;
        const member = draft.operations.staff.find((item) => item.id === input.staffId && item.active);
        if (!member) return;
        const normalized = normalizeSchedule({ ...input, staffName: member.name });
        if (!normalized) return;
        const existing = draft.operations.schedules.find((item) => item.id === normalized.id);
        if (existing) Object.assign(existing, normalized);
        else draft.operations.schedules.push(normalized);
        audit(draft, "schedule-save", member.name, `${normalized.date} · ${normalized.shift} · ${normalized.area}`);
      });
    },
    removeSchedule(id) {
      return update((draft) => {
        if (!permitted(draft, "schedule:manage")) return;
        const existing = draft.operations.schedules.find((item) => item.id === id);
        if (!existing) return;
        draft.operations.schedules = draft.operations.schedules.filter((item) => item.id !== id);
        audit(draft, "schedule-delete", existing.staffName, existing.date);
      });
    },
    saveJob(input) {
      return update((draft) => {
        if (!permitted(draft, "jobs:manage")) return;
        const normalized = normalizeJob(input);
        if (!normalized) return;
        const existing = draft.operations.jobCatalog.find((item) => item.id === normalized.id);
        if (existing) Object.assign(existing, normalized);
        else draft.operations.jobCatalog.push(normalized);
        audit(draft, "job-save", normalized.label || normalized.labelVi, normalized.department);
      });
    },
    removeJob(id) {
      return update((draft) => {
        if (!permitted(draft, "jobs:manage")) return;
        const existing = draft.operations.jobCatalog.find((item) => item.id === id);
        if (!existing) return;
        existing.active = false;
        audit(draft, "job-disable", existing.label || existing.labelVi, existing.department);
      });
    },
    clearPendingSync() {
      return update((draft) => { draft.operations.pendingSync = 0; });
    },
    reset() {
      state = createDefaultState();
      persist();
      return state;
    },
  };
}
