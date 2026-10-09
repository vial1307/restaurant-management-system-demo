import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

const {Client}=pg;
const BASE=process.env.TEST_API_BASE||"http://127.0.0.1:8080";
const db=new Client({
 host:process.env.DB_HOST||"127.0.0.1",port:Number(process.env.DB_PORT||5432),
 database:process.env.POSTGRES_DB||"kitchen_test",user:process.env.POSTGRES_USER||"kitchen_test",
 password:process.env.POSTGRES_PASSWORD||"kitchen_test"
});
async function api(path,{method="GET",cookie="",body}={}){
 const response=await fetch(BASE+path,{method,headers:{
  ...(cookie?{cookie}:{}),...(body?{"Content-Type":"application/json"}:{})
 },body:body?JSON.stringify(body):undefined});
 const data=await response.json().catch(()=>null);
 return {status:response.status,data};
}
async function login(name){
 const response=await fetch(BASE+"/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify({username:name,password:"KitchenTest!123"})});
 assert.equal(response.status,200,"Login failure "+name);
 return (response.headers.get("set-cookie")||"").split(";")[0];
}
const plus=(date,days)=>{const d=new Date(date+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const tomorrow=plus(today,1);
await db.connect();
try {
 const manager=await login("managerfx"),employee=await login("employeefx");
 const {rows:items}=await db.query("select id,item_key from public.inventory_items where item_key like 'fuxing:%' and active=true order by item_key limit 1");
 assert(items.length,"Expected active Fuxing item in regression fixture");
 const item=items[0],prefix="/api/procurement/fuxing";
 const snapshot=await api(prefix,{cookie:manager});
 assert.equal(snapshot.status,200,JSON.stringify(snapshot.data));
 assert.equal(snapshot.data.suppliers.length,0,"Do not seed demo supplier identities");
 const forbidden=await api(prefix+"/suppliers",{method:"POST",cookie:employee,body:{nameZhTw:"不應存入"}});
 assert.equal(forbidden.status,403,"No unauthorized supplier mutation");
 const supplierBody={nameZhTw:"測試供應商",nameVi:"Nhà cung cấp kiểm thử",phone:"",cutoffTime:"23:59",
  closedWeekdays:[],closedDates:[],leadDays:1,reviewDays:1,active:true};
 const created=await api(prefix+"/suppliers",{method:"POST",cookie:manager,body:supplierBody});
 assert.equal(created.status,200,JSON.stringify(created.data));
 const supplier=created.data.supplier;assert(supplier.id);
 const stale=await api(prefix+"/suppliers",{method:"POST",cookie:manager,body:{...supplierBody,id:supplier.id,revision:0,nameZhTw:"STALENESS"}});
 assert.equal(stale.status,409,"Stale supplier revision must be rejected");
 const cfg={itemId:item.id,supplierId:supplier.id,weekdayDemand:2,weekendDemand:4,holidayDemand:6,safetyStock:3,packageSize:5,packageUnit:"包",enabled:true,revision:0};
 const saved=await api(prefix+"/rules",{method:"POST",cookie:manager,body:cfg});
 assert.equal(saved.status,200,JSON.stringify(saved.data));
 assert.equal(saved.data.rule.revision,1);
 const staleRule=await api(prefix+"/rules",{method:"POST",cookie:manager,body:{...cfg,revision:0}});
 assert.equal(staleRule.status,409);
 const holiday=await api(prefix+"/calendar",{method:"POST",cookie:manager,body:{date:tomorrow,type:"holiday",description:"Fixture"}});
 assert.equal(holiday.status,200);
 const otherSite=await api("/api/procurement/yongji/suppliers",{method:"POST",cookie:manager,body:supplierBody});
 assert.equal(otherSite.status,403,"No cross-site supplier write");
 const {rows:[before]}=await db.query("select coalesce(sum(s.quantity),0)::text as total from public.inventory_stock s where s.item_id=$1",[item.id]);
 const requestKey=randomUUID(),expectedArrival=plus(tomorrow,1);
 const orderBody={supplierId:supplier.id,orderDate:tomorrow,expectedArrival,requestKey,
   lines:[{itemId:item.id,packageCount:3}]};
 const ordered=await api(prefix+"/orders",{method:"POST",cookie:manager,body:orderBody});
 assert.equal(ordered.status,200,JSON.stringify(ordered.data));
 assert(ordered.data.id);
 const duplicate=await api(prefix+"/orders",{method:"POST",cookie:manager,body:orderBody});
 assert.equal(duplicate.status,200);
 assert.equal(duplicate.data.id,ordered.data.id);
 assert.equal(duplicate.data.alreadyExists,true);
 const invalidItem=await api(prefix+"/orders",{method:"POST",cookie:manager,body:{...orderBody,requestKey:randomUUID(),lines:[{itemId:randomUUID(),packageCount:3}]}});
 assert.equal(invalidItem.status,400,"Refuse unassigned products");
 const blocked=await api(prefix+"/orders/"+ordered.data.id+"/status",{method:"POST",cookie:employee,body:{status:"confirmed"}});
 assert.equal(blocked.status,403);
 const confirmed=await api(prefix+"/orders/"+ordered.data.id+"/status",{method:"POST",cookie:manager,body:{status:"confirmed"}});
 assert.equal(confirmed.status,200,JSON.stringify(confirmed.data));
 const repeated=await api(prefix+"/orders/"+ordered.data.id+"/status",{method:"POST",cookie:manager,body:{status:"confirmed"}});
 assert.equal(repeated.status,409);
 const fresh=await api(prefix,{cookie:await login("managerfx")});
 assert.equal(fresh.status,200);
 assert(fresh.data.suppliers.some(x=>x.id===supplier.id));
 assert(fresh.data.rules.some(x=>x.itemId===item.id&&x.holidayDemand===6));
 assert(fresh.data.calendar.some(x=>x.date===tomorrow&&x.type==="holiday"));
 assert(fresh.data.orders.some(x=>x.id===ordered.data.id&&x.status==="confirmed"));
 const {rows:[after]}=await db.query("select coalesce(sum(s.quantity),0)::text as total from public.inventory_stock s where s.item_id=$1",[item.id]);
 assert.equal(after.total,before.total,"Creating procurement order must not touch physical stock");
 const {rows:[tx]}=await db.query("select count(*)::int as count from public.inventory_transactions where item_id=$1 and action='receive'",[item.id]);
 assert.equal(tx.count,0,"Do not forge inventory receipts");
 console.log("PROCUREMENT_API_DB_ROUNDTRIP_OK");
}finally{await db.end();}
