// Pure, deterministic classification. It never assumes a friend may be postponed
// or that an unknown card minimum equals the entire outstanding principal.
export const creditorLabels=Object.freeze({
  bank_loan:"Ngân hàng",credit_card:"Thẻ tín dụng",
  friend_family:"Người quen / gia đình",installment_provider:"Trả góp",other:"Khác"
});
export const obligationLabels=Object.freeze({
  fixed:"Đã cam kết đúng hạn",agreed_flexible:"Lịch linh hoạt đã thỏa thuận",
  unconfirmed:"Chưa xác nhận lịch trả"
});
export function daysUntil(today,due){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(today)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(due)))
    return null;
  const a=Date.parse(today+"T00:00:00Z"),b=Date.parse(due+"T00:00:00Z");
  return Number.isFinite(a)&&Number.isFinite(b)?Math.round((b-a)/86400000):null;
}
export function debtMentorAlerts(debts,asOf){
  const alerts=[];
  for(const d of debts){
    if(Number(d.outstanding_amount)<=0)continue;
    const type=d.creditor_type||"other",obligation=d.obligation_type||"unconfirmed";
    if(obligation!=="unconfirmed" && !d.due_date){
      alerts.push({debtId:d.id,kind:"missing_agreed_date",date:null,urgency:"review",
        message:"Khoản "+d.name+" được phân loại có cam kết, nhưng chưa nhập ngày trả chính xác. Hãy xác nhận và nhập hạn trước khi mô phỏng."});
    }
    if(obligation==="unconfirmed" && d.due_date){
      alerts.push({debtId:d.id,kind:"verify_due",date:d.due_date,urgency:"review",
        message:"Hãy xác nhận lịch trả đã ghi cho "+d.name+". Chưa rõ có cam kết cố định hay không."});
    }
    if(obligation==="unconfirmed" && !d.due_date && !d.next_contact_date){
      alerts.push({debtId:d.id,kind:"unknown_schedule",date:null,urgency:"review",
        message:"Khoản "+d.name+" chưa có lịch trả hoặc ngày liên hệ để xác nhận."});
    }
    if(d.next_contact_date){
      const n=daysUntil(asOf,String(d.next_contact_date).slice(0,10));
      if(n!==null && n<=7)
        alerts.push({debtId:d.id,kind:"contact",date:String(d.next_contact_date).slice(0,10),
          urgency:n<0?"overdue":n<=1?"soon":"review",
          message:"Liên hệ xác nhận lịch trả với "+d.name+"; đây không phải hạn thanh toán tự động."});
    }
    const due=String(d.due_date||"").slice(0,10);
    const days=daysUntil(asOf,due);
    if(obligation==="unconfirmed"||days===null ||days>7)continue;
    // Partial payments are not automatically linked to a specific installment.
    // A debt can be outstanding after the deadline without proof this installment was missed.
    alerts.push({debtId:d.id,kind:"due",date:due,urgency:days<0?"reconcile":days<=1?"soon":"upcoming",
      message:(days<0?"Đối chiếu khoản đến hạn của ":"Sắp đến hạn khoản ")+d.name+
        ". "+(d.minimum_due_amount===null||d.minimum_due_amount===undefined?
        "Chưa khai báo số tiền bắt buộc phải trả; không tự lấy toàn bộ dư nợ.":"Mức đến hạn đã nhập: "+d.minimum_due_amount+" "+d.currency_code+".")});
    if(d.negotiation_status==="requested")
      alerts.push({debtId:d.id,kind:"unconfirmed_renegotiation",date:due,urgency:"soon",
        message:"Yêu cầu đổi lịch với "+d.name+" chưa được xác nhận; giữ nguyên cam kết hiện tại."});
  }
  const rank={soon:0,reconcile:1,overdue:2,upcoming:3,review:4};
  return alerts.sort((a,b)=>(rank[a.urgency]??9)-(rank[b.urgency]??9)||
     String(a.date||"9999").localeCompare(String(b.date||"9999")));
}
