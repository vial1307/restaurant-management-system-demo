import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

const BASE = process.env.TEST_API_BASE || "http://127.0.0.1:8080";
const PASSWORD = "KitchenTest!123";
const stages = [10, 25, 50];
const requestsPerClient = 4;
const MAX_P95_MS = Number(process.env.CI_LOAD_MAX_P95_MS || 5000);
const MAX_SINGLE_MS = Number(process.env.CI_LOAD_MAX_SINGLE_MS || 10000);

async function login() {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "managerfx", password: PASSWORD }),
  });
  const data = await response.json().catch(() => null);
  assert.equal(response.status, 200, `load-smoke login failed: ${JSON.stringify(data)}`);
  const cookie = response.headers.get("set-cookie")?.split(";")[0] || "";
  assert(cookie, "load-smoke login returned no session cookie");
  return cookie;
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

async function timedRequest(path, cookie) {
  const started = performance.now();
  try {
    const response = await fetch(`${BASE}${path}`, { headers: { cookie } });
    await response.arrayBuffer();
    return { status: response.status, ms: performance.now() - started, error: null };
  } catch (error) {
    return { status: 0, ms: performance.now() - started, error: String(error?.message || error) };
  }
}

async function runStage(concurrency, cookie) {
  const paths = ["/api/inventory/fuxing", "/api/business-state/fuxing", "/api/auth/me", "/api/health"];
  const workers = Array.from({ length: concurrency }, (_, workerIndex) => (async () => {
    const results = [];
    for (let i = 0; i < requestsPerClient; i += 1) {
      results.push(await timedRequest(paths[(workerIndex + i) % paths.length], cookie));
    }
    return results;
  })());

  const flat = (await Promise.all(workers)).flat();
  const failures = flat.filter((entry) => entry.error || entry.status < 200 || entry.status >= 300);
  const latencies = flat.map((entry) => entry.ms).sort((a, b) => a - b);
  const summary = {
    concurrency,
    requests: flat.length,
    failures: failures.length,
    p50_ms: Number(percentile(latencies, 50).toFixed(1)),
    p95_ms: Number(percentile(latencies, 95).toFixed(1)),
    p99_ms: Number(percentile(latencies, 99).toFixed(1)),
    max_ms: Number((latencies.at(-1) || 0).toFixed(1)),
  };
  console.log(JSON.stringify(summary));

  assert.equal(failures.length, 0, `load stage ${concurrency} had failures: ${JSON.stringify(failures.slice(0, 5))}`);
  assert(summary.p95_ms <= MAX_P95_MS, `load stage ${concurrency} p95 ${summary.p95_ms}ms exceeded ${MAX_P95_MS}ms`);
  assert(summary.max_ms <= MAX_SINGLE_MS, `load stage ${concurrency} max ${summary.max_ms}ms exceeded ${MAX_SINGLE_MS}ms`);
  return summary;
}

const cookie = await login();
const summaries = [];
for (const concurrency of stages) summaries.push(await runStage(concurrency, cookie));

console.log(JSON.stringify({ isolated_ci_load_smoke: "ok", stages: summaries }));
console.log("ISOLATED_LOAD_SMOKE_OK");
