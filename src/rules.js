export const DAY_CODES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function clampNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
}

export function calculateReservations(reservation, buffer = 2) {
  const lunchTables = clampNumber(reservation.lunchTables);
  const dinnerTables = clampNumber(reservation.dinnerTables);
  const tables = lunchTables + dinnerTables;
  const target = tables > 0 ? tables + clampNumber(buffer) : 0;
  const remaining = reservation.remaining ?? {};

  return {
    lunchTables,
    dinnerTables,
    tables,
    buffer: tables > 0 ? clampNumber(buffer) : 0,
    target,
    portions: ["vegetables", "braised", "hotpot"].map((key) => ({
      key,
      remaining: clampNumber(remaining[key]),
      target,
      required: Math.max(0, target - clampNumber(remaining[key])),
    })),
  };
}

export function dayCodeForDate(date) {
  const parsed = new Date(`${date}T12:00:00`);
  return DAY_CODES[parsed.getDay()] ?? "mon";
}

export function calculateRice(date, remaining, settings) {
  const dayCode = dayCodeForDate(date);
  const isWeekendService = ["fri", "sat", "sun"].includes(dayCode);
  const standard = clampNumber(isWeekendService ? settings.riceWeekend : settings.riceWeekday);
  const leftovers = clampNumber(remaining);
  const skipThreshold = clampNumber(settings.riceSkipAbove, 2000);
  const toCook = leftovers > skipThreshold ? 0 : standard;

  return {
    dayCode,
    isWeekendService,
    standard,
    remaining: leftovers,
    toCook,
    water: toCook,
    ice: Math.round((toCook / 1000) * 7),
    oil: Math.round(toCook / 1000),
  };
}

export function inventoryStatus(item) {
  const quantity = clampNumber(item.quantity);
  const minimum = clampNumber(item.minimum);

  if (quantity === 0) return "empty";
  if (quantity < minimum) return "low";
  return "ok";
}

export function inventoryRestock(item) {
  return Math.max(0, clampNumber(item.minimum) - clampNumber(item.quantity));
}

const SOURCE_PRIORITY = {
  "large-fridge": 0,
  "large-freezer": 1,
  "four-door": 2,
  kitchen: 3,
};

export function inventorySources(record, item, destination = "work") {
  const stockKey = item.stockKey ?? item.id;
  const eligibleZones = destination === "large-fridge"
    ? ["large-freezer"]
    : destination === "four-door" || destination === "kitchen"
      ? ["large-fridge", "large-freezer"]
      : null;

  return (record.inventory ?? [])
    .filter((entry) => {
      if ((entry.stockKey ?? entry.id) !== stockKey || clampNumber(entry.quantity) <= 0) return false;
      if (entry.id === item.id || entry.zone === destination) return false;
      return !eligibleZones || eligibleZones.includes(entry.zone);
    })
    .sort((left, right) => {
      const priority = (SOURCE_PRIORITY[left.zone] ?? 9) - (SOURCE_PRIORITY[right.zone] ?? 9);
      return priority || clampNumber(right.quantity) - clampNumber(left.quantity);
    });
}

export function summarizeReserveInventory(record) {
  const grouped = new Map();

  for (const item of record.inventory ?? []) {
    const stockKey = item.stockKey ?? item.id;
    const minimum = clampNumber(item.minimum);
    const existing = grouped.get(stockKey);

    if (!existing) {
      grouped.set(stockKey, {
        ...item,
        id: `reserve-${stockKey}`,
        stockKey,
        kind: "reserve",
        quantity: clampNumber(item.quantity),
        minimum,
        zones: [item.zone],
      });
      continue;
    }

    existing.quantity += clampNumber(item.quantity);
    if (!existing.zones.includes(item.zone)) existing.zones.push(item.zone);
    if (minimum > existing.minimum || (minimum === existing.minimum && existing.zone === "kitchen" && item.zone !== "kitchen")) {
      existing.minimum = minimum;
      existing.zone = item.zone;
      existing.label = item.label;
      existing.labelVi = item.labelVi;
      existing.unit = item.unit;
    }
  }

  return [...grouped.values()];
}

export function buildInventoryAlerts(record) {
  const reserves = summarizeReserveInventory(record);
  const workAlerts = (record.workInventory ?? record.inventory ?? [])
    .filter((item) => inventoryStatus(item) !== "ok")
    .map((item) => {
      const reserve = reserves.find((entry) => entry.stockKey === (item.stockKey ?? item.id));
      return { ...item, kind: "work", available: reserve?.quantity ?? 0 };
    });
  const freezerStocks = new Map();

  for (const item of record.inventory ?? []) {
    if (item.zone !== "large-freezer") continue;
    const stockKey = item.stockKey ?? item.id;
    const existing = freezerStocks.get(stockKey);
    if (existing) {
      existing.quantity += clampNumber(item.quantity);
      existing.minimum = Math.max(existing.minimum, clampNumber(item.minimum));
      continue;
    }
    freezerStocks.set(stockKey, {
      ...item,
      id: `reserve-${stockKey}`,
      stockKey,
      kind: "reserve",
      quantity: clampNumber(item.quantity),
      minimum: Math.max(1, clampNumber(item.minimum)),
    });
  }

  const reserveAlerts = [...freezerStocks.values()].filter((item) => item.quantity === 0);
  const storageAlerts = (record.inventory ?? [])
    .filter((item) => item.zone !== "large-freezer" && inventoryRestock(item) > 0)
    .map((item) => {
      const sources = inventorySources(record, item, item.zone);
      return {
        ...item,
        kind: "storage",
        source: sources[0]?.zone ?? null,
        available: sources.reduce((total, source) => total + clampNumber(source.quantity), 0),
      };
    });

  return [...workAlerts, ...reserveAlerts, ...storageAlerts].sort((left, right) => {
    const statusOrder = { empty: 0, low: 1, ok: 2 };
    const byStatus = statusOrder[inventoryStatus(left)] - statusOrder[inventoryStatus(right)];
    if (byStatus) return byStatus;
    const kindOrder = { reserve: 0, storage: 1, work: 2 };
    const byKind = (kindOrder[left.kind] ?? 3) - (kindOrder[right.kind] ?? 3);
    if (byKind) return byKind;
    return inventoryRestock(right) - inventoryRestock(left);
  });
}

export function buildGeneratedTasks(state, date) {
  const record = state.records[date];
  const reservations = calculateReservations(record.reservation, state.settings.reservationBuffer);
  const rice = calculateRice(date, record.riceRemaining, state.settings);
  const tasks = [];

  for (const portion of reservations.portions) {
    if (portion.required > 0) {
      tasks.push({
        id: `reservation-${portion.key}`,
        kind: "reservation",
        key: portion.key,
        amount: portion.required,
        unit: "portion",
        priority: portion.remaining === 0 ? "high" : "medium",
      });
    }
  }

  for (const item of record.workInventory ?? record.inventory) {
    const needed = inventoryRestock(item);
    if (needed > 0) {
      const sources = inventorySources(record, item);
      const source = sources[0];
      const available = sources.reduce((total, entry) => total + clampNumber(entry.quantity), 0);
      const freezerStocks = record.inventory.filter((entry) => entry.stockKey === item.stockKey && entry.zone === "large-freezer");
      tasks.push({
        id: `inventory-${item.id}`,
        kind: available > 0 ? "inventory" : "inventory-blocked",
        itemId: item.id,
        label: item.label,
        labelVi: item.labelVi,
        workArea: item.workArea,
        zone: source?.zone ?? item.zone,
        amount: available > 0 ? Math.min(needed, available) : needed,
        needed,
        available,
        awaitingFactory: freezerStocks.length > 0 && freezerStocks.every((entry) => clampNumber(entry.quantity) === 0),
        unit: item.unit,
        priority: inventoryStatus(item) === "empty" || available === 0 ? "high" : "medium",
      });
    }
  }

  for (const item of record.inventory) {
    if (item.zone === "large-freezer") continue;
    const needed = inventoryRestock(item);
    if (needed <= 0) continue;

    const sources = inventorySources(record, item, item.zone);
    const source = sources[0];
    const available = sources.reduce((total, entry) => total + clampNumber(entry.quantity), 0);

    tasks.push({
      id: `storage-${item.id}`,
      kind: "storage-restock",
      itemId: item.id,
      stockKey: item.stockKey,
      label: item.label,
      labelVi: item.labelVi,
      workArea: item.workArea,
      zone: item.zone,
      sourceZone: source?.zone ?? null,
      amount: available > 0 ? Math.min(needed, available) : needed,
      needed,
      available,
      unit: item.unit,
      priority: inventoryStatus(item) === "empty" ? "high" : "medium",
    });
  }

  for (const reserve of buildInventoryAlerts(record).filter((item) => item.kind === "reserve")) {
    const needed = inventoryRestock(reserve);

    tasks.push({
      id: `factory-${reserve.stockKey}`,
      kind: "procurement",
      itemId: reserve.id,
      stockKey: reserve.stockKey,
      label: reserve.label,
      labelVi: reserve.labelVi,
      workArea: reserve.workArea,
      zone: reserve.zone,
      amount: needed,
      quantity: reserve.quantity,
      minimum: reserve.minimum,
      unit: reserve.unit,
      priority: "high",
    });
  }

  if (rice.toCook > 0) {
    tasks.push({
      id: "rice-cook",
      kind: "rice",
      amount: rice.toCook,
      unit: "g",
      priority: "medium",
    });
  }

  for (const task of state.settings.checklist) {
    tasks.push({ ...task, kind: "checklist", priority: "normal" });
  }

  return tasks.sort((left, right) => {
    const priorities = { high: 0, medium: 1, normal: 2 };
    const priorityDifference = priorities[left.priority] - priorities[right.priority];
    if (priorityDifference) return priorityDifference;

    const kinds = { procurement: 0, "storage-restock": 1, "inventory-blocked": 2, inventory: 3, reservation: 4, rice: 5, checklist: 6 };
    return (kinds[left.kind] ?? 7) - (kinds[right.kind] ?? 7);
  });
}

export function completionSummary(tasks, completed) {
  const done = tasks.filter((task) => Boolean(completed[task.id])).length;
  return {
    total: tasks.length,
    done,
    pending: Math.max(0, tasks.length - done),
    percentage: tasks.length ? Math.round((done / tasks.length) * 100) : 100,
  };
}

export function formatDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function shiftDate(date, offset) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + offset);
  return formatDateKey(value);
}

export function shiftMonth(date, offset) {
  const value = new Date(`${date}T12:00:00`);
  const day = value.getDate();
  value.setDate(1);
  value.setMonth(value.getMonth() + Number(offset));
  const lastDay = new Date(value.getFullYear(), value.getMonth() + 1, 0).getDate();
  value.setDate(Math.min(day, lastDay));
  return formatDateKey(value);
}

export function calendarDays(year, month) {
  const first = new Date(Number(year), Number(month), 1, 12);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return {
      date: formatDateKey(day),
      day: day.getDate(),
      currentMonth: day.getMonth() === first.getMonth(),
    };
  });
}
