const REPOSITORY_URL = "https://github.com/vial1307/restaurant-management-system-demo";

function github(path = "") {
  return `${REPOSITORY_URL}${path}`;
}

export const DEVELOPMENT_STATUS = Object.freeze({
  updated_at:"2026-09-20",
  phase:"super-admin-inventory-lifecycle-hardening",
  status:"stable",
  headline:"Release #783 đã production-verified trên schema 024; catalog sync không còn là stock authority. Công việc hiện tại khóa inventory lifecycle khỏi generic Super Admin CRUD để tránh tạo/reactivate/archive item ngoài luồng Inventory.",
  repository:{
    name:"vial1307/restaurant-management-system-demo",
    url:REPOSITORY_URL,
    actions_url:github("/actions"),
    pulls_url:github("/pulls"),
  },
  current_work:{
    branch:"fix/super-admin-inventory-lifecycle-20260920",
    url:github("/tree/fix/super-admin-inventory-lifecycle-20260920"),
    pull_request:null,
    baseline_main_sha:"5bc9d92e878510c0646acced2b8070750778529c",
    baseline_main_url:github("/commits/main"),
    candidate_schema:"024",
    stopping_point:"Release #783 / 5bc9d92e878510c0646acced2b8070750778529c đã production-verified trên schema 024. Audit #40 xác nhận structural violations = 0. Candidate hiện tại biến Super Admin inventory-products thành metadata-only dataset; lifecycle phải đi qua Inventory module.",
    resolved_incident:{
      workflow:"Inventory hidden-stock archive integrity",
      failed_run_id:null,
      failed_url:null,
      resolution:"Audit production phát hiện 4 stock rows của 2 item Fuxing đã bị archive nhưng vẫn còn quantity/minimum. Schema 023 reactivated các item này mà không thay đổi tồn kho; Audit #31 xác nhận hidden inventory và cross-site violations đều bằng 0.",
    },
    code_focus:[
      "vps/backend/src/super-admin-routes.mjs",
      "src/admin-panel.js",
      "vps/backend/scripts/super-admin-regression-client.mjs",
      "tests/super-admin-inventory-lifecycle-contract-regression.mjs",
    ],
  },
  release_evidence:{
    milestone_sha:"5bc9d92e878510c0646acced2b8070750778529c",
    workflow_run_id:"35475816625",
    url:github("/actions/runs/35475816625"),
    schema:"024",
    note:"Release #783 passed static/API/concurrency/browser/full-device gates, server-side backup, DATA_INTEGRITY_OK, exact release verification, production UI smoke and Inventory Site Production Audit #40 with all structural violations = 0. Schema remains 024.",
  },
  documents:[
    { label:"CURRENT_HANDOFF.md", purpose:"Trạng thái chuẩn để dev tiếp quản", url:github("/blob/main/docs/CURRENT_HANDOFF.md") },
    { label:"WORK_LOG.md", purpose:"Nhật ký sửa lỗi / CI / deploy", url:github("/blob/main/docs/WORK_LOG.md") },
    { label:"STATUS.md", purpose:"Workboard ngắn hạn / việc đang làm", url:github("/blob/main/docs/STATUS.md") },
    { label:"DEVELOPMENT_RULES.md", purpose:"Quy tắc bắt buộc trước khi code", url:github("/blob/main/docs/DEVELOPMENT_RULES.md") },
  ],
  next_steps:[
    "Hoàn tất Super Admin inventory lifecycle hardening: generic CRUD chỉ sửa metadata item hiện hữu.",
    "Ẩn create/archive/active controls cho inventory-products và chặn tương ứng ở backend.",
    "Giữ Inventory module là authority duy nhất cho create/reactivate/archive item để stock/location/default/audit nhất quán.",
    "Giữ Inventory Site Production Audit bắt buộc sau deploy; structural violations phải luôn bằng 0.",
    "Sau slice này, rà minimum-change audit/history và các mutation còn lại trước khi đóng workstream kho.",
  ],
  security_note:"Endpoint chỉ trả metadata handoff đã lọc; không trả dữ liệu bí mật hoặc quyền truy cập hạ tầng.",
});
