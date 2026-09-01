import { assessShiftCapacity, attendanceTotals, calculateAttendance, currentStaff, DEPARTMENTS, excelWorkbook, learningFor, qualifiedAreas, roleCan, roleLabel, schedulesForDate, STAFFING_SHIFTS, STAFF_ROLES } from "./operations.js";
import { qrSvg } from "./qr.js";
import { WORK_AREAS, ZONES } from "./store.js";
import { assessEmployeeSkills, CUSTOM_SKILL_GROUP, flatSkillCatalog, latestSkillRatings, SKILL_GROUPS, skillProfileSummary } from "./skills.js";
import { signedInAdmin } from "./account-permissions.js";

function isoClock(value, language = "vi") {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat(language === "zh" ? "zh-TW" : "vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
  } catch {
    return "—";
  }
}

function isoDateTime(value, language = "vi") {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat(language === "zh" ? "zh-TW" : "vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
  } catch {
    return "—";
  }
}

function elapsed(seconds) {
  const count = Math.max(0, Number(seconds) || 0);
  return `${String(Math.floor(count / 60)).padStart(2, "0")}:${String(count % 60).padStart(2, "0")}`;
}

function makeDraft(area = "noodles") {
  return { id: globalThis.crypto?.randomUUID?.() ?? `sop-${Date.now()}`, area, label: "", labelVi: "", cookSeconds: 0, dineContainer: "", takeawayContainer: "", dineNote: "", takeawayNote: "", plating: "", utensils: [], steps: [], photos: [] };
}

function clone(value) {
  return structuredClone(value);
}

export function createManagement({ store, view, root, icon, heading, cardHeading, escapeHtml, workAreaLabel, zoneLabel, compactNumber, render }) {
  function permitted(state, permission) {
    return signedInAdmin() || roleCan(currentStaff(state)?.role, permission);
  }

  function employeeLabel(state, id) {
    return state.operations.staff.find((member) => member.id === id)?.name || id;
  }

  function areaTabs(context, count = false) {
    return `<div class="zone-tabs management-area-tabs">${WORK_AREAS.map((area) => `<button class="filter-tab ${view.sopArea === area.id ? "selected" : ""}" data-action="sop-area" data-area="${area.id}">${escapeHtml(area[context.language])}${count ? ` <span>${context.state.operations.sops.filter((sop) => sop.area === area.id).length}</span>` : ""}</button>`).join("")}</div>`;
  }

  function sectionTabs(context) {
    const tabs = [
      { id: "standards", label: "SOP" },
      { id: "training", label: context.text.training },
      { id: "checks", label: context.text.photoChecks },
      { id: "history", label: context.text.editHistory },
    ];
    return `<div class="inventory-view-switch management-section-switch">${tabs.map((tab) => `<button class="inventory-view-button ${view.sopPanel === tab.id ? "selected" : ""}" data-action="sop-panel" data-panel="${tab.id}">${escapeHtml(tab.label)}</button>`).join("")}</div>`;
  }

  function sopStatus(sop, text) {
    if (sop.pending) return `<span class="tag tag-low">${escapeHtml(text.pendingApproval)}</span>`;
    return `<span class="tag tag-ok">v${sop.revision} · ${escapeHtml(text.published)}</span>`;
  }

  function photoGallery(photos, editable = false) {
    if (!photos.length) return "";
    return `<div class="management-photo-grid">${photos.map((photo, index) => `<figure class="management-photo"><img src="${escapeHtml(photo.src)}" alt="${escapeHtml(photo.name)}" loading="lazy"/><figcaption><span>${escapeHtml(photo.name)}</span>${editable ? `<button class="inventory-action-button delete-action" type="button" data-action="sop-remove-photo" data-index="${index}">${icon("trash")}</button>` : ""}</figcaption></figure>`).join("")}</div>`;
  }

  function learningState(sop, context, member = currentStaff(context.state)) {
    const learned = learningFor(context.state.operations, sop.id, member.id);
    if (!learned) return { label: context.text.notLearned, tone: "low", learned: false };
    if (learned.revision !== sop.revision) return { label: context.text.outdatedLearning, tone: "empty", learned: false };
    return { label: context.text.learned, tone: "ok", learned: true };
  }

  function sopList(sops, context, active) {
    return `<aside class="sop-list card"><div class="sop-list-heading"><strong>${escapeHtml(context.language === "zh" ? "品項" : "Món")}</strong><span>${sops.length}</span></div>${sops.map((sop) => {
      const learned = learningState(sop, context);
      return `<button class="sop-list-item ${sop.id === active?.id ? "selected" : ""}" data-action="sop-select" data-id="${escapeHtml(sop.id)}"><span><strong>${escapeHtml(context.language === "zh" ? sop.label : sop.labelVi || sop.label)}</strong><small>${escapeHtml(context.language === "zh" ? sop.labelVi : sop.label)}</small></span><span class="sop-learned-dot ${learned.learned ? "done" : "pending"}"></span></button>`;
    }).join("")}</aside>`;
  }

  function sopVersions(sop, context) {
    const { text, language, state } = context;
    if (!sop.versions?.length) return "";
    return `<article class="card sop-versions-card">${cardHeading(text.versions)}<div class="management-list">${sop.versions.map((version) => `<div class="management-list-row"><span><strong>v${version.number} · ${escapeHtml(version.status === "published" ? text.published : text.pendingApproval)}</strong><small>${escapeHtml(version.editor || "system")} · ${escapeHtml(isoDateTime(version.at, language))}${version.approver ? ` · ${escapeHtml(version.approver)}` : ""}</small></span>${version.status === "published" && version.number !== sop.revision && permitted(state, "sop:edit") ? `<button class="secondary-button" data-action="sop-restore" data-id="${escapeHtml(sop.id)}" data-version="${version.number}">${escapeHtml(text.restore)}</button>` : ""}</div>`).join("")}</div></article>`;
  }

  function sopDetail(sop, context) {
    if (!sop) return `<article class="card"><p class="empty-state">${escapeHtml(context.text.noItems)}</p></article>`;
    const { state, language, text } = context;
    const canEdit = permitted(state, "sop:edit");
    const canApprove = permitted(state, "sop:approve");
    const canDelete = permitted(state, "sop:delete");
    const serving = view.sopService === "takeaway";
    const standard = sop.revision > 0 ? sop : sop.pending || sop;
    const learned = learningState(sop, context);
    const utensils = standard.utensils.map((item) => `${escapeHtml(item.name)} · ${item.cc} CC × ${item.count}`).join("<br>") || "—";
    const revisionMessage = sop.pending && sop.revision > 0
      ? `<p class="helper-text pending-version-note">${escapeHtml(text.pendingApproval)}: v${sop.revision + 1}. ${escapeHtml(text.published)}: v${sop.revision}.</p>`
      : "";

    return `<div class="sop-detail-stack"><article class="card sop-detail-card"><div class="sop-detail-heading"><div><h2>${escapeHtml(language === "zh" ? standard.label : standard.labelVi)}</h2><p>${escapeHtml(language === "zh" ? standard.labelVi : standard.label)} · ${escapeHtml(workAreaLabel(standard.area, language))}</p></div><div class="sop-header-actions">${sopStatus(sop, text)}${canEdit ? `<button class="inventory-action-button" data-action="sop-edit" data-id="${escapeHtml(sop.id)}" aria-label="${escapeHtml(text.editSop)}">${icon("edit")}</button>` : ""}${canDelete ? `<button class="inventory-action-button delete-action" data-action="sop-delete" data-id="${escapeHtml(sop.id)}" aria-label="${escapeHtml(text.deleteSop)}">${icon("trash")}</button>` : ""}</div></div>${revisionMessage}${sop.pending && canApprove ? `<button class="primary-button approve-button" data-action="sop-approve" data-id="${escapeHtml(sop.id)}">${icon("check")}${escapeHtml(text.approve)} v${sop.revision + 1}</button>` : ""}<div class="inventory-view-switch sop-service-switch"><button class="inventory-view-button ${!serving ? "selected" : ""}" data-action="sop-service" data-service="dine">內用 · ${escapeHtml(text.dineIn)}</button><button class="inventory-view-button ${serving ? "selected" : ""}" data-action="sop-service" data-service="takeaway">外帶 · ${escapeHtml(text.takeaway)}</button></div><dl class="sop-specifications"><div><dt>${escapeHtml(text.vessel)}</dt><dd>${escapeHtml(serving ? standard.takeawayContainer : standard.dineContainer)}</dd></div><div><dt>${escapeHtml(text.utensils)}</dt><dd>${utensils}</dd></div><div><dt>${escapeHtml(text.plating)}</dt><dd>${escapeHtml(standard.plating || "—")}</dd></div><div><dt>${escapeHtml(text.servingNote)}</dt><dd>${escapeHtml(serving ? standard.takeawayNote : standard.dineNote)}</dd></div>${standard.cookSeconds ? `<div><dt>${escapeHtml(text.cookingTime)}</dt><dd><strong>${elapsed(standard.cookSeconds)}</strong> · ${standard.cookSeconds} ${escapeHtml(text.seconds)}</dd></div>` : ""}</dl><p class="helper-text">${escapeHtml(text.examplePending)}</p><div class="sop-training-action"><span class="tag tag-${learned.tone}">${escapeHtml(learned.label)}</span>${!learned.learned && sop.revision > 0 ? `<button class="secondary-button" data-action="sop-learned" data-id="${escapeHtml(sop.id)}">${icon("check")}${escapeHtml(text.markLearned)}</button>` : ""}</div></article><article class="card">${cardHeading(text.actualPhotos)}${standard.photos.length ? photoGallery(standard.photos) : `<p class="empty-state compact-empty">${escapeHtml(text.noPhoto)}</p>`}</article><article class="card">${cardHeading(text.steps)}<div class="sop-steps">${standard.steps.map((step, index) => `<label class="sop-step"><input type="checkbox"/><span>${String(index + 1).padStart(2, "0")}</span><strong>${escapeHtml(step)}</strong></label>`).join("")}</div></article>${sopVersions(sop, context)}</div>`;
  }

  function draftField(label, name, value, options = {}) {
    const textarea = options.textarea;
    const control = textarea
      ? `<textarea name="${name}" rows="${options.rows || 3}" ${options.required ? "required" : ""}>${escapeHtml(value || "")}</textarea>`
      : `<input type="${options.type || "text"}" name="${name}" value="${escapeHtml(value ?? "")}" ${options.type === "number" ? 'min="0"' : ""} ${options.required ? "required" : ""}/>`;
    return `<label class="management-field ${options.full ? "full-width" : ""}"><span>${escapeHtml(label)}</span>${control}</label>`;
  }

  function captureDraft() {
    const form = root.querySelector?.('[data-form="save-sop"]');
    if (!form || !view.sopDraft || typeof FormData === "undefined") return;
    const data = new FormData(form);
    Object.assign(view.sopDraft, {
      area: String(data.get("area") || view.sopDraft.area),
      label: String(data.get("label") || ""),
      labelVi: String(data.get("labelVi") || ""),
      cookSeconds: Number(data.get("cookSeconds") || 0),
      dineContainer: String(data.get("dineContainer") || ""),
      takeawayContainer: String(data.get("takeawayContainer") || ""),
      dineNote: String(data.get("dineNote") || ""),
      takeawayNote: String(data.get("takeawayNote") || ""),
      plating: String(data.get("plating") || ""),
      steps: String(data.get("steps") || "").split(/\r?\n/).map((step) => step.trim()).filter(Boolean),
      utensils: view.sopDraft.utensils.map((_, index) => ({ name: String(data.get(`utensilName:${index}`) || ""), cc: Number(data.get(`utensilCc:${index}`) || 0), count: Math.max(1, Number(data.get(`utensilCount:${index}`) || 1)) })),
    });
  }

  function sopEditor(context) {
    const { language, text } = context;
    const draft = view.sopDraft;
    return `<article class="card sop-editor-card"><div class="sop-editor-heading"><h2>${escapeHtml(view.sopCreating ? text.addSop : text.editSop)}</h2><button class="icon-button" data-action="sop-cancel">${icon("close")}</button></div><form data-form="save-sop"><div class="management-form-grid"><label class="management-field"><span>${escapeHtml(text.workstation)}</span><select name="area">${WORK_AREAS.map((area) => `<option value="${area.id}" ${draft.area === area.id ? "selected" : ""}>${escapeHtml(area[language])}</option>`).join("")}</select></label>${draftField(text.cookingTime, "cookSeconds", draft.cookSeconds, { type: "number" })}${draftField(text.nameChinese, "label", draft.label, { required: true })}${draftField(text.nameVietnamese, "labelVi", draft.labelVi, { required: true })}${draftField(text.dineContainer, "dineContainer", draft.dineContainer)}${draftField(text.takeawayContainer, "takeawayContainer", draft.takeawayContainer)}${draftField(text.dineNote, "dineNote", draft.dineNote)}${draftField(text.takeawayNote, "takeawayNote", draft.takeawayNote)}${draftField(text.plating, "plating", draft.plating, { textarea: true, full: true })}</div><div class="editor-block"><div class="editor-block-heading"><strong>${escapeHtml(text.utensils)}</strong><button class="secondary-button" type="button" data-action="sop-add-utensil">${icon("plus")}${escapeHtml(text.addUtensil)}</button></div>${draft.utensils.map((utensil, index) => `<div class="utensil-edit-row">${draftField(text.utensilName, `utensilName:${index}`, utensil.name)}${draftField(text.capacityCc, `utensilCc:${index}`, utensil.cc, { type: "number" })}${draftField(text.scoopCount, `utensilCount:${index}`, utensil.count, { type: "number" })}<button class="inventory-action-button delete-action" type="button" data-action="sop-remove-utensil" data-index="${index}">${icon("trash")}</button></div>`).join("")}</div>${draftField(`${text.steps} · ${text.oneStepPerLine}`, "steps", draft.steps.join("\n"), { textarea: true, full: true, rows: 5 })}<div class="editor-block"><div class="editor-block-heading"><strong>${escapeHtml(text.actualPhotos)}</strong></div>${photoGallery(draft.photos, true)}<label class="management-field"><span>${escapeHtml(text.uploadPhoto)}</span><input type="file" accept="image/*" multiple data-field="sop-photos"/></label></div><div class="editor-submit-row"><button class="primary-button" type="submit">${icon("check")}${escapeHtml(text.save)} · ${escapeHtml(text.pendingApproval)}</button><button class="secondary-button" type="button" data-action="sop-cancel">${escapeHtml(text.cancel)}</button></div></form></article>`;
  }

  function trainingPanel(context) {
    const { state, text, language } = context;
    const sops = state.operations.sops.filter((sop) => sop.area === view.sopArea && sop.revision > 0);
    const staff = state.operations.staff.filter((member) => member.active && (member.area === view.sopArea || member.role === "manager"));
    return `<article class="card training-card">${cardHeading(text.training)}${staff.length ? staff.map((member) => {
      const completed = sops.filter((sop) => learningState(sop, context, member).learned).length;
      return `<div class="training-member"><div class="training-member-heading"><span><strong>${escapeHtml(member.name)}</strong><small>${escapeHtml(roleLabel(member.role, language))}</small></span><strong>${completed}/${sops.length}</strong></div><div class="wide-progress"><span style="width:${sops.length ? Math.round(completed / sops.length * 100) : 0}%"></span></div><div class="training-sop-tags">${sops.map((sop) => {
        const status = learningState(sop, context, member);
        return `<span class="tag tag-${status.tone}">${escapeHtml(language === "zh" ? sop.label : sop.labelVi)} · ${escapeHtml(status.label)}</span>`;
      }).join("")}</div></div>`;
    }).join("") : `<p class="empty-state">${escapeHtml(text.noItems)}</p>`}</article>`;
  }

  function checksPanel(context) {
    const { state, text, language } = context;
    const checks = state.operations.inspections.filter((entry) => entry.date === state.selectedDate && entry.area === view.sopArea);
    return `<section class="inspection-layout"><article class="card inspection-form-card">${cardHeading(text.photoChecks)}<form data-form="save-inspection">${draftField(text.checkNote, "note", view.checkNote || "", { textarea: true, rows: 2 })}<label class="management-field"><span>${escapeHtml(text.uploadPhoto)}</span><input type="file" accept="image/*" capture="environment" data-field="inspection-photo"/></label>${view.checkPhoto ? `<img class="inspection-preview" src="${escapeHtml(view.checkPhoto.src)}" alt="${escapeHtml(view.checkPhoto.name)}"/>` : ""}<button class="primary-button" type="submit" ${view.checkPhoto ? "" : "disabled"}>${icon("check")}${escapeHtml(text.addCheck)}</button></form></article><article class="card inspection-history-card">${cardHeading(text.photoChecks, `<span class="tag tag-neutral">${checks.length}</span>`)}${checks.length ? `<div class="inspection-list">${checks.map((check) => `<div class="inspection-entry"><img src="${escapeHtml(check.photo)}" alt="${escapeHtml(check.note || check.staffName)}" loading="lazy"/><div><strong>${escapeHtml(check.note || workAreaLabel(check.area, language))}</strong><small>${escapeHtml(check.staffName)} · ${escapeHtml(isoDateTime(check.at, language))}</small></div></div>`).join("")}</div>` : `<p class="empty-state">${escapeHtml(text.noChecks)}</p>`}</article></section>`;
  }

  function historyPanel(context) {
    const { state, language, text } = context;
    const entries = state.operations.audit.slice(0, 80);
    return `<article class="card audit-card">${cardHeading(text.editHistory)}${entries.length ? `<div class="management-list">${entries.map((entry) => `<div class="management-list-row"><span><strong>${escapeHtml(entry.label)}${entry.details ? ` · ${escapeHtml(entry.details)}` : ""}</strong><small>${escapeHtml(entry.kind)} · ${escapeHtml(entry.staffName)} · ${escapeHtml(isoDateTime(entry.at, language))}</small></span></div>`).join("")}</div>` : `<p class="empty-state">${escapeHtml(text.noItems)}</p>`}</article>`;
  }

  function sopPage(context) {
    const { state, text } = context;
    const canEdit = permitted(state, "sop:edit");
    const actions = `<div class="page-actions"><button class="secondary-button" data-action="sop-qr">${icon("qr")}${escapeHtml(text.stationQr)}</button>${canEdit ? `<button class="primary-button" data-action="sop-add">${icon("plus")}${escapeHtml(text.addSop)}</button>` : ""}</div>`;
    const sops = state.operations.sops.filter((sop) => sop.area === view.sopArea && (canEdit || sop.revision > 0));
    const active = sops.find((sop) => sop.id === view.sopSelected) || sops[0];
    if (active && view.sopSelected !== active.id) view.sopSelected = active.id;
    let content = "";
    if (view.sopDraft) content = sopEditor(context);
    else if (view.sopPanel === "training") content = trainingPanel(context);
    else if (view.sopPanel === "checks") content = checksPanel(context);
    else if (view.sopPanel === "history") content = historyPanel(context);
    else content = `<div class="sop-layout">${sopList(sops, context, active)}${sopDetail(active, context)}</div>`;
    return `${heading(text.sop, text.sopSubtitle, actions)}${areaTabs(context, true)}${sectionTabs(context)}${content}`;
  }

  function trainingStatusCopy(language) {
    return language === "zh" ? {
      assigned: "已安排",
      practicing: "練習中",
      pending_check: "已教學，待實作確認",
      passed: "已通過",
    } : {
      assigned: "Đã giao học",
      practicing: "Đang luyện tập",
      pending_check: "Đã học, chờ kiểm tra",
      passed: "Đã đạt",
    };
  }

  function menuPage(context) {
    const { state, language } = context;
    const copy = language === "zh" ? {
      title: "門市菜單",
      subtitle: "集中查看常見與少見品項、SOP 連結，以及每位員工是否已完成獨立實作確認。",
      all: "全部品項",
      rare: "少見品項",
      missingSop: "尚未建立 SOP",
      pending: "待實作確認",
      common: "常見",
      rareLabel: "少見",
      selectStaff: "查看人員",
      everyone: "全部人員",
      dish: "品項",
      station: "工作區",
      frequency: "出現頻率",
      sop: "SOP 連結",
      training: "教學與實作確認",
      openSop: "開啟 SOP",
      needSop: "需建立 SOP",
      noTraining: "尚無訓練紀錄",
      trainedNotPassed: "完成教學不等於通過；仍需由主管觀察獨立操作。",
    } : {
      title: "Menu món của quán",
      subtitle: "Theo dõi món thường gặp, món ít gặp, liên kết SOP và việc từng nhân viên đã được kiểm tra thực hành độc lập hay chưa.",
      all: "Tất cả món",
      rare: "Món ít gặp",
      missingSop: "Chưa có SOP",
      pending: "Chờ kiểm tra",
      common: "Thường gặp",
      rareLabel: "Ít gặp",
      selectStaff: "Xem theo nhân viên",
      everyone: "Tất cả nhân viên",
      dish: "Món",
      station: "Khu phụ trách",
      frequency: "Mức độ gặp",
      sop: "Liên kết SOP",
      training: "Đào tạo và kiểm tra thực hành",
      openSop: "Mở SOP",
      needSop: "Cần tạo SOP",
      noTraining: "Chưa có lịch sử đào tạo",
      trainedNotPassed: "Đã được hướng dẫn không đồng nghĩa đã đạt; quản lý vẫn cần quan sát lúc nhân viên tự làm.",
    };
    const items = state.operations.menuCatalog || [];
    const records = state.operations.trainingRecords || [];
    const names = [...new Set(records.map((entry) => entry.assigneeName).filter(Boolean))];
    const selectedStaff = names.includes(view.menuStaff) ? view.menuStaff : "all";
    view.menuStaff = selectedStaff;
    const statusCopy = trainingStatusCopy(language);
    const filter = ["all", "rare", "missing-sop", "pending"].includes(view.menuFilter) ? view.menuFilter : "all";
    const visible = items.filter((item) => {
      const itemRecords = records.filter((entry) => entry.menuItemId === item.id && (selectedStaff === "all" || entry.assigneeName === selectedStaff));
      const hasSop = Boolean(item.sopId && state.operations.sops.some((sop) => sop.id === item.sopId && sop.revision > 0));
      if (filter === "rare") return item.frequency === "rare";
      if (filter === "missing-sop") return !hasSop;
      if (filter === "pending") return !itemRecords.length || itemRecords.some((entry) => entry.status !== "passed");
      return true;
    });
    const counts = {
      common: items.filter((item) => item.frequency === "common").length,
      rare: items.filter((item) => item.frequency === "rare").length,
      missing: items.filter((item) => !item.sopId || !state.operations.sops.some((sop) => sop.id === item.sopId && sop.revision > 0)).length,
      pending: items.filter((item) => {
        const itemRecords = records.filter((entry) => entry.menuItemId === item.id && (selectedStaff === "all" || entry.assigneeName === selectedStaff));
        return !itemRecords.length || itemRecords.some((entry) => entry.status !== "passed");
      }).length,
    };
    const filters = [["all", copy.all], ["rare", copy.rare], ["missing-sop", copy.missingSop], ["pending", copy.pending]].map(([id, label]) => `<button class="filter-tab ${filter === id ? "selected" : ""}" data-action="menu-filter" data-filter="${id}">${escapeHtml(label)}</button>`).join("");
    const rows = visible.map((item) => {
      const itemRecords = records.filter((entry) => entry.menuItemId === item.id && (selectedStaff === "all" || entry.assigneeName === selectedStaff));
      const sop = state.operations.sops.find((entry) => entry.id === item.sopId && entry.revision > 0);
      const training = itemRecords.length ? itemRecords.map((entry) => `<span class="menu-training-chip status-${escapeHtml(entry.status)}"><strong>${escapeHtml(entry.assigneeName)}</strong><small>${escapeHtml(statusCopy[entry.status] || entry.status)}</small></span>`).join("") : `<span class="tag tag-low">${escapeHtml(copy.noTraining)}</span>`;
      const sopLink = sop ? `<a class="secondary-button compact-button" href="#sop?zone=${escapeHtml(item.area)}&sop=${escapeHtml(sop.id)}">${icon("sop")}${escapeHtml(copy.openSop)} · v${sop.revision}</a>` : `<a class="tag tag-low menu-sop-missing" href="#sop?zone=${escapeHtml(item.area)}">${escapeHtml(copy.needSop)}</a>`;
      return `<article class="menu-catalog-row"><div class="menu-dish-name"><strong>${escapeHtml(language === "zh" ? item.label : item.labelVi)}</strong><small>${escapeHtml(language === "zh" ? item.labelVi : item.label)}</small></div><span>${escapeHtml(workAreaLabel(item.area, language))}</span><span class="tag ${item.frequency === "rare" ? "tag-low" : "tag-neutral"}">${escapeHtml(item.frequency === "rare" ? copy.rareLabel : copy.common)}</span><div>${sopLink}</div><div class="menu-training-list">${training}</div></article>`;
    }).join("");
    const stats = `<section class="menu-summary-grid"><div><span>${escapeHtml(copy.common)}</span><strong>${counts.common}</strong></div><div><span>${escapeHtml(copy.rareLabel)}</span><strong>${counts.rare}</strong></div><div><span>${escapeHtml(copy.missingSop)}</span><strong>${counts.missing}</strong></div><div><span>${escapeHtml(copy.pending)}</span><strong>${counts.pending}</strong></div></section>`;
    return `${heading(copy.title, copy.subtitle)}<article class="card menu-catalog-toolbar"><div class="zone-tabs">${filters}</div><label><span>${escapeHtml(copy.selectStaff)}</span><select data-field="menu-staff"><option value="all">${escapeHtml(copy.everyone)}</option>${names.map((name) => `<option value="${escapeHtml(name)}" ${name === selectedStaff ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}</select></label></article>${stats}<p class="menu-training-rule">${escapeHtml(copy.trainedNotPassed)}</p><article class="card menu-catalog-card"><div class="menu-catalog-head"><span>${escapeHtml(copy.dish)}</span><span>${escapeHtml(copy.station)}</span><span>${escapeHtml(copy.frequency)}</span><span>${escapeHtml(copy.sop)}</span><span>${escapeHtml(copy.training)}</span></div>${rows || `<p class="empty-state">${escapeHtml(copy.noTraining)}</p>`}</article>`;
  }

  function skillCopy(language) {
    return language === "zh" ? {
      title: "員工能力",
      subtitle: "從整體能力、各區細項到實際訓練過程，持續記錄每位員工能做到什麼、還需要練習什麼。",
      introTitle: "這裡設定的是門市要求，不是員工成績",
      intro: "勾選「納入本站」後，再指定為必要、計分或僅供參考。未勾選代表本站不採用，不會被判定為員工未達標。",
      add: "新增門市技能",
      included: "納入本站",
      core: "必要條件",
      scored: "納入評分",
      reference: "僅供參考",
      unused: "本站不採用",
      active: "已採用技能",
      coreCount: "必要",
      scoredCount: "計分",
      referenceCount: "參考",
      suggested: "建議列為必要",
      empty: "此分類尚未選擇任何技能。展開後可逐項設定。",
      customTitle: "新增門市自訂技能",
      viName: "越文名稱",
      zhName: "中文名稱",
      viDetail: "越文說明",
      zhDetail: "中文說明",
      critical: "建議列為必要條件",
      save: "新增至技能目錄",
      delete: "刪除這項自訂技能？",
      rights: "只有管理者可以調整各區標準；帶訓人員之後會依已核定的項目進行評估。",
      overviewTab: "整體能力與訓練",
      standardsTab: "各區能力細項",
      assessmentTab: "逐項能力評估",
      overallTitle: "四區能力總覽",
      overallHint: "區域等級來自該區已選定的必要與計分項目；尚未評估不會被當作不合格。",
      trainingPlanTitle: "實際教育訓練與區外工作",
      trainingPlanHint: "把菜單品項、盤點、叫貨、外場出餐與帶訓排程一起記錄，並連回相關 SOP 或能力細項。",
      noAssessment: "尚未評估",
      relatedStandard: "關聯標準",
      attempts: "練習次數",
      categoryMenu: "菜單品項",
      categoryStation: "區域技能",
      categoryExternal: "區外工作",
      selectEmployee: "選擇員工",
      progress: "評估進度",
      suggestedLevel: "建議等級",
      approvedLevel: "已核定等級",
      average: "平均能力",
      evaluators: "評估人數",
      noRating: "尚未觀察",
      level0: "0 · 尚未學習",
      level1: "1 · 了解內容，尚無法操作",
      level2: "2 · 需在旁指導",
      level3: "3 · 可獨立作業",
      level4: "4 · 尖峰時段也能穩定處理",
      assessmentNote: "本次觀察備註",
      assessmentNoteHint: "例：一般班可獨立操作，尖峰排單仍需提醒。",
      saveAssessment: "儲存本次評估",
      approveLevel: "主管核定建議等級",
      notReady: "資料尚不足，暫時不能核定",
      needTwo: "B／A 等級需至少兩位不同人員評估",
      noStandards: "此工作區尚未選定技能。請先到「各區技能標準」勾選要採用的項目。",
      assessmentHistory: "歷次評估",
      observedSkills: "已觀察技能",
      lastAssessment: "最近評估",
      provisional: "暫定",
      currentEvaluator: "目前評估人",
      coreIncomplete: "必要技能尚未全部完成評估",
      levelGuideTitle: "B 與 A 的差別",
      levelBTitle: "B · 可獨立穩定作業",
      levelBDesc: "能獨立顧好本站，熟悉一般流程，也能處理已熟悉的尖峰單量；遇到複雜異常時仍可能需要主管協助。",
      levelATitle: "A · 能掌控整個工作區",
      levelADesc: "除了具備 B 的能力，還能在塞單時重新排單與分工、預先發現缺料或延誤、處理異常，並可帶訓與修正他人。",
      levelGuideRule: "能獨自撐過尖峰是 A 的重要條件，但還要看異常處理、區域掌控與帶訓能力。",
      waitingVerification: "能力已達建議等級，等待第二位人員複核",
      verified: "已完成雙人複核",
    } : {
      title: "Năng lực nhân viên",
      subtitle: "Theo dõi năng lực tổng thể, kỹ năng chi tiết từng khu và toàn bộ quá trình học, luyện tập, kiểm tra thực tế của mỗi nhân viên.",
      introTitle: "Đây là nơi đặt tiêu chuẩn của quán, chưa phải nơi chấm nhân viên",
      intro: "Tích “Áp dụng cho khu” rồi chọn kỹ năng bắt buộc, tính điểm hoặc chỉ tham khảo. Mục không tích được hiểu là quán không dùng cho khu này, không phải nhân viên chưa đạt.",
      add: "Thêm kỹ năng của quán",
      included: "Áp dụng cho khu",
      core: "Bắt buộc phải đạt",
      scored: "Dùng để tính điểm",
      reference: "Chỉ tham khảo",
      unused: "Khu này không áp dụng",
      active: "Kỹ năng đang áp dụng",
      coreCount: "Bắt buộc",
      scoredCount: "Tính điểm",
      referenceCount: "Tham khảo",
      suggested: "Nên đặt là bắt buộc",
      empty: "Nhóm này chưa có kỹ năng nào được chọn. Mở nhóm để thiết lập từng mục.",
      customTitle: "Thêm kỹ năng riêng của quán",
      viName: "Tên để người Việt đọc",
      zhName: "台灣管理者閱讀的名稱",
      viDetail: "Mô tả tiếng Việt",
      zhDetail: "中文說明",
      critical: "Đề xuất đặt làm kỹ năng bắt buộc",
      save: "Thêm vào danh mục",
      delete: "Xóa kỹ năng tự tạo này?",
      rights: "Chỉ quản lý được thay đổi tiêu chuẩn từng khu; người đào tạo sẽ đánh giá theo danh sách đã được xác định.",
      overviewTab: "Tổng thể và đào tạo",
      standardsTab: "Chi tiết năng lực từng khu",
      assessmentTab: "Đánh giá từng kỹ năng",
      overallTitle: "Tổng quan năng lực bốn khu",
      overallHint: "Cấp từng khu được tính từ những kỹ năng bắt buộc và tính điểm đã chọn; mục chưa quan sát không bị coi là nhân viên không đạt.",
      trainingPlanTitle: "Đào tạo thực tế và công việc ngoài khu",
      trainingPlanHint: "Ghi chung món trong menu, kiểm kê, gọi hàng, nghe sảnh gọi món và công việc đào tạo; mỗi mục liên kết về SOP hoặc kỹ năng liên quan.",
      noAssessment: "Chưa đánh giá",
      relatedStandard: "Tiêu chuẩn liên quan",
      attempts: "Số lần luyện",
      categoryMenu: "Món trong menu",
      categoryStation: "Kỹ năng tại khu",
      categoryExternal: "Công việc ngoài khu",
      selectEmployee: "Chọn nhân viên",
      progress: "Tiến độ đã đánh giá",
      suggestedLevel: "Cấp hệ thống đề xuất",
      approvedLevel: "Cấp quản lý đã duyệt",
      average: "Năng lực trung bình",
      evaluators: "Người đã đánh giá",
      noRating: "Chưa quan sát",
      level0: "0 · Chưa học",
      level1: "1 · Hiểu nội dung nhưng chưa làm được",
      level2: "2 · Làm được khi có người hướng dẫn",
      level3: "3 · Có thể làm độc lập",
      level4: "4 · Làm ổn định cả giờ cao điểm",
      assessmentNote: "Nhận xét của lần quan sát này",
      assessmentNoteHint: "Ví dụ: Ca thường làm độc lập, khi đông khách vẫn cần nhắc cách xếp đơn.",
      saveAssessment: "Lưu lần đánh giá này",
      approveLevel: "Quản lý duyệt cấp đề xuất",
      notReady: "Chưa đủ dữ liệu để quản lý duyệt",
      needTwo: "Cấp B/A cần ít nhất hai người khác nhau đánh giá",
      noStandards: "Khu này chưa chọn kỹ năng áp dụng. Hãy quay lại “Tiêu chuẩn từng khu” để thiết lập trước.",
      assessmentHistory: "Lịch sử các lần đánh giá",
      observedSkills: "Kỹ năng đã quan sát",
      lastAssessment: "Lần đánh giá gần nhất",
      provisional: "Tạm thời",
      currentEvaluator: "Người đang đánh giá",
      coreIncomplete: "Chưa đánh giá đủ các kỹ năng bắt buộc",
      levelGuideTitle: "Cấp B và A khác nhau thế nào?",
      levelBTitle: "B · Thành thạo vận hành",
      levelBDesc: "Tự đứng và giữ ổn định khu, làm tốt quy trình thường ngày và xử lý được lượng đơn cao điểm đã quen; tình huống phức tạp vẫn có thể cần quản lý hỗ trợ.",
      levelATitle: "A · Làm chủ khu",
      levelADesc: "Ngoài toàn bộ năng lực B, còn biết cứu khu khi nghẽn, sắp xếp lại đơn và người hỗ trợ, phát hiện sớm thiếu hàng hoặc chậm món, xử lý bất thường và hướng dẫn người khác.",
      levelGuideRule: "Tự xử lý được giờ cao điểm là điều kiện quan trọng của A, nhưng chưa đủ nếu chưa thể xử lý bất thường, kiểm soát toàn khu và đào tạo người khác.",
      waitingVerification: "Năng lực đã đạt mức đề xuất, đang chờ người thứ hai xác nhận",
      verified: "Đã có hai người đánh giá",
    };
  }

  function skillStatusOptions(copy, selected) {
    return [
      ["core", copy.core],
      ["scored", copy.scored],
      ["reference", copy.reference],
    ].map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${escapeHtml(label)}</option>`).join("");
  }

  function skillRow(skill, context, copy) {
    const { state, language } = context;
    const canManage = permitted(state, "skills:manage");
    const status = state.operations.skillProfiles?.[view.skillsArea]?.[skill.id] || "inactive";
    const active = status !== "inactive";
    return `<div class="skill-catalog-row ${active ? `is-active status-${status}` : "is-inactive"}" data-skill-id="${escapeHtml(skill.id)}"><label class="skill-apply-toggle"><input type="checkbox" data-action="skill-toggle" data-area="${escapeHtml(view.skillsArea)}" data-id="${escapeHtml(skill.id)}" ${active ? "checked" : ""} ${canManage ? "" : "disabled"}/><span>${escapeHtml(copy.included)}</span></label><div class="skill-copy"><div class="skill-title-line"><strong>${escapeHtml(skill[language].title)}</strong>${skill.critical ? `<span class="tag tag-low">${escapeHtml(copy.suggested)}</span>` : ""}${skill.custom ? `<span class="tag tag-neutral">${escapeHtml(language === "zh" ? "門市自訂" : "Tự thêm")}</span>` : ""}</div><p>${escapeHtml(skill[language].detail || "—")}</p></div><div class="skill-assignment"><select data-field="skill-status" data-area="${escapeHtml(view.skillsArea)}" data-id="${escapeHtml(skill.id)}" ${active && canManage ? "" : "disabled"} aria-label="${escapeHtml(active ? copy.included : copy.unused)}">${skillStatusOptions(copy, active ? status : (skill.critical ? "core" : "scored"))}</select>${skill.custom && canManage ? `<button class="inventory-action-button delete-action" data-action="skill-delete" data-id="${escapeHtml(skill.id)}" aria-label="${escapeHtml(copy.delete)}">${icon("trash")}</button>` : ""}</div></div>`;
  }

  function skillsCatalogPanel(context, copy) {
    const { state, language } = context;
    const summary = skillProfileSummary(state.operations, view.skillsArea);
    const groups = [...SKILL_GROUPS, CUSTOM_SKILL_GROUP];
    const allSkills = flatSkillCatalog(state.operations.customSkills);
    const groupCards = groups.map((group, index) => {
      const skills = allSkills.filter((skill) => skill.groupId === group.id);
      if (!skills.length && group.id === "custom") return "";
      const selected = skills.filter((skill) => state.operations.skillProfiles?.[view.skillsArea]?.[skill.id]).length;
      return `<details class="card skill-group-card" ${index === 0 || selected ? "open" : ""}><summary><span><strong>${escapeHtml(group[language])}</strong><small>${selected}/${skills.length} ${escapeHtml(copy.active.toLowerCase())}</small></span><span class="skill-group-count">${selected}</span></summary><div class="skill-group-body">${skills.length ? skills.map((skill) => skillRow(skill, context, copy)).join("") : `<p class="empty-state">${escapeHtml(copy.empty)}</p>`}</div></details>`;
    }).join("");
    return `<article class="card skill-catalog-intro"><div>${icon("spark")}<span><strong>${escapeHtml(copy.introTitle)}</strong><p>${escapeHtml(copy.intro)}</p></span></div><small>${escapeHtml(copy.rights)}</small></article><section class="skill-profile-summary"><div><span>${escapeHtml(copy.active)}</span><strong>${summary.active}</strong></div><div><span>${escapeHtml(copy.coreCount)}</span><strong>${summary.core}</strong></div><div><span>${escapeHtml(copy.scoredCount)}</span><strong>${summary.scored}</strong></div><div><span>${escapeHtml(copy.referenceCount)}</span><strong>${summary.reference}</strong></div></section><section class="skill-catalog-list">${groupCards}</section>`;
  }

  function skillLevelOptions(copy, value) {
    const labels = [copy.level0, copy.level1, copy.level2, copy.level3, copy.level4];
    return `<option value="">${escapeHtml(copy.noRating)}</option>${labels.map((label, level) => `<option value="${level}" ${Number(value) === level ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}`;
  }

  function skillAssessmentPanel(context, copy) {
    const { state, language } = context;
    const staff = state.operations.staff.filter((member) => member.active);
    if (!staff.some((member) => member.id === view.skillsStaffId)) view.skillsStaffId = staff[0]?.id || "";
    const staffId = view.skillsStaffId;
    const employee = staff.find((member) => member.id === staffId);
    const evaluator = currentStaff(state);
    const canEvaluate = permitted(state, "skills:evaluate");
    const canApprove = permitted(state, "skills:approve");
    const profile = state.operations.skillProfiles?.[view.skillsArea] || {};
    const catalog = flatSkillCatalog(state.operations.customSkills);
    const activeSkills = catalog.filter((skill) => profile[skill.id]);
    const result = assessEmployeeSkills(state.operations, staffId, view.skillsArea);
    const latest = latestSkillRatings(state.operations, staffId, view.skillsArea);
    const mine = new Map(latest.filter((entry) => entry.evaluatorId === evaluator.id).map((entry) => [entry.skillId, entry.level]));
    const averages = new Map(activeSkills.map((skill) => {
      const values = latest.filter((entry) => entry.skillId === skill.id).map((entry) => entry.level);
      return [skill.id, values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null];
    }));
    const sessions = state.operations.skillAssessments.filter((entry) => entry.staffId === staffId && entry.area === view.skillsArea).slice(0, 8);
    const statusLabel = { core: copy.core, scored: copy.scored, reference: copy.reference };
    const needsSecondEvaluator = ["A", "B"].includes(result.suggestedLevel) && result.evaluatorCount < 2;
    const levelState = result.approval
      ? `${escapeHtml(result.approval.approverName)} · ${escapeHtml(isoDateTime(result.approval.at, language))}`
      : needsSecondEvaluator ? `1/2 · ${escapeHtml(copy.waitingVerification)}`
        : result.evaluatorCount >= 2 ? escapeHtml(copy.verified) : escapeHtml(copy.provisional);
    const stats = `<section class="skill-assessment-stats"><div class="level-result ${needsSecondEvaluator ? "awaiting-verification" : ""}"><span>${escapeHtml(result.approval ? copy.approvedLevel : copy.suggestedLevel)}</span><strong>${escapeHtml(result.approval?.level || result.suggestedLevel || "—")}</strong><small>${levelState}</small></div><div><span>${escapeHtml(copy.progress)}</span><strong>${result.coverage}%</strong><small>${result.observed}/${result.total} ${escapeHtml(copy.observedSkills.toLowerCase())}</small></div><div><span>${escapeHtml(copy.average)}</span><strong>${result.average ?? "—"}<small>/4</small></strong><small>${result.coreComplete ? escapeHtml(copy.coreCount) : escapeHtml(copy.coreIncomplete)}</small></div><div><span>${escapeHtml(copy.evaluators)}</span><strong>${result.evaluatorCount}</strong><small>${escapeHtml(result.evaluators.map((entry) => entry.name).join(" · ") || "—")}</small></div></section>`;
    const levelGuide = `<article class="card skill-level-guide"><div class="skill-level-guide-heading">${icon("spark")}<div><strong>${escapeHtml(copy.levelGuideTitle)}</strong><p>${escapeHtml(copy.levelGuideRule)}</p></div></div><div class="skill-level-comparison"><section class="level-b"><strong>${escapeHtml(copy.levelBTitle)}</strong><p>${escapeHtml(copy.levelBDesc)}</p></section><section class="level-a"><strong>${escapeHtml(copy.levelATitle)}</strong><p>${escapeHtml(copy.levelADesc)}</p></section></div></article>`;
    if (!activeSkills.length) return `${stats}${levelGuide}<article class="card"><p class="empty-state">${escapeHtml(copy.noStandards)}</p></article>`;
    const rows = activeSkills.map((skill) => {
      const status = profile[skill.id];
      const average = averages.get(skill.id);
      const evaluatorCount = latest.filter((entry) => entry.skillId === skill.id).length;
      return `<div class="skill-rating-row"><div class="skill-rating-copy"><div><strong>${escapeHtml(skill[language].title)}</strong><span class="tag ${status === "core" ? "tag-low" : "tag-neutral"}">${escapeHtml(statusLabel[status])}</span></div><p>${escapeHtml(skill[language].detail)}</p></div><div class="skill-rating-consensus"><span>${escapeHtml(language === "zh" ? "目前綜合" : "Tổng hợp hiện tại")}</span><strong>${average === undefined || average === null ? "—" : Math.round(average * 10) / 10}<small>/4</small></strong><small>${evaluatorCount} ${escapeHtml(copy.evaluators.toLowerCase())}</small></div><label class="skill-rating-input"><span>${escapeHtml(copy.currentEvaluator)} · ${escapeHtml(evaluator.name)}</span><select name="rating:${escapeHtml(skill.id)}" ${canEvaluate ? "" : "disabled"}>${skillLevelOptions(copy, mine.get(skill.id))}</select></label></div>`;
    }).join("");
    const readyMessage = result.approvalReady ? "" : `<p class="assessment-warning">${escapeHtml(["A", "B"].includes(result.suggestedLevel) && result.evaluatorCount < 2 ? copy.needTwo : copy.notReady)}</p>`;
    const approval = canApprove ? `<div class="skill-approval-action"><button class="secondary-button" type="button" data-action="skill-approve" data-staff-id="${escapeHtml(staffId)}" data-area="${escapeHtml(view.skillsArea)}" ${result.approvalReady ? "" : "disabled"}>${icon("check")}${escapeHtml(copy.approveLevel)}${result.suggestedLevel ? ` · ${result.suggestedLevel}` : ""}</button>${readyMessage}</div>` : "";
    const history = sessions.length ? sessions.map((session) => `<div class="skill-history-row"><span><strong>${escapeHtml(session.evaluatorName)}</strong><small>${escapeHtml(roleLabel(session.evaluatorRole, language))} · ${escapeHtml(isoDateTime(session.at, language))}</small></span><strong>${session.ratings.length} ${escapeHtml(copy.observedSkills.toLowerCase())}</strong>${session.note ? `<p>${escapeHtml(session.note)}</p>` : ""}</div>`).join("") : `<p class="empty-state">${escapeHtml(copy.noRating)}</p>`;
    return `<article class="card skill-assessment-toolbar"><label><span>${escapeHtml(copy.selectEmployee)}</span><select data-field="skills-staff">${staff.map((member) => `<option value="${escapeHtml(member.id)}" ${member.id === staffId ? "selected" : ""}>${escapeHtml(member.name)} · ${escapeHtml(roleLabel(member.role, language))}</option>`).join("")}</select></label><div><span>${escapeHtml(copy.currentEvaluator)}</span><strong>${escapeHtml(evaluator.name)} · ${escapeHtml(roleLabel(evaluator.role, language))}</strong></div></article>${stats}${levelGuide}<form class="card skill-assessment-form" data-form="save-skill-assessment"><div class="skill-rating-list">${rows}</div><label class="management-field full-width"><span>${escapeHtml(copy.assessmentNote)}</span><textarea name="note" rows="3" placeholder="${escapeHtml(copy.assessmentNoteHint)}" ${canEvaluate ? "" : "disabled"}></textarea></label><div class="skill-assessment-actions">${canEvaluate ? `<button class="primary-button" type="submit">${icon("check")}${escapeHtml(copy.saveAssessment)}</button>` : ""}${approval}</div></form><article class="card skill-history-card">${cardHeading(copy.assessmentHistory, `<span class="tag tag-neutral">${sessions.length}</span>`)}<div class="skill-history-list">${history}</div></article>`;
  }

  function competencyOverviewPanel(context, copy) {
    const { state, language } = context;
    const staff = state.operations.staff.filter((member) => member.active);
    if (!staff.some((member) => member.id === view.skillsStaffId)) view.skillsStaffId = staff[0]?.id || "";
    const staffId = view.skillsStaffId;
    const statusCopy = trainingStatusCopy(language);
    const categoryCopy = { menu: copy.categoryMenu, station: copy.categoryStation, external: copy.categoryExternal };
    const catalog = flatSkillCatalog(state.operations.customSkills);
    const canEvaluate = permitted(state, "skills:evaluate");
    const areaCards = WORK_AREAS.map((area) => {
      const result = assessEmployeeSkills(state.operations, staffId, area.id);
      const level = result.approval?.level || result.suggestedLevel || "—";
      const profile = skillProfileSummary(state.operations, area.id);
      return `<article class="competency-area-card"><span>${escapeHtml(area[language])}</span><strong>${escapeHtml(level)}</strong><small>${result.total ? `${result.coverage}% · ${result.observed}/${result.total}` : escapeHtml(copy.noAssessment)}</small><div class="wide-progress"><span style="width:${result.coverage}%"></span></div><a href="#skills?zone=${escapeHtml(area.id)}&panel=assessment">${escapeHtml(language === "zh" ? `查看 ${profile.active} 項細節` : `Xem ${profile.active} kỹ năng chi tiết`)}</a></article>`;
    }).join("");
    const trainingRows = (state.operations.trainingRecords || []).map((record) => {
      const skill = catalog.find((entry) => entry.id === record.skillId);
      const linkedSop = state.operations.sops.find((entry) => entry.id === record.sopId && entry.revision > 0);
      const menuItem = state.operations.menuCatalog?.find((entry) => entry.id === record.menuItemId);
      let link = skill ? `<a href="#skills?zone=${escapeHtml(record.area)}&panel=catalog">${escapeHtml(skill[language]?.title || record.skillId)}</a>` : "—";
      if (linkedSop) link = `<a href="#sop?zone=${escapeHtml(record.area)}&sop=${escapeHtml(linkedSop.id)}">${escapeHtml(language === "zh" ? linkedSop.label : linkedSop.labelVi)}</a>`;
      else if (menuItem) link = `<a href="#menu">${escapeHtml(language === "zh" ? menuItem.label : menuItem.labelVi)}</a>`;
      const options = Object.entries(statusCopy).map(([value, label]) => `<option value="${value}" ${record.status === value ? "selected" : ""}>${escapeHtml(label)}</option>`).join("");
      return `<article class="training-progress-row"><div class="training-person"><strong>${escapeHtml(record.assigneeName)}</strong><small>${escapeHtml(categoryCopy[record.category])} · ${escapeHtml(workAreaLabel(record.area, language))}</small></div><div class="training-topic"><strong>${escapeHtml(language === "zh" ? record.label : record.labelVi)}</strong><small>${escapeHtml(record.note || "—")}</small></div><div class="training-standard"><span>${escapeHtml(copy.relatedStandard)}</span>${link}</div><div class="training-attempts"><span>${escapeHtml(copy.attempts)}</span><strong>${record.attempts}</strong></div><label class="training-status-field"><select data-field="training-status" data-id="${escapeHtml(record.id)}" ${canEvaluate ? "" : "disabled"}>${options}</select></label></article>`;
    }).join("");
    return `<article class="card skill-assessment-toolbar competency-overview-toolbar"><label><span>${escapeHtml(copy.selectEmployee)}</span><select data-field="skills-staff">${staff.map((member) => `<option value="${escapeHtml(member.id)}" ${member.id === staffId ? "selected" : ""}>${escapeHtml(member.name)} · ${escapeHtml(roleLabel(member.role, language))}</option>`).join("")}</select></label><p>${escapeHtml(copy.overallHint)}</p></article><section class="competency-overview-heading"><h2>${escapeHtml(copy.overallTitle)}</h2></section><section class="competency-area-grid">${areaCards}</section><article class="card training-plan-card">${cardHeading(copy.trainingPlanTitle, `<span class="tag tag-neutral">${state.operations.trainingRecords?.length || 0}</span>`)}<p class="helper-text">${escapeHtml(copy.trainingPlanHint)}</p><div class="training-progress-list">${trainingRows}</div></article>`;
  }

  function skillsPage(context) {
    const { state, language } = context;
    const copy = skillCopy(language);
    const canManage = permitted(state, "skills:manage");
    const panel = ["overview", "catalog", "assessment"].includes(view.skillsPanel) ? view.skillsPanel : "overview";
    const actions = panel === "catalog" && canManage ? `<button class="primary-button" data-action="skill-add">${icon("plus")}${escapeHtml(copy.add)}</button>` : "";
    const panelTabs = `<div class="inventory-view-switch skills-panel-switch"><button class="inventory-view-button ${panel === "overview" ? "selected" : ""}" data-action="skills-panel" data-panel="overview">${escapeHtml(copy.overviewTab)}</button><button class="inventory-view-button ${panel === "catalog" ? "selected" : ""}" data-action="skills-panel" data-panel="catalog">${escapeHtml(copy.standardsTab)}</button><button class="inventory-view-button ${panel === "assessment" ? "selected" : ""}" data-action="skills-panel" data-panel="assessment">${escapeHtml(copy.assessmentTab)}</button></div>`;
    const areaTabs = `<div class="zone-tabs management-area-tabs">${WORK_AREAS.map((area) => {
      const areaSummary = skillProfileSummary(state.operations, area.id);
      return `<button class="filter-tab ${view.skillsArea === area.id ? "selected" : ""}" data-action="skills-area" data-area="${area.id}">${escapeHtml(area[language])} <span>${areaSummary.active}</span></button>`;
    }).join("")}</div>`;
    const content = panel === "overview" ? competencyOverviewPanel(context, copy) : panel === "catalog" ? skillsCatalogPanel(context, copy) : skillAssessmentPanel(context, copy);
    return `${heading(copy.title, copy.subtitle, actions)}${panelTabs}${panel === "overview" ? "" : areaTabs}${content}`;
  }

  function attendanceRow(entry, context) {
    const { state, text, language } = context;
    const wage = calculateAttendance(entry, state.operations.payroll);
    return `<article class="attendance-row"><div class="attendance-person"><strong>${escapeHtml(entry.staffName)}</strong><small>${escapeHtml(workAreaLabel(entry.area, language))} · NT$${compactNumber(entry.hourlyRate, language)}/${escapeHtml(text.hours)}</small></div><div class="attendance-times"><strong>${escapeHtml(isoClock(entry.clockIn, language))} → ${escapeHtml(isoClock(entry.clockOut, language))}</strong><small>${entry.scheduledStart ? `${escapeHtml(text.scheduledStart)} ${escapeHtml(entry.scheduledStart)}` : escapeHtml(entry.date)}</small></div><div class="attendance-hours"><strong>${wage.hours} ${escapeHtml(text.hours)}</strong><small>${entry.breakMinutes ? `−${entry.breakMinutes} ${escapeHtml(text.minutes)}` : ""}${wage.lateMinutes ? ` · ${escapeHtml(text.lateMinutes)} ${wage.lateMinutes}′` : ""}</small></div><div class="attendance-wages"><strong>NT$${compactNumber(wage.net, language)}</strong><small>${wage.deduction ? `−NT$${compactNumber(wage.deduction, language)}` : entry.clockOut ? escapeHtml(text.shiftFinished) : escapeHtml(text.workingNow)}</small></div><div class="attendance-actions">${!entry.clockOut && (entry.staffId === currentStaff(state).id || permitted(state, "attendance:manage")) ? `<button class="secondary-button" data-action="clock-out" data-id="${escapeHtml(entry.id)}">${escapeHtml(text.clockOut)}</button>` : ""}${permitted(state, "attendance:manage") ? `<button class="inventory-action-button" data-action="attendance-edit" data-id="${escapeHtml(entry.id)}">${icon("edit")}</button>` : ""}</div></article>`;
  }

  function payrollPolicyCard(context) {
    const { state, text } = context;
    const policy = state.operations.payroll;
    const disabled = !permitted(state, "staff:manage") ? "disabled" : "";
    return `<article class="card payroll-policy-card">${cardHeading(text.payrollPolicy, `<span class="tag ${policy.latePenaltyEnabled && policy.latePenaltyAmount ? "tag-low" : "tag-neutral"}">${escapeHtml(policy.latePenaltyEnabled && policy.latePenaltyAmount ? text.enableLatePenalty : text.awaitingSetup)}</span>`)}<p class="helper-text">${escapeHtml(policy.latePenaltyEnabled && policy.latePenaltyAmount ? `${text.latePenalty}: NT$${policy.latePenaltyAmount}` : text.policyPending)}</p><label class="policy-toggle"><input type="checkbox" data-field="payroll" data-key="latePenaltyEnabled" ${policy.latePenaltyEnabled ? "checked" : ""} ${disabled}/><span>${escapeHtml(text.enableLatePenalty)}</span></label><div class="management-form-grid policy-grid"><label class="management-field"><span>${escapeHtml(text.lateGrace)}</span><input type="number" min="0" value="${policy.lateGraceMinutes}" data-field="payroll" data-key="lateGraceMinutes" ${disabled}/></label><label class="management-field"><span>${escapeHtml(text.latePenalty)}</span><input type="number" min="0" value="${policy.latePenaltyAmount}" data-field="payroll" data-key="latePenaltyAmount" ${disabled}/></label><label class="management-field full-width"><span>${escapeHtml(text.latePenalty)}</span><select data-field="payroll" data-key="latePenaltyMode" ${disabled}><option value="fixed" ${policy.latePenaltyMode === "fixed" ? "selected" : ""}>${escapeHtml(text.fixedPenalty)}</option><option value="per-minute" ${policy.latePenaltyMode === "per-minute" ? "selected" : ""}>${escapeHtml(text.perMinutePenalty)}</option></select></label></div></article>`;
  }

  function attendancePage(context) {
    const { state, text, language } = context;
    const employee = currentStaff(state);
    const managed = permitted(state, "attendance:manage");
    const entries = state.operations.attendance.filter((entry) => entry.date === state.selectedDate && (managed || entry.staffId === employee.id));
    const totals = attendanceTotals(entries, state.operations.payroll);
    const working = state.operations.attendance.find((entry) => entry.staffId === employee.id && !entry.clockOut);
    const action = working
      ? `<button class="primary-button" data-action="clock-out" data-id="${escapeHtml(working.id)}">${icon("check")}${escapeHtml(text.clockOut)}</button>`
      : `<button class="primary-button" data-action="clock-in-open">${icon("clock")}${escapeHtml(text.clockIn)}</button>`;
    return `${heading(text.attendance, text.attendanceSubtitle, action)}<section class="stats-grid attendance-stats"><article class="stat-card"><div class="stat-top"><span>${escapeHtml(text.staff)}</span></div><div class="stat-value">${new Set(entries.map((entry) => entry.staffId)).size}</div><p>${entries.length} ${escapeHtml(text.attendance)}</p></article><article class="stat-card stat-blue"><div class="stat-top"><span>${escapeHtml(text.workedHours)}</span></div><div class="stat-value">${Math.round(totals.minutes / 60 * 100) / 100}<span>${escapeHtml(text.hours)}</span></div><p>${escapeHtml(state.selectedDate)}</p></article><article class="stat-card stat-amber"><div class="stat-top"><span>${escapeHtml(text.lateMinutes)}</span></div><div class="stat-value">${totals.late}</div><p>${escapeHtml(state.operations.payroll.latePenaltyEnabled ? text.deductions : text.policyPending)}</p></article><article class="stat-card stat-green"><div class="stat-top"><span>${escapeHtml(text.netPay)}</span></div><div class="stat-value">${compactNumber(totals.net, language)}<span>NT$</span></div><p>${escapeHtml(text.grossPay)} ${compactNumber(totals.gross, language)}</p></article></section><section class="attendance-layout"><article class="card attendance-list-card">${cardHeading(text.attendance, `<span class="tag tag-neutral">${entries.length}</span>`)}${entries.length ? `<div class="attendance-list">${entries.map((entry) => attendanceRow(entry, context)).join("")}</div>` : `<p class="empty-state">${escapeHtml(text.noAttendance)}</p>`}</article>${payrollPolicyCard(context)}</section>`;
  }

  function dateRange(from, to) {
    const dates = [];
    const start = new Date(`${from}T12:00:00`);
    const end = new Date(`${to}T12:00:00`);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) return dates;
    for (let cursor = start; cursor <= end && dates.length < 370; cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1, 12)) {
      dates.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`);
    }
    return dates;
  }

  function schedulePage(context) {
    const { state, text, language } = context;
    const month = view.scheduleMonth || state.selectedDate.slice(0, 7);
    const selectedCapacity = assessShiftCapacity(state, state.selectedDate, view.scheduleShift);
    const canManage = permitted(state, "schedule:manage");
    const [year, monthNumber] = month.split("-").map(Number);
    const days = new Date(year, monthNumber, 0).getDate();
    const calendar = Array.from({ length: days }, (_, index) => {
      const date = `${month}-${String(index + 1).padStart(2, "0")}`;
      const record = state.records[date];
      const dinner = record?.reservation?.dinnerTables || 0;
      const capacity = assessShiftCapacity(state, date, view.scheduleShift);
      const status = capacity.needsReview ? "review" : capacity.overloaded ? "overloaded" : "ready";
      const label = status === "overloaded" ? (language === "zh" ? "超載" : "Quá tải") : status === "ready" ? (language === "zh" ? "足夠" : "Đủ") : (language === "zh" ? "待確認" : "Chờ xác nhận");
      return `<button class="schedule-day ${date === state.selectedDate ? "selected" : ""} status-${status}" data-action="schedule-date" data-date="${date}"><strong>${index + 1}</strong><span>${dinner} ${escapeHtml(text.tables)} · ${capacity.inside.length}/${capacity.requiredInside} 內</span><small>${escapeHtml(label)}</small></button>`;
    }).join("");
    const assignments = selectedCapacity.entries.map((entry) => {
      const skills = qualifiedAreas(state.operations, entry.staffId);
      const area = entry.department === "inside" ? workAreaLabel(entry.area, language) : entry.area === "cashier" ? (language === "zh" ? "收銀" : "Thu ngân") : (language === "zh" ? "服務" : "Phục vụ");
      const shift = STAFFING_SHIFTS.find((item) => item.id === entry.shift);
      return `<div class="schedule-person-row"><div><strong>${escapeHtml(entry.staffName)}</strong><small>${escapeHtml(DEPARTMENTS.find((item) => item.id === entry.department)?.[language] || entry.department)} · ${escapeHtml(area)}</small></div><div class="skill-chips">${skills.map((skill) => `<span class="skill-chip">${escapeHtml(workAreaLabel(skill, language))}</span>`).join("") || `<span class="tag tag-low">${language === "zh" ? "未完成 SOP" : "Chưa đủ SOP"}</span>`}</div><div><strong>${escapeHtml(shift?.[language] || entry.shift)}</strong><small>${escapeHtml(entry.start)}–${escapeHtml(entry.end)}</small></div>${canManage ? `<div class="inventory-actions"><button class="inventory-action-button" data-action="schedule-edit" data-id="${escapeHtml(entry.id)}">${icon("edit")}</button><button class="inventory-action-button delete-action" data-action="schedule-delete" data-id="${escapeHtml(entry.id)}">${icon("trash")}</button></div>` : ""}</div>`;
    }).join("");
    const missing = selectedCapacity.missingAreas.map((area) => workAreaLabel(area, language)).join(" · ");
    const rule = selectedCapacity.fixedAreas
      ? (language === "zh" ? `${selectedCapacity.tables} 桌需要 4 人固定負責四區，不輪調。` : `${selectedCapacity.tables} bàn cần 4 người cố định tại Mì, Canh, Hải sản và Thịt, không xoay vòng.`)
      : (language === "zh" ? `${selectedCapacity.tables} 桌可由 3 人輪調支援。` : `${selectedCapacity.tables} bàn có thể do 3 người hỗ trợ xoay vòng.`);
    const action = canManage ? `<button class="primary-button" data-action="schedule-add">${icon("plus")}${language === "zh" ? "新增排班" : "Xếp thêm người"}</button>` : "";
    return `${heading(text.schedule, language === "zh" ? "依訂位桌數與已學 SOP 評估每班負荷。" : "Liên kết đặt bàn và SOP đã học để đánh giá tải từng ca.", action)}<div class="schedule-toolbar"><label><span>${escapeHtml(text.month)}</span><input type="month" value="${escapeHtml(month)}" data-field="schedule-month" /></label><label><span>${language === "zh" ? "班別" : "Ca làm"}</span><select data-field="schedule-shift">${STAFFING_SHIFTS.filter((item) => item.id !== "custom").map((shift) => `<option value="${shift.id}" ${view.scheduleShift === shift.id ? "selected" : ""}>${escapeHtml(shift[language])} · ${shift.start}–${shift.end}</option>`).join("")}</select></label></div><section class="card schedule-calendar-card"><div class="schedule-calendar">${calendar}</div></section><section class="schedule-detail-grid"><article class="card capacity-detail-card">${cardHeading(`${state.selectedDate} · ${language === "zh" ? "人力需求" : "Nhu cầu nhân sự"}`, `<span class="tag tag-${selectedCapacity.overloaded ? "empty" : "ok"}">${selectedCapacity.overloaded ? (language === "zh" ? "超載" : "Quá tải") : (language === "zh" ? "足夠" : "Đủ năng lực")}</span>`)}<div class="capacity-numbers"><div><span>${language === "zh" ? "晚餐訂位" : "Bàn đặt ca tối"}</span><strong>${selectedCapacity.tables}</strong></div><div><span>內場</span><strong>${selectedCapacity.inside.length}/${selectedCapacity.requiredInside}</strong></div><div><span>外場</span><strong>${selectedCapacity.outside.length}</strong></div></div><p class="helper-text">${escapeHtml(rule)}</p>${missing ? `<p class="capacity-warning">${language === "zh" ? "缺少 SOP 能力" : "Thiếu năng lực SOP"}: ${escapeHtml(missing)}</p>` : ""}</article><article class="card schedule-people-card">${cardHeading(language === "zh" ? "已排人員" : "Nhân viên đã xếp")}${assignments || `<p class="empty-state">${language === "zh" ? "本日尚未排班。" : "Chưa xếp nhân viên cho ngày và ca này."}</p>`}</article></section>`;
  }

  function remotePage(context) {
    const { state, text, language, capacity } = context;
    const canManage = permitted(state, "jobs:manage");
    const jobs = state.operations.jobCatalog.filter((item) => item.active);
    const departmentLabel = (id) => DEPARTMENTS.find((item) => item.id === id)?.[language] || id;
    const evidenceLabel = { check: language === "zh" ? "勾選" : "Xác nhận", photo: language === "zh" ? "照片" : "Ảnh", approval: language === "zh" ? "主管核准" : "Quản lý duyệt" };
    const rows = jobs.map((job) => `<div class="job-catalog-row"><div><strong>${escapeHtml(departmentLabel(job.department))} › ${escapeHtml(job.department === "inside" ? workAreaLabel(job.area, language) : job.area === "cashier" ? (language === "zh" ? "收銀" : "Thu ngân") : (language === "zh" ? "服務" : "Phục vụ"))}</strong><small>${escapeHtml(language === "zh" ? job.label : job.labelVi)}</small></div><span class="tag tag-neutral">${escapeHtml(evidenceLabel[job.evidence])}</span><span>${job.sopArea ? `SOP · ${escapeHtml(workAreaLabel(job.sopArea, language))}` : "—"}</span>${canManage ? `<div class="inventory-actions"><button class="inventory-action-button" data-action="job-edit" data-id="${escapeHtml(job.id)}">${icon("edit")}</button><button class="inventory-action-button delete-action" data-action="job-delete" data-id="${escapeHtml(job.id)}">${icon("trash")}</button></div>` : ""}</div>`).join("");
    const overdue = Object.values(state.records).flatMap((record) => record.customTasks.map((task) => ({ ...task, date: record.date, done: Boolean(record.completedTasks[task.id]) }))).filter((task) => task.dueAt && !task.done && new Date(task.dueAt) < new Date());
    const alerts = [capacity.overloaded ? `${state.selectedDate}: ${language === "zh" ? "晚班人力或 SOP 能力不足" : "Ca tối thiếu nhân lực hoặc năng lực SOP"}` : "", ...overdue.slice(0, 4).map((task) => `${task.date}: ${task.title}`)].filter(Boolean);
    const action = canManage ? `<button class="primary-button" data-action="job-add">${icon("plus")}${language === "zh" ? "新增工作範本" : "Tạo mẫu công việc"}</button>` : "";
    return `${heading(text.remote, language === "zh" ? "總部定義標準，門市負責排班、執行與提交證據。" : "Trụ sở quản lý tiêu chuẩn; cửa hàng xếp người, thực hiện và gửi bằng chứng.", action)}<div class="organization-flow"><div><strong>1</strong><span>${language === "zh" ? "門市" : "Chi nhánh"}</span></div><div><strong>2</strong><span>${language === "zh" ? "部門" : "Bộ phận"}</span></div><div><strong>3</strong><span>${language === "zh" ? "崗位" : "Vị trí/khu"}</span></div><div><strong>4</strong><span>${language === "zh" ? "工作範本＋SOP＋證據" : "Mẫu việc + SOP + bằng chứng"}</span></div></div><section class="remote-grid"><article class="card job-catalog-card">${cardHeading(language === "zh" ? "標準工作目錄" : "Danh mục công việc chuẩn", `<span class="tag tag-neutral">${jobs.length}</span>`)}${rows}</article><article class="card remote-alert-card">${cardHeading(language === "zh" ? "需要遠端處理的例外" : "Ngoại lệ cần xử lý từ xa", `<span class="tag tag-${alerts.length ? "empty" : "ok"}">${alerts.length}</span>`)}${alerts.map((alert) => `<div class="remote-alert-row"><span class="alert-bullet ${alerts.length ? "empty" : "ok"}"></span><strong>${escapeHtml(alert)}</strong></div>`).join("") || `<p class="empty-state">${language === "zh" ? "目前沒有例外。" : "Hiện không có ngoại lệ."}</p>`}</article></section><article class="card permission-matrix-card">${cardHeading(language === "zh" ? "遠端管理權限" : "Quyền quản lý từ xa")}<div class="report-table-wrap"><table class="report-table"><thead><tr><th>${language === "zh" ? "層級" : "Cấp"}</th><th>${language === "zh" ? "可執行" : "Được phép"}</th><th>${language === "zh" ? "限制" : "Giới hạn"}</th></tr></thead><tbody><tr><td>${language === "zh" ? "總部" : "Trụ sở"}</td><td>${language === "zh" ? "部門、崗位、SOP、範本" : "Bộ phận, vị trí, SOP và mẫu việc"}</td><td>—</td></tr><tr><td>${language === "zh" ? "門市主管" : "Quản lý cửa hàng"}</td><td>${language === "zh" ? "排班、派工、核准證據" : "Xếp ca, giao việc, duyệt bằng chứng"}</td><td>${language === "zh" ? "不可覆寫鎖定 SOP" : "Không sửa SOP đã khóa"}</td></tr><tr><td>${language === "zh" ? "員工" : "Nhân viên"}</td><td>${language === "zh" ? "查看班表、執行、上傳證據" : "Xem ca, làm việc, gửi bằng chứng"}</td><td>${language === "zh" ? "不可看其他門市" : "Không xem chi nhánh khác"}</td></tr></tbody></table></div></article>`;
  }

  function reportData(context) {
    const { state, record, text, language } = context;
    const from = view.reportFrom || state.selectedDate;
    const to = view.reportTo || state.selectedDate;
    const dates = dateRange(from, to);
    const inRange = (date) => dates.includes(date);
    if (view.reportType === "daily") {
      const columns = [text.serviceDate, language === "zh" ? "晚餐桌數" : "Bàn đặt tối", language === "zh" ? "內場需求 / 已排" : "Trong bếp cần / có", language === "zh" ? "缺少 SOP" : "SOP còn thiếu", language === "zh" ? "負荷" : "Đánh giá"];
      const rows = dates.filter((date) => state.records[date]).map((date) => {
        const capacity = assessShiftCapacity(state, date, "evening");
        return [date, capacity.tables, `${capacity.requiredInside}/${capacity.inside.length}`, capacity.missingAreas.map((area) => workAreaLabel(area, language)).join(" · ") || "—", capacity.needsReview ? (language === "zh" ? "待確認" : "Chờ xác nhận") : capacity.overloaded ? (language === "zh" ? "超載" : "Quá tải") : (language === "zh" ? "足夠" : "Đủ")];
      });
      return { title: language === "zh" ? "每日人力與負荷報表" : "Báo cáo nhân sự và tải theo ngày", columns, rows };
    }
    if (view.reportType === "sop") {
      const columns = [text.workstation, text.nameChinese, text.nameVietnamese, text.versions, text.dineContainer, text.takeawayContainer, text.training];
      const rows = state.operations.sops.filter((sop) => sop.revision > 0).map((sop) => [workAreaLabel(sop.area, language), sop.label, sop.labelVi, `v${sop.revision}`, sop.dineContainer, sop.takeawayContainer, `${state.operations.learning.filter((entry) => entry.sopId === sop.id && entry.revision === sop.revision).length}/${state.operations.staff.filter((member) => member.active).length}`]);
      return { title: text.sopReport, columns, rows };
    }
    if (view.reportType === "checks") {
      const columns = [text.serviceDate, text.workstation, text.staffName, text.checkNote, text.actualPhotos];
      const rows = state.operations.inspections.filter((entry) => inRange(entry.date) && (view.reportScope !== "person" || view.reportTarget === "all" || entry.staffId === view.reportTarget)).map((entry) => [entry.date, workAreaLabel(entry.area, language), entry.staffName, entry.note, entry.photo ? "✓" : "—"]);
      return { title: text.checksReport, columns, rows };
    }
    if (view.reportType === "attendance") {
      const columns = [text.staffName, text.workstation, text.clockIn, text.clockOut, text.workedHours, text.hourlyRate, text.lateMinutes, text.deductions, text.netPay];
      const rows = state.operations.attendance.filter((entry) => inRange(entry.date) && (view.reportScope !== "person" || view.reportTarget === "all" || entry.staffId === view.reportTarget)).map((entry) => {
        const wage = calculateAttendance(entry, state.operations.payroll);
        return [entry.staffName, workAreaLabel(entry.area, language), isoClock(entry.clockIn, language), isoClock(entry.clockOut, language), wage.hours, wage.hourlyRate, wage.lateMinutes, wage.deduction, wage.net];
      });
      return { title: text.attendanceReport, columns, rows };
    }
    const columns = [text.nameChinese, text.nameVietnamese, text.storageLocation, text.workstation, text.current, text.standard, text.restock];
    const rows = record.inventory.map((item) => [item.label, item.labelVi, zoneLabel(item.zone, language), workAreaLabel(item.workArea, language), item.quantity, item.minimum, Math.max(0, item.minimum - item.quantity)]);
    return { title: text.inventoryReport, columns, rows };
  }

  function reportsPage(context) {
    const { state, text, language } = context;
    const data = reportData(context);
    const allowed = permitted(state, "reports:export");
    const reportTypes = [
      { id: "daily", label: language === "zh" ? "每日負荷" : "Báo cáo theo ngày" },
      { id: "inventory", label: text.inventoryReport },
      { id: "sop", label: text.sopReport },
      { id: "attendance", label: text.attendanceReport },
      { id: "checks", label: text.checksReport },
    ];
    const targetOptions = view.reportScope === "person"
      ? state.operations.staff.filter((member) => member.active).map((member) => ({ id: member.id, label: member.name }))
      : view.reportScope === "department"
        ? DEPARTMENTS.map((department) => ({ id: department.id, label: `${department.zh} · ${department.vi}` }))
        : [{ id: "all", label: language === "zh" ? "全部門市" : "Toàn bộ cửa hàng" }];
    const categories = state.operations.jobCatalog.filter((job) => job.active && (view.reportTarget === "all" || view.reportScope !== "department" || job.department === view.reportTarget));
    const from = view.reportFrom || state.selectedDate;
    const to = view.reportTo || state.selectedDate;
    const actions = allowed ? `<div class="page-actions"><button class="secondary-button" data-action="report-pdf">${icon("print")}${escapeHtml(text.exportPdf)}</button><button class="primary-button" data-action="report-excel">${icon("download")}${escapeHtml(text.exportExcel)}</button></div>` : "";
    const body = data.rows.length
      ? data.rows.map((row) => `<tr>${row.map((value) => `<td>${escapeHtml(typeof value === "number" ? compactNumber(value, language) : value)}</td>`).join("")}</tr>`).join("")
      : `<tr><td colspan="${data.columns.length}">${escapeHtml(text.noItems)}</td></tr>`;
    return `${heading(text.reports, text.reportsSubtitle, actions)}<div class="zone-tabs report-tabs">${reportTypes.map((report) => `<button class="filter-tab ${report.id === view.reportType ? "selected" : ""}" data-action="report-type" data-report="${report.id}">${escapeHtml(report.label)}</button>`).join("")}</div><section class="card report-filter-card"><label><span>${language === "zh" ? "範圍" : "Phạm vi"}</span><select data-field="report-scope"><option value="all" ${view.reportScope === "all" ? "selected" : ""}>${language === "zh" ? "全部" : "Tổng hợp"}</option><option value="person" ${view.reportScope === "person" ? "selected" : ""}>${language === "zh" ? "個人" : "Từng người"}</option><option value="department" ${view.reportScope === "department" ? "selected" : ""}>${language === "zh" ? "部門" : "Từng bộ phận"}</option></select></label><label><span>${language === "zh" ? "對象" : "Đối tượng"}</span><select data-field="report-target">${targetOptions.map((option) => `<option value="${escapeHtml(option.id)}" ${view.reportTarget === option.id ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}</select></label><label><span>${language === "zh" ? "工作分類" : "Phân loại công việc"}</span><select data-field="report-category"><option value="all">${language === "zh" ? "全部分類" : "Tất cả phân loại"}</option>${categories.map((job) => `<option value="${escapeHtml(job.id)}" ${view.reportCategory === job.id ? "selected" : ""}>${escapeHtml(language === "zh" ? job.label : job.labelVi)}</option>`).join("")}</select></label><label><span>${language === "zh" ? "開始日期" : "Từ ngày"}</span><input type="date" value="${escapeHtml(from)}" data-field="report-from" /></label><label><span>${language === "zh" ? "結束日期" : "Đến ngày"}</span><input type="date" value="${escapeHtml(to)}" data-field="report-to" /></label></section><article class="card report-card">${cardHeading(data.title, `<span class="tag tag-neutral">${escapeHtml(from)} → ${escapeHtml(to)} · ${data.rows.length}</span>`)}<div class="report-table-wrap"><table class="report-table"><thead><tr>${data.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div></article>`;
  }

  function staffCard(context) {
    const { state, language, text } = context;
    const employee = currentStaff(state);
    const manage = permitted(state, "staff:manage");
    return `<article class="card settings-card staff-settings-card">${cardHeading(text.staff, manage ? `<button class="secondary-button" data-action="staff-add">${icon("plus")}${escapeHtml(text.addStaff)}</button>` : "")}<p class="helper-text">${escapeHtml(text.staffSubtitle)}</p><div class="staff-list">${state.operations.staff.filter((member) => member.active).map((member) => `<div class="staff-row"><span class="staff-avatar">${escapeHtml(member.name.slice(0, 1))}</span><span class="staff-copy"><strong>${escapeHtml(member.name)}${member.id === employee.id ? ` · ${escapeHtml(text.currentProfile)}` : ""}</strong><small>${escapeHtml(roleLabel(member.role, language))} · ${escapeHtml(workAreaLabel(member.area, language))} · NT$${member.hourlyRate}</small></span>${member.id !== employee.id ? `<button class="secondary-button" data-action="staff-switch" data-id="${escapeHtml(member.id)}">${escapeHtml(text.switchProfile)}</button>` : ""}${manage ? `<button class="inventory-action-button" data-action="staff-edit" data-id="${escapeHtml(member.id)}">${icon("edit")}</button>` : ""}</div>`).join("")}</div></article>`;
  }

  function managementModal(context) {
    const { state, text, language } = context;
    if (view.managementModal === "qr") {
      const area = WORK_AREAS.find((item) => item.id === view.sopArea) || WORK_AREAS[0];
      const origin = window.location.origin || "https://kitchen.example";
      const pathname = window.location.pathname || "/";
      const url = `${origin}${pathname}#sop?zone=${area.id}`;
      let markup = "";
      try { markup = qrSvg(url, `${area.zh} QR`); }
      catch { markup = `<p class="helper-text">${escapeHtml(url)}</p>`; }
      return `<div class="modal-backdrop" data-action="management-close"><section class="modal-card qr-modal" role="dialog" aria-modal="true"><div class="card-heading"><h2>${escapeHtml(text.stationQr)}</h2><button class="icon-button" data-action="management-close">${icon("close")}</button></div><div class="station-qr-content">${markup}<strong>${escapeHtml(area.zh)} · ${escapeHtml(area.vi)}</strong><small>${escapeHtml(url)}</small><button class="primary-button" data-action="qr-print">${icon("print")}${escapeHtml(text.printQr)}</button></div></section></div>`;
    }
    if (view.managementModal === "skill") {
      const copy = skillCopy(language);
      return `<div class="modal-backdrop" data-action="management-close"><section class="modal-card skill-modal" role="dialog" aria-modal="true"><div class="card-heading"><h2>${escapeHtml(copy.customTitle)}</h2><button class="icon-button" data-action="management-close">${icon("close")}</button></div><form data-form="save-custom-skill"><div class="bilingual-skill-fields">${draftField(copy.viName, "viTitle", "", { required: true })}${draftField(copy.viDetail, "viDetail", "", { textarea: true, rows: 3 })}${draftField(copy.zhName, "zhTitle", "", { required: true })}${draftField(copy.zhDetail, "zhDetail", "", { textarea: true, rows: 3 })}</div><label class="skill-critical-checkbox"><input type="checkbox" name="critical" value="yes"/><span><strong>${escapeHtml(copy.critical)}</strong><small>${escapeHtml(language === "zh" ? "新增後仍需在各區分別勾選是否採用。" : "Sau khi thêm, vẫn cần chọn riêng khu nào sẽ áp dụng.")}</small></span></label><button class="primary-button" type="submit">${icon("plus")}${escapeHtml(copy.save)}</button></form></section></div>`;
    }
    if (view.managementModal === "staff") {
      const member = state.operations.staff.find((item) => item.id === view.editingStaffId);
      return `<div class="modal-backdrop" data-action="management-close"><section class="modal-card" role="dialog" aria-modal="true"><div class="card-heading"><h2>${escapeHtml(member ? text.editStaff : text.addStaff)}</h2><button class="icon-button" data-action="management-close">${icon("close")}</button></div><form data-form="save-staff">${draftField(text.staffName, "name", member?.name || "", { required: true })}<label class="management-field"><span>${escapeHtml(text.role)}</span><select name="role">${STAFF_ROLES.map((role) => `<option value="${role.id}" ${(member?.role || "parttime") === role.id ? "selected" : ""}>${escapeHtml(role[language])}</option>`).join("")}</select></label><label class="management-field"><span>${escapeHtml(text.workstation)}</span><select name="area">${WORK_AREAS.map((area) => `<option value="${area.id}" ${(member?.area || view.sopArea) === area.id ? "selected" : ""}>${escapeHtml(area[language])}</option>`).join("")}</select></label>${draftField(text.hourlyRate, "hourlyRate", member?.hourlyRate ?? 230, { type: "number" })}${draftField(text.accessPin, "pin", member?.pin || "", { type: "password" })}<button class="primary-button" type="submit">${icon("check")}${escapeHtml(text.save)}</button></form></section></div>`;
    }
    if (view.managementModal === "switch") {
      const member = state.operations.staff.find((item) => item.id === view.switchStaffId);
      return `<div class="modal-backdrop" data-action="management-close"><section class="modal-card" role="dialog" aria-modal="true"><div class="card-heading"><h2>${escapeHtml(text.switchProfile)} · ${escapeHtml(member?.name || "")}</h2><button class="icon-button" data-action="management-close">${icon("close")}</button></div><form data-form="switch-staff">${member?.pin ? draftField(text.accessPin, "pin", "", { type: "password", required: true }) : ""}${view.switchError ? `<p class="error-copy">${escapeHtml(text.accessDenied)}</p>` : ""}<button class="primary-button" type="submit">${icon("check")}${escapeHtml(text.switchProfile)}</button></form></section></div>`;
    }
    if (view.managementModal === "clock") {
      const manager = permitted(state, "attendance:manage");
      const employee = currentStaff(state);
      const entry = state.operations.attendance.find((item) => item.id === view.editingAttendanceId);
      const options = state.operations.staff.filter((member) => member.active && (manager || member.id === employee.id));
      return `<div class="modal-backdrop" data-action="management-close"><section class="modal-card" role="dialog" aria-modal="true"><div class="card-heading"><h2>${escapeHtml(entry ? text.editStaff : text.clockIn)}</h2><button class="icon-button" data-action="management-close">${icon("close")}</button></div><form data-form="${entry ? "edit-attendance" : "clock-in"}"><label class="management-field"><span>${escapeHtml(text.staffName)}</span><select name="staffId" ${entry ? "disabled" : ""}>${options.map((member) => `<option value="${escapeHtml(member.id)}" ${(entry?.staffId || employee.id) === member.id ? "selected" : ""}>${escapeHtml(member.name)} · ${escapeHtml(roleLabel(member.role, language))}</option>`).join("")}</select></label>${draftField(text.scheduledStart, "scheduledStart", entry?.scheduledStart || "", { type: "time" })}${draftField(text.breakMinutes, "breakMinutes", entry?.breakMinutes ?? 0, { type: "number" })}${entry ? draftField(text.hourlyRate, "hourlyRate", entry.hourlyRate, { type: "number" }) : ""}${draftField(text.checkNote, "note", entry?.note || "")}<button class="primary-button" type="submit">${icon("check")}${escapeHtml(entry ? text.save : text.clockIn)}</button></form></section></div>`;
    }
    if (view.managementModal === "schedule") {
      const entry = state.operations.schedules.find((item) => item.id === view.editingScheduleId);
      const date = entry?.date || state.selectedDate;
      const shift = STAFFING_SHIFTS.find((item) => item.id === (entry?.shift || view.scheduleShift)) || STAFFING_SHIFTS[1];
      const insideAreas = WORK_AREAS.map((area) => `<option value="inside:${area.id}" ${(entry?.department || "inside") === "inside" && (entry?.area || "noodles") === area.id ? "selected" : ""}>內場 · ${escapeHtml(area[language])}</option>`).join("");
      const outsideAreas = [`<option value="outside:service" ${entry?.department === "outside" && entry?.area === "service" ? "selected" : ""}>外場 · ${language === "zh" ? "服務" : "Phục vụ"}</option>`, `<option value="outside:cashier" ${entry?.department === "outside" && entry?.area === "cashier" ? "selected" : ""}>外場 · ${language === "zh" ? "收銀" : "Thu ngân"}</option>`].join("");
      return `<div class="modal-backdrop" data-action="management-close"><section class="modal-card schedule-modal" role="dialog" aria-modal="true"><div class="card-heading"><h2>${entry ? (language === "zh" ? "編輯排班" : "Chỉnh sửa ca") : (language === "zh" ? "新增排班" : "Xếp thêm người")}</h2><button class="icon-button" data-action="management-close">${icon("close")}</button></div><form data-form="save-schedule"><label class="management-field"><span>${escapeHtml(text.staffName)}</span><select name="staffId">${state.operations.staff.filter((member) => member.active).map((member) => `<option value="${escapeHtml(member.id)}" ${(entry?.staffId || state.operations.activeStaffId) === member.id ? "selected" : ""}>${escapeHtml(member.name)} · ${escapeHtml(roleLabel(member.role, language))}</option>`).join("")}</select></label><label class="management-field"><span>${language === "zh" ? "工作位置" : "Bộ phận / khu cố định"}</span><select name="placement">${insideAreas}${outsideAreas}</select></label><label class="management-field"><span>${language === "zh" ? "套用方式" : "Áp dụng lịch"}</span><select name="applyMode"><option value="day" ${entry?.applyMode !== "month" ? "selected" : ""}>${language === "zh" ? "僅此日期" : "Chỉ ngày đã chọn"}</option><option value="month" ${entry?.applyMode === "month" ? "selected" : ""}>${language === "zh" ? "本月固定每週此日" : "Cố định ngày này hằng tuần trong tháng"}</option></select></label>${draftField(language === "zh" ? "日期" : "Ngày áp dụng", "date", date, { type: "date", required: true })}<label class="management-field"><span>${language === "zh" ? "班別" : "Ca làm"}</span><select name="shift">${STAFFING_SHIFTS.map((item) => `<option value="${item.id}" ${(entry?.shift || shift.id) === item.id ? "selected" : ""}>${escapeHtml(item[language])}${item.start ? ` · ${item.start}–${item.end}` : ""}</option>`).join("")}</select></label><div class="management-form-grid">${draftField(language === "zh" ? "開始" : "Bắt đầu", "start", entry?.start || shift.start, { type: "time" })}${draftField(language === "zh" ? "結束" : "Kết thúc", "end", entry?.end || shift.end, { type: "time" })}</div>${draftField(text.checkNote, "note", entry?.note || "")}<p class="helper-text">${language === "zh" ? "儲存前會依已學 SOP 檢查人員能力。" : "Hệ thống sẽ đánh giá lại năng lực SOP sau khi lưu."}</p><button class="primary-button" type="submit">${icon("check")}${escapeHtml(text.save)}</button></form></section></div>`;
    }
    if (view.managementModal === "job") {
      const job = state.operations.jobCatalog.find((item) => item.id === view.editingJobId);
      return `<div class="modal-backdrop" data-action="management-close"><section class="modal-card" role="dialog" aria-modal="true"><div class="card-heading"><h2>${job ? (language === "zh" ? "編輯工作範本" : "Sửa mẫu công việc") : (language === "zh" ? "新增工作範本" : "Tạo mẫu công việc")}</h2><button class="icon-button" data-action="management-close">${icon("close")}</button></div><form data-form="save-job"><label class="management-field"><span>${language === "zh" ? "部門" : "Bộ phận"}</span><select name="department"><option value="inside" ${job?.department !== "outside" ? "selected" : ""}>內場 · ${language === "zh" ? "內場" : "Trong bếp"}</option><option value="outside" ${job?.department === "outside" ? "selected" : ""}>外場 · ${language === "zh" ? "外場" : "Ngoài sảnh"}</option></select></label><label class="management-field"><span>${language === "zh" ? "位置 / 分類" : "Vị trí / phân loại"}</span><select name="area">${WORK_AREAS.map((area) => `<option value="${area.id}" ${job?.area === area.id ? "selected" : ""}>${escapeHtml(area[language])}</option>`).join("")}<option value="service" ${job?.area === "service" ? "selected" : ""}>${language === "zh" ? "服務" : "Phục vụ"}</option><option value="cashier" ${job?.area === "cashier" ? "selected" : ""}>${language === "zh" ? "收銀" : "Thu ngân"}</option></select></label>${draftField(text.nameChinese, "label", job?.label || "", { required: true })}${draftField(text.nameVietnamese, "labelVi", job?.labelVi || "", { required: true })}<label class="management-field"><span>${language === "zh" ? "連結 SOP 區域" : "Liên kết khu SOP"}</span><select name="sopArea"><option value="">—</option>${WORK_AREAS.map((area) => `<option value="${area.id}" ${job?.sopArea === area.id ? "selected" : ""}>${escapeHtml(area[language])}</option>`).join("")}</select></label><label class="management-field"><span>${language === "zh" ? "完成證據" : "Bằng chứng hoàn thành"}</span><select name="evidence"><option value="check" ${job?.evidence === "check" ? "selected" : ""}>${language === "zh" ? "勾選" : "Xác nhận"}</option><option value="photo" ${job?.evidence === "photo" ? "selected" : ""}>${language === "zh" ? "照片" : "Ảnh"}</option><option value="approval" ${job?.evidence === "approval" ? "selected" : ""}>${language === "zh" ? "主管核准" : "Quản lý duyệt"}</option></select></label><button class="primary-button" type="submit">${icon("check")}${escapeHtml(text.save)}</button></form></section></div>`;
    }
    return "";
  }

  function downloadExcel(context) {
    if (!permitted(context.state, "reports:export")) return;
    const data = reportData(context);
    const content = excelWorkbook(data.title, data.columns, data.rows);
    const blob = new Blob(["\ufeff", content], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `kitchen-${view.reportType}-${context.state.selectedDate}.xls`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function handleClick(target, event, context) {
    const { state, text } = context;
    const action = target.dataset.action;
    if (action === "menu-filter") { view.menuFilter = target.dataset.filter; render(); return true; }
    if (action === "skills-area") { view.skillsArea = target.dataset.area; render(); return true; }
    if (action === "skills-panel") { view.skillsPanel = target.dataset.panel; render(); return true; }
    if (action === "skill-add" && permitted(state, "skills:manage")) { view.managementModal = "skill"; render(); return true; }
    if (action === "skill-toggle" && permitted(state, "skills:manage")) {
      const skill = flatSkillCatalog(state.operations.customSkills).find((item) => item.id === target.dataset.id);
      const current = state.operations.skillProfiles?.[target.dataset.area]?.[target.dataset.id];
      store.setSkillAssignment(target.dataset.area, target.dataset.id, current ? "inactive" : (skill?.critical ? "core" : "scored"));
      return true;
    }
    if (action === "skill-delete" && permitted(state, "skills:manage") && window.confirm(skillCopy(state.settings.language).delete)) { store.removeCustomSkill(target.dataset.id); return true; }
    if (action === "skill-approve" && permitted(state, "skills:approve")) { store.approveSkillLevel(target.dataset.staffId, target.dataset.area); return true; }
    if (action === "sop-area") { view.sopArea = target.dataset.area; view.sopSelected = null; view.sopDraft = null; render(); return true; }
    if (action === "sop-panel") { view.sopPanel = target.dataset.panel; view.sopDraft = null; render(); return true; }
    if (action === "sop-select") { view.sopSelected = target.dataset.id; render(); return true; }
    if (action === "sop-service") { view.sopService = target.dataset.service; render(); return true; }
    if (action === "sop-add" && permitted(state, "sop:edit")) { view.sopDraft = makeDraft(view.sopArea); view.sopCreating = true; view.sopPanel = "standards"; render(); return true; }
    if (action === "sop-edit" && permitted(state, "sop:edit")) {
      const sop = state.operations.sops.find((item) => item.id === target.dataset.id);
      if (sop) { view.sopDraft = clone(sop.pending || sop); view.sopCreating = false; render(); }
      return true;
    }
    if (action === "sop-cancel") { view.sopDraft = null; view.sopCreating = false; render(); return true; }
    if (action === "sop-add-utensil") { captureDraft(); view.sopDraft?.utensils.push({ name: "", cc: 0, count: 1 }); render(); return true; }
    if (action === "sop-remove-utensil") { captureDraft(); view.sopDraft?.utensils.splice(Number(target.dataset.index), 1); render(); return true; }
    if (action === "sop-remove-photo") { captureDraft(); view.sopDraft?.photos.splice(Number(target.dataset.index), 1); render(); return true; }
    if (action === "sop-delete" && permitted(state, "sop:delete") && window.confirm(text.sopDeleteConfirm)) { store.removeSop(target.dataset.id); view.sopSelected = null; return true; }
    if (action === "sop-approve") { store.approveSop(target.dataset.id); return true; }
    if (action === "sop-restore") { store.restoreSop(target.dataset.id, target.dataset.version); return true; }
    if (action === "sop-learned") { store.markSopLearned(target.dataset.id); return true; }
    if (action === "sop-qr") { view.managementModal = "qr"; render(); return true; }
    if (action === "qr-print" || action === "report-pdf") { window.print?.(); return true; }
    if (action === "report-excel") { downloadExcel(context); return true; }
    if (action === "report-type") { view.reportType = target.dataset.report; render(); return true; }
    if (action === "schedule-date") { store.selectDate(target.dataset.date); return true; }
    if (action === "schedule-add" && permitted(state, "schedule:manage")) { view.editingScheduleId = null; view.managementModal = "schedule"; render(); return true; }
    if (action === "schedule-edit" && permitted(state, "schedule:manage")) { view.editingScheduleId = target.dataset.id; view.managementModal = "schedule"; render(); return true; }
    if (action === "schedule-delete" && permitted(state, "schedule:manage") && window.confirm(state.settings.language === "zh" ? "刪除此排班？" : "Xóa lịch làm việc này?")) { store.removeSchedule(target.dataset.id); return true; }
    if (action === "job-add" && permitted(state, "jobs:manage")) { view.editingJobId = null; view.managementModal = "job"; render(); return true; }
    if (action === "job-edit" && permitted(state, "jobs:manage")) { view.editingJobId = target.dataset.id; view.managementModal = "job"; render(); return true; }
    if (action === "job-delete" && permitted(state, "jobs:manage") && window.confirm(state.settings.language === "zh" ? "停用此工作範本？" : "Ngừng sử dụng mẫu công việc này?")) { store.removeJob(target.dataset.id); return true; }
    if (action === "staff-add" && permitted(state, "staff:manage")) { view.editingStaffId = null; view.managementModal = "staff"; render(); return true; }
    if (action === "staff-edit" && permitted(state, "staff:manage")) { view.editingStaffId = target.dataset.id; view.managementModal = "staff"; render(); return true; }
    if (action === "staff-switch") {
      const member = state.operations.staff.find((item) => item.id === target.dataset.id);
      if (member?.pin) { view.switchStaffId = member.id; view.switchError = false; view.managementModal = "switch"; render(); }
      else store.switchStaff(target.dataset.id);
      return true;
    }
    if (action === "clock-in-open") { view.editingAttendanceId = null; view.managementModal = "clock"; render(); return true; }
    if (action === "clock-out") { store.clockOut(target.dataset.id); return true; }
    if (action === "attendance-edit" && permitted(state, "attendance:manage")) { view.editingAttendanceId = target.dataset.id; view.managementModal = "clock"; render(); return true; }
    if (action === "management-close" && (target === event.target || target.closest(".icon-button"))) { view.managementModal = null; view.editingStaffId = null; view.editingAttendanceId = null; view.editingScheduleId = null; view.editingJobId = null; view.switchError = false; render(); return true; }
    return false;
  }

  async function readPhoto(file) {
    if (!file || !file.type.startsWith("image/")) return null;
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const source = String(reader.result || "");
        if (typeof Image === "undefined" || !document.createElement) { resolve({ id: globalThis.crypto?.randomUUID?.() ?? `photo-${Date.now()}`, name: file.name, src: source }); return; }
        const image = new Image();
        image.onload = () => {
          const canvas = document.createElement("canvas");
          const ratio = Math.min(1, 1280 / Math.max(image.width, image.height));
          canvas.width = Math.max(1, Math.round(image.width * ratio));
          canvas.height = Math.max(1, Math.round(image.height * ratio));
          canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
          const src = canvas.toDataURL?.("image/jpeg", 0.76) || source;
          resolve({ id: globalThis.crypto?.randomUUID?.() ?? `photo-${Date.now()}`, name: file.name, src });
        };
        image.onerror = () => resolve(null);
        image.src = source;
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  async function handleChange(element) {
    const field = element.dataset.field;
    if (field === "skill-status") { store.setSkillAssignment(element.dataset.area, element.dataset.id, element.value); return true; }
    if (field === "menu-staff") { view.menuStaff = element.value; render(); return true; }
    if (field === "training-status") { store.updateTrainingStatus(element.dataset.id, element.value); return true; }
    if (field === "skills-staff") { view.skillsStaffId = element.value; render(); return true; }
    if (field === "schedule-month") { view.scheduleMonth = element.value; render(); return true; }
    if (field === "schedule-shift") { view.scheduleShift = element.value; render(); return true; }
    if (field === "report-scope") { view.reportScope = element.value; view.reportTarget = "all"; render(); return true; }
    if (field === "report-target") { view.reportTarget = element.value; render(); return true; }
    if (field === "report-category") { view.reportCategory = element.value; render(); return true; }
    if (field === "report-from") { view.reportFrom = element.value; render(); return true; }
    if (field === "report-to") { view.reportTo = element.value; render(); return true; }
    if (field === "payroll") { store.updatePayroll(element.dataset.key, element.type === "checkbox" ? element.checked : element.value); return true; }
    if (field === "sop-photos" && view.sopDraft) {
      captureDraft();
      const photos = await Promise.all(Array.from(element.files || []).map(readPhoto));
      view.sopDraft.photos.push(...photos.filter(Boolean));
      render();
      return true;
    }
    if (field === "inspection-photo") {
      view.checkPhoto = await readPhoto(element.files?.[0]);
      render();
      return true;
    }
    return false;
  }

  function handleSubmit(form, data) {
    const kind = form.dataset.form;
    if (kind === "save-skill-assessment") {
      const state = store.getState();
      const profile = state.operations.skillProfiles?.[view.skillsArea] || {};
      const ratings = Object.keys(profile).map((skillId) => ({ skillId, value: data.get(`rating:${skillId}`) }))
        .filter((entry) => entry.value !== null && String(entry.value) !== "")
        .map((entry) => ({ skillId: entry.skillId, level: Number(entry.value) }));
      if (ratings.length) store.saveSkillAssessment({ staffId: view.skillsStaffId, area: view.skillsArea, ratings, note: String(data.get("note") || "") });
      return true;
    }
    if (kind === "save-custom-skill") {
      const input = { viTitle: String(data.get("viTitle") || ""), viDetail: String(data.get("viDetail") || ""), zhTitle: String(data.get("zhTitle") || ""), zhDetail: String(data.get("zhDetail") || ""), critical: data.get("critical") === "yes" };
      view.managementModal = null;
      store.addCustomSkill(input);
      return true;
    }
    if (kind === "save-sop") {
      const utensils = view.sopDraft.utensils.map((_, index) => ({ name: String(data.get(`utensilName:${index}`) || ""), cc: Number(data.get(`utensilCc:${index}`) || 0), count: Number(data.get(`utensilCount:${index}`) || 1) }));
      const draft = { ...view.sopDraft, area: String(data.get("area") || view.sopDraft.area), label: String(data.get("label") || "").trim(), labelVi: String(data.get("labelVi") || "").trim(), cookSeconds: Number(data.get("cookSeconds") || 0), dineContainer: String(data.get("dineContainer") || ""), takeawayContainer: String(data.get("takeawayContainer") || ""), dineNote: String(data.get("dineNote") || ""), takeawayNote: String(data.get("takeawayNote") || ""), plating: String(data.get("plating") || ""), steps: String(data.get("steps") || "").split(/\r?\n/).map((step) => step.trim()).filter(Boolean), utensils };
      if (!draft.label && !draft.labelVi) return true;
      view.sopDraft = null;
      view.sopCreating = false;
      view.sopArea = draft.area;
      view.sopSelected = draft.id;
      store.saveSop(draft);
      return true;
    }
    if (kind === "save-staff") {
      const member = { id: view.editingStaffId || undefined, name: String(data.get("name") || ""), role: String(data.get("role") || "parttime"), area: String(data.get("area") || "noodles"), hourlyRate: Number(data.get("hourlyRate") || 0), pin: String(data.get("pin") || "") };
      view.managementModal = null;
      view.editingStaffId = null;
      store.saveStaff(member);
      return true;
    }
    if (kind === "switch-staff") {
      const success = store.switchStaff(view.switchStaffId, String(data.get("pin") || ""));
      if (success) { view.managementModal = null; view.switchError = false; render(); }
      else { view.switchError = true; render(); }
      return true;
    }
    if (kind === "clock-in") {
      const staffId = String(data.get("staffId") || currentStaff(store.getState()).id);
      const options = { scheduledStart: String(data.get("scheduledStart") || ""), breakMinutes: Number(data.get("breakMinutes") || 0), note: String(data.get("note") || "") };
      view.managementModal = null;
      store.clockIn(staffId, options);
      return true;
    }
    if (kind === "edit-attendance") {
      const id = view.editingAttendanceId;
      const input = { scheduledStart: String(data.get("scheduledStart") || ""), breakMinutes: Number(data.get("breakMinutes") || 0), hourlyRate: Number(data.get("hourlyRate") || 0), note: String(data.get("note") || "") };
      view.managementModal = null;
      view.editingAttendanceId = null;
      store.updateAttendance(id, input);
      return true;
    }
    if (kind === "save-schedule") {
      const [department, area] = String(data.get("placement") || "inside:noodles").split(":");
      const date = String(data.get("date") || store.getState().selectedDate);
      const entry = {
        id: view.editingScheduleId || undefined,
        staffId: String(data.get("staffId") || ""),
        department,
        area,
        applyMode: String(data.get("applyMode") || "day"),
        date,
        month: date.slice(0, 7),
        weekday: new Date(`${date}T12:00:00`).getDay(),
        shift: String(data.get("shift") || "evening"),
        start: String(data.get("start") || ""),
        end: String(data.get("end") || ""),
        note: String(data.get("note") || ""),
      };
      view.managementModal = null;
      view.editingScheduleId = null;
      store.saveSchedule(entry);
      return true;
    }
    if (kind === "save-job") {
      const job = {
        id: view.editingJobId || undefined,
        department: String(data.get("department") || "inside"),
        area: String(data.get("area") || "noodles"),
        label: String(data.get("label") || ""),
        labelVi: String(data.get("labelVi") || ""),
        sopArea: String(data.get("sopArea") || ""),
        evidence: String(data.get("evidence") || "check"),
      };
      view.managementModal = null;
      view.editingJobId = null;
      store.saveJob(job);
      return true;
    }
    if (kind === "save-inspection" && view.checkPhoto) {
      const check = { area: view.sopArea, sopId: view.sopSelected, note: String(data.get("note") || ""), photo: view.checkPhoto.src };
      view.checkPhoto = null;
      view.checkNote = "";
      store.addInspection(check);
      return true;
    }
    return false;
  }

  return { sopPage, menuPage, skillsPage, attendancePage, schedulePage, reportsPage, remotePage, staffCard, managementModal, handleClick, handleChange, handleSubmit, reportData };
}
