import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const PROJECT = "kitchen-os";
const AGENT_ID = "kitchen-os-handoff-sync";
const MAX_SEED_CHARS = 40_000;
const statePath = "/data/kitchen-os-handoff-hashes.json";

const sources = [
  {
    label:"CURRENT_HANDOFF.md",
    path:"/workspace/docs/CURRENT_HANDOFF.md",
    repoPath:"docs/CURRENT_HANDOFF.md",
    type:"workflow",
    concepts:["kitchen-os","engineering-handoff","github","vps","production"],
  },
  {
    label:"STATUS.md",
    path:"/workspace/docs/STATUS.md",
    repoPath:"docs/STATUS.md",
    type:"fact",
    concepts:["kitchen-os","engineering-status","release","production"],
  },
  {
    label:"DEVELOPMENT_RULES.md",
    path:"/workspace/docs/DEVELOPMENT_RULES.md",
    repoPath:"docs/DEVELOPMENT_RULES.md",
    type:"preference",
    concepts:["kitchen-os","development-rules","safety","source-of-truth"],
  },
  {
    label:"ENGINEERING_CONTRACT.md",
    path:"/workspace/docs/ENGINEERING_CONTRACT.md",
    repoPath:"docs/ENGINEERING_CONTRACT.md",
    type:"preference",
    concepts:["kitchen-os","engineering-contract","definition-of-done","verification","safety"],
  },
  {
    label:"AGENT_START_PROTOCOL.md",
    path:"/workspace/docs/AGENT_START_PROTOCOL.md",
    repoPath:"docs/AGENT_START_PROTOCOL.md",
    type:"workflow",
    concepts:["kitchen-os","agent-start","new-session","handoff","workflow"],
  },
  {
    label:"FEATURE_REGISTRY.md",
    path:"/workspace/docs/FEATURE_REGISTRY.md",
    repoPath:"docs/FEATURE_REGISTRY.md",
    type:"architecture",
    concepts:["kitchen-os","feature-registry","authority","invariants","modules"],
  },
  {
    label:"VERIFICATION_MATRIX.md",
    path:"/workspace/docs/VERIFICATION_MATRIX.md",
    repoPath:"docs/VERIFICATION_MATRIX.md",
    type:"workflow",
    concepts:["kitchen-os","verification-matrix","browser","persistence","rbac","release-gate"],
  },
];

let state = {};
try {
  const parsed = JSON.parse(await readFile(statePath,"utf8"));
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) state = parsed;
} catch {}

const secret = String(process.env.AGENTMEMORY_SECRET || "").trim();
if (!secret) throw new Error("AGENTMEMORY_SECRET_MISSING");

let changed = 0;
for (const source of sources) {
  const raw = (await readFile(source.path,"utf8")).trim();
  const truncated = raw.length > MAX_SEED_CHARS;
  const excerpt = truncated
    ? `${raw.slice(0,MAX_SEED_CHARS)}\n\n[Snapshot truncated at ${MAX_SEED_CHARS} characters. Read the authoritative GitHub file for the full document.]`
    : raw;
  const content = [
    "Kitchen OS engineering memory snapshot.",
    `Repository: vial1307/restaurant-management-system-demo`,
    `Source: ${source.repoPath}`,
    "Authority rule: GitHub CURRENT_HANDOFF.md and PostgreSQL/VPS remain source of truth; this AgentMemory record is retrieval context only.",
    "",
    excerpt,
  ].join("\n");
  const digest = createHash("sha256").update(content).digest("hex");
  if (state[source.repoPath] === digest) {
    console.log(`AGENTMEMORY_SEED_UNCHANGED file=${source.repoPath} sha256=${digest}`);
    continue;
  }

  const response = await fetch("http://127.0.0.1:3111/agentmemory/remember",{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "Authorization":`Bearer ${secret}`,
    },
    body:JSON.stringify({
      content,
      type:source.type,
      concepts:source.concepts,
      files:[source.repoPath],
      project:PROJECT,
      agentId:AGENT_ID,
    }),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`AGENTMEMORY_REMEMBER_FAILED file=${source.repoPath} status=${response.status} body=${body.slice(0,1000)}`);
  }
  let parsed = null;
  try { parsed = JSON.parse(body); } catch {}
  if (parsed && parsed.success === false) {
    throw new Error(`AGENTMEMORY_REMEMBER_REJECTED file=${source.repoPath} body=${body.slice(0,1000)}`);
  }

  state[source.repoPath] = digest;
  changed += 1;
  console.log(`AGENTMEMORY_SEED_SYNCED file=${source.repoPath} sha256=${digest} status=${response.status} truncated=${truncated}`);
}

await writeFile(statePath,`${JSON.stringify(state,null,2)}\n`,{encoding:"utf8",mode:0o600});
console.log(`AGENTMEMORY_SEED_COMPLETE changed=${changed} total=${sources.length} project=${PROJECT}`);
