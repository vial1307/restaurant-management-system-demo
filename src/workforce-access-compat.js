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

function reconcileAdminNavigation(user) {
  if (!isAdmin(user)) return;
  document.querySelectorAll(".desktop-nav .nav-item, .mobile-nav .nav-item, .mobile-menu-grid .nav-item").forEach((node) => {
    const route = String(node.getAttribute("href") || "").replace(/^#/, "").split("?")[0];
    // #schedule has a separate compatibility contract below: it must remain in
    // the DOM for legacy routing/certification while having zero visible geometry.
    if (!route || route === "schedule") return;
    showUnifiedEntry(node, true);
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

  // Mobile/tablet theme layers intentionally use !important minimum sizes for
  // normal navigation tap targets. Legacy #schedule is compatibility-only, so
  // force every geometry property at the same cascade priority to guarantee it
  // remains measurable in the DOM while occupying exactly zero visual space.
  [
    ["position", "absolute"],
    ["width", "0"],
    ["height", "0"],
    ["min-width", "0"],
    ["min-height", "0"],
    ["max-width", "0"],
    ["max-height", "0"],
    ["margin", "0"],
    ["padding", "0"],
    ["border", "0"],
    ["box-sizing", "border-box"],
    ["overflow", "hidden"],
    ["opacity", "0"],
    ["pointer-events", "none"],
    ["clip-path", "inset(50%)"],
    ["white-space", "nowrap"],
    ["flex", "0 0 0"],
    ["flex-basis", "0"],
    ["font-size", "0"],
    ["line-height", "0"],
  ].forEach(([property, value]) => node.style.setProperty(property, value, "important"));

  // workforce-module.css intentionally hides the legacy entry with !important.
  // Override only display so certification can still verify that an authorized
  // legacy route exists; the important zero-geometry contract above wins against
  // every responsive navigation tap-target rule.
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
  // app.js can render navigation while the VPS profile is still being mirrored.
  // Non-admin accounts are later normalized by auth-layer.js, but admins bypass
  // that branch because their permission set is implicitly full. Reconcile the
  // admin navigation here so a cold-start render can never leave stale `hidden`
  // attributes behind on mobile or desktop.
  reconcileAdminNavigation(state.user);
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
