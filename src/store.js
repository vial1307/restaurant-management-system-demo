import { clampNumber, formatDateKey, inventorySources } from "./rules.js";
import { createOperationalState, currentStaff, hydrateOperations, normalizeJob, normalizeSchedule, normalizeSop, roleCan } from "./operations.js";
import { flatSkillCatalog, normalizeCustomSkill, SKILL_ASSIGNMENT_STATUSES } from "./skills.js";

export const STORAGE_KEY = "shitu-kitchen-os-v1";

export const WORK_AREAS = [
  { id: "noodles", zh: "麵區", vi: "Khu mì" },
  { id: "soup", zh: "湯區", vi: "Khu canh" },
  { id: "seafood", zh: "海鮮區", vi: "Khu hải sản" },
  { id: "meat", zh: "肉區", vi: "Khu thịt" },
];

export const ZONES = [
  { id: "large-freezer", zh: "大冷凍", vi: "Tủ đông lớn" },
  { id: "large-fridge", zh: "大冷藏", vi: "Tủ mát lớn" },
  { id: "four-door", zh: "四門冰箱", vi: "Tủ lạnh 4 cánh" },
  { id: "kitchen", zh: "廚房冰箱", vi: "Tủ lạnh bếp" },
];

export const PRIMARY_ZONES = ["large-freezer", "large-fridge"];

export const DEFAULT_ITEMS = [
  { id: "tofu-kitchen", label: "豆乾", labelVi: "Đậu khô", quantity: 7, minimum: 10, unit: "盒", zone: "kitchen" },
  { id: "duck-tongue-kitchen", label: "鴨舌", labelVi: "Lưỡi vịt", quantity: 4, minimum: 10, unit: "盒", zone: "kitchen" },
  { id: "duck-wing-kitchen", label: "鴨翅", labelVi: "Cánh vịt", quantity: 5, minimum: 5, unit: "盒", zone: "kitchen" },
  { id: "duck-intestine-kitchen", label: "鴨腸", labelVi: "Lòng vịt", quantity: 2, minimum: 5, unit: "盒", zone: "kitchen" },
  { id: "thick-noodles", label: "粗麵", labelVi: "Mì sợi to", quantity: 4, minimum: 4, unit: "包", zone: "kitchen" },
  { id: "thin-noodles", label: "細麵", labelVi: "Mì sợi nhỏ", quantity: 2, minimum: 4, unit: "包", zone: "kitchen" },
  { id: "handmade-noodles", label: "手工麵", labelVi: "Mì thủ công", quantity: 5, minimum: 8, unit: "塊", zone: "four-door" },
  { id: "oxtail-rice", label: "牛尾追飯", labelVi: "Cơm đuôi bò", quantity: 3, minimum: 5, unit: "盒", zone: "four-door" },
  { id: "tripe-noodles", label: "牛肚沾麵", labelVi: "Mì chấm dạ dày bò", quantity: 4, minimum: 5, unit: "盒", zone: "four-door" },
  { id: "stewed-rice", label: "燴飯", labelVi: "Cơm sốt", quantity: 6, minimum: 5, unit: "盒", zone: "four-door" },
  { id: "dry-noodle-sauce", label: "乾麵醬", labelVi: "Sốt mì khô", quantity: 1, minimum: 2, unit: "包", zone: "large-fridge" },
  { id: "beef-juice", label: "牛肉汁", labelVi: "Nước sốt bò", quantity: 1, minimum: 2, unit: "包", zone: "large-fridge" },
  { id: "frozen-noodles", label: "冷凍麵", labelVi: "Mì đông lạnh", quantity: 60, minimum: 30, unit: "片", zone: "large-freezer" },
  { id: "baby-cabbage", label: "顆白菜", labelVi: "Cải thìa", quantity: 4, minimum: 4, unit: "斤", zone: "large-fridge" },
  { id: "cabbage", label: "高麗菜", labelVi: "Bắp cải", quantity: 3, minimum: 2, unit: "顆", zone: "large-fridge" },
  { id: "tofu-large", label: "豆乾", labelVi: "Đậu khô", quantity: 20, minimum: 20, unit: "盒", zone: "large-fridge" },
  { id: "duck-tongue-large", label: "鴨舌", labelVi: "Lưỡi vịt", quantity: 14, minimum: 20, unit: "盒", zone: "large-fridge" },
  { id: "duck-wing-large", label: "鴨翅", labelVi: "Cánh vịt", quantity: 10, minimum: 10, unit: "盒", zone: "large-freezer" },
  { id: "duck-intestine-large", label: "鴨腸", labelVi: "Lòng vịt", quantity: 8, minimum: 10, unit: "盒", zone: "large-freezer" },
].map((item) => ({ ...item, workArea: "noodles" }));

const STOCK_KEYS = {
  "tofu-kitchen": "tofu",
  "tofu-large": "tofu",
  "duck-tongue-kitchen": "duck-tongue",
  "duck-tongue-large": "duck-tongue",
  "duck-wing-kitchen": "duck-wing",
  "duck-wing-large": "duck-wing",
  "duck-intestine-kitchen": "duck-intestine",
  "duck-intestine-large": "duck-intestine",
};

export function stockKeyFor(item) {
  return item.stockKey || STOCK_KEYS[item.id] || item.id;
}

function normalizeStorageLocations(item) {
  const requested = Array.isArray(item.locations) && item.locations.length
    ? item.locations
    : [{ zone: item.zone || "kitchen", quantity: item.quantity, minimum: item.minimum }];
  const locations = new Map();

  for (const location of requested) {
    if (!ZONES.some((zone) => zone.id === location.zone)) continue;
    locations.set(location.zone, {
      zone: location.zone,
      quantity: clampNumber(location.quantity),
      minimum: clampNumber(location.minimum, 1),
    });
  }

  return [...locations.values()];
}

export function buildWorkInventory(inventory) {
  const grouped = new Map();

  for (const item of inventory) {
    const stockKey = stockKeyFor(item);
    const previous = grouped.get(stockKey);
    if (!previous || item.zone === "kitchen") grouped.set(stockKey, item);
  }

  return [...grouped.entries()].map(([stockKey, item]) => ({
    id: `work-${stockKey}`,
    stockKey,
    label: item.label,
    labelVi: item.labelVi,
    workArea: item.workArea || inferWorkArea(item),
    quantity: clampNumber(item.quantity),
    minimum: clampNumber(item.minimum),
    unit: item.unit,
  }));
}

export function inferWorkArea(item) {
  const preset = DEFAULT_ITEMS.find((entry) => entry.id === item.id);
  if (preset) return preset.workArea;

  const label = `${item.label ?? ""} ${item.labelVi ?? ""}`.toLowerCase();
  if (/海鮮|蝦|蛤|花枝|魚|蟹|hải sản|tôm|nghêu|mực|cá|cua/.test(label)) return "seafood";
  if (/湯底|高湯|麻辣湯|昆布|nước lẩu|nước dùng|canh/.test(label)) return "soup";
  if (/牛肉|豬肉|羊肉|雞肉|thịt bò|thịt heo|thịt lợn|thịt cừu|thịt gà/.test(label)) return "meat";
  return "noodles";
}

export const DEFAULT_SETTINGS = {
  language: "vi",
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

export function createDefaultRecord(date, inventory = DEFAULT_ITEMS, workInventory = null) {
  const normalizedInventory = structuredClone(inventory).map((item) => ({
    ...item,
    stockKey: stockKeyFor(item),
    workArea: item.workArea || inferWorkArea(item),
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
    workInventory: workInventory ? structuredClone(workInventory) : buildWorkInventory(normalizedInventory),
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
    priorRecord?.inventory ?? DEFAULT_ITEMS,
    priorRecord?.workInventory ?? null,
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
        workArea: item.workArea || inferWorkArea(item),
      }));
      for (const item of DEFAULT_ITEMS.filter((entry) => ["frozen-noodles", "baby-cabbage", "cabbage"].includes(entry.id))) {
        if (!record.inventory.some((entry) => entry.id === item.id)) record.inventory.push({ ...structuredClone(item), stockKey: stockKeyFor(item), workArea: item.workArea || inferWorkArea(item) });
      }
      record.workInventory = Array.isArray(record.workInventory)
        ? record.workInventory.map((item) => ({
            ...item,
            stockKey: stockKeyFor(item),
            workArea: item.workArea || inferWorkArea(item),
          }))
        : buildWorkInventory(record.inventory);
      for (const item of buildWorkInventory(record.inventory)) {
        if (!record.workInventory.some((entry) => entry.stockKey === item.stockKey)) record.workInventory.push(item);
      }
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

  function permitted(draft, permission) {
    return roleCan(currentStaff(draft)?.role, permission);
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

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update,
    selectDate(date) {
      return update((draft) => {
        ensureRecord(draft, date);
        draft.selectedDate = date;
      });
    },
    updateSetting(key, value) {
      return update((draft) => {
        draft.settings[key] = ["language", "employeeName", "workstation"].includes(key)
          ? value
          : clampNumber(value);
      });
    },
    updateReservation(key, value) {
      return update((draft) => {
        draft.records[draft.selectedDate].reservation[key] = clampNumber(value);
      });
    },
    updateRemaining(key, value) {
      return update((draft) => {
        draft.records[draft.selectedDate].reservation.remaining[key] = clampNumber(value);
      });
    },
    updateRice(value) {
      return update((draft) => {
        draft.records[draft.selectedDate].riceRemaining = clampNumber(value);
      });
    },
    updateProcurementLine(id, key, value) {
      return update((draft) => {
        const record = draft.records[draft.selectedDate];
        record.procurement ??= { planned: {}, incoming: {} };
        const bucket = key === "planned" ? record.procurement.planned : record.procurement.incoming;
        bucket[id] = clampNumber(value);
      });
    },
    updateProcurementOrderDate(category, value) {
      return update((draft) => {
        if (!["noodles", "vegetables", "factory"].includes(category) || !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return;
        const record = draft.records[draft.selectedDate];
        record.procurement ??= { planned: {}, incoming: {}, orderDates: {} };
        record.procurement.orderDates ??= {};
        record.procurement.orderDates[category] = String(value);
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
      return update((draft) => {
        const record = draft.records[draft.selectedDate];
        const item = record.inventory.find((entry) => entry.id === id);
        if (item) item[key] = ["quantity", "minimum"].includes(key) ? clampNumber(value) : value;
        if (item && ["workArea", "label", "labelVi", "unit"].includes(key)) {
          const workItem = record.workInventory.find((entry) => entry.stockKey === item.stockKey);
          if (workItem) workItem[key] = value;
          for (const source of record.inventory) {
            if (source.stockKey === item.stockKey) source[key] = value;
          }
        }
      });
    },
    updateWorkItem(id, key, value) {
      return update((draft) => {
        const record = draft.records[draft.selectedDate];
        const item = record.workInventory.find((entry) => entry.id === id);
        if (!item) return;

        item[key] = ["quantity", "minimum"].includes(key) ? clampNumber(value) : value;
        if (key === "workArea") {
          for (const source of record.inventory) {
            if (source.stockKey === item.stockKey) source.workArea = value;
          }
        }
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
        if (!item || item.zone === "large-freezer") return;

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
      return update((draft) => {
        const record = draft.records[draft.selectedDate];
        const identifier = globalThis.crypto?.randomUUID?.() ?? `item-${Date.now()}`;
        const locations = normalizeStorageLocations(item);
        if (!locations.length) return;

        const stockKey = `stock-${identifier}`;
        const shared = {
          stockKey,
          label: item.label,
          labelVi: item.labelVi,
          unit: item.unit || "盒",
          workArea: item.workArea || "noodles",
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
          minimum: clampNumber(item.workMinimum ?? storageItem.minimum),
          unit: storageItem.unit,
        });
      });
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
        audit(draft, "skill-delete", skill.zh.title, skill.vi.title);
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
