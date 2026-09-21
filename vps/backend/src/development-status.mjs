const REPOSITORY_URL = "https://github.com/vial1307/restaurant-management-system-demo";
const PUBLIC_HANDOFF_URL = "https://vial1307.github.io/restaurant-management-system-demo/handoff.html";

function github(path = "") {
  return `${REPOSITORY_URL}${path}`;
}

export const DEVELOPMENT_STATUS = Object.freeze({
  updated_at:"2026-09-21",
  phase:"normalized-domain-cutover",
  status:"stable",
  headline:"Production #815 đã verified trên schema 024; inventory overview/editor persistence và realtime SSE đã live. Bước tiếp theo là tiếp tục cutover dữ liệu chuẩn hóa theo từng domain.",
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
    baseline_main_sha:"09e2fffc80bf186d15054002c00421a2a5525e8f",
    baseline_main_url:github("/commit/09e2fffc80bf186d15054002c00421a2a5525e8f"),
    candidate_schema:"024",
    stopping_point:"Release #815 / 09e2fffc80bf186d15054002c00421a2a5525e8f đã production-verified. Inventory overview/editor ghi PostgreSQL và hội tụ realtime cho Central/Fuxing/Yongji; deploy-integrated inventory/data-integrity audit PASS.",
    resolved_incident:null,
    code_focus:[
      ".github/workflows/workforce-schedule-production-backfill.yml",
      ".github/workflows/workforce-staff-production-backfill.yml",
      ".github/workflows/workforce-attendance-production-backfill.yml",
      "tests/workforce-schedule-production-workflow-regression.mjs",
    ],
  },
  release_evidence:{
    milestone_sha:"09e2fffc80bf186d15054002c00421a2a5525e8f",
    workflow_run_id:"35549929164",
    url:github("/actions/runs/35549929164"),
    schema:"024",
    inventory_audit_run_id:"35549929164",
    inventory_audit_url:github("/actions/runs/35549929164"),
    note:"Release #815 passed preflight, API/PostgreSQL concurrency, desktop/mobile Chromium, full-device cross-browser, exact-SHA deploy, health/release and production UI smoke. Deploy-integrated inventory site/data-integrity audit passed; exact release 09e2fff, GitHub Pages #933 passed.",
  },
  documents:[
    { label:"CURRENT_HANDOFF.md", purpose:"Trạng thái chuẩn và invariant để dev tiếp quản", url:github("/blob/main/docs/CURRENT_HANDOFF.md") },
    { label:"WORK_LOG.md", purpose:"Nhật ký sửa lỗi / CI / deploy", url:github("/blob/main/docs/WORK_LOG.md") },
    { label:"STATUS.md", purpose:"Workboard ngắn hạn / việc đang làm", url:github("/blob/main/docs/STATUS.md") },
    { label:"DEVELOPMENT_RULES.md", purpose:"Quy tắc bắt buộc trước khi code", url:github("/blob/main/docs/DEVELOPMENT_RULES.md") },
  ],
  next_steps:[
    "Tách các hàng đợi verify-only staff/schedule/attendance để Schedule Backfill không bị hủy trước khi chạy.",
    "Yêu cầu Schedule Parity và Schedule Backfill verify cùng PASS trên một release production trước khi cutover.",
    "Chỉ bật relational schedule read trong một thay đổi review riêng; giữ flag rollback về compatibility JSON.",
    "Tiếp tục compatibility schedule writes và module revision concurrency trong giai đoạn quan sát.",
    "Sau khi read cutover ổn định mới chọn domain chuẩn hóa tiếp theo; không retire compatibility data trong cùng bước.",
  ],
  security_note:"Live handoff chỉ đọc metadata công khai của repository và runtime release/schema; không trả secret, credential hoặc dữ liệu nghiệp vụ.",
});
