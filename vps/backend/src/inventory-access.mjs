import { pool } from "./db.mjs";

function text(value) {
  return String(value ?? "").trim();
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function normalizedRule(row) {
  return {
    id:row.id,
    userId:row.user_id,
    actionKey:row.action_key,
    effect:row.effect,
    allSites:row.applies_all_sites === true,
    active:row.active !== false,
    note:row.note || "",
    sites:unique(row.sites || []),
    locations:unique(row.locations || []),
    workAreas:(row.work_areas || []).filter(Boolean).map((entry) => ({
      site:entry.site_code,
      code:entry.work_area_code,
    })),
    source:row.source || "direct",
    sourceId:row.source_id || row.id,
  };
}

async function loadDirectRules(userId, actionKey, client = pool) {
  const { rows } = await client.query(
    `select
       r.id,r.user_id,r.action_key,r.effect,r.applies_all_sites,r.active,r.note,
       coalesce(array_agg(distinct rs.site_code) filter (where rs.site_code is not null),'{}'::text[]) as sites,
       coalesce(array_agg(distinct rl.location_id::text) filter (where rl.location_id is not null),'{}'::text[]) as locations,
       coalesce(
         jsonb_agg(distinct jsonb_build_object('site_code',rw.site_code,'work_area_code',rw.work_area_code))
           filter (where rw.site_code is not null),
         '[]'::jsonb
       ) as work_areas,
       'direct'::text as source,
       r.id as source_id
     from public.inventory_access_rules r
     left join public.inventory_access_rule_sites rs on rs.rule_id=r.id
     left join public.inventory_access_rule_locations rl on rl.rule_id=r.id
     left join public.inventory_access_rule_work_areas rw on rw.rule_id=r.id
     where r.user_id=$1 and r.action_key=$2 and r.active=true
     group by r.id`,
    [userId, actionKey]
  );
  return rows.map(normalizedRule);
}

async function loadPolicyRules(userId, actionKey, client = pool) {
  const { rows } = await client.query(
    `select
       p.id,
       a.user_id,
       pa.action_key,
       pa.effect,
       true as applies_all_sites,
       true as active,
       ('policy:'||p.code)::text as note,
       '{}'::text[] as sites,
       '{}'::text[] as locations,
       '[]'::jsonb as work_areas,
       'policy'::text as source,
       p.id as source_id
     from public.inventory_user_policy_assignments a
     join public.inventory_access_policies p on p.id=a.policy_id and p.active=true
     join public.inventory_policy_actions pa on pa.policy_id=p.id and pa.action_key=$2
     where a.user_id=$1
       and a.active=true
       and (a.starts_at is null or a.starts_at<=now())
       and (a.ends_at is null or a.ends_at>=now())`,
    [userId, actionKey]
  );
  return rows.map(normalizedRule);
}

function ruleSiteMatches(rule, site) {
  if (rule.allSites) return true;
  if (!site) return false;
  return rule.sites.includes(site);
}

function childScopeScore(rule, { locationId = "", workArea = "", site = "" } = {}) {
  const locations=rule.locations || [];
  const workAreas=rule.workAreas || [];
  if (!locations.length && !workAreas.length) return { matches:true,score:rule.allSites ? 100 : 200 };

  const locationMatch=Boolean(locationId && locations.includes(locationId));
  const workAreaMatch=Boolean(workArea && workAreas.some((entry)=>entry.site===site && entry.code===workArea));
  if (!locationMatch && !workAreaMatch) return { matches:false,score:-1 };
  return { matches:true,score:locationMatch ? 400 : 350 };
}

function chooseRule(rules, context) {
  const candidates=[];
  for (const rule of rules) {
    if (!ruleSiteMatches(rule,context.site)) continue;
    const child=childScopeScore(rule,context);
    if (!child.matches) continue;
    candidates.push({ rule,score:child.score });
  }
  candidates.sort((a,b)=>
    b.score-a.score
    || Number(b.rule.effect==="deny")-Number(a.rule.effect==="deny")
    || String(a.rule.id).localeCompare(String(b.rule.id))
  );
  return candidates[0]?.rule || null;
}

export async function inventoryAccessDecision(user, actionKey, context = {}, client = pool) {
  const userId=text(user?.id);
  const action=text(actionKey);
  const site=text(context.site);
  const locationId=text(context.locationId);
  const workArea=text(context.workArea);
  if (!userId || !action) {
    return { allowed:false,reason:"NO_SUBJECT_OR_ACTION",source:"default-deny",ruleId:null };
  }

  const actionRow=(await client.query(
    "select action_key from public.inventory_permission_actions where action_key=$1 and active=true limit 1",
    [action]
  )).rows[0];
  if (!actionRow) {
    return { allowed:false,reason:"UNKNOWN_ACTION",source:"default-deny",ruleId:null };
  }

  const direct=await loadDirectRules(userId,action,client);
  const directRule=chooseRule(direct,{site,locationId,workArea});
  if (directRule) {
    return {
      allowed:directRule.effect==="allow",
      reason:directRule.effect==="allow" ? "DIRECT_ALLOW" : "DIRECT_DENY",
      source:"direct",
      ruleId:directRule.id,
      actionKey:action,
      site,
      locationId:locationId || null,
      workArea:workArea || null,
    };
  }

  const policies=await loadPolicyRules(userId,action,client);
  const policyRule=chooseRule(policies,{site,locationId,workArea});
  if (policyRule) {
    return {
      allowed:policyRule.effect==="allow",
      reason:policyRule.effect==="allow" ? "POLICY_ALLOW" : "POLICY_DENY",
      source:"policy",
      ruleId:policyRule.sourceId,
      actionKey:action,
      site,
      locationId:locationId || null,
      workArea:workArea || null,
    };
  }

  return {
    allowed:false,
    reason:"NO_MATCHING_RULE",
    source:"default-deny",
    ruleId:null,
    actionKey:action,
    site,
    locationId:locationId || null,
    workArea:workArea || null,
  };
}

export async function inventoryActionAllowed(user, actionKey, context = {}, client = pool) {
  return (await inventoryAccessDecision(user,actionKey,context,client)).allowed;
}

export async function requireInventoryAction(user, actionKey, context, reply, client = pool) {
  const decision=await inventoryAccessDecision(user,actionKey,context,client);
  if (decision.allowed) return decision;
  reply.code(403).send({
    error:"INVENTORY_ACTION_NOT_ALLOWED",
    action:actionKey,
    site:text(context?.site) || null,
    locationId:text(context?.locationId) || null,
    workArea:text(context?.workArea) || null,
    reason:decision.reason,
  });
  return null;
}

export async function inventoryAllowedSites(user, actionKey, client = pool) {
  const { rows }=await client.query("select code from public.sites where active=true order by sort_order,code");
  const allowed=[];
  for (const row of rows) {
    if (await inventoryActionAllowed(user,actionKey,{site:row.code},client)) allowed.push(row.code);
  }
  return allowed;
}

export async function inventoryActionSnapshot(user, site, client = pool) {
  const [{ rows:actionRows },{ rows:locationRows },{ rows:workAreaRows }]=await Promise.all([
    client.query(
      "select action_key,name_vi,name_zh_tw,category,risk_level,sort_order from public.inventory_permission_actions where active=true order by sort_order,action_key"
    ),
    client.query(
      "select id::text,code,kind,metadata from public.inventory_locations where site=$1 and active=true order by sort_order,code",
      [site]
    ),
    client.query(
      "select code from public.work_areas where site_code=$1 and active=true order by sort_order,code",
      [site]
    ),
  ]);

  const shapeDecision=(decision,row)=>({
    allowed:decision.allowed,
    reason:decision.reason,
    source:decision.source,
    ruleId:decision.ruleId,
    name_vi:row.name_vi,
    name_zh_tw:row.name_zh_tw,
    category:row.category,
    risk_level:row.risk_level,
  });

  const actions={};
  for (const row of actionRows) {
    actions[row.action_key]=shapeDecision(
      await inventoryAccessDecision(user,row.action_key,{site},client),
      row
    );
  }

  const locations={};
  for (const location of locationRows) {
    const scoped={};
    const workArea=String(location.metadata?.work_area || "").trim();
    for (const row of actionRows) {
      scoped[row.action_key]=shapeDecision(
        await inventoryAccessDecision(
          user,row.action_key,
          {site,locationId:location.id,workArea},
          client
        ),
        row
      );
    }
    locations[location.id]={
      id:location.id,
      code:location.code,
      kind:location.kind,
      workArea:workArea || null,
      actions:scoped,
    };
  }

  const workAreas={};
  for (const area of workAreaRows) {
    const scoped={};
    for (const row of actionRows) {
      scoped[row.action_key]=shapeDecision(
        await inventoryAccessDecision(user,row.action_key,{site,workArea:area.code},client),
        row
      );
    }
    workAreas[area.code]={ code:area.code,actions:scoped };
  }

  return { site,actions,locations,workAreas };
}
