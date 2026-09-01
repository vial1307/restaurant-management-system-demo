import { getSupabase, isSupabaseConfigured } from "./supabase-client.js";
import {
  getSiteInventoryRows,
  getSiteLocations,
  syncInventoryNow,
} from "./inventory-cloud.js";

export const INVENTORY_SITES = [
  { id: "central", zh: "央廚", vi: "Bếp trung tâm" },
  { id: "fuxing", zh: "復興店", vi: "Chi nhánh Fuxing" },
  { id: "yongji", zh: "永吉店", vi: "Chi nhánh Yongji" },
];

export function siteLabel(site, language = "vi") {
  const found = INVENTORY_SITES.find((entry) => entry.id === site);
  if (!found) return site;
  return language === "zh" ? found.zh : `${found.vi} · ${found.zh}`;
}

export async function loadSiteOperationData(site) {
  const [rows, locations, ...allSiteLocations] = await Promise.all([
    getSiteInventoryRows(site),
    getSiteLocations(site, "storage"),
    ...INVENTORY_SITES.map((entry)=>getSiteLocations(entry.id,"storage")),
  ]);

  const byItem = new Map();
  for (const row of rows) {
    if (row.location?.kind !== "storage") continue;
    const item = row.item;
    if (!item) continue;
    const current = byItem.get(item.id) || {
      id: item.id,
      itemKey: item.item_key,
      catalogKey: item.catalog_key,
      zh: item.name_zh_tw,
      vi: item.name_vi,
      unit: item.unit,
      locations: [],
      total: 0,
    };
    const quantity = Number(row.quantity) || 0;
    current.locations.push({
      id: row.location.id,
      code: row.location.code,
      zh: row.location.name_zh_tw,
      vi: row.location.name_vi,
      quantity,
      minimum: Number(row.minimum_quantity) || 0,
    });
    current.total += quantity;
    byItem.set(item.id, current);
  }

  return {
    site,
    items: [...byItem.values()].sort((a,b)=>String(a.zh).localeCompare(String(b.zh),"zh-Hant")),
    locations,
    allLocations: INVENTORY_SITES.flatMap((entry,index)=>(allSiteLocations[index]||[]).map((location)=>({...location,site:entry.id}))),
  };
}

export async function directBranchTransfer({
  itemId,
  sourceLocationId,
  destinationLocationId,
  quantity,
  note = "",
}) {
  if (!isSupabaseConfigured()) return { ok:false, error:new Error("SUPABASE_REQUIRED") };
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc("direct_branch_transfer", {
    p_item_id: itemId,
    p_source_location_id: sourceLocationId,
    p_destination_location_id: destinationLocationId,
    p_quantity: Math.max(1,Number(quantity)||1),
    p_note: note,
  });
  if (error) return { ok:false, error };
  if (data?.from_site) await syncInventoryNow(data.from_site,{reloadBranch:false});
  if (data?.to_site) await syncInventoryNow(data.to_site,{reloadBranch:false});
  window.dispatchEvent(new CustomEvent("shitu:inventory-transfer-updated",{detail:{transfer:data}}));
  return { ok:true,data };
}

export async function dispatchBranchShipment({
  itemId,
  sourceLocationId,
  toSite,
  quantity,
  note = "",
}) {
  if (!isSupabaseConfigured()) return { ok:false, error:new Error("SUPABASE_REQUIRED") };
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc("dispatch_branch_shipment", {
    p_item_id: itemId,
    p_source_location_id: sourceLocationId,
    p_to_site: toSite,
    p_quantity: Math.max(1, Number(quantity) || 1),
    p_note: note,
  });
  if (error) return { ok:false, error };
  const fromSite = data?.from_site;
  if (fromSite) await syncInventoryNow(fromSite, { reloadBranch:false });
  window.dispatchEvent(new CustomEvent("shitu:inventory-transfer-updated", { detail:{ site:fromSite, transfer:data } }));
  return { ok:true, data };
}

export async function receiveBranchShipment({
  transferId,
  destinationLocationId,
  site,
}) {
  if (!isSupabaseConfigured()) return { ok:false, error:new Error("SUPABASE_REQUIRED") };
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc("receive_branch_shipment", {
    p_transfer_id: transferId,
    p_destination_location_id: destinationLocationId,
  });
  if (error) return { ok:false, error };
  if (site) await syncInventoryNow(site, { reloadBranch:false });
  window.dispatchEvent(new CustomEvent("shitu:inventory-transfer-updated", { detail:{ site, transfer:data } }));
  return { ok:true, data };
}

export async function cancelBranchShipment(transferId) {
  if (!isSupabaseConfigured()) return { ok:false, error:new Error("SUPABASE_REQUIRED") };
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc("cancel_dispatched_shipment", {
    p_transfer_id: transferId,
  });
  if (error) return { ok:false, error };
  window.dispatchEvent(new CustomEvent("shitu:inventory-transfer-updated", { detail:{ transfer:data } }));
  return { ok:true, data };
}

export async function listShipments(site, {
  direction = "all",
  status = "",
  limit = 100,
} = {}) {
  if (!isSupabaseConfigured()) return [];
  const supabase = await getSupabase();

  let query = supabase
    .from("inventory_transfers")
    .select("id,transfer_no,from_site,to_site,transfer_type,status,note,created_by,dispatched_by,received_by,created_at,dispatched_at,received_at,cancelled_at")
    .order("created_at",{ascending:false})
    .limit(Math.max(1,Math.min(300,Number(limit)||100)));

  if (direction === "incoming") query = query.eq("to_site",site);
  else if (direction === "outgoing") query = query.eq("from_site",site);
  else query = query.or(`from_site.eq.${site},to_site.eq.${site}`);
  if (status) query = query.eq("status",status);

  const { data: transfers, error } = await query;
  if (error || !transfers?.length) return [];

  const ids = transfers.map((entry)=>entry.id);
  const { data: lines } = await supabase
    .from("inventory_transfer_lines")
    .select("id,transfer_id,source_item_id,destination_item_id,source_location_id,destination_location_id,quantity,received_quantity,unit")
    .in("transfer_id",ids);

  const itemIds = [...new Set((lines||[]).flatMap((line)=>[line.source_item_id,line.destination_item_id]).filter(Boolean))];
  const locationIds = [...new Set((lines||[]).flatMap((line)=>[line.source_location_id,line.destination_location_id]).filter(Boolean))];
  const actorIds = [...new Set(transfers.flatMap((entry)=>[entry.created_by,entry.dispatched_by,entry.received_by]).filter(Boolean))];

  const [{ data:items },{ data:locations },{ data:actors }] = await Promise.all([
    itemIds.length ? supabase.from("inventory_items").select("id,name_zh_tw,name_vi,unit,catalog_key").in("id",itemIds) : Promise.resolve({data:[]}),
    locationIds.length ? supabase.from("inventory_locations").select("id,code,name_zh_tw,name_vi,site").in("id",locationIds) : Promise.resolve({data:[]}),
    actorIds.length ? supabase.from("profiles").select("id,display_name,username").in("id",actorIds) : Promise.resolve({data:[]}),
  ]);

  const itemMap = new Map((items||[]).map((entry)=>[entry.id,entry]));
  const locationMap = new Map((locations||[]).map((entry)=>[entry.id,entry]));
  const actorMap = new Map((actors||[]).map((entry)=>[entry.id,entry]));
  const linesByTransfer = new Map();
  for (const line of lines||[]) {
    const arr = linesByTransfer.get(line.transfer_id) || [];
    arr.push({
      ...line,
      sourceItem:itemMap.get(line.source_item_id),
      destinationItem:itemMap.get(line.destination_item_id),
      sourceLocation:locationMap.get(line.source_location_id),
      destinationLocation:locationMap.get(line.destination_location_id),
    });
    linesByTransfer.set(line.transfer_id,arr);
  }

  return transfers.map((entry)=>({
    ...entry,
    lines:linesByTransfer.get(entry.id)||[],
    createdBy:actorMap.get(entry.created_by),
    dispatchedBy:actorMap.get(entry.dispatched_by),
    receivedBy:actorMap.get(entry.received_by),
  }));
}

export async function countPendingIncoming(site) {
  const list = await listShipments(site,{direction:"incoming",status:"dispatched",limit:100});
  return list.length;
}

export async function watchInventoryTransfers(site, onChange) {
  if (!isSupabaseConfigured()) return () => {};
  const supabase = await getSupabase();
  const channel = supabase
    .channel(`kitchen-os-transfers-${site}-${Date.now()}`)
    .on("postgres_changes",{event:"*",schema:"public",table:"inventory_transfers"},(payload)=>{
      const row = payload.new || payload.old || {};
      if (row.from_site===site || row.to_site===site) onChange?.(payload);
    })
    .on("postgres_changes",{event:"*",schema:"public",table:"inventory_transfer_lines"},()=>{
      onChange?.();
    })
    .subscribe();
  return async () => {
    try { await supabase.removeChannel(channel); } catch {}
  };
}
