import assert from "node:assert/strict";

class MemoryStorage {
  constructor(){ this.map=new Map(); }
  getItem(key){ return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key,value){ this.map.set(key,String(value)); }
  removeItem(key){ this.map.delete(key); }
}

globalThis.localStorage=new MemoryStorage();
globalThis.CustomEvent=class CustomEvent {
  constructor(type,init={}){ this.type=type; this.detail=init.detail; }
};
const events=[];
globalThis.window={
  location:{hostname:"82.47.180.185",protocol:"https:"},
  sessionStorage:new MemoryStorage(),
  dispatchEvent:(event)=>{ events.push(event); return true; },
  setTimeout:(fn,ms)=>setTimeout(fn,Math.min(ms,2)),
};
globalThis.clearTimeout=clearTimeout;

const { apiRequest }=await import("../src/vps-api.js");

function response(status,payload){
  return {
    ok:status>=200&&status<300,
    status,
    headers:{get:(name)=>name.toLowerCase()==="content-type"?"application/json":""},
    json:async()=>payload,
    text:async()=>JSON.stringify(payload),
  };
}

let attempts=0;
globalThis.fetch=async()=>{
  attempts+=1;
  if(attempts<3) throw new Error("temporary connection reset");
  return response(200,{ok:true});
};
assert.deepEqual(await apiRequest("/api/inventory/sites"),{ok:true});
assert.equal(attempts,3,"safe GET must retry transient network failures");
assert(events.some((event)=>event.type==="shitu:api-read-retry"),"safe GET retry must emit diagnostics");

attempts=0;
globalThis.fetch=async()=>{
  attempts+=1;
  return attempts===1 ? response(503,{error:"UPSTREAM_RESTARTING"}) : response(200,{ok:true});
};
assert.deepEqual(await apiRequest("/api/inventory/fuxing"),{ok:true});
assert.equal(attempts,2,"safe GET must retry transient 503 responses");

attempts=0;
globalThis.fetch=async()=>{
  attempts+=1;
  return response(403,{error:"INVENTORY_VIEW_NOT_ALLOWED"});
};
await assert.rejects(()=>apiRequest("/api/inventory/yongji"),/INVENTORY_VIEW_NOT_ALLOWED/);
assert.equal(attempts,1,"authorization failures must not be retried");

attempts=0;
globalThis.fetch=async()=>{
  attempts+=1;
  throw new Error("connection reset");
};
await assert.rejects(
  ()=>apiRequest("/api/inventory/set-quantity",{method:"POST",body:{itemId:"x",quantity:1}}),
  /API_UNREACHABLE/
);
assert.equal(attempts,1,"mutations must never be replayed automatically");

console.log("VPS_SAFE_READ_RETRY_OK");
