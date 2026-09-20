const REPOSITORY_URL = "https://github.com/vial1307/restaurant-management-system-demo";
const PUBLIC_HANDOFF_URL = "https://vial1307.github.io/restaurant-management-system-demo/handoff.html";

function github(path = "") {
  return `${REPOSITORY_URL}${path}`;
}

export const DEVELOPMENT_STATUS = Object.freeze({
  updated_at:"2026-09-20",
  phase:"inventory-minimum-history",
  status:"stable",
  headline:"Production #789 đã verified trên schema 024 và Live GitHub Handoff đã hoạt động. Công việc tiếp theo là ghi lịch sử thay đổi minimum_quantity mà không tạo log trùng khi giá trị không đổi.",
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
    baseline_main_sha:"19feaa88744939eba6c6b28cdcc57b290ad72029",
    baseline_main_url:github("/commit/19feaa88744939eba6c6b28cdcc57b290ad72029"),
    candidate_schema:"024",
    stopping_point:"Release #789 / 19feaa88744939eba6c6b28cdcc57b290ad72029 đã production-verified; Inventory Site Production Audit #47 PASS. Khi có PR mở, VPS tự thay current work bằng PR live mới nhất.",
    resolved_incident:null,
    code_focus:[
      "vps/backend/src/inventory-extra-routes.mjs",
      "src/inventory-cloud.js",
      "src/app.js",
      "vps/backend/scripts/catalog-stocktake-regression-client.mjs",
      "tests/inventory-minimum-history-contract-regression.mjs",
    ],
  },
  release_evidence:{
    milestone_sha:"19feaa88744939eba6c6b28cdcc57b290ad72029",
    workflow_run_id:"35495483199",
    url:github("/actions/runs/35495483199"),
    schema:"024",
    inventory_audit_run_id:"35495707381",
    inventory_audit_url:github("/actions/runs/35495707381"),
    note:"Release #789 passed static/API/concurrency/browser/full-device gates, production deploy/UI smoke; GitHub Pages #927 deployed canonical handoff; Inventory Site Production Audit #47 passed on schema 024.",
  },
  documents:[
    { label:"CURRENT_HANDOFF.md", purpose:"Trạng thái chuẩn và invariant để dev tiếp quản", url:github("/blob/main/docs/CURRENT_HANDOFF.md") },
    { label:"WORK_LOG.md", purpose:"Nhật ký sửa lỗi / CI / deploy", url:github("/blob/main/docs/WORK_LOG.md") },
    { label:"STATUS.md", purpose:"Workboard ngắn hạn / việc đang làm", url:github("/blob/main/docs/STATUS.md") },
    { label:"DEVELOPMENT_RULES.md", purpose:"Quy tắc bắt buộc trước khi code", url:github("/blob/main/docs/DEVELOPMENT_RULES.md") },
  ],
  next_steps:[
    "Hoàn tất minimum history: set-minimum phải transactional, row-locked và ghi inventory_transactions khi giá trị thực sự đổi.",
    "History UI phải hiển thị 標準量調整 / Điều chỉnh định mức tách biệt khỏi quantity stocktake.",
    "No-op minimum save không được tạo duplicate history.",
    "Giữ Inventory Site Production Audit bắt buộc sau deploy; structural violations phải luôn bằng 0.",
  ],
  security_note:"Live handoff chỉ đọc metadata công khai của repository và runtime release/schema; không trả secret, credential hoặc dữ liệu nghiệp vụ.",
});
