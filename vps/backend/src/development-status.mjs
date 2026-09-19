const REPOSITORY_URL = "https://github.com/vial1307/restaurant-management-system-demo";

function github(path = "") {
  return `${REPOSITORY_URL}${path}`;
}

export const DEVELOPMENT_STATUS = Object.freeze({
  updated_at:"2026-09-20",
  phase:"inventory-catalog-stock-authority-hardening",
  status:"stable",
  headline:"Schema 024 đã production-verified và inventory structural audit = 0; công việc hiện tại tách catalog metadata khỏi physical stock authority để tránh ghi đè quantity/minimum từ browser snapshot.",
  repository:{
    name:"vial1307/restaurant-management-system-demo",
    url:REPOSITORY_URL,
    actions_url:github("/actions"),
    pulls_url:github("/pulls"),
  },
  current_work:{
    branch:"fix/inventory-catalog-sync-stock-authority-20260920",
    url:github("/tree/fix/inventory-catalog-sync-stock-authority-20260920"),
    pull_request:null,
    baseline_main_sha:"d3d5f4e73d4c5fd6f2f4f3971066f4d7e31497d2",
    baseline_main_url:github("/commits/main"),
    candidate_schema:"024",
    stopping_point:"Release #776 / d3d5f4e73d4c5fd6f2f4f3971066f4d7e31497d2 đã production-verified trên schema 024. Audit #33 xác nhận hidden/cross-site/location/default violations = 0. Candidate hiện tại loại bỏ quantity/minimum writes khỏi catalog/sync và đưa modal stock fields qua API stocktake chuyên dụng.",
    resolved_incident:{
      workflow:"Inventory hidden-stock archive integrity",
      failed_run_id:null,
      failed_url:null,
      resolution:"Audit production phát hiện 4 stock rows của 2 item Fuxing đã bị archive nhưng vẫn còn quantity/minimum. Schema 023 reactivated các item này mà không thay đổi tồn kho; Audit #31 xác nhận hidden inventory và cross-site violations đều bằng 0.",
    },
    code_focus:[
      "src/inventory-cloud.js",
      "src/app.js",
      "vps/backend/src/inventory-extra-routes.mjs",
      "vps/backend/scripts/catalog-stocktake-regression-client.mjs",
      "tests/catalog-stocktake-boundary-regression.mjs",
    ],
  },
  release_evidence:{
    milestone_sha:"d3d5f4e73d4c5fd6f2f4f3971066f4d7e31497d2",
    workflow_run_id:"35459291983",
    url:github("/actions/runs/35459291983"),
    schema:"024",
    note:"Release #776 passed schema/API/concurrency/browser/full-device gates, server-side backup, migration 024, DATA_INTEGRITY_OK, exact release verification, production UI smoke and post-deploy Inventory Site Production Audit #33 with hidden/cross-site/location/default violations = 0.",
  },
  documents:[
    { label:"CURRENT_HANDOFF.md", purpose:"Trạng thái chuẩn để dev tiếp quản", url:github("/blob/main/docs/CURRENT_HANDOFF.md") },
    { label:"WORK_LOG.md", purpose:"Nhật ký sửa lỗi / CI / deploy", url:github("/blob/main/docs/WORK_LOG.md") },
    { label:"STATUS.md", purpose:"Workboard ngắn hạn / việc đang làm", url:github("/blob/main/docs/STATUS.md") },
    { label:"DEVELOPMENT_RULES.md", purpose:"Quy tắc bắt buộc trước khi code", url:github("/blob/main/docs/DEVELOPMENT_RULES.md") },
  ],
  next_steps:[
    "Hoàn tất catalog stock-authority fix: catalog/sync chỉ metadata/location association, không ghi quantity/minimum.",
    "Product modal quantity/minimum phải đi qua set-quantity/set-minimum; quantity changes giữ inventory_transactions.",
    "Bỏ location association chỉ khi quantity=0 và minimum=0; protected rows phải trả 409.",
    "Giữ Inventory Site Production Audit bắt buộc sau deploy; structural violations phải luôn bằng 0.",
    "Sau khi kho sạch toàn bộ write paths, quay lại schedule relational-read certification ở workstream riêng.",
  ],
  security_note:"Endpoint chỉ trả metadata handoff đã lọc; không trả dữ liệu bí mật hoặc quyền truy cập hạ tầng.",
});
