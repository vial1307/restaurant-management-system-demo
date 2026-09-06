import assert from "node:assert/strict";
import { createStore } from "../src/store-core.js";

class FakeStorage {
  constructor() {
    this.values = new Map();
    this.writes = 0;
  }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) {
    this.writes += 1;
    this.values.set(key, String(value));
  }
}

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { onLine: false } });

try {
  const storage = new FakeStorage();
  const store = createStore(storage);
  let notifications = 0;
  store.subscribe(() => { notifications += 1; });

  const signals = () => {
    const state = store.getState();
    const record = state.records[state.selectedDate];
    return {
      writes: storage.writes,
      notifications,
      updatedAt: record?.updatedAt,
      pendingSync: state.operations?.pendingSync,
    };
  };

  const assertNoop = (label, action) => {
    const before = signals();
    action();
    assert.deepEqual(signals(), before, `${label} must not persist, notify, bump updatedAt or increment pendingSync`);
  };

  const assertRealChange = (label, action) => {
    const before = signals();
    action();
    const after = signals();
    assert.equal(after.writes, before.writes + 1, `${label} must persist exactly once`);
    assert.equal(after.notifications, before.notifications + 1, `${label} must notify exactly once`);
    assert.equal(after.pendingSync, before.pendingSync + 1, `${label} must increment offline pendingSync once`);
  };

  const initial = store.getState();
  const initialRecord = initial.records[initial.selectedDate];

  // selectDate is deliberately NOT an optimization target: the current app
  // relies on its notification lifecycle even when the date is unchanged.
  const sameDate = store.getState().selectedDate;
  assertRealChange("same selected date lifecycle", () => store.selectDate(sameDate));
  assert.equal(store.getState().selectedDate, sameDate, "same-date lifecycle must preserve selected date");

  assertRealChange("real rice change", () => store.updateRice(initialRecord.riceRemaining + 1));
  const rice = store.getState().records[store.getState().selectedDate].riceRemaining;
  assertNoop("same normalized rice", () => store.updateRice(String(rice)));

  assertNoop("same language setting", () => store.updateSetting("language", store.getState().settings.language));

  const record = store.getState().records[store.getState().selectedDate];
  assertNoop("same normalized reservation", () => store.updateReservation("lunchTables", String(record.reservation.lunchTables)));
  assertNoop("same normalized remaining", () => store.updateRemaining("vegetables", String(record.reservation.remaining.vegetables)));

  assertRealChange("new procurement line", () => store.updateProcurementLine("scalar-noop-probe", "planned", 3));
  assertNoop("same normalized procurement line", () => store.updateProcurementLine("scalar-noop-probe", "planned", "3"));
  assertRealChange("absent zero procurement line", () => store.updateProcurementLine("scalar-zero-probe", "incoming", 0));
  assert.equal(record.procurement.incoming["scalar-zero-probe"], 0, "absent zero procurement key must be materialized");
  assertNoop("same zero procurement line", () => store.updateProcurementLine("scalar-zero-probe", "incoming", "0"));
  assertNoop("same procurement order date", () => store.updateProcurementOrderDate("noodles", record.procurement.orderDates.noodles));
  assertNoop("invalid procurement order date", () => store.updateProcurementOrderDate("noodles", "not-a-date"));

  const inventoryItem = record.inventory.find((item) => item && item.id);
  assert.ok(inventoryItem, "default inventory item is required");
  assertNoop("same normalized inventory quantity", () => store.updateItem(inventoryItem.id, "quantity", String(inventoryItem.quantity)));
  assertNoop("missing inventory item", () => store.updateItem("missing-inventory-item", "quantity", 1));

  const workItem = record.workInventory.find((item) => item && item.id);
  assert.ok(workItem, "default work inventory item is required");
  assertNoop("same normalized work quantity", () => store.updateWorkItem(workItem.id, "quantity", String(workItem.quantity)));
  assertNoop("missing work inventory item", () => store.updateWorkItem("missing-work-item", "quantity", 1));

  const linkedStorage = record.inventory.find((item) => record.workInventory.some((work) => work.stockKey === item.stockKey));
  assert.ok(linkedStorage, "linked inventory/work pair is required");
  const linkedWork = record.workInventory.find((item) => item.stockKey === linkedStorage.stockKey);
  const authoritativeLabel = linkedStorage.label;
  linkedWork.label = "__stale-linked-label__";
  assertRealChange("linked inventory repair", () => store.updateItem(linkedStorage.id, "label", authoritativeLabel));
  assert.equal(linkedWork.label, authoritativeLabel, "same primary label must repair stale linked work row");

  linkedStorage.workArea = "__stale-area__";
  const authoritativeArea = linkedWork.workArea;
  assertRealChange("linked work-area repair", () => store.updateWorkItem(linkedWork.id, "workArea", authoritativeArea));
  assert.equal(linkedStorage.workArea, authoritativeArea, "same work-item area must repair stale linked storage rows");

  console.log("STORE_SCALAR_NOOP_V2_REGRESSION_OK");
} finally {
  if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
  else delete globalThis.navigator;
}
