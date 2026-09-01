import {
  canInventoryEdit,
  cloudAdjustQuantity,
  cloudTransferInventory,
  getInventoryReceiveDefaults,
  getSiteInventoryRows,
  getSiteLocations,
  inventoryCloudState,
  syncInventoryNow,
} from "./inventory-cloud.js";
import {
  INVENTORY_SITES,
  directBranchTransfer,
  loadSiteOperationData,
  siteLabel,
  watchInventoryTransfers,
} from "./inventory-transfer-service.js";

const TEXT = {
  vi: {
    in:"Nhập kho · 進貨入庫",
    pick:"Lấy hàng · 領貨",
    transfer:"Điều chuyển · 庫存轉撥",
    ship:"Xuất hàng · 出貨",
    search:"Tìm / 中文 / Tiếng Việt / Pinyin / 注音…",
    from:"Từ kho · 來源儲位",
    to:"Đến · 目的地",
    destination:"Kho nhận · 目的儲位",
    current:"Hiện có · 現有庫存",
    quantity:"Số lượng · 數量",
    inbound:"Nhập · 入庫",
    pickAction:"Lấy hàng · 領貨",
    move:"Chuyển · 轉撥",
    shipAction:"Xuất hàng · 出貨",
    workDestination:"Khu sử dụng · 使用區",
    picked:"Đã lấy · 已領貨",
    useAction:"Sử dụng · 使用",
    returnAction:"Cất lại · 歸位",
    returnTo:"Cất vào · 歸位儲位",
    returnedTo:"Đã cất lại vào · 已歸位至",
    shipSite:"Chi nhánh nhận · 收貨據點",
    fixedDestination:"Sản phẩm đã có tại chi nhánh; nơi cất được lấy tự động theo cài đặt của chi nhánh. · 分店已有此品項，收貨儲位依分店設定自動帶入。",
    singleDestination:"Chi nhánh chỉ cấu hình một nơi cất cho sản phẩm này nên hệ thống tự chọn. · 分店此品項只有一個存放儲位，系統已自動選擇。",
    flexibleDestination:"Chi nhánh chưa có sản phẩm này; hãy chọn nơi cất cho lần xuất hiện tại. · 分店尚無此品項，本次請選擇實際存放位置。",
    needsManagerDestination:"Chi nhánh đã có sản phẩm nhưng có nhiều nơi cất và chưa đặt kho nhận cố định. Quản lý chi nhánh cần chỉnh trước khi xưởng xuất hàng. · 分店已有此品項但有多個儲位，尚未設定固定收貨儲位；請分店主管先完成設定。",
    fixedBadge:"Theo chi nhánh · 依分店設定",
    singleBadge:"Tự động · 自動帶入",
    flexibleBadge:"Sản phẩm mới · 分店未建品項",
    needsManagerBadge:"Cần quản lý cài đặt · 需主管設定",
    shipFixed:"Đã 出貨 và cập nhật đúng kho nhận. · 已出貨並更新至正確收貨儲位。",
    noItems:"Không có mặt hàng phù hợp · 沒有符合條件的品項",
    loading:"Đang tải dữ liệu kho… · 正在載入庫存…",
    cloudRequired:"Cần bật đồng bộ Supabase kho trước khi thao tác. · 請先啟用 Supabase 庫存同步。",
    editRequired:"Tài khoản này chỉ có quyền xem kho. · 此帳號僅能查看庫存。",
    success:"Đã cập nhật kho · 庫存已更新",
    insufficient:"Số lượng thao tác lớn hơn số hiện có. · 操作數量超過現有數量。",
    sameLocation:"Kho nguồn và kho đích phải khác nhau. · 來源與目的儲位不可相同。",
    failed:"Không thể cập nhật dữ liệu cloud. · 雲端庫存更新失敗。",
    transferNo:"Phiếu · 單號",
  },
  zh: {
    in:"進貨入庫",pick:"領貨",transfer:"庫存轉撥",ship:"出貨",
    search:"搜尋品項 / Pinyin / 注音…",from:"來源儲位",to:"目的地",destination:"目的儲位",
    current:"現有庫存",quantity:"數量",inbound:"入庫",pickAction:"領貨",move:"轉撥",shipAction:"出貨",
    workDestination:"使用區",picked:"已領貨",useAction:"使用",returnAction:"歸位",returnTo:"歸位儲位",returnedTo:"已歸位至",shipSite:"收貨據點",
    fixedDestination:"分店已有此品項，收貨儲位依分店設定自動帶入。",singleDestination:"分店此品項只有一個存放儲位，系統已自動選擇。",flexibleDestination:"分店尚無此品項，本次請選擇實際存放位置。",needsManagerDestination:"分店已有此品項但有多個儲位，尚未設定固定收貨儲位；請分店主管先完成設定。",fixedBadge:"依分店設定",singleBadge:"自動帶入",flexibleBadge:"分店未建品項",needsManagerBadge:"需主管設定",shipFixed:"已出貨並更新至正確收貨儲位。",
    noItems:"沒有符合條件的品項",
    loading:"正在載入庫存…",
    cloudRequired:"請先啟用 Supabase 庫存同步。",editRequired:"此帳號僅能查看庫存。",
    success:"庫存已更新",insufficient:"操作數量超過現有數量。",sameLocation:"來源與目的儲位不可相同。",
    failed:"雲端庫存更新失敗。",transferNo:"單號",
  },
};

function esc(v){
  return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
}
function langText(language){ return TEXT[language==="zh"?"zh":"vi"]; }
function itemLabel(item,language){
  return language==="zh" ? item.zh : `${item.vi || item.zh} · ${item.zh}`;
}
function locationLabel(location,language){
  return language==="zh" ? location.name_zh_tw || location.zh : `${location.name_vi || location.vi || location.name_zh_tw} · ${location.name_zh_tw || location.zh}`;
}
function qtyControl(id,value=1){
  return `<div class="op-quantity" data-op-quantity="${esc(id)}"><button type="button" data-op-minus="${esc(id)}" aria-label="-">−</button><input type="number" min="1" inputmode="numeric" value="${Math.max(1,Number(value)||1)}" data-op-amount="${esc(id)}"><button type="button" data-op-plus="${esc(id)}" aria-label="+">＋</button></div>`;
}
function errorText(error,t){
  const code=String(error?.message||"");
  if(/INSUFFICIENT_STOCK/.test(code)) return t.insufficient;
  if(/SAME_LOCATION/.test(code)) return t.sameLocation;
  if(/INVENTORY_EDIT_NOT_ALLOWED/.test(code)) return t.editRequired;
  return t.failed;
}
function storageRows(item){
  return item.locations.filter((loc)=>Number(loc.quantity)>=0);
}
function stockAt(item,locationId){
  return item.locations.find((loc)=>loc.id===locationId)?.quantity ?? 0;
}
function locationOptions(locations,language,selected=""){
  return locations.map((loc)=>`<option value="${esc(loc.id)}" ${loc.id===selected?"selected":""}>${esc(locationLabel(loc,language))}</option>`).join("");
}
function sourceOptions(item,language){
  return item.locations
    .filter((loc)=>Number(loc.quantity)>0)
    .map((loc)=>`<option value="${esc(loc.id)}" data-code="${esc(loc.code)}">${esc(locationLabel({name_zh_tw:loc.zh,name_vi:loc.vi},language))} · ${loc.quantity} ${esc(item.unit)}</option>`)
    .join("");
}

function workLocationForItem(item,workLocations=[]){
  const preferredSuffix=`-work-${item.workArea||"noodles"}`;
  return workLocations.find((loc)=>String(loc.code||"").endsWith(preferredSuffix))
    || workLocations.find((loc)=>loc.code==="central-work-use")
    || workLocations[0]
    || item.workLocations?.[0]
    || null;
}
function workStockAt(item,locationId){
  return item.workLocations?.find((loc)=>loc.id===locationId)?.quantity ?? 0;
}
function workSourceOptions(item,language){
  return (item.workLocations||[])
    .filter((loc)=>Number(loc.quantity)>0)
    .map((loc)=>`<option value="${esc(loc.id)}" data-code="${esc(loc.code)}">${esc(locationLabel({name_zh_tw:loc.zh,name_vi:loc.vi},language))} · ${loc.quantity} ${esc(item.unit)}</option>`)
    .join("");
}

function overviewCard(item,language,t){
  const storageLocations=item.locations
    .filter((loc)=>Number(loc.quantity)!==0 || Number(loc.minimum)!==0)
    .map((loc)=>`<span class="op-location-pill"><small>${esc(language==="zh"?loc.zh:`${loc.vi||loc.zh} · ${loc.zh}`)}</small><strong>${Number(loc.quantity||0)} ${esc(item.unit)}</strong></span>`)
    .join("");
  const activeLocations=(item.workLocations||[])
    .filter((loc)=>Number(loc.quantity)>0)
    .map((loc)=>`<span class="op-location-pill op-location-pill-use"><small>${esc(language==="zh"?loc.zh:`${loc.vi||loc.zh} · ${loc.zh}`)}</small><strong>${Number(loc.quantity||0)} ${esc(item.unit)}</strong></span>`)
    .join("");
  const physicalTotal=Number(item.total||0)+Number(item.workTotal||0);
  return `<article class="inventory-op-card inventory-overview-card" data-op-item="${esc(item.id)}">
    <div class="op-item-head"><div><strong>${esc(item.zh)}</strong><small>${esc(item.vi||"")}</small></div><span><small>${esc(t.current)}</small><strong>${physicalTotal} ${esc(item.unit)}</strong></span></div>
    <div class="op-location-list">${storageLocations+activeLocations||'<span class="op-location-pill"><small>—</small><strong>0</strong></span>'}</div>
  </article>`;
}

function itemCard(item,mode,locations,site,language,t,allLocations=locations,workLocations=[]){
  const positiveSource=item.locations.find((loc)=>Number(loc.quantity)>0);
  const firstSource=positiveSource || item.locations[0];
  const firstDestination=locations.find((loc)=>loc.id!==firstSource?.id) || locations[0];
  const currentLocationId=["pick","transfer","ship"].includes(mode)
    ? firstSource?.id
    : mode==="in"
      ? (item.locations[0]?.id || locations[0]?.id)
      : "";
  const currentQuantity=currentLocationId ? Number(stockAt(item,currentLocationId)||0) : Number(item.total||0);
  const workLocation=workLocationForItem(item,workLocations);
  const workQuantity=workLocation ? Number(workStockAt(item,workLocation.id)||0) : Number(item.workTotal||0);
  const otherSites=INVENTORY_SITES.filter((entry)=>entry.id!==site);
  const sourceSelect = `<label><span>${esc(t.from)}</span><select data-op-source="${esc(item.id)}">${sourceOptions(item,language)}</select></label>`;
  const destinationSelect = `<label><span>${esc(t.destination)}</span><select data-op-destination="${esc(item.id)}">${locationOptions(locations,language,firstDestination?.id)}</select></label>`;
  const inboundDestination = `<label><span>${esc(t.destination)}</span><select data-op-destination="${esc(item.id)}">${locationOptions(locations,language,item.locations[0]?.id || locations[0]?.id)}</select></label>`;
  const workDestination = workLocation
    ? `<label><span>${esc(t.workDestination)}</span><select data-op-work-destination="${esc(item.id)}"><option value="${esc(workLocation.id)}" data-code="${esc(workLocation.code)}">${esc(locationLabel(workLocation,language))}</option></select></label>`
    : `<label><span>${esc(t.workDestination)}</span><span class="inventory-readonly-field">—</span></label>`;
  const defaultTargetSite=otherSites[0]?.id || "";
  const shipSiteSelect = `<label><span>${esc(t.shipSite)}</span><select data-op-target="${esc(item.id)}">${otherSites.map((entry)=>`<option value="${entry.id}">${esc(siteLabel(entry.id,language))}</option>`).join("")}</select></label>`;
  const crossSiteLocations=(allLocations||[]).filter((location)=>location.site===defaultTargetSite);
  const targetLocationSelect=`<label class="op-target-location" data-op-target-location-wrap="${esc(item.id)}"><span>${esc(t.destination)}</span><select data-op-target-location="${esc(item.id)}">${crossSiteLocations.map((location)=>`<option value="${esc(location.id)}">${esc(locationLabel(location,language))}</option>`).join("")}</select></label>`;

  let controls="";
  let action="";
  let followup="";
  if(mode==="in"){
    controls=inboundDestination;
    action=`<button class="op-primary" data-op-submit="in" data-item-id="${esc(item.id)}">${esc(t.inbound)}</button>`;
  }else if(mode==="pick"){
    controls=sourceSelect+workDestination;
    action=`<button class="op-primary" data-op-submit="pick" data-item-id="${esc(item.id)}" ${positiveSource&&workLocation?"":"disabled"}>${esc(t.pickAction)}</button>`;
    if(workLocation){
      const returnDestination=locations.find((loc)=>loc.id!==firstSource?.id) || locations[0];
      followup=`<div class="pick-followup" data-pick-followup="${esc(item.id)}">
        <div class="pick-status"><span>${esc(t.picked)}</span><strong>${workQuantity} ${esc(item.unit)}</strong><small>${esc(locationLabel(workLocation,language))}</small></div>
        <div class="pick-use-row">${qtyControl(`${item.id}-use`)}<button class="op-secondary op-use" data-op-use="${esc(item.id)}" ${workQuantity>0?"":"disabled"}>${esc(t.useAction)}</button></div>
        <div class="pick-return-row"><label><span>${esc(t.returnTo)}</span><select data-op-return-destination="${esc(item.id)}">${locationOptions(locations,language,returnDestination?.id)}</select></label>${qtyControl(`${item.id}-return`)}<button class="op-secondary" data-op-return="${esc(item.id)}" ${workQuantity>0?"":"disabled"}>${esc(t.returnAction)}</button></div>
      </div>`;
    }
  }else if(mode==="ship"){
    controls=sourceSelect+shipSiteSelect+targetLocationSelect+`<div class="ship-fixed-hint" data-op-ship-destination-hint="${esc(item.id)}"></div>`;
    action=`<button class="op-primary op-out" data-op-submit="ship" data-item-id="${esc(item.id)}" ${positiveSource?"":"disabled"}>${esc(t.shipAction)}</button>`;
  }else{
    controls=sourceSelect+destinationSelect;
    action=`<button class="op-primary" data-op-submit="transfer" data-item-id="${esc(item.id)}" ${firstSource?"":"disabled"}>${esc(t.move)}</button>`;
  }

  const transferBalance = mode==="transfer" && firstSource && firstDestination
    ? `<div class="op-transfer-balance" data-op-transfer-balance="${esc(item.id)}"><span>${esc(locationLabel({name_zh_tw:firstSource.zh,name_vi:firstSource.vi},language))} <strong>${Number(firstSource.quantity)||0}</strong></span><b>→</b><span>${esc(locationLabel(firstDestination,language))} <strong>${Number(stockAt(item,firstDestination.id))||0}</strong></span></div>`
    : "";
  return `<article class="inventory-op-card" data-op-item="${esc(item.id)}">
    <div class="op-item-head"><div><strong>${esc(item.zh)}</strong><small>${esc(item.vi || "")}</small></div><span><small>${esc(t.current)}</small><strong data-op-current="${esc(item.id)}">${currentQuantity} ${esc(item.unit)}</strong></span></div>
    <div class="op-select-grid">${controls}</div>
    ${transferBalance}
    <div class="op-action-row">${qtyControl(item.id)}${action}</div>
    ${followup}
  </article>`;
}
async function doRender(host,state){
  const {site,mode,language}=state;
  const t=langText(language);
  host.innerHTML=`<div class="inventory-ops-loading">${esc(t.loading)}</div>`;
  try{
    const data=await loadSiteOperationData(site);
    if (inventoryCloudState()==="migration-needed") throw new Error("SCHEMA_MIGRATION_REQUIRED");
    state.data=data;
    const cards = mode==="overview"
      ? data.items.map((item)=>overviewCard(item,language,t))
      : data.items.map((item)=>itemCard(item,mode,data.locations,site,language,t,data.allLocations||data.locations,data.workLocations||[]));
    host.innerHTML=`<section class="inventory-ops-shell"><div class="inventory-ops-toolbar"><label class="op-search"><input type="search" placeholder="${esc(t.search)}" data-op-search></label><span class="op-count">${data.items.length}</span></div><div class="inventory-ops-list" data-op-list>${data.items.length?cards.join(""):`<p class="inventory-ops-empty">${esc(t.noItems)}</p>`}</div><p class="op-message" data-op-message></p></section>`;
    restoreOperationSelections(host,state);
    bind(host,state);
  }catch(error){
    host.innerHTML=`<div class="inventory-cloud-notice">${esc(t.cloudRequired)}<small>${esc(error?.message||"")}</small></div>`;
  }
}

function refreshTransferBalance(host,state,itemId){
  const item=state.data?.items.find((entry)=>entry.id===itemId);
  const card=host.querySelector(`[data-op-item="${CSS.escape(itemId)}"]`);
  const balance=card?.querySelector(`[data-op-transfer-balance="${CSS.escape(itemId)}"]`);
  if(!item||!card||!balance)return;
  const sourceId=card.querySelector("[data-op-source]")?.value;
  const destinationId=card.querySelector("[data-op-destination]")?.value;
  const source=item.locations.find((entry)=>entry.id===sourceId);
  const destination=state.data?.locations.find((entry)=>entry.id===destinationId);
  if(!source||!destination)return;
  balance.innerHTML=`<span>${esc(locationLabel({name_zh_tw:source.zh,name_vi:source.vi},state.language))} <strong>${Number(source.quantity)||0}</strong></span><b>→</b><span>${esc(locationLabel(destination,state.language))} <strong>${Number(stockAt(item,destinationId))||0}</strong></span>`;
}

function receiveDefaultFor(state,item,targetSite){
  const catalogKey=item?.catalogKey||item?.catalog_key||"";
  if(!catalogKey||!targetSite)return null;
  return (state.data?.receiveDefaults||[]).find((entry)=>
    entry.site===targetSite && entry.catalogKey===catalogKey && entry.locationCode
  ) || null;
}
function destinationCatalogFor(state,item,targetSite){
  const catalogKey=item?.catalogKey||item?.catalog_key||"";
  if(!catalogKey||!targetSite)return null;
  return (state.data?.destinationCatalog||[]).find((entry)=>
    entry.site===targetSite && entry.catalogKey===catalogKey
  ) || null;
}

function syncCrossSiteDestination(host,state,itemId,targetSite){
  const card=host.querySelector(`[data-op-item="${CSS.escape(itemId)}"]`);
  const wrap=card?.querySelector(`[data-op-target-location-wrap="${CSS.escape(itemId)}"]`);
  const select=card?.querySelector(`[data-op-target-location="${CSS.escape(itemId)}"]`);
  const hint=card?.querySelector(`[data-op-ship-destination-hint="${CSS.escape(itemId)}"]`);
  const shipButton=card?.querySelector('[data-op-submit="ship"]');
  const item=state.data?.items.find((entry)=>entry.id===itemId);
  if(!wrap||!select||!item)return;

  const locations=(state.data?.allLocations||[]).filter((location)=>location.site===targetSite);
  const fixed=receiveDefaultFor(state,item,targetSite);
  const destinationItem=destinationCatalogFor(state,item,targetSite);
  const destinationLocations=(destinationItem?.locations||[])
    .map((stored)=>locations.find((location)=>location.code===stored.code))
    .filter(Boolean);
  const fixedLocation=fixed ? locations.find((location)=>location.code===fixed.locationCode) : null;
  const singleExistingLocation=!fixedLocation && destinationItem && destinationLocations.length===1
    ? destinationLocations[0]
    : null;
  const requiresManager=Boolean(destinationItem && !fixedLocation && destinationLocations.length!==1);
  const lockedLocation=fixedLocation||singleExistingLocation||null;
  const hasSource=item.locations.some((location)=>Number(location.quantity)>0);

  wrap.hidden=!targetSite;
  select.innerHTML=locations.map((location)=>
    `<option value="${esc(location.id)}" ${lockedLocation?.id===location.id?"selected":""}>${esc(locationLabel(location,state.language))}</option>`
  ).join("");
  select.disabled=Boolean(lockedLocation||requiresManager);
  wrap.classList.toggle("is-fixed-receive",Boolean(lockedLocation));
  wrap.classList.toggle("is-receive-blocked",requiresManager);
  if(shipButton) shipButton.disabled=!hasSource||requiresManager||!locations.length;
  card.dataset.receiveMode=requiresManager?"manager-required":lockedLocation?"branch-auto":"manual-new";

  if(hint){
    const t=langText(state.language);
    if(requiresManager){
      hint.className="ship-fixed-hint is-blocked";
      hint.innerHTML=`<strong>${esc(t.needsManagerBadge)}</strong><span>${esc(t.needsManagerDestination)}</span>`;
    }else if(fixedLocation){
      hint.className="ship-fixed-hint is-fixed";
      hint.innerHTML=`<strong>${esc(t.fixedBadge)}</strong><span>${esc(t.fixedDestination)} · ${esc(locationLabel(fixedLocation,state.language))}</span>`;
    }else if(singleExistingLocation){
      hint.className="ship-fixed-hint is-fixed";
      hint.innerHTML=`<strong>${esc(t.singleBadge)}</strong><span>${esc(t.singleDestination)} · ${esc(locationLabel(singleExistingLocation,state.language))}</span>`;
    }else{
      hint.className="ship-fixed-hint is-flexible";
      hint.innerHTML=`<strong>${esc(t.flexibleBadge)}</strong><span>${esc(t.flexibleDestination)}</span>`;
    }
  }
}

function setMessage(host,text,kind=""){
  const node=host.querySelector("[data-op-message]");
  if(!node) return;
  node.textContent=text||"";
  node.className=`op-message ${kind}`;
}
function operationSelections(state){
  if(!state.selections) state.selections={sources:{},returns:{}};
  return state.selections;
}
function restoreOperationSelections(host,state){
  const selections=operationSelections(state);
  host.querySelectorAll("[data-op-item]").forEach((card)=>{
    const itemId=card.dataset.opItem;
    const item=state.data?.items.find((entry)=>entry.id===itemId);
    const source=card.querySelector("[data-op-source]");
    const rememberedSource=selections.sources[itemId];
    if(source&&rememberedSource&&[...source.options].some((option)=>option.value===rememberedSource)){
      source.value=rememberedSource;
    }
    if(source&&item){
      const current=card.querySelector(`[data-op-current="${CSS.escape(itemId)}"]`);
      if(current) current.textContent=`${stockAt(item,source.value)} ${item.unit}`;
    }
    const returnDestination=card.querySelector("[data-op-return-destination]");
    const rememberedReturn=selections.returns[itemId];
    if(returnDestination&&rememberedReturn&&[...returnDestination.options].some((option)=>option.value===rememberedReturn)){
      returnDestination.value=rememberedReturn;
    }
  });
}
function bindQuantity(host){
  host.querySelectorAll("[data-op-minus]").forEach((button)=>{
    button.onclick=()=>{
      const input=host.querySelector(`[data-op-amount="${CSS.escape(button.dataset.opMinus)}"]`);
      if(input) input.value=String(Math.max(1,(Number(input.value)||1)-1));
    };
  });
  host.querySelectorAll("[data-op-plus]").forEach((button)=>{
    button.onclick=()=>{
      const input=host.querySelector(`[data-op-amount="${CSS.escape(button.dataset.opPlus)}"]`);
      if(input) input.value=String(Math.max(1,(Number(input.value)||1)+1));
    };
  });
}

function bind(host,state){
  const {site,mode,language}=state;
  const t=langText(language);
  bindQuantity(host);

  host.querySelectorAll("[data-op-source]").forEach((select)=>{
    select.onchange=()=>{
      operationSelections(state).sources[select.dataset.opSource]=select.value;
      const item=state.data?.items.find((entry)=>entry.id===select.dataset.opSource);
      const current=host.querySelector(`[data-op-current="${CSS.escape(select.dataset.opSource)}"]`);
      if(current&&item) current.textContent=`${stockAt(item,select.value)} ${item.unit}`;
      refreshTransferBalance(host,state,select.dataset.opSource);
    };
  });
  host.querySelectorAll("[data-op-destination]").forEach((select)=>{
    select.onchange=()=>{
      const itemId=select.dataset.opDestination;
      refreshTransferBalance(host,state,itemId);
    };
  });
  host.querySelectorAll("[data-op-return-destination]").forEach((select)=>{
    select.onchange=()=>{ operationSelections(state).returns[select.dataset.opReturnDestination]=select.value; };
  });
  host.querySelectorAll("[data-op-target]").forEach((select)=>{
    select.onchange=()=>syncCrossSiteDestination(host,state,select.dataset.opTarget,select.value);
    syncCrossSiteDestination(host,state,select.dataset.opTarget,select.value);
  });


  host.querySelectorAll("[data-op-submit]").forEach((button)=>{
    button.onclick=async()=>{
      if(!canInventoryEdit()){setMessage(host,t.editRequired,"error");return;}
      const item=state.data?.items.find((entry)=>entry.id===button.dataset.itemId);
      if(!item)return;
      const card=button.closest("[data-op-item]");
      const input=card.querySelector(`[data-op-amount="${CSS.escape(item.id)}"]`);
      const amount=Math.max(1,Number(input?.value)||1);
      const type=button.dataset.opSubmit;
      button.disabled=true;
      setMessage(host,"");

      let result={ok:false};
      if(type==="in"){
        const locationId=card.querySelector("[data-op-destination]")?.value;
        const location=state.data.locations.find((entry)=>entry.id===locationId);
        result=await cloudAdjustQuantity({itemKey:item.itemKey,locationCode:location?.code,direction:"in",amount,note:"進貨入庫 / Nhập kho"});
      }else if(type==="pick"){
        const sourceId=card.querySelector("[data-op-source]")?.value;
        const workId=card.querySelector("[data-op-work-destination]")?.value;
        const source=item.locations.find((entry)=>entry.id===sourceId);
        const work=state.data.workLocations?.find((entry)=>entry.id===workId);
        if(amount>Number(source?.quantity||0)){setMessage(host,t.insufficient,"error");button.disabled=false;return;}
        result=await cloudTransferInventory({
          itemKey:item.itemKey,
          sourceLocationCode:source?.code,
          destinationLocationCode:work?.code,
          amount,
          note:"領貨 / Lấy hàng để sử dụng",
        });
      }else if(type==="ship"){
        if(card.dataset.receiveMode==="manager-required"){setMessage(host,t.needsManagerDestination,"error");button.disabled=false;return;}
        const sourceId=card.querySelector("[data-op-source]")?.value;
        const source=item.locations.find((entry)=>entry.id===sourceId);
        const destinationLocationId=card.querySelector("[data-op-target-location]")?.value;
        if(amount>Number(source?.quantity||0)){setMessage(host,t.insufficient,"error");button.disabled=false;return;}
        result=await directBranchTransfer({
          itemId:item.id,
          sourceLocationId:sourceId,
          destinationLocationId,
          quantity:amount,
          note:"出貨 / Xuất hàng liên cơ sở",
        });
      }else if(type==="transfer"){
        const sourceId=card.querySelector("[data-op-source]")?.value;
        const destinationId=card.querySelector("[data-op-destination]")?.value;
        const source=item.locations.find((entry)=>entry.id===sourceId);
        const destination=state.data.locations.find((entry)=>entry.id===destinationId);
        if(sourceId===destinationId){setMessage(host,t.sameLocation,"error");button.disabled=false;return;}
        if(amount>Number(source?.quantity||0)){setMessage(host,t.insufficient,"error");button.disabled=false;return;}
        result=await cloudTransferInventory({
          itemKey:item.itemKey,
          sourceLocationCode:source?.code,
          destinationLocationCode:destination?.code,
          amount,
          note:"庫存轉撥 / Điều chuyển kho",
        });
      }

      if(result?.ok){
        await syncInventoryNow(site,{reloadBranch:false});
        await doRender(host,state);
        setMessage(host,type==="ship" ? t.shipFixed : t.success,"ok");
        state.onUpdated?.();
      }else{
        setMessage(host,errorText(result?.error,t),"error");
        button.disabled=false;
      }
    };
  });


  host.querySelectorAll("[data-op-use]").forEach((button)=>{
    button.onclick=async()=>{
      if(!canInventoryEdit()){setMessage(host,t.editRequired,"error");return;}
      const item=state.data?.items.find((entry)=>entry.id===button.dataset.opUse);
      const card=button.closest("[data-op-item]");
      const workId=card?.querySelector("[data-op-work-destination]")?.value || workLocationForItem(item,state.data?.workLocations||[])?.id;
      const work=state.data?.workLocations?.find((entry)=>entry.id===workId);
      const input=card?.querySelector(`[data-op-amount="${CSS.escape(item.id+"-use")}"]`);
      const amount=Math.max(1,Number(input?.value)||1);
      const current=Number(workStockAt(item,workId)||0);
      if(amount>current){setMessage(host,t.insufficient,"error");return;}
      button.disabled=true;
      const result=await cloudAdjustQuantity({
        itemKey:item.itemKey,
        locationCode:work?.code,
        direction:"out",
        amount,
        note:"使用 / Sử dụng thực tế",
      });
      if(result?.ok){
        await syncInventoryNow(site,{reloadBranch:false});
        await doRender(host,state);
        setMessage(host,t.success,"ok");
        state.onUpdated?.();
      }else{
        setMessage(host,errorText(result?.error,t),"error");
        button.disabled=false;
      }
    };
  });

  host.querySelectorAll("[data-op-return]").forEach((button)=>{
    button.onclick=async()=>{
      if(!canInventoryEdit()){setMessage(host,t.editRequired,"error");return;}
      const item=state.data?.items.find((entry)=>entry.id===button.dataset.opReturn);
      const card=button.closest("[data-op-item]");
      const workId=card?.querySelector("[data-op-work-destination]")?.value || workLocationForItem(item,state.data?.workLocations||[])?.id;
      const work=state.data?.workLocations?.find((entry)=>entry.id===workId);
      const destinationId=card?.querySelector("[data-op-return-destination]")?.value;
      const destination=state.data?.locations.find((entry)=>entry.id===destinationId);
      if(!destination){setMessage(host,t.failed,"error");return;}
      operationSelections(state).returns[item.id]=destinationId;
      const input=card?.querySelector(`[data-op-amount="${CSS.escape(item.id+"-return")}"]`);
      const amount=Math.max(1,Number(input?.value)||1);
      const current=Number(workStockAt(item,workId)||0);
      if(amount>current){setMessage(host,t.insufficient,"error");return;}
      button.disabled=true;
      const result=await cloudTransferInventory({
        itemKey:item.itemKey,
        sourceLocationCode:work?.code,
        destinationLocationCode:destination?.code,
        amount,
        note:"歸位 / Cất hàng thừa lại kho",
      });
      if(result?.ok){
        await syncInventoryNow(site,{reloadBranch:false});
        await doRender(host,state);
        setMessage(host,`${t.returnedTo} ${locationLabel(destination,language)}`,"ok");
        state.onUpdated?.();
      }else{
        setMessage(host,errorText(result?.error,t),"error");
        button.disabled=false;
      }
    };
  });


}

let activeMount=null;

export async function mountInventoryOperations(host,{
  site,
  mode="in",
  language="vi",
  onUpdated,
}={}){
  if(!host||!site)return;
  if(activeMount?.stopWatch){
    try{await activeMount.stopWatch();}catch{}
  }
  const state={host,site,mode,language,onUpdated,stopWatch:null};
  activeMount=state;
  await doRender(host,state);
  if(activeMount!==state || !host.isConnected) return;
  state.stopWatch=await watchInventoryTransfers(site,()=>{
    if(activeMount===state && host.isConnected) void doRender(host,state);
  });
}

export function operationTabLabels(language="vi"){
  const t=langText(language);
  return {in:t.in,pick:t.pick,transfer:t.transfer,ship:t.ship};
}


function draftItemCard(item,mode,locations,site,language,t){
  return itemCard(item,mode,locations,site,language,t);
}

function bindDraft(host,state){
  const {mode,language}=state;
  const t=langText(language);
  bindQuantity(host);

  host.querySelectorAll("[data-op-source]").forEach((select)=>{
    select.onchange=()=>{
      operationSelections(state).sources[select.dataset.opSource]=select.value;
      const item=state.data?.items.find((entry)=>entry.id===select.dataset.opSource);
      const current=host.querySelector(`[data-op-current="${CSS.escape(select.dataset.opSource)}"]`);
      if(current&&item) current.textContent=`${stockAt(item,select.value)} ${item.unit}`;
      refreshTransferBalance(host,state,select.dataset.opSource);
    };
  });
  host.querySelectorAll("[data-op-destination]").forEach((select)=>{
    select.onchange=()=>refreshTransferBalance(host,state,select.dataset.opDestination);
  });
  host.querySelectorAll("[data-op-return-destination]").forEach((select)=>{
    select.onchange=()=>{ operationSelections(state).returns[select.dataset.opReturnDestination]=select.value; };
  });
  host.querySelectorAll("[data-op-target]").forEach((select)=>{
    select.onchange=()=>syncCrossSiteDestination(host,state,select.dataset.opTarget,select.value);
    syncCrossSiteDestination(host,state,select.dataset.opTarget,select.value);
  });


  host.querySelectorAll("[data-op-submit]").forEach((button)=>{
    button.onclick=async()=>{
      const item=state.data?.items.find((entry)=>entry.id===button.dataset.itemId);
      if(!item)return;
      const card=button.closest("[data-op-item]");
      const input=card.querySelector(`[data-op-amount="${CSS.escape(item.id)}"]`);
      const amount=Math.max(1,Number(input?.value)||1);
      const type=button.dataset.opSubmit;
      const sourceId=card.querySelector("[data-op-source]")?.value || "";
      const destinationId=card.querySelector("[data-op-destination]")?.value || "";
      const target=card.querySelector("[data-op-target]")?.value || "usage";
      const targetLocationId=card.querySelector("[data-op-target-location]")?.value || "";
      const source=item.locations.find((entry)=>entry.id===sourceId);

      if(type==="ship" && card.dataset.receiveMode==="manager-required"){
        setMessage(host,t.needsManagerDestination,"error");
        return;
      }
      if((type==="pick"||type==="ship"||type==="transfer") && amount>Number(source?.quantity||0)){
        setMessage(host,t.insufficient,"error");
        return;
      }
      if(type==="transfer" && sourceId===destinationId){
        setMessage(host,t.sameLocation,"error");
        return;
      }
      button.disabled=true;
      const workLocationId=card.querySelector("[data-op-work-destination]")?.value || "";
      const effectiveDestination = type==="ship" ? targetLocationId
        : type==="pick" ? workLocationId
        : destinationId;
      if((type==="pick"||type==="ship"||type==="transfer") && amount>Number(source?.quantity||0)){
        setMessage(host,t.insufficient,"error");
        button.disabled=false;
        return;
      }
      const result=await state.onApply?.({
        type,
        itemId:item.id,
        itemMeta:{zh:item.zh,vi:item.vi,unit:item.unit,catalogKey:item.catalogKey||item.catalog_key||"",workArea:item.workArea||"noodles"},
        sourceLocationId:sourceId,
        destinationLocationId:effectiveDestination,
        targetSite:target,
        amount,
      });

      if(result?.ok){
        state.data=await state.reload();
        await renderDraft(host,state);
        setMessage(host,type==="ship" ? t.shipFixed : (language==="zh"?"庫存已更新。":"Đã cập nhật tồn kho. · 庫存已更新。"),"ok");
      }else{
        setMessage(host,errorText(result?.error,t),"error");
        button.disabled=false;
      }
    };
  });


  host.querySelectorAll("[data-op-use]").forEach((button)=>{
    button.onclick=async()=>{
      const item=state.data?.items.find((entry)=>entry.id===button.dataset.opUse);
      const card=button.closest("[data-op-item]");
      const workId=card?.querySelector("[data-op-work-destination]")?.value || workLocationForItem(item,state.data?.workLocations||[])?.id || "";
      const input=card?.querySelector(`[data-op-amount="${CSS.escape(item.id+"-use")}"]`);
      const amount=Math.max(1,Number(input?.value)||1);
      const current=Number(workStockAt(item,workId)||0);
      if(amount>current){setMessage(host,t.insufficient,"error");return;}
      button.disabled=true;
      const result=await state.onApply?.({
        type:"use",
        itemId:item.id,
        itemMeta:{zh:item.zh,vi:item.vi,unit:item.unit,catalogKey:item.catalogKey||"",workArea:item.workArea||"noodles"},
        sourceLocationId:workId,
        amount,
      });
      if(result?.ok){
        state.data=await state.reload();
        await renderDraft(host,state);
        setMessage(host,language==="zh"?"庫存已更新。":"Đã cập nhật tồn kho. · 庫存已更新。","ok");
      }else{
        setMessage(host,errorText(result?.error,t),"error");
        button.disabled=false;
      }
    };
  });

  host.querySelectorAll("[data-op-return]").forEach((button)=>{
    button.onclick=async()=>{
      const item=state.data?.items.find((entry)=>entry.id===button.dataset.opReturn);
      const card=button.closest("[data-op-item]");
      const workId=card?.querySelector("[data-op-work-destination]")?.value || workLocationForItem(item,state.data?.workLocations||[])?.id || "";
      const destinationId=card?.querySelector("[data-op-return-destination]")?.value || "";
      const destination=state.data?.locations.find((entry)=>entry.id===destinationId);
      if(!destination){setMessage(host,t.failed,"error");return;}
      operationSelections(state).returns[item.id]=destinationId;
      const input=card?.querySelector(`[data-op-amount="${CSS.escape(item.id+"-return")}"]`);
      const amount=Math.max(1,Number(input?.value)||1);
      const current=Number(workStockAt(item,workId)||0);
      if(amount>current){setMessage(host,t.insufficient,"error");return;}
      button.disabled=true;
      const result=await state.onApply?.({
        type:"return",
        itemId:item.id,
        itemMeta:{zh:item.zh,vi:item.vi,unit:item.unit,catalogKey:item.catalogKey||"",workArea:item.workArea||"noodles"},
        sourceLocationId:workId,
        destinationLocationId:destinationId,
        amount,
      });
      if(result?.ok){
        state.data=await state.reload();
        await renderDraft(host,state);
        setMessage(host,`${t.returnedTo} ${locationLabel(destination,language)}`,"ok");
      }else{
        setMessage(host,errorText(result?.error,t),"error");
        button.disabled=false;
      }
    };
  });


}

async function renderDraft(host,state){
  const t=langText(state.language);
  const data=await state.reload();
  const catalogKeys=[...new Set((data.items||[]).map((item)=>item.catalogKey||item.catalog_key).filter(Boolean))];
  if(!Array.isArray(data.receiveDefaults)){
    try{
      data.receiveDefaults=await getInventoryReceiveDefaults({
        sites:INVENTORY_SITES.map((entry)=>entry.id).filter((site)=>site!==state.site),
        catalogKeys,
      });
    }catch{ data.receiveDefaults=[]; }
  }
  state.data=data;
  const cards=data.items.map((item)=>itemCard(item,state.mode,data.locations,state.site,state.language,t,data.allLocations||data.locations,data.workLocations||[]));
  host.innerHTML=`<section class="inventory-ops-shell draft-operations-shell"><div class="central-draft-banner">${state.language==="zh"?"測試模式：操作立即生效並記錄人員":"Môi trường thử nghiệm: thao tác có hiệu lực ngay và ghi người thực hiện · 測試模式：操作立即生效並記錄人員"}</div><div class="inventory-ops-toolbar"><label class="op-search"><input type="search" placeholder="${esc(t.search)}" data-op-search></label><span class="op-count">${data.items.length}</span></div><div class="inventory-ops-list" data-op-list>${cards.length?cards.join(""):`<p class="inventory-ops-empty">${esc(t.noItems)}</p>`}</div><p class="op-message" data-op-message></p></section>`;
  restoreOperationSelections(host,state);
  bindDraft(host,state);
}

export async function mountDraftInventoryOperations(host,{
  site,
  mode="in",
  language="vi",
  reload,
  onApply,
}={}){
  if(!host||!site||typeof reload!=="function")return;
  const state={site,mode,language,reload,onApply,data:null};
  await renderDraft(host,state);
}
