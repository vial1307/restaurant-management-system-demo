const REPOSITORY_URL = "https://github.com/vial1307/restaurant-management-system-demo";
const PUBLIC_HANDOFF_URL = "https://vial1307.github.io/restaurant-management-system-demo/handoff.html";

function github(path = "") {
  return `${REPOSITORY_URL}${path}`;
}

export const DEVELOPMENT_STATUS = Object.freeze({
  updated_at:"2026-09-21",
  phase:"branch-inventory-database",
  status:"in-progress",
  headline:"Production #828 đã verified trên schema 024. Candidate mới bổ sung Database kho theo chi nhánh trong Super Admin; đang chờ kiểm thử API và giao diện đầy đủ.",
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
    branch:"feat/super-admin-branch-inventory-database-20260921",
    url:github("/tree/feat/super-admin-branch-inventory-database-20260921"),
    pull_request:null,
    baseline_main_sha:"00949bec772bcc04441626903411020f2e3e7023",
    baseline_main_url:github("/commit/00949bec772bcc04441626903411020f2e3e7023"),
    candidate_schema:"024",
    stopping_point:"Inventory Database mới có 5 mục và dùng API PostgreSQL hiện có. Static/performance contracts PASS; API/device CI và deploy production của candidate chưa được xác nhận.",
    resolved_incident:null,
    code_focus:[
      "src/admin-inventory-database.js",
      "src/admin-inventory-database.css",
      "vps/backend/scripts/admin-inventory-database-regression.mjs",
      "tests/super-admin-panel-browser-regression.mjs",
    ],
  },
  release_evidence:{
    milestone_sha:"00949bec772bcc04441626903411020f2e3e7023",
    workflow_run_id:"35573596640",
    url:github("/actions/runs/35573596640"),
    schema:"024",
    inventory_audit_run_id:"35573596640",
    inventory_audit_url:github("/actions/runs/35573596640"),
    note:"Deploy #828 completed successfully for exact release 00949bec. This is the pre-workspace production baseline, not verification of the new inventory Database candidate.",
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
