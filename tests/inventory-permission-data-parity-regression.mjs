import assert from "node:assert/strict";
import {
  ACCOUNT_MODULES as FRONTEND_MODULES,
  normalizeAccountPermissions,
} from "../src/account-permissions.js";
import {
  ACCOUNT_MODULES as BACKEND_MODULES,
  normalizePermissionsForRole,
  permissionForRole,
} from "../vps/backend/src/permissions.mjs";

assert.deepEqual(BACKEND_MODULES, FRONTEND_MODULES, "frontend/backend account module lists diverged");

const roles = ["admin", "manager", "supervisor", "employee", "parttime", "central"];
for (const role of roles) {
  const partial = {
    inventory:{ view:false, edit:true },
    reports:{ view:true, edit:true },
  };
  const frontend = normalizeAccountPermissions(role, partial);
  const backend = normalizePermissionsForRole(role, partial);
  assert.deepEqual(backend, frontend, `${role}: frontend/backend effective permissions diverged`);
  assert.equal(permissionForRole(role, partial, "inventory", "view"), frontend.inventory.view, `${role}: backend inventory view authorization diverged`);
  assert.equal(permissionForRole(role, partial, "inventory", "edit"), frontend.inventory.edit, `${role}: backend inventory edit authorization diverged`);
  assert.equal(permissionForRole(role, partial, "dashboard", "view"), frontend.dashboard.view, `${role}: missing-key role default did not match frontend`);
}

const employeeMissingInventory = normalizePermissionsForRole("employee", { dashboard:{view:true,edit:false} });
assert.deepEqual(employeeMissingInventory.inventory, { view:true, edit:true }, "employee missing inventory permission must inherit role default");
const explicitEmployeeDeny = normalizePermissionsForRole("employee", { inventory:{view:false,edit:true} });
assert.deepEqual(explicitEmployeeDeny.inventory, { view:false, edit:false }, "explicit inventory deny must override employee role default");

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
  clear() { this.map.clear(); }
}

const storage = new MemoryStorage();
const windowTarget = new EventTarget();
globalThis.window = windowTarget;
globalThis.localStorage = storage;
globalThis.document = {
  documentElement:{ dataset:{ vpsAuthReady:"true" } },
  querySelector:() => null,
};

const { createStore, STORAGE_KEY } = await import(`../src/store.js?inventory-parity=${Date.now()}`);
const store = createStore(storage);
const selectedDate = store.getState().selectedDate;

function setSession(location) {
  storage.setItem("shitu-kitchen-auth-v1", JSON.stringify({
    id:`user-${location}`,
    role:"branch",
    accountRole:"manager",
    location,
    permissions:{ inventory:{view:true,edit:true} },
  }));
  storage.setItem("shitu-admin-active-site-v1", location);
}

function writePersistedBranchSnapshot(site, quantity, minimum) {
  const persisted = JSON.parse(storage.getItem(STORAGE_KEY));
  persisted.selectedDate = selectedDate;
  persisted.records[selectedDate].inventory = [{
    id:`${site}-beef@freezer`,
    stockKey:`${site}:beef`,
    catalogKey:"beef",
    label:"牛肉",
    labelVi:"Thịt bò",
    unit:"包",
    workArea:"meat",
    zone:"large-freezer",
    quantity,
    minimum,
  }];
  persisted.records[selectedDate].workInventory = [{
    id:`${site}-beef@work`,
    stockKey:`${site}:beef`,
    catalogKey:"beef",
    label:"牛肉",
    labelVi:"Thịt bò",
    unit:"包",
    workArea:"meat",
    quantity:0,
    minimum:0,
  }];
  storage.setItem(STORAGE_KEY, JSON.stringify(persisted));
}

setSession("fuxing");
writePersistedBranchSnapshot("fuxing", 10, 4);
windowTarget.dispatchEvent(new CustomEvent("shitu:inventory-cloud-updated", { detail:{site:"fuxing"} }));
assert.equal(store.getState().records[selectedDate].inventorySite, "fuxing", "Fuxing snapshot must carry Fuxing identity");
assert.equal(store.getState().records[selectedDate].inventory[0]?.quantity, 10, "Fuxing authoritative quantity not hydrated into store");

storage.setItem("shitu-admin-active-site-v1", "yongji");
windowTarget.dispatchEvent(new CustomEvent("shitu:active-site-changed", { detail:{site:"yongji"} }));
assert.equal(store.getState().records[selectedDate].inventorySite, "yongji", "site transition must update rendered snapshot identity immediately");
assert.deepEqual(store.getState().records[selectedDate].inventory, [], "uncached Yongji transition must not retain Fuxing inventory");
assert.deepEqual(store.getState().records[selectedDate].workInventory, [], "uncached Yongji transition must not retain Fuxing work inventory");

writePersistedBranchSnapshot("yongji", 2, 1);
windowTarget.dispatchEvent(new CustomEvent("shitu:inventory-cloud-updated", { detail:{site:"yongji"} }));
assert.equal(store.getState().records[selectedDate].inventorySite, "yongji");
assert.equal(store.getState().records[selectedDate].inventory[0]?.quantity, 2, "Yongji authoritative quantity not hydrated into store");

storage.setItem("shitu-admin-active-site-v1", "fuxing");
windowTarget.dispatchEvent(new CustomEvent("shitu:active-site-changed", { detail:{site:"fuxing"} }));
assert.equal(store.getState().records[selectedDate].inventorySite, "fuxing");
assert.equal(store.getState().records[selectedDate].inventory[0]?.quantity, 10, "Fuxing cached snapshot should hydrate instead of leaking Yongji quantity");

setSession("yongji");
windowTarget.dispatchEvent(new CustomEvent("shitu:auth-synced"));
assert.equal(store.getState().records[selectedDate].inventorySite, "yongji", "auth transition must reconcile inventory site");
assert.equal(store.getState().records[selectedDate].inventory[0]?.quantity, 2, "auth transition must hydrate the target user's site snapshot");

console.log("INVENTORY_PERMISSION_DATA_PARITY_REGRESSION_OK");
