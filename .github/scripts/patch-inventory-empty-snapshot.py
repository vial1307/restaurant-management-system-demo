from pathlib import Path

path = Path("src/inventory-cloud.js")
source = path.read_text(encoding="utf-8")

old_fetch = '''  const result = await vpsInventory(site);
  const locations = result?.locations || [];
  const stocks = result?.stock || [];
  const items = result?.items || [];

  if (!locations.length || !stocks.length || !items.length) return [];

  cache.locationsByCode.clear();
  for (const loc of locations) cache.locationsByCode.set(loc.code, loc);

  const catalogKeys=[...new Set(items.map((item)=>item.catalog_key).filter(Boolean))];
  let receiveDefaults=[];
  try{ receiveDefaults=await getInventoryReceiveDefaults({sites:[site],catalogKeys}); }catch{}
  const defaultByCatalog=new Map(receiveDefaults.map((entry)=>[entry.catalogKey,entry.locationCode]));
  for(const item of items) item.receive_default_location_code=defaultByCatalog.get(item.catalog_key)||"";

  const itemMap = new Map(items.map((item) => [item.id, item]));
  cache.itemsByKey.clear();
  for (const item of items) if (item.item_key) cache.itemsByKey.set(item.item_key, item);
  const locMap = new Map(locations.map((loc) => [loc.id, loc]));

  return stocks.map((stock) => ({
    ...stock,
    item: itemMap.get(stock.item_id),
    location: locMap.get(stock.location_id),
  })).filter((row) => row.item && row.location);'''

new_fetch = '''  const result = await vpsInventory(site);
  const locations = Array.isArray(result?.locations) ? result.locations : null;
  const stocks = Array.isArray(result?.stock) ? result.stock : null;
  const items = Array.isArray(result?.items) ? result.items : null;

  if (!locations || !stocks || !items) throw new Error("INVENTORY_SNAPSHOT_INVALID");

  cache.locationsByCode.clear();
  cache.itemsByKey.clear();

  // A complete snapshot with no stock rows is authoritative: local mirrors
  // must be allowed to become empty. Non-empty stock requires valid master data.
  if (!stocks.length) return [];
  if (!locations.length || !items.length) throw new Error("INVENTORY_SNAPSHOT_INVALID");

  for (const loc of locations) cache.locationsByCode.set(loc.code, loc);

  const catalogKeys=[...new Set(items.map((item)=>item.catalog_key).filter(Boolean))];
  let receiveDefaults=[];
  try{ receiveDefaults=await getInventoryReceiveDefaults({sites:[site],catalogKeys}); }catch{}
  const defaultByCatalog=new Map(receiveDefaults.map((entry)=>[entry.catalogKey,entry.locationCode]));
  for(const item of items) item.receive_default_location_code=defaultByCatalog.get(item.catalog_key)||"";

  const itemMap = new Map(items.map((item) => [item.id, item]));
  for (const item of items) if (item.item_key) cache.itemsByKey.set(item.item_key, item);
  const locMap = new Map(locations.map((loc) => [loc.id, loc]));

  const rows = stocks.map((stock) => ({
    ...stock,
    item: itemMap.get(stock.item_id),
    location: locMap.get(stock.location_id),
  })).filter((row) => row.item && row.location);
  if (rows.length !== stocks.length) throw new Error("INVENTORY_SNAPSHOT_INVALID");
  return rows;'''

if source.count(old_fetch) != 1:
    raise SystemExit(f"fetchSite anchor count={source.count(old_fetch)}")
source = source.replace(old_fetch, new_fetch)

old_central = '''function applyCentral(rows) {
  if (!rows.length) return false;
  const previous = readJson(CENTRAL_KEY, []);'''
new_central = '''function applyCentral(rows) {
  const previous = readJson(CENTRAL_KEY, []);'''
if source.count(old_central) != 1:
    raise SystemExit(f"applyCentral anchor count={source.count(old_central)}")
source = source.replace(old_central, new_central)

old_branch = '''function applyBranch(rows, site) {
  if (!rows.length || !["fuxing","yongji"].includes(site)) return false;'''
new_branch = '''function applyBranch(rows, site) {
  if (!["fuxing","yongji"].includes(site)) return false;'''
if source.count(old_branch) != 1:
    raise SystemExit(f"applyBranch anchor count={source.count(old_branch)}")
source = source.replace(old_branch, new_branch)

path.write_text(source, encoding="utf-8")
