import { tr, currentLocale } from './locales.js';

const ACCOUNTS_KEY = 'shitu-kitchen-accounts-v2';
const AUTH_KEY = 'shitu-kitchen-auth-v1';

const MODULES = ['dashboard','inventory','procurement','reservations','preparation','menu','sop','skills','attendance','schedule','reports','remote','settings'];
const ROLE_DEFAULTS = {
  admin: Object.fromEntries(MODULES.map(k => [k, { view: true, edit: true }])),
  manager: Object.fromEntries(MODULES.map(k => [k, { view: true, edit: !['settings'].includes(k) }])),
  supervisor: {
    dashboard:{view:true,edit:false}, inventory:{view:true,edit:true}, procurement:{view:true,edit:true}, reservations:{view:true,edit:true}, preparation:{view:true,edit:true}, menu:{view:true,edit:false}, sop:{view:true,edit:false}, skills:{view:true,edit:true}, attendance:{view:true,edit:false}, schedule:{view:true,edit:false}, reports:{view:true,edit:false}, remote:{view:false,edit:false}, settings:{view:false,edit:false}
  },
  employee: {
    dashboard:{view:true,edit:false}, inventory:{view:true,edit:true}, procurement:{view:false,edit:false}, reservations:{view:true,edit:false}, preparation:{view:true,edit:true}, menu:{view:true,edit:false}, sop:{view:true,edit:false}, skills:{view:true,edit:false}, attendance:{view:true,edit:true}, schedule:{view:true,edit:false}, reports:{view:false,edit:false}, remote:{view:false,edit:false}, settings:{view:false,edit:false}
  },
  parttime: {
    dashboard:{view:true,edit:false}, inventory:{view:true,edit:false}, procurement:{view:false,edit:false}, reservations:{view:false,edit:false}, preparation:{view:true,edit:true}, menu:{view:true,edit:false}, sop:{view:true,edit:false}, skills:{view:true,edit:false}, attendance:{view:true,edit:true}, schedule:{view:true,edit:false}, reports:{view:false,edit:false}, remote:{view:false,edit:false}, settings:{view:false,edit:false}
  },
  central: {
    dashboard:{view:false,edit:false}, inventory:{view:true,edit:true}, procurement:{view:false,edit:false}, reservations:{view:false,edit:false}, preparation:{view:false,edit:false}, menu:{view:false,edit:false}, sop:{view:false,edit:false}, skills:{view:false,edit:false}, attendance:{view:false,edit:false}, schedule:{view:false,edit:false}, reports:{view:false,edit:false}, remote:{view:false,edit:false}, settings:{view:false,edit:false}
  }
};

const DEFAULT_ACCOUNTS = [
  { id:'admin', username:'admin', password:'admin123', name:'系統管理員', role:'admin', location:'all', active:true, permissions:ROLE_DEFAULTS.admin },
  { id:'central', username:'yangchu', password:'123456', name:'央廚員工', role:'central', location:'central', active:true, permissions:ROLE_DEFAULTS.central },
  { id:'fuxing', username:'fuxing', password:'123456', name:'復興店員工', role:'employee', location:'fuxing', active:true, permissions:ROLE_DEFAULTS.employee }
];

function clone(v){ return JSON.parse(JSON.stringify(v)); }
function loadAccounts(){
  try {
    const saved = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || 'null');
    if (Array.isArray(saved) && saved.length) return saved;
  } catch {}
  const seeded = clone(DEFAULT_ACCOUNTS);
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(seeded));
  return seeded;
}
function saveAccounts(list){ localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list)); }
function session(){ try{return JSON.parse(localStorage.getItem(AUTH_KEY)||'null')}catch{return null} }
function setSession(account){
  const authRole = account.role === 'admin' ? 'admin' : account.role === 'central' ? 'central' : 'branch';
  localStorage.setItem(AUTH_KEY, JSON.stringify({ id:account.id, username:account.username, name:account.name, role:authRole, accountRole:account.role, location:account.location, permissions:account.permissions }));
}
function esc(v){ return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'); }
function label(key){ return tr(key); }
function roleLabel(role){ return label(role); }
function locationLabel(location){ return label(location === 'central' ? 'centralKitchen' : location === 'fuxing' ? 'fuxing' : 'allLocations'); }
function moduleLabel(k){ return label(k); }

function normalizePermissions(role, input){
  const base = clone(ROLE_DEFAULTS[role] || ROLE_DEFAULTS.employee);
  if (!input) return base;
  for (const key of MODULES) {
    if (input[key]) base[key] = { view:Boolean(input[key].view), edit:Boolean(input[key].edit) && Boolean(input[key].view) };
  }
  return base;
}

function applyRoleAccess(){
  const s = session();
  if (!s?.id) return;
  const account = loadAccounts().find(a=>a.id===s.id);
  if (!account || !account.active) return;
  const permissions = normalizePermissions(account.role, account.permissions);
  document.querySelectorAll('.desktop-nav .nav-item, .mobile-nav .nav-item').forEach(a=>{
    const href=(a.getAttribute('href')||'').replace(/^#/,'').split('?')[0];
    if (!href) return;
    const p = permissions[href];
    if (p) a.style.display = p.view ? '' : 'none';
  });
}

function interceptLogin(){
  document.addEventListener('submit', (event)=>{
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.id !== 'auth-login-form') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const data=new FormData(form);
    const username=String(data.get('username')||'').trim();
    const password=String(data.get('password')||'');
    const account=loadAccounts().find(a=>a.username===username && a.password===password && a.active);
    if(!account){
      const box=document.querySelector('.auth-error');
      if(box) box.textContent=label('invalidLogin');
      else form.insertAdjacentHTML('beforebegin', `<div class="auth-error">${esc(label('invalidLogin'))}</div>`);
      return;
    }
    setSession(account);
    document.body.classList.remove('auth-locked');
    document.querySelector('#auth-layer')?.remove();
    location.hash = account.role === 'central' ? '#inventory' : '#dashboard';
    location.reload();
  }, true);
}

function accountCard(){
  const s=session();
  const account=loadAccounts().find(a=>a.id===s?.id);
  if(!account) return '';
  return `<article class="card account-self-card"><div class="account-card-head"><div><h2>${esc(label('accountSettings'))}</h2><p>${esc(account.name)} · ${esc(account.username)}</p></div></div><form data-account-self-password><div class="account-form-grid"><label><span>${esc(label('currentPassword'))}</span><input type="password" name="current" required autocomplete="current-password"></label><label><span>${esc(label('newPassword'))}</span><input type="password" name="next" required minlength="6" autocomplete="new-password"></label><label><span>${esc(label('confirmPassword'))}</span><input type="password" name="confirm" required minlength="6" autocomplete="new-password"></label></div><div class="account-form-actions"><button class="primary-button" type="submit">${esc(label('changePassword'))}</button></div><p class="account-form-message" data-account-self-message></p></form></article>`;
}

function adminPanel(){
  const s=session();
  if(s?.role!=='admin') return '';
  const accounts=loadAccounts();
  return `<article class="card account-admin-card"><div class="account-card-head"><div><h2>${esc(label('accountManagement'))}</h2><p>${esc(label('accountSubtitle'))}</p></div><button class="secondary-button" data-account-add>＋ ${esc(label('addAccount'))}</button></div><div class="account-table"><div class="account-table-head"><span>${esc(label('employeeName'))}</span><span>${esc(label('account'))}</span><span>${esc(label('role'))}</span><span>${esc(label('location'))}</span><span>${esc(label('status'))}</span><span></span></div>${accounts.map(a=>`<div class="account-row"><div><strong>${esc(a.name)}</strong><small>${esc(a.id)}</small></div><span>${esc(a.username)}</span><span>${esc(roleLabel(a.role))}</span><span>${esc(locationLabel(a.location))}</span><span class="account-status ${a.active?'on':'off'}">${esc(a.active?label('active'):label('disabled'))}</span><button class="icon-button account-edit" data-account-edit="${esc(a.id)}">✎</button></div>`).join('')}</div><p class="account-storage-note">${esc(label('temporaryStorage'))}</p></article>`;
}

function renderSettingsAccounts(){
  if(!location.hash.startsWith('#settings')) return;
  const layout=document.querySelector('.settings-layout');
  if(!layout || layout.querySelector('.account-admin-card,.account-self-card')) return;
  layout.insertAdjacentHTML('beforeend', accountCard()+adminPanel());
  bindSettings();
}

function permissionGrid(account){
  const p=normalizePermissions(account.role, account.permissions);
  return `<div class="permission-grid"><div class="permission-head"><span>${esc(label('permissions'))}</span><span>${esc(label('view'))}</span><span>${esc(label('edit'))}</span></div>${MODULES.map(k=>`<div class="permission-row"><span>${esc(moduleLabel(k))}</span><label><input type="checkbox" name="perm:${k}:view" ${p[k]?.view?'checked':''}></label><label><input type="checkbox" name="perm:${k}:edit" ${p[k]?.edit?'checked':''}></label></div>`).join('')}</div>`;
}

function openEditor(id=''){
  const list=loadAccounts();
  const account=id?list.find(a=>a.id===id):{id:'',username:'',password:'',name:'',role:'employee',location:'fuxing',active:true,permissions:clone(ROLE_DEFAULTS.employee)};
  if(!account) return;
  const editing=Boolean(id);
  const host=document.createElement('div'); host.className='account-modal-backdrop'; host.dataset.accountModal='';
  host.innerHTML=`<section class="account-modal"><div class="account-card-head"><div><h2>${esc(editing?label('editAccount'):label('addAccount'))}</h2><p>${editing?esc(account.username):''}</p></div><button class="icon-button" data-account-close>×</button></div><form data-account-form data-edit-id="${esc(id)}"><div class="account-form-grid"><label><span>${esc(label('employeeName'))}</span><input name="name" required value="${esc(account.name)}"></label><label><span>${esc(label('account'))}</span><input name="username" required value="${esc(account.username)}" autocomplete="off"></label><label><span>${esc(editing?label('newPassword'):label('password'))}</span><input name="password" type="password" ${editing?'':'required minlength="6"'} autocomplete="new-password" placeholder="${editing?'••••••':''}"></label><label><span>${esc(label('role'))}</span><select name="role">${['admin','manager','supervisor','employee','parttime','central'].map(r=>`<option value="${r}" ${account.role===r?'selected':''}>${esc(roleLabel(r))}</option>`).join('')}</select></label><label><span>${esc(label('location'))}</span><select name="location"><option value="all" ${account.location==='all'?'selected':''}>${esc(label('allLocations'))}</option><option value="fuxing" ${account.location==='fuxing'?'selected':''}>${esc(label('fuxing'))}</option><option value="central" ${account.location==='central'?'selected':''}>${esc(label('centralKitchen'))}</option></select></label><label class="account-active-toggle"><span>${esc(label('status'))}</span><input name="active" type="checkbox" ${account.active?'checked':''}> ${esc(label('active'))}</label></div>${permissionGrid(account)}<p class="account-form-message" data-account-form-message></p><div class="account-form-actions">${editing&&account.id!=='admin'?`<button type="button" class="danger-button" data-account-delete="${esc(account.id)}">${esc(label('delete'))}</button>`:''}<button type="button" class="secondary-button" data-account-close>${esc(label('cancel'))}</button><button type="submit" class="primary-button">${esc(label('save'))}</button></div></form></section>`;
  document.body.append(host);
  bindModal(host);
}

function bindModal(host){
  host.querySelectorAll('[data-account-close]').forEach(b=>b.onclick=()=>host.remove());
  const roleSelect=host.querySelector('select[name="role"]');
  roleSelect?.addEventListener('change',()=>{
    const fake={role:roleSelect.value,permissions:clone(ROLE_DEFAULTS[roleSelect.value]||ROLE_DEFAULTS.employee)};
    host.querySelector('.permission-grid').outerHTML=permissionGrid(fake);
  });
  host.querySelector('[data-account-delete]')?.addEventListener('click',e=>{
    if(!confirm(label('confirmDelete'))) return;
    const id=e.currentTarget.dataset.accountDelete;
    saveAccounts(loadAccounts().filter(a=>a.id!==id)); host.remove(); refreshSettings();
  });
  host.querySelector('[data-account-form]')?.addEventListener('submit',e=>{
    e.preventDefault();
    const form=e.currentTarget, data=new FormData(form), editId=form.dataset.editId;
    const list=loadAccounts();
    const existing=editId?list.find(a=>a.id===editId):null;
    const username=String(data.get('username')||'').trim();
    const password=String(data.get('password')||'');
    const message=form.querySelector('[data-account-form-message]');
    if(list.some(a=>a.username===username && a.id!==editId)){ message.textContent=label('usernameExists'); return; }
    if(!existing && password.length<6){ message.textContent=label('passwordLength'); return; }
    const role=String(data.get('role'));
    const permissions={};
    for(const k of MODULES){ const view=data.has(`perm:${k}:view`), edit=data.has(`perm:${k}:edit`); permissions[k]={view,edit:view&&edit}; }
    const next={ id:existing?.id||`acct-${Date.now()}`, username, password:password||existing?.password||'', name:String(data.get('name')||'').trim(), role, location:String(data.get('location')), active:data.has('active'), permissions };
    if(existing) list[list.findIndex(a=>a.id===existing.id)]=next; else list.push(next);
    saveAccounts(list); host.remove(); refreshSettings();
  });
}

function refreshSettings(){
  document.querySelectorAll('.account-admin-card,.account-self-card').forEach(x=>x.remove());
  renderSettingsAccounts();
}

function bindSettings(){
  document.querySelector('[data-account-add]')?.addEventListener('click',()=>openEditor());
  document.querySelectorAll('[data-account-edit]').forEach(b=>b.addEventListener('click',()=>openEditor(b.dataset.accountEdit)));
  document.querySelector('[data-account-self-password]')?.addEventListener('submit',e=>{
    e.preventDefault(); const form=e.currentTarget, data=new FormData(form), msg=form.querySelector('[data-account-self-message]');
    const s=session(), list=loadAccounts(), idx=list.findIndex(a=>a.id===s?.id); if(idx<0)return;
    const current=String(data.get('current')||''), next=String(data.get('next')||''), confirmPw=String(data.get('confirm')||'');
    if(list[idx].password!==current){ msg.textContent=label('wrongCurrentPassword'); return; }
    if(next.length<6){ msg.textContent=label('passwordLength'); return; }
    if(next!==confirmPw){ msg.textContent=label('passwordMismatch'); return; }
    list[idx].password=next; saveAccounts(list); msg.textContent=label('passwordChanged'); form.reset();
  });
}

interceptLogin();
let frame=0;
function schedule(){ if(frame)return; frame=requestAnimationFrame(()=>{frame=0; applyRoleAccess(); renderSettingsAccounts();}); }
new MutationObserver(schedule).observe(document.querySelector('#app')||document.body,{childList:true,subtree:false});
window.addEventListener('hashchange',schedule);
document.addEventListener('click',e=>{ if(e.target.closest('[data-action="set-language"]')) setTimeout(()=>{refreshSettings();},20); });
schedule();
