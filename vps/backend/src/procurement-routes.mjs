import { pool, withTransaction } from "./db.mjs";
import { hasPermission, requireUser, siteAllowed } from "./auth.mjs";
import { activeSite } from "./site-registry.mjs";
import { inventoryActionAllowed } from "./inventory-access.mjs";

const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) && !Number.isNaN(Date.parse(s + "T12:00:00Z"));
const intRange = (v,min,max) => Number.isInteger(Number(v)) && Number(v)>=min && Number(v)<=max;
const qty = (v,min=0) => Number.isFinite(Number(v)) && Number(v)>=min && Number(v)<=10000000;
const textValue = (v,max=120) => String(v ?? "").trim().slice(0,max);
const dateKey = (v) => v instanceof Date ? v.toISOString().slice(0,10) : String(v || "").slice(0,10);
function supplierRow(row) {
  return { id:row.id, site:row.site_code, nameZhTw:row.name_zh_tw,
    nameVi:row.name_vi, phone:row.phone, closedWeekdays:row.closed_weekdays || [],
    closedDates:(row.closed_dates || []).map(dateKey), cutoffTime:String(row.cutoff_time).slice(0,5),
    leadDays:row.lead_days, reviewDays:row.review_days, active:row.active, revision:row.revision };
}
function ruleRow(row) {
  return { itemId:row.item_id, supplierId:row.supplier_id, weekdayDemand:Number(row.weekday_demand),
    weekendDemand:Number(row.weekend_demand), holidayDemand:Number(row.holiday_demand),
    safetyStock:Number(row.safety_stock), packageSize:Number(row.package_size),
    packageUnit:row.package_unit, enabled:row.enabled, revision:row.revision };
}
async function allowed(request,reply,mode="view") {
  const user=await requireUser(request,reply);
  if (!user) return null;
  const site=String(request.params.site || "");
  if (!(await activeSite(site))) { reply.code(400).send({error:"INVALID_SITE"}); return null; }
  if (!siteAllowed(user,site) || !hasPermission(user,"procurement",mode)) {
    reply.code(403).send({error:"PROCUREMENT_PERMISSION_DENIED"}); return null;
  }
  if (mode==="view" && !(await inventoryActionAllowed(user,"inventory.view",{site}))) {
    reply.code(403).send({error:"INVENTORY_VIEW_NOT_ALLOWED"}); return null;
  }
  return {user,site};
}
async function audit(client,ctx,action,entityId,before,after) {
  await client.query(
    "insert into public.audit_logs(actor_user_id,actor_username,action,entity_type,entity_id,site,before_data,after_data) values($1,$2,$3,'procurement',$4,$5,$6::jsonb,$7::jsonb)",
    [ctx.user.id,ctx.user.username,action,entityId,ctx.site,JSON.stringify(before),JSON.stringify(after)]
  );
}
function validationReply(reply,error="INVALID_PROCUREMENT_DATA") { return reply.code(400).send({error}); }

export async function registerProcurementRoutes(app) {
  app.get("/api/procurement/:site", async (request,reply) => {
    const ctx=await allowed(request,reply); if (!ctx) return;
    const [suppliers,rules,calendar,orders] = await Promise.all([
      pool.query("select * from public.procurement_suppliers where site_code=$1 order by active desc,name_zh_tw", [ctx.site]),
      pool.query("select * from public.procurement_product_rules where site_code=$1", [ctx.site]),
      pool.query("select service_date,day_type,description from public.procurement_service_calendar where site_code=$1 and service_date between current_date-interval '30 days' and current_date+interval '400 days' order by service_date",[ctx.site]),
      pool.query("select o.id,o.supplier_id,o.order_date,o.expected_arrival,o.status,o.note,o.created_at,coalesce(json_agg(json_build_object('itemId',l.item_id,'packageCount',l.package_count,'packageSize',l.package_size,'baseQuantity',l.base_quantity,'packageUnit',l.package_unit)) filter (where l.item_id is not null),'[]'::json) as lines from public.procurement_orders o left join public.procurement_order_lines l on l.order_id=o.id where o.site_code=$1 group by o.id order by o.created_at desc limit 100",[ctx.site]),
    ]);
    return { site:ctx.site, suppliers:suppliers.rows.map(supplierRow), rules:rules.rows.map(ruleRow),
      calendar:calendar.rows.map(row=>({date:dateKey(row.service_date),type:row.day_type,description:row.description})),
      orders:orders.rows.map(row=>({id:row.id,supplierId:row.supplier_id,orderDate:dateKey(row.order_date),expectedArrival:dateKey(row.expected_arrival),status:row.status,note:row.note,createdAt:row.created_at,lines:row.lines})) };
  });

  app.post("/api/procurement/:site/suppliers", async (request,reply) => {
    const ctx=await allowed(request,reply,"edit"); if (!ctx) return;
    const b=request.body || {};
    const name=textValue(b.nameZhTw), nameVi=textValue(b.nameVi), phone=textValue(b.phone,60);
    const closed=Array.isArray(b.closedWeekdays) ? [...new Set(b.closedWeekdays.map(Number))] : [];
    const exceptions=Array.isArray(b.closedDates) ? [...new Set(b.closedDates)] : [];
    const cutoff=String(b.cutoffTime || "12:00");
    if (!name || closed.some(d=>!intRange(d,0,6)) || exceptions.length>120 ||
      exceptions.some(d=>!validDate(d)) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(cutoff) ||
      !intRange(b.leadDays,0,60) || !intRange(b.reviewDays,1,30)) return validationReply(reply);
    try {
      const result=await withTransaction(async client=>{
        const existing=b.id ? (await client.query("select * from public.procurement_suppliers where id=$1 and site_code=$2 for update",[b.id,ctx.site])).rows[0] : null;
        if (b.id && !existing) throw Object.assign(new Error("SUPPLIER_NOT_FOUND"),{statusCode:404});
        if (existing && Number(b.revision)!==existing.revision) throw Object.assign(new Error("STALE_SUPPLIER_REVISION"),{statusCode:409});
        const row=existing
          ? (await client.query("update public.procurement_suppliers set name_zh_tw=$3,name_vi=$4,phone=$5,closed_weekdays=$6,closed_dates=$7,cutoff_time=$8,lead_days=$9,review_days=$10,active=$11,revision=revision+1,updated_by=$12,updated_at=now() where id=$1 and site_code=$2 returning *",
            [b.id,ctx.site,name,nameVi,phone,closed,exceptions,cutoff,Number(b.leadDays),Number(b.reviewDays),b.active!==false,ctx.user.id])).rows[0]
          : (await client.query("insert into public.procurement_suppliers(site_code,name_zh_tw,name_vi,phone,closed_weekdays,closed_dates,cutoff_time,lead_days,review_days,active,updated_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *",
            [ctx.site,name,nameVi,phone,closed,exceptions,cutoff,Number(b.leadDays),Number(b.reviewDays),b.active!==false,ctx.user.id])).rows[0];
        await audit(client,ctx,existing?"procurement.supplier.update":"procurement.supplier.create",row.id,existing||null,row);
        return supplierRow(row);
      });
      return {supplier:result};
    } catch(e) { return reply.code(e.statusCode||500).send({error:e.message||"SUPPLIER_SAVE_FAILED"}); }
  });

  app.post("/api/procurement/:site/rules", async (request,reply) => {
    const ctx=await allowed(request,reply,"edit"); if (!ctx) return;
    const b=request.body || {};
    if (!b.itemId || !qty(b.weekdayDemand) || !qty(b.weekendDemand) || !qty(b.holidayDemand) ||
      !qty(b.safetyStock) || !qty(b.packageSize,0.001) || !Number.isInteger(Number(b.revision ?? 0)))
      return validationReply(reply);
    try {
      const rule=await withTransaction(async client=>{
        const item=(await client.query("select id,item_key from public.inventory_items where id=$1 and active=true",[b.itemId])).rows[0];
        if (!item || !item.item_key.startsWith(ctx.site+":")) throw Object.assign(new Error("PRODUCT_NOT_IN_SITE"),{statusCode:400});
        if (b.supplierId) {
          const supplier=(await client.query("select id from public.procurement_suppliers where id=$1 and site_code=$2 and active=true",[b.supplierId,ctx.site])).rows[0];
          if (!supplier) throw Object.assign(new Error("SUPPLIER_NOT_IN_SITE"),{statusCode:400});
        }
        const prev=(await client.query("select * from public.procurement_product_rules where site_code=$1 and item_id=$2 for update",[ctx.site,b.itemId])).rows[0];
        if (Number(b.revision||0)!==Number(prev?.revision||0)) throw Object.assign(new Error("STALE_PRODUCT_RULE"),{statusCode:409});
        const current=(await client.query(
          "insert into public.procurement_product_rules(site_code,item_id,supplier_id,weekday_demand,weekend_demand,holiday_demand,safety_stock,package_size,package_unit,enabled,updated_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict(site_code,item_id) do update set supplier_id=excluded.supplier_id,weekday_demand=excluded.weekday_demand,weekend_demand=excluded.weekend_demand,holiday_demand=excluded.holiday_demand,safety_stock=excluded.safety_stock,package_size=excluded.package_size,package_unit=excluded.package_unit,enabled=excluded.enabled,revision=procurement_product_rules.revision+1,updated_by=excluded.updated_by,updated_at=now() returning *",
          [ctx.site,b.itemId,b.supplierId||null,Number(b.weekdayDemand),Number(b.weekendDemand),Number(b.holidayDemand),Number(b.safetyStock),Number(b.packageSize),textValue(b.packageUnit,32),b.enabled===true,ctx.user.id]
        )).rows[0];
        await audit(client,ctx,"procurement.rule.upsert",b.itemId,prev||null,current);
        return ruleRow(current);
      });
      return {rule};
    } catch(e) { return reply.code(e.statusCode||500).send({error:e.message||"RULE_SAVE_FAILED"}); }
  });

  app.post("/api/procurement/:site/calendar", async (request,reply) => {
    const ctx=await allowed(request,reply,"edit"); if (!ctx) return;
    const b=request.body || {};
    if (!validDate(b.date) || !["normal","holiday","closed"].includes(b.type)) return validationReply(reply);
    const result=await withTransaction(async client=>{
      const before=(await client.query("select * from public.procurement_service_calendar where site_code=$1 and service_date=$2",[ctx.site,b.date])).rows[0]||null;
      const after=(await client.query("insert into public.procurement_service_calendar(site_code,service_date,day_type,description,updated_by) values($1,$2,$3,$4,$5) on conflict(site_code,service_date) do update set day_type=excluded.day_type,description=excluded.description,updated_by=excluded.updated_by,updated_at=now() returning *",
        [ctx.site,b.date,b.type,textValue(b.description,160),ctx.user.id])).rows[0];
      await audit(client,ctx,"procurement.calendar.upsert",b.date,before,after);
      return {date:dateKey(after.service_date),type:after.day_type,description:after.description};
    });
    return {calendar:result};
  });

  app.post("/api/procurement/:site/orders", async (request,reply) => {
    const ctx=await allowed(request,reply,"edit"); if (!ctx) return;
    const b=request.body || {};
    const lines=Array.isArray(b.lines)?b.lines:[];
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(b.requestKey||"")) ||
      !validDate(b.orderDate) || !validDate(b.expectedArrival) || !b.supplierId ||
      lines.length<1 || lines.length>200 || lines.some(x=>!x.itemId || !qty(x.packageCount,0.001)) ||
      new Set(lines.map(x=>x.itemId)).size!==lines.length) return validationReply(reply);
    try {
      const result=await withTransaction(async client=>{
        const previous=(await client.query("select id from public.procurement_orders where site_code=$1 and request_key=$2",[ctx.site,b.requestKey])).rows[0];
        if(previous)return {id:previous.id,alreadyExists:true};
        const supplier=(await client.query("select id from public.procurement_suppliers where id=$1 and site_code=$2 and active=true",[b.supplierId,ctx.site])).rows[0];
        if(!supplier)throw Object.assign(new Error("SUPPLIER_NOT_IN_SITE"),{statusCode:400});
        const rules=(await client.query("select r.item_id,r.package_size,r.package_unit from public.procurement_product_rules r join public.inventory_items i on i.id=r.item_id where r.site_code=$1 and r.supplier_id=$2 and r.enabled=true and i.active=true and split_part(i.item_key,':',1)=$1",[ctx.site,b.supplierId])).rows;
        const byItem=new Map(rules.map(row=>[row.item_id,row]));
        for(const line of lines)if(!byItem.has(line.itemId))throw Object.assign(new Error("ORDER_LINE_NOT_ASSIGNED"),{statusCode:400});
        const header=(await client.query("insert into public.procurement_orders(site_code,supplier_id,request_key,order_date,expected_arrival,note,actor_user_id,actor_username) values($1,$2,$3,$4,$5,$6,$7,$8) returning id",
          [ctx.site,b.supplierId,b.requestKey,b.orderDate,b.expectedArrival,textValue(b.note,500),ctx.user.id,ctx.user.username])).rows[0];
        for(const line of lines){
          const rule=byItem.get(line.itemId), count=Number(line.packageCount),size=Number(rule.package_size);
          await client.query("insert into public.procurement_order_lines(order_id,item_id,package_count,package_size,base_quantity,package_unit) values($1,$2,$3,$4,$5,$6)",
            [header.id,line.itemId,count,size,count*size,rule.package_unit]);
        }
        await audit(client,ctx,"procurement.order.submit",header.id,null,{supplierId:b.supplierId,lines,expectedArrival:b.expectedArrival});
        return {id:header.id,alreadyExists:false};
      });
      return result;
    } catch(e){return reply.code(e.statusCode||500).send({error:e.message||"ORDER_SUBMIT_FAILED"});}
  });
}
