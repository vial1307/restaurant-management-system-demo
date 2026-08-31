const BILINGUAL = {
  "Tổng quan": "Tổng quan · 總覽",
  "Tồn kho": "Tồn kho · 庫存",
  "Gọi hàng": "Gọi hàng · 叫貨",
  "Đặt bàn": "Đặt bàn · 訂位",
  "Chuẩn bị": "Chuẩn bị · 備餐",
  "Menu món": "Menu món · 門市菜單",
  "Tiêu chuẩn SOP": "Tiêu chuẩn SOP · SOP 作業標準",
  "Năng lực nhân viên": "Năng lực nhân viên · 員工能力",
  "Chấm công": "Chấm công · 打卡薪資",
  "Lịch làm việc": "Lịch làm việc · 排班",
  "Báo cáo": "Báo cáo · 報表",
  "Quản lý từ xa": "Quản lý từ xa · 遠端管理",
  "Cài đặt": "Cài đặt · 設定",
  "Kho tổng": "Kho tổng · 總庫存",
  "Khu làm việc": "Khu làm việc · 工作區",
  "Kho dự trữ chính": "Kho dự trữ chính · 主要庫存",
  "Tủ sử dụng trong bếp": "Tủ sử dụng trong bếp · 廚房使用冰箱",
  "Khu cất nguyên liệu": "Khu cất nguyên liệu · 食材儲位",
  "Tất cả nơi cất": "Tất cả nơi cất · 全部儲位",
  "Tất cả khu làm việc": "Tất cả khu làm việc · 全部工作區",
  "Số lượng": "Số lượng · 數量",
  "Hiện có": "Hiện có · 現有庫存",
  "Định mức": "Định mức · 安全庫存",
  "Cập nhật kho": "Cập nhật kho · 更新庫存",
  "Thêm nguyên liệu": "Thêm nguyên liệu · 新增食材",
  "Chỉnh sửa nguyên liệu": "Chỉnh sửa nguyên liệu · 編輯食材",
  "Xóa nguyên liệu": "Xóa nguyên liệu · 刪除食材",
  "Lưu thay đổi": "Lưu thay đổi · 儲存變更",
  "Ngôn ngữ": "Ngôn ngữ · 語言",
  "Phụ trách": "Phụ trách · 負責人",
  "Nhân viên và phân quyền": "Nhân viên và phân quyền · 員工與權限",
  "Vai trò": "Vai trò · 權限角色",
  "Tài khoản hiện tại": "Tài khoản hiện tại · 目前帳號",
  "Đăng nhập": "Đăng nhập · 登入",
  "帳號": "Tài khoản · 帳號",
  "密碼": "Mật khẩu · 密碼",
  "登入系統": "Đăng nhập hệ thống · 登入系統",
  "庫存總覽": "Tổng quan tồn kho · 庫存總覽",
  "入庫": "Nhập kho · 進貨入庫",
  "出庫": "Xuất kho · 領料／出庫",
  "操作紀錄": "Lịch sử nhập/xuất · 進出庫紀錄",
  "央廚庫存": "Kho bếp trung tâm · 央廚庫存",
  "品項": "Mặt hàng · 品項",
  "總數量": "Tổng số lượng · 庫存總量",
  "儲存區": "Khu lưu trữ · 儲位",
  "已建立產品": "Sản phẩm đã tạo · 已建品項",
  "央廚專用": "Dành cho bếp trung tâm · 央廚專用",
  "全部": "Tất cả · 全部",
  "位置": "Vị trí · 儲位",
  "目前數量": "Tồn hiện tại · 現有庫存",
  "入庫數量": "Số lượng nhập · 入庫數量",
  "出庫數量": "Số lượng xuất · 出庫數量",
  "操作": "Thao tác · 操作",
  "央廚進出貨紀錄": "Lịch sử nhập/xuất bếp trung tâm · 央廚進出庫紀錄",
  "僅主管／管理員可查看。": "Chỉ quản lý trở lên được xem. · 僅主管以上可查看。",
  "沒有符合條件的品項。": "Không có mặt hàng phù hợp. · 沒有符合條件的品項。",
  "目前尚無操作紀錄。": "Chưa có lịch sử thao tác. · 目前尚無進出庫紀錄。",
  "工作區 · 央廚": "Khu làm việc · Bếp trung tâm · 工作區 · 央廚",
  "復興店": "Chi nhánh Fuxing · 復興店",
  "央廚": "Bếp trung tâm · 央廚",
  "系統管理員": "Quản trị viên · 系統管理員",
  "央廚員工": "Nhân viên bếp trung tâm · 央廚員工",
  "復興店員工": "Nhân viên Fuxing · 復興店員工",
};

// Common kitchen/inventory characters. Pinyin is intentionally tone-free so staff can type quickly.
const PHONETIC = {
  央:["yang","ㄧㄤ"],廚:["chu","ㄔㄨ"],冷:["leng","ㄌㄥ"],凍:["dong","ㄉㄨㄥ"],藏:["cang","ㄘㄤ"],冰:["bing","ㄅㄧㄥ"],箱:["xiang","ㄒㄧㄤ"],門:["men","ㄇㄣ"],臥:["wo","ㄨㄛ"],櫃:["gui","ㄍㄨㄟ"],
  牛:["niu","ㄋㄧㄡ"],肉:["rou","ㄖㄡ"],豬:["zhu","ㄓㄨ"],羊:["yang","ㄧㄤ"],雞:["ji","ㄐㄧ"],鴨:["ya","ㄧㄚ"],魚:["yu","ㄩ"],蝦:["xia","ㄒㄧㄚ"],海:["hai","ㄏㄞ"],鮮:["xian","ㄒㄧㄢ"],
  麻:["ma","ㄇㄚ"],辣:["la","ㄌㄚ"],湯:["tang","ㄊㄤ"],醬:["jiang","ㄐㄧㄤ"],油:["you","ㄧㄡ"],汁:["zhi","ㄓ"],飯:["fan","ㄈㄢ"],麵:["mian","ㄇㄧㄢ"],米:["mi","ㄇㄧ"],
  炸:["zha","ㄓㄚ"],滷:["lu","ㄌㄨ"],煮:["zhu","ㄓㄨ"],燴:["hui","ㄏㄨㄟ"],泡:["pao","ㄆㄠ"],舒:["shu","ㄕㄨ"],肥:["fei","ㄈㄟ"],原:["yuan","ㄩㄢ"],骨:["gu","ㄍㄨ"],
  豆:["dou","ㄉㄡ"],腐:["fu","ㄈㄨ"],乾:["gan","ㄍㄢ"],皮:["pi","ㄆㄧ"],芋:["yu","ㄩ"],頭:["tou","ㄊㄡ"],丸:["wan","ㄨㄢ"],蛋:["dan","ㄉㄢ"],餃:["jiao","ㄐㄧㄠ"],
  尾:["wei","ㄨㄟ"],肚:["du","ㄉㄨ"],舌:["she","ㄕㄜ"],翅:["chi","ㄔ"],腸:["chang","ㄔㄤ"],腳:["jiao","ㄐㄧㄠ"],血:["xue","ㄒㄩㄝ"],排:["pai","ㄆㄞ"],骨:["gu","ㄍㄨ"],酥:["su","ㄙㄨ"],
  花:["hua","ㄏㄨㄚ"],枝:["zhi","ㄓ"],漿:["jiang","ㄐㄧㄤ"],昆:["kun","ㄎㄨㄣ"],布:["bu","ㄅㄨ"],重:["zhong","ㄓㄨㄥ"],輕:["qing","ㄑㄧㄥ"],川:["chuan","ㄔㄨㄢ"],秘:["mi","ㄇㄧ"],蒜:["suan","ㄙㄨㄢ"],
  大:["da","ㄉㄚ"],小:["xiao","ㄒㄧㄠ"],白:["bai","ㄅㄞ"],黃:["huang","ㄏㄨㄤ"],紅:["hong","ㄏㄨㄥ"],黑:["hei","ㄏㄟ"],清:["qing","ㄑㄧㄥ"],香:["xiang","ㄒㄧㄤ"],鮮:["xian","ㄒㄧㄢ"],
  地:["di","ㄉㄧ"],獄:["yu","ㄩ"],濃:["nong","ㄋㄨㄥ"],縮:["suo","ㄙㄨㄛ"],肩:["jian","ㄐㄧㄢ"],胸:["xiong","ㄒㄩㄥ"],筋:["jin","ㄐㄧㄣ"],喉:["hou","ㄏㄡ"],蛙:["wa","ㄨㄚ"],
  法:["fa","ㄈㄚ"],國:["guo","ㄍㄨㄛ"],可:["ke","ㄎㄜ"],頌:["song","ㄙㄨㄥ"],虎:["hu","ㄏㄨ"],三:["san","ㄙㄢ"],記:["ji","ㄐㄧ"],追:["zhui","ㄓㄨㄟ"],
};

const PHRASE_ALIASES = {
  "四門冰箱": ["simenbingxiang", "si men bing xiang", "ㄙㄇㄣㄅㄧㄥㄒㄧㄤ"],
  "大冷凍": ["dalengdong", "da leng dong", "ㄉㄚㄌㄥㄉㄨㄥ"],
  "大冷藏": ["dalengcang", "da leng cang", "ㄉㄚㄌㄥㄘㄤ"],
  "廚房冰箱": ["chufangbingxiang", "chu fang bing xiang", "ㄔㄨㄈㄤㄅㄧㄥㄒㄧㄤ"],
  "央廚冷凍": ["yangchulengdong", "yang chu leng dong", "ㄧㄤㄔㄨㄌㄥㄉㄨㄥ"],
  "央廚冷藏": ["yangchulengcang", "yang chu leng cang", "ㄧㄤㄔㄨㄌㄥㄘㄤ"],
  "牛肉": ["niurou", "niu rou", "ㄋㄧㄡㄖㄡ"],
  "牛尾": ["niuwei", "niu wei", "ㄋㄧㄡㄨㄟ"],
  "牛肚": ["niudu", "niu du", "ㄋㄧㄡㄉㄨ"],
  "鴨舌": ["yashe", "ya she", "ㄧㄚㄕㄜ"],
  "鴨翅": ["yachi", "ya chi", "ㄧㄚㄔ"],
  "鴨腸": ["yachang", "ya chang", "ㄧㄚㄔㄤ"],
  "豆干": ["dougan", "dou gan", "ㄉㄡㄍㄢ"],
  "花枝漿": ["huazhijiang", "hua zhi jiang", "ㄏㄨㄚㄓㄐㄧㄤ"],
  "炸芋頭": ["zhayutou", "zha yu tou", "ㄓㄚㄩㄊㄡ"],
  "排骨酥": ["paigusu", "pai gu su", "ㄆㄞㄍㄨㄙㄨ"],
  "麻辣湯": ["malatang", "ma la tang", "ㄇㄚㄌㄚㄊㄤ"],
};

function norm(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[ˊˇˋ˙]/g, "").replace(/[\s._\-\/()（）]+/g, "");
}

function phoneticOf(text) {
  let py = "", zy = "";
  for (const ch of String(text || "")) {
    const item = PHONETIC[ch];
    if (item) { py += item[0]; zy += item[1]; }
  }
  const aliases = [];
  for (const [phrase, list] of Object.entries(PHRASE_ALIASES)) if (String(text).includes(phrase)) aliases.push(...list);
  return `${py} ${zy} ${aliases.join(" ")}`;
}

function rowMatches(row, query) {
  const text = row.textContent || "";
  const haystack = norm(`${text} ${phoneticOf(text)}`);
  return !query || haystack.includes(norm(query));
}

function installSearchEnhancer() {
  document.addEventListener("input", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const isMain = input.dataset.field === "inventorySearch";
    const isCentral = input.hasAttribute("data-central-search");
    if (!isMain && !isCentral) return;

    // Capture pinyin/zhuyin searches locally, avoiding a full application rerender on every key.
    const query = input.value;
    const hasPhoneticInput = /[a-zA-Zㄅ-ㄩˊˇˋ˙]/.test(query);
    if (!hasPhoneticInput) return;

    event.stopImmediatePropagation();
    const scope = isCentral ? input.closest(".central-card") : input.closest(".page-content");
    const selector = isCentral ? ".central-row" : ".inventory-row";
    scope?.querySelectorAll(selector).forEach((row) => {
      row.style.display = rowMatches(row, query) ? "" : "none";
    });
  }, true);
}

function isVietnameseMode() {
  return document.documentElement.lang === "vi" || document.querySelector('.language-switch button[data-language="vi"].active');
}

function bilingualize(root = document) {
  if (!isVietnameseMode()) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const parent = node.parentElement;
    if (!parent || ["SCRIPT","STYLE","INPUT","TEXTAREA","OPTION"].includes(parent.tagName)) continue;
    const raw = node.nodeValue;
    const trimmed = raw?.trim();
    if (!trimmed || !BILINGUAL[trimmed]) continue;
    node.nodeValue = raw.replace(trimmed, BILINGUAL[trimmed]);
  }
  document.querySelectorAll('input[placeholder="搜尋品項..."]').forEach((el) => el.placeholder = "Tìm món / 中文 / Pinyin / 注音…");
  document.querySelectorAll('input[placeholder="Tìm nguyên liệu..."]').forEach((el) => el.placeholder = "Tìm nguyên liệu / 食材 / Pinyin / 注音…");
}

let queued = false;
function schedulePatch() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    bilingualize(document.body);
  });
}

installSearchEnhancer();
schedulePatch();
const observer = new MutationObserver(schedulePatch);
observer.observe(document.body, { childList: true, subtree: true });
window.addEventListener("hashchange", schedulePatch);
document.addEventListener("click", (event) => {
  if (event.target.closest('[data-action="set-language"]')) setTimeout(schedulePatch, 0);
});