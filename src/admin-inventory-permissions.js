import { apiRequest } from "./vps-api.js";

function esc(value) {
  return String(value ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
function uniq(values) {
  return [...new Set((values || []).filter(Boolean))];
}
function list(value) {
  return Array.isArray(value) ? value : [];
}

export function createInventoryPermissionAdmin() {
  let host = null;
  let context = { users:[], sites:[] };
  let model = null;
  let selectedUserId = "";
  let revision = 0;
  let loading = false;
  let saving = false;
  let message = "";
  let error = "";
  let baseScope = { allSites:true, sites:[] };
  let baseEffects = {};
  let overrides = [];
  let builder = { actionKey:"", effect:"deny", site:"", locations:[], workAreas:[] };

  const actionMap = () => new Map(list(model?.actions).map((row) => [row.actionKey,row]));
  const siteMap = () => new Map(list(model?.sites).map((row) => [row.code,row]));
  const locationMap = () => new Map(list(model?.locations).map((row) => [String(row.id),row]));

  function userLabel(user) {
    return `${user.display_name || user.username} · @${user.username}`;
  }
  function siteLabel(code) {
    const site = siteMap().get(code);
    return site ? `${site.name_vi || code} · ${site.name_zh_tw || ""}` : code;
  }
  function actionLabel(key) {
    const row = actionMap().get(key);
    return row ? `${row.nameVi} · ${row.nameZhTw}` : key;
  }

  function resetFromPayload(payload) {
    revision = Number(payload?.revision || 1);
    const rules = list(payload?.rules);
    const base = rules.filter((rule) =>
      !(rule.locations || []).length &&
      !(rule.workAreas || []).length &&
      ["MIGRATION_032_COMPAT_SEED","SUPER_ADMIN_BASE"].includes(String(rule.note || ""))
    );

    const all = base.length > 0 && base.every((rule) => rule.allSites === true);
    baseScope = {
      allSites:all,
      sites:uniq(base.flatMap((rule) => rule.sites || [])),
    };
    baseEffects = {};
    for (const rule of base) baseEffects[rule.actionKey] = rule.effect;

    overrides = rules
      .filter((rule) => !base.includes(rule))
      .map((rule) => ({
        actionKey:rule.actionKey,
        effect:rule.effect,
        allSites:rule.allSites === true,
        sites:[...(rule.sites || [])],
        locations:[...(rule.locations || [])],
        workAreas:[...(rule.workAreas || [])],
        note:String(rule.note || "SUPER_ADMIN_OVERRIDE"),
      }));

    if (!base.length) baseScope = { allSites:false, sites:[] };
  }

  async function loadModel() {
    if (model) return model;
    model = await apiRequest("/api/admin/super/inventory-access-model");
    builder.actionKey = model?.actions?.[0]?.actionKey || "";
    builder.site = model?.sites?.[0]?.code || "";
    return model;
  }

  async function loadUser(userId) {
    if (!userId) return;
    loading = true;
    error = "";
    message = "";
    render();
    try {
      await loadModel();
      const payload = await apiRequest(`/api/admin/super/inventory-access/${encodeURIComponent(userId)}`);
      selectedUserId = userId;
      resetFromPayload(payload);
      builder = {
        actionKey:model?.actions?.[0]?.actionKey || "",
        effect:"deny",
        site:model?.sites?.[0]?.code || "",
        locations:[],
        workAreas:[],
      };
    } catch (cause) {
      error = cause?.payload?.error || cause?.code || cause?.message || "INVENTORY_ACCESS_LOAD_FAILED";
    } finally {
      loading = false;
      render();
    }
  }

  function effectSelect(key) {
    const value = baseEffects[key] || "off";
    return `<select data-inv-perm-effect="${esc(key)}">
      <option value="off" ${value === "off" ? "selected" : ""}>Không cấp</option>
      <option value="allow" ${value === "allow" ? "selected" : ""}>Cho phép</option>
      <option value="deny" ${value === "deny" ? "selected" : ""}>Từ chối</option>
    </select>`;
  }

  function scopeHtml() {
    const sites = list(model?.sites);
    return `<section class="iap-scope">
      <div class="iap-scope-head">
        <div>
          <strong>Phạm vi chi nhánh · 據點範圍</strong>
          <small>Toàn bộ hoặc bất kỳ tổ hợp A+B, A+C, A+D, B+C…; dữ liệu Site lấy trực tiếp PostgreSQL.</small>
        </div>
        <div class="iap-segment">
          <button type="button" data-inv-scope-mode="all" class="${baseScope.allSites ? "active" : ""}">Toàn bộ</button>
          <button type="button" data-inv-scope-mode="custom" class="${!baseScope.allSites ? "active" : ""}">Tùy chọn</button>
        </div>
      </div>
      <div class="iap-site-grid ${baseScope.allSites ? "is-disabled" : ""}">
        ${sites.map((site) => `<label class="iap-site-chip">
          <input type="checkbox" data-inv-site="${esc(site.code)}"
            ${baseScope.sites.includes(site.code) ? "checked" : ""}
            ${baseScope.allSites ? "disabled" : ""}>
          <span>${esc(site.name_vi || site.code)}<small>${esc(site.name_zh_tw || site.code)}</small></span>
        </label>`).join("")}
      </div>
    </section>`;
  }

  function matrixHtml() {
    const grouped = new Map();
    for (const action of list(model?.actions)) {
      const key = action.category || "general";
      if (!grouped.has(key)) grouped.set(key,[]);
      grouped.get(key).push(action);
    }
    return [...grouped.entries()].map(([category,rows]) => `
      <details class="iap-category" open>
        <summary>${esc(category.toUpperCase())}<span>${rows.length} actions</span></summary>
        <div class="iap-action-list">
          ${rows.map((row) => `<div class="iap-action-row">
            <div>
              <strong>${esc(row.nameVi)}</strong>
              <small>${esc(row.nameZhTw)} · ${esc(row.actionKey)}</small>
              <small>${esc(row.description || "")}</small>
            </div>
            <span class="sa-pill ${row.riskLevel === "critical" ? "off" : row.riskLevel === "high" ? "warn" : ""}">
              ${esc(row.riskLevel || "normal")}
            </span>
            ${effectSelect(row.actionKey)}
          </div>`).join("")}
        </div>
      </details>`).join("");
  }

  function overrideSummary(rule,index) {
    const parts = [];
    if (rule.allSites) parts.push("Toàn bộ site");
    else parts.push((rule.sites || []).map(siteLabel).join(", ") || "Chưa chọn site");

    if ((rule.locations || []).length) {
      const locations = locationMap();
      parts.push((rule.locations || []).map((id) => {
        const row = locations.get(String(id));
        return row ? `${row.name_vi || row.code} · ${row.name_zh_tw || ""}` : id;
      }).join(", "));
    }
    if ((rule.workAreas || []).length) {
      parts.push(rule.workAreas.map((area) => `${siteLabel(area.site)} / ${area.code}`).join(", "));
    }

    return `<div class="iap-override-row">
      <div><strong>${esc(actionLabel(rule.actionKey))}</strong><small>${esc(parts.join(" · "))}</small></div>
      <span class="sa-pill ${rule.effect === "deny" ? "off" : "ok"}">${esc(rule.effect.toUpperCase())}</span>
      <button class="sa-btn small danger" type="button" data-inv-override-remove="${index}">Xóa</button>
    </div>`;
  }

  function builderHtml() {
    const sites = list(model?.sites);
    const site = builder.site || sites[0]?.code || "";
    const locations = list(model?.locations).filter((row) => row.site === site);
    const areas = list(model?.workAreas).filter((row) => row.site_code === site);

    return `<details class="iap-advanced">
      <summary>Override chi tiết theo vị trí / Work Area · 進階覆寫</summary>
      <div class="iap-builder-grid">
        <label><span>Action</span><select data-inv-builder-action>
          ${list(model?.actions).map((row) => `<option value="${esc(row.actionKey)}" ${builder.actionKey === row.actionKey ? "selected" : ""}>${esc(row.nameVi)} · ${esc(row.nameZhTw)}</option>`).join("")}
        </select></label>
        <label><span>Effect</span><select data-inv-builder-effect>
          <option value="allow" ${builder.effect === "allow" ? "selected" : ""}>Cho phép</option>
          <option value="deny" ${builder.effect === "deny" ? "selected" : ""}>Từ chối</option>
        </select></label>
        <label><span>Chi nhánh</span><select data-inv-builder-site>
          ${sites.map((row) => `<option value="${esc(row.code)}" ${site === row.code ? "selected" : ""}>${esc(row.name_vi || row.code)} · ${esc(row.name_zh_tw || "")}</option>`).join("")}
        </select></label>
      </div>
      <div class="iap-builder-scopes">
        <fieldset><legend>Vị trí kho</legend>
          ${locations.map((row) => `<label><input type="checkbox" data-inv-builder-location="${esc(row.id)}" ${builder.locations.includes(String(row.id)) ? "checked" : ""}><span>${esc(row.name_vi || row.code)} · ${esc(row.name_zh_tw || "")}</span></label>`).join("") || "<small>Không có vị trí.</small>"}
        </fieldset>
        <fieldset><legend>Work Area</legend>
          ${areas.map((row) => `<label><input type="checkbox" data-inv-builder-area="${esc(row.code)}" ${builder.workAreas.some((entry) => entry.site === site && entry.code === row.code) ? "checked" : ""}><span>${esc(row.name_vi || row.code)} · ${esc(row.name_zh_tw || "")}</span></label>`).join("") || "<small>Không có Work Area.</small>"}
        </fieldset>
      </div>
      <p class="sa-dev-note">Không chọn Location/Work Area = rule áp dụng toàn site đã chọn. Rule cụ thể có thể DENY một vị trí nhạy cảm dù base scope đang ALLOW toàn chi nhánh.</p>
      <button class="sa-btn" type="button" data-inv-override-add>＋ Thêm override</button>
    </details>`;
  }

  function render() {
    if (!host) return;
    const users = list(context.users);
    const selected = users.find((row) => row.id === selectedUserId) || users[0] || null;
    if (!selectedUserId && selected) selectedUserId = selected.id;

    if (loading) {
      host.innerHTML = `<article class="sa-card"><div class="sa-empty">Đang tải quyền Kho từ PostgreSQL…</div></article>`;
      return;
    }
    if (!model) {
      host.innerHTML = `<article class="sa-card"><div class="sa-card-head"><div><h2>Phân quyền Kho chi tiết · 庫存細項權限</h2><p>Chưa tải model.</p></div></div>${error ? `<div class="sa-alert error">${esc(error)}</div>` : ""}</article>`;
      return;
    }

    const allowCount = Object.values(baseEffects).filter((value) => value === "allow").length;
    const denyCount = Object.values(baseEffects).filter((value) => value === "deny").length;

    host.innerHTML = `<article class="sa-card iap-shell">
      <div class="sa-card-head">
        <div><h2>Phân quyền Kho chi tiết · 庫存細項權限</h2><p>Quyền hiệu lực lưu theo tài khoản + action + site/vị trí; không suy ra từ chức vụ.</p></div>
        <span class="sa-pill ok">DB AUTHORITY</span>
      </div>
      ${error ? `<div class="sa-alert error">${esc(error)}</div>` : ""}
      ${message ? `<div class="sa-alert success">${esc(message)}</div>` : ""}
      <div class="iap-toolbar">
        <label><span>Tài khoản</span><select data-inv-perm-user>
          ${users.map((user) => `<option value="${esc(user.id)}" ${user.id === selectedUserId ? "selected" : ""}>${esc(userLabel(user))}</option>`).join("")}
        </select></label>
        <div class="iap-summary">
          <span class="sa-pill ok">${allowCount} allow</span>
          <span class="sa-pill off">${denyCount} deny</span>
          <span class="sa-pill">${overrides.length} override</span>
          <small>revision ${revision || "—"}</small>
        </div>
      </div>
      ${scopeHtml()}
      <div class="iap-matrix-head"><div><strong>Quyền thao tác</strong><small>Base rule dùng phạm vi site ở trên; override chi tiết nằm phía dưới.</small></div></div>
      ${matrixHtml()}
      ${builderHtml()}
      <div class="iap-overrides"><h3>Override đang cấu hình</h3>${overrides.length ? overrides.map(overrideSummary).join("") : `<div class="sa-empty">Chưa có override theo vị trí / Work Area.</div>`}</div>
      <div class="iap-savebar">
        <span>F5/reload đọc lại đúng rule PostgreSQL. Backend API kiểm tra cùng policy này.</span>
        <button class="sa-btn primary" type="button" data-inv-perm-save ${saving ? "disabled" : ""}>${saving ? "Đang lưu…" : "Lưu quyền Kho · 儲存庫存權限"}</button>
      </div>
    </article>`;
    bind();
  }

  function syncBuilderFromDom() {
    builder.actionKey = host.querySelector("[data-inv-builder-action]")?.value || builder.actionKey;
    builder.effect = host.querySelector("[data-inv-builder-effect]")?.value || builder.effect;
    builder.site = host.querySelector("[data-inv-builder-site]")?.value || builder.site;
    builder.locations = [...host.querySelectorAll("[data-inv-builder-location]:checked")]
      .map((node) => node.dataset.invBuilderLocation);
    builder.workAreas = [...host.querySelectorAll("[data-inv-builder-area]:checked")]
      .map((node) => ({ site:builder.site, code:node.dataset.invBuilderArea }));
  }

  function bind() {
    host.querySelector("[data-inv-perm-user]")?.addEventListener("change",(event) => void loadUser(event.target.value));

    host.querySelectorAll("[data-inv-scope-mode]").forEach((button) => button.addEventListener("click",() => {
      baseScope.allSites = button.dataset.invScopeMode === "all";
      render();
    }));

    host.querySelectorAll("[data-inv-site]").forEach((input) => input.addEventListener("change",() => {
      baseScope.sites = [...host.querySelectorAll("[data-inv-site]:checked")].map((node) => node.dataset.invSite);
    }));

    host.querySelectorAll("[data-inv-perm-effect]").forEach((select) => select.addEventListener("change",() => {
      const key = select.dataset.invPermEffect;
      if (select.value === "off") delete baseEffects[key];
      else baseEffects[key] = select.value;
    }));

    host.querySelector("[data-inv-builder-site]")?.addEventListener("change",(event) => {
      builder.site = event.target.value;
      builder.locations = [];
      builder.workAreas = [];
      render();
      host.querySelector(".iap-advanced")?.setAttribute("open","");
    });

    host.querySelector("[data-inv-builder-action]")?.addEventListener("change",(event) => { builder.actionKey = event.target.value; });
    host.querySelector("[data-inv-builder-effect]")?.addEventListener("change",(event) => { builder.effect = event.target.value; });

    host.querySelector("[data-inv-override-add]")?.addEventListener("click",() => {
      syncBuilderFromDom();
      if (!builder.actionKey || !builder.site) return;
      overrides.push({
        actionKey:builder.actionKey,
        effect:builder.effect,
        allSites:false,
        sites:[builder.site],
        locations:[...builder.locations],
        workAreas:[...builder.workAreas],
        note:"SUPER_ADMIN_OVERRIDE",
      });
      builder.locations = [];
      builder.workAreas = [];
      render();
    });

    host.querySelectorAll("[data-inv-override-remove]").forEach((button) => button.addEventListener("click",() => {
      overrides.splice(Number(button.dataset.invOverrideRemove),1);
      render();
    }));

    host.querySelector("[data-inv-perm-save]")?.addEventListener("click",() => void save());
  }

  async function save() {
    if (!selectedUserId || saving) return;
    error = "";
    message = "";

    const scopeSites = baseScope.allSites ? [] : [...baseScope.sites];
    if (!baseScope.allSites && !scopeSites.length) {
      error = "Hãy chọn ít nhất một chi nhánh hoặc chọn Toàn bộ.";
      render();
      return;
    }

    const rules = [];
    for (const [actionKey,effect] of Object.entries(baseEffects)) {
      if (!["allow","deny"].includes(effect)) continue;
      rules.push({
        actionKey,
        effect,
        allSites:baseScope.allSites,
        sites:scopeSites,
        locations:[],
        workAreas:[],
        note:"SUPER_ADMIN_BASE",
      });
    }
    rules.push(...overrides);

    saving = true;
    render();
    try {
      const result = await apiRequest(`/api/admin/super/inventory-access/${encodeURIComponent(selectedUserId)}`,{
        method:"PUT",
        body:{ revision,rules },
      });
      resetFromPayload(result);
      message = "Đã lưu quyền Kho vào PostgreSQL.";
    } catch (cause) {
      error = cause?.payload?.error || cause?.code || cause?.message || "INVENTORY_ACCESS_SAVE_FAILED";
      if (cause?.payload?.currentRevision) error += ` · revision mới: ${cause.payload.currentRevision}`;
    } finally {
      saving = false;
      render();
    }
  }

  async function mount(nextHost,nextContext={}) {
    host = nextHost;
    context = { ...context,...nextContext };
    const users = list(context.users);
    if (!selectedUserId && users[0]) selectedUserId = users[0].id;
    loading = true;
    render();
    try {
      await loadModel();
      if (selectedUserId) {
        const payload = await apiRequest(`/api/admin/super/inventory-access/${encodeURIComponent(selectedUserId)}`);
        resetFromPayload(payload);
      }
    } catch (cause) {
      error = cause?.payload?.error || cause?.code || cause?.message || "INVENTORY_ACCESS_LOAD_FAILED";
    } finally {
      loading = false;
      render();
    }
  }

  function updateContext(nextContext={}) {
    context = { ...context,...nextContext };
    if (host?.isConnected) render();
  }

  return { mount,updateContext };
}
