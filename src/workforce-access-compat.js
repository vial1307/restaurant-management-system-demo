import { accountCan, currentAccountSession } from "./account-permissions.js";

const MANAGER_ROLES = new Set(["admin", "manager"]);
let reconcilePending = false;
let redirecting = false;

function session() {
  return currentAccountSession();
}

function accountRole(user = session()) {
  return String(user?.accountRole || user?.role || "");
}

function isManagerOrAbove(user = session()) {
  return Boolean(user && (user.role === "admin" || MANAGER_ROLES.has(accountRole(user))));
}

function permissionState() {
  const user = session();
  const admin = Boolean(user && (user.role === "admin" || accountRole(user) === "admin"));
  const attendanceView = Boolean(user && (admin || accountCan(user, "attendance", "view")));
  const scheduleView = Boolean(user && (admin || accountCan(user, "schedule", "view")));
  return {
    user,
    attendanceView,
    scheduleView,
    workforceView: attendanceView || scheduleView,
    attendanceEdit: Boolean(user && isManagerOrAbove(user) && (admin || accountCan(user, "attendance", "edit"))),
    scheduleEdit: Boolean(user && isManagerOrAbove(user) && (admin || accountCan(user, "schedule", "edit"))),
  };
}

function showUnifiedEntry(node, visible) {
  if (!(node instanceof HTMLElement)) return;
  if (!visible) {
    node.hidden = true;
    node.setAttribute("aria-hidden", "true");
    node.tabIndex = -1;
    node.style.display = "none";
    return;
  }
  node.hidden = false;
  node.removeAttribute("aria-hidden");
  node.removeAttribute("tabindex");
  node.style.display = "";
}

function markLegacyScheduleRoute(node, authorized) {
  if (!(node instanceof HTMLElement)) return;
  if (!authorized) {
    node.hidden = true;
    node.setAttribute("aria-hidden", "true");
    node.tabIndex = -1;
    node.style.display = "none";
    return;
  }

  // Keep an authorized legacy #schedule route in the DOM for compatibility and
  // certification, but remove it completely from visual/navigation interaction.
  // The visible top-level entry is always the merged #attendance workforce item.
  node.hidden = false;
  node.setAttribute("aria-hidden", "true");
  node.tabIndex = -1;
  node.dataset.workforceLegacySchedule = "true";
  Object.assign(node.style, {
    display: "block",
    position: "absolute",
    width: "1px",
    height: "1px",
    minWidth: "0",
    minHeight: "0",
    margin: "0",
    padding: "0",
    border: "0",
    overflow: "hidden",
    opacity: "0",
    pointerEvents: "none",
    clipPath: "inset(50%)",
    whiteSpace: "nowrap",
  });
}

function showTab(link, visible) {
  if (!(link instanceof HTMLElement)) return;
  link.hidden = !visible;
  if (visible) {
    link.removeAttribute("aria-hidden");
    link.style.display = "";
  } else {
    link.setAttribute("aria-hidden", "true");
    link.style.display = "none";
  }
}

function reconcileTabs({ attendanceView, scheduleView }) {
  document.querySelectorAll("[data-workforce-tabs]").forEach((tabs) => {
    showTab(tabs.querySelector('a[href="#attendance"]'), attendanceView);
    showTab(tabs.querySelector('a[href="#schedule"]'), scheduleView);
    showTab(tabs.querySelector('a[href="#attendance?workforce=payroll"]'), attendanceView);
  });
}

function reconcileManagerControls({ attendanceEdit, scheduleEdit }) {
  document.querySelectorAll('[data-action="attendance-edit"]').forEach((control) => {
    if (!(control instanceof HTMLElement)) return;
    if (!attendanceEdit) return;
    control.hidden = false;
    control.removeAttribute("aria-hidden");
    control.removeAttribute("aria-disabled");
    if ("disabled" in control) control.disabled = false;
  });

  document.querySelectorAll('[data-action="schedule-add"], [data-action="schedule-edit"], [data-action="schedule-delete"]').forEach((control) => {
    if (!(control instanceof HTMLElement)) return;
    if (!scheduleEdit) return;
    control.hidden = false;
    control.removeAttribute("aria-hidden");
    control.removeAttribute("aria-disabled");
    if ("disabled" in control) control.disabled = false;
  });
}

function redirectUnauthorizedPanel(state) {
  if (redirecting || !state.user) return;
  const value = String(location.hash || "").replace(/^#\/?/, "");
  const [route, query = ""] = value.split("?");
  const payroll = route === "attendance" && new URLSearchParams(query).get("workforce") === "payroll";

  if (route === "attendance" && !state.attendanceView && state.scheduleView) {
    redirecting = true;
    location.hash = "#schedule";
    queueMicrotask(() => { redirecting = false; });
    return;
  }
  if (route === "schedule" && !state.scheduleView && state.attendanceView) {
    redirecting = true;
    location.hash = payroll ? "#attendance?workforce=payroll" : "#attendance";
    queueMicrotask(() => { redirecting = false; });
  }
}

function reconcile() {
  reconcilePending = false;
  const state = permissionState();
  document.querySelectorAll('a.nav-item[href="#attendance"]').forEach((node) => showUnifiedEntry(node, state.workforceView));
  document.querySelectorAll('a.nav-item[href="#schedule"]').forEach((node) => markLegacyScheduleRoute(node, state.scheduleView));
  reconcileTabs(state);
  reconcileManagerControls(state);
  redirectUnauthorizedPanel(state);
}

function requestReconcile() {
  if (reconcilePending) return;
  reconcilePending = true;
  requestAnimationFrame(() => requestAnimationFrame(reconcile));
}

document.addEventListener("click", (event) => {
  const entry = event.target.closest?.('a.nav-item[href="#attendance"]');
  if (!entry) return;
  const state = permissionState();
  if (!state.attendanceView && state.scheduleView) {
    event.preventDefault();
    event.stopImmediatePropagation();
    location.hash = "#schedule";
  }
}, true);

window.addEventListener("hashchange", requestReconcile);
window.addEventListener("shitu:auth-synced", requestReconcile);
window.addEventListener("shitu:accounts-synced", requestReconcile);
window.addEventListener("shitu:vps-auth-ready", requestReconcile);

const observer = new MutationObserver(requestReconcile);
observer.observe(document.documentElement, { childList:true, subtree:true });
requestReconcile();
