const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const EFFECTIVE_KINDS = new Set(["leave", "override"]);

function text(value) {
  return String(value ?? "").trim();
}

function baseSchedulesForDate(operations, date, shift) {
  const month = String(date).slice(0, 7);
  const weekday = new Date(`${date}T12:00:00`).getDay();
  return (Array.isArray(operations?.schedules) ? operations.schedules : []).filter((entry) => {
    const applies = entry?.applyMode === "month"
      ? text(entry.month) === month && Number(entry.weekday) === weekday
      : text(entry?.date) === date;
    const coversShift = entry?.shift === shift || entry?.shift === "full" || entry?.shift === "custom";
    return applies && coversShift;
  });
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

export function effectiveSchedulesForDate(operations, date, shift = "evening") {
  const baseSchedules = baseSchedulesForDate(operations, date, shift);
  const rawExceptions = (Array.isArray(operations?.scheduleExceptions) ? operations.scheduleExceptions : [])
    .filter((entry) => text(entry?.date) === date && text(entry?.staffId));
  const byStaff = new Map();
  for (const rawException of rawExceptions) {
    const staffId = text(rawException.staffId);
    const list = byStaff.get(staffId) || [];
    list.push(rawException);
    byStaff.set(staffId, list);
  }

  return baseSchedules.flatMap((base) => {
    const staffExceptions = byStaff.get(text(base?.staffId)) || [];
    if (!staffExceptions.length || staffExceptions.length > 1) return [base];
    const exception = normalizeScheduleException(staffExceptions[0]);
    if (!exception) return [base];
    if (exception.kind === "leave") return [];
    if (!validOverride(exception, base)) return [base];
    return [{
      ...base,
      start:exception.start,
      end:exception.end,
      effectiveExceptionId:exception.id,
      effectiveRequestId:exception.requestId,
      effectiveKind:"override",
    }];
  });
}
