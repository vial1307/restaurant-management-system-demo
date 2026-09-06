import assert from "node:assert/strict";

const BASE = process.env.TEST_API_BASE || "http://127.0.0.1:8080";
const PASSWORD = "KitchenTest!123";

async function call(path, { method = "GET", body, cookie } = {}) {
  const response = await fetch(BASE + path, {
    method,
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await response.json(); } catch {}
  return { response, data, cookie: response.headers.get("set-cookie")?.split(";")[0] || "" };
}

async function login(username) {
  const result = await call("/api/auth/login", { method: "POST", body: { username, password: PASSWORD } });
  assert.equal(result.response.status, 200, `login failed: ${username}`);
  return result.cookie;
}

const health = await call("/api/health");
assert.equal(health.response.status, 200);
assert.equal(health.data.schema, "006", "module revision migration is not active");

const admin = await login("yangchuadmin");
const employee = await login("employeefx");
const initial = await call("/api/business-state/fuxing", { cookie: admin });
assert.equal(initial.response.status, 200);
assert.equal(typeof initial.data.moduleRevisions, "object", "GET must expose module revisions");
const employeeRead = await call("/api/business-state/fuxing", { cookie: employee });
assert.equal(employeeRead.data.moduleRevisions?.settings, undefined, "revision metadata leaked non-viewable settings state");
assert.equal(employeeRead.data.modules?.audit, undefined, "employee unexpectedly received protected audit payload");

const originalAttendance = structuredClone(initial.data.modules.attendance || { attendance: [], payroll: {} });
const originalSettings = structuredClone(initial.data.modules.settings || {});
const attendanceRevision = Number(initial.data.moduleRevisions.attendance || 0);

const unguarded = await call("/api/business-state/fuxing", {
  method: "POST", cookie: admin, body: { modules: { attendance: originalAttendance } },
});
assert.equal(unguarded.response.status, 409);
assert.equal(unguarded.data.error, "BUSINESS_STATE_REVISION_REQUIRED");

const writerA = { ...originalAttendance, payroll: { ...(originalAttendance.payroll || {}), conflictMarker: "A" } };
const writerB = { ...originalAttendance, payroll: { ...(originalAttendance.payroll || {}), conflictMarker: "B" } };
const first = await call("/api/business-state/fuxing", {
  method: "POST", cookie: admin,
  body: { modules: { attendance: writerA }, expectedModuleRevisions: { attendance: attendanceRevision } },
});
assert.equal(first.response.status, 200, JSON.stringify(first.data));
assert.equal(Number(first.data.moduleRevisions.attendance), attendanceRevision + 1);

const stale = await call("/api/business-state/fuxing", {
  method: "POST", cookie: employee,
  body: { modules: { attendance: writerB }, expectedModuleRevisions: { attendance: attendanceRevision } },
});
assert.equal(stale.response.status, 409, JSON.stringify(stale.data));
assert.equal(stale.data.error, "BUSINESS_STATE_CONFLICT");
assert.deepEqual(stale.data.conflictingModules, ["attendance"]);

const afterStale = await call("/api/business-state/fuxing", { cookie: admin });
assert.equal(afterStale.data.modules.attendance.payroll.conflictMarker, "A", "stale writer replaced the winning module");

const restoreAttendance = await call("/api/business-state/fuxing", {
  method: "POST", cookie: admin,
  body: {
    modules: { attendance: originalAttendance },
    expectedModuleRevisions: { attendance: Number(first.data.moduleRevisions.attendance) },
  },
});
assert.equal(restoreAttendance.response.status, 200);

const shared = await call("/api/business-state/fuxing", { cookie: admin });
const settingsRevision = Number(shared.data.moduleRevisions.settings || 0);
const nextAttendanceRevision = Number(shared.data.moduleRevisions.attendance || 0);
const settingsPayload = { ...originalSettings, crossModuleMarker: "settings" };
const attendancePayload = { ...originalAttendance, payroll: { ...(originalAttendance.payroll || {}), crossModuleMarker: "attendance" } };

const [settingsWrite, attendanceWrite] = await Promise.all([
  call("/api/business-state/fuxing", {
    method: "POST", cookie: admin,
    body: { modules: { settings: settingsPayload }, expectedModuleRevisions: { settings: settingsRevision } },
  }),
  call("/api/business-state/fuxing", {
    method: "POST", cookie: employee,
    body: { modules: { attendance: attendancePayload }, expectedModuleRevisions: { attendance: nextAttendanceRevision } },
  }),
]);
assert.equal(settingsWrite.response.status, 200, JSON.stringify(settingsWrite.data));
assert.equal(attendanceWrite.response.status, 200, JSON.stringify(attendanceWrite.data));

const restore = await call("/api/business-state/fuxing", {
  method: "POST", cookie: admin,
  body: {
    modules: { settings: originalSettings, attendance: originalAttendance },
    expectedModuleRevisions: {
      settings: Number(settingsWrite.data.moduleRevisions.settings),
      attendance: Number(attendanceWrite.data.moduleRevisions.attendance),
    },
  },
});
assert.equal(restore.response.status, 200, JSON.stringify(restore.data));

// Audit entries are append-only and deduplicated by id. They do not require a
// read token and must not block employee writes merely because audit is hidden.
const auditA = { id: "concurrency-audit-a", kind: "test", label: "A", details: "", staffId: "a", staffName: "A", at: "2026-09-06T05:00:00.000Z" };
const auditB = { id: "concurrency-audit-b", kind: "test", label: "B", details: "", staffId: "b", staffName: "B", at: "2026-09-06T05:00:01.000Z" };
const [auditWriteA, auditWriteB] = await Promise.all([
  call("/api/business-state/fuxing", { method: "POST", cookie: admin, body: { modules: { audit: { audit: [auditA] } } } }),
  call("/api/business-state/fuxing", { method: "POST", cookie: employee, body: { modules: { audit: { audit: [auditB] } } } }),
]);
assert.equal(auditWriteA.response.status, 200, JSON.stringify(auditWriteA.data));
assert.equal(auditWriteB.response.status, 200, JSON.stringify(auditWriteB.data));
const auditRead = await call("/api/business-state/fuxing", { cookie: admin });
const auditEntries = auditRead.data.modules.audit?.audit || [];
const auditIds = new Set(auditEntries.map((entry) => entry.id));
assert(auditIds.has(auditA.id) && auditIds.has(auditB.id), "concurrent audit append lost an entry");

// Reusing an existing audit id must never mutate the persisted event.
const auditTamper = { ...auditA, label: "TAMPERED", details: "must-not-replace-server-entry" };
const auditTamperWrite = await call("/api/business-state/fuxing", {
  method: "POST", cookie: admin, body: { modules: { audit: { audit: [auditTamper] } } },
});
assert.equal(auditTamperWrite.response.status, 200, JSON.stringify(auditTamperWrite.data));
const auditAfterTamper = await call("/api/business-state/fuxing", { cookie: admin });
const persistedAuditA = (auditAfterTamper.data.modules.audit?.audit || []).find((entry) => entry.id === auditA.id);
assert.equal(persistedAuditA?.label, "A", "append-only audit entry was rewritten by duplicate id");
assert.equal(persistedAuditA?.details, "", "append-only audit details were rewritten by duplicate id");

console.log("BUSINESS_MODULE_CONFLICT_OK");
