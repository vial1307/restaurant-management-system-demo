const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const EFFECTIVE_KINDS = new Set(["leave", "override"]);

function text(value) {
  return String(value ?? "").trim();
}

function appliesOnDate(entry, date) {
  if (!entry || !DATE_RE.test(date)) return false;
  if (entry.applyMode !== "month") return text(entry.date) === date;
  const month = date.slice(0, 7);
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return text(entry.month) === month && Number(entry.weekday) === weekday;
}

function coversShift(entry, shift) {
  return entry?.shift === shift || entry?.shift === "full" || entry?.shift === "custom";
}

function validOverride(exception, base) {
  return exception?.kind === "override"
    && TIME_RE.test(text(exception.start))
    && TIME_RE.test(text(exception.end))
    && text(exception.start) !== text(exception.end)
    && text(exception.sourceScheduleId)
    && text(exception.sourceScheduleId) === text(base?.id)
    && (exception.department === "outside" ? "outside" : "inside") === (base?.department === "outside" ? "outside" : "inside")
    && text(exception.area) === text(base?.area)
    && text(exception.shift) === text(base?.shift);
}

export function normalizeScheduleException(input = {}) {
  const date = text(input.date);
  const staffId = text(input.staffId);
  const kind = text(input.kind);
  if (!DATE_RE.test(date) || !staffId || !EFFECTIVE_KINDS.has(kind)) return null;
  const start = kind === "override" ? text(input.start) : "";
  const end = kind === "override" ? text(input.end) : "";
  if (kind === "override" && (!TIME_RE.test(start) || !TIME_RE.test(end) || start === end)) return null;
  return {
    id:text(input.id),
    requestId:text(input.requestId),
    staffId,
    staffName:text(input.staffName),
    date,
    kind,
    sourceScheduleId:text(input.sourceScheduleId),
    start,
    end,
    department:kind === "override" && input.department === "outside" ? "outside" : kind === "override" ? "inside" : "",
    area:kind === "override" ? text(input.area) : "",
    shift:kind === "override" ? text(input.shift) : "",
    approvedAt:input.approvedAt || null,
    approvedByUserId:text(input.approvedByUserId),
    approvedByName:text(input.approvedByName),
  };
}

function resolveBaseSchedules(operations, date) {
  if (!DATE_RE.test(String(date || ""))) return [];
  const schedules = Array.isArray(operations?.schedules) ? operations.schedules : [];
  const staffIds = [...new Set(schedules.map((entry) => text(entry?.staffId)).filter(Boolean))];
  const resolved = [];

  for (const staffId of staffIds) {
    const staffSchedules = schedules.filter((entry) => text(entry?.staffId) === staffId);
    const day = staffSchedules.filter((entry) => entry?.applyMode !== "month" && text(entry?.date) === date);
    if (day.length > 1) continue;
    if (day.length === 1) {
      resolved.push(day[0]);
      continue;
    }
    const recurring = staffSchedules.filter((entry) => entry?.applyMode === "month" && appliesOnDate(entry, date));
    if (recurring.length === 1) resolved.push(recurring[0]);
  }
  return resolved;
}

export function effectiveSchedulesForDate(operations, date, shift = "evening") {
  const baseSchedules = resolveBaseSchedules(operations, date);
  const exceptions = (Array.isArray(operations?.scheduleExceptions) ? operations.scheduleExceptions : [])
    .map((entry) => normalizeScheduleException(entry))
    .filter((entry) => entry && entry.date === date);
  const byStaff = new Map();
  for (const exception of exceptions) {
    const list = byStaff.get(exception.staffId) || [];
    list.push(exception);
    byStaff.set(exception.staffId, list);
  }

  return baseSchedules.flatMap((base) => {
    const staffExceptions = byStaff.get(text(base?.staffId)) || [];
    if (staffExceptions.length > 1) return [];
    if (!staffExceptions.length) return coversShift(base, shift) ? [base] : [];
    const exception = staffExceptions[0];
    if (exception.kind === "leave") return [];
    if (!validOverride(exception, base)) return [];
    const effective = {
      ...base,
      start:exception.start,
      end:exception.end,
      effectiveExceptionId:exception.id,
      effectiveRequestId:exception.requestId,
      effectiveKind:"override",
    };
    return coversShift(effective, shift) ? [effective] : [];
  });
}
