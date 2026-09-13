import { accountCan, currentAccountSession } from "./account-permissions.js";

const STATE_KEY = "shitu-kitchen-os-v1";
const ACTIVE_SITE_KEY = "shitu-admin-active-site-v1";
const MANAGER_ROLES = new Set(["admin", "manager"]);
let renderPending = false;

function copy() {
  const zh = document.documentElement.lang === "zh-Hant";
  return zh ? {
    title:"薪資歷史",
    subtitle:"每次鎖定都保留不可變更的薪資快照；重新開啟後再次鎖定會建立新版本。",
    legacy:"此鎖定期間建立於薪資歷史功能之前，沒有不可變更的快照。系統不會以目前資料回填舊薪資。",
    revision:"版本",
    current:"目前版本",
    lockedAt:"鎖定時間",
    lockedBy:"鎖定人員",
    shifts:"班次",
    hours:"工時",
    gross:"應計薪資",
    deductions:"扣款",
    net:"實領",
    staff:"員工",
    export:"匯出 CSV",
    formula:"計算版本",
    reopenedFrom:"本版本建立前曾重新開啟",
    reopenReason:"原因",
    noHistory:"此月份尚無薪資鎖定歷史。",
    exportError:"無法匯出此薪資版本。",
  } : {
    title:"Lịch sử kỳ lương",
    subtitle:"Mỗi lần khóa lưu một snapshot bất biến; mở lại rồi khóa lần nữa sẽ tạo revision mới.",
    legacy:"Kỳ khóa này được tạo trước chức năng lịch sử lương nên không có snapshot bất biến. Hệ thống sẽ không lấy tưừ liệu hiệxh ại để tụng người lịch sử.",
    revision:"Revision",
    current:"Revision hiện tại",
    lockedAt:"Khóa lúc",
    lockedBy:"Người khóa",
    shifts:"Ca",
    hours:"Giờl àm",
    gross:"Lİơng trước khấu trừ",
    deductions:"Khấu trừ",
    net:"Thực nhận",
    staff:"Nhân viên",
    export:"Xuất CSV",
    formula:"Phiên bản công thức",
    reopenedFrom:"Kỳ đã được lại trước revision này",
    reopenReason:"L� do",
    noHistory:"Tháng này chưa có lịch sử khóa kỳ lương.",
    exportError:"Không thể xuất revision lương này.",
  };
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function number(value) {
  return new Intl.NumberFormat(
    document.documentElement.lang === "zh-Hant" ? "zh-TW" : "vi-VN",
    { maximumFractionDigits:2 }
  ).format(Number(value) || 0);
}

function dateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat(
    document.documentElement.lang === "zh-Hant" ? "zh-TW" : "vi-VN",
    { year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hour12:false }
  ).format(date);
}

function managerAccount() {
  const session = currentAccountSession();
  const role = String(session?.accountRole || session?.role || "");
  return Boolean(session && MANAGER_ROLES.has(role) && accountCan(session, "attendance", "edit"));
}

function activeSite() {
  const session = currentAccountSession();
  if (["central", "fuxing", "yongji"].includes(session?.location)) return session.location;
  if (session?.location === "all") {
    const saved = localStorage.getItem(ACTIVE_SITE_KEY);
    return ["central", "fuxing", "yongji"].includes(saved) ? saved : "fuxing";
  }
  return "";
}

function loadState() {
  try { return JSON.parse(localStorage.getItem(STATE_KEY) || "null"); }
  catch { return null; }
}

function selectedMonth(root, state) {
  return root.querySelector("[data-workforce-payroll-month]")?.value
    || String(state?.selectedDate || "").slice(0, 7);
}

function periodFor(state, month) {
  const periods = state?.operations?.payroll?.periods;
  if (!periods || typeof periods !== "object" || Array.isArray(periods)) return null;
  const period = periods[month];
  return period && typeof period === "object" && !Array.isArray(period) ? period : null;
}

function historyFor(period) {
  return Array.isArray(period?.history)
    ? period.history.filter((entry) => entry && typeof entry === "object")
    : [];
}

function totalsFor(snapshot) {
  const totals = snapshot?.totals && typeof snapshot.totals === "object" ? snapshot.totals : {};
  return {
    shifts:Math.max(0, Number(totals.shifts) || 0),
    workedMinutes:Math.max(0, Number(totals.workedMinutes) || 0),
    workedHours:Math.max(0, Number(totals.workedHours) || 0),
    gross:Math.max(0, Number(totals.gross) || 0),
    deduction:Math.max(0, Number(totals.deduction) || 0),
    net:Math.max(0, Number(totals.net) || 0),
  };
}

function staffTable(snapshot, c) {
  const rows = Array.isArray(snapshot?.staffRows) ? snapshot.staffRows : [];
  const body = rows.map((row) => `<tr>
    <td>${esc(row.staffName || row.staffId || "—")}</td>
    <td>${Math.max(0, Number(row.shifts) || 0)}</td>
    <td>${number(row.workedHours)}</td>
    <td>NT$${number(row.gross)}</td>
    <td>NT$${number(row.deduction)}</td>
    <td><strong>NT$${number(row.net)}</strong></td>
  </tr>`).join("");
  return `<div class="report-table-wrap payroll-history-table-wrap">
    <table class="report-table payroll-history-table">
      <thead><tr><th>${esc(c.staff)}</th><th>${esc(c.shifts)}</th><th>${esc(c.hours)}</th><th>${esc(c.gross)}</th><th>${esc(c.deductions)}</th><th>${esc(c.net)}</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function revisionMarkup(snapshot, currentRevision, c) {
  const revision = Math.max(1, Number(snapshot.revision) || 1);
  const totals = totalsFor(snapshot);
  const current = revision === Number(currentRevision);
  const reopen = snapshot.sourceReopen && typeof snapshot.sourceReopen === "object" ? snapshot.sourceReopen : null;
  return `<article class="card payroll-history-revision" data-payroll-history-revision="${revision}" data-current="${current ? "true" : "false"}">
    <div class="payroll-history-heading">
      <div>
        <div class="payroll-history-title-line">
          <h3>${esc(c.revision)} r${revision}</h3>
          ${current ? `<span class="tag tag-ok">${esc(c.current)}</span>` : ""}
        </div>
        <p>${esc(c.lockedAt)}: ${esc(dateTime(snapshot.lockedAt))} · ${esc(c.lockedBy)}: ${esc(snapshot.lockedByName || "—")}</p>
        <small>${esc(c.formula)} ${Math.max(1, Number(snapshot.formulaVersion) || 1)} · ${esc(snapshot.currency || "TWD")}</small>
      </div>
      <button type="button" class="secondary-button payroll-history-export" data-payroll-history-export="${revision}">${esc(c.export)}</button>
    </div>
    <div class="payroll-history-stats">
      <span><strong>${totals.shifts}</strong><small>${esc(c.shifts)}</small></span>
      <span><strong>${number(totals.workedHours)}</strong><small>${esc(c.hours)}</small></span>
      <span><strong>NT$${number(totals.gross)}</strong><small>${esc(c.gross)}</small></span>
      <span><strong>NT$${number(totals.deduction)}</strong><small>${esc(c.deductions)}</small></span>
      <span><strong>NT$${number(totals.net)}</strong><small>${esc(c.net)}</small></span>
    </div>
    ${reopen ? `<div class="payroll-history-reopen"><strong>${esc(c.reopenedFrom)}</strong><span>${esc(dateTime(reopen.at))}${reopen.byName ? ` · ${esc(reopen.byName)}` : ""}</span>${reopen.reason ? `<small>${esc(c.reopenReason)}: ${esc(reopen.reason)}</small>` : ""}</div>` : ""}
    ${staffTable(snapshot, c)}
  </article>`;
}

function historyMarkup(period, month) {
  const c = copy();
  const history = historyFor(period);
  const legacy = period?.status === "locked" && !history.length;
  const revisions = [...history].sort((a, b) => Number(b?.revision || 0) - Number(a?.revision || 0));
  return `<section class="workforce-payroll-history" data-workforce-payroll-history data-month="${esc(month)}">
    <article class="card payroll-history-intro">
      <div class="card-heading"><div><h2>${esc(c.title)}</h2><p>${esc(c.subtitle)}</p></div></div>
      ${legacy ? `<p class="payroll-history-legacy" data-payroll-history-legacy>${esc(c.legacy)}</p>` : ""}
      ${!legacy && !revisions.length ? `<p class="empty-state" data-payroll-history-empty>${esc(c.noHistory)}</p>` : ""}
    </article>
    <div class="payroll-history-list">
      ${revisions.map((snapshot) => revisionMarkup(snapshot, period?.currentRevision, c)).join("")}
    </div>
  </section>`;
}

function csvValue(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function csvForSnapshot(snapshot) {
  const metadata = [
    ["month", snapshot.month],
    ["revision", snapshot.revision],
    ["snapshot_id", snapshot.id],
    ["formula_version", snapshot.formulaVersion],
    ["currency", snapshot.currency || "TWD"],
    ["locked_at", snapshot.lockedAt],
    ["locked_by", snapshot.lockedByName],
  ];
  const headers = [
    "attendance_id","staff_id","staff_name","date","clock_in","clock_out","break_minutes",
    "worked_minutes","worked_hours","hourly_rate","late_minutes","gross","deduction","net",
    "approved_at","approved_by"
  ];
  const rows = Array.isArray(snapshot.attendanceRows) ? snapshot.attendanceRows : [];
  const totals = totalsFor(snapshot);
  const lines = metadata.map((row) => row.map(csvValue).join(","));
  lines.push("");
  lines.push(headers.map(csvValue).join(","));
  for (const row of rows) {
    lines.push([
      row.attendanceId,row.staffId,row.staffName,row.date,row.clockIn,row.clockOut,row.breakMinutes,
      row.workedMinutes,row.workedHours,row.hourlyRate,row.lateMinutes,row.gross,row.deduction,row.net,
      row.approvedAt,row.approvedByName,
    ].map(csvValue).join(","));
  }
  lines.push("");
  lines.push(["TOTAL","","","", "", "", "", totals.workedMinutes, totals.workedHours, "", "", totals.gross, totals.deduction, totals.net, "", ""].map(csvValue).join(","));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

function exportSnapshot(snapshot, site, month) {
  if (!snapshot || !managerAccount()) return;
  const revision = Math.max(1, Number(snapshot.revision) || 1);
  const blob = new Blob([csvForSnapshot(snapshot)], { type:"text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `payroll-${site}-${month}-r${revision}.csv`;
  link.dataset.payrollHistoryDownload = String(revision);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function decorate() {
  renderPending = false;
  if (!managerAccount()) {
    document.querySelector("[data-workforce-payroll-history]")?.remove();
    return;
  }
  const hash = String(location.hash || "").replace(/^#\/?/, "");
  const [route, query = ""] = hash.split("?");
  if (route !== "attendance" || new URLSearchParams(query).get("workforce") !== "payroll") return;
  const root = document.querySelector("#app");
  const state = loadState();
  const panel = root?.querySelector("[data-workforce-payroll-panel]");
  if (!root || !state?.operations || !panel) return;

  const month = selectedMonth(panel, state);
  const period = periodFor(state, month);
  const signature = `${month}|${period?.status || "none"}|${period?.currentRevision || 0}|${historyFor(period).map((entry) => `${entry.id || ""}:${entry.revision || 0}:${entry.lockedAt || ""}`).join("|")}`;
  let history = panel.querySelector("[data-workforce-payroll-history]");
  if (history?.dataset.signature === signature) return;
  history?.remove();
  panel.insertAdjacentHTML("beforeend", historyMarkup(period, month));
  history = panel.querySelector("[data-workforce-payroll-history]");
  if (history) history.dataset.signature = signature;
}

function requestDecorate() {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(decorate);
}

document.addEventListener("click", (event) => {
  const button = event.target.closest?.("[data-payroll-history-export]");
  if (!button) return;
  event.preventDefault();
  if (!managerAccount()) return;
  const root = document.querySelector("#app");
  const state = loadState();
  const panel = root?.querySelector("[data-workforce-payroll-panel]");
  if (!panel || !state?.operations) return;
  const month = selectedMonth(panel, state);
  const period = periodFor(state, month);
  const revision = Number(button.dataset.payrollHistoryExport);
  const snapshot = historyFor(period).find((entry) => Number(entry?.revision) === revision);
  const site = activeSite();
  if (!snapshot || !site) {
    window.dispatchEvent(new CustomEvent("shitu:notify", { detail:{ type:"error", title:copy().title, body:copy().exportError } }));
    return;
  }
  exportSnapshot(snapshot, site, month);
}, true);

document.addEventListener("change", (event) => {
  if (event.target instanceof HTMLInputElement && event.target.matches("[data-workforce-payroll-month]")) requestDecorate();
}, true);
window.addEventListener("hashchange", requestDecorate);
window.addEventListener("shitu:accounts-synced", requestDecorate);
window.addEventListener("shitu:business-state-updated", requestDecorate);
new MutationObserver(requestDecorate).observe(document.documentElement, { childList:true, subtree:true });
requestDecorate();
