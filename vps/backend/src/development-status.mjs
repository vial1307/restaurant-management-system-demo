const REPOSITORY_URL = "https://github.com/vial1307/restaurant-management-system-demo";

function github(path = "") {
  return `${REPOSITORY_URL}${path}`;
}

export const DEVELOPMENT_STATUS = Object.freeze({
  updated_at:"2026-09-19",
  phase:"released",
  status:"stable",
  headline:"Schema 021, secure Super Admin data editing, VPS metrics và GitHub/Handoff đã được release; hệ thống sẵn sàng cho hạng mục database/domain tiếp theo.",
  repository:{
    name:"vial1307/restaurant-management-system-demo",
    url:REPOSITORY_URL,
    actions_url:github("/actions"),
    pulls_url:github("/pulls"),
  },
  current_work:{
    branch:"main",
    url:github("/tree/main"),
    pull_request:null,
    baseline_main_sha:null,
    baseline_main_url:github("/commits/main"),
    candidate_schema:null,
    stopping_point:"Release recovery đã hoàn tất. Điểm tiếp tục tiếp theo: normalized-domain/database redesign theo từng business domain, giữ Browser/UI -> VPS API -> PostgreSQL là authority duy nhất.",
    resolved_incident:{
      workflow:"Deploy Kitchen OS to VPS",
      failed_run_id:"35372160924",
      failed_url:github("/actions/runs/35372160924"),
      resolution:"Host metrics collector có option GNU df không tương thích; đã sửa collector, thêm diagnostics và executable CI smoke trước deploy.",
    },
    code_focus:[
      "docs/CURRENT_HANDOFF.md",
      "docs/STATUS.md",
      "docs/DATABASE_CORE_V2.md",
      "docs/DATABASE_PERSISTENCE_AUDIT.md",
      "vps/backend/src/super-admin-routes.mjs",
      "vps/database/migrations/",
    ],
  },
  release_evidence:{
    milestone_sha:"3a3392133483c6575a63d61a04d085a2d50df692",
    workflow_run_id:"35377327661",
    url:github("/actions/runs/35377327661"),
    schema:"021",
    note:"Milestone release #724 passed exact-SHA deploy, schema/revision integrity checks and production UI smoke. Live release/schema below are read from the currently serving runtime.",
  },
  documents:[
    { label:"CURRENT_HANDOFF.md", purpose:"Trạng thái chuẩn để dev tiếp quản", url:github("/blob/main/docs/CURRENT_HANDOFF.md") },
    { label:"WORK_LOG.md", purpose:"Nhật ký sửa lỗi / CI / deploy", url:github("/blob/main/docs/WORK_LOG.md") },
    { label:"STATUS.md", purpose:"Workboard ngắn hạn / việc đang làm", url:github("/blob/main/docs/STATUS.md") },
    { label:"DEVELOPMENT_RULES.md", purpose:"Quy tắc bắt buộc trước khi code", url:github("/blob/main/docs/DEVELOPMENT_RULES.md") },
  ],
  next_steps:[
    "Đọc CURRENT_HANDOFF + STATUS + DATABASE_CORE_V2 + DATABASE_PERSISTENCE_AUDIT trước khi đổi schema.",
    "Tiếp tục normalized-domain cutover từng domain; không tạo authority ghi thứ hai song song business_state/modules.",
    "Dùng domain-specific transactional APIs cho inventory/workforce/payroll/SOP nếu generic CRUD có thể phá invariant.",
    "Bổ sung restore-verification/off-site encrypted backup khi mở rộng backup workflow.",
    "Chỉ cấu hình provider bandwidth quota khi có số liệu thật từ nhà cung cấp VPS; không suy đoán từ host counters.",
  ],
  security_note:"Endpoint chỉ trả metadata handoff đã lọc; không trả dữ liệu bí mật hoặc quyền truy cập hạ tầng.",
});
