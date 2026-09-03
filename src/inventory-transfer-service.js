import { vpsDirectTransfer, vpsInventoryDestinations } from "./vps-api.js";
import {
  getInventoryReceiveDefaults,
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

export async function loadSiteOperationData(site, { includeDestinations = false } = {}) {
  const [rows, locations, workLocations] = await Promise.all([
    getSiteInventoryRows(site),
    getSiteLocations(site, "storage"),
    getSiteLocations(site, "work"),
  ]);
  const destinationSites = INVENTORY_SITES.map((entry) => entry.id).filter((target) => target !== site);
  const destinationMetadata = includeDestinations
    ? await vpsInventoryDestinations(site, destinationSites)
    : null;

  const byItem = new Map();
  for (const row of rows) {
    const item = row.item;
    if (!item || !row.location) continue;
    const current = byItem.get(item.id) || {
      id: item.id,
      itemKey: item.item_key,
      catalogKey: item.catalog_key,
      zh: item.name_zh_tw,
      vi: item.name_vi,
      unit: item.unit,
      workArea: item.work_area || "noodles",
      locations: [],
      workLocations: [],
      total: 0,
      workTotal: 0,
    };
    const quantity = Number(row.quantity) || 0;
    const mapped = {
      id: row.location.id,
      code: row.location.code,
      zh: row.location.name_zh_tw,
      vi: row.location.name_vi,
      quantity,
      minimum: Number(row.minimum_quantity) || 0,
    };
    if (row.location.kind === "work") {
      current.workLocations.push(mapped);
      current.workTotal += quantity;
    } else if (row.location.kind === "storage") {
      current.locations.push(mapped);
      current.total += quantity;
    }
    byItem.set(item.id, current);
  }

  const items = [...byItem.values()].sort((a, b) => String(a.zh).localeCompare(String(b.zh), "zh-Hant"));
  const catalogKeys = [...new Set(items.map((item) => item.catalogKey).filter(Boolean))];
  let receiveDefaults = [];
  if (includeDestinations) {
    receiveDefaults = await getInventoryReceiveDefaults({ sites: destinationSites, catalogKeys }).catch(() => []);
  }

  return {
    site,
    items,
    locations,
    workLocations,
    receiveDefaults,
    destinationCatalog: destinationMetadata?.catalog || [],
    allLocations: includeDestinations
      ? destinationMetadata?.locations || []
      : locations.map((location) => ({ ...location, site })),
  };
}

export async function directBranchTransfer({
  itemId,
  sourceLocationId,
  destinationLocationId,
  quantity,
  note = "",
}) {
  try {
    const data = await vpsDirectTransfer({
      itemId,
      sourceLocationId,
      destinationLocationId,
      quantity: Math.max(1, Number(quantity) || 1),
      note,
    });
    if (data?.from_site) await syncInventoryNow(data.from_site, { reloadBranch: false });
    if (data?.to_site) await syncInventoryNow(data.to_site, { reloadBranch: false });
    window.dispatchEvent(new CustomEvent("shitu:inventory-transfer-updated", { detail: { transfer: data } }));
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error };
  }
}

// VPS uses immediate atomic transfers. Cross-device convergence is handled by
// focus/visibility refresh and the inventory polling loop.
export async function watchInventoryTransfers() {
  return () => {};
}
