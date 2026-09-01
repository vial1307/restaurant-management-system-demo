import { TEXT } from "./i18n.js";

const EXTRA = {
  "Quy tắc chuẩn bị":"Quy tắc chuẩn bị · 備餐規則",
  "Thông tin vận hành":"Thông tin vận hành · 營運資訊",
  "Lịch sử đã lưu":"Lịch sử đã lưu · 已儲存紀錄",
  "Dữ liệu":"Dữ liệu · 資料",
  "Tự động lưu trên thiết bị này":"Tự động lưu trên thiết bị này · 自動儲存於此裝置",
  "Số bàn dự phòng":"Số bàn dự phòng · 預留桌數",
  "Gạo Thứ 2–5":"Gạo Thứ 2–5 · 週一至週四白米",
  "Gạo Thứ 6–CN":"Gạo Thứ 6–CN · 週五至週日白米",
  "Không nấu khi cơm còn trên":"Không nấu khi cơm còn trên · 剩飯超過此量免煮",
  "Nhân viên và phân quyền":"Nhân viên và phân quyền · 員工與權限",
  "Tài khoản hiện tại":"Tài khoản hiện tại · 目前帳號",
  "Thêm nhân viên":"Thêm nhân viên · 新增員工",
  "Quản trị viên":"Quản trị viên · 系統管理員",
  "Tổ trưởng":"Tổ trưởng · 組長",
  "Nhân viên chính thức":"Nhân viên chính thức · 正職員工",
  "Nhân viên part-time":"Nhân viên part-time · 兼職人員",
  "Bếp trung tâm":"Bếp trung tâm · 央廚",
  "Chi nhánh Fuxing":"Chi nhánh Fuxing · 復興店",
  "Tất cả cơ sở":"Tất cả cơ sở · 全部據點",
  "Đang hoạt động":"Đang hoạt động · 啟用",
  "Đã khóa":"Đã khóa · 停用",
  "Được xem":"Được xem · 查看",
  "Được thao tác":"Được thao tác · 可操作",
  "Quyền chức năng":"Quyền chức năng · 功能權限",
  "Cấp bậc":"Cấp bậc · 職級",
  "Nơi làm việc":"Nơi làm việc · 據點",
  "Trạng thái":"Trạng thái · 狀態",
  "Tên nhân viên":"Tên nhân viên · 員工姓名",
  "Mật khẩu mới":"Mật khẩu mới · 新密碼",
  "Xác nhận mật khẩu":"Xác nhận mật khẩu · 確認新密碼",
  "盤點數量":"Số kiểm kê · 盤點數量",
  "盤點調整":"Điều chỉnh kiểm kê · 盤點調整",
  "央廚進出庫紀錄":"Lịch sử nhập/xuất bếp trung tâm · 央廚進出庫紀錄",
  "主管以上可查看；資料來自目前主資料庫。":"Chủ quản trở lên được xem; dữ liệu từ database chính. · 主管以上可查看；資料來自目前主資料庫。",
  "Mật khẩu hiện tại":"Mật khẩu hiện tại · 目前密碼",
  "Đổi mật khẩu":"Đổi mật khẩu · 變更密碼",
};

const BUTTON_SHORT = new Map([
  ["Thêm nguyên liệu · 新增食材","Thêm · 新增"],
  ["Chỉnh sửa nguyên liệu · 編輯食材","Sửa · 編輯"],
  ["Xóa nguyên liệu · 刪除食材","Xóa · 刪除"],
  ["Lưu thay đổi · 儲存變更","Lưu · 儲存"],
  ["Cập nhật kho · 更新庫存","Cập nhật · 更新"],
  ["Đăng nhập hệ thống · 登入系統","Đăng nhập · 登入"],
  ["Thêm tài khoản · 新增帳號","Thêm tài khoản · 新增"],
  ["Chỉnh sửa tài khoản · 編輯帳號","Sửa tài khoản · 編輯"],
]);

function vietnameseMode(){
  return document.documentElement.lang === "vi" ||
    Boolean(document.querySelector('.language-switch [data-language="vi"].active'));
}

function buildCatalog(){
  const map = new Map(Object.entries(EXTRA));
  const vi = TEXT?.vi || {};
  const zh = TEXT?.zh || {};
  for (const [key, value] of Object.entries(vi)){
    const chinese = zh[key];
    if (!value || !chinese || value === chinese) continue;
    if (!map.has(value)) map.set(value, `${value} · ${chinese}`);
  }
  return map;
}
const CATALOG = buildCatalog();

function queryWithin(root,selector){
  const result=[];
  if(root instanceof Element && root.matches(selector)) result.push(root);
  if(root?.querySelectorAll) result.push(...root.querySelectorAll(selector));
  return result;
}

function patchText(root=document.body){
  if (!vietnameseMode() || !root) return;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  const nodes=[];
  while(walker.nextNode()) nodes.push(walker.currentNode);
  for(const node of nodes){
    const parent=node.parentElement;
    if(!parent || ["SCRIPT","STYLE","INPUT","TEXTAREA","OPTION"].includes(parent.tagName)) continue;
    const raw=node.nodeValue || "";
    const value=raw.trim();
    if(!value || value.includes(" · ")) continue;
    const translated=CATALOG.get(value);
    if(translated) node.nodeValue=raw.replace(value,translated);
  }

  queryWithin(root,"option").forEach(option=>{
    const value=(option.textContent||"").trim();
    if(!value || value.includes(" · ")) return;
    const translated=CATALOG.get(value);
    if(translated) option.textContent=translated;
  });

  queryWithin(root,"button,.primary-button,.secondary-button,.danger-button").forEach(el=>{
    const text=(el.textContent||"").replace(/\s+/g," ").trim();
    const compact=BUTTON_SHORT.get(text);
    if(compact){
      const icon=el.querySelector(".icon");
      if(icon){
        Array.from(el.childNodes).filter(n=>n.nodeType===Node.TEXT_NODE).forEach(n=>n.remove());
        const span=el.querySelector("span") || document.createElement("span");
        span.textContent=compact;
        if(!span.parentNode) el.append(span);
      }else el.textContent=compact;
      el.title ||= text;
    }
  });
}

function patchSearchPlaceholders(root=document.body){
  queryWithin(root,'input').forEach(input=>{
    const p=input.getAttribute("placeholder") || "";
    const explicit=input.dataset.field==="inventorySearch" || input.hasAttribute("data-central-search");
    const looksSearch=input.type==="search" || /tìm|search|搜尋|pinyin|注音/i.test(p);
    if(!explicit && !looksSearch) return;
    if(input.dataset.field==="inventorySearch" || /nguyên liệu|食材/i.test(p)){
      input.placeholder="Tìm nguyên liệu / 食材 / Pinyin / 注音…";
    }else{
      input.placeholder="Tìm / 中文 / Tiếng Việt / Pinyin / 注音…";
    }
    input.setAttribute("autocomplete","off");
    input.setAttribute("inputmode","search");
    input.setAttribute("aria-label",input.placeholder);
  });
}

function patchTables(root=document.body){
  queryWithin(root,".card,.stat-card,.central-card,.account-table").forEach(el=>{
    el.setAttribute("data-ui-density","compact");
  });
}

let frame=0;
const pendingRoots=new Set();

function schedule(root=document.body){
  if(!root) return;
  pendingRoots.add(root.nodeType===Node.TEXT_NODE ? root.parentElement : root);
  if(frame) return;
  frame=requestAnimationFrame(()=>{
    frame=0;
    const roots=[...pendingRoots].filter(Boolean);
    pendingRoots.clear();
    const compact=roots.filter((candidate,index)=>
      !roots.some((other,otherIndex)=>
        otherIndex!==index && other instanceof Element && candidate instanceof Node && other.contains(candidate)
      )
    );
    for(const root of compact){
      patchText(root);
      patchSearchPlaceholders(root);
      patchTables(root);
    }
  });
}

schedule(document.body);
new MutationObserver((mutations)=>{
  for(const mutation of mutations){
    for(const node of mutation.addedNodes){
      if(node.nodeType===Node.ELEMENT_NODE) schedule(node);
      else if(node.nodeType===Node.TEXT_NODE) schedule(node.parentElement);
    }
  }
}).observe(document.body,{childList:true,subtree:true});

window.addEventListener("hashchange",()=>schedule(document.body));
document.addEventListener("click",e=>{
  if(e.target.closest('[data-action="set-language"]')) setTimeout(()=>schedule(document.body),0);
});
