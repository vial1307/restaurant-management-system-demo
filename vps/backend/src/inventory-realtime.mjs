import { hasPermission, requireUser } from "./auth.mjs";

const clients = new Set();
let revision = Date.now();

function removeClient(client) {
  clearInterval(client.heartbeat);
  clients.delete(client);
}

function writeEvent(client, event, payload) {
  try {
    client.raw.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    return true;
  } catch {
    removeClient(client);
    return false;
  }
}

function publishInventoryInvalidation(sourceClientId = "") {
  revision = Math.max(revision + 1, Date.now());
  const payload = {
    revision,
    sourceClientId: String(sourceClientId || "").slice(0, 120),
  };
  for (const client of clients) writeEvent(client, "inventory", payload);
}

export async function registerInventoryRealtime(app) {
  app.get("/api/inventory/events", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    if (!hasPermission(user, "inventory", "view")) {
      return reply.code(403).send({ error: "INVENTORY_VIEW_NOT_ALLOWED" });
    }

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    reply.raw.flushHeaders?.();

    const client = { raw: reply.raw, heartbeat:null };
    clients.add(client);
    if (!writeEvent(client, "ready", { revision })) {
      try { reply.raw.end(); } catch {}
      return;
    }

    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(`: heartbeat ${Date.now()}\n\n`);
      } catch {
        removeClient(client);
      }
    }, 20_000);
    client.heartbeat=heartbeat;
    heartbeat.unref?.();

    request.raw.on("close", () => {
      removeClient(client);
    });
  });

  app.addHook("onClose", async () => {
    for (const client of clients) {
      removeClient(client);
      try { client.raw.end(); } catch {}
    }
  });

  app.addHook("onResponse", async (request, reply) => {
    if (request.method === "GET" || reply.statusCode < 200 || reply.statusCode >= 300) return;
    const route = String(request.routeOptions?.url || request.url || "");
    const masterMutation = ["/api/master-data/locations", "/api/master-data/work-areas"].includes(route);
    const adminCatalogMutation = route === "/api/admin/super/inventory-catalog-identity"
      || (route.startsWith("/api/admin/super/data/") && request.params?.dataset === "inventory-products");
    if (!route.startsWith("/api/inventory/") && !masterMutation && !adminCatalogMutation) return;
    publishInventoryInvalidation(request.headers["x-kitchen-client-id"]);
  });
}
