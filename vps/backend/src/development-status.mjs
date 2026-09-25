const REPOSITORY_URL = "https://github.com/vial1307/restaurant-management-system-demo";
const PUBLIC_HANDOFF_URL = "https://vial1307.github.io/restaurant-management-system-demo/handoff.html";

function github(path = "") {
  return `${REPOSITORY_URL}${path}`;
}

export const DEVELOPMENT_STATUS = Object.freeze({
  updated_at:"2026-09-25",
  phase:"super-admin-account-scope",
  status:"in_progress",
  headline:"Production #843 đã verified trên schema 024. Đang sửa lỗi INVALID_LOCATION khi đổi Role/chi nhánh trong Super Admin; chờ CI của PR #140.",
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
    branch:"fix/super-admin-role-location-20260925",
    url:github("/tree/fix/super-admin-role-location-20260925"),
    pull_request:github("/pull/140"),
    baseline_main_sha:"9f081339c0309c0820aec5436b581b86044191d6",
    baseline_main_url:github("/commit/9f081339c0309c0820aec5436b581b86044191d6"),
    candidate_schema:"024",
    stopping_point:"RBAC: đổi từ Role all sang Role assigned phải chọn chi nhánh hợp lệ trước khi lưu; giữ quyền tùy chỉnh và xác nhận PostgreSQL sau khi tải lại. Chờ exact-head CI/deploy.",
    resolved_incident:null,
    code_focus:[
      "src/admin-panel.js",
      "vps/backend/scripts/super-admin-regression-client.mjs",
      "tests/super-admin-panel-browser-regression.mjs",
    ],
  },
  release_evidence:{
    milestone_sha:"ee5316b8ae5f12f2288aebf54e9e9cede3756ba0",
    workflow_run_id:"36142844487",
    url:github("/actions/runs/36142844487"),
    schema:"024",
    inventory_audit_run_id:"36142844487",
    inventory_audit_url:github("/actions/runs/36142844487"),
    note:"Deploy #843 verified release ee5316b and schema 024. This is the last verified production release, not production verification of the current RBAC fix.",
  },
  documents:[
    { label:"CURRENT_HANDOFF.md", purpose:"Trạng thái chuẩn và invariant để dev tiếp quản", url:github("/blob/main/docs/CURRENT_HANDOFF.md") },
    { label:"WORK_LOG.md", purpose:"Nhật ký sửa lỗi / CI / deploy", url:github("/blob/main/docs/WORK_LOG.md") },
    { label:"STATUS.md", purpose:"Workboard ngắn hạn / việc đang làm", url:github("/blob/main/docs/STATUS.md") },
    { label:"DEVELOPMENT_RULES.md", purpose:"Quy tắc bắt buộc trước khi code", url:github("/blob/main/docs/DEVELOPMENT_RULES.md") },
  ],
  next_steps:[
    "Kiểm tra Role all/central/assigned, chi nhánh hợp lệ và quyền tùy chỉnh trên desktop/mobile.",
    "Tạo tài khoản kiểm thử trong PostgreSQL, lưu rồi tải lại và đọc lại Role/chi nhánh/quyền.",
    "Chỉ merge/deploy SHA đã qua đầy đủ CI, sau đó xác minh production smoke.",
    "Giữ nguyên schema 024 và các cấu hình chi nhánh đang có; không sao chép layout giữa chi nhánh.",
  ],
  security_note:"Live handoff chỉ đọc metadata công khai của repository và runtime release/schema; không trả secret, credential hoặc dữ liệu nghiệp vụ.",
});
