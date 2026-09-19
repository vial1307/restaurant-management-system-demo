import assert from "node:assert/strict";
import { STORAGE_KEY } from "../src/store-core.js";

const AUTH_KEY = "shitu-kitchen-auth-v1";
const CLOUD_FLAG_KEY = "shitu-inventory-cloud-v2";
const CLOUD_SCHEMA_VERSION_KEY = "shitu-inventory-cloud-schema-version";
const ACTIVE_SITE_KEY = "shitu-admin-active-site-v1";
const SNAPSHOT_PREFIX = "shitu-inventory-branch-snapshot-v1:";

const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;

const storage = new Map([
  [AUTH_KEY, JSON.stringify({
    id:"site-switch-admin",
    role:"admin",
    accountRole:"admin",
    location:"all",
    permissions:{ inventory:{ view:true, edit:true } },
  })],
  [CLOUD_FLAG_KEY,"ready"],
  [CLOUD_SCHEMA_VERSION_KEY,"12"],
  [ACTIVE_SITE_KEY,"fuxing"],
  [STORAGE_KEY, JSON.stringify({
    selectedDate:today,
    records:{
      [today]:{
        inventorySite:"fuxing",
        inventory:[{id:"fx-old",stockKey:"beef",label:"Fuxing old",zone:"large-freezer",quantity:5}],
        workInventory:[],
      },
    },
  })],
]);

const previous = new Map(
  ["localStorage","window","document","navigator","CustomEvent","fetch"]
    .map((name)=>[name,Object.getOwnPropertyDescriptor(globalThis,name)])
);

Object.defineProperty(globalThis,"localStorage",{
  configurable:true,
  value:{
    getItem(key){ return storage.has(key)?storage.get(key):null; },
    setItem(key,value){ storage.set(key,String(value)); },
    removeItem(key){ storage.delete(key); },
  },
});
const events=[];
Object.defineProperty(globalThis,"window",{
  configurable:true,
  value:{
    location:{hostname:"82.47.180.185",protocol:"http:"},
    addEventListener(){},
    dispatchEvent(event){ events.push({type:event.type,detail:event.detail}); return true; },
    setTimeout:globalThis.setTimeout,
    clearTimeout:globalThis.clearTimeout,
    setInterval(){ return 0; },
  },
});
Object.defineProperty(globalThis,"document",{
  configurable:true,
  value:{
    documentElement:{dataset:{vpsAuthReady:"true"}},
    visibilityState:"visible",
    addEventListener(){},
    querySelector(){ return null; },
  },
});
Object.defineProperty(globalThis,"navigator",{configurable:true,value:{onLine:true}});
class TestCustomEvent {
  constructor(type,options={}){ this.type=type; this.detail=options.detail; }
}
Object.defineProperty(globalThis,"CustomEvent",{configurable:true,value:TestCustomEvent});

const sites=[
  {code:"central",name_vi:"Central",name_zh_tw:"央廚",sort_order:10,metadata:{inventory_mode:"central"}},
  {code:"fuxing",name_vi:"Fuxing",name_zh_tw:"復興店",sort_order:20,metadata:{inventory_mode:"branch"}},
  {code:"yongji",name_vi:"Yongji",name_zh_tw:"永吉店",sort_order:30,metadata:{inventory_mode:"branch"}},
];

function master(site){
  return {
    site:sites.find((row)=>row.code===site),
    locations:[
      {id:`${site}-loc-freezer`,code:`${site}-large-freezer`,site,kind:"storage",sort_order:10,active:true,name_zh_tw:"大冷凍",name_vi:"Tủ đông lớn",metadata:{ui_key:"large-freezer",storage_group:"primary"}},
      {id:`${site}-loc-four`,code:`${site}-four-door`,site,kind:"storage",sort_order:20,active:true,name_zh_tw:"四門冰箱",name_vi:"Tủ 4 cánh",metadata:{ui_key:"four-door",storage_group:"service"}},
      {id:`${site}-work-noodles-id`,code:`${site}-work-noodles`,site,kind:"work",sort_order:100,active:true,name_zh_tw:"麵區",name_vi:"Khu mì",metadata:{ui_key:"noodles",work_area:"noodles"}},
    ],
    workAreas:[{code:"noodles",site_code:site,name_zh_tw:"麵區",name_vi:"Khu mì",sort_order:10,active:true,metadata:{}}],
  };
}

function inventoryPayload(site, quantity){
  const itemId=`${site}-item-beef`;
  return {
    site,
    items:[{
      id:itemId,item_key:`${site}:beef`,catalog_key:"beef",
      name_zh_tw:"牛肉",name_vi:"Thịt bò",unit:"包",work_area:"noodles",storage_only:false,active:true,
    }],
    locations:master(site).locations,
    stock:[
      {item_id:itemId,location_id:`${site}-loc-freezer`,quantity,minimum_quantity:1},
      {item_id:itemId,location_id:`${site}-loc-four`,quantity:0,minimum_quantity:0},
      {item_id:itemId,location_id:`${site}-work-noodles-id`,quantity:0,minimum_quantity:0},
    ],
    receiveDefaults:[],
  };
}

let releaseYongji;
let yongjiStarted=false;
let failYongji=false;
Object.defineProperty(globalThis,"fetch",{
  configurable:true,
  value:async(path,options={})=>{
    const url=String(path);
    const method=String(options.method||"GET").toUpperCase();
    if(method!=="GET") throw new Error(`Unexpected mutation: ${method} ${url}`);
    if(url==="/api/inventory/schema-version") return new Response(JSON.stringify({version:12}),{status:200,headers:{"content-type":"application/json"}});
    if(url==="/api/inventory/sites") return new Response(JSON.stringify({sites}),{status:200,headers:{"content-type":"application/json"}});
    const masterMatch=url.match(/^\/api\/master-data\/(fuxing|yongji)$/);
    if(masterMatch) return new Response(JSON.stringify(master(masterMatch[1])),{status:200,headers:{"content-type":"application/json"}});
    if(url==="/api/inventory/yongji"){
      yongjiStarted=true;
      await new Promise((resolve)=>{ releaseYongji=resolve; });
      if(failYongji) return new Response(JSON.stringify({error:"TEST_YONGJI_FAILURE"}),{status:500,headers:{"content-type":"application/json"}});
      return new Response(JSON.stringify(inventoryPayload("yongji",22)),{status:200,headers:{"content-type":"application/json"}});
    }
    if(url==="/api/inventory/fuxing") return new Response(JSON.stringify(inventoryPayload("fuxing",11)),{status:200,headers:{"content-type":"application/json"}});
    throw new Error(`Unexpected request: ${method} ${url}`);
  },
});

const delay=(ms=0)=>new Promise((resolve)=>setTimeout(resolve,ms));
function restore(name){
  const descriptor=previous.get(name);
  if(descriptor) Object.defineProperty(globalThis,name,descriptor);
  else delete globalThis[name];
}

try{
  const cloud=await import(`../src/inventory-cloud.js?site-switch-isolation=${Date.now()}`);

  const switching=cloud.switchActiveInventorySite("yongji");
  for(let i=0;i<50&&!yongjiStarted;i+=1) await delay(1);
  assert.equal(yongjiStarted,true,"Yongji authoritative fetch never started");
  assert.equal(storage.get(ACTIVE_SITE_KEY),"fuxing","active site changed before Yongji snapshot finished");
  const whileLoading=JSON.parse(storage.get(STORAGE_KEY));
  assert.equal(whileLoading.records[today].inventorySite,"fuxing","shared record changed site while target snapshot was loading");
  assert(
    whileLoading.records[today].inventory.every((row)=>Number(row.quantity)!==22),
    "Yongji inventory leaked into the Fuxing record while target snapshot was loading"
  );

  releaseYongji();
  assert.equal(await switching,true);
  assert.equal(storage.get(ACTIVE_SITE_KEY),"yongji");
  const afterSwitch=JSON.parse(storage.get(STORAGE_KEY));
  assert.equal(afterSwitch.records[today].inventorySite,"yongji");
  assert.equal(afterSwitch.records[today].inventory.find((row)=>row.stockKey==="beef"&&row.zone==="large-freezer")?.quantity,22);

  const yjMirror=cloud.inventoryBranchSnapshot("yongji");
  assert.equal(yjMirror.site,"yongji");
  assert.equal(yjMirror.inventory.find((row)=>row.stockKey==="beef"&&row.zone==="large-freezer")?.quantity,22);

  const back=await cloud.switchActiveInventorySite("fuxing");
  assert.equal(back,true);
  assert.equal(storage.get(ACTIVE_SITE_KEY),"fuxing");
  const fxMirror=cloud.inventoryBranchSnapshot("fuxing");
  assert.equal(fxMirror.inventory.find((row)=>row.stockKey==="beef"&&row.zone==="large-freezer")?.quantity,11);
  assert.equal(cloud.inventoryBranchSnapshot("yongji").inventory.find((row)=>row.stockKey==="beef"&&row.zone==="large-freezer")?.quantity,22,"Fuxing hydrate mutated Yongji mirror");

  // A failed target hydrate must leave the current site and its mirror untouched.
  failYongji=true;
  yongjiStarted=false;
  releaseYongji=undefined;
  const failed=cloud.switchActiveInventorySite("yongji");
  for(let i=0;i<50&&!yongjiStarted;i+=1) await delay(1);
  releaseYongji();
  assert.equal(await failed,false);
  assert.equal(storage.get(ACTIVE_SITE_KEY),"fuxing","failed Yongji switch replaced the active Fuxing site");
  assert.equal(cloud.inventoryBranchSnapshot("fuxing").inventory.find((row)=>row.stockKey==="beef"&&row.zone==="large-freezer")?.quantity,11);
  assert.equal(cloud.inventoryBranchSnapshot("yongji").inventory.find((row)=>row.stockKey==="beef"&&row.zone==="large-freezer")?.quantity,22);

  assert(events.some((event)=>event.type==="shitu:active-site-changing"));
  assert(events.some((event)=>event.type==="shitu:active-site-change-failed"));

  console.log("INVENTORY_SITE_SWITCH_ISOLATION_OK");
}finally{
  for(const name of previous.keys()) restore(name);
}
