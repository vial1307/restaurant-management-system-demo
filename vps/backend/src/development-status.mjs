const REPOSITORY_URL = "https://github.com/vial1307/restaurant-management-system-demo";
const PUBLIC_HANDOFF_URL = "https://vial1307.github.io/restaurant-management-system-demo/handoff.html";

function github(path = "") {
  return `${REPOSITORY_URL}${path}`;
}

export const DEVELOPMENT_STATUS = Object.freeze({
  updated_at:"2026-10-05",
  phase:"engineering-harness-control-plane",
  status:"in_progress",
  headline:"Live GitHub handoff is primary. Engineering Harness enforces new-session startup, exact-head verification and production evidence.",
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
    baseline_main_sha:null,
    baseline_main_url:github("/tree/main"),
    candidate_schema:null,
    stopping_point:"Read CURRENT_HANDOFF.md and live GitHub state. Static fallback intentionally does not declare an active PR, branch, schema or feature.",
    resolved_incident:null,
    code_focus:[],
  },
  release_evidence:{
    milestone_sha:null,
    workflow_run_id:null,
    url:null,
    schema:null,
    inventory_audit_run_id:null,
    inventory_audit_url:null,
    note:"Fallback only. Current production release/schema come from VPS runtime; deploy/audit evidence comes from live GitHub workflows and CURRENT_HANDOFF.md.",
  },
  documents:[
    { label:"CURRENT_HANDOFF.md", purpose:"Trạng thái chuẩn và invariant để dev tiếp quản", url:github("/blob/main/docs/CURRENT_HANDOFF.md") },
    { label:"ENGINEERING_CONTRACT.md", purpose:"Definition of Done, exact-head/reload/persistence/RBAC rules", url:github("/blob/main/docs/ENGINEERING_CONTRACT.md") },
    { label:"AGENT_START_PROTOCOL.md", purpose:"Protocol bắt buộc cho chat/agent mới trước khi code", url:github("/blob/main/docs/AGENT_START_PROTOCOL.md") },
    { label:"FEATURE_REGISTRY.md", purpose:"Map feature -> authority -> invariants -> minimum verification", url:github("/blob/main/docs/FEATURE_REGISTRY.md") },
    { label:"VERIFICATION_MATRIX.md", purpose:"Coverage matrix cho buttons/list/reload/API/F5/RBAC/browser/production", url:github("/blob/main/docs/VERIFICATION_MATRIX.md") },
    { label:"WORK_LOG.md", purpose:"Nhật ký sửa lỗi / CI / deploy", url:github("/blob/main/docs/WORK_LOG.md") },
    { label:"STATUS.md", purpose:"Workboard ngắn hạn / việc đang làm", url:github("/blob/main/docs/STATUS.md") },
    { label:"DEVELOPMENT_RULES.md", purpose:"Quy tắc bắt buộc trước khi code", url:github("/blob/main/docs/DEVELOPMENT_RULES.md") },
  ],
  next_steps:[
    "Read CURRENT_HANDOFF.md and resolve ACTIVE_PR explicitly before editing code.",
    "Classify the touched feature and apply FEATURE_REGISTRY + VERIFICATION_MATRIX requirements.",
    "Require exact-head CI before merge; never reuse green evidence from another SHA.",
    "For runtime changes, deploy the exact merge SHA and verify release/schema, DATA_INTEGRITY_OK, production UI smoke and applicable production audits.",
    "Update handoff/status/work log and resync AgentMemory after production closure.",
  ],
  security_note:"Live handoff chỉ đọc metadata công khai của repository và runtime release/schema; không trả secret, credential hoặc dữ liệu nghiệp vụ.",
});
