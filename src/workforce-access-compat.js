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
    if (!route || route === "attendance" || route === "schedule") return;
    showUnifiedEntry(node, admin || accountCan(user, route, "view"));
  });
}

function markLegacyScheduleRoute(node, authorized) {
  if (!(node instanceof HTMLElement)) return;
  if (!authorized) {
    if (!node.hidden) node.hidden = true;
    if (node.getAttribute("aria-hidden") !== "true") node.setAttribute("aria-hidden", "true");
    if (node.tabIndex !== -1) node.tabIndex = -1;
    if (node.style.getPropertyValue("display") !== "none" || node.style.getPropertyPriority("display")) {
      node.style.setProperty("display", "none");
    }
    return;
  }

  // workforce-module.js intentionally hides the visible legacy schedule entry.
  // Compatibility owns the final DOM state for authorized users: keep the route
  // addressable for routing/certification while preserving zero visible geometry.
  if (node.hidden) node.hidden = false;
  if (node.getAttribute("aria-hidden") !== "true") node.setAttribute("aria-hidden", "true");
  if (node.tabIndex !== -1) node.tabIndex = -1;
  if (node.dataset.workforceLegacySchedule !== "true") node.dataset.workforceLegacySchedule = "true";
  const required = {
    position:"absolute",
    width:"0px",
    height:"0px",
    minWidth:"0px",
    minHeight:"0px",
    margin:"0px",
    padding:"0px",
    border:"0px",
    overflow:"hidden",
    opacity:"0",
    pointerEvents:"none",
    clipPath:"inset(50%)",
    whiteSpace:"nowrap",
  };
  for (const [property, value] of Object.entries(required)) {
    if (node.style[property] !== value) node.style[property] = value;
  }
  if (node.style.getPropertyValue("display") !== "block" || node.style.getPropertyPriority("display") !== "important") {
    node.style.setProperty("display", "block", "important");
  }
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
  if (event.target.closest?.('[data-action="toggle-mobile-menu"]')) requestReconcile();

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

const observer = new MutationObserver((records) => {
  const relevant = records.some((record) => {
    if (record.type === "childList") return true;
    return record.type === "attributes"
      && record.target instanceof Element
      && record.target.matches('a.nav-item[href="#schedule"]');
  });
  if (relevant) requestReconcile();
});
observer.observe(document.documentElement, {
  childList:true,
  subtree:true,
  attributes:true,
  attributeFilter:["hidden", "aria-hidden", "tabindex", "style", "data-workforce-legacy-schedule"],
});
requestReconcile();