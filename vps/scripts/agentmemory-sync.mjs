import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const files = [
  ["CURRENT_HANDOFF.md", "/workspace/docs/CURRENT_HANDOFF.md"],
  ["STATUS.md", "/workspace/docs/STATUS.md"],
  ["DEVELOPMENT_RULES.md", "/workspace/docs/DEVELOPMENT_RULES.md"],
];

const parts = [];
for (const [label,path] of files) {
  const content = await readFile(path,"utf8");
  parts.push(`## ${label}\n\n${content.trim()}\n`);
}

const payloadText = [
  "Kitchen OS engineering memory seed.",
  "Repository: vial1307/restaurant-management-system-demo",
  "Authority rule: GitHub CURRENT_HANDOFF.md and PostgreSQL/VPS remain source of truth; this memory is retrieval context only.",
  "",
  ...parts,
].join("\n");

const digest = createHash("sha256").update(payloadText).digest("hex");
const digestPath = "/data/kitchen-os-handoff.sha256";
let previous = "";
try { previous = (await readFile(digestPath,"utf8")).trim(); } catch {}
if (previous === digest) {
  console.log(`AGENTMEMORY_HANDOFF_UNCHANGED sha256=${digest}`);
  process.exit(0);
}

const secret = String(process.env.AGENTMEMORY_SECRET || "").trim();
if (!secret) throw new Error("AGENTMEMORY_SECRET_MISSING");

const response = await fetch("http://127.0.0.1:3111/agentmemory/remember",{
  method:"POST",
  headers:{
    "Content-Type":"application/json",
    "Authorization":`Bearer ${secret}`,
  },
  body:JSON.stringify({
    content:payloadText,
    concepts:["kitchen-os","engineering-handoff","github","vps","postgresql","super-admin"],
  }),
});
const body = await response.text();
if (!response.ok) {
  throw new Error(`AGENTMEMORY_REMEMBER_FAILED status=${response.status} body=${body.slice(0,1000)}`);
}

await writeFile(digestPath,`${digest}\n`,{encoding:"utf8",mode:0o600});
console.log(`AGENTMEMORY_HANDOFF_SYNCED sha256=${digest} status=${response.status}`);
