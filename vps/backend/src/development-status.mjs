const REPOSITORY_URL = "https://github.com/vial1307/restaurant-management-system-demo";
const PUBLIC_HANDOFF_URL = "https://vial1307.github.io/restaurant-management-system-demo/handoff.html";

function github(path = "") {
  return `${REPOSITORY_URL}${path}`;
}

export const DEVELOPMENT_STATUS = Object.freeze({
  updated_at:"2026-09-21",
  phase:"master-data-noop-audit",
  status:"stable",
  headline:"Production #800 đã verified trên schema 024; inventory catalog audit đã live. Công việc tiếp theo là loại bỏ no-op master-data writes/audit noise cho location và work-area.",
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
    baseline_main_sha:"35ec19d3c89f43313a6d6895db446a6c7d5a5ea9",
    baseline_main_url:github("/commit/35ec19d3c89f43313a6d6895db446a6c7d5a5ea9"),
    candidate_schema:"024",
    stopping_point:"Release #800 / 35ec19d3c89f43313a6d6895db446a6c7d5a5ea9 đã production-verified; Inventory Site Production Audit #59 PASS. Khi có PR mở, VPS tự thay current work bằng PR live mới nhất.",
    resolved_incident:null,
    code_focus:[
      "vps/backend/src/master-data-routes.mjs",
      "vps/backend/scripts/master-data-regression-client.mjs",
      "tests/master-data-noop-audit-contract-regression.mjs",
      "tests/static-regression.mjs",
    ],
  },
  release_evidence:{
    milestone_sha:"35ec19d3c89f43313a6d6895db446a6c7d5a5ea9",
    workflow_run_id:"35525341848",
    url:github("/actions/runs/35525341848"),
    schema:"024",
    inventory_audit_run_id:"35525613008",
    inventory_audit_url:github("/actions/runs/35525613008"),
    note:"Release #800 passed static/API/concurrency/browser/full-device gates, production deploy/UI smoke; GitHub Pages #930 passed. Inventory Site Production Audit #59 passed with all integrity counters at 0 and exact release 35ec19d.",
  },
  documents:[
    { label:"CURRENT_HANDOFF.md", purpose:"Trạng thái chuẩn và invariant để dev tiếp quản", url:github("/blob/main/docs/CURRENT_HANDOFF.md") },
    { label:"WORK_LOG.md", purpose:"Nhật ký sửa lỗi / CI / deploy", url:github("/blob/main/docs/WORK_LOG.md") },
    { label:"STATUS.md", purpose:"Workboard ngắn hạn / việc đang làm", url:github("/blob/main/docs/STATUS.md") },
    { label:"DEVELOPMENT_RULES.md", purpose:"Quy tắc bắt buộc trước khi code", url:github("/blob/main/docs/DEVELOPMENT_RULES.md") },
  ],
  next_steps:[
    "Location/work-area save không thay đổi dữ liệu phải bỏ qua UPDATE và audit.",
    "Archive lặp lại trên row đã inactive không được churn updated_at hoặc tạo duplicate audit.",
    "Giữ create/update/archive audit đầy đủ khi có thay đổi thật.",
    "Giữ Inventory Site Production Audit bắt buộc sau deploy; structural violations phải luôn bằng 0.",
  ],
  security_note:"Live handoff chỉ đọc metadata công khai của repository và runtime release/schema; không trả secret, credential hoặc dữ liệu nghiệp vụ.",
});
