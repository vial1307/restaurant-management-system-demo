import {
  canInventoryEdit,
  cloudAdjustQuantity,
  cloudTransferInventory,
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
    out:"Xuất kho · 領料／出庫",
    transfer:"Điều chuyển · 庫存轉撥",
    search:"Tìm / 中文 / Tiếng Việt / Pinyin / 注音…",
    from:"Từ kho · 來源儲位",
    to:"Đến · 目的地",
    destination:"Kho nhận · 目的儲位",
    current:"Hiện có · 現有庫存",
    quantity:"Số lượng · 數量",
    inbound:"Nhập · 入庫",
    outbound:"Xuất · 出庫",
    move:"Chuyển · 轉撥",
    ship:"Xuất chi nhánh · 分店出貨",
    usage:"Sử dụng / tiêu hao · 使用／耗用",
    noItems:"Không có mặt hàng phù hợp · 沒有符合條件的品項",
    loading:"Đang tải dữ liệu kho… · 正在載入庫存…",
    cloudRequired:"Cần bật đồng bộ Supabase kho trước khi thao tác. · 請先啟用 Supabase 庫存同步。",
    editRequired:"Tài khoản này chỉ có quyền xem kho. · 此帳號僅能查看庫存。",
    success:"Đã cập nhật kho · 庫存已更新",
    insufficient:"Số lượng xuất lớn hơn tồn hiện tại. · 出庫數量超過現有庫存。",
    sameLocation:"Kho nguồn và kho đích phải khác nhau. · 來源與目的儲位不可相同。",
    failed:"Không thể cập nhật dữ liệu cloud. · 雲端庫存更新失敗。",
    transferNo:"Phiếu · 單號",
  },
  zh: {
    in:"進貨入庫",out:"領料／出庫",transfer:"庫存轉撥",
    search:"搜尋品項 / Pinyin / 注音…",from:"來源儲位",to:"目的地",destination:"目的儲位",
    current:"現有庫存",quantity:"數量",inbound:"入庫",outbound:"出庫",move:"轉撥",ship:"分店出貨",
    usage:"使用／耗用",noItems:"沒有符合條件的品項",
    loading:"正在載入庫存…",
    cloudRequired:"請先啟用 Supabase 庫存同步。",editRequired:"此帳號僅能查看庫存。",
    success:"庫存已更新",insufficient:"出庫數量超過現有庫存。",sameLocation:"來源與目的儲位不可相同。",
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

function overviewCard(item,language,t){
  const locations=item.locations
    .filter((loc)=>Number(loc.quantity)!==0 || Number(loc.minimum)!==0)
    .map((loc)=>`<span class="op-location-pill"><small>${esc(language==="zh"?loc.zh:`${loc.vi||loc.zh} · ${loc.zh}`)}</small><strong>${Number(loc.quantity||0)} ${esc(item.unit)}</strong></span>`)
    .join("");
  return `<article class="inventory-op-card inventory-overview-card" data-op-item="${esc(item.id)}">
    <div class="op-item-head"><div><strong>${esc(item.zh)}</strong><small>${esc(item.vi||"")}</small></div><span><small>${esc(t.current)}</small><strong>${Number(item.total||0)} ${esc(item.unit)}</strong></span></div>
    <div class="op-location-list">${locations||'<span class="op-location-pill"><small>—</small><strong>0</strong></span>'}</div>
  </article>`;
}

function itemCard(item,mode,locations,site,language,t,allLocations=locations){
  const firstSource=item.locations.find((loc)=>Number(loc.quantity)>0) || item.locations[0];
  const firstDestination=locations.find((loc)=>loc.id!==firstSource?.id) || locations[0];
  const otherSites=INVENTORY_SITES.filter((entry)=>site==="central" ? ["fuxing","yongji"].includes(entry.id) : entry.id==="central");
  const sourceSelect = `<label><span>${esc(t.from)}</span><select data-op-source="${esc(item.id)}">${sourceOptions(item,language)}</select></label>`;
  const destinationSelect = `<label><span>${esc(t.destination)}</span><select data-op-destination="${esc(item.id)}">${locationOptions(locations,language,firstDestination?.id)}</select></label>`;
  const outboundDestination = `<label><span>${esc(t.to)}</span><select data-op-target="${esc(item.id)}"><option value="usage">${esc(t.usage)}</option>${otherSites.map((entry)=>`<option value="${entry.id}">${esc(siteLabel(entry.id,language))}</option>`).join("")}</select></label>`;
  const crossSiteLocations=(allLocations||[]).filter((location)=>location.site&&location.site!==site);
  const targetLocationSelect=`<label class="op-target-location" data-op-target-location-wrap="${esc(item.id)}" hidden><span>${esc(t.destination)}</span><select data-op-target-location="${esc(item.id)}">${crossSiteLocations.map((location)=>`<option value="${esc(location.id)}" data-site="${esc(location.site)}">${esc(siteLabel(location.site,language))} · ${esc(locationLabel(location,language))}</option>`).join("")}</select></label>`;
  const inboundDestination = `<label><span>${esc(t.destination)}</span><select data-op-destination="${esc(item.id)}">${locationOptions(locations,language,item.locations[0]?.id || locations[0]?.id)}</select></label>`;

  let controls="";
  let action="";
  if(mode==="in"){
    controls=inboundDestination;
    action=`<button class="op-primary" data-op-submit="in" data-item-id="${esc(item.id)}">${esc(t.inbound)}</button>`;
  }else if(mode==="out"){
    controls=sourceSelect+outboundDestination+targetLocationSelect;
    action=`<button class="op-primary op-out" data-op-submit="out" data-item-id="${esc(item.id)}" ${firstSource?"":"disabled"}>${esc(t.outbound)}</button>`;
  }else{
    controls=sourceSelect+destinationSelect;
    action=`<button class="op-primary" data-op-submit="transfer" data-item-id="${esc(item.id)}" ${firstSource?"":"disabled"}>${esc(t.move)}</button>`;
  }

  const transferBalance = mode==="transfer" && firstSource && firstDestination
    ? `<div class="op-transfer-balance" data-op-transfer-balance="${esc(item.id)}"><span>${esc(locationLabel({name_zh_tw:firstSource.zh,name_vi:firstSource.vi},language))} <strong>${Number(firstSource.quantity)||0}</strong></span><b>→</b><span>${esc(locationLabel(firstDestination,language))} <strong>${Number(stockAt(item,firstDestination.id))||0}</strong></span></div>`
    : "";
  return `<article class="inventory-op-card" data-op-item="${esc(item.id)}">
    <div class="op-item-head"><div><strong>${esc(item.zh)}</strong><small>${esc(item.vi || "")}</small></div><span><small>${esc(t.current)}</small><strong data-op-current="${esc(item.id)}">${Number(item.total||0)} ${esc(item.unit)}</strong></span></div>
    <div class="op-select-grid">${controls}</div>
    ${transferBalance}
    <div class="op-action-row">${qtyControl(item.id)}${action}</div>
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
      : data.items.map((item)=>itemCard(item,mode,data.locations,site,language,t,data.allLocations||data.locations));
    host.innerHTML=`<section class="inventory-ops-shell"><div class="inventory-ops-toolbar"><label class="op-search"><input type="search" placeholder="${esc(t.search)}" data-op-search></label><span class="op-count">${data.items.length}</span></div><div class="inventory-ops-list" data-op-list>${data.items.length?cards.join(""):`<p class="inventory-ops-empty">${esc(t.noItems)}</p>`}</div><p class="op-message" data-op-message></p></section>`;
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

function syncCrossSiteDestination(host,itemId,targetSite){
  const card=host.querySelector(`[data-op-item="${CSS.escape(itemId)}"]`);
  const wrap=card?.querySelector(`[data-op-target-location-wrap="${CSS.escape(itemId)}"]`);
  const select=card?.querySelector(`[data-op-target-location="${CSS.escape(itemId)}"]`);
  if(!wrap||!select)return;
  if(!targetSite||targetSite==="usage"){
    wrap.hidden=true;
    return;
  }
  wrap.hidden=false;
  let first="";
  [...select.options].forEach((option)=>{
    const active=option.dataset.site===targetSite;
    option.disabled=!active;
    option.hidden=!active;
    if(active&&!first)first=option.value;
  });
  if(first)select.value=first;
}

function setMessage(host,text,kind=""){
  const node=host.querySelector("[data-op-message]");
  if(!node) return;
  node.textContent=text||"";
  node.className=`op-message ${kind}`;
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
  host.querySelectorAll("[data-op-target]").forEach((select)=>{
    select.onchange=()=>syncCrossSiteDestination(host,select.dataset.opTarget,select.value);
    syncCrossSiteDestination(host,select.dataset.opTarget,select.value);
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
      }else if(type==="out"){
        const sourceId=card.querySelector("[data-op-source]")?.value;
        const source=item.locations.find((entry)=>entry.id===sourceId);
        const target=card.querySelector("[data-op-target]")?.value || "usage";
      const targetLocationId=card.querySelector("[data-op-target-location]")?.value || "";
        if(amount>Number(source?.quantity||0)){setMessage(host,t.insufficient,"error");button.disabled=false;return;}
        if(target==="usage"){
          result=await cloudAdjustQuantity({itemKey:item.itemKey,locationCode:source?.code,direction:"out",amount,note:"領料／耗用 / Xuất dùng"});
        }else{
          const destinationLocationId=card.querySelector("[data-op-target-location]")?.value;
          result=await directBranchTransfer({
            itemId:item.id,
            sourceLocationId:sourceId,
            destinationLocationId,
            quantity:amount,
            note:"分店直接轉撥 / Điều chuyển trực tiếp giữa cơ sở",
          });
        }
      }else if(type==="transfer"){
        const sourceId=card.querySelector("[data-op-source]")?.value;
        const destinationId=card.querySelector("[data-op-destination]")?.value;
        const source=item.locations.find((entry)=>entry.id===sourceId);
        const destination=state.data.locations.find((entry)=>entry.id===destinationId);
        if(sourceId===destinationId){setMessage(host,t.sameLocation,"error");button.disabled=false;return;}
        if(amount>Number(source?.quantity||0)){setMessage(host,t.insufficient,"error");button.disabled=false;return;}
        result=await cloudTransferInventory({itemKey:item.itemKey,sourceLocationCode:source?.code,destinationLocationCode:destination?.code,amount,note:"庫存轉撥 / Điều chuyển kho"});
      }

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
  return {in:t.in,out:t.out,transfer:t.transfer};
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
      const item=state.data?.items.find((entry)=>entry.id===select.dataset.opSource);
      const current=host.querySelector(`[data-op-current="${CSS.escape(select.dataset.opSource)}"]`);
      if(current&&item) current.textContent=`${stockAt(item,select.value)} ${item.unit}`;
      refreshTransferBalance(host,state,select.dataset.opSource);
    };
  });
  host.querySelectorAll("[data-op-destination]").forEach((select)=>{
    select.onchange=()=>refreshTransferBalance(host,state,select.dataset.opDestination);
  });
  host.querySelectorAll("[data-op-target]").forEach((select)=>{
    select.onchange=()=>syncCrossSiteDestination(host,select.dataset.opTarget,select.value);
    syncCrossSiteDestination(host,select.dataset.opTarget,select.value);
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

      if((type==="out"||type==="transfer") && amount>Number(source?.quantity||0)){
        setMessage(host,t.insufficient,"error");
        return;
      }
      if(type==="transfer" && sourceId===destinationId){
        setMessage(host,t.sameLocation,"error");
        return;
      }
      button.disabled=true;
      const result=await state.onApply?.({
        type:type==="out"&&target!=="usage"?"ship":type,
        itemId:item.id,
        itemMeta:{zh:item.zh,vi:item.vi,unit:item.unit,catalogKey:item.catalogKey||item.catalog_key||""},
        sourceLocationId:sourceId,
        destinationLocationId:type==="out"&&target!=="usage"?targetLocationId:destinationId,
        targetSite:target,
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


}

async function renderDraft(host,state){
  const t=langText(state.language);
  const data=await state.reload();
  state.data=data;
  const cards=data.items.map((item)=>itemCard(item,state.mode,data.locations,state.site,state.language,t,data.allLocations||data.locations));
  host.innerHTML=`<section class="inventory-ops-shell draft-operations-shell"><div class="central-draft-banner">${state.language==="zh"?"測試模式：操作立即生效並記錄人員":"Môi trường thử nghiệm: thao tác có hiệu lực ngay và ghi người thực hiện · 測試模式：操作立即生效並記錄人員"}</div><div class="inventory-ops-toolbar"><label class="op-search"><input type="search" placeholder="${esc(t.search)}" data-op-search></label><span class="op-count">${data.items.length}</span></div><div class="inventory-ops-list" data-op-list>${cards.length?cards.join(""):`<p class="inventory-ops-empty">${esc(t.noItems)}</p>`}</div><p class="op-message" data-op-message></p></section>`;
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
