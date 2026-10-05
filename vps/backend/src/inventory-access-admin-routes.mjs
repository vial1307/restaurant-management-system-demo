import { pool, withTransaction } from "./db.mjs";
import { hasCapability, requireUser } from "./auth.mjs";

function text(value) { return String(value ?? "").trim(); }
function object(value) { return value && typeof value==="object" && !Array.isArray(value) ? value : {}; }
function array(value) { return Array.isArray(value) ? value : []; }

async function requireSuperAdmin(request,reply) {
  const user=await requireUser(request,reply);
  if (!user) return null;
  if (!hasCapability(user,"system.super_admin")) {
    reply.code(403).send({ error:"SUPER_ADMIN_REQUIRED" });
    return null;
  }
  return user;
}

async function readRevision(userId,client=pool,{forUpdate=false}={}) {
  await client.query(
    "insert into public.inventory_access_subject_revisions(user_id) values($1) on conflict(user_id) do nothing",
    [userId]
  );
  const { rows }=await client.query(
    `select revision,updated_at from public.inventory_access_subject_revisions
     where user_id=$1${forUpdate?" for update":""}`,
    [userId]
  );
  return {
    revision:Number(rows[0]?.revision || 1),
    updatedAt:rows[0]?.updated_at || null,
  };
}

async function readUserRules(userId,client=pool) {
  const { rows }=await client.query(
    `select
       r.id,r.action_key,r.effect,r.applies_all_sites,r.active,r.note,r.created_at,r.updated_at,
       coalesce(array_agg(distinct rs.site_code) filter(where rs.site_code is not null),'{}'::text[]) as sites,
       coalesce(array_agg(distinct rl.location_id::text) filter(where rl.location_id is not null),'{}'::text[]) as locations,
       coalesce(
         jsonb_agg(distinct jsonb_build_object('site',rw.site_code,'code',rw.work_area_code))
           filter(where rw.site_code is not null),
         '[]'::jsonb
       ) as work_areas
     from public.inventory_access_rules r
     left join public.inventory_access_rule_sites rs on rs.rule_id=r.id
     left join public.inventory_access_rule_locations rl on rl.rule_id=r.id
     left join public.inventory_access_rule_work_areas rw on rw.rule_id=r.id
     where r.user_id=$1 and r.active=true
     group by r.id
     order by r.action_key,r.created_at,r.id`,
    [userId]
  );
  return rows.map((row)=>({
    id:row.id,
    actionKey:row.action_key,
    effect:row.effect,
    allSites:row.applies_all_sites === true,
    active:row.active !== false,
    note:row.note || "",
    sites:row.sites || [],
    locations:row.locations || [],
    workAreas:array(row.work_areas).map((entry)=>({
      site:text(entry?.site),
      code:text(entry?.code),
    })).filter((entry)=>entry.site&&entry.code),
    createdAt:row.created_at,
    updatedAt:row.updated_at,
  }));
}

function normalizeInputRule(raw) {
  const rule=object(raw);
  return {
    actionKey:text(rule.actionKey),
    effect:text(rule.effect),
    allSites:rule.allSites === true,
    sites:[...new Set(array(rule.sites).map(text).filter(Boolean))],
    locations:[...new Set(array(rule.locations).map(text).filter(Boolean))],
    workAreas:array(rule.workAreas).map((entry)=>({
      site:text(entry?.site),
      code:text(entry?.code),
    })).filter((entry)=>entry.site&&entry.code),
    note:text(rule.note).slice(0,500),
  };
}

async function validateRules(rules,client) {
  if (rules.length>400) throw Object.assign(new Error("INVENTORY_ACCESS_RULE_LIMIT"),{statusCode:400});
  const [actionRows,siteRows,locationRows,areaRows]=await Promise.all([
    client.query("select action_key from public.inventory_permission_actions where active=true"),
    client.query("select code from public.sites where active=true"),
    client.query("select id::text,site from public.inventory_locations where active=true"),
    client.query("select site_code,code from public.work_areas where active=true"),
  ]);
  const actions=new Set(actionRows.rows.map((row)=>row.action_key));
  const sites=new Set(siteRows.rows.map((row)=>row.code));
  const locations=new Map(locationRows.rows.map((row)=>[row.id,row.site]));
  const areas=new Set(areaRows.rows.map((row)=>`${row.site_code}:${row.code}`));

  for (const rule of rules) {
    if (!actions.has(rule.actionKey)) throw Object.assign(new Error("INVENTORY_ACCESS_ACTION_INVALID"),{statusCode:400});
    if (!["allow","deny"].includes(rule.effect)) throw Object.assign(new Error("INVENTORY_ACCESS_EFFECT_INVALID"),{statusCode:400});
    if (!rule.allSites && !rule.sites.length) throw Object.assign(new Error("INVENTORY_ACCESS_SITE_SCOPE_REQUIRED"),{statusCode:400});
    for (const site of rule.sites) {
      if (!sites.has(site)) throw Object.assign(new Error("INVENTORY_ACCESS_SITE_INVALID"),{statusCode:400});
    }
    for (const locationId of rule.locations) {
      const site=locations.get(locationId);
      if (!site) throw Object.assign(new Error("INVENTORY_ACCESS_LOCATION_INVALID"),{statusCode:400});
      if (!rule.allSites && !rule.sites.includes(site)) {
        throw Object.assign(new Error("INVENTORY_ACCESS_LOCATION_OUTSIDE_SITE_SCOPE"),{statusCode:400});
      }
    }
    for (const area of rule.workAreas) {
      if (!areas.has(`${area.site}:${area.code}`)) {
        throw Object.assign(new Error("INVENTORY_ACCESS_WORK_AREA_INVALID"),{statusCode:400});
      }
      if (!rule.allSites && !rule.sites.includes(area.site)) {
        throw Object.assign(new Error("INVENTORY_ACCESS_WORK_AREA_OUTSIDE_SITE_SCOPE"),{statusCode:400});
      }
    }
  }
}

async function auditAccessReplace(client,actor,targetUserId,before,after,revision) {
  await client.query(
    `insert into public.audit_logs(
       actor_user_id,actor_username,action,entity_type,entity_id,site,before_data,after_data,metadata
     ) values(
       $1,$2,'inventory_access_replace','inventory_access_subject',$3,null,
       $4::jsonb,$5::jsonb,jsonb_build_object('revision',$6::bigint)
     )`,
    [
      actor.id,actor.username,targetUserId,
      JSON.stringify(before),JSON.stringify(after),revision,
    ]
  );
}

export async function registerInventoryAccessAdminRoutes(app) {
  app.get("/api/admin/super/inventory-access-model", async (request,reply) => {
    const actor=await requireSuperAdmin(request,reply); if(!actor)return;
    const [actions,sites,locations,areas,policies]=await Promise.all([
      pool.query(
        `select action_key,name_vi,name_zh_tw,description,category,risk_level,sort_order
         from public.inventory_permission_actions
         where active=true
         order by sort_order,action_key`
      ),
      pool.query(
        `select code,name_vi,name_zh_tw,sort_order,metadata
         from public.sites
         where active=true
         order by sort_order,code`
      ),
      pool.query(
        `select id::text,code,site,kind,name_vi,name_zh_tw,sort_order,metadata
         from public.inventory_locations
         where active=true
         order by site,kind,sort_order,code`
      ),
      pool.query(
        `select site_code,code,name_vi,name_zh_tw,sort_order,metadata
         from public.work_areas
         where active=true
         order by site_code,sort_order,code`
      ),
      pool.query(
        `select p.id,p.code,p.name_vi,p.name_zh_tw,p.description,p.active,
                coalesce(jsonb_agg(
                  jsonb_build_object('actionKey',pa.action_key,'effect',pa.effect)
                  order by pa.action_key
                ) filter(where pa.action_key is not null),'[]'::jsonb) as actions
         from public.inventory_access_policies p
         left join public.inventory_policy_actions pa on pa.policy_id=p.id
         where p.active=true
         group by p.id
         order by p.name_vi,p.code`
      ),
    ]);
    return {
      actions:actions.rows.map((row)=>({
        actionKey:row.action_key,
        nameVi:row.name_vi,
        nameZhTw:row.name_zh_tw,
        description:row.description,
        category:row.category,
        riskLevel:row.risk_level,
        sortOrder:Number(row.sort_order||0),
      })),
      sites:sites.rows,
      locations:locations.rows,
      workAreas:areas.rows,
      policies:policies.rows,
    };
  });

  app.get("/api/admin/super/inventory-access/:userId", async (request,reply) => {
    const actor=await requireSuperAdmin(request,reply); if(!actor)return;
    const userId=text(request.params.userId);
    const target=(await pool.query(
      "select id,username,display_name,active from public.app_users where id=$1 limit 1",
      [userId]
    )).rows[0];
    if(!target)return reply.code(404).send({error:"USER_NOT_FOUND"});
    const [revision,rules]=await Promise.all([
      readRevision(userId),
      readUserRules(userId),
    ]);
    return { user:target,revision:revision.revision,updatedAt:revision.updatedAt,rules };
  });

  app.put("/api/admin/super/inventory-access/:userId", async (request,reply) => {
    const actor=await requireSuperAdmin(request,reply); if(!actor)return;
    const userId=text(request.params.userId);
    const expectedRevision=Number(request.body?.revision);
    const rules=array(request.body?.rules).map(normalizeInputRule);
    if(!Number.isInteger(expectedRevision)||expectedRevision<1) {
      return reply.code(400).send({error:"INVENTORY_ACCESS_REVISION_REQUIRED"});
    }

    try {
      return await withTransaction(async (client)=>{
        const target=(await client.query(
          "select id,username,display_name,active from public.app_users where id=$1 for update",
          [userId]
        )).rows[0];
        if(!target)throw Object.assign(new Error("USER_NOT_FOUND"),{statusCode:404});
        const currentRevision=await readRevision(userId,client,{forUpdate:true});
        if(currentRevision.revision!==expectedRevision) {
          throw Object.assign(new Error("INVENTORY_ACCESS_STALE"),{statusCode:409,currentRevision:currentRevision.revision});
        }
        await validateRules(rules,client);
        const before=await readUserRules(userId,client);

        await client.query("delete from public.inventory_access_rules where user_id=$1",[userId]);
        for (const rule of rules) {
          const inserted=(await client.query(
            `insert into public.inventory_access_rules(
               user_id,action_key,effect,applies_all_sites,active,note,created_by
             ) values($1,$2,$3,$4,true,$5,$6)
             returning id`,
            [userId,rule.actionKey,rule.effect,rule.allSites,rule.note,actor.id]
          )).rows[0];
          const ruleId=inserted.id;
          for (const site of rule.sites) {
            await client.query(
              "insert into public.inventory_access_rule_sites(rule_id,site_code) values($1,$2)",
              [ruleId,site]
            );
          }
          for (const locationId of rule.locations) {
            await client.query(
              "insert into public.inventory_access_rule_locations(rule_id,location_id) values($1,$2::uuid)",
              [ruleId,locationId]
            );
          }
          for (const area of rule.workAreas) {
            await client.query(
              "insert into public.inventory_access_rule_work_areas(rule_id,site_code,work_area_code) values($1,$2,$3)",
              [ruleId,area.site,area.code]
            );
          }
        }

        const nextRevision=currentRevision.revision+1;
        await client.query(
          "update public.inventory_access_subject_revisions set revision=$2,updated_at=now() where user_id=$1",
          [userId,nextRevision]
        );
        const after=await readUserRules(userId,client);
        await auditAccessReplace(client,actor,userId,before,after,nextRevision);
        return {
          ok:true,
          user:target,
          revision:nextRevision,
          rules:after,
        };
      });
    } catch(error) {
      return reply.code(error.statusCode||500).send({
        error:error.message||"INVENTORY_ACCESS_SAVE_FAILED",
        currentRevision:error.currentRevision||undefined,
      });
    }
  });
}
