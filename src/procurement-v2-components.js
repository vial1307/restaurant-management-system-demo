import { TEXT } from "./i18n.js";

// Presentation-only components. No inventory / procurement records are owned here.
// All server-backed quantities, identifiers and permissions arrive from the caller.
export function procurementEscape(value){
  return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
export function procurementCopy(key,language="vi",{paired=true}={}){
  const zh=TEXT.zh.procurementUi?.[key],vi=TEXT.vi.procurementUi?.[key];
  if(typeof zh!=="string"||typeof vi!=="string")throw new Error("MISSING_PROCUREMENT_I18N_KEY:"+key);
  return language==="zh"||!paired?procurementEscape(language==="zh"?zh:vi):procurementEscape(zh+" / "+vi);
}
export function procurementRawCopy(key,language="vi"){
  const raw=TEXT[language==="zh"?"zh":"vi"].procurementUi?.[key];
  if(typeof raw!=="string")throw new Error("MISSING_PROCUREMENT_I18N_KEY:"+key);
  return raw;
}
export function procurementTabs(active,language="vi"){
  const tabs=[["list","tabList"],["supplier","tabSupplier"],["group","tabGroup"],["history","tabHistory"],["settings","tabSettings"]];
  return '<nav class="pv2-tabs" aria-label="'+procurementCopy("title",language,{paired:false})+'">'+
    tabs.map(([id,key])=>'<button type="button" class="pv2-tab '+(active===id?"active":"")+'" data-pv2-action="tab" data-tab="'+id+'">'+
      '<strong>'+procurementEscape(procurementRawCopy(key,"zh"))+'</strong>'+
      '<small>'+procurementEscape(procurementRawCopy(key,"vi"))+'</small></button>').join("")+"</nav>";
}
export function procurementStat(key,value,format){
  return '<div class="pv2-stat"><span>'+procurementEscape(procurementRawCopy(key,"zh"))+
    '<small>'+procurementEscape(procurementRawCopy(key,"vi"))+'</small></span><strong>'+format(value)+"</strong></div>";
}
export function procurementPanel({title="",body="",actions="",language="vi",classes=""}){
  const titleHtml=title?'<header class="pv2-section-head"><h3>'+procurementCopy(title,language)+'</h3>'+actions+"</header>":"";
  return '<section class="pv2-panel '+procurementEscape(classes)+'">'+titleHtml+body+"</section>";
}
export function procurementSettingsModal({title,body}){
  return '<div class="pv2-dialog-backdrop" data-pv2-backdrop><div class="pv2-dialog" role="dialog" aria-modal="true" aria-labelledby="pv2-dialog-title">'+
    '<form class="pv2-panel pv2-editor" data-pv2-form="rule"><header class="pv2-section-head"><h3 id="pv2-dialog-title">'+title+
    '</h3><button type="button" aria-label="'+procurementCopy("close")+'" data-pv2-action="close-editor">×</button></header>'+
    body+"</form></div></div>";
}
export function procurementSupplierCard({supplier,editable,language}){
  const safe=procurementEscape;
  return '<div class="pv2-supplier-card"><strong>'+safe(supplier.name_zh_tw)+'</strong><small>'+safe(supplier.name_vi)+'</small>'+
    '<span>'+procurementCopy("restDays",language)+': '+safe(supplier.closedWeekdays.join(",")||"—")+'</span>'+
    '<span>'+procurementCopy("delivery",language)+': '+Number(supplier.leadDays)+' '+procurementCopy("daysUnit",language)+'</span>'+
    (editable?'<button type="button" data-pv2-action="edit-supplier" data-id="'+safe(supplier.id)+'">'+procurementCopy("edit",language)+'</button>':"")+"</div>";
}
export function procurementProductCard(row,{language="vi",editable=false,format}){
  const {item,rule,supplier,stock,plan,selected,amount}=row;
  const safe=procurementEscape, label=(key)=>procurementCopy(key,language);
  const ready=Boolean(rule?.enabled&&supplier&&plan?.canOrder),risk=Boolean(plan?.preArrivalRisk);
  const name=language==="zh"?item.name_zh_tw||item.name_vi:item.name_vi||item.name_zh_tw;
  const alternate=language==="zh"?item.name_vi:item.name_zh_tw;
  const value=(x)=>format(x);
  const badge=(key,type)=>'<span class="pv2-badge pv2-'+type+'">'+label(key)+"</span>";
  return '<article class="pv2-product" data-pv2-id="'+safe(item.id)+'" data-pv2-category="'+safe(item.category_code)+'" data-pv2-supplier="'+safe(supplier?.id||"unassigned")+'">'+
    '<div class="pv2-cell pv2-select"><input type="checkbox" data-pv2-select="'+safe(item.id)+'"'+(selected?" checked":"")+
      (!ready||!editable?" disabled":"")+' aria-label="'+safe(name)+'"/></div>'+
    '<div class="pv2-cell pv2-name"><strong>'+safe(name)+'</strong><small>'+safe(alternate)+'</small><small>'+
      safe(item.unit||"")+' · '+safe(item.category_code||"")+"</small></div>"+
    '<div class="pv2-cell"><span class="pv2-mobile-label">'+label("supplierShort")+'</span>'+
      (supplier?'<strong>'+safe(language==="zh"?supplier.name_zh_tw:supplier.name_vi||supplier.name_zh_tw)+"</strong>":badge("notConfigured","warning"))+"</div>"+
    '<div class="pv2-cell pv2-use"><span class="pv2-mobile-label">'+label("dailyUsage")+'</span><strong>'+
      (rule?value(rule.weekdayDemand):"—")+" / "+(rule?value(rule.holidayDemand):"—")+'</strong><small>'+safe(item.unit||"")+"</small></div>"+
    '<div class="pv2-cell pv2-stock"><span class="pv2-mobile-label">'+label("stockQty")+'</span><strong>'+
      value(stock)+'</strong><small>'+safe(item.unit||"")+"</small></div>"+
    '<div class="pv2-cell"><span class="pv2-mobile-label">'+label("suggested")+'</span><strong>'+
      (ready?value(plan.orderUnits):"—")+'</strong><small>'+ (ready?safe(plan.arrival):label("notConfigured"))+'</small>'+
      (risk?badge("riskBeforeArrival","danger"):"")+"</div>"+
    '<label class="pv2-cell pv2-quantity"><span class="pv2-mobile-label">'+label("orderQty")+'</span>'+
      '<input type="number" data-pv2-qty="'+safe(item.id)+'" min="0" step="1" value="'+value(amount)+'"'+
      (!ready||!editable?" disabled":"")+'/>'+
      '<small>'+safe(rule?.packageUnit||item.unit||"")+"</small></label></article>";
}
