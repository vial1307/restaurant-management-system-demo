function text(value) {
  return String(value ?? "").trim();
}

function jsonEqual(a, b) {
  try { return JSON.stringify(a) === JSON.stringify(b); }
  catch { return false; }
}

function attendanceModule(modules = {}) {
  const input = modules?.attendance && typeof modules.attendance === "object" && !Array.isArray(modules.attendance)
    ? modules.attendance
    : {};
  return {
    ...input,
    attendance:Array.isArray(input.attendance) ? input.attendance : [],
    payroll:input.payroll && typeof input.payroll === "object" && !Array.isArray(input.payroll) ? input.payroll : {},
  };
}

function periods(payroll = {}) {
  const value = payroll?.periods;
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function monthFor(entry) {
  const date = text(entry?.date);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(0, 7) : "";
}

function lockedMonth(beforeModule, entry) {
  const month = monthFor(entry);
  return Boolean(month && periods(beforeModule.payroll)?.[month]?.status === "locked");
}

function approvalShape(entry = {}) {
  return {
    approvalStatus:entry.approvalStatus || "",
    approvedAt:entry.approvedAt || null,
    approvedByUserId:entry.approvedByUserId || "",
    approvedByName:entry.approvedByName || "",
  };
}

function clearApproval(entry) {
  const copy = { ...entry };
  delete copy.approvalStatus;
  delete copy.approvedAt;
  delete copy.approvedByUserId;
  delete copy.approvedByName;
  return copy;
}

function withoutApproval(entry) {
  return clearApproval(entry || {});
}

export function enforceSelfServiceUnlocked(beforeModules = {}, mergedModule = {}) {
  const beforeModule = attendanceModule(beforeModules);
  const incomingEntries = Array.isArray(mergedModule?.attendance) ? mergedModule.attendance : [];
  const beforeById = new Map(beforeModule.attendance.map((entry) => [text(entry?.id), entry]));

  for (const incoming of incomingEntries) {
    const previous = beforeById.get(text(incoming?.id));
    if (previous) {
      if (lockedMonth(beforeModule, previous) && !jsonEqual(previous, incoming)) {
        return { ok:false, status:409, error:"WORKFORCE_PAYROLL_PERIOD_LOCKED" };
      }
      continue;
    }
    if (lockedMonth(beforeModule, incoming)) {
      return { ok:false, status:409, error:"WORKFORCE_PAYROLL_PERIOD_LOCKED" };
    }
  }
  return { ok:true, module:mergedModule };
}

export function mergeManagedAttendance(beforeModules = {}, incomingModule = {}) {
  const beforeModule = attendanceModule(beforeModules);
  const beforeEntries = beforeModule.attendance;
  const incomingEntries = Array.isArray(incomingModule?.attendance) ? incomingModule.attendance : null;
  if (!incomingEntries) return { ok:false, status:400, error:"WORKFORCE_ATTENDANCE_INVALID" };

  const beforePeriods = periods(beforeModule.payroll);
  const incomingPayroll = incomingModule?.payroll && typeof incomingModule.payroll === "object" && !Array.isArray(incomingModule.payroll)
    ? incomingModule.payroll
    : {};
  const incomingPeriods = periods(incomingPayroll);
  if (!jsonEqual(beforePeriods, incomingPeriods)) {
    return { ok:false, status:403, error:"WORKFORCE_PAYROLL_PERIOD_DIRECT_EDIT_NOT_ALLOWED" };
  }

  const beforeById = new Map(beforeEntries.map((entry) => [text(entry?.id), entry]));
  const incomingById = new Map();
  const changedIds = [];
  const sanitized = [];

  for (const incoming of incomingEntries) {
    const id = text(incoming?.id);
    if (!id || incomingById.has(id)) return { ok:false, status:400, error:"WORKFORCE_ATTENDANCE_INVALID" };
    incomingById.set(id, incoming);
    const previous = beforeById.get(id);

    if (!previous) {
      if (lockedMonth(beforeModule, incoming)) {
        return { ok:false, status:409, error:"WORKFORCE_PAYROLL_PERIOD_LOCKED" };
      }
      changedIds.push(id);
      sanitized.push(clearApproval(incoming));
      continue;
    }

    if (!jsonEqual(approvalShape(previous), approvalShape(incoming))) {
      return { ok:false, status:403, error:"WORKFORCE_ATTENDANCE_APPROVAL_DIRECT_EDIT_NOT_ALLOWED" };
    }
    if (jsonEqual(previous, incoming)) {
      sanitized.push({ ...incoming });
      continue;
    }
    if (lockedMonth(beforeModule, previous)) {
      return { ok:false, status:409, error:"WORKFORCE_PAYROLL_PERIOD_LOCKED" };
    }

    changedIds.push(id);
    sanitized.push(clearApproval(incoming));
  }

  for (const previous of beforeEntries) {
    const id = text(previous?.id);
    if (incomingById.has(id)) continue;
    if (lockedMonth(beforeModule, previous)) {
      return { ok:false, status:409, error:"WORKFORCE_PAYROLL_PERIOD_LOCKED" };
    }
    changedIds.push(id);
  }

  const nextPayroll = { ...incomingPayroll, periods:structuredClone(beforePeriods) };
  return {
    ok:true,
    module:{ ...incomingModule, attendance:sanitized, payroll:nextPayroll },
    audit:{ changedAttendanceIds:[...new Set(changedIds.filter(Boolean))] },
  };
}

export function approvedAttendanceForMonth(moduleInput = {}, month = "") {
  const module = attendanceModule({ attendance:moduleInput });
  return module.attendance.filter((entry) => (
    text(entry?.date).startsWith(`${month}-`)
    && Boolean(entry?.clockOut)
    && entry?.approvalStatus === "approved"
  ));
}
