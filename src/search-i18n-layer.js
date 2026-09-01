import { searchMatches } from "./search-utils.js";

const BILINGUAL = {
  // Global navigation / common UI
  "Điều hành bếp": "Điều hành bếp · 廚房營運管理",
  "Tổng quan": "Tổng quan · 總覽",
  "Tồn kho": "Tồn kho · 庫存",
  "Gọi hàng": "Gọi hàng · 叫貨管理",
  "Đặt bàn": "Đặt bàn · 訂位備料",
  "Chuẩn bị": "Chuẩn bị · 開班準備",
  "Menu món": "Menu món · 門市菜單",
  "Tiêu chuẩn SOP": "Tiêu chuẩn SOP · SOP 作業標準",
  "Năng lực nhân viên": "Năng lực nhân viên · 員工能力",
  "Chấm công": "Chấm công · 出勤薪資",
  "Lịch làm việc": "Lịch làm việc · 排班",
  "Báo cáo": "Báo cáo · 報表",
  "Quản lý từ xa": "Quản lý từ xa · 遠端管理",
  "Cài đặt": "Cài đặt · 設定",
  "Ngày phục vụ": "Ngày phục vụ · 營業日期",
  "Đã hoàn thành": "Đã hoàn thành · 已完成",
  "Khu làm việc": "Khu làm việc · 工作區",
  "Khu mì": "Khu mì · 麵區",
  "Khu canh": "Khu canh · 湯區",
  "Khu hải sản": "Khu hải sản · 海鮮區",
  "Khu thịt": "Khu thịt · 肉區",
  "Quản lý": "Quản lý · 主管",
  "Nhân viên": "Nhân viên · 員工",
  "Ngôn ngữ": "Ngôn ngữ · 語言",
  "Phụ trách": "Phụ trách · 負責人",
  "Số lượng": "Số lượng · 數量",
  "Hiện có": "Hiện có · 現有庫存",
  "Định mức": "Định mức · 安全庫存",
  "Thao tác": "Thao tác · 作業",
  "Mặt hàng": "Mặt hàng · 品項",
  "Vị trí": "Vị trí · 儲位",
  "Tất cả": "Tất cả · 全部",

  // Inventory
  "Kho tổng": "Kho tổng · 總備庫",
  "Khu cất nguyên liệu": "Khu cất nguyên liệu · 食材儲位",
  "Kho dự trữ chính": "Kho dự trữ chính · 主要備庫",
  "Tủ sử dụng trong bếp": "Tủ sử dụng trong bếp · 現場冰箱",
  "Tất cả nơi cất": "Tất cả nơi cất · 全部儲位",
  "Tất cả khu làm việc": "Tất cả khu làm việc · 全部工作區",
  "Tồn trong tủ": "Tồn trong tủ · 儲位庫存",
  "Đang dùng": "Đang dùng · 現場用量",
  "Nơi lấy hàng": "Nơi lấy hàng · 補貨來源",
  "Bổ sung": "Bổ sung · 補貨",
  "Định mức từng tủ": "Định mức từng tủ · 各儲位安全庫存",
  "Tổng dự trữ": "Tổng dự trữ · 總備庫存",
  "Báo xưởng nhập hàng": "Báo xưởng nhập hàng · 通知央廚叫貨",
  "Chờ hàng từ xưởng": "Chờ hàng từ xưởng · 等待央廚到貨",
  "Thiếu tại khu làm việc": "Thiếu tại khu làm việc · 工作區缺料",
  "Thiếu trong kho tổng": "Thiếu trong kho tổng · 總庫存不足",
  "Cần bổ sung tại tủ": "Cần bổ sung tại tủ · 儲位需補貨",
  "Lấy từ": "Lấy từ · 從此儲位補貨",
  "Cập nhật kho": "Cập nhật kho · 更新庫存",
  "Thêm nguyên liệu": "Thêm nguyên liệu · 新增食材",
  "Chỉnh sửa nguyên liệu": "Chỉnh sửa nguyên liệu · 編輯食材",
  "Xóa nguyên liệu": "Xóa nguyên liệu · 刪除食材",
  "Lưu thay đổi": "Lưu thay đổi · 儲存變更",

  // Login / account
  "Đăng nhập": "Đăng nhập · 登入",
  "帳號": "Tài khoản · 帳號",
  "密碼": "Mật khẩu · 密碼",
  "登入系統": "Đăng nhập hệ thống · 登入系統",
  "登出": "Đăng xuất · 登出",
  "系統管理員": "Quản trị viên · 系統管理員",
  "央廚員工": "Nhân viên bếp trung tâm · 央廚員工",
  "復興店員工": "Nhân viên Fuxing · 復興店員工",
  "復興店": "Chi nhánh Fuxing · 復興店",
  "永吉店": "Chi nhánh Yongji · 永吉店",
  "央廚": "Bếp trung tâm · 央廚",

  // Central kitchen - use terminology common in Taiwan warehouse / restaurant operations
  "工作區 · 央廚": "Khu làm việc · Bếp trung tâm · 工作區 · 央廚",
  "央廚庫存": "Kho bếp trung tâm · 央廚庫存",
  "央廚冷凍、4門、臥櫃與冷藏的總覽及進出貨。": "Theo dõi tổng quan, nhập kho và xuất kho tại các tủ của bếp trung tâm. · 央廚冷凍、4門、臥櫃及冷藏之庫存總覽與進出庫管理。",
  "品項": "Mặt hàng · 品項",
  "總數量": "Tổng tồn kho · 庫存總量",
  "儲存區": "Khu lưu trữ · 儲位",
  "已建立產品": "Mặt hàng đã tạo · 已建品項",
  "依各品項單位加總": "Cộng theo đơn vị của từng mặt hàng · 依各品項單位加總",
  "央廚專用": "Dành riêng cho bếp trung tâm · 央廚專用",
  "庫存總覽": "Tổng quan tồn kho · 庫存總覽",
  "入庫": "Nhập kho · 進貨入庫",
  "出庫": "Xuất kho · 領料／出庫",
  "操作紀錄": "Lịch sử nhập/xuất · 進出庫紀錄",
  "全部": "Tất cả · 全部",
  "央廚冷凍": "Tủ đông bếp trung tâm · 央廚冷凍",
  "央廚4門": "Tủ 4 cánh bếp trung tâm · 央廚4門",
  "央廚臥櫃": "Tủ đông nằm bếp trung tâm · 央廚臥櫃",
  "央廚冷藏": "Tủ mát bếp trung tâm · 央廚冷藏",
  "位置": "Vị trí · 儲位",
  "目前數量": "Tồn hiện tại · 現有庫存",
  "入庫數量": "Số lượng nhập · 入庫數量",
  "出庫數量": "Số lượng xuất · 出庫數量",
  "操作": "Thao tác · 作業",
  "+ 入庫": "+ Nhập kho · 入庫",
  "− 出庫": "− Xuất kho · 出庫",
  "央廚進出貨紀錄": "Lịch sử nhập/xuất bếp trung tâm · 央廚進出庫紀錄",
  "僅主管／管理員可查看。": "Chỉ cấp quản lý trở lên được xem. · 僅主管以上可查看。",
  "沒有符合條件的品項。": "Không có mặt hàng phù hợp. · 沒有符合條件的品項。",
  "目前尚無操作紀錄。": "Chưa có lịch sử nhập/xuất. · 目前尚無進出庫紀錄。",
  "出庫數量不能大於目前庫存。": "Số lượng xuất không được lớn hơn tồn hiện tại. · 出庫數量不得大於現有庫存。",
};

function installSearchEnhancer() {
  const genericRows = [
    ".menu-catalog-row",
    ".staff-row",
    ".management-list-row",
    ".account-row",
    ".sop-list-item",
    ".training-progress-row",
    ".skill-catalog-row",
    ".history-item",
    ".inventory-op-card",
    ".shipment-card",
    ".report-table tbody tr"
  ].join(",");

  const apply = (input) => {
    const isMain = input.dataset.field === "inventorySearch";
    const isCentral = input.hasAttribute("data-central-search");
    // Main and central inventory searches are handled natively so clearing the
    // field restores data state instead of only changing DOM visibility.
    if (isMain || isCentral) return;

    const placeholder = input.getAttribute("placeholder") || "";
    const isGenericSearch = input.type === "search" || /tìm|search|搜尋|pinyin|注音/i.test(placeholder);
    if (!isGenericSearch) return;

    const scope = input.closest(".card,.page-content,.account-modal") || document.querySelector(".page-content");
    const rows = scope?.querySelectorAll(genericRows);
    if (!rows?.length) return;

    const query = input.value;
    rows.forEach((row) => {
      row.hidden = !searchMatches(row.textContent || "", query);
    });
  };

  const handleSearchEvent = (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    apply(input);
  };

  document.addEventListener("input", handleSearchEvent, true);
  document.addEventListener("search", handleSearchEvent, true);

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const placeholder = input.getAttribute("placeholder") || "";
    const searchable = input.type === "search" || input.dataset.field === "inventorySearch" ||
      input.hasAttribute("data-central-search") || /tìm|search|搜尋|pinyin|注音/i.test(placeholder);
    if (!searchable || !input.value) return;
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, true);
}

function isVietnameseMode() {
  return document.documentElement.lang === "vi" || Boolean(document.querySelector('.language-switch button[data-language="vi"].active'));
}

function queryWithin(root, selector) {
  const result = [];
  if (root instanceof Element && root.matches(selector)) result.push(root);
  if (root?.querySelectorAll) result.push(...root.querySelectorAll(selector));
  return result;
}

function bilingualize(root = document.body) {
  if (!isVietnameseMode() || !root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const parent = node.parentElement;
    if (!parent || ["SCRIPT", "STYLE", "INPUT", "TEXTAREA", "OPTION"].includes(parent.tagName)) continue;
    const raw = node.nodeValue || "";
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const replacement = BILINGUAL[trimmed];
    if (replacement && replacement !== trimmed) node.nodeValue = raw.replace(trimmed, replacement);
  }

  queryWithin(root, 'input[placeholder="搜尋品項..."]').forEach((el) => el.placeholder = "Tìm món / 中文 / Pinyin / 注音…");
  queryWithin(root, 'input[placeholder="Tìm nguyên liệu..."]').forEach((el) => el.placeholder = "Tìm nguyên liệu / 食材 / Pinyin / 注音…");
}

let queued = false;
const pendingRoots = new Set();

function schedulePatch(root = document.body) {
  if (!root) return;
  pendingRoots.add(root.nodeType === Node.TEXT_NODE ? root.parentElement : root);
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    const roots = [...pendingRoots].filter(Boolean);
    pendingRoots.clear();
    const compact = roots.filter((candidate, index) =>
      !roots.some((other, otherIndex) =>
        otherIndex !== index && other instanceof Element && candidate instanceof Node && other.contains(candidate)
      )
    );
    for (const root of compact) bilingualize(root);
  });
}

installSearchEnhancer();
schedulePatch(document.body);
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType === Node.ELEMENT_NODE) schedulePatch(node);
      else if (node.nodeType === Node.TEXT_NODE) schedulePatch(node.parentElement);
    }
  }
});
observer.observe(document.querySelector("#app") || document.body, { childList: true, subtree: true });
window.addEventListener("hashchange", () => schedulePatch(document.body));
document.addEventListener("click", (event) => {
  if (event.target.closest('[data-action="set-language"]')) setTimeout(() => schedulePatch(document.body), 0);
});