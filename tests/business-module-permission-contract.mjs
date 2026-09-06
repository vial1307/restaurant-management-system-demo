import assert from "node:assert/strict";
import { canBusinessModule } from "../vps/backend/src/business-state-routes.mjs";

function userWith(permissions, role = "employee") {
  return { role, permissions };
}

const dashboardEditor = userWith({
  dashboard: { view: true, edit: true },
  reservations: { view: false, edit: false },
  preparation: { view: false, edit: false },
});

assert.equal(
  canBusinessModule(dashboardEditor, "reservations", "view"),
  true,
  "dashboard view fallback should still expose reservation summary data"
);
assert.equal(
  canBusinessModule(dashboardEditor, "preparation", "view"),
  true,
  "dashboard view fallback should still expose preparation summary data"
);
assert.equal(
  canBusinessModule(dashboardEditor, "reservations", "edit"),
  false,
  "dashboard:edit must not grant reservations:edit"
);
assert.equal(
  canBusinessModule(dashboardEditor, "preparation", "edit"),
  false,
  "dashboard:edit must not grant preparation:edit"
);

const reservationsEditor = userWith({
  dashboard: { view: true, edit: false },
  reservations: { view: true, edit: true },
  preparation: { view: true, edit: false },
});
assert.equal(canBusinessModule(reservationsEditor, "reservations", "edit"), true);
assert.equal(canBusinessModule(reservationsEditor, "preparation", "edit"), false);

const preparationEditor = userWith({
  dashboard: { view: true, edit: false },
  reservations: { view: true, edit: false },
  preparation: { view: true, edit: true },
});
assert.equal(canBusinessModule(preparationEditor, "reservations", "edit"), false);
assert.equal(canBusinessModule(preparationEditor, "preparation", "edit"), true);

const admin = userWith({}, "admin");
assert.equal(canBusinessModule(admin, "reservations", "edit"), true);
assert.equal(canBusinessModule(admin, "preparation", "edit"), true);

console.log("business module permission contract passed");
