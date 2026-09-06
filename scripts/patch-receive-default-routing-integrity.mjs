import fs from "node:fs";

const path = "vps/backend/src/inventory-extra-routes.mjs";
let source = fs.readFileSync(path, "utf8");

const receiveBefore = `    if (!loc.rowCount) return reply.code(404).send({ error: "LOCATION_NOT_FOUND" });\n\n    await pool.query(`;
const receiveAfter = `    if (!loc.rowCount) return reply.code(404).send({ error: "LOCATION_NOT_FOUND" });\n\n    const configured = await pool.query(\n      \`select 1\n       from public.inventory_items i\n       join public.inventory_stock s on s.item_id=i.id\n       where i.active=true\n         and i.catalog_key=$1\n         and i.item_key like $2\n         and s.location_id=$3\n       limit 1\`,\n      [catalogKey,site + ":%",loc.rows[0].id]\n    );\n    if (!configured.rowCount) {\n      return reply.code(409).send({ error: "RECEIVE_DEFAULT_LOCATION_NOT_CONFIGURED" });\n    }\n\n    await pool.query(`;

if (!source.includes(receiveBefore)) {
  throw new Error("receive-default source contract changed; refusing non-deterministic patch");
}
source = source.replace(receiveBefore, receiveAfter);

const transferBefore = `            const fixedLocationId = fixed.rows[0]?.location_id || "";\n            if (!fixedLocationId) {\n              throw Object.assign(new Error("DESTINATION_RECEIVE_DEFAULT_REQUIRED"), { statusCode:409 });\n            }\n            if (fixedLocationId !== destinationLocationId) {\n              throw Object.assign(new Error("DESTINATION_LOCATION_MUST_USE_RECEIVE_DEFAULT"), { statusCode:409 });\n            }`;
const transferAfter = `            const fixedLocationId = fixed.rows[0]?.location_id || "";\n            if (!fixedLocationId) {\n              throw Object.assign(new Error("DESTINATION_RECEIVE_DEFAULT_REQUIRED"), { statusCode:409 });\n            }\n            if (!configuredIds.includes(fixedLocationId)) {\n              throw Object.assign(new Error("DESTINATION_RECEIVE_DEFAULT_NOT_CONFIGURED"), { statusCode:409 });\n            }\n            if (fixedLocationId !== destinationLocationId) {\n              throw Object.assign(new Error("DESTINATION_LOCATION_MUST_USE_RECEIVE_DEFAULT"), { statusCode:409 });\n            }`;

if (!source.includes(transferBefore)) {
  throw new Error("direct-transfer receiving-default source contract changed; refusing non-deterministic patch");
}
source = source.replace(transferBefore, transferAfter);

fs.writeFileSync(path, source);
console.log("RECEIVE_DEFAULT_ROUTING_INTEGRITY_PATCH_OK");
