const REPOSITORY_URL = "https://github.com/vial1307/restaurant-management-system-demo";

function github(path = "") {
  return `${REPOSITORY_URL}${path}`;
}

export const DEVELOPMENT_STATUS = Object.freeze({
  updated_at:"2026-09-19",
  phase:"deployment_hotfix",
  status:"verifying",
  headline:"PR #108 đã sửa host-metrics collector và thêm GitHub/Handoff vào Super Admin; đang chờ full release gates trước khi merge/deploy.",
  repository:{
    name:"vial1307/restaurant-management-system-demo",
    url:REPOSITORY_URL,
    actions_url:github("/actions"),
    pulls_url:github("/pulls"),
  },
  current_work:{
    branch:"fix/host-metrics-deploy-resilience-20260919",
    url:github("/tree/fix/host-metrics-deploy-resilience-20260919"),
    pull_request:{ number:108,url:github("/pull/108") },
    baseline_main_sha:"d2acef474866460c75ce66b6f5675306481bb65b",
    baseline_main_url:github("/commit/d2acef474866460c75ce66b6f5675306481bb65b"),
    candidate_schema:"021",
    stopping_point:"PR #108 verification: API/static/browser đã xanh; chờ full Deploy Kitchen OS regression + collector runtime smoke trước merge.",
    last_failure:{
      workflow:"Deploy Kitchen OS to VPS",
      run_id:"35372160924",
      url:github("/actions/runs/35372160924"),
      reason:"kitchen-os-host-metrics.service exited 1 before backup, schema migration, container restart and release verification.",
    },
    code_focus:[
      "vps/scripts/collect-host-metrics.sh",
      "vps/scripts/install-host-metrics-timer.sh",
      "vps/scripts/deploy.sh",
      "src/admin-panel.js",
      "vps/backend/src/super-admin-routes.mjs",
    ],
  },
  verified_production:{
    sha:"d15ae2087d293111b989b5e5efe7d56ac3bebb84",
    schema:"020",
    workflow_run_id:"35335888439",
    url:github("/actions/runs/35335888439"),
    note:"Giữ là production verified cho tới khi deploy + production UI smoke của SHA mới đều xanh.",
  },
  documents:[
    { label:"CURRENT_HANDOFF.md", purpose:"Trạng thái chuẩn để dev tiếp quản", url:github("/blob/main/docs/CURRENT_HANDOFF.md") },
    { label:"WORK_LOG.md", purpose:"Nhật ký sửa lỗi / CI / deploy", url:github("/blob/main/docs/WORK_LOG.md") },
    { label:"STATUS.md", purpose:"Workboard ngắn hạn / việc đang làm", url:github("/blob/main/docs/STATUS.md") },
    { label:"DEVELOPMENT_RULES.md", purpose:"Quy tắc bắt buộc trước khi code", url:github("/blob/main/docs/DEVELOPMENT_RULES.md") },
  ],
  next_steps:[
    "Xác nhận host-metrics collector runtime smoke và full Deploy Kitchen OS regression của PR #108 đều xanh.",
    "Chạy regression đầy đủ trên hotfix, merge chỉ khi tất cả gate xanh.",
    "Deploy exact tested SHA; xác nhận release, schema 021 và production UI smoke.",
    "Sau production xanh, cập nhật CURRENT_HANDOFF / WORK_LOG / STATUS với SHA và run thật.",
    "Tiếp tục database redesign + secure editable data theo allowlist/API/audit/revision invariant.",
  ],
  security_note:"Chỉ metadata GitHub/handoff an toàn được trả về. Không trả secret, SSH key, DB credential, environment dump hoặc raw host access.",
});
