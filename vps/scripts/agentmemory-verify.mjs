const secret = String(process.env.AGENTMEMORY_SECRET || "").trim();
if (!secret) throw new Error("AGENTMEMORY_SECRET_MISSING");

const response = await fetch("http://127.0.0.1:3111/agentmemory/search", {
  method:"POST",
  headers:{
    "Content-Type":"application/json",
    "Authorization":`Bearer ${secret}`,
  },
  body:JSON.stringify({
    query:"Kitchen OS engineering memory snapshot CURRENT_HANDOFF PostgreSQL VPS source of truth",
    project:"kitchen-os",
    agentId:"kitchen-os-handoff-sync",
    limit:5,
    format:"narrative",
    token_budget:2000,
  }),
});

const body = await response.text();
if (!response.ok) {
  throw new Error(`AGENTMEMORY_RECALL_HTTP_FAILED status=${response.status} body=${body.slice(0,1000)}`);
}

let parsed;
try { parsed = JSON.parse(body); } catch {
  throw new Error(`AGENTMEMORY_RECALL_INVALID_JSON body=${body.slice(0,1000)}`);
}
const results = Array.isArray(parsed?.results) ? parsed.results : [];
if (!results.length) {
  throw new Error("AGENTMEMORY_RECALL_EMPTY");
}
const joined = JSON.stringify(results);
if (!joined.includes("Kitchen OS engineering memory snapshot")) {
  throw new Error(`AGENTMEMORY_RECALL_WRONG_SCOPE results=${joined.slice(0,1500)}`);
}
console.log(`AGENTMEMORY_RECALL_OK results=${results.length} first=${String(results[0]?.title || results[0]?.obsId || "").slice(0,140)}`);
