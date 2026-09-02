import { tr, currentLocale } from './locales.js';
import { getSupabase, isSupabaseConfigured } from './supabase-client.js';
import { isVpsApiConfigured, vpsListUsers } from './vps-api.js';
import {
  ACCOUNT_MODULES,
  ACCOUNT_ROLE_DEFAULTS,
  isAdminAccount,
  normalizeAccountPermissions,
} from './account-permissions.js';

const ACCOUNTS_KEY = 'shitu-kitchen-accounts-v2';
const AUTH_KEY = 'shitu-kitchen-auth-v1';

const DEFAULT_ACCOUNTS = []

function clone(v){ return JSON.parse(JSON.stringify(v)); }
function loadAccounts(){
  try {
    const saved = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || 'null');
    if (Array.isArray(saved) && saved.length) {
      const sanitized = saved.map(({ password, ...account }) => ({ ...account, password: "" }));
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(sanitized));
      return sanitized;
    }
  } catch {}
  const seeded = clone(DEFAULT_ACCOUNTS);
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(seeded));
  return seeded;
}
function saveAccounts(list){ localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list)); }

let cloudAccountsLoading = null;
async function refreshAccountsFromCloud(){
  const s=session();
  if(s?.role!=='admin') return loadAccounts();
  if(!isVpsApiConfigured() && !isSupabaseConfigured()) return loadAccounts();
  if(cloudAccountsLoading) return cloudAccountsLoading;
  cloudAccountsLoading=(async()=>{
    try{
      if(isVpsApiConfigured()){
        const result=await vpsListUsers();
        const list=(result?.users||[]).map(p=>({
          id:p.id,
          username:p.username,
          password:'',
          name:p.display_name,
          role:p.role,
          location:p.location,
          active:p.active,
          permissions:p.permissions||{},
          preferredLanguage:p.preferred_language||'vi',
          provider:'vps',
        }));
        saveAccounts(list);
        return list;
      }
      const supabase=await getSupabase();
      const {data,error}=await supabase
        .from('profiles')
        .select('id,username,display_name,role,location,active,permissions,preferred_language')
        .order('created_at',{ascending:true});
      if(error || !Array.isArray(data)) return loadAccounts();
      const list=data.map(p=>({
        id:p.id,
        username:p.username,
        password:'',
        name:p.display_name,
        role:p.role,
        location:p.location,
        active:p.active,
        permissions:p.permissions||{},
        preferredLanguage:p.preferred_language||'vi',
        provider:'supabase',
      }));
      saveAccounts(list);
      return list;
    }catch{
      return loadAccounts();
    }finally{
      cloudAccountsLoading=null;
    }
  })();
  return cloudAccountsLoading;
}
function session(){ try{return JSON.parse(localStorage.getItem(AUTH_KEY)||'null')}catch{return null} }
function setSession(account){
  const authRole = account.role === 'admin' ? 'admin' : account.role === 'central' ? 'central' : 'branch';
  localStorage.setItem(AUTH_KEY, JSON.stringify({ id:account.id, username:account.username, name:account.name, role:authRole, accountRole:account.role, location:account.location, permissions:account.permissions }));
}
function esc(v){ return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'); }
function label(key){ return tr(key); }
function roleLabel(role){ return label(role); }
function locationLabel(location){ return label(location === 'central' ? 'centralKitchen' : location === 'fuxing' ? 'fuxing' : location === 'yongji' ? 'yongji' : 'allLocations'); }
function moduleLabel(k){ return label(k); }

function normalizePermissions(role, input){
  return normalizeAccountPermissions(role, input);
}

function applyRoleAccess(){
  const s = session();
  if (!s?.id) return;
  const account = loadAccounts().find(a=>a.id===s.id);
  if (account && account.active===false) return;
  const effective = account || s;
  const permissions = normalizePermissions(s.accountRole || account?.role || 'employee', s.permissions || account?.permissions);
  if (isAdminAccount(effective) || isAdminAccount(s)) {
    document.querySelectorAll('.desktop-nav .nav-item, .mobile-nav .nav-item').forEach(a=>{ a.style.display=''; });
    return;
  }
  document.querySelectorAll('.desktop-nav .nav-item, .mobile-nav .nav-item').forEach(a=>{
    const href=(a.getAttribute('href')||'').replace(/^#/,'').split('?')[0];
    if (!href) return;
    const p = permissions[href];
    if (p) a.style.display = p.view ? '' : 'none';
  });
}

function interceptLogin(){
  if (isSupabaseConfigured() || isVpsApiConfigured()) return;
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
    location.hash = account.location === 'central' ? '#inventory' : (account.permissions?.dashboard?.view === false ? '#inventory' : '#dashboard');
    location.reload();
  }, true);
}

function accountCard(){
  const s=session();
  const account=loadAccounts().find(a=>a.id===s?.id) || (s?.id ? {
    id:s.id, username:s.username || '', name:s.name || '', role:s.accountRole || s.role || 'employee',
    location:s.location || 'fuxing', active:true, permissions:s.permissions || {}, password:''
  } : null);
  if(!account) return '';
  return `<article class="card account-self-card"><div class="account-card-head"><div><h2>${esc(label('accountSettings'))}</h2><p>${esc(account.name)} · ${esc(account.username)}</p></div></div><form data-account-self-password><div class="account-form-grid"><label><span>${esc(label('currentPassword'))}</span><input type="password" name="current" required autocomplete="current-password"></label><label><span>${esc(label('newPassword'))}</span><input type="password" name="next" required minlength="10" autocomplete="new-password"></label><label><span>${esc(label('confirmPassword'))}</span><input type="password" name="confirm" required minlength="10" autocomplete="new-password"></label></div><div class="account-form-actions"><button class="primary-button" type="submit">${esc(label('changePassword'))}</button></div><p class="account-form-message" data-account-self-message></p></form></article>`;
}

function adminPanel(){
  const s=session();
  if(s?.role!=='admin') return '';
  const accounts=loadAccounts();
  return `<article class="card account-admin-card"><div class="account-card-head"><div><h2>${esc(label('accountManagement'))}</h2><p>${esc(label('accountSubtitle'))}</p></div><button class="secondary-button" data-account-add>＋ ${esc(label('addAccount'))}</button></div><div class="account-table"><div class="account-table-head"><span>${esc(label('employeeName'))}</span><span>${esc(label('account'))}</span><span>${esc(label('role'))}</span><span>${esc(label('location'))}</span><span>${esc(label('status'))}</span><span></span></div>${accounts.map(a=>`<div class="account-row"><div><strong>${esc(a.name)}</strong><small>${esc(a.id)}</small></div><span>${esc(a.username)}</span><span>${esc(roleLabel(a.role))}</span><span>${esc(locationLabel(a.location))}</span><span class="account-status ${a.active?'on':'off'}">${esc(a.active?label('active'):label('disabled'))}</span><button class="icon-button account-edit" data-account-edit="${esc(a.id)}">✎</button></div>`).join('')}</div><p class="account-storage-note">${esc(label('temporaryStorage'))}</p></article>`;
}

let settingsCloudSynced=false;
function renderSettingsAccounts(){
  if(!location.hash.startsWith('#settings')) { settingsCloudSynced=false; return; }
  const layout=document.querySelector('.settings-layout');
  if(!layout || layout.querySelector('.account-admin-card,.account-self-card')) return;
  layout.insertAdjacentHTML('beforeend', accountCard()+adminPanel());
  bindSettings();
  if(session()?.role==='admin' && !settingsCloudSynced){
    settingsCloudSynced=true;
    void refreshAccountsFromCloud().then(()=>{
      if(location.hash.startsWith('#settings')) refreshSettings();
    });
  }
}

function permissionGrid(account){
  const p=normalizePermissions(account.role, account.permissions);
  return `<div class="permission-grid"><div class="permission-head"><span>${esc(label('permissions'))}</span><span>${esc(label('view'))}</span><span>${esc(label('edit'))}</span></div>${ACCOUNT_MODULES.map(k=>`<div class="permission-row"><span>${esc(moduleLabel(k))}</span><label class="permission-toggle" title="${esc(label('view'))}"><input class="permission-checkbox" type="checkbox" name="perm:${k}:view" ${p[k]?.view?'checked':''}><span class="permission-toggle-ui" aria-hidden="true"></span></label><label class="permission-toggle" title="${esc(label('edit'))}"><input class="permission-checkbox" type="checkbox" name="perm:${k}:edit" ${p[k]?.edit?'checked':''}><span class="permission-toggle-ui" aria-hidden="true"></span></label></div>`).join('')}</div>`;
}

async function openEditor(id=''){
  const list=await refreshAccountsFromCloud();
  const account=id?list.find(a=>a.id===id):{id:'',username:'',password:'',name:'',role:'employee',location:'fuxing',active:true,permissions:clone(ACCOUNT_ROLE_DEFAULTS.employee)};
  if(!account) return;
  const editing=Boolean(id);
  const host=document.createElement('div'); host.className='account-modal-backdrop'; host.dataset.accountModal='';
  host.innerHTML=`<section class="account-modal"><div class="account-card-head"><div><h2>${esc(editing?label('editAccount'):label('addAccount'))}</h2><p>${editing?esc(account.username):''}</p></div><button class="icon-button" data-account-close>×</button></div><form data-account-form data-edit-id="${esc(id)}"><div class="account-form-grid"><label><span>${esc(label('employeeName'))}</span><input name="name" required value="${esc(account.name)}"></label><label><span>${esc(label('account'))}</span><input name="username" required value="${esc(account.username)}" autocomplete="off"></label><label><span>${esc(editing?label('newPassword'):label('password'))}</span><input name="password" type="password" minlength="10" ${editing?'':'required'} autocomplete="new-password" placeholder="${editing?'••••••':''}"></label><label><span>${esc(label('role'))}</span><select name="role">${['admin','manager','supervisor','employee','parttime','central'].map(r=>`<option value="${r}" ${account.role===r?'selected':''}>${esc(roleLabel(r))}</option>`).join('')}</select></label><label><span>${esc(label('location'))}</span><select name="location"><option value="all" ${account.location==='all'?'selected':''}>${esc(label('allLocations'))}</option><option value="fuxing" ${account.location==='fuxing'?'selected':''}>${esc(label('fuxing'))}</option><option value="yongji" ${account.location==='yongji'?'selected':''}>${esc(label('yongji'))}</option><option value="central" ${account.location==='central'?'selected':''}>${esc(label('centralKitchen'))}</option></select></label><label class="account-active-toggle"><span>${esc(label('status'))}</span><span class="account-switch"><input name="active" type="checkbox" ${account.active?'checked':''}><span class="account-switch-ui" aria-hidden="true"></span><strong>${esc(label('active'))}</strong></span></label></div>${permissionGrid(account)}<p class="account-form-message" data-account-form-message></p><div class="account-form-actions">${editing&&account.id!==session()?.id?`<button type="button" class="danger-button" data-account-delete="${esc(account.id)}">${esc(label('delete'))}</button>`:''}<button type="button" class="secondary-button" data-account-close>${esc(label('cancel'))}</button><button type="submit" class="primary-button">${esc(label('save'))}</button></div></form></section>`;
  document.body.append(host);
  bindModal(host);
}

function bindModal(host){
  host.querySelectorAll('[data-account-close]').forEach(b=>b.onclick=()=>host.remove());
  host.addEventListener('change',(event)=>{
    const input=event.target;
    if(!(input instanceof HTMLInputElement) || !input.classList.contains('permission-checkbox')) return;
    const name=input.name||'';
    const match=name.match(/^perm:(.+):(view|edit)$/);
    if(!match) return;
    const [,moduleKey,kind]=match;
    const viewBox=host.querySelector(`input[name="perm:${CSS.escape(moduleKey)}:view"]`);
    const editBox=host.querySelector(`input[name="perm:${CSS.escape(moduleKey)}:edit"]`);
    if(kind==='edit' && input.checked && viewBox) viewBox.checked=true;
    if(kind==='view' && !input.checked && editBox) editBox.checked=false;
  });
  const roleSelect=host.querySelector('select[name="role"]');
  roleSelect?.addEventListener('change',()=>{
    const fake={role:roleSelect.value,permissions:clone(ACCOUNT_ROLE_DEFAULTS[roleSelect.value]||ACCOUNT_ROLE_DEFAULTS.employee)};
    host.querySelector('.permission-grid').outerHTML=permissionGrid(fake);
    const locationSelect=host.querySelector('select[name="location"]');
    if(locationSelect && roleSelect.value==='admin') locationSelect.value='all';
    if(locationSelect && roleSelect.value==='central') locationSelect.value='central';
    if(locationSelect && !['admin','central'].includes(roleSelect.value) && ['all','central'].includes(locationSelect.value)) locationSelect.value='fuxing';
  });
  host.querySelector('[data-account-delete]')?.addEventListener('click',e=>{
    if(isSupabaseConfigured()) return;
    if(!confirm(label('confirmDelete'))) return;
    const id=e.currentTarget.dataset.accountDelete;
    saveAccounts(loadAccounts().filter(a=>a.id!==id)); host.remove(); refreshSettings();
  });
  host.querySelector('[data-account-form]')?.addEventListener('submit',e=>{
    if(isSupabaseConfigured()) return;
    e.preventDefault();
    const form=e.currentTarget, data=new FormData(form), editId=form.dataset.editId;
    const list=loadAccounts();
    const existing=editId?list.find(a=>a.id===editId):null;
    const username=String(data.get('username')||'').trim();
    const password=String(data.get('password')||'');
    const message=form.querySelector('[data-account-form-message]');
    if(list.some(a=>a.username===username && a.id!==editId)){ message.textContent=label('usernameExists'); return; }
    if(!existing && password.length<10){ message.textContent=label('passwordLength'); return; }
    const role=String(data.get('role'));
    const permissions={};
    for(const k of ACCOUNT_MODULES){ const view=data.has(`perm:${k}:view`), edit=data.has(`perm:${k}:edit`); permissions[k]={view,edit:view&&edit}; }
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
  document.querySelector('[data-account-add]')?.addEventListener('click',()=>{ void openEditor(); });
  document.querySelectorAll('[data-account-edit]').forEach(b=>b.addEventListener('click',()=>{ void openEditor(b.dataset.accountEdit); }));
  document.querySelector('[data-account-self-password]')?.addEventListener('submit',e=>{
    if(isSupabaseConfigured()) return;
    e.preventDefault(); const form=e.currentTarget, data=new FormData(form), msg=form.querySelector('[data-account-self-message]');
    const s=session(), list=loadAccounts(), idx=list.findIndex(a=>a.id===s?.id); if(idx<0)return;
    const current=String(data.get('current')||''), next=String(data.get('next')||''), confirmPw=String(data.get('confirm')||'');
    if(list[idx].password!==current){ msg.textContent=label('wrongCurrentPassword'); return; }
    if(next.length<10){ msg.textContent=label('passwordLength'); return; }
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

window.addEventListener('shitu:accounts-synced',()=>{ refreshSettings(); });
