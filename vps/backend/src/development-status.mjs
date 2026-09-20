const REPOSITORY_URL = "https://github.com/vial1307/restaurant-management-system-demo";
const PUBLIC_HANDOFF_URL = "https://vial1307.github.io/restaurant-management-system-demo/handoff.html";

function github(path = "") {
  return `${REPOSITORY_URL}${path}`;
}

export const DEVELOPMENT_STATUS = Object.freeze({
  updated_at:"2026-09-20",
  phase:"inventory-receive-default-audit",
  status:"stable",
  headline:"Production #793 đã verified trên schema 024; minimum history đã live. Công việc tiếp theo là audit thay đổi receive-default (vị trí nhận hàng cố định) với before/after và no-op suppression.",
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
    baseline_main_sha:"ccef35dad7027808d60b3a691925fbebc29b9eb4",
    baseline_main_url:github("/commit/ccef35dad7027808d60b3a691925fbebc29b9eb4"),
    candidate_schema:"024",
    stopping_point:"Release #793 / ccef35dad7027808d60b3a691925fbebc29b9eb4 đã production-verified; Inventory Site Production Audit #51 PASS sau rerun. Khi có PR mở, VPS tự thay current work bằng PR live mới nhất.",
    resolved_incident:null,
    code_focus:[
      "vps/backend/src/inventory-extra-routes.mjs",
      "vps/backend/scripts/api-regression.mjs",
      "tests/inventory-receive-default-audit-contract-regression.mjs",
      "tests/static-regression.mjs",
    ],
  },
  release_evidence:{
    milestone_sha:"ccef35dad7027808d60b3a691925fbebc29b9eb4",
    workflow_run_id:"35496998332",
    url:github("/actions/runs/35496998332"),
    schema:"024",
    inventory_audit_run_id:"35497249172",
    inventory_audit_url:github("/actions/runs/35497249172"),
    note:"Release #793 passed static/API/concurrency/browser/full-device gates, production deploy/UI smoke; GitHub Pages #928 passed. Inventory Site Production Audit #51 initially hit a transient SSH reset, then rerun passed with all integrity counters at 0 and exact release ccef35d.",
  },
  documents:[
    { label:"CURRENT_HANDOFF.md", purpose:"Trạng thái chuẩn và invariant để dev tiếp quản", url:github("/blob/main/docs/CURRENT_HANDOFF.md") },
    { label:"WORK_LOG.md", purpose:"Nhật ký sửa lỗi / CI / deploy", url:github("/blob/main/docs/WORK_LOG.md") },
    { label:"STATUS.md", purpose:"Workboard ngắn hạn / việc đang làm", url:github("/blob/main/docs/STATUS.md") },
    { label:"DEVELOPMENT_RULES.md", purpose:"Quy tắc bắt buộc trước khi code", url:github("/blob/main/docs/DEVELOPMENT_RULES.md") },
  ],
  next_steps:[
    "Hoàn tất receive-default audit: create/update/delete phải transactional và ghi audit_logs.",
    "No-op save/delete không được cập nhật timestamp hoặc tạo audit log rác.",
    "Serialize create/update/delete cùng site + catalogKey để tránh race khi row chưa tồn tại.",
    "Giữ Inventory Site Production Audit bắt buộc sau deploy; structural violations phải luôn bằng 0.",
  ],
  security_note:"Live handoff chỉ đọc metadata công khai của repository và runtime release/schema; không trả secret, credential hoặc dữ liệu nghiệp vụ.",
});
