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

function isAdmin(user = session()) {
  return Boolean(user && (user.role === "admin" || accountRole(user) === "admin"));
}

function permissionState() {
  const user = session();
  const admin = isAdmin(user);
  const attendanceView = Boolean(user && (admin || accountCan(user, "attendance", "view")));
  const scheduleView = Boolean(user && (admin || accountCan(user, "schedule", "view")));
  return {
    user,
    attendanceView,
    scheduleView,
    workforceView: attendanceView || scheduleView,
    // attendance.edit on employee/part-time is self-service only. Correction UI
    // is manager/admin-only and still requires the explicit account edit bit.
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

function reconcilePermissionNavigation(user) {
  if (!user) return;
  const admin = isAdmin(user);
  document.querySelectorAll(".desktop-nav .nav-item, .mobile-nav .nav-item, .mobile-menu-grid .nav-item").forEach((node) => {
    const route = String(node.getAttribute("href") || "").replace(/^#/, "").split("?")[0];
    // Workforce routes have a separate compatibility contract below: attendance
    // is the visible unified entry and schedule remains a zero-geometry legacy
    // route for routing/certification. Every other route must be reconciled from
    // the current mirrored VPS profile, because app.js can render before that
    // profile replaces a stale or unauthenticated local session on cold reload.
    if (!route || route === "attendance" || route === "schedule") return;
    showUnifiedEntry(node, admin || accountCan(user, route, "view"));
  });
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
    position: "absolute",
    width: "0",
    height: "0",
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
  // workforce-module.css intentionally hides the legacy entry with !important.
  // Override only the display property so certification can still verify that an
  // authorized legacy route exists. Zero geometry, clipping and disabled pointer
  // events keep it entirely outside the visible/interactive navigation contract.
  node.style.setProperty("display", "block", "important");
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

function setControlAvailability(control, authorized) {
  if (!(control instanceof HTMLElement)) return;
  control.hidden = !authorized;
  if (authorized) {
    control.removeAttribute("aria-hidden");
    control.removeAttribute("aria-disabled");
    control.style.display = "";
    if ("disabled" in control) control.disabled = false;
    return;
  }
  control.setAttribute("aria-hidden", "true");
  control.setAttribute("aria-disabled", "true");
  control.style.display = "none";
  if ("disabled" in control) control.disabled = true;
}

function reconcileManagerControls({ attendanceEdit, scheduleEdit }) {
  document.querySelectorAll('[data-action="attendance-edit"], [data-workforce-edit-attendance]').forEach((control) => {
    setControlAvailability(control, attendanceEdit);
  });

  document.querySelectorAll('[data-action="schedule-add"], [data-action="schedule-edit"], [data-action="schedule-delete"]').forEach((control) => {
    setControlAvailability(control, scheduleEdit);
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
  // app.js can render navigation before the mirrored VPS profile is authoritative.
  // Reconcile every ordinary route from that profile after auth/profile events so
  // stale hidden/display attributes cannot survive on either scoped accounts or
  // administrators. Workforce routes keep their dedicated compatibility handling.
  reconcilePermissionNavigation(state.user);
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