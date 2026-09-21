const REPOSITORY_URL = "https://github.com/vial1307/restaurant-management-system-demo";
const PUBLIC_HANDOFF_URL = "https://vial1307.github.io/restaurant-management-system-demo/handoff.html";

function github(path = "") {
  return `${REPOSITORY_URL}${path}`;
}

export const DEVELOPMENT_STATUS = Object.freeze({
  updated_at:"2026-09-21",
  phase:"normalized-domain-cutover",
  status:"stable",
  headline:"Production #823 đã verified trên schema 024; schedule parity và backfill cùng PASS trên release 30fd1dd. Candidate hiện tại bật relational schedule read nhưng vẫn giữ compatibility writes và rollback flag.",
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
    branch:"feat/workforce-schedule-relational-read-production-20260921",
    url:github("/tree/feat/workforce-schedule-relational-read-production-20260921"),
    pull_request:null,
    baseline_main_sha:"30fd1ddff89cd821b5a66fe54ececca9f9e9825f",
    baseline_main_url:github("/commit/30fd1ddff89cd821b5a66fe54ececca9f9e9825f"),
    candidate_schema:"024",
    stopping_point:"Release #823 / 30fd1ddff89cd821b5a66fe54ececca9f9e9825f đã production-verified. Schedule Parity #105 và Schedule Backfill verify #316 cùng PASS trên đúng release; điều kiện bật relational schedule read đã đủ.",
    resolved_incident:null,
    code_focus:[
      "vps/docker-compose.yml",
      ".github/workflows/deploy-vps.yml",
      "tests/workforce-schedule-read-authority-contract-regression.mjs",
      "vps/backend/src/workforce-schedule-read-authority.mjs",
    ],
  },
  release_evidence:{
    milestone_sha:"30fd1ddff89cd821b5a66fe54ececca9f9e9825f",
    workflow_run_id:"35571481421",
    url:github("/actions/runs/35571481421"),
    schema:"024",
    inventory_audit_run_id:"35571481421",
    inventory_audit_url:github("/actions/runs/35571481421"),
    note:"Release #823 passed preflight, API/PostgreSQL concurrency, desktop/mobile Chromium, full-device cross-browser, exact-SHA deploy, health/release and production UI smoke. Schedule Parity #105 and Schedule Backfill verify #316 both passed against exact release 30fd1dd.",
  },
  documents:[
    { label:"CURRENT_HANDOFF.md", purpose:"Trạng thái chuẩn và invariant để dev tiếp quản", url:github("/blob/main/docs/CURRENT_HANDOFF.md") },
    { label:"WORK_LOG.md", purpose:"Nhật ký sửa lỗi / CI / deploy", url:github("/blob/main/docs/WORK_LOG.md") },
    { label:"STATUS.md", purpose:"Workboard ngắn hạn / việc đang làm", url:github("/blob/main/docs/STATUS.md") },
    { label:"DEVELOPMENT_RULES.md", purpose:"Quy tắc bắt buộc trước khi code", url:github("/blob/main/docs/DEVELOPMENT_RULES.md") },
  ],
  next_steps:[
    "Chạy exact-head CI với toàn bộ API/browser/PostgreSQL regression dưới relational schedule read.",
    "Deploy đúng SHA đã kiểm thử và xác minh release/schema/UI smoke production.",
    "Chạy lại Schedule Parity và Schedule Backfill verify trên release cutover.",
    "Nếu có sai lệch, đặt WORKFORCE_SCHEDULE_RELATIONAL_READ=false trong VPS .env và recreate app container.",
    "Tiếp tục compatibility schedule writes và module revision concurrency trong giai đoạn quan sát.",
    "Sau khi read cutover ổn định mới chọn domain chuẩn hóa tiếp theo; không retire compatibility data trong cùng bước.",
  ],
  security_note:"Live handoff chỉ đọc metadata công khai của repository và runtime release/schema; không trả secret, credential hoặc dữ liệu nghiệp vụ.",
});
