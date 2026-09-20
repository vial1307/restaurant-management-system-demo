const REPOSITORY_URL = "https://github.com/vial1307/restaurant-management-system-demo";
const PUBLIC_HANDOFF_URL = "https://vial1307.github.io/restaurant-management-system-demo/handoff.html";

function github(path = "") {
  return `${REPOSITORY_URL}${path}`;
}

export const DEVELOPMENT_STATUS = Object.freeze({
  updated_at:"2026-09-21",
  phase:"inventory-db-editor-load-optimization",
  status:"stable",
  headline:"Production #796 đã verified trên schema 024. Candidate schema 025 đưa đơn vị kho vào PostgreSQL và gom form chỉnh nguyên liệu từ nhiều request thành một transaction để giảm đứng/loading UI.",
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
    branch:"main",
    url:github("/tree/main"),
    pull_request:null,
    baseline_main_sha:"21d376295b6194e48bfaa599fc6c5424256a6196",
    baseline_main_url:github("/commit/21d376295b6194e48bfaa599fc6c5424256a6196"),
    candidate_schema:"025",
    stopping_point:"Release #796 / 21d376295b6194e48bfaa599fc6c5424256a6196 đã production-verified trên schema 024; Inventory Site Production Audit #54 PASS. Candidate hiện tại là schema 025 + DB-backed units + bulk inventory editor save.",
    resolved_incident:null,
    code_focus:[
      "vps/database/migrations/025_inventory_units_and_editor_master_data.sql",
      "vps/backend/src/inventory-extra-routes.mjs",
      "vps/backend/src/master-data-routes.mjs",
      "src/inventory-master-data.js",
      "src/vps-api.js",
      "src/inventory-cloud.js",
      "src/app.js",
      "vps/backend/scripts/inventory-editor-bulk-regression-client.mjs",
    ],
  },
  release_evidence:{
    milestone_sha:"21d376295b6194e48bfaa599fc6c5424256a6196",
    workflow_run_id:"35500763361",
    url:github("/actions/runs/35500763361"),
    schema:"024",
    inventory_audit_run_id:"35500993290",
    inventory_audit_url:github("/actions/runs/35500993290"),
    note:"Release #796 passed full release gates and production UI smoke on schema 024. Inventory Site Production Audit #54 passed with all structural counters at 0 and exact release 21d3762.",
  },
  documents:[
    { label:"CURRENT_HANDOFF.md", purpose:"Trạng thái chuẩn và invariant để dev tiếp quản", url:github("/blob/main/docs/CURRENT_HANDOFF.md") },
    { label:"WORK_LOG.md", purpose:"Nhật ký sửa lỗi / CI / deploy", url:github("/blob/main/docs/WORK_LOG.md") },
    { label:"STATUS.md", purpose:"Workboard ngắn hạn / việc đang làm", url:github("/blob/main/docs/STATUS.md") },
    { label:"DEVELOPMENT_RULES.md", purpose:"Quy tắc bắt buộc trước khi code", url:github("/blob/main/docs/DEVELOPMENT_RULES.md") },
  ],
  next_steps:[
    "Hoàn tất schema 025 inventory_units và FK inventory_items.unit.",
    "Chứng nhận bulk inventory editor: một POST transaction cho metadata/stock/minimum/work minimum/receive-default.",
    "Giữ modal mở và hiển thị saving; chỉ refresh authoritative snapshot một lần sau commit.",
    "Loại hard-code đơn vị và large-freezer default khỏi ingredient modal.",
    "Giữ Inventory Site Production Audit bắt buộc sau deploy; structural violations phải luôn bằng 0.",
  ],
  security_note:"Live handoff chỉ đọc metadata công khai của repository và runtime release/schema; không trả secret, credential hoặc dữ liệu nghiệp vụ.",
});
