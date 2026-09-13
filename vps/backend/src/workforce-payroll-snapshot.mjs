function text(value) {
  return String(value ?? "").trim();
}

function calculateAttendance(entry = {}, payroll = {}) {
  const start = new Date(entry.clockIn || "invalid").getTime();
  const end = entry.clockOut ? new Date(entry.clockOut).getTime() : NaN;
  const totalMinutes = Number.isFinite(start) && Number.isFinite(end)
    ? Math.max(0, Math.round((end - start) / 60_000) - Math.max(0, Number(entry.breakMinutes) || 0))
    : 0;
  const hourlyRate = Math.max(0, Number(entry.hourlyRate) || 0);
  const gross = Math.round(totalMinutes / 60 * hourlyRate);
  let lateMinutes = 0;
  if (Number.isFinite(start) && /^\d{2}:\d{2}$/.test(String(entry.scheduledStart || ""))) {
    const scheduled = new Date(`${entry.date}T${entry.scheduledStart}:00`).getTime();
    if (Number.isFinite(scheduled)) lateMinutes = Math.max(0, Math.round((start - scheduled) / 60_000));
  }
  const grace = Math.max(0, Number(payroll.lateGraceMinutes) || 0);
  const penaltyAmount = Math.max(0, Number(payroll.latePenaltyAmount) || 0);
  const chargeableMinutes = Math.max(0, lateMinutes - grace);
  const deduction = payroll.latePenaltyEnabled && penaltyAmount > 0 && chargeableMinutes > 0
    ? payroll.latePenaltyMode === "per-minute" ? chargeableMinutes * penaltyAmount : penaltyAmount
    : 0;
  return { totalMinutes, hours:Math.round(totalMinutes / 60 * 100) / 100, hourlyRate, gross, lateMinutes, deduction, net:Math.max(0, gross - deduction) };
}

function nextRevision(history = []) {
  return history.reduce((max, entry) => Math.max(max, Number(entry?.revision) || 0), 0) + 1;
}

function sourceReopen(period = null) {
  if (!period || period.status !== "open" || !period.reopenedAt) return null;
  return { at:period.reopenedAt, byUserId:text(period.reopenedByUserId), byName:text(period.reopenedByName), reason:text(period.reopenReason) };
}

export function buildPayrollLockSnapshot({ month, attendance = [], payroll = {}, lockedAt, lockedByUserId, lockedByName, currentPeriod = null }) {
  const history = Array.isArray(currentPeriod?.history) ? structuredClone(currentPeriod.history) : [];
  const revision = nextRevision(history);
  const policySnapshot = structuredClone(payroll || {});
  delete policySnapshot.periods;
  const attendanceRows = attendance.map((entry) => {
    const wage = calculateAttendance(entry, policySnapshot);
    return {
      attendanceId:text(entry.id), staffId:text(entry.staffId), staffName:text(entry.staffName), area:text(entry.area), date:text(entry.date),
      clockIn:entry.clockIn || null, clockOut:entry.clockOut || null, breakMinutes:Math.max(0, Number(entry.breakMinutes) || 0),
      scheduledStart:text(entry.scheduledStart), hourlyRate:wage.hourlyRate, workedMinutes:wage.totalMinutes, workedHours:wage.hours,
      lateMinutes:wage.lateMinutes, gross:wage.gross, deduction:wage.deduction, net:wage.net,
      approvedAt:entry.approvedAt || null, approvedByUserId:text(entry.approvedByUserId), approvedByName:text(entry.approvedByName),
    };
  });
  const byStaff = new Map();
  for (const row of attendanceRows) {
    const key = row.staffId || row.staffName;
    const summary = byStaff.get(key) || { staffId:row.staffId, staffName:row.staffName || key, shifts:0, workedMinutes:0, gross:0, deduction:0, net:0 };
    summary.shifts += 1; summary.workedMinutes += row.workedMinutes; summary.gross += row.gross; summary.deduction += row.deduction; summary.net += row.net;
    byStaff.set(key, summary);
  }
  const staffRows = [...byStaff.values()].map((row) => ({ ...row, workedHours:Math.round(row.workedMinutes / 60 * 100) / 100 })).sort((a, b) => String(a.staffName).localeCompare(String(b.staffName)));
  const totals = staffRows.reduce((sum, row) => ({ shifts:sum.shifts + row.shifts, workedMinutes:sum.workedMinutes + row.workedMinutes, gross:sum.gross + row.gross, deduction:sum.deduction + row.deduction, net:sum.net + row.net }), { shifts:0, workedMinutes:0, gross:0, deduction:0, net:0 });
  totals.workedHours = Math.round(totals.workedMinutes / 60 * 100) / 100;
  return {
    id:`${month}-r${revision}`, month, revision, formulaVersion:1, currency:"TWD", lockedAt,
    lockedByUserId:text(lockedByUserId), lockedByName:text(lockedByName), policySnapshot,
    approvedAttendanceIds:attendanceRows.map((row) => row.attendanceId).filter(Boolean), attendanceRows, staffRows, totals,
    sourceReopen:sourceReopen(currentPeriod),
  };
}
