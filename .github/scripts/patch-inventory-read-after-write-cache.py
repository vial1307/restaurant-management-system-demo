from pathlib import Path

path = Path("src/vps-api.js")
source = path.read_text(encoding="utf-8")
old = '''export function vpsSetQuantity(body) {
  return apiRequest("/api/inventory/set-quantity", { method: "POST", body });
}

export const vpsSetInventoryQuantity = vpsSetQuantity;

export function vpsSetMinimum(body) {
  return apiRequest("/api/inventory/set-minimum", { method: "POST", body });
}

export const vpsSetInventoryMinimum = vpsSetMinimum;

export function vpsAdjustInventory(body) {
  return apiRequest("/api/inventory/adjust", { method: "POST", body });
}

export function vpsTransferInventory(body) {
  return apiRequest("/api/inventory/transfer", { method: "POST", body });
}

export async function vpsDirectTransfer(body) {
  const result = await apiRequest("/api/inventory/direct-transfer", { method: "POST", body });
  invalidateVpsInventoryCache("");
  return result;
}

export function vpsShipInventory(body) {
  return apiRequest("/api/inventory/ship", { method: "POST", body });
}'''
new = '''async function vpsInventoryMutation(path, body) {
  const result = await apiRequest(path, { method: "POST", body });
  invalidateVpsInventoryCache("");
  return result;
}

export function vpsSetQuantity(body) {
  return vpsInventoryMutation("/api/inventory/set-quantity", body);
}

export const vpsSetInventoryQuantity = vpsSetQuantity;

export function vpsSetMinimum(body) {
  return vpsInventoryMutation("/api/inventory/set-minimum", body);
}

export const vpsSetInventoryMinimum = vpsSetMinimum;

export function vpsAdjustInventory(body) {
  return vpsInventoryMutation("/api/inventory/adjust", body);
}

export function vpsTransferInventory(body) {
  return vpsInventoryMutation("/api/inventory/transfer", body);
}

export function vpsDirectTransfer(body) {
  return vpsInventoryMutation("/api/inventory/direct-transfer", body);
}

export function vpsShipInventory(body) {
  return vpsInventoryMutation("/api/inventory/ship", body);
}'''
if source.count(old) != 1:
    raise SystemExit(f"inventory mutation anchor count={source.count(old)}")
path.write_text(source.replace(old, new), encoding="utf-8")
