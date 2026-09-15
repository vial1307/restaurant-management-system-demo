// Keep the browser origin aligned with the API host in CI. WebKit enforces
// access-control/cookie host checks more strictly when localhost proxies to
// 127.0.0.1, even though the test server serves the same application.
if (process.env.TEST_WEB_BASE === "http://localhost:3000") {
  process.env.TEST_WEB_BASE = "http://127.0.0.1:3000";
}

await import("./stable-shell-browser-regression.mjs");
await import("./mobile-role-site-certification.mjs");
await import("./full-device-regression-core.mjs");
