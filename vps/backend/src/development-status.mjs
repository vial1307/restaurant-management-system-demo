const REPOSITORY_URL = "https://github.com/vial1307/restaurant-management-system-demo";

function github(path = "") {
  return `${REPOSITORY_URL}${path}`;
}

export const DEVELOPMENT_STATUS = Object.freeze({
  updated_at:"2026-09-20",
  phase:"inventory-location-integrity-hardening",
  status:"stable",
  headline:"Schema 023 đã production-verified: hidden stock dưới item inactive đã được phục hồi an toàn; candidate schema 024 đang harden archive vị trí kho để quantity/minimum/receive-default không thể bị ẩn.",
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
    candidate_schema:"024",
    stopping_point:"Release #774 / 267235bf9d406f84f982d05df10a46a30f937201 đã production-verified trên schema 023. Audit #31 xác nhận hidden inventory = 0; công việc hiện tại là schema 024 harden archive location khi còn minimum/receive-default.",
    resolved_incident:{
      workflow:"Inventory hidden-stock archive integrity",
      failed_run_id:null,
      failed_url:null,
      resolution:"Audit production phát hiện 4 stock rows của 2 item Fuxing đã bị archive nhưng vẫn còn quantity/minimum. Schema 023 reactivated các item này mà không thay đổi tồn kho; Audit #31 xác nhận hidden inventory và cross-site violations đều bằng 0.",
    },
    code_focus:[
      "src/auth-layer.js",
      "src/auth-layer.css",
      "src/inventory-cloud.js",
      "src/app.js",
      "vps/database/migrations/023_inventory_archive_integrity.sql",
      "vps/database/migrations/024_inventory_location_archive_integrity.sql",
      "vps/backend/src/inventory-extra-routes.mjs",
      "vps/backend/src/master-data-routes.mjs",
      ".github/workflows/inventory-site-production-audit.yml",
      "tests/inventory-location-archive-integrity-contract-regression.mjs",
    ],
  },
  release_evidence:{
    milestone_sha:"267235bf9d406f84f982d05df10a46a30f937201",
    workflow_run_id:"35458513691",
    url:github("/actions/runs/35458513691"),
    schema:"023",
    note:"Release #774 passed schema/API/concurrency/browser/full-device gates, server-side backup, migration 023, DATA_INTEGRITY_OK, exact release verification, production UI smoke and post-deploy Inventory Site Production Audit #31 with hidden inventory = 0.",
  },
  documents:[
    { label:"CURRENT_HANDOFF.md", purpose:"Trạng thái chuẩn để dev tiếp quản", url:github("/blob/main/docs/CURRENT_HANDOFF.md") },
    { label:"WORK_LOG.md", purpose:"Nhật ký sửa lỗi / CI / deploy", url:github("/blob/main/docs/WORK_LOG.md") },
    { label:"STATUS.md", purpose:"Workboard ngắn hạn / việc đang làm", url:github("/blob/main/docs/STATUS.md") },
    { label:"DEVELOPMENT_RULES.md", purpose:"Quy tắc bắt buộc trước khi code", url:github("/blob/main/docs/DEVELOPMENT_RULES.md") },
  ],
  next_steps:[
    "Hoàn tất schema 024 location archive integrity: minimum/receive-default phải được bảo vệ ở API và PostgreSQL.",
    "Giữ Inventory Site Production Audit bắt buộc sau deploy; hidden stock/location/default và cross-site violations phải luôn bằng 0.",
    "Sau location integrity, audit catalog/sync để mọi quantity mutation đều có inventory_transactions tương ứng.",
    "Mọi thay đổi vị trí lưu phải dùng relocation/transfer transaction, không dùng catalog metadata để mô phỏng di chuyển tồn kho.",
    "Sau khi kho sạch toàn bộ write paths, quay lại schedule relational-read certification ở workstream riêng.",
  ],
  security_note:"Endpoint chỉ trả metadata handoff đã lọc; không trả dữ liệu bí mật hoặc quyền truy cập hạ tầng.",
});
