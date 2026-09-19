const REPOSITORY_URL = "https://github.com/vial1307/restaurant-management-system-demo";

function github(path = "") {
  return `${REPOSITORY_URL}${path}`;
}

export const DEVELOPMENT_STATUS = Object.freeze({
  updated_at:"2026-09-19",
  phase:"inventory-site-isolation-released",
  status:"stable",
  headline:"Inventory site isolation đã production-verified trên schema 022; central/Fuxing/Yongji độc lập theo site, storage relocation chạy transactional và site switch chỉ commit sau khi hydrate PostgreSQL.",
  repository:{
    name:"vial1307/restaurant-management-system-demo",
    url:REPOSITORY_URL,
    actions_url:github("/actions"),
    pulls_url:github("/pulls"),
  },
  current_work:{
    branch:"main",
    url:github("/tree/main"),
    pull_request:null,
    baseline_main_sha:null,
    baseline_main_url:github("/commits/main"),
    candidate_schema:"022",
    stopping_point:"Release #754 / 6f391421881e6e4aa687ed8cca85d751f96efadb đã production-verified. Inventory DB/API/UI isolation và storage relocation đã hoàn tất; phần tiếp theo là polish feedback khi đổi chi nhánh và giữ production audit/regression bắt buộc.",
    resolved_incident:{
      workflow:"Inventory site isolation hardening",
      failed_run_id:"35429143530",
      failed_url:github("/actions/runs/35429143530"),
      resolution:"Production audit trước và sau migration đều xác nhận 0 cross-site violations. Hiện tượng Fuxing/Yongji dính số liệu được cô lập về frontend cache/site context; schema 022 giờ chặn cross-site item/location writes ngay tại PostgreSQL.",
    },
    code_focus:[
      "src/auth-layer.js",
      "src/auth-layer.css",
      "src/inventory-cloud.js",
      "src/app.js",
      "vps/database/migrations/022_inventory_site_isolation.sql",
      "vps/backend/src/inventory-extra-routes.mjs",
      ".github/workflows/inventory-site-production-audit.yml",
      "tests/inventory-site-switch-isolation-regression.mjs",
    ],
  },
  release_evidence:{
    milestone_sha:"6f391421881e6e4aa687ed8cca85d751f96efadb",
    workflow_run_id:"35430241680",
    url:github("/actions/runs/35430241680"),
    schema:"022",
    note:"Release #754 passed preflight, API/inventory/concurrency, desktop/mobile/full-device, exact-SHA deploy, production health/release check, production UI smoke and post-deploy Inventory Site Production Audit.",
  },
  documents:[
    { label:"CURRENT_HANDOFF.md", purpose:"Trạng thái chuẩn để dev tiếp quản", url:github("/blob/main/docs/CURRENT_HANDOFF.md") },
    { label:"WORK_LOG.md", purpose:"Nhật ký sửa lỗi / CI / deploy", url:github("/blob/main/docs/WORK_LOG.md") },
    { label:"STATUS.md", purpose:"Workboard ngắn hạn / việc đang làm", url:github("/blob/main/docs/STATUS.md") },
    { label:"DEVELOPMENT_RULES.md", purpose:"Quy tắc bắt buộc trước khi code", url:github("/blob/main/docs/DEVELOPMENT_RULES.md") },
  ],
  next_steps:[
    "Giữ warehouse switch ở chế độ fetch target snapshot trước rồi mới commit active site; không render dữ liệu branch cũ dưới nhãn branch mới.",
    "Hiển thị feedback rõ khi đang hydrate chi nhánh và khóa switcher cho tới khi PostgreSQL snapshot hoàn tất.",
    "Giữ Inventory Site Production Audit bắt buộc sau deploy; stock/default/item-site violations phải luôn bằng 0.",
    "Mọi thay đổi vị trí lưu phải dùng relocation/transfer transaction, không dùng catalog metadata để mô phỏng di chuyển tồn kho.",
    "Sau khi UX đổi kho ổn định, tiếp tục workstream relational/domain tiếp theo mà không tạo write authority thứ hai.",
  ],
  security_note:"Endpoint chỉ trả metadata handoff đã lọc; không trả dữ liệu bí mật hoặc quyền truy cập hạ tầng.",
});
