// Pure read-only procurement threshold evaluation.
// Rules originate in procurement_product_rules; quantity comes exclusively
// from Inventory's authoritative per-location stock snapshot.
export function evaluateLocationReorderAlert({rule,stockRows=[]}={}){
  if(!rule?.reorderAlertEnabled)return {status:"disabled",triggered:false};
  const locationId=String(rule.reorderLocationId||"");
  const reference=Number(rule.reorderReferenceQuantity);
  const numerator=Number(rule.reorderNumerator);
  const denominator=Number(rule.reorderDenominator);
  if(!locationId||!Number.isFinite(reference)||reference<=0||
     !Number.isInteger(numerator)||!Number.isInteger(denominator)||
     numerator<1||denominator<1||numerator>denominator)
    return {status:"invalid",triggered:false};
  const row=(Array.isArray(stockRows)?stockRows:[]).find(x=>
    String(x.location_id||"")===locationId&&x.configured!==false);
  if(!row)return {status:"missingStock",triggered:false};
  const remaining=Number(row.quantity);
  if(!Number.isFinite(remaining))return {status:"invalidStock",triggered:false};
  // Compare cross-multiplied numbers to preserve exact 1/3 semantics; avoid
  // rounding down to a false positive at a near-threshold fractional value.
  const triggered=remaining*denominator <= reference*numerator+1e-8;
  return {status:triggered?"alert":"ok",triggered,remaining,
    threshold:reference*numerator/denominator,reference,numerator,denominator,locationId};
}
