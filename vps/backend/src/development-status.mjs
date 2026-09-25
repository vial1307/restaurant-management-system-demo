const REPOSITORY_URL = "https://github.com/vial1307/restaurant-management-system-demo";
const PUBLIC_HANDOFF_URL = "https://vial1307.github.io/restaurant-management-system-demo/handoff.html";

function github(path = "") {
  return `${REPOSITORY_URL}${path}`;
}

export const DEVELOPMENT_STATUS = Object.freeze({
  updated_at:"2026-09-22",
  phase:"inventory-cross-surface-sync",
  status:"in_progress",
  headline:"Production #832 đã verified trên schema 024. Đang sửa đồng bộ Super Admin ↔ website chính và làm gọn danh sách nguyên liệu; chờ kiểm thử hai phiên trình duyệt.",
  repository:{
    name:"vial1307/restaurant-management-system-demo",
    url:REPOSITORY_URL,
    actions_url:github("/actions"),
    pulls_url:github("/pulls"),
  },
  canonical_handoff:{
    url:PUBLIC_HANDOFF_URL,
    purpose:"Một link duy nhất để dev/chat mới đọc PR hiện tại, branch/head SHA, CI và tài liệu tiếp quản.",
  },
  current_work:{
    branch:"fix/inventory-admin-main-sync-20260922",
    url:github("/tree/fix/inventory-admin-main-sync-20260922"),
    pull_request:null,
    baseline_main_sha:"5cc4f907387873367d78dfbdfb3183971846e968",
    baseline_main_url:github("/commit/5cc4f907387873367d78dfbdfb3183971846e968"),
    candidate_schema:"024",
    stopping_point:"Inventory cross-surface sync: bỏ danh sách vị trí cố định ở kho trung tâm, làm mới thay đổi master-data, giữ phạm vi chi nhánh và gom thao tác nguyên liệu. Chờ exact-head CI/deploy.",
    resolved_incident:null,
    code_focus:[
      "src/admin-inventory-database.js",
      "src/admin-inventory-database.css",
      "vps/backend/scripts/admin-inventory-database-regression.mjs",
      "tests/super-admin-panel-browser-regression.mjs",
    ],
  },
  release_evidence:{
    milestone_sha:"5cc4f907387873367d78dfbdfb3183971846e968",
    workflow_run_id:"35672333632",
    url:github("/actions/runs/35672333632"),
    schema:"024",
    inventory_audit_run_id:"35672333632",
    inventory_audit_url:github("/actions/runs/35672333632"),
    note:"Deploy #832 verified release 5cc4f90 and schema 024. This is the baseline, not production verification of the current cross-surface synchronization fix.",
  },
  documents:[
    { label:"CURRENT_HANDOFF.md", purpose:"Trạng thái chuẩn và invariant để dev tiếp quản", url:github("/blob/main/docs/CURRENT_HANDOFF.md") },
    { label:"WORK_LOG.md", purpose:"Nhật ký sửa lỗi / CI / deploy", url:github("/blob/main/docs/WORK_LOG.md") },
    { label:"STATUS.md", purpose:"Workboard ngắn hạn / việc đang làm", url:github("/blob/main/docs/STATUS.md") },
    { label:"DEVELOPMENT_RULES.md", purpose:"Quy tắc bắt buộc trước khi code", url:github("/blob/main/docs/DEVELOPMENT_RULES.md") },
  ],
  next_steps:[
    "Chạy API round-trip, stale-write, archive và phân quyền trên cả ba chi nhánh.",
    "Kiểm tra biểu mẫu desktop/mobile, lưu rồi tải lại trang và giữ nguyên generic CRUD.",
    "Chỉ merge/deploy SHA đã qua đầy đủ CI, sau đó xác minh production smoke.",
    "Giữ nguyên schema 024 và các cấu hình chi nhánh đang có; không sao chép layout giữa chi nhánh.",
  ],
  security_note:"Live handoff chỉ đọc metadata công khai của repository và runtime release/schema; không trả secret, credential hoặc dữ liệu nghiệp vụ.",
});
