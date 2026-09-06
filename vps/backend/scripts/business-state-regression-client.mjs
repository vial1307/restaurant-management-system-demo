const originalFetch = globalThis.fetch;

function requestPath(input) {
  try {
    const raw = typeof input === "string" ? input : input?.url;
    return new URL(raw, process.env.TEST_API_BASE || "http://127.0.0.1:8080").pathname;
  } catch {
    return "";
  }
}

function headerObject(headers) {
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return { ...headers };
}

globalThis.fetch = async (input, init = {}) => {
  const path = requestPath(input);
  const method = String(init?.method || "GET").toUpperCase();
  if (method !== "POST" || !/^\/api\/business-state\/(central|fuxing|yongji)$/.test(path)) {
    return originalFetch(input, init);
  }

  let body = null;
  try { body = JSON.parse(init.body || "null"); } catch {}
  if (!body?.modules || body.expectedModuleRevisions) return originalFetch(input, init);

  const headers = headerObject(init.headers);
  const base = process.env.TEST_API_BASE || "http://127.0.0.1:8080";
  const read = await originalFetch(base + path, { method: "GET", headers });
  const current = await read.json();
  const revisions = current?.moduleRevisions && typeof current.moduleRevisions === "object"
    ? current.moduleRevisions
    : {};
  const expectedModuleRevisions = Object.fromEntries(
    Object.keys(body.modules).map((name) => [name, Number.isInteger(Number(revisions[name])) ? Number(revisions[name]) : 0])
  );

  return originalFetch(input, {
    ...init,
    headers,
    body: JSON.stringify({ ...body, expectedModuleRevisions }),
  });
};
