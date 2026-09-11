const SELF_SERVICE_ROLES = new Set(["employee", "parttime"]);

function text(value) {
  return String(value ?? "").trim();
}

function identity(value) {
  return text(value).toLocaleLowerCase("en-US");
}

function staffRoster(modules = {}) {
  return Array.isArray(modules?.shared?.staff) ? modules.shared.staff : [];
}

function jsonEqual(a, b) {
  try { return JSON.stringify(a) === JSON.stringify(b); }
  catch { return false; }
}

function validTimestamp(value) {
  if (!value) return false;
  const time = Date.parse(String(value));
  return Number.isFinite(time);
}

function omitHourlyRate(member) {
  if (!member || typeof member !== "object") return member;
  const copy = { ...member };
  delete copy.hourlyRate;
  delete copy.hourly_rate;
  return copy;
}

function selfServicePayroll(payroll = {}) {
  const scoped = payroll && typeof payroll === "object" && !Array.isArray(payroll)
    ? structuredClone(payroll)
    : {};
  if (!scoped.periods || typeof scoped.periods !== "object" || Array.isArray(scoped.periods)) return scoped;
  scoped.periods = Object.fromEntries(Object.entries(scoped.periods).flatMap(([month, period]) => {
    if (!period || typeof period !== "object" || Array.isArray(period)) return [];
    return [[month, {
      month:text(period.month || month),
      status:text(period.status || "open"),
      lockedAt:period.lockedAt || null,
      ...(period.policySnapshot && typeof period.policySnapshot === "object" && !Array.isArray(period.policySnapshot)
        ? { policySnapshot:structuredClone(period.policySnapshot) }
        : {}),
    }]];
  }));
  return scoped;
}

export function isWorkforceSelfServiceUser(user) {
  return SELF_SERVICE_ROLES.has(String(user?.role || ""));
}

export function resolveWorkforceStaffId(user, modules = {}) {
  if (!user || !isWorkforceSelfServiceUser(user)) return "";
  const staff = staffRoster(modules).filter((member) => member && text(member.id));
  if (!staff.length) return "";

  const userId = text(user.id);
  const username = identity(user.username);
  const explicitMatches = staff.filter((member) => {
    const boundUserId = text(member.accountUserId || member.account_user_id || member.userId || member.user_id);
    const boundUsername = identity(member.accountUsername || member.account_username);
    return (userId && boundUserId === userId) || (username && boundUsername === username);
  });
  if (explicitMatches.length === 1) return text(explicitMatches[0].id);
  if (explicitMatches.length > 1) return "";

  const displayName = identity(user.display_name || user.displayName || user.name);
  if (!displayName) return "";
  const nameMatches = staff.filter((member) => identity(member.name) === displayName);
  return nameMatches.length === 1 ? text(nameMatches[0].id) : "";
}

export function scopeWorkforceModules(user, modules = {}, identityModules = modules) {
  if (!isWorkforceSelfServiceUser(user)) return modules;
  const staffId = resolveWorkforceStaffId(user, identityModules);
  const scoped = { ...modules };

  if (modules.attendance && typeof modules.attendance === "object") {
    scoped.attendance = {
      ...modules.attendance,
      attendance: Array.isArray(modules.attendance.attendance)
        ? modules.attendance.attendance.filter((entry) => staffId && String(entry?.staffId || "") === staffId)
        : [],
      payroll:selfServicePayroll(modules.attendance.payroll || {}),
    };
  }

  if (modules.schedule && typeof modules.schedule === "object") {
    scoped.schedule = {
      ...modules.schedule,
      schedules: Array.isArray(modules.schedule.schedules)
        ? modules.schedule.schedules.filter((entry) => staffId && String(entry?.staffId || "") === staffId)
        : [],
    };
  }

  if (modules.shared && typeof modules.shared === "object") {
    scoped.shared = {
      ...modules.shared,
      activeStaffId: staffId,
      staff: Array.isArray(modules.shared.staff)
        ? modules.shared.staff.map((member) => String(member?.id || "") === staffId ? member : omitHourlyRate(member))
        : [],
    };
  }

  return scoped;
}

function immutableAttendanceFieldsEqual(before, incoming) {
  const next = { ...incoming, clockOut: before.clockOut ?? null };
  return jsonEqual(before, next);
}

function scheduledStartFor(beforeModules, staffId, date) {
  const schedules = Array.isArray(beforeModules?.schedule?.schedules) ? beforeModules.schedule.schedules : [];
  const staffSchedules = schedules.filter((entry) => String(entry?.staffId || "") === staffId);
  const dayCandidates = staffSchedules.filter((entry) => entry?.applyMode !== "month" && String(entry?.date || "") === date);
  if (dayCandidates.length === 1) return text(dayCandidates[0].start);
  if (dayCandidates.length > 1) return "";

  const month = String(date).slice(0, 7);
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const recurringCandidates = staffSchedules.filter((entry) => (
    entry?.applyMode === "month"
    && String(entry?.month || "") === month
    && Number(entry?.weekday) === weekday
  ));
  return recurringCandidates.length === 1 ? text(recurringCandidates[0].start) : "";
}

export function mergeSelfServiceAttendance(user, beforeModules = {}, incomingModule = {}) {
  if (!isWorkforceSelfServiceUser(user)) {
    return { ok:true, module:incomingModule, staffId:"" };
  }

  const staffId = resolveWorkforceStaffId(user, beforeModules);
  if (!staffId) return { ok:false, error:"WORKFORCE_STAFF_IDENTITY_REQUIRED" };

  const roster = staffRoster(beforeModules);
  const member = roster.find((entry) => String(entry?.id || "") === staffId);
  if (!member) return { ok:false, error:"WORKFORCE_STAFF_IDENTITY_REQUIRED" };

  const beforeModule = beforeModules.attendance && typeof beforeModules.attendance === "object"
    ? beforeModules.attendance
    : { attendance:[], payroll:{} };
  const beforeEntries = Array.isArray(beforeModule.attendance) ? beforeModule.attendance : [];
  const incomingEntries = Array.isArray(incomingModule?.attendance) ? incomingModule.attendance : null;
  if (!incomingEntries) return { ok:false, error:"WORKFORCE_ATTENDANCE_INVALID" };

  if (!jsonEqual(incomingModule?.payroll || {}, selfServicePayroll(beforeModule.payroll || {}))) {
    return { ok:false, error:"WORKFORCE_PAYROLL_EDIT_NOT_ALLOWED" };
  }
  if (incomingEntries.some((entry) => String(entry?.staffId || "") !== staffId)) {
    return { ok:false, error:"WORKFORCE_CROSS_STAFF_EDIT_NOT_ALLOWED" };
  }

  const beforeOwn = beforeEntries.filter((entry) => String(entry?.staffId || "") === staffId);
  const beforeById = new Map(beforeOwn.map((entry) => [String(entry?.id || ""), entry]));
  const incomingById = new Map();
  for (const entry of incomingEntries) {
    const id = text(entry?.id);
    if (!id || incomingById.has(id)) return { ok:false, error:"WORKFORCE_ATTENDANCE_INVALID" };
    incomingById.set(id, entry);
  }

  for (const previous of beforeOwn) {
    const id = text(previous.id);
    const incoming = incomingById.get(id);
    if (!incoming) return { ok:false, error:"WORKFORCE_ATTENDANCE_DELETE_NOT_ALLOWED" };
    if (jsonEqual(previous, incoming)) continue;
    const validClockOutTransition = !previous.clockOut
      && Boolean(incoming.clockOut)
      && immutableAttendanceFieldsEqual(previous, incoming)
      && validTimestamp(previous.clockIn)
      && validTimestamp(incoming.clockOut)
      && Date.parse(String(incoming.clockOut)) >= Date.parse(String(previous.clockIn));
    if (!validClockOutTransition) {
      return { ok:false, error:"WORKFORCE_ATTENDANCE_CORRECTION_NOT_ALLOWED" };
    }
  }

  const additions = incomingEntries.filter((entry) => !beforeById.has(text(entry?.id)));
  if (additions.length > 1) return { ok:false, error:"WORKFORCE_CLOCK_IN_LIMIT" };
  if (additions.length && beforeOwn.some((entry) => !entry?.clockOut)) {
    return { ok:false, error:"WORKFORCE_ALREADY_CLOCKED_IN" };
  }

  let canonicalAddition = null;
  if (additions.length) {
    const input = additions[0];
    const id = text(input.id);
    const date = text(input.date);
    if (!id || beforeEntries.some((entry) => text(entry?.id) === id)) {
      return { ok:false, error:"WORKFORCE_ATTENDANCE_INVALID" };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !validTimestamp(input.clockIn) || input.clockOut) {
      return { ok:false, error:"WORKFORCE_CLOCK_IN_INVALID" };
    }
    canonicalAddition = {
      ...input,
      id,
      date,
      staffId,
      staffName:text(member.name),
      area:text(member.area),
      hourlyRate:Math.max(0, Number(member.hourlyRate) || 0),
      scheduledStart:scheduledStartFor(beforeModules, staffId, date),
      breakMinutes:0,
      clockIn:String(input.clockIn),
      clockOut:null,
      note:text(input.note),
    };
  }

  const acceptedOwn = incomingEntries
    .filter((entry) => beforeById.has(text(entry?.id)))
    .map((entry) => ({ ...entry }));
  const acceptedById = new Map(acceptedOwn.map((entry) => [text(entry.id), entry]));
  const mergedExisting = beforeEntries.map((entry) => {
    const id = text(entry?.id);
    return String(entry?.staffId || "") === staffId && acceptedById.has(id)
      ? acceptedById.get(id)
      : entry;
  });
  const mergedAttendance = canonicalAddition ? [canonicalAddition, ...mergedExisting] : mergedExisting;

  return {
    ok:true,
    staffId,
    module:{
      ...beforeModule,
      attendance:mergedAttendance,
      payroll:beforeModule.payroll || {},
    },
  };
}