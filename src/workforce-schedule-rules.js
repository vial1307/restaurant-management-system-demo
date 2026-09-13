import { accountCan, currentAccountSession } from "./account-permissions.js";
import { qualifiedAreas, schedulesForDate } from "./operations.js";
import { apiRequest } from "./vps-api.js";

const STATE_KEY = "shitu-kitchen-os-v1";
const ACTIVE_SITE_KEY = "shitu-admin-active-site-v1";
const SHIFT_IDS = ["morning", "evening", "full"];
const REQUIRED_AREAS = ["noodles", "soup", "seafood", "meat"];
const DEFAULTS = {
  version:0,
  shifts:{
    morning:{ start:"10:00", end:"16:00" },
    evening:{ start:"16:00", end:"22:00" },
    full:{ start:"10:00", end:"22:00" },
  },
  staffingBands:[
    { minTables:0, maxTables:3, requiredInside:2, fixedAreas:false, needsReview:true },
    { minTables:4, maxTables:6, requiredInside:3, fixedAreas:false, needsReview:false },
    { minTables:7, maxTables:12, requiredInside:4, fixedAreas:true, needsReview:false },
    { minTables:13, maxTables:null, requiredInside:4, fixedAreas:true, needsReview:true },
  ],
};

let cacheSite = "";
let cacheRules = structuredClone(DEFAULTS);
let cacheRevision = -1;
let loadInFlight = null;
let renderQueued = false;
let newSchedulePending = false;

function setText(node, value) {
  if (!node) return;
  const next = String(value ?? "");
  if (node.textContent !== next) node.textContent = next;
}

function zh() {
  return document.documentElement.lang === "zh-Hant";
}

function copy() {
  return zh() ? {
    open:"班別規則", title:"班別與人力規則", subtitle:"只調整新排班的預設時間與目前四個桌數人力區間；既有排班不會被改寫。",
    shiftWindows:"班別預設時間", staffing:"桌數與內場人力", morning:"早班", evening:"晚班", full:"全天班",
    start:"開始", end:"結束", min:"最少桌數", max:"最多桌數", required:"內場人數", fixed:"固定四區", review:"需人工確認",
    infinity:"以上", save:"儲存規則", cancel:"取消", success:"排班規則已更新", error:"排班規則更新失敗",
    enough:"足夠", overloaded:"超載", reviewLabel:"待確認", tables:"桌", ruleThree:"人可輪調支援。", ruleFixed:"人需固定覆蓋麵、湯、海鮮、肉四區。",
    missing:"缺少 SOP 能力", version:"版本",
  } : {
    open:"Quy tắc ca", title:"Quy tắc ca và nhân lực", subtitle:"Chỉ đổi giờ mặc định cho lịch mới và 4 dải bàn hiện tại; lịch đã xếp sẽ không bị viết lại.",
    shiftWindows:"Giờ mặc định của ca", staffing:"Số bàn và nhân lực bếp", morning:"Ca sáng", evening:"Ca tối", full:"Cả ngày",
    start:"Bắt đầu", end:"Kết thúc", min:"Từ bàn", max:"Đến bàn", required:"Người trong bếp", fixed:"Cố định 4 khu", review:"Cần xác nhận thủ công",
    infinity:"trở lên", save:"Lưu quy tắc", cancel:"Hủy", success:"Đã cập nhật quy tắc lịch làm", error:"Không cập nhật được quy tắc lịch làm",
    enough:"Đủ", overloaded:"Quá tải", reviewLabel:"Chờ xác nhận", tables:"bàn", ruleThree:"người có thể hỗ trợ xoay vòng.", ruleFixed:"người phải cố định phủ Mì, Canh, Hải sản và Thịt.",
    missing:"Thiếu năng lực SOP", version:"Phiên bản",
  };
}

function loadLocalState() {
  try { return JSON.parse(localStorage.getItem(STATE_KEY) || "null"); }
  catch { return null; }
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

function managerAccount() {
  const session = currentAccountSession();
  const role = String(session?.accountRole || session?.role || "");
  return Boolean(session && ["admin", "manager"].includes(role) && accountCan(session, "schedule", "edit"));
}

function validTime(value) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""));
}

function normalizedRules(input) {
  const result = structuredClone(DEFAULTS);
  const shifts = input?.shifts;
  if (shifts && typeof shifts === "object" && !Array.isArray(shifts)) {
    for (const id of SHIFT_IDS) {
      const start = String(shifts?.[id]?.start || "");
      const end = String(shifts?.[id]?.end || "");
      if (validTime(start) && validTime(end) && start !== end) result.shifts[id] = { start, end };
    }
  }
  const bands = input?.staffingBands;
  if (Array.isArray(bands) && bands.length === 4) {
    const candidate = bands.map((band, index) => ({
      minTables:Number(band?.minTables), maxTables:index === 3 && band?.maxTables === null ? null : Number(band?.maxTables),
      requiredInside:Number(band?.requiredInside), fixedAreas:Boolean(band?.fixedAreas), needsReview:Boolean(band?.needsReview),
    }));
    const valid = candidate.every((band, index) => (
      Number.isInteger(band.minTables) && band.minTables >= 0
      && Number.isInteger(band.requiredInside) && band.requiredInside >= 1 && band.requiredInside <= 20
      && (index === 3 ? band.maxTables === null : Number.isInteger(band.maxTables) && band.maxTables >= band.minTables)
      && (index === 0 ? band.minTables === 0 : band.minTables === candidate[index - 1].maxTables + 1)
    ));
    if (valid) result.staffingBands = candidate;
  }
  result.version = Math.max(0, Number(input?.version) || 0);
  result.updatedAt = input?.updatedAt || null;
  result.updatedByName = String(input?.updatedByName || "");
  return result;
}

async function loadRules(force = false) {
  const site = activeSite();
  if (!site || !managerAccount()) {
    cacheSite = site;
    cacheRules = structuredClone(DEFAULTS);
    cacheRevision = -1;
    return cacheRules;
  }
  if (!force && cacheSite === site && cacheRevision >= 0) return cacheRules;
  if (loadInFlight) return loadInFlight;
  loadInFlight = apiRequest(`/api/business-state/${encodeURIComponent(site)}`)
    .then((state) => {
      cacheSite = site;
      cacheRevision = Number(state?.moduleRevisions?.schedule ?? 0);
      cacheRules = normalizedRules(state?.modules?.schedule?.rules);
      return cacheRules;
    })
    .catch(() => {
      cacheSite = site;
      cacheRevision = -1;
      cacheRules = structuredClone(DEFAULTS);
      return cacheRules;
    })
    .finally(() => { loadInFlight = null; });
  return loadInFlight;
}

function bandForTables(tables, rules = cacheRules) {
  const count = Math.max(0, Math.round(Number(tables) || 0));
  return rules.staffingBands.find((band) => count >= band.minTables && (band.maxTables === null || count <= band.maxTables)) || rules.staffingBands.at(-1);
}

function configuredCapacity(state, date, shift, rules = cacheRules) {
  const tables = Math.max(0, Math.round(Number(state?.records?.[date]?.reservation?.dinnerTables) || 0));
  const band = bandForTables(tables, rules);
  const entries = schedulesForDate(state?.operations || {}, date, shift);
  const inside = entries.filter((entry) => entry.department === "inside");
  const outside = entries.filter((entry) => entry.department === "outside");
  const covered = new Set();
  for (const entry of inside) {
    const skills = qualifiedAreas(state.operations, entry.staffId);
    if (skills.includes(entry.area)) covered.add(entry.area);
    if (!band.fixedAreas) skills.forEach((area) => covered.add(area));
  }
  const missingAreas = REQUIRED_AREAS.filter((area) => !covered.has(area));
  const overloaded = inside.length < band.requiredInside || (band.fixedAreas && missingAreas.length > 0);
  return { ...band, tables, entries, inside, outside, missingAreas, overloaded };
}

function decorateShiftOptions(select) {
  if (!(select instanceof HTMLSelectElement)) return;
  const c = copy();
  const labels = { morning:c.morning, evening:c.evening, full:c.full };
  for (const id of SHIFT_IDS) {
    const option = select.querySelector(`option[value="${id}"]`);
    const rule = cacheRules.shifts[id];
    if (option && rule) setText(option, `${labels[id]} · ${rule.start}–${rule.end}`);
  }
}

function decorateScheduleModal() {
  const form = document.querySelector('form[data-form="save-schedule"]');
  if (!form) return;
  const shift = form.querySelector('select[name="shift"]');
  decorateShiftOptions(shift);
  if (form.dataset.scheduleRulesBound !== "true") {
    form.dataset.scheduleRulesBound = "true";
    shift?.addEventListener("change", () => {
      const rule = cacheRules.shifts[shift.value];
      if (!rule) return;
      const start = form.querySelector('input[name="start"]');
      const end = form.querySelector('input[name="end"]');
      if (start) start.value = rule.start;
      if (end) end.value = rule.end;
    });
  }
  if (newSchedulePending && form.dataset.scheduleRulesDefaultsApplied !== "true") {
    form.dataset.scheduleRulesDefaultsApplied = "true";
    const rule = cacheRules.shifts[shift?.value];
    if (rule) {
      const start = form.querySelector('input[name="start"]');
      const end = form.querySelector('input[name="end"]');
      if (start) start.value = rule.start;
      if (end) end.value = rule.end;
    }
    newSchedulePending = false;
  }
}

function decorateSchedulePage() {
  const route = String(location.hash || "").replace(/^#\/?/, "").split("?")[0];
  if (route !== "schedule") return;
  const state = loadLocalState();
  if (!state?.operations) return;
  const toolbarShift = document.querySelector('[data-field="schedule-shift"]');
  decorateShiftOptions(toolbarShift);
  const selectedShift = toolbarShift?.value || "evening";
  const c = copy();

  for (const button of document.querySelectorAll(".schedule-day[data-date]")) {
    const date = String(button.dataset.date || "");
    const capacity = configuredCapacity(state, date, selectedShift);
    const status = capacity.needsReview ? "review" : capacity.overloaded ? "overloaded" : "ready";
    button.classList.remove("status-review", "status-overloaded", "status-ready");
    button.classList.add(`status-${status}`);
    setText(button.querySelector("span"), `${capacity.tables} ${c.tables} · ${capacity.inside.length}/${capacity.requiredInside} 內`);
    setText(button.querySelector("small"), status === "review" ? c.reviewLabel : status === "overloaded" ? c.overloaded : c.enough);
  }

  const selectedDate = String(state.selectedDate || "");
  const capacity = configuredCapacity(state, selectedDate, selectedShift);
  const card = document.querySelector(".capacity-detail-card");
  if (card) {
    const numbers = card.querySelectorAll(".capacity-numbers > div strong");
    setText(numbers[0], String(capacity.tables));
    setText(numbers[1], `${capacity.inside.length}/${capacity.requiredInside}`);
    const tag = card.querySelector(".card-heading .tag");
    if (tag) {
      setText(tag, capacity.overloaded ? c.overloaded : c.enough);
      tag.classList.toggle("tag-empty", capacity.overloaded);
      tag.classList.toggle("tag-ok", !capacity.overloaded);
    }
    setText(card.querySelector(".helper-text"), `${capacity.tables} ${c.tables}: ${capacity.requiredInside} ${capacity.fixedAreas ? c.ruleFixed : c.ruleThree}`);
    let warning = card.querySelector("[data-schedule-rules-missing]");
    if (capacity.missingAreas.length) {
      if (!warning) {
        warning = document.createElement("p");
        warning.className = "capacity-warning";
        warning.dataset.scheduleRulesMissing = "";
        card.append(warning);
      }
      setText(warning, `${c.missing}: ${capacity.missingAreas.join(" · ")}`);
    } else warning?.remove();
  }

  if (managerAccount()) {
    const add = document.querySelector('[data-action="schedule-add"]');
    if (add && !document.querySelector("[data-workforce-schedule-rules-open]")) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary-button workforce-schedule-rules-open";
      button.dataset.workforceScheduleRulesOpen = "";
      button.textContent = c.open;
      add.insertAdjacentElement("beforebegin", button);
    }
  } else {
    document.querySelector("[data-workforce-schedule-rules-open]")?.remove();
  }
  decorateScheduleModal();
}

function addStyles() {
  if (document.querySelector("#workforce-schedule-rules-style")) return;
  const style = document.createElement("style");
  style.id = "workforce-schedule-rules-style";
  style.textContent = `
    .workforce-schedule-rules-open{margin-right:.5rem}.workforce-schedule-rules-modal{max-width:820px;max-height:min(90vh,900px);overflow:auto}.workforce-schedule-rules-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.workforce-schedule-rule-card{border:1px solid var(--border-color,#d8dedc);border-radius:14px;padding:12px}.workforce-schedule-rule-card h3{margin:0 0 10px}.workforce-schedule-rule-times{display:grid;grid-template-columns:1fr 1fr;gap:8px}.workforce-staffing-band{display:grid;grid-template-columns:90px 90px 110px 1fr 1fr;gap:8px;align-items:end;margin-top:10px}.workforce-staffing-band label{min-width:0}.workforce-rule-check{display:flex;align-items:center;gap:7px;padding-bottom:10px}.workforce-rule-meta{font-size:.85rem;opacity:.7;margin-top:8px}@media(max-width:760px){.workforce-schedule-rules-grid{grid-template-columns:1fr}.workforce-staffing-band{grid-template-columns:1fr 1fr}.workforce-rule-check{padding:4px 0}.workforce-schedule-rules-modal{width:min(94vw,820px)}}`;
  document.head.append(style);
}

function editorMarkup() {
  const c = copy();
  const shiftLabel = { morning:c.morning, evening:c.evening, full:c.full };
  const shifts = SHIFT_IDS.map((id) => {
    const rule = cacheRules.shifts[id];
    return `<section class="workforce-schedule-rule-card"><h3>${shiftLabel[id]}</h3><div class="workforce-schedule-rule-times"><label class="management-field"><span>${c.start}</span><input type="time" name="${id}:start" required value="${rule.start}"></label><label class="management-field"><span>${c.end}</span><input type="time" name="${id}:end" required value="${rule.end}"></label></div></section>`;
  }).join("");
  const bands = cacheRules.staffingBands.map((band, index) => `<div class="workforce-staffing-band" data-band="${index}"><label class="management-field"><span>${c.min}</span><input type="number" min="0" name="band:${index}:min" required value="${band.minTables}"></label><label class="management-field"><span>${c.max}</span><input type="number" min="0" name="band:${index}:max" ${index === 3 ? "disabled placeholder=\"∞\"" : `required value="${band.maxTables}"`}></label><label class="management-field"><span>${c.required}</span><input type="number" min="1" max="20" name="band:${index}:required" required value="${band.requiredInside}"></label><label class="workforce-rule-check"><input type="checkbox" name="band:${index}:fixed" ${band.fixedAreas ? "checked" : ""}><span>${c.fixed}</span></label><label class="workforce-rule-check"><input type="checkbox" name="band:${index}:review" ${band.needsReview ? "checked" : ""}><span>${c.review}</span></label></div>`).join("");
  return `<div class="modal-backdrop" data-workforce-schedule-rules-modal><section class="modal-card workforce-schedule-rules-modal" role="dialog" aria-modal="true"><div class="card-heading"><div><h2>${c.title}</h2><p>${c.subtitle}</p></div><button type="button" class="icon-button" data-workforce-schedule-rules-close>×</button></div><form data-workforce-schedule-rules-form><h3>${c.shiftWindows}</h3><div class="workforce-schedule-rules-grid">${shifts}</div><h3>${c.staffing}</h3>${bands}<p class="account-form-message" data-workforce-schedule-rules-error></p><p class="workforce-rule-meta">${c.version}: ${cacheRules.version || 0}${cacheRules.updatedByName ? ` · ${cacheRules.updatedByName}` : ""}</p><div class="account-form-actions"><button type="button" class="secondary-button" data-workforce-schedule-rules-close>${c.cancel}</button><button type="submit" class="primary-button">${c.save}</button></div></form></section></div>`;
}

function openEditor() {
  if (!managerAccount()) return;
  document.querySelector("[data-workforce-schedule-rules-modal]")?.remove();
  document.body.insertAdjacentHTML("beforeend", editorMarkup());
}

function notify(type, title, body) {
  window.dispatchEvent(new CustomEvent("shitu:notify", { detail:{ type, title, body } }));
}

async function saveEditor(form) {
  if (!managerAccount()) return;
  const site = activeSite();
  if (!site) return;
  const data = new FormData(form);
  const shifts = Object.fromEntries(SHIFT_IDS.map((id) => [id, { start:String(data.get(`${id}:start`) || ""), end:String(data.get(`${id}:end`) || "") }]));
  const staffingBands = cacheRules.staffingBands.map((_, index) => ({
    minTables:Number(data.get(`band:${index}:min`)),
    maxTables:index === 3 ? null : Number(data.get(`band:${index}:max`)),
    requiredInside:Number(data.get(`band:${index}:required`)),
    fixedAreas:data.get(`band:${index}:fixed`) === "on",
    needsReview:data.get(`band:${index}:review`) === "on",
  }));
  const submit = form.querySelector('button[type="submit"]');
  const error = form.querySelector("[data-workforce-schedule-rules-error]");
  if (submit) submit.disabled = true;
  if (error) error.textContent = "";
  try {
    const result = await apiRequest(`/api/workforce/${encodeURIComponent(site)}/schedule-rules`, { method:"POST", body:{ shifts, staffingBands } });
    cacheSite = site;
    cacheRules = normalizedRules(result?.rules);
    if (Number.isInteger(Number(result?.moduleRevision))) cacheRevision = Number(result.moduleRevision);
    document.querySelector("[data-workforce-schedule-rules-modal]")?.remove();
    notify("success", copy().success, `v${cacheRules.version}`);
    queueDecorate();
  } catch (cause) {
    const message = String(cause?.code || cause?.message || "ERROR");
    if (error) error.textContent = message;
    notify("error", copy().error, message);
    if (submit) submit.disabled = false;
  }
}

function queueDecorate() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(async () => {
    renderQueued = false;
    addStyles();
    await loadRules(false);
    decorateSchedulePage();
  });
}

function mutationNeedsDecoration(mutation) {
  const selector = '.app-shell,[data-field="schedule-shift"],.schedule-day,.capacity-detail-card,form[data-form="save-schedule"],[data-action="schedule-add"]';
  const nodes = [...mutation.addedNodes, ...mutation.removedNodes];
  return nodes.some((node) => node instanceof Element && (node.matches(selector) || node.querySelector(selector)));
}

document.addEventListener("click", (event) => {
  const add = event.target.closest?.('[data-action="schedule-add"]');
  if (add) newSchedulePending = true;
  const edit = event.target.closest?.('[data-action="schedule-edit"]');
  if (edit) newSchedulePending = false;
  if (event.target.closest?.("[data-workforce-schedule-rules-open]")) {
    event.preventDefault();
    void loadRules(true).then(() => openEditor());
    return;
  }
  if (event.target.closest?.("[data-workforce-schedule-rules-close]")) {
    event.preventDefault();
    document.querySelector("[data-workforce-schedule-rules-modal]")?.remove();
  }
}, true);

document.addEventListener("submit", (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.matches("[data-workforce-schedule-rules-form]")) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void saveEditor(form);
}, true);

document.addEventListener("change", (event) => {
  if (event.target instanceof HTMLSelectElement && event.target.matches('[data-field="schedule-shift"]')) queueDecorate();
}, true);

window.addEventListener("hashchange", queueDecorate);
window.addEventListener("shitu:accounts-synced", () => { cacheRevision = -1; queueDecorate(); });
window.addEventListener("shitu:business-state-updated", () => { cacheRevision = -1; queueDecorate(); });
const observer = new MutationObserver((mutations) => {
  if (mutations.some(mutationNeedsDecoration)) queueDecorate();
});
observer.observe(document.querySelector("#app") || document.body, { childList:true, subtree:true });
queueDecorate();
