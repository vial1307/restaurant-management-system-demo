// Finance OS read-only visual primitives; no sample money or network dependencies.
// SVG output is deterministic, accessible and limited to sanitized numeric datasets.
const fmt=n=>Number(n||0).toLocaleString("vi-VN",{maximumFractionDigits:0});
const compact=n=>Math.abs(n)>=1000000?(n/1000000).toFixed(1)+"m":Math.abs(n)>=1000?Math.round(n/1000)+"k":Math.round(n).toString();
const finite=n=>Number.isFinite(Number(n))?Number(n):0;
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const point=(n,min,max,top,bottom)=>bottom-(finite(n)-min)/(max-min||1)*(bottom-top);
const graphShell=(title,inner,desc)=>'<svg class="fin-graph-svg" viewBox="0 0 780 266" role="img" aria-label="'+esc(title)+': '+esc(desc)+'" preserveAspectRatio="xMidYMid meet">'+inner+'</svg>';
export function financeMonthlyTrend(months=[]){
 if(!months?.length)return '<div class="fin-list-empty">Chưa có dữ liệu theo tháng để vẽ biểu đồ.</div>';
 const items=months.slice(0,12).map(x=>({label:String(x.month||"").slice(5,7)+"/"+String(x.month||"").slice(2,4),
  income:finite(x.income_twd),expense:finite(x.expense_twd)}));
 const max=Math.max(1,...items.map(x=>Math.max(x.income,x.expense,Math.abs(x.income-x.expense))))*1.13;
 const n=items.length,step=710/n,barWidth=Math.min(18,step*.25),left=55,top=22,bottom=211;
 const grid=[0,.25,.5,.75,1].map(k=>{const y=point(k*max,0,max,top,bottom);
  return '<line x1="55" x2="762" y1="'+y+'" y2="'+y+'" stroke="#e6edf4" stroke-width="1"/>'+
  '<text x="48" y="'+(y+4)+'" text-anchor="end" class="fin-graph-axis">'+esc(compact(k*max))+'</text>'}).join("");
 const columns=items.map((m,i)=>{
  const x=left+step*(i+.5),incomeY=point(m.income,0,max,top,bottom),expenseY=point(m.expense,0,max,top,bottom);
  return '<rect x="'+(x-barWidth-2)+'" y="'+incomeY+'" width="'+barWidth+'" height="'+Math.max(0,bottom-incomeY)+'" rx="3" fill="#25b98f"/>'+
   '<rect x="'+(x+2)+'" y="'+expenseY+'" width="'+barWidth+'" height="'+Math.max(0,bottom-expenseY)+'" rx="3" fill="#f17678"/>'+
   '<text x="'+x+'" y="233" text-anchor="middle" class="fin-graph-axis">'+esc(m.label)+'</text>';
 }).join("");
 // Net series uses a symmetric scale around zero so negative monthly cashflow remains visible.
 const nets=items.map(m=>m.income-m.expense);
 const maxAbs=Math.max(1,...nets.map(Math.abs))*1.12;
 const coords=nets.map((v,i)=>{
  const x=left+step*(i+.5),y=point(v,-maxAbs,maxAbs,top,bottom);
  return {x,y,v};
 });
 const net=coords.map(p=>p.x.toFixed(1)+","+p.y.toFixed(1)).join(" ");
 const dots=coords.map(p=>'<circle cx="'+p.x+'" cy="'+p.y+'" r="4" fill="#2563eb" stroke="#fff" stroke-width="2"/>').join("");
 const gridNote='<text x="760" y="14" text-anchor="end" class="fin-graph-axis">Đường xanh: chênh lệch thu - chi, trục riêng</text>';
 return graphShell("Xu hướng thu chi và dòng tiền ròng 12 tháng",grid+columns+
   '<polyline points="'+net+'" stroke="#2563eb" fill="none" stroke-width="2.4" stroke-linejoin="round"/>'+dots+gridNote+
   '<line x1="55" x2="762" y1="211" y2="211" stroke="#bccbd9"/>',
   "Thu "+fmt(items.reduce((a,b)=>a+b.income,0))+"; Chi "+fmt(items.reduce((a,b)=>a+b.expense,0)));
}
export function financeLiquidityForecast(advisor){
 if(!advisor?.entries?.length)return '<div class="fin-list-empty">Chưa có lịch dự báo đủ ngày để dựng đường số dư.</div>';
 const entries=advisor.entries;
 const start=String(advisor.asOf),through=String(advisor.through);
 const asTime=Date.parse(start+"T00:00:00Z"),endTime=Date.parse(through+"T00:00:00Z");
 const days=Math.max(1,Math.round((endTime-asTime)/86400000)+1);
 const dayBalance=new Map();
 for(const e of entries)dayBalance.set(e.date,finite(e.projectedBalanceTwd));
 const series=[], daily=new Map();
 for(const e of entries){const v=daily.get(e.date)||{income:0,outflow:0};if(e.kind==="income")v.income+=finite(e.amountTwd);else v.outflow+=Math.abs(finite(e.amountTwd));daily.set(e.date,v);}
 let balance=finite(advisor.startingBalanceTwd);
 for(let i=0;i<days;i++){
  const date=new Date(asTime+i*86400000).toISOString().slice(0,10);
  if(dayBalance.has(date))balance=dayBalance.get(date);
  series.push({date,balance,...(daily.get(date)||{income:0,outflow:0})});
 }
 const min=Math.min(0,finite(advisor.bufferTwd),...series.map(x=>x.balance));
 const max=Math.max(1,finite(advisor.bufferTwd),...series.map(x=>x.balance))*1.06;
 const low=Math.min(min*1.05,min-1),left=55,right=762,top=24,bottom=209,step=(right-left)/Math.max(1,days-1);
 const grid=[0,.25,.5,.75,1].map(k=>{
  const v=low+(max-low)*k,y=point(v,low,max,top,bottom);
  return '<line x1="55" x2="762" y1="'+y+'" y2="'+y+'" stroke="#e6edf4"/>'+
    '<text x="48" y="'+(y+4)+'" text-anchor="end" class="fin-graph-axis">'+esc(compact(v))+'</text>';
 }).join("");
 const peak=Math.max(1,...series.map(x=>Math.max(x.income,x.outflow)));
 const columns=series.map((x,i)=>{
  const xpos=left+i*step;
  return (x.income?'<rect x="'+(xpos-1.8)+'" y="'+(bottom-(x.income/peak)*55)+'" width="2.2" height="'+(x.income/peak*55)+'" fill="#26b994" opacity=".8"/>':'')+
   (x.outflow?'<rect x="'+(xpos+.3)+'" y="'+(bottom-(x.outflow/peak)*55)+'" width="2.2" height="'+(x.outflow/peak*55)+'" fill="#ef777a" opacity=".8"/>':'');
 }).join("");
 const coords=series.map((x,i)=>(left+i*step).toFixed(2)+","+point(x.balance,low,max,top,bottom).toFixed(2)).join(" ");
 const bufferY=point(finite(advisor.bufferTwd),low,max,top,bottom);
 const ticks=[0,Math.floor((days-1)/4),Math.floor((days-1)/2),Math.floor(3*(days-1)/4),days-1].map(i=>
   '<text class="fin-graph-axis" text-anchor="middle" x="'+(left+i*step)+'" y="232">'+esc(series[i].date.slice(5))+'</text>').join("");
 const marker=advisor.earliestRisk&&advisor.earliestRisk.date>=start&&advisor.earliestRisk.date<=through?
   (()=>{const idx=Math.round((Date.parse(advisor.earliestRisk.date+"T00:00:00Z")-asTime)/86400000),x=left+idx*step;
    return '<line x1="'+x+'" x2="'+x+'" y1="24" y2="211" stroke="#e75e6e" stroke-dasharray="4 4"/>'+
      '<text x="'+Math.min(x+5,650)+'" y="17" class="fin-graph-alert">Nguy cơ hụt: '+esc(advisor.earliestRisk.date)+'</text>';})():"";
 return graphShell("Đồ thị thanh khoản theo từng ngày",grid+columns+
   '<line x1="55" x2="762" y1="'+bufferY+'" y2="'+bufferY+'" stroke="#e6a449" stroke-dasharray="5 4"/>'+
   '<polyline points="'+coords+'" fill="none" stroke="#2463e9" stroke-width="2.8" stroke-linejoin="round"/>'+ticks+marker,
   "Số dư thấp nhất "+fmt(advisor.minimumBalanceTwd)+" TWD, dự trữ "+fmt(advisor.bufferTwd)+" TWD");
}
export function financeDonut(categories=[]){
 const entries=categories.filter(x=>finite(x.value)>0).slice(0,12);
 const total=entries.reduce((sum,x)=>sum+finite(x.value),0);
 if(!total)return '<div class="fin-list-empty">Chưa có chi tiêu thực tế theo danh mục trong kỳ.</div>';
 const colors=["#2879ee","#24b88f","#fb9a35","#9468ea","#f3747d","#899bad","#19a7bb","#edbd4d"];
 let cursor=0;
 const stops=entries.map((e,i)=>{const start=cursor;cursor+=finite(e.value)/total*100;return colors[i%colors.length]+" "+start.toFixed(2)+"% "+cursor.toFixed(2)+"%";}).join(",");
 return '<div class="fin-donut-wrap"><div class="fin-donut" style="background:conic-gradient('+stops+')">'+
   '<div><strong>'+esc(fmt(total))+'</strong><small>Tổng đã chi<br/>TWD</small></div></div>'+
   '<div class="fin-donut-legend">'+entries.map((x,i)=>'<div><span class="fin-donut-dot" style="background:'+colors[i%colors.length]+'"></span>'+
   '<span>'+esc(x.name)+'</span><strong>'+Math.round(finite(x.value)/total*100)+'%</strong><small>'+esc(fmt(x.value))+'</small></div>').join("")+'</div></div>';
}
