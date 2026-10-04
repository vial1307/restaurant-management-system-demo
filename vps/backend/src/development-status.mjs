const REPOSITORY_URL = "https://github.com/vial1307/restaurant-management-system-demo";
const PUBLIC_HANDOFF_URL = "https://vial1307.github.io/restaurant-management-system-demo/handoff.html";

function github(path = "") {
  return `${REPOSITORY_URL}${path}`;
}

export const DEVELOPMENT_STATUS = Object.freeze({
  updated_at:"2026-10-04",
  phase:"inventory-database-performance",
  status:"in_progress",
  headline:"PR #188 đang tối ưu Inventory Database load và nâng GitHub/Super Admin workflow authority trên schema 031.",
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
    branch:"perf/inventory-database-load-20261003",
    url:github("/tree/perf/inventory-database-load-20261003"),
    pull_request:github("/pull/188"),
    baseline_main_sha:"0bbafde21becb1de4bad4cedf62b893ad06f4a40",
    baseline_main_url:github("/commit/0bbafde21becb1de4bad4cedf62b893ad06f4a40"),
    candidate_schema:"031",
    stopping_point:"Exact-head PR #188 phải qua toàn bộ performance/API/browser/full-device gates trước merge; sau đó verify production deploy, runtime release/schema, DATA_INTEGRITY_OK và Inventory Site Production Audit.",
    resolved_incident:null,
    code_focus:[
      "src/admin-inventory-database.js",
      "src/inventory-cloud.js",
      "vps/backend/src/inventory-read-model.mjs",
      "vps/backend/src/github-handoff.mjs",
      "src/admin-panel.js",
    ],
  },
  release_evidence:{
    milestone_sha:"850d99e1a651bed80586a3a6d1371896f0a12074",
    workflow_run_id:"36981362445",
    url:github("/actions/runs/36981362445"),
    schema:"031",
    inventory_audit_run_id:"36986539367",
    inventory_audit_url:github("/actions/runs/36986539367"),
    note:"Deploy #1080 verified release 850d99e on schema 031; Inventory Site Production Audit #371 passed on the same release. Live GitHub/runtime fields supersede this fallback when available.",
  },
  documents:[
    { label:"CURRENT_HANDOFF.md", purpose:"Trạng thái chuẩn và invariant để dev tiếp quản", url:github("/blob/main/docs/CURRENT_HANDOFF.md") },
    { label:"WORK_LOG.md", purpose:"Nhật ký sửa lỗi / CI / deploy", url:github("/blob/main/docs/WORK_LOG.md") },
    { label:"STATUS.md", purpose:"Workboard ngắn hạn / việc đang làm", url:github("/blob/main/docs/STATUS.md") },
    { label:"DEVELOPMENT_RULES.md", purpose:"Quy tắc bắt buộc trước khi code", url:github("/blob/main/docs/DEVELOPMENT_RULES.md") },
  ],
  next_steps:[
    "Chỉ merge PR #188 khi exact-head performance/API/Super Admin/full-device gates đều xanh.",
    "Sau merge, xác minh production release/schema, DATA_INTEGRITY_OK, UI smoke và Inventory Site Production Audit.",
    "Dùng Super Admin → GitHub & Handoff để đọc active PR, exact-head CI và production workflow evidence; không suy đoán từ PR mới nhất.",
    "Giữ nguyên schema 031 và PostgreSQL authority; dữ liệu tồn kho phải cập nhật qua Inventory lifecycle, không hard-code vào source/migration.",
  ],
  security_note:"Live handoff chỉ đọc metadata công khai của repository và runtime release/schema; không trả secret, credential hoặc dữ liệu nghiệp vụ.",
});
