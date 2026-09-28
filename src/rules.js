import * as core from "./rules-core.js";
import { currentSearchEvaluationToken } from "./search-evaluation-cache.js";

export * from "./rules-core.js";

const searchCaches = new Map();

function sameArguments(left = [], right = []) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function cachedDuringSearch(name, args, compute) {
  const token = currentSearchEvaluationToken();
  if (!token) return compute();

  const cached = searchCaches.get(name);
  if (cached?.token === token && sameArguments(cached.args, args)) return cached.value;

  const value = compute();
  searchCaches.set(name, { token, args: [...args], value });
  return value;
}

export function calculateReservations(reservation, buffer = 2) {
  return cachedDuringSearch(
    "calculateReservations",
    [reservation, buffer],
    () => core.calculateReservations(reservation, buffer),
  );
}

export function calculateRice(date, remaining, settings) {
  return cachedDuringSearch(
    "calculateRice",
    [date, remaining, settings],
    () => core.calculateRice(date, remaining, settings),
  );
}

export function buildGeneratedTasks(state, date, storageGroups = []) {
  return cachedDuringSearch(
    "buildGeneratedTasks",
    [state, date, storageGroups],
    () => core.buildGeneratedTasks(state, date, storageGroups),
  );
}

export function summarizeReserveInventory(record, storageGroups = []) {
  return cachedDuringSearch(
    "summarizeReserveInventory",
    [record, storageGroups],
    () => core.summarizeReserveInventory(record, storageGroups),
  );
}

export function buildInventoryAlerts(record, storageGroups = []) {
  return cachedDuringSearch(
    "buildInventoryAlerts",
    [record, storageGroups],
    () => core.buildInventoryAlerts(record, storageGroups),
  );
}
export function calculateProcurementPlan(date, record, settings = {}, storageGroups = []) {
  return cachedDuringSearch(
    "calculateProcurementPlan",
    [date, record, settings, storageGroups],
    () => core.calculateProcurementPlan(date, record, settings, storageGroups),
  );
}
