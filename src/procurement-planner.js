// Pure procurement planning rules. Dates are Taiwan local calendar dates (YYYY-MM-DD).
// All product identities and policy values come from PostgreSQL; no catalog defaults here.
const dateRe=/^\d{4}-\d{2}-\d{2}$/;
export function addCalendarDays(date,days) {
  if (!dateRe.test(String(date||""))) throw new Error("INVALID_DATE");
  const d=new Date(date+"T12:00:00Z");
  d.setUTCDate(d.getUTCDate()+Number(days));
  return d.toISOString().slice(0,10);
}
export function supplierClosed(date,supplier={}) {
  const wd=new Date(date+"T12:00:00Z").getUTCDay();
  return (supplier.closedWeekdays||[]).map(Number).includes(wd) || (supplier.closedDates||[]).includes(date);
}
export function nextReceiptDate(orderDate,supplier={}) {
  if (supplierClosed(orderDate,supplier)) return null;
  let date=addCalendarDays(orderDate,Number(supplier.leadDays||0));
  for(let n=0;n<400;n++){
    if (!supplierClosed(date,supplier)) return date;
    date=addCalendarDays(date,1);
  }
  return null;
}
export function consumptionForDay(date,rule,calendar=new Map()) {
  const type=calendar.get(date)||"normal";
  if(type==="closed")return 0;
  if(type==="holiday")return Number(rule.holidayDemand||0);
  const weekday=new Date(date+"T12:00:00Z").getUTCDay();
  return Number(weekday===0||weekday===6?rule.weekendDemand:rule.weekdayDemand)||0;
}
export function planProcurementLine({orderDate,stock,rule,supplier,calendar=[],incoming=[]}) {
  const first=nextReceiptDate(orderDate,supplier);
  if(!first || !rule?.enabled || !rule?.supplierId)return {canOrder:false,orderUnits:0,required:0,arrival:first,reason:"SUPPLIER_CLOSED_OR_NOT_CONFIGURED"};
  const map=calendar instanceof Map?calendar:new Map(calendar.map(x=>[x.date,x.type]));
  const review=Number(supplier.reviewDays||1);
  let nextOrder=addCalendarDays(orderDate,review);
  for(let n=0;n<400&&supplierClosed(nextOrder,supplier);n++)nextOrder=addCalendarDays(nextOrder,1);
  const next=nextReceiptDate(nextOrder,supplier);
  if(!next)return {canOrder:false,orderUnits:0,required:0,arrival:first,reason:"NO_NEXT_DELIVERY"};
  let demand=0, beforeArrival=0, days=0;
  // Bound calculations to a normal planning horizon, not unbounded calendar data.
  for(let d=orderDate;d<next&&days<400;d=addCalendarDays(d,1),days++){
    const usage=consumptionForDay(d,rule,map);
    demand+=usage;
    if(d<first)beforeArrival+=usage;
  }
  const confirmedIncoming=(incoming||[])
    .filter(x=>x.expectedArrival<=next&&x.status==="submitted")
    .reduce((total,x)=>total+Number(x.baseQuantity||0),0);
  const available=Math.max(0,Number(stock||0));
  const safety=Math.max(0,Number(rule.safetyStock||0));
  const shortage=Math.max(0,demand+safety-available-confirmedIncoming);
  const packageSize=Number(rule.packageSize||1);
  const orderUnits=Math.ceil((shortage/packageSize)-1e-9);
  return {
    canOrder:true,arrival:first,nextArrival:next,days,demand,beforeArrival,
    stock:available,incoming:confirmedIncoming,safety,shortage,
    preArrivalRisk:available+incoming.filter(x=>x.expectedArrival<first&&x.status==="submitted").reduce((t,x)=>t+Number(x.baseQuantity||0),0)<beforeArrival,
    packageSize,orderUnits,orderQuantity:orderUnits*packageSize,
    remaining:available+confirmedIncoming+orderUnits*packageSize-demand,
  };
}
