// Procurement safety stock follows the canonical Inventory location minimums
// until the operator explicitly sets a Procurement-specific override.
// Inputs are server-origin inventory rows, not a duplicate product catalogue.
export function inventorySafetyStock(stockRows=[]) {
  if(!Array.isArray(stockRows))return 0;
  return stockRows.reduce((sum,row)=>{
    if(row?.configured===false||row?.minimum_enabled===false)return sum;
    const amount=Number(row?.minimum_quantity);
    return Number.isFinite(amount)&&amount>0?sum+amount:sum;
  },0);
}

export function effectiveProcurementSafetyStock(rule,stockRows=[]) {
  if(rule?.safetyStockMode==="custom"){
    const amount=Number(rule.safetyStock);
    return { source:"custom",value:Number.isFinite(amount)&&amount>=0?amount:0 };
  }
  return { source:"inventory",value:inventorySafetyStock(stockRows) };
}
