const REPOSITORY_URL = "https://github.com/vial1307/restaurant-management-system-demo";
const PUBLIC_HANDOFF_URL = "https://vial1307.github.io/restaurant-management-system-demo/handoff.html";

function github(path = "") {
  return `${REPOSITORY_URL}${path}`;
}

export const DEVELOPMENT_STATUS = Object.freeze({
  updated_at:"2026-09-20",
  phase:"live-github-handoff",
  status:"stable",
  headline:"Production #786 đã verified trên schema 024. GitHub & Handoff đang chuyển sang live feed để VPS tự nhận biết PR/branch/CI hiện tại thay vì phụ thuộc chuỗi hard-code.",
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
    baseline_main_sha:"60684bb3bb38d5f6af3a4c25f8991fc2ecc1c17c",
    baseline_main_url:github("/commit/60684bb3bb38d5f6af3a4c25f8991fc2ecc1c17c"),
    candidate_schema:"024",
    stopping_point:"Release #786 / 60684bb3bb38d5f6af3a4c25f8991fc2ecc1c17c đã production-verified; Inventory Site Production Audit #44 PASS. Khi có PR mở, VPS sẽ tự thay phần current work bằng PR live mới nhất.",
    resolved_incident:null,
    code_focus:[
      "vps/backend/src/github-handoff.mjs",
      "vps/backend/src/super-admin-routes.mjs",
      "src/admin-panel.js",
      "handoff.html",
    ],
  },
  release_evidence:{
    milestone_sha:"60684bb3bb38d5f6af3a4c25f8991fc2ecc1c17c",
    workflow_run_id:"35482680596",
    url:github("/actions/runs/35482680596"),
    schema:"024",
    inventory_audit_run_id:"35482912054",
    inventory_audit_url:github("/actions/runs/35482912054"),
    note:"Release #786 passed static/API/concurrency/browser/full-device gates, production deploy/UI smoke; Inventory Site Production Audit #44 passed on schema 024.",
  },
  documents:[
    { label:"CURRENT_HANDOFF.md", purpose:"Trạng thái chuẩn và invariant để dev tiếp quản", url:github("/blob/main/docs/CURRENT_HANDOFF.md") },
    { label:"WORK_LOG.md", purpose:"Nhật ký sửa lỗi / CI / deploy", url:github("/blob/main/docs/WORK_LOG.md") },
    { label:"STATUS.md", purpose:"Workboard ngắn hạn / việc đang làm", url:github("/blob/main/docs/STATUS.md") },
    { label:"DEVELOPMENT_RULES.md", purpose:"Quy tắc bắt buộc trước khi code", url:github("/blob/main/docs/DEVELOPMENT_RULES.md") },
  ],
  next_steps:[
    "Hoàn tất Live GitHub Handoff: VPS tự đọc PR mở mới nhất, branch/head SHA, commits, changed files và CI.",
    "Dùng public handoff.html làm canonical one-link entry cho dev/chat mới.",
    "Sau khi live handoff production-verified, tiếp tục inventory minimum-change history/audit semantics.",
    "Giữ Inventory Site Production Audit bắt buộc sau deploy; structural violations phải luôn bằng 0.",
  ],
  security_note:"Live handoff chỉ đọc metadata công khai của repository và runtime release/schema; không trả secret, credential hoặc dữ liệu nghiệp vụ.",
});
