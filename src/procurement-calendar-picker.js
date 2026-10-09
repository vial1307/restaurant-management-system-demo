// Shared, timezone-independent calendar selection helpers for Procurement supplier closures.
// ISO calendar dates are represented as YYYY-MM-DD; no local UTC-midnight drift.
const ISO=/^\d{4}-\d{2}-\d{2}$/;
export function validProcurementDate(value){
  if(!ISO.test(String(value||"")))return false;
  const parsed=new Date(value+"T12:00:00Z");
  return !Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;
}
export function procurementShiftDate(value,days){
  if(!validProcurementDate(value)||!Number.isInteger(days))throw new Error("INVALID_CALENDAR_DATE");
  const date=new Date(value+"T12:00:00Z");
  date.setUTCDate(date.getUTCDate()+days);
  return date.toISOString().slice(0,10);
}
export function procurementDateRange(from,to,{limit=120}={}){
  if(!validProcurementDate(from)||!validProcurementDate(to))throw new Error("INVALID_CALENDAR_RANGE");
  const [start,end]=from<=to?[from,to]:[to,from];
  const dates=[];
  for(let day=start;day<=end;day=procurementShiftDate(day,1)){
    if(dates.length>=limit)throw new Error("TOO_MANY_CLOSED_DATES");
    dates.push(day);
  }
  return dates;
}
export function procurementAddClosedDates(current,start,end,{limit=120}={}){
  const validCurrent=(Array.isArray(current)?current:[]).filter(validProcurementDate);
  const next=new Set([...validCurrent,...procurementDateRange(start,end,{limit})]);
  if(next.size>limit)throw new Error("TOO_MANY_CLOSED_DATES");
  return [...next].sort();
}
export function procurementCalendarMonth(date){
  if(!validProcurementDate(date))throw new Error("INVALID_CALENDAR_MONTH");
  return date.slice(0,7);
}
export function procurementMoveMonth(month,offset){
  if(!/^\d{4}-\d{2}$/.test(month)||!Number.isInteger(offset))throw new Error("INVALID_CALENDAR_MONTH");
  const base=new Date(month+"-01T12:00:00Z");
  if(Number.isNaN(base.getTime()))throw new Error("INVALID_CALENDAR_MONTH");
  base.setUTCMonth(base.getUTCMonth()+offset);
  return base.toISOString().slice(0,7);
}
export function procurementMonthCells(month){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error("INVALID_CALENDAR_MONTH");
  const first=new Date(month+"-01T12:00:00Z");
  const offset=(first.getUTCDay()+6)%7; // Monday-first
  const count=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0,12)).getUTCDate();
  const cells=Array.from({length:offset},()=>null);
  for(let day=1;day<=count;day++)cells.push(month+"-"+String(day).padStart(2,"0"));
  return cells;
}
