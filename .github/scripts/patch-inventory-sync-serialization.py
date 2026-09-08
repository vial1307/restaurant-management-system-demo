from pathlib import Path

path = Path("src/inventory-cloud.js")
source = path.read_text(encoding="utf-8")

old_flag = "let syncing = false;"
new_flag = "let inventorySyncTail = Promise.resolve();"
if source.count(old_flag) != 1:
    raise SystemExit(f"syncing flag count={source.count(old_flag)}")
source = source.replace(old_flag, new_flag)

old_sync = '''export async function syncInventoryNow(site = currentSite(), { reloadBranch = false } = {}) {
  if (!site || syncing || !(await verifyMigration()) || !hasInventoryPermission("view")) return false;
  if (["fuxing","yongji"].includes(site) && !isCurrentBranchInventoryDate()) {
    dispatchStatus("historical-readonly", { site });
    return false;
  }
  syncing = true;
  try {
    const rows = await fetchSite(site);
    const changed = site === "central" ? applyCentral(rows) : applyBranch(rows, site);
    void reloadBranch;
    dispatchStatus("synced", { site, count: rows.length });
    return changed;
  } catch (error) {
    dispatchStatus("error", { site, error: error?.message || String(error) });
    return false;
  } finally {
    syncing = false;
  }
}'''

new_sync = '''async function runInventorySync(site, { reloadBranch = false } = {}) {
  if (!site || !(await verifyMigration()) || !hasInventoryPermission("view")) return false;
  if (["fuxing","yongji"].includes(site) && !isCurrentBranchInventoryDate()) {
    dispatchStatus("historical-readonly", { site });
    return false;
  }
  try {
    const rows = await fetchSite(site);
    const changed = site === "central" ? applyCentral(rows) : applyBranch(rows, site);
    void reloadBranch;
    dispatchStatus("synced", { site, count: rows.length });
    return changed;
  } catch (error) {
    dispatchStatus("error", { site, error: error?.message || String(error) });
    return false;
  }
}

export function syncInventoryNow(site = currentSite(), { reloadBranch = false } = {}) {
  const requestedSite = site;
  const requestedOptions = { reloadBranch: Boolean(reloadBranch) };
  const task = inventorySyncTail.then(() => runInventorySync(requestedSite, requestedOptions));
  inventorySyncTail = task.catch(() => false);
  return task;
}'''

if source.count(old_sync) != 1:
    raise SystemExit(f"sync function anchor count={source.count(old_sync)}")
source = source.replace(old_sync, new_sync)
path.write_text(source, encoding="utf-8")

workflow_path = Path(".github/workflows/deploy-vps.yml")
workflow = workflow_path.read_text(encoding="utf-8")
anchor = "          node tests/vps-business-module-revision-runtime-regression.mjs\n"
addition = anchor + "          node tests/inventory-sync-serialization-regression.mjs\n"
if workflow.count(anchor) != 1:
    raise SystemExit(f"workflow runtime anchor count={workflow.count(anchor)}")
workflow_path.write_text(workflow.replace(anchor, addition), encoding="utf-8")
