// Owner-scoped deterministic mentor briefing. Never writes to the ledger.
// The due-date contract and a month's earmark are NOT interchangeable:
// an allocation dated after a promised payment cannot cover it on time.
import {twdUnits,twdText} from "./finance-advisor-engine.mjs";

const isoDate=x=>typeof x==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x)?x:null;
const positive=x=>x>0n?x:0n;
const safeText=x=>String(x??"").slice(0,180);
const asMicro=x=>twdUnits(String(x??"0"));
const order=(a,b)=>String(a.date||"9999-12-31").localeCompare(String(b.date||"9999-12-31"));
const debtLabels={bank_loan:"Ngân hàng",credit_card:"Thẻ tín dụng",
 friend_family:"Người quen / gia đình",installment_provider:"Trả góp",other:"Khác"};

export function buildFinanceMentorBrief({forecast,debts=[],asOf=forecast.asOf}){
 const entries=Array.isArray(forecast.entries)?forecast.entries:[];
 const reserve=asMicro(forecast.bufferTwd??"0");
 const opening=asMicro(forecast.startingBalanceTwd??"0");
 const nextIncome=entries.find(e=>e.kind==="income"&&e.date>=asOf&&asMicro(e.amountTwd)>0n)||null;
 const horizonEnd=forecast.through;
 const beforeIncome=nextIncome?.date||null;
 let running=opening,minBefore=opening,minBeforeDate=asOf;
 // "Before salary" excludes the salary credit even if multiple events share its date.
 for(const event of entries){
   if(beforeIncome&&event.date>=beforeIncome)break;
   running+=asMicro(event.amountTwd);
   if(running<minBefore){minBefore=running;minBeforeDate=event.date;}
 }
 const obligations=[],needsConfirmation=[],uncovered=[];
 for(const d of debts){
   const outstanding=asMicro(d.outstanding_amount??"0");
   if(outstanding<=0n)continue;
   const creditorType=debtLabels[d.creditor_type]?d.creditor_type:"other";
   const fixed=d.obligation_type==="fixed"||
    (d.obligation_type==="agreed_flexible"&&d.negotiation_status==="confirmed");
   const due=isoDate(d.due_date),currency=safeText(d.currency_code||"TWD");
   const record={id:d.id,name:safeText(d.name),creditorType,
    creditorLabel:debtLabels[creditorType],obligationType:d.obligation_type||"unconfirmed",
    negotiationStatus:d.negotiation_status||"none",currency,dueDate:due,
    outstandingAmount:String(d.outstanding_amount??"0"),minimumAmount:d.minimum_due_amount??null};
   if(!fixed||!due||d.minimum_due_amount===null||d.minimum_due_amount===undefined){
     needsConfirmation.push({...record,reason:!fixed?"Chưa có lịch trả cố định đã được xác nhận":
       !due?"Thiếu ngày đến hạn đã cam kết":"Thiếu số tiền phải thanh toán kỳ này"});
     continue;
   }
   const dueAmount=asMicro(d.minimum_due_amount);
   if(dueAmount===0n){needsConfirmation.push({...record,reason:"Mức thanh toán kỳ này đang là 0; cần kiểm tra lại"});continue;}
   if(due<asOf){needsConfirmation.push({...record,reason:"Hạn trả đã qua; cần đối chiếu khoản đã thanh toán, không tự kết luận quá hạn"});continue;}
   if(due>horizonEnd)continue;
   let allocated=0n;
   if(currency==="TWD"){
     for(const e of entries){
       if(e.source==="debt_fund"&&String(e.sourceId)===String(d.id)&&
          e.date>=asOf&&e.date<=due){
         allocated+=positive(-asMicro(e.amountTwd));
       }
     }
   }
   const gap=currency==="TWD"?positive(dueAmount-allocated):null;
   const dated={...record,minimumAmount:String(d.minimum_due_amount),
     allocatedBeforeDueTwd:currency==="TWD"?twdText(allocated):null,
     uncoveredBeforeDueTwd:gap===null?null:twdText(gap),
     scheduled:currency==="TWD"&&gap===0n};
   obligations.push(dated);
   if(gap===null || gap>0n)uncovered.push(dated);
 }
 obligations.sort((a,b)=>order({date:a.dueDate},{date:b.dueDate}));
 uncovered.sort((a,b)=>order({date:a.dueDate},{date:b.dueDate}));
 const events=[];
 let runningAt=opening;
 let indexed=0,unbudgeted=0n;
 for(const d of obligations){
   if(d.currency!=="TWD"||d.uncoveredBeforeDueTwd===null)continue;
   // Evaluate balance *before* applying the uncaptured commitment at its due day,
   // while not crediting salary arriving later. Cumulative test is a scenario,
   // not a posted debit or proof that a payment has been missed.
   while(indexed<entries.length&&entries[indexed].date<=d.dueDate){
     runningAt+=asMicro(entries[indexed].amountTwd);
     indexed++;
   }
   unbudgeted+=asMicro(d.uncoveredBeforeDueTwd);
   const hypothetical=runningAt-unbudgeted;
   events.push({date:d.dueDate,debtId:d.id,name:d.name,
    balanceIfRequiredPaidTwd:twdText(hypothetical),
    gapToBufferTwd:twdText(positive(reserve-hypothetical))});
 }
 const relevantEvents=beforeIncome?
  events.filter(x=>x.date<beforeIncome):events;
 const maxShortfall=relevantEvents.reduce((max,e)=>{
  const gap=asMicro(e.gapToBufferTwd);return gap>max?gap:max;
 },positive(reserve-minBefore));
 const flags=[];
 if(forecast.earliestRisk)flags.push({kind:"risk",date:forecast.earliestRisk.date,
   title:"Dòng tiền dự kiến xuống dưới dự phòng",detail:"Thiếu "+
   forecast.earliestRisk.gapTwd+" TWD vào "+forecast.earliestRisk.date+
   ". Khoản lương sau ngày này không giải quyết được hạn trả trước đó."});
 if(relevantEvents.some(x=>asMicro(x.gapToBufferTwd)>0n))
   flags.push({kind:"commitment",date:relevantEvents.find(x=>asMicro(x.gapToBufferTwd)>0n).date,
    title:"Cam kết chưa được phân bổ đủ trước hạn",
    detail:"Kịch bản giả định thực hiện đúng các khoản TWD đã xác nhận có nguy cơ thiếu tiền trước kỳ thu tiếp theo."});
 if(uncovered.some(x=>x.currency!=="TWD"))
   flags.push({kind:"fx",date:null,title:"Có nghĩa vụ ngoại tệ chưa quy đổi",
    detail:"Không tự chuyển VND hoặc ngoại tệ thành số dư TWD; cần tỷ giá và lịch chuyển tiền xác nhận."});
 if(needsConfirmation.length)
   flags.push({kind:"data",date:null,title:"Có công nợ cần xác nhận điều khoản",
    detail:"Phải xác minh số tiền tối thiểu, thời hạn hoặc lịch thương lượng của "+
      needsConfirmation.length+" khoản trước khi chốt phương án trả."});
 const worstGap=positive(reserve-minBefore);
 const actions=[
  ...uncovered.slice(0,6).map(d=>({priority:"due",date:d.dueDate,
    title:d.name+" · "+d.creditorLabel,detail:d.currency==="TWD"?
    "Chưa phân bổ đủ "+d.uncoveredBeforeDueTwd+" TWD trước hạn "+
     d.dueDate+". Hãy đối chiếu với số tiền đã trả và lịch quỹ nợ; không tự hoãn.":
    "Nợ "+d.currency+" cần xác nhận tỷ giá thanh toán và nguồn chuyển tiền trước "+
     d.dueDate+"."})),
  ...needsConfirmation.slice(0,6).map(d=>({priority:"verify",date:d.dueDate,
    title:d.name+" · "+d.creditorLabel,detail:d.reason}))
 ];
 return {
  asOf,through:horizonEnd,days:forecast.days,currency:"TWD",
  startBalanceTwd:forecast.startingBalanceTwd,
  endingBalanceTwd:forecast.projectedEndingTwd,
  minimumBalanceTwd:forecast.minimumBalanceTwd,
  minimumDate:forecast.minimumDate,
  reserveTwd:forecast.bufferTwd,
  nextIncome:nextIncome?{date:nextIncome.date,amountTwd:nextIncome.amountTwd,label:safeText(nextIncome.label)}:null,
  minBeforeNextIncomeTwd:twdText(minBefore),
  minBeforeNextIncomeDate:minBeforeDate,
  shortageToReserveBeforeNextIncomeTwd:twdText(worstGap),
  conservativeUnfundedRiskBeforeIncomeTwd:twdText(maxShortfall),
  committedCount:obligations.length,uncoveredCount:uncovered.length,
  unconfirmedCount:needsConfirmation.length,
  obligations,uncovered,needsConfirmation,flags,actions,
  forecastWarnings:(forecast.warnings||[]).slice(0,12),
  limitations:[
   "Dự báo không tự ghi chi trả; số dư dự kiến không phải tiền đã thực nhận.",
   "Khoản quỹ nợ sau hạn trả không được coi là đủ tiền đúng ngày.",
   "Kịch bản cam kết TWD giả định các mức phải trả đã nhập còn hiệu lực; không phải bằng chứng trễ hạn.",
   "Nợ ngoại tệ, kỳ trả góp chưa nhập và giao dịch chưa cập nhật có thể làm dự báo thiếu chi phí."
  ],source:"finance_postgresql",readOnly:true,aiGenerated:false
 };
}
