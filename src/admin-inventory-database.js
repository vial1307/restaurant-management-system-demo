import { apiRequest } from "./vps-api.js";
import { inventoryAdminText as t } from "./admin-inventory-i18n.js";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const label = (row) => row ? `${row.name_vi} · ${row.name_zh_tw}` : "—";
const option = (value, text, selected) => `<option value="${esc(value)}" ${String(value) === String(selected) ? "selected" : ""}>${esc(text)}</option>`;
const input = (name, title, value = "", attrs = "") => `<label><span>${esc(t(title))}</span><input name="${name}" value="${esc(value)}" ${attrs}></label>`;
const select = (name, title, options) => `<label><span>${esc(t(title))}</span><select name="${name}">${options}</select></label>`;
const button = (action, title, extra = "") => `<button type="button" class="sa-btn" data-idb-action="${action}" ${extra}>${esc(t(title))}</button>`;
const errorCode = (error) => error?.payload?.error || error?.message || "UNKNOWN_ERROR";
const PAGE_SIZE = 25;

export function createInventoryDatabase({ request = apiRequest } = {}) {
  let host, sites = [], me, source, poll, timer, generation = 0;
  let site = "", tab = "items", locationKind = "storage", q = "", page = 1;
  let snapshot = null, master = null, history = [], editor = null, pending = false, loading = false, dirty = false;
  let message = "", failed = false, remote = false, connected = false, refreshQueued = false;
  const canEdit = () => Boolean(me?.permissions?.inventory?.edit);
  const canMaster = (kind) => Boolean(master?.permissions?.[kind === "areas" ? "manageWorkAreas" : "manageLocations"]);
  const activeItems = () => (snapshot?.items || []).filter((row) => row.active);
  const activeLocations = () => (master?.locations || []).filter((row) => row.active);
  const itemById = (id) => snapshot?.items.find((row) => row.id === id);
  const locationById = (id) => master?.locations.find((row) => row.id === id);
  const stockFor = (id) => (snapshot?.stock || []).filter((row) => row.item_id === id);
  const titleCell = (row) => `<strong>${esc(row?.name_vi || "—")}</strong><small>${esc(row?.name_zh_tw || "")}</small>`;
  const hasWork = (id) => stockFor(id).some((s) => locationById(s.location_id)?.kind === "work");
  const itemPayload = (row) => ({ key:row.item_key, catalog_key:row.catalog_key, vi:row.name_vi, zh:row.name_zh_tw, unit:row.unit, work_area:row.work_area, storage_only:row.storage_only });
  const revision = (row) => String(row?.revision || "0");
  const rowsTable = (headers, rows) => `<div class="sa-table-wrap"><table class="sa-table idb-table"><thead><tr>${headers.map((h) => `<th>${esc(t(h))}</th>`).join("")}</tr></thead><tbody>${rows.join("") || `<tr><td colspan="${headers.length}">${esc(t("empty"))}</td></tr>`}</tbody></table></div>`;
  function paginate(rows, renderRow) {
    const filtered = rows.filter((row) => JSON.stringify(row).toLocaleLowerCase().includes(q.toLocaleLowerCase()));
    const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    page = Math.min(page, pages);
    return { rows:filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE).map(renderRow), footer:`<div class="sa-pagination"><span>${filtered.length} · ${page}/${pages}</span><div>${button("previous","previous",page<=1?"disabled":"")}${button("next","next",page>=pages?"disabled":"")}</div></div>` };
  }
  function itemsView() {
    const list = paginate(snapshot.items, (row) => `<tr><td>${titleCell(row)}<small>${esc(row.catalog_key)}</small></td><td>${esc(row.unit)}</td><td>${esc(label(master.workAreas.find((a) => a.code === row.work_area)))}</td><td>${esc(t(row.active?"active":"inactive"))}</td><td><div class="sa-row-actions">${canEdit()?button("item","edit",`data-id="${esc(row.id)}"`):""}${canEdit()&&row.active?button("receive","receive",`data-id="${esc(row.id)}"`):""}${canEdit()&&row.active?button("item-stock","stock",`data-id="${esc(row.id)}"`):""}${me.role==="admin"&&row.active?button("archive-item","archive",`data-id="${esc(row.id)}"`):""}</div></td></tr>`);
    return `<p>${esc(t("identityHint"))}</p>${canEdit()?button("item","add"):""}${rowsTable(["items","unit","area","status","action"],list.rows)}${list.footer}`;
  }
  function locationsView() {
    const areas = locationKind === "areas";
    const rows = areas ? master.workAreas : master.locations.filter((row) => row.kind === locationKind);
    const list = paginate(rows, (row) => `<tr><td>${titleCell(row)}<small>${esc(row.code)}</small></td><td>${esc(areas ? row.department_code || "—" : row.kind === "storage" ? t(row.metadata?.storage_group === "service" ? "service" : "primary") : label(master.workAreas.find((a) => a.code === row.metadata?.work_area)))}</td><td>${esc(t(row.active?"active":"inactive"))}</td><td>${canMaster(locationKind)?button("master","edit",`data-id="${esc(areas?row.code:row.id)}"`):""}</td></tr>`);
    return `<nav class="idb-tabs">${["areas","storage","work"].map((key) => button(`kind-${key}`,key==="areas"?"area":key,`aria-pressed="${locationKind===key}"`)).join("")}</nav><p>${esc(t("masterHint"))}</p>${canMaster(locationKind)?button("master","add"):""}${rowsTable(["location",areas?"department":"group","status","action"],list.rows)}${list.footer}`;
  }
  function stockView() {
    const rows = (snapshot.stock || []).map((row) => ({...row, item:itemById(row.item_id), location:locationById(row.location_id)}));
    const list = paginate(rows, (row) => `<tr><td>${titleCell(row.item)}</td><td>${titleCell(row.location)}</td><td>${esc(row.quantity)} ${esc(row.item?.unit)}</td><td>${esc(row.minimum_quantity)}</td><td><div class="sa-row-actions">${canEdit()?["quantity","minimum","relocate"].filter((action)=>action!=="relocate"||row.location?.kind==="storage"||site!=="central").map((action)=>button(action,action,`data-id="${esc(row.item_id)}" data-location="${esc(row.location_id)}"`)).join(""):""}</div></td></tr>`);
    return `${canEdit()?button("attach","configure"):""}${rowsTable(["items","location","quantity","minimum","action"],list.rows)}${list.footer}`;
  }
  function historyView() {
    const list = paginate(history, (row) => {
      const meta = row.metadata || {};
      const before = meta.before_minimum ?? meta.before_quantity ?? meta.source_before ?? "—";
      const after = meta.after_minimum ?? meta.after_quantity ?? meta.source_after ?? "—";
      return `<tr><td>${esc(new Date(row.created_at).toLocaleString("vi-VN"))}</td><td>${esc(row.actor_username)}</td><td>${titleCell(itemById(row.item_id))}<small>${esc(row.item_id)}</small></td><td>${esc(meta.operation || row.action)}<small>${esc(row.note)}</small></td><td>${esc(label(locationById(row.source_location_id)))} → ${esc(label(locationById(row.destination_location_id)))}</td><td>${esc(before)} → ${esc(after)}<small>${esc(row.amount)}</small></td></tr>`;
    });
    return `<p>${esc(t("latest"))}</p>${rowsTable(["time","actor","items","action","location","beforeAfter"],list.rows)}${list.footer}`;
  }
  function integrityView() {
    const groups = { missingStorage:[], missingDefault:[], invalidArea:[], duplicateCatalog:[] };
    const counts = new Map();
    activeItems().forEach((item) => counts.set(item.catalog_key,(counts.get(item.catalog_key)||0)+1));
    for (const item of activeItems()) {
      const locations = stockFor(item.id).filter((row) => locationById(row.location_id)?.kind === "storage");
      if (!locations.length) groups.missingStorage.push(item);
      if (locations.length>1 && !snapshot.receiveDefaults.some((d) => d.catalog_key===item.catalog_key)) groups.missingDefault.push(item);
      if (item.work_area && !master.workAreas.some((area) => area.active && area.code===item.work_area)) groups.invalidArea.push(item);
      if (counts.get(item.catalog_key)>1) groups.duplicateCatalog.push(item);
    }
    return `<p>${esc(t("auditHint"))}</p><div class="idb-checks">${Object.entries(groups).map(([key,items]) => `<section><h3>${esc(t(key))} <span class="sa-pill">${items.length}</span></h3>${items.length?`<ul>${items.map((row)=>`<li>${esc(label(row))} <code>${esc(row.catalog_key)}</code></li>`).join("")}</ul>`:"✓"}</section>`).join("")}</div>`;
  }
  function render() {
    if (!host?.isConnected) return;
    host.innerHTML = `<div class="sa-card-head"><div><h2>${esc(t("title"))}</h2><p>${esc(t("intro"))}</p></div>${button("refresh","refresh",pending?"disabled":"")}</div>
      <div class="idb-toolbar">${select("site","site",sites.filter((s)=>s.active).map((s)=>option(s.code,label(s),site)).join(""))}<span class="sa-pill" data-idb-connection>${esc(t(connected?"connected":"disconnected"))}</span></div>
      <nav class="idb-tabs" aria-label="${esc(t("title"))}">${["items","locations","stock","history","integrity"].map((key)=>button(`tab-${key}`,key,`aria-pressed="${tab===key}" ${pending?"disabled":""}`)).join("")}</nav>
      <p data-idb-message role="status" class="${failed?"sa-form-error":"idb-message"}">${esc(message)}</p><p data-idb-remote role="status">${remote?esc(t("remote")):""}</p>
      <div data-idb-editor></div>
      ${loading&&!snapshot?`<p>${esc(t("loading"))}</p>`:snapshot&&master?`<form class="idb-search" data-idb-search>${input("q","search",q, 'type="search"')}<button class="sa-btn" type="submit">${esc(t("filter"))}</button></form>${({items:itemsView,locations:locationsView,stock:stockView,history:historyView,integrity:integrityView}[tab])()}`:""}`;
    host.querySelector('[name="site"]').disabled = pending;
    if(loading)host.querySelectorAll('[data-idb-action]').forEach((node)=>{node.disabled=true;});
    host.querySelector('[name="site"]').onchange = (event) => {
      if (!canLeave()) { event.target.value=site; return; }
      site=event.target.value; snapshot=master=null; history=[]; q=""; page=1; editor=null; message=""; void load();
    };
    host.querySelector("[data-idb-search]")?.addEventListener("submit",(event)=>{event.preventDefault();if(!canLeave())return;q=String(new FormData(event.target).get("q")||"");page=1;editor=null;render();});
    host.querySelectorAll("[data-idb-action]").forEach((node)=>node.addEventListener("click",()=>void action(node.dataset)));
    if (editor) renderEditor();
  }
  function notify(text, isError=false) {
    message=text; failed=isError;
    const node=host?.querySelector("[data-idb-message]");
    if(node){node.textContent=text;node.className=isError?"sa-form-error":"idb-message";}
  }
  function markRemote() {
    remote=true;
    const node=host?.querySelector("[data-idb-remote]");
    if(node)node.textContent=t("remote");
  }
  function canLeave() { if(pending)return false; if(dirty&&!window.confirm(t("discard")))return false;dirty=false;return true; }
  async function load({quiet=false}={}) {
    if(!host||!site)return false;
    if(quiet&&(editor||pending)){markRemote();return false;}
    // A background event cannot supersede the foreground request that owns
    // disabled controls. Reconcile again after that request releases the UI.
    if(quiet&&loading){refreshQueued=true;return false;}
    const seq=++generation, targetSite=site, targetTab=tab;
    if(!quiet){loading=true;render();}
    try {
      const [nextMaster,nextSnapshot,nextHistory] = await Promise.all([
        request(`/api/master-data/${encodeURIComponent(targetSite)}?includeInactive=true`),
        request(`/api/inventory/${encodeURIComponent(targetSite)}?includeInactive=true`),
        targetTab==="history"?request(`/api/inventory/${encodeURIComponent(targetSite)}/transactions?limit=250`):Promise.resolve(null),
      ]);
      if(seq!==generation||!host)return false;
      if(quiet&&(editor||pending)){markRemote();return false;}
      const changed=JSON.stringify([master,snapshot,history])!==JSON.stringify([nextMaster,nextSnapshot,nextHistory?.transactions||history]);
      master=nextMaster;snapshot=nextSnapshot;if(nextHistory)history=nextHistory.transactions||[];
      remote=false;loading=false;if(changed||!quiet)render();
      if(refreshQueued){refreshQueued=false;sync();}return true;
    } catch(error) { if(seq===generation){loading=false;message=errorCode(error);failed=true;render();}return false; }
  }
  async function action(data) {
    const name=data.idbAction;
    if(!canLeave())return;
    editor=null;
    if(name==="refresh"){await load();return;}
    if(name.startsWith("tab-")){tab=name.slice(4);page=1;q="";await load();return;}
    if(name.startsWith("kind-")){locationKind=name.slice(5);page=1;q="";render();return;}
    if(name==="previous"||name==="next"){page+=name==="next"?1:-1;render();return;}
    if(name==="item-stock"){tab="stock";q=data.id;page=1;render();return;}
    if(name==="archive-item") {
      if(!window.confirm(t("archiveConfirm")))return;
      const row=itemById(data.id);
      await mutate("/api/inventory/catalog/archive",{itemKey:row.item_key,expectedRevision:revision(row)});return;
    }
    editor={type:name,id:data.id||"",locationId:data.location||"",site};
    renderEditor();
  }
  function renderEditor() {
    const container=host.querySelector("[data-idb-editor]");if(!container||!editor)return;
    const type=editor.type, row=itemById(editor.id), stock=stockFor(editor.id).find((s)=>s.location_id===editor.locationId);
    let html="", title=type, initial;
    if(type==="item") {
      initial=row||{};title="items";
      const workOptions=option("",t("none"),row?.work_area)+master.workAreas.filter((a)=>a.active||a.code===row?.work_area).map((a)=>option(a.code,label(a),row?.work_area)).join("");
      html=input("item_key","code",row?.item_key||`${site}:`,row?'readonly':'required pattern="[a-zA-Z0-9:._-]+" maxlength="150"')+input("catalog_key","catalog",row?.catalog_key||"",'required maxlength="100"')+input("name_vi","nameVi",row?.name_vi||"",'required maxlength="200"')+input("name_zh_tw","nameZh",row?.name_zh_tw||"",'required maxlength="200"')+input("unit","unit",row?.unit||"",'required maxlength="30"')+select("work_area","area",workOptions)+`<label class="sa-check"><input type="checkbox" name="storage_only" ${row?.storage_only?"checked":""}><span>${esc(t("storageOnly"))}</span></label><p class="wide">${esc(t("workHint"))}</p>`;
    } else if(type==="master") {
      const areas=locationKind==="areas"; title=areas?"area":locationKind;
      initial=(areas?master.workAreas:master.locations).find((m)=>(areas?m.code:m.id)===editor.id)||{};
      html=input("code","code",initial.code||(areas?"":`${site}-`),initial.code?'readonly':'required pattern="[a-z][a-z0-9._-]{1,39}" maxlength="40"')+input("name_vi","nameVi",initial.name_vi||"",'required maxlength="200"')+input("name_zh_tw","nameZh",initial.name_zh_tw||"",'required maxlength="200"')+input("sort_order","sort",initial.sort_order||0,'type="number" step="1"')+select("active","status",option("true",t("active"),String(initial.active!==false))+option("false",t("inactive"),String(initial.active!==false)));
      if(areas)html+=select("department_code","department",option("",t("none"),initial.department_code)+master.departments.filter((d)=>d.active||d.code===initial.department_code).map((d)=>option(d.code,label(d),initial.department_code)).join(""));
      else if(locationKind==="storage")html+=select("storage_group","group",["primary","service"].map((g)=>option(g,t(g),initial.metadata?.storage_group||"primary")).join(""));
      else html+=select("work_area","area",master.workAreas.filter((a)=>a.active||a.code===initial.metadata?.work_area).map((a)=>option(a.code,label(a),initial.metadata?.work_area)).join(""));
    } else if(type==="attach") {
      title="configure";
      html=select("itemId","items",activeItems().map((i)=>option(i.id,label(i),"")).join(""))+select("locationId","location",activeLocations().map((l)=>option(l.id,label(l),"")).join(""));
    } else if(type==="receive") {
      title="receive";initial=snapshot.receiveDefaults.find((d)=>d.catalog_key===row.catalog_key)||{};
      const choices=stockFor(row.id).map((s)=>locationById(s.location_id)).filter((l)=>l?.active&&l.kind==="storage");
      html=`<p class="wide">${esc(label(row))} — ${esc(t("receiveHint"))}</p>`+select("locationCode","receive",option("",t("none"),initial.location_code)+choices.map((l)=>option(l.code,label(l),initial.location_code)).join(""));
    } else if(type==="quantity"||type==="minimum") {
      initial=stock;html=`<p class="wide">${esc(label(row))} / ${esc(label(locationById(editor.locationId)))}</p>`+input("value",type,type==="quantity"?stock.quantity:stock.minimum_quantity,'type="number" min="0" max="99999999999.999" step="0.001" required')+input("note","note","",'required maxlength="300"');
    } else if(type==="relocate") {
      const from=locationById(editor.locationId);title="relocate";
      html=`<p class="wide">${esc(label(row))} / ${esc(label(from))}</p><p class="wide">${esc(t("relocateHint"))}</p>`+select("destinationLocationId","destination",activeLocations().filter((l)=>l.id!==from.id&&l.kind===from.kind).map((l)=>option(l.id,label(l),"")).join(""))+input("note","note","",'required maxlength="300"');
    }
    editor.initial=initial;
    container.innerHTML=`<section class="idb-editor"><h3>${esc(t(title))} — ${esc(label(sites.find((s)=>s.code===site)))}</h3><form data-idb-form><fieldset class="sa-form-grid">${html}<div class="wide sa-row-actions"><button type="submit" class="sa-btn primary">${esc(t(type==="item"&&row?.active===false?"restore":"save"))}</button>${button("close","cancel")}</div><p class="wide sa-form-error" data-idb-form-error role="alert"></p></fieldset></form></section>`;
    container.querySelectorAll('[name="work_area"],[name="destinationLocationId"],[name="itemId"],[name="locationId"]').forEach((node)=>{node.required=true;});
    if(type==="item"&&row&&hasWork(row.id))container.querySelector('[name="work_area"]').disabled=true;
    if(type==="item"&&row)container.querySelector('[name="catalog_key"]').readOnly=true;
    if(type==="item"&&row&&hasWork(row.id))container.querySelector('[name="storage_only"]').disabled=true;
    // A work location's association is an identity, not a safe metadata rename.
    if(type==="master"&&locationKind==="work"&&initial.id)container.querySelector('[name="work_area"]').disabled=true;
    const form=container.querySelector("form");
    form.addEventListener("input",()=>{dirty=true;});form.addEventListener("change",()=>{dirty=true;});
    form.addEventListener("submit",(event)=>{event.preventDefault();void submit(form);});
    container.querySelector('[data-idb-action="close"]').onclick=()=>{if(!canLeave())return;editor=null;container.innerHTML="";if(remote)void load();};
    container.querySelector("input:not([readonly]),select")?.focus({preventScroll:true});
    container.scrollIntoView({block:"nearest"});
  }
  async function submit(form) {
    if(pending||!editor||editor.site!==site)return;
    const fd=new FormData(form), value=(key)=>String(fd.get(key)||"").trim(), initial=editor.initial||{};
    const row=itemById(editor.id), type=editor.type;
    let path, body;
    try {
      if(type==="master") {
        if(!canMaster(locationKind))throw new Error(t("forbidden"));
        const areas=locationKind==="areas";
        path=`/api/master-data/${areas?"work-areas":"locations"}`;
        body={action:"save",site,code:value("code"),name_vi:value("name_vi"),name_zh_tw:value("name_zh_tw"),sort_order:Number(value("sort_order")),active:value("active")==="true",metadata:{...initial.metadata},...(initial.code?{expectedUpdatedAt:initial.updated_at}:{createOnly:true})};
        if(areas)body.department_code=value("department_code");
        else {body.id=initial.id;body.kind=locationKind;body.metadata.ui_key=initial.metadata?.ui_key||body.code.slice(site.length+1);if(locationKind==="storage")body.metadata.storage_group=value("storage_group");else body.metadata.work_area=initial.metadata?.work_area||value("work_area");}
        if(initial.active&&body.active===false&&!window.confirm(t("archiveConfirm")))return;
      } else {
        if(!canEdit())throw new Error(t("forbidden"));
        if(type==="item") {
          if(!value("item_key").startsWith(`${site}:`)||value("item_key")===`${site}:`)throw new Error("ITEM_SITE_MISMATCH");
          path="/api/inventory/catalog/sync";
          body={expectedRevision:revision(row),guardWorkArea:true,item:{key:value("item_key"),catalog_key:row?.catalog_key||value("catalog_key"),vi:value("name_vi"),zh:value("name_zh_tw"),unit:value("unit"),work_area:row&&hasWork(row.id)?row.work_area:value("work_area"),storage_only:row&&hasWork(row.id)?row.storage_only:fd.has("storage_only")}};
        } else if(type==="attach") {
          const item=itemById(value("itemId")),loc=locationById(value("locationId"));
          if(!item?.active||!loc?.active)throw new Error("ITEM_LOCATION_NOT_FOUND");
          if(loc.kind==="work"&&loc.metadata?.work_area!==item.work_area)throw new Error("WORK_AREA_SOURCE_MISMATCH");
          path="/api/inventory/catalog/sync";body={expectedRevision:revision(item),guardWorkArea:true,appendLocations:true,item:{...itemPayload(item),locations:[{code:loc.code}]}};
        } else if(type==="receive") {
          path="/api/inventory/receive-default";body={site,catalogKey:row.catalog_key,locationCode:value("locationCode"),expectedLocationCode:initial.location_code||""};
        } else if(type==="quantity"||type==="minimum") {
          const number=Number(value("value"));if(!Number.isFinite(number)||number<0)throw new Error("INVALID_QUANTITY");
          path=`/api/inventory/set-${type}`;body={itemId:row.id,locationId:editor.locationId,note:value("note"),[type]:number,[type==="quantity"?"expectedQuantity":"expectedMinimum"]:Number(type==="quantity"?initial.quantity:initial.minimum_quantity)};
        } else if(type==="relocate") {
          path=`/api/inventory/relocate-${locationById(editor.locationId).kind==="storage"?"storage":"work-area"}`;body={itemId:row.id,sourceLocationId:editor.locationId,destinationLocationId:value("destinationLocationId"),note:value("note")};
        }
      }
      if(!path)throw new Error("INVALID_ACTION");
      await mutate(path,body,form);
    } catch(error) {form.querySelector("[data-idb-form-error]").textContent=errorCode(error);}
  }
  async function mutate(path,body,form) {
    if(pending)return;pending=true;
    if(form)form.querySelector("fieldset").disabled=true;
    host.querySelectorAll('[data-idb-action], [name="site"]').forEach((node)=>{node.disabled=true;});
    notify(t("saving"));
    try {
      await request(path,{method:"POST",body});
      dirty=false;editor=null;pending=false;notify(t("saved"));
      if(!await load())notify(t("saveReadFailed"),true);
    } catch(error) {
      pending=false;const code=errorCode(error);const text=`${t(code.includes("STALE")?"stale":"failed")} ${code}`;
      notify(text,true);if(form){form.querySelector("fieldset").disabled=false;form.querySelector("[data-idb-form-error]").textContent=text;}
      host.querySelectorAll('[data-idb-action], [name="site"]').forEach((node)=>{node.disabled=false;});
    }
  }
  const sync=()=>{if(!document.hidden&&!pending){clearTimeout(timer);timer=setTimeout(()=>void load({quiet:true}),150);}};
  const guard=(event)=>{if(event.target.closest("[data-section],[data-refresh],[data-db-mode],[data-dataset]")){if(!canLeave()){event.preventDefault();event.stopImmediatePropagation();}}};
  const unload=(event)=>{if(dirty||pending){event.preventDefault();event.returnValue="";}};
  function detach() {
    generation++;source?.close();source=null;clearInterval(poll);clearTimeout(timer);
    document.removeEventListener("visibilitychange",sync);window.removeEventListener("focus",sync);
    document.removeEventListener("click",guard,true);window.removeEventListener("beforeunload",unload);
    host=null;editor=null;dirty=false;connected=false;loading=false;refreshQueued=false;
  }
  function mount(target,context) {
    detach();host=target;sites=context.sites;me=context.me;
    if(!host||!me?.capabilities?.["system.super_admin"])return;
    if(!sites.some((s)=>s.code===site&&s.active))site=sites.find((s)=>s.active)?.code||"";
    render();void load();
    document.addEventListener("visibilitychange",sync);window.addEventListener("focus",sync);
    document.addEventListener("click",guard,true);window.addEventListener("beforeunload",unload);
    if(typeof EventSource!=="undefined") {
      source=new EventSource("/api/inventory/events");
      source.addEventListener("inventory",sync);
      source.addEventListener("ready",()=>{connected=true;const node=host?.querySelector("[data-idb-connection]");if(node)node.textContent=t("connected");sync();});
      source.onerror=()=>{connected=false;const node=host?.querySelector("[data-idb-connection]");if(node)node.textContent=t("disconnected");};
    }
    poll=setInterval(sync,30000);
  }
  return {mount,detach};
}
