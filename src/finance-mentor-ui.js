// Finance Mentor is intentionally a separate UI module. No Kitchen data or localStorage.
export function createFinanceMentorUI({api,safe,card,title,money,notify,onChange}){
 const state={loaded:false,loading:false,status:null,digest:null,conversations:[],
   conversationId:null,messages:[],sending:false,error:null};
 const s=value=>safe(String(value??""));
 const command=(label,action,id="",className="soft")=>
  '<button type="button" class="btn '+className+' small" data-mentor-action="'+s(action)+
  '" data-id="'+s(id)+'">'+s(label)+'</button>';
 function alertList(limit=8){
  if(!state.loaded)return '<div class="notice">Đang đọc lịch công nợ từ PostgreSQL; không gọi AI tự động.</div>';
  if(!state.digest)return '<div class="notice warn">Chưa thể đọc dữ liệu nghĩa vụ. '+s(state.error||"")+'</div>';
  const alerts=state.digest.alerts||[];
  return alerts.length?alerts.slice(0,limit).map(x=>
   '<div class="alert-row"><div><strong>'+s(x.date||"Chưa xác nhận ngày")+' · '+
   s(({due:"Nợ đến hạn",contact:"Cần liên hệ",unknown_schedule:"Thiếu lịch trả",
    verify_due:"Kiểm tra cam kết",missing_agreed_date:"Thiếu hạn cam kết",unconfirmed_renegotiation:"Chờ đồng ý đổi lịch"})[x.kind]||"Cần kiểm tra")+
   '</strong><p>'+s(x.message)+'</p></div></div>').join(""):
   '<div class="notice">Chưa có cảnh báo đến hạn trong 7 ngày theo dữ liệu đã khai báo. Vẫn cần kiểm tra nghĩa vụ chưa xác nhận.</div>';
 }
 function brief(){
  return '<div class="stack">'+alertList(3)+
   '<div class="notice">Ngày thanh toán trong kế hoạch không chứng minh khoản nợ đã được trả. Kiểm tra lịch sử giao dịch thực tế.</div></div>';
 }
 function debtList(){
  const ds=state.digest?.debts||[];
  if(!ds.length)return '<div class="empty">Chưa có khoản nợ. Thêm tại Công nợ & mục tiêu.</div>';
  return ds.map(d=>
   '<div class="mentor-debt"><div><strong>'+s(d.name)+'</strong><p>'+
    s(state.digest.creditorLabels?.[d.creditor_type]||d.creditor_type)+' · '+
    s(state.digest.obligationLabels?.[d.obligation_type]||d.obligation_type)+'</p>'+
    '<p>Dư nợ '+s(money(d.outstanding_amount,d.currency_code))+
    ' · Hạn '+s(d.due_date||"Chưa rõ")+'</p><p>Tối thiểu kỳ này: '+
    (d.minimum_due_amount===null?"Chưa khai báo":s(money(d.minimum_due_amount,d.currency_code)))+
    '</p></div>'+command("Điều khoản","terms",d.id)+'</div>').join("");
 }
 function historyList(){
  return (state.conversations||[]).length?state.conversations.slice(0,10).map(c=>
   '<div class="rowitem"><div><strong>'+s(c.title)+'</strong><p>'+
   s(String(c.updated_at).slice(0,10))+'</p></div><div class="tools">'+
   command("Mở","open",c.id)+command("Xóa","delete",c.id)+'</div></div>').join(""):
   '<div class="empty">Chưa có hội thoại nào được lưu.</div>';
 }
 function chat(){
  const messages=state.messages.length?state.messages:[
   {role:"assistant",content:"Mình có thể phân tích số dư trước kỳ lương, phân biệt nợ người quen và ngân hàng, hoặc so sánh các phương án. Hãy đặt câu hỏi, mình không tự ghi giao dịch."}];
  return '<div class="mentor-chat" role="log" aria-live="polite">'+messages.map(m=>
   '<div class="mentor-bubble '+(m.role==="user"?"mine":"advisor")+'"><strong>'+
   (m.role==="user"?"Bạn":"AI Mentor")+'</strong><p>'+s(m.content)+'</p></div>').join("")+
   (state.sending?'<div class="mentor-bubble advisor">Đang kiểm tra dữ liệu và phân tích…</div>':"")+'</div>';
 }
 function render(){
  const enabled=!!state.status?.configured;
  const config=enabled?'<div class="notice">AI được cấu hình · Chỉ gửi dữ liệu tới OpenAI khi bạn bấm Phân tích.</div>':
   '<div class="notice warn">AI chưa kích hoạt trên VPS. Để trò chuyện cần cấu hình OpenAI API key riêng trên server; phần công nợ vẫn hoạt động.</div>';
  const prompts=["Lịch trả nợ nào có nguy cơ thiếu tiền trước kỳ lương tới?",
    "Khoản nào là nghĩa vụ bắt buộc? Khoản người quen nào cần xác nhận?",
    "Nếu thu nhập giảm, 90 ngày tới tôi nên phân bổ ra sao?"];
  return title("AI Financial Mentor","Đọc dữ liệu có thật, phân tích theo từng ngày và phản biện khi kế hoạch thiếu an toàn.")+
   '<div class="layout-2 mentor-layout"><div class="stack">'+
   card("Trò chuyện với Mentor",config+chat()+
    '<div class="mentor-prompts">'+prompts.map((q,i)=>command(q,"example",i)).join("")+'</div>'+
    '<div class="mentor-compose"><textarea id="mentor-query" rows="3" maxlength="2000" placeholder="Nhập câu hỏi về dòng tiền, công nợ, kỳ lương..." '+
    (state.sending?"disabled":"")+'></textarea>'+
    (enabled?command(state.sending?"Đang phân tích":"Phân tích","send","","primary"):
    '<button class="btn primary small" disabled>Chưa cấu hình AI</button>')+'</div>'+
    '<div class="notice">Bản trả lời sử dụng dữ liệu PostgreSQL đã nhập, không tự chuyển tiền hay thay đổi hợp đồng. Hội thoại được lưu riêng trong Finance Database và có thể xóa.</div>',
    command("Hội thoại mới","new"))+
   card("Lịch sử trò chuyện",historyList())+
   '</div><div class="stack">'+
   card("Các khoản cần chú ý",alertList(10),command("Làm mới","reload"))+
   card("Phân loại nghĩa vụ",debtList(),'<button type="button" class="btn small soft" data-tab="commitments">+ Thêm công nợ</button>',
    "Người quen không mặc nhiên được hoãn. Ngân hàng không đồng nghĩa phải trả hết toàn bộ dư nợ trong kỳ.")+
   '<div class="notice warn">Cờ nhắc nợ mới lưu lựa chọn trong hệ thống. Chưa có thông báo đẩy/email hoặc AI chạy nền; tính năng này cần cấp phép và cấu hình riêng.</div>'+
   '</div></div>';
 }
 async function load({force=false}={}){
  if(state.loading||state.loaded&&!force)return;
  state.loading=true;
  try{
   const results=await Promise.allSettled([api("/mentor/status"),api("/mentor/obligations"),api("/mentor/conversations")]);
   state.status=results[0].status==="fulfilled"?results[0].value:{configured:false};
   if(results[1].status==="fulfilled")state.digest=results[1].value;
   else state.error=String(results[1].reason?.message||"Không kết nối được Database.");
   if(results[2].status==="fulfilled")state.conversations=results[2].value.conversations||[];
   state.loaded=true;
  }finally{state.loading=false;onChange();}
 }
 function select(name,label,choices,current){
  return '<label>'+s(label)+'<select name="'+s(name)+'">'+choices.map(([value,title])=>
   '<option value="'+s(value)+'"'+(String(value)===String(current)?" selected":"")+'>'+s(title)+'</option>').join("")+'</select></label>';
 }
 function input(name,label,value,type="text",attrs=""){
  return '<label>'+s(label)+'<input name="'+s(name)+'" type="'+type+'" value="'+s(value||"")+
   '" '+attrs+'></label>';
 }
 function dialogFor(d){
  const old=document.getElementById("mentor-terms-dialog");if(old)old.remove();
  const doc=document.createElement("dialog");doc.id="mentor-terms-dialog";doc.className="editor";
  doc.innerHTML='<div class="editor-header"><h2>Điều khoản · '+s(d.name)+'</h2>'+
   '<button type="button" data-mentor-action="close">×</button></div>'+
   '<form id="mentor-terms-form"><div id="finance-fields">'+
   '<div class="notice">Ngày đến hạn hiện có: '+s(d.due_date||"Chưa nhập")+
   '. Để sửa hạn gốc, mở Công nợ & mục tiêu. Yêu cầu đổi lịch chưa phải sự chấp thuận.</div>'+
   select("creditorType","Chủ nợ",Object.entries(state.digest.creditorLabels),d.creditor_type)+
   select("obligationType","Mức ràng buộc thời hạn",Object.entries(state.digest.obligationLabels),d.obligation_type)+
   input("minimumDueAmount","Khoản tối thiểu kỳ này (có thể để trống)",d.minimum_due_amount??"","text",'inputmode="decimal"')+
   select("relationshipPriority","Ưu tiên cam kết",[["high","Rất quan trọng"],["normal","Bình thường"],["low","Thấp hơn"]],d.relationship_priority)+
   select("negotiationStatus","Đổi lịch đã được đồng ý?",[["none","Chưa trao đổi"],["requested","Đã đề nghị, chưa được xác nhận"],["confirmed","Đã được đồng ý"]],d.negotiation_status)+
   input("nextContactDate","Ngày liên hệ tiếp theo (không phải hạn trả)",d.next_contact_date||"","date")+
   select("remindersEnabled","Cờ nhắc trong ứng dụng",[["false","Không"],["true","Có (chưa hỗ trợ push/email)"]],String(!!d.reminders_enabled))+
   '<label>Ghi chú<textarea name="memo" maxlength="500">'+s(d.memo||"")+'</textarea></label>'+
   '<div class="notice warn">Không đánh dấu đã thanh toán tại đây; hãy ghi nhận tại Công nợ & mục tiêu sau khi thực trả.</div>'+
   '</div><div class="editor-actions"><button type="button" class="btn ghost" data-mentor-action="close">Hủy</button>'+
   '<button type="submit" class="btn primary">Lưu điều khoản</button></div></form>';
  document.body.append(doc);
  doc.querySelector("form").addEventListener("submit",async event=>{
   event.preventDefault();
   const form=event.currentTarget,raw=Object.fromEntries(new FormData(form));
   const body={creditorType:raw.creditorType,obligationType:raw.obligationType,
    minimumDueAmount:raw.minimumDueAmount.trim()||null,
    relationshipPriority:raw.relationshipPriority,negotiationStatus:raw.negotiationStatus,
    nextContactDate:raw.nextContactDate||null,remindersEnabled:raw.remindersEnabled==="true",
    memo:raw.memo||""};
   if(body.obligationType==="agreed_flexible"&&body.negotiationStatus!=="confirmed")
    return notify("Chỉ chọn lịch đã thỏa thuận khi chủ nợ thật sự xác nhận.");
   try{
    form.querySelector('[type="submit"]').disabled=true;
    await api("/mentor/debts/"+d.id+"/terms",body,"PUT");
    doc.close();doc.remove();notify("Đã lưu điều khoản.");await load({force:true});
   }catch(e){notify(e.message||"Không thể lưu.");}
   finally{const btn=form.querySelector('[type="submit"]');if(btn)btn.disabled=false;}
  });
  doc.showModal();
 }
 async function send(){
  if(state.sending||!state.status?.configured)return;
  const message=document.getElementById("mentor-query")?.value?.trim();
  if(!message)return notify("Hãy nhập câu hỏi trước khi phân tích.");
  state.sending=true;state.messages.push({role:"user",content:message});onChange();
  try{
   const data=await api("/mentor/messages",{conversationId:state.conversationId,
    message,horizonDays:90,bufferTwd:"3000"},"POST");
   state.conversationId=data.conversationId;
   state.messages.push({role:"assistant",content:data.answer});
   state.conversations=(await api("/mentor/conversations")).conversations||[];
  }catch(e){state.messages.push({role:"assistant",content:"Không thể phân tích: "+String(e.message||e)});
  }finally{state.sending=false;onChange();}
 }
 async function handle(action,id){
  if(action==="terms"){const d=state.digest?.debts?.find(x=>x.id===id);if(d)dialogFor(d);return;}
  if(action==="close"){document.getElementById("mentor-terms-dialog")?.close();return;}
  if(action==="reload"){await load({force:true});return;}
  if(action==="new"){state.conversationId=null;state.messages=[];onChange();return;}
  if(action==="example"){
   const values=["Lịch trả nợ nào có nguy cơ thiếu tiền trước kỳ lương tới?",
   "Khoản nào là nghĩa vụ bắt buộc? Khoản người quen nào cần xác nhận?",
   "Nếu thu nhập giảm, 90 ngày tới tôi nên phân bổ ra sao?"];
   const input=document.getElementById("mentor-query");if(input){input.value=values[Number(id)]||"";input.focus();}return;
  }
  if(action==="send"){await send();return;}
  if(action==="open"){
   try{const data=await api("/mentor/conversations/"+id);
    state.conversationId=id;state.messages=data.messages||[];onChange();
   }catch(e){notify(e.message||"Không tải được hội thoại.");}return;
  }
  if(action==="delete"){
   if(!confirm("Bạn muốn xóa hội thoại này?"))return;
   try{await api("/mentor/conversations/"+id,{},"DELETE");
    if(state.conversationId===id){state.conversationId=null;state.messages=[];}
    state.conversations=(await api("/mentor/conversations")).conversations||[];onChange();
   }catch(e){notify(e.message||"Không xóa được.");}return;
  }
 }
 document.body.addEventListener("click",e=>{
  const button=e.target.closest("[data-mentor-action]");
  if(button){e.preventDefault();e.stopImmediatePropagation();void handle(button.dataset.mentorAction,button.dataset.id||"");}
 },true);
 return {load,render,brief,reset:()=>{state.loaded=false;state.digest=null;state.status=null;state.messages=[];state.conversations=[];state.conversationId=null;}};
}
