import { createClient } from "npm:@supabase/supabase-js@2";

const VALID_ROLES = new Set(["admin","manager","supervisor","employee","parttime","central"]);
const VALID_LOCATIONS = new Set(["all","fuxing","central"]);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function defaultPermissions(role: string) {
  const modules = ["dashboard","inventory","procurement","reservations","preparation","menu","sop","skills","attendance","schedule","reports","remote","settings"];
  if (role === "admin") return Object.fromEntries(modules.map(k => [k,{view:true,edit:true}]));
  if (role === "central") return Object.fromEntries(modules.map(k => [k,{view:k==="inventory",edit:k==="inventory"}]));
  return {
    dashboard:{view:true,edit:false}, inventory:{view:true,edit:true},
    procurement:{view:false,edit:false}, reservations:{view:true,edit:false},
    preparation:{view:true,edit:true}, menu:{view:true,edit:false},
    sop:{view:true,edit:false}, skills:{view:true,edit:false},
    attendance:{view:true,edit:true}, schedule:{view:true,edit:false},
    reports:{view:false,edit:false}, remote:{view:false,edit:false},
    settings:{view:false,edit:false},
  };
}

function emailForUsername(username: string) {
  const normalized = username.trim().toLowerCase();
  if (!/^[a-z0-9._-]{2,40}$/.test(normalized)) throw new Error("USERNAME_FORMAT");
  return `${normalized}@staff.shitu.local`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
    const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    const publicKey = publishableKeys.default || Deno.env.get("SUPABASE_ANON_KEY")!;
    const secretKey = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authorization = req.headers.get("Authorization") || "";

    const caller = createClient(url, publicKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const admin = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } = await caller.auth.getUser();
    if (userError || !userData.user) return json({ error: "UNAUTHORIZED" }, 401);

    const { data: callerProfile } = await admin
      .from("profiles")
      .select("role,active")
      .eq("id", userData.user.id)
      .single();

    if (!callerProfile?.active || callerProfile.role !== "admin") {
      return json({ error: "FORBIDDEN" }, 403);
    }

    const body = await req.json();
    const action = String(body.action || "");

    if (action === "create") {
      const username = String(body.username || "").trim().toLowerCase();
      const password = String(body.password || "");
      const displayName = String(body.display_name || "").trim();
      const role = String(body.role || "employee");
      const location = String(body.location || "fuxing");
      const permissions = body.permissions || defaultPermissions(role);
      if (!displayName) return json({ error: "DISPLAY_NAME_REQUIRED" }, 400);
      if (!VALID_ROLES.has(role)) return json({ error: "INVALID_ROLE" }, 400);
      if (!VALID_LOCATIONS.has(location)) return json({ error: "INVALID_LOCATION" }, 400);
      if (password.length < 6) return json({ error: "PASSWORD_TOO_SHORT" }, 400);

      const { data: duplicate } = await admin
        .from("profiles")
        .select("id")
        .ilike("username", username)
        .limit(1);
      if (duplicate?.length) return json({ error: "USERNAME_EXISTS" }, 409);

      const email = emailForUsername(username);
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { username, display_name: displayName },
      });
      if (createError) return json({ error: createError.message }, 400);

      const { error: profileError } = await admin.from("profiles").insert({
        id: created.user.id,
        username,
        display_name: displayName,
        role,
        location,
        active: body.active !== false,
        permissions,
      });
      if (profileError) {
        await admin.auth.admin.deleteUser(created.user.id);
        return json({ error: profileError.message }, 400);
      }
      return json({ ok: true, id: created.user.id });
    }

    if (action === "update") {
      const id = String(body.id || "");
      if (!id) return json({ error: "MISSING_ID" }, 400);

      const { data: targetProfile, error: targetError } = await admin
        .from("profiles")
        .select("username,display_name,role,location,active")
        .eq("id", id)
        .single();
      if (targetError || !targetProfile) return json({ error: "ACCOUNT_NOT_FOUND" }, 404);

      const requestedRole = "role" in body ? String(body.role || "") : targetProfile.role;
      const requestedLocation = "location" in body ? String(body.location || "") : targetProfile.location;
      if (!VALID_ROLES.has(requestedRole)) return json({ error: "INVALID_ROLE" }, 400);
      if (!VALID_LOCATIONS.has(requestedLocation)) return json({ error: "INVALID_LOCATION" }, 400);

      if (id === userData.user.id) {
        if (requestedRole !== "admin" || requestedLocation !== "all" || body.active === false) {
          return json({ error: "SELF_ADMIN_PROTECTED" }, 400);
        }
      }

      const patch: Record<string, unknown> = {};
      for (const key of ["display_name","role","location","active","permissions"]) {
        if (key in body) patch[key] = body[key];
      }
      if ("display_name" in body && !String(body.display_name || "").trim()) {
        return json({ error: "DISPLAY_NAME_REQUIRED" }, 400);
      }
      let authUsernameChanged = false;
      if ("username" in body) {
        const username = String(body.username || "").trim().toLowerCase();
        emailForUsername(username);
        const { data: duplicate } = await admin
          .from("profiles")
          .select("id")
          .ilike("username", username)
          .neq("id", id)
          .limit(1);
        if (duplicate?.length) return json({ error: "USERNAME_EXISTS" }, 409);
        patch.username = username;
        const userMetadata: Record<string, unknown> = { username };
        if ("display_name" in body) userMetadata.display_name = String(body.display_name || "").trim();
        const { error } = await admin.auth.admin.updateUserById(id, {
          email: emailForUsername(username),
          email_confirm: true,
          user_metadata: userMetadata,
        });
        if (error) return json({ error: error.message }, 400);
        authUsernameChanged = username !== targetProfile.username;
      } else if ("display_name" in body) {
        const { error } = await admin.auth.admin.updateUserById(id, {
          user_metadata: {
            username: targetProfile.username,
            display_name: String(body.display_name || "").trim(),
          },
        });
        if (error) return json({ error: error.message }, 400);
      }
      if (String(body.password || "").length) {
        if (String(body.password).length < 6) return json({ error: "PASSWORD_TOO_SHORT" }, 400);
        const { error } = await admin.auth.admin.updateUserById(id, { password: String(body.password) });
        if (error) return json({ error: error.message }, 400);
      }
      const { error } = await admin.from("profiles").update(patch).eq("id", id);
      if (error) {
        if (authUsernameChanged) {
          try {
            await admin.auth.admin.updateUserById(id, {
              email: emailForUsername(targetProfile.username),
              email_confirm: true,
              user_metadata: {
                username: targetProfile.username,
                display_name: targetProfile.display_name,
              },
            });
          } catch {}
        }
        return json({ error: error.message }, 400);
      }
      return json({ ok: true });
    }

    if (action === "delete") {
      const id = String(body.id || "");
      if (!id || id === userData.user.id) return json({ error: "INVALID_ID" }, 400);
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: "UNKNOWN_ACTION" }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "UNKNOWN_ERROR" }, 500);
  }
});
