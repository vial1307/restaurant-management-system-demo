import assert from "node:assert/strict";
import fs from "node:fs";

const app=fs.readFileSync("src/app.js","utf8");
const cloud=fs.readFileSync("src/inventory-cloud.js","utf8");
const styles=fs.readFileSync("src/styles.css","utf8");
const readModel=fs.readFileSync("vps/backend/src/inventory-read-model.mjs","utf8");

assert.match(
  app,
  /const visible=product\.locations\.length>=3 \? product\.locations\.slice\(0,2\) : product\.locations;/,
  "3+ locations must render the first 2 chips before Xem thêm"
);
assert.match(
  app,
  /product\.locations\.length>=3[\s\S]{0,260}?查看更多[\s\S]{0,80}?Xem thêm/,
  "3+ locations must expose Xem thêm / 查看更多"
);
assert.match(
  app,
  /const priority=\(row\)=>row\.isPrimary \? 0 : row\.kind==="work" \? 1 : 2;/,
  "location ordering must remain Primary -> Work -> Other"
);
assert.match(
  app,
  /class="inventory-row inventory-product-row"/,
  "one product must render as one Inventory row/card"
);
assert.match(
  app,
  /class="inventory-detail-sheet"[\s\S]{0,250}?role="dialog"/,
  "product/location chip must open the dedicated detail sheet"
);
assert.match(
  styles,
  /@media\(max-width:[^)]+\)[\s\S]*?\.inventory-detail-sheet\{position:fixed;inset:0;width:100%;max-width:none;height:100dvh/,
  "mobile Inventory detail must become full-screen"
);
assert.match(
  app,
  /canInventoryAction\("inventory\.quantity\.adjust_quick",scope\)/,
  "quick plus/minus controls must use granular DB permission"
);
assert.match(
  app,
  /canInventoryAction\("inventory\.quantity\.set_absolute",scope\)/,
  "direct quantity editing must use granular DB permission"
);
assert.match(
  app,
  /canInventoryAction\("inventory\.minimum\.edit",scope\)/,
  "minimum editing must use granular DB permission"
);

assert.match(
  app,
  /function inventoryLowStockAlertCenter\(products, context\)/,
  "Inventory must expose a dedicated low-stock notification center"
);
assert.match(
  app,
  /function inventoryAlertRows\(products\)[\s\S]*?inventoryLocationState\(location\)/,
  "low-stock notifications must derive from the same per-location database-backed thresholds as Inventory status"
);
assert.match(
  app,
  /data-action="select-inventory-alert-filter"/,
  "low-stock center must expose severity filters"
);
assert.match(
  app,
  /data-mode="alerts"/,
  "Inventory overview must expose the notification center"
);
for(const field of ["minimumEnabled","warningEnabled","warningQuantity"]){
  assert(app.includes(field), `${field} must remain part of low-stock rendering`);
}


const actionBlock=app.slice(
  app.indexOf("function inventoryProductActions"),
  app.indexOf("function inventoryProductRow")
);
assert.match(actionBlock,/inventory\.product\.identity\.edit/);
assert.match(actionBlock,/inventory\.transfer\.cross_site/);
assert.match(actionBlock,/inventory\.product\.archive/);
assert.doesNotMatch(
  actionBlock,
  /user\.role|role\s*===|manager|admin/,
  "Inventory action menu must not derive authority from job title"
);

for(const field of ["unit_code","category_code","primary_location_code","receive_default_location_code"]){
  assert(
    cloud.includes(field) || readModel.includes(field),
    `${field} must stay database-backed`
  );
}

assert.match(app,/name="primaryZone"/,"Add/Edit Product must expose Primary Location");
assert.match(app,/name="receiveZone"/,"Add/Edit Product must expose Receive Default");
assert.match(
  app,
  /Nếu chỉ có 1 vị trí hệ thống tự chọn/,
  "Receive Default UX explanation must stay explicit"
);

console.log("INVENTORY_MULTILOCATION_PRODUCTION_CONTRACT_OK");
