import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT=path.resolve(new URL("..",import.meta.url).pathname);
const read=(file)=>fs.readFileSync(path.join(ROOT,file),"utf8");

const backend=read("vps/backend/src/super-admin-routes.mjs");
const frontend=read("src/admin-panel.js");

const backendDataset=backend.slice(
  backend.indexOf('"inventory-products": {'),
  backend.indexOf('"sop-documents": {')
);
assert.match(backendDataset,/editable:\["item_key","catalog_key","name_vi","name_zh_tw","unit","work_area","storage_only"\]/);
assert.doesNotMatch(backendDataset,/archive:\s*\{/,"generic Super Admin inventory dataset must not own archive lifecycle");

const backendPolicy=backend.slice(
  backend.indexOf('"inventory-products": {',backend.indexOf("const DATASET_POLICY")),
  backend.indexOf('"sop-documents": {',backend.indexOf("const DATASET_POLICY"))
);
assert.match(backendPolicy,/allowCreate:false/);
assert.match(backendPolicy,/lifecycleManaged:true/);
assert.match(backend,/allowCreate:DATASET_POLICY\[name\]\?\.allowCreate !== false/);
assert.match(backend,/allowArchive:Boolean\(config\.archive\)/);
assert.match(backend,/ADMIN_INVENTORY_LIFECYCLE_MANAGED/);

const frontendDataset=frontend.slice(
  frontend.indexOf('"inventory-products":{'),
  frontend.indexOf('"sop-documents":{')
);
assert.doesNotMatch(frontendDataset,/\["active"/,"generic Super Admin inventory editor must not render active lifecycle control");
assert.match(frontend,/const allowCreate=result \? result\.allowCreate!==false/);
assert.match(frontend,/const allowArchive=result \? result\.allowArchive!==false/);
assert.match(frontend,/Inventory lifecycle được quản lý tại module Kho/);
assert.match(frontend,/if\(!row && state\.data\.result\?\.allowCreate===false\)return;/);

console.log("SUPER_ADMIN_INVENTORY_LIFECYCLE_CONTRACT_OK");
