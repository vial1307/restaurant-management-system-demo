import { accountCan, currentAccountSession } from "./account-permissions.js";
import { apiRequest, vpsBusinessState } from "./vps-api.js";

const STATE_KEY = "shitu-kitchen-os-v1";
const ACTIVE_SITE_KEY = "shitu-admin-active-site-v1";
const MANAGER_ROLES = new Set(["admin", "manager"]);
const SELF_SERVICE_ROLES = new Set(["employee", "parttime"]);
let remoteKey = "";
let remoteAttendance = null;
let loadPending = null;
let renderPending = false;
let actionPending = false;

function copy() {
  const zh = document.documentElement.lang === "zh-Hant";
  return zh ? {
    title:"出勤修正申請", subtitle:"員工提出修正，由管理者在 VPS 審核；核准後原出勤必須重新核准才會再次計入已核准薪資。",
    newRequest:"提出修正", attendance:"出勤紀錄", clockIn:"上班時間", clockOut:"下班時間", breakMinutes:"休息分鐘", note:"備註", reason:"修正原因", reasonPlaceholder:"請說明為什麼需要修正", submit:"送出修正申請",
    queue:"待審核修正", history:"修正紀錄", pending:"待審核", approved:"已核准", rejected:"已拒絕", cancelled:"已取消", approve:"核准修正", reject:"拒絕", cancel:"取消申請", decision:"拒絕原因", decisionPlaceholder:"拒絕時請填寫原因",
    noAttendance:"目前沒有可提出修正的出勤紀錄。", noPending:"目前沒有待審核修正。", noHistory:"尚無修正紀錄。", loading:"正在讀取 VPS 出勤修正…", saved:"出勤修正流程已更新", saveError:"無法更新出勤修正流程",
    locked:"此出勤所屬薪資期間已鎖定。管理者必須先重新開啟該期間，才能核准修正。", reasonRequired:"修正原因至少需要 3 個字元。", decisionRequired:"拒絕原因至少需要 3 個字元。", pendingExists:"此出勤已有待審核的修正申請。", noChanges:"修正內容與目前出勤相同。", sourceChanged:"原出勤已被更新；請取消舊申請並重新提出。", notPending:"此申請已處理。", ownOnly:"只能操作自己的出勤修正申請。", invalidTime:"請檢查上、下班時間。", invalidBreak:"休息分鐘必須是 0 以上的數字。",
    payrollBoundary:"修正只改既有出勤事實，不會新增加班、假日倍率、獎金、保險、稅或其他薪資規則。", from:"原本", to:"申請修正", select:"選擇出勤",
  } : {
    title:"Yêu cầu sửa chấm công", subtitle:"Nhân viên gửi yêu cầu, quản lý duyệt trên VPS; sau khi duyệt sửa, bản chấm công phải được duyệt lại trước khi được tính vào lương đã duyệt.",
    newRequest:"Gửi yêu cầu sửa", attendance:"Bản chấm công", clockIn:"Giờ vào", clockOut:"Giờ tan", breakMinutes:"Phút nghỉ", note:"Ghi chú", reason:"Lý do sửa", reasonPlaceholder:"Mô tả lý do cần sửa chấm công", submit:"Gửi yêu cầu sửa",
    queue:"Yêu cầu chờ duyệt", history:"Lịch sử sửa công", pending:"Chờ duyệt", approved:"Đã duyệt", rejected:"Từ chối", cancelled:"Đã hủy", approve:"Duyệt sửa", reject:"Từ chối", cancel:"Hủy yêu cầu", decision:"Lý do từ chối", decisionPlaceholder:"Khi từ chối cần nhập lý do",
    noAttendance:"Hiện không có bản chấm công để yêu cầu sửa.", noPending:"Không có yêu cầu sửa đang chờ duyệt.", noHistory:"Chưa có lịch sử sửa chấm công.", loading:"Đang đọc yêu cầu sửa chấm công từ VPS…", saved:"Đã cập nhật quy trình sửa chấm công", saveError:"Không cập nhật được quy trình sửa chấm công",
    locked:"Kỳ lương của bản chấm công này đã khóa. Quản lý phải mở lại kỳ trước khi có thể duyệt sửa.", reasonRequired:"Lý do sửa phải có ít nhất 3 ký tự.", decisionRequired:"Lý do từ chối phải có ít nhất 3 ký tự.", pendingExists:"Bản chấm công này đã có yêu cầu sửa đang chờ duyệt.", noChanges:"Nội dung yêu cầu giống dữ liệu chấm công hiện tại.", sourceChanged:"Bản chấm công gốc đã thay đổi; hãy hủy yêu cầu cũ và gửi lại.", notPending:"Yêu cầu này đã được xử lý.", ownOnly:"Chỉ có thể thao tác yêu cầu sửa công của chính mình.", invalidTime:"Hãy kiểm tra lại giờ vào/giờ tan.", invalidBreak:"Phút nghỉ phải là số từ 0 trở lên.",
    payrollBoundary:"Yêu cầu sửa chỉ thay đổi dữ liệu chấm công hiện có; không tự thêm OT, hệ số ngày lễ, thưởng, bảo hiểm, thuế hay quy tắc lương khác.", from:"Hiện tại", to:"Yêu cầu sửa", select:"Chọn bản chấm công",
  };
}

function esc(value) { return String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;"); }
function loadState(){ try{return JSON.parse(localStorage.getItem(STATE_KEY)||"null");}catch{return null;} }
function session(){ return currentAccountSession(); }
function role(user=session()){ return String(user?.accountRole || user?.role || ""); }
function attendanceVisible(user=session()){ return Boolean(user && (role(user)==="admin" || accountCan(user,"attendance","view"))); }
function managerAccount(user=session()){ return Boolean(user && MANAGER_ROLES.has(role(user)) && (role(user)==="admin" || accountCan(user,"attendance","edit"))); }
function selfServiceAccount(user=session()){ return Boolean(user && SELF_SERVICE_ROLES.has(role(user)) && attendanceVisible(user)); }
function activeSite(user=session()){
  if(["central","fuxing","yongji"].includes(user?.location)) return user.location;
  if(user?.location==="all"){ const saved=localStorage.getItem(ACTIVE_SITE_KEY); return ["central","fuxing","yongji"].includes(saved)?saved:"fuxing"; }
  return "";
}
function onAttendancePanel(){ const value=String(location.hash||"").replace(/^#\/?/,""); const [route,query=""]=value.split("?"); return route==="attendance" && new URLSearchParams(query).get("workforce")!=="payroll"; }
function notify(type,title,body){ window.dispatchEvent(new CustomEvent("shitu:notify",{detail:{type,title,body}})); }
function statusLabel(status,c=copy()){ if(status==="approved")return c.approved; if(status==="rejected")return c.rejected; if(status==="cancelled")return c.cancelled; return c.pending; }
function toLocalDateTime(value){ if(!value)return ""; const date=new Date(value); if(!Number.isFinite(date.getTime()))return ""; const local=new Date(date.getTime()-date.getTimezoneOffset()*60000); return local.toISOString().slice(0,16); }
function toIso(value){ if(!value)return null; const date=new Date(value); return Number.isFinite(date.getTime())?date.toISOString():null; }
function shortDateTime(value){ if(!value)return "—"; const date=new Date(value); if(!Number.isFinite(date.getTime()))return "—"; return new Intl.DateTimeFormat(document.documentElement.lang==="zh-Hant"?"zh-TW":"vi-VN",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).format(date); }
function periodLocked(module,month){ return module?.payroll?.periods?.[month]?.status==="locked"; }

function errorMessage(error){
  const c=copy(); const code=String(error?.code||error?.message||"");
  const map={WORKFORCE_CORRECTION_REASON_REQUIRED:c.reasonRequired,WORKFORCE_CORRECTION_DECISION_NOTE_REQUIRED:c.decisionRequired,WORKFORCE_CORRECTION_PENDING_EXISTS:c.pendingExists,WORKFORCE_CORRECTION_NO_CHANGES:c.noChanges,WORKFORCE_CORRECTION_SOURCE_CHANGED:c.sourceChanged,WORKFORCE_CORRECTION_NOT_PENDING:c.notPending,WORKFORCE_CORRECTION_NOT_OWN:c.ownOnly,WORKFORCE_CORRECTION_CLOCK_IN_INVALID:c.invalidTime,WORKFORCE_CORRECTION_CLOCK_OUT_INVALID:c.invalidTime,WORKFORCE_CORRECTION_TIME_ORDER_INVALID:c.invalidTime,WORKFORCE_CORRECTION_BREAK_INVALID:c.invalidBreak,WORKFORCE_PAYROLL_PERIOD_LOCKED:c.locked};
  return map[code]||code||c.saveError;
}

function publishRemote(site,module){
  remoteAttendance=module&&typeof module==="object"?module:{attendance:[],correctionRequests:[],payroll:{}};
  globalThis.__shituWorkforceAttendanceModule={site,module:remoteAttendance,loadedAt:new Date().toISOString()};
  window.dispatchEvent(new CustomEvent("shitu:workforce-attendance-state",{detail:{site}}));
}

async function refreshRemote(force=false){
  const user=session(); const site=activeSite(user); if(!user?.id||!site||!attendanceVisible(user))return null;
  const key=`${user.id}:${site}`; if(!force&&remoteKey===key&&remoteAttendance)return remoteAttendance; if(!force&&loadPending)return loadPending;
  remoteKey=key;
  const pending=vpsBusinessState(site).then((result)=>{
    if(`${session()?.id||""}:${activeSite()}`!==key)return null;
    const module=result?.modules?.attendance&&typeof result.modules.attendance==="object"?result.modules.attendance:{attendance:[],correctionRequests:[],payroll:{}};
    publishRemote(site,module); requestDecorate(); return module;
  }).catch((error)=>{ if(force)notify("error",copy().saveError,errorMessage(error)); return null; }).finally(()=>{if(loadPending===pending)loadPending=null;});
  loadPending=pending; return pending;
}

function sourceLabel(item){ const s=item?.sourceSnapshot||{}; return `${shortDateTime(s.clockIn)} → ${shortDateTime(s.clockOut)} · ${Number(s.breakMinutes)||0}m`; }
function requestedLabel(item){ const r=item?.requested||{}; return `${shortDateTime(r.clockIn)} → ${shortDateTime(r.clockOut)} · ${Number(r.breakMinutes)||0}m`; }

function correctionCard(item,{manager=false,selfService=false,module=null}={}){
  const c=copy(); const status=String(item?.status||"pending"); const locked=periodLocked(module,item?.month||String(item?.date||"").slice(0,7));
  const actions=status==="pending"&&manager
    ? `<div class="workforce-correction-actions"><button type="button" class="primary-button" data-workforce-correction-approve="${esc(item.id)}" ${locked?"disabled":""}>${esc(c.approve)}</button><form class="workforce-correction-reject-form" data-workforce-correction-reject-form data-request-id="${esc(item.id)}"><input name="note" minlength="3" required placeholder="${esc(c.decisionPlaceholder)}"><button type="submit" class="secondary-button">${esc(c.reject)}</button></form></div>`
    : status==="pending"&&selfService ? `<div class="workforce-correction-actions"><button type="button" class="secondary-button" data-workforce-correction-cancel="${esc(item.id)}">${esc(c.cancel)}</button></div>` : "";
  return `<article class="workforce-correction-row" data-correction-status="${esc(status)}"><div><div class="workforce-correction-heading"><strong>${esc(item.staffName||"")} · ${esc(item.date||"")}</strong><span class="workforce-correction-status" data-status="${esc(status)}">${esc(statusLabel(status,c))}</span></div><div class="workforce-correction-meta"><span>${esc(c.from)}: ${esc(sourceLabel(item))}</span></div><div class="workforce-correction-values"><span>${esc(c.to)}: ${esc(requestedLabel(item))}</span></div><p class="workforce-correction-reason">${esc(item.reason||"")}</p>${item.decisionNote?`<p class="workforce-correction-decision">${esc(item.decisionNote)}</p>`:""}${locked&&status==="pending"?`<p class="workforce-correction-locked">${esc(c.locked)}</p>`:""}</div>${actions}</article>`;
}

function sortedAttendance(module){ return [...(Array.isArray(module?.attendance)?module.attendance:[])].sort((a,b)=>`${b.date||""}${b.clockIn||""}`.localeCompare(`${a.date||""}${a.clockIn||""}`)).slice(0,90); }
function optionsMarkup(module,selectedDate){
  const rows=sortedAttendance(module); const preferred=rows.find((row)=>row.date===selectedDate)?.id||rows[0]?.id||"";
  return {preferred,html:rows.map((row)=>`<option value="${esc(row.id)}" ${String(row.id)===String(preferred)?"selected":""}>${esc(row.date||"")} · ${esc(shortDateTime(row.clockIn))} → ${esc(shortDateTime(row.clockOut))}</option>`).join("")};
}

function selfServiceMarkup(module,selectedDate){
  const c=copy(); const options=optionsMarkup(module,selectedDate); const rows=sortedAttendance(module); const selected=rows.find((row)=>String(row.id)===String(options.preferred));
  const requests=[...(Array.isArray(module?.correctionRequests)?module.correctionRequests:[])].sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||""))).slice(0,40);
  const form=rows.length?`<form class="card workforce-correction-form" data-workforce-correction-form><div class="card-heading"><div><h2>${esc(c.newRequest)}</h2><p>${esc(c.subtitle)}</p></div></div><div class="workforce-correction-form-grid"><label class="workforce-correction-wide"><span>${esc(c.select)}</span><select name="attendanceId" data-workforce-correction-attendance>${options.html}</select></label><label><span>${esc(c.clockIn)}</span><input type="datetime-local" name="clockIn" required value="${esc(toLocalDateTime(selected?.clockIn))}"></label><label><span>${esc(c.clockOut)}</span><input type="datetime-local" name="clockOut" value="${esc(toLocalDateTime(selected?.clockOut))}"></label><label><span>${esc(c.breakMinutes)}</span><input type="number" name="breakMinutes" required min="0" step="1" value="${esc(Number(selected?.breakMinutes)||0)}"></label><label><span>${esc(c.note)}</span><input name="note" maxlength="500" value="${esc(selected?.note||"")}"></label><label class="workforce-correction-wide"><span>${esc(c.reason)}</span><textarea name="reason" required minlength="3" maxlength="240" placeholder="${esc(c.reasonPlaceholder)}"></textarea></label></div><p class="workforce-correction-boundary">${esc(c.payrollBoundary)}</p><button type="submit" class="primary-button">${esc(c.submit)}</button></form>`:`<article class="card workforce-correction-form"><p class="workforce-correction-empty">${esc(c.noAttendance)}</p></article>`;
  return `<div class="workforce-correction-grid">${form}<article class="card workforce-correction-history"><div class="card-heading"><div><h2>${esc(c.history)}</h2></div></div>${requests.length?requests.map((item)=>correctionCard(item,{selfService:true,module})).join(""):`<p class="workforce-correction-empty">${esc(c.noHistory)}</p>`}</article></div>`;
}

function managerMarkup(module){
  const c=copy(); const requests=[...(Array.isArray(module?.correctionRequests)?module.correctionRequests:[])].sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||""))); const pending=requests.filter((x)=>x.status==="pending"); const history=requests.filter((x)=>x.status!=="pending").slice(0,60);
  return `<div class="workforce-correction-grid"><article class="card workforce-correction-queue"><div class="card-heading"><div><h2>${esc(c.queue)}</h2><p>${esc(c.subtitle)}</p></div><span class="workforce-correction-count">${pending.length}</span></div>${pending.length?pending.map((item)=>correctionCard(item,{manager:true,module})).join(""):`<p class="workforce-correction-empty">${esc(c.noPending)}</p>`}</article><article class="card workforce-correction-history"><div class="card-heading"><div><h2>${esc(c.history)}</h2></div></div>${history.length?history.map((item)=>correctionCard(item,{module})).join(""):`<p class="workforce-correction-empty">${esc(c.noHistory)}</p>`}</article></div><p class="workforce-correction-boundary">${esc(c.payrollBoundary)}</p>`;
}

function populateForm(form,id){
  if(!(form instanceof HTMLFormElement)||!remoteAttendance)return; const row=(remoteAttendance.attendance||[]).find((item)=>String(item?.id||"")===String(id||"")); if(!row)return;
  form.elements.clockIn.value=toLocalDateTime(row.clockIn); form.elements.clockOut.value=toLocalDateTime(row.clockOut); form.elements.breakMinutes.value=String(Number(row.breakMinutes)||0); form.elements.note.value=String(row.note||"");
}

function decorate(){
  renderPending=false; if(!onAttendancePanel())return; const user=session(); if(!attendanceVisible(user))return; const root=document.querySelector("#app"); const tabs=root?.querySelector("[data-workforce-tabs]"); if(!root||!tabs)return;
  const state=loadState(); const selectedDate=String(state?.selectedDate||new Date().toISOString().slice(0,10)); const site=activeSite(user); const key=`${user?.id||""}:${site}`;
  let panel=root.querySelector("[data-workforce-correction-workspace]"); if(!panel){ panel=document.createElement("section"); panel.className="workforce-correction-workspace"; panel.dataset.workforceCorrectionWorkspace=""; const anchor=root.querySelector("[data-workforce-manager-day]")||tabs; anchor.after(panel); }
  if(remoteKey!==key||!remoteAttendance){ panel.innerHTML=`<article class="card workforce-correction-loading"><p>${esc(copy().loading)}</p></article>`; void refreshRemote(); return; }
  const manager=managerAccount(user), self=selfServiceAccount(user); const signature=JSON.stringify({key,selectedDate,manager,self,attendance:(remoteAttendance.attendance||[]).map((x)=>[x.id,x.clockIn,x.clockOut,x.breakMinutes,x.note,x.approvalStatus]),requests:remoteAttendance.correctionRequests||[],periods:remoteAttendance.payroll?.periods||{}}); if(panel.dataset.signature===signature)return; panel.dataset.signature=signature;
  panel.innerHTML=manager?managerMarkup(remoteAttendance):self?selfServiceMarkup(remoteAttendance,selectedDate):`<p class="workforce-correction-boundary">${esc(copy().payrollBoundary)}</p>`;
}
function requestDecorate(){ if(renderPending)return; renderPending=true; requestAnimationFrame(decorate); }

async function postAction(path,body={},{reload=false}={}){
  if(actionPending)return false; actionPending=true; document.querySelectorAll("[data-workforce-correction-workspace] button,[data-workforce-correction-workspace] input,[data-workforce-correction-workspace] select,[data-workforce-correction-workspace] textarea").forEach((node)=>{node.disabled=true;});
  try{ await apiRequest(path,{method:"POST",body}); notify("success",copy().saved,"VPS OK"); if(reload){location.reload();return true;} await refreshRemote(true); return true; }
  catch(error){ notify("error",copy().saveError,errorMessage(error)); return false; }
  finally{ actionPending=false; requestDecorate(); }
}

document.addEventListener("change",(event)=>{ const select=event.target; if(select instanceof HTMLSelectElement&&select.matches("[data-workforce-correction-attendance]"))populateForm(select.closest("form"),select.value); },true);
document.addEventListener("submit",(event)=>{
  const form=event.target; if(!(form instanceof HTMLFormElement))return;
  if(form.matches("[data-workforce-correction-form]")){ event.preventDefault(); event.stopImmediatePropagation(); if(!selfServiceAccount())return; const data=new FormData(form); const reason=String(data.get("reason")||"").trim(); if(reason.length<3){notify("error",copy().saveError,copy().reasonRequired);return;} const clockIn=toIso(String(data.get("clockIn")||"")); const rawClockOut=String(data.get("clockOut")||""); const clockOut=rawClockOut?toIso(rawClockOut):null; const breakMinutes=Number(data.get("breakMinutes")); if(!clockIn||(rawClockOut&&!clockOut)||(clockOut&&Date.parse(clockOut)<Date.parse(clockIn))){notify("error",copy().saveError,copy().invalidTime);return;} if(!Number.isFinite(breakMinutes)||breakMinutes<0){notify("error",copy().saveError,copy().invalidBreak);return;} const body={attendanceId:String(data.get("attendanceId")||""),clockIn,clockOut,breakMinutes,note:String(data.get("note")||"").trim(),reason}; void postAction(`/api/workforce/${encodeURIComponent(activeSite())}/attendance-corrections`,body).then((ok)=>{if(ok)form.elements.reason.value="";}); return; }
  if(form.matches("[data-workforce-correction-reject-form]")){ event.preventDefault(); event.stopImmediatePropagation(); if(!managerAccount())return; const note=String(new FormData(form).get("note")||"").trim(); if(note.length<3){notify("error",copy().saveError,copy().decisionRequired);return;} const id=String(form.dataset.requestId||""); void postAction(`/api/workforce/${encodeURIComponent(activeSite())}/attendance-corrections/${encodeURIComponent(id)}/reject`,{note}); }
},true);
document.addEventListener("click",(event)=>{
  const approve=event.target.closest?.("[data-workforce-correction-approve]"); if(approve){event.preventDefault();if(!managerAccount()||approve.disabled)return;const id=String(approve.dataset.workforceCorrectionApprove||"");void postAction(`/api/workforce/${encodeURIComponent(activeSite())}/attendance-corrections/${encodeURIComponent(id)}/approve`,{},{reload:true});return;}
  const cancel=event.target.closest?.("[data-workforce-correction-cancel]"); if(cancel){event.preventDefault();if(!selfServiceAccount())return;const id=String(cancel.dataset.workforceCorrectionCancel||"");void postAction(`/api/workforce/${encodeURIComponent(activeSite())}/attendance-corrections/${encodeURIComponent(id)}/cancel`);}
},true);
window.addEventListener("hashchange",requestDecorate); window.addEventListener("shitu:accounts-synced",()=>{remoteKey="";remoteAttendance=null;requestDecorate();}); window.addEventListener("shitu:business-state-updated",()=>{remoteKey="";remoteAttendance=null;requestDecorate();});
const observer=new MutationObserver(requestDecorate); observer.observe(document.documentElement,{childList:true,subtree:true}); requestDecorate();
