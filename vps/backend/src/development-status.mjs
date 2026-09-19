const REPOSITORY_URL = "https://github.com/vial1307/restaurant-management-system-demo";

function github(path = "") {
  return `${REPOSITORY_URL}${path}`;
}

export const DEVELOPMENT_STATUS = Object.freeze({
  updated_at:"2026-09-19",
  phase:"inventory-hardening",
  status:"verifying",
  headline:"Đang harden Inventory: cách ly tuyệt đối central/Fuxing/Yongji, fix chuyển vị trí nội bộ và site-switch cache; candidate schema 022 đang qua PR #115 gates.",
  repository:{
    name:"vial1307/restaurant-management-system-demo",
    url:REPOSITORY_URL,
    actions_url:github("/actions"),
    pulls_url:github("/pulls"),
  },
  current_work:{
    branch:"fix/inventory-site-isolation-relocation-20260919",
    url:github("/tree/fix/inventory-site-isolation-relocation-20260919"),
    pull_request:{
      number:115,
      url:github("/pull/115"),
    },
    baseline_main_sha:null,
    baseline_main_url:github("/commits/main"),
    candidate_schema:"022",
    stopping_point:"PR #115 đang verify schema 022 + DB/API/UI inventory site isolation. Sau khi CI xanh: audit production cross-site contamination, merge, exact-SHA deploy, verify relocation + branch switching trên production.",
    resolved_incident:{
      workflow:"Inventory site isolation hardening",
      failed_run_id:null,
      failed_url:null,
      resolution:"Đã xác định shared branch UI record/offline draft có thể làm Fuxing/Yongji hiển thị lẫn context; API set-quantity/set-minimum/direct-transfer cũng thiếu một số item-site guards. Candidate fix khóa cả DB, API và UI.",
    },
    code_focus:[
      "vps/database/migrations/022_inventory_site_isolation.sql",
      "vps/backend/src/inventory-extra-routes.mjs",
      "src/inventory-cloud.js",
      "src/app.js",
      "vps/backend/scripts/inventory-site-isolation-regression.mjs",
      "vps/backend/scripts/inventory-storage-relocation-regression-client.mjs",
      "tests/inventory-site-switch-isolation-regression.mjs",
      ".github/workflows/inventory-site-production-audit.yml",
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
    "Chờ toàn bộ PR #115 gates: PostgreSQL 16 schema, API inventory, site-switch runtime, browser/full-device.",
    "Nếu schema 022 phát hiện cross-site rows có quantity/minimum > 0, dừng deploy và điều tra từng row; không tự xóa dữ liệu.",
    "Đọc Inventory Site Production Audit để xác nhận production có 0 stock/default/item-site violations.",
    "Verify relocation 大冷凍 → 大冷藏 / 四門冰箱 / 廚房冰箱 và receive-default move.",
    "Merge/deploy exact SHA chỉ sau khi mọi gate xanh; production UI smoke phải PASS.",
    "Sau inventory isolation mới quay lại normalized-domain/workforce schedule cutover.",
  ],
  security_note:"Endpoint chỉ trả metadata handoff đã lọc; không trả dữ liệu bí mật hoặc quyền truy cập hạ tầng.",
});
