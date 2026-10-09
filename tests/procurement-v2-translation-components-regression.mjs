import assert from "node:assert/strict";
import fs from "node:fs";
import { TEXT } from "../src/i18n.js";
import {
 procurementCopy,procurementRawCopy,procurementTabs,procurementStat,procurementPanel,
 procurementSettingsModal,procurementProductCard,procurementSupplierCard,procurementFilterBar
} from "../src/procurement-v2-components.js";

const zh=TEXT.zh.procurementUi,vi=TEXT.vi.procurementUi;
assert(zh&&vi,"Procurement UI must use the existing i18n catalog");
const zk=Object.keys(zh).sort(),vk=Object.keys(vi).sort();
assert.deepEqual(zk,vk,"Every Procurement UI key must exist in both languages");
assert(zk.length>=120,"All labels/statuses, not just tab names, must be in catalog");
for(const key of zk){
 assert(typeof zh[key]==="string"&&zh[key].trim(),key+": missing zh-TW copy");
 assert(typeof vi[key]==="string"&&vi[key].trim(),key+": missing Vietnamese copy");
}
assert.equal(procurementCopy("title","zh"),"叫貨管理");
assert.equal(procurementCopy("title","vi"),"叫貨管理 / Quản lý gọi hàng");
assert.equal(procurementRawCopy("title","vi"),"Quản lý gọi hàng");
const nav=procurementTabs("settings","vi");
assert.equal((nav.match(/data-pv2-action="tab"/g)||[]).length,5);
assert.match(nav,/data-tab="settings"/);
assert.match(nav,/Danh sách gọi hàng/);
const stats=procurementStat("needRestock",7,String);
assert.match(stats,/需要補貨/);assert.match(stats,/Cần gọi/);
const panel=procurementPanel({title:"history",body:"CONTENT",language:"vi"});
assert.match(panel,/CONTENT/);assert.match(panel,/Lịch sử gọi hàng/);
const modal=procurementSettingsModal({title:"產品 / Sản phẩm",body:"CONTENT"});
assert.match(modal,/role="dialog" aria-modal="true"/);
assert.match(modal,/data-pv2-form="rule"/);
const filter=procurementFilterBar({language:"vi",search:"cá",supplierFilter:"all",categoryFilter:"all",orderDate:"2026-10-10",suppliers:[],categories:[]});
assert.match(filter,/data-pv2-search/);assert.match(filter,/data-pv2-filter="supplier"/);
assert.match(filter,/data-pv2-filter="category"/);assert.match(filter,/data-pv2-date/);
assert.match(filter,/cá/);
const supplier=procurementSupplierCard({supplier:{id:"id-1",name_zh_tw:"惡意<script>",name_vi:"Nhà cung cấp",closedWeekdays:[],leadDays:2},editable:true,language:"vi"});
assert.doesNotMatch(supplier,/<script>/);assert.match(supplier,/&lt;script&gt;/);
assert.match(supplier,/data-pv2-action="edit-supplier"/);
const item={id:"item-1",name_zh_tw:"鮭魚",name_vi:"Cá hồi",category_code:"fish",unit:"包"};
const card=procurementProductCard({item,rule:null,supplier:null,stock:6,plan:null,selected:false,amount:0},{language:"vi",editable:true,format:String});
assert.match(card,/Cá hồi/);assert.match(card,/鮭魚/);assert.match(card,/data-pv2-qty="item-1"/);
assert.match(card,/6/);assert.match(card,/disabled/);
const css=fs.readFileSync("src/procurement-v2.css","utf8");
assert.equal((css.match(/\{/g)||[]).length,(css.match(/\}/g)||[]).length,
 "CSS blocks must be balanced; an unclosed rule suppresses mobile media queries");
assert.match(css,/\.pv2-shell\{color:[^}]+\}/,
 "Root UI rule must be closed before all responsive component selectors");
assert.match(css,/@media\(max-width:991px\)\{[\s\S]*?\.pv2-shell \.pv2-tabs\{[^}]*flex-wrap:nowrap/,
 "The mobile navigation must remain a single swipeable row");
const main=fs.readFileSync("src/procurement-v2.js","utf8");
for(const token of ["--pv2-primary","--pv2-border","--pv2-font-ui","--pv2-radius-card","--pv2-space-md"])assert(css.includes(token),"missing design token "+token);
assert(css.includes("var(--pv2-primary)"),"styles should consume design tokens");
assert.match(main,/procurementSettingsModal\(/);
assert.match(main,/const P=\(key,lang=ui.language\)=>procurementCopy/);
assert.match(main,/ui\.language=lang/);
assert.doesNotMatch(main,/const all=\[\["list","叫貨清單"/,"must not maintain a duplicate hard-coded tab list");
assert(!main.includes('ui.category="all";ui.tab="list"'),"Tab state must survive asynchronous site reloads");
console.log("PROCUREMENT_TRANSLATION_COMPONENT_CONTRACT_OK");
