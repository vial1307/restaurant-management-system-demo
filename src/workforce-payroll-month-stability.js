const MONTH_SELECTOR = "[data-workforce-payroll-month]";
let selectedMonth = "";
let restoreQueued = false;

function isPayrollRoute() {
  const value = String(location.hash || "").replace(/^#\/?/, "");
  const [route, query = ""] = value.split("?");
  return route === "attendance" && new URLSearchParams(query).get("workforce") === "payroll";
}

function validMonth(value) {
  return /^\d{4}-\d{2}$/.test(String(value || ""));
}

function rememberMonth(event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !input.matches(MONTH_SELECTOR)) return;
  if (validMonth(input.value)) selectedMonth = input.value;
}

function restoreMonth() {
  restoreQueued = false;
  if (!selectedMonth || !isPayrollRoute()) return;
  const input = document.querySelector(MONTH_SELECTOR);
  if (!(input instanceof HTMLInputElement) || input.value === selectedMonth) return;
  input.value = selectedMonth;
  input.dispatchEvent(new Event("change", { bubbles:true }));
}

function queueRestore() {
  if (restoreQueued) return;
  restoreQueued = true;
  queueMicrotask(restoreMonth);
}

document.addEventListener("input", rememberMonth, true);
document.addEventListener("change", rememberMonth, true);
window.addEventListener("hashchange", () => {
  if (!isPayrollRoute()) selectedMonth = "";
  queueRestore();
});

const observer = new MutationObserver(queueRestore);
observer.observe(document.documentElement, { childList:true, subtree:true });
queueRestore();
