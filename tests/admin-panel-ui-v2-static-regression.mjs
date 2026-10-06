import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(".admindev.html", "utf8");
const shellJs = fs.readFileSync("src/admin-panel-ui-v2.js", "utf8");
const sectionsJs = fs.readFileSync("src/admin-panel-sections-v2.js", "utf8");
const shellCss = fs.readFileSync("src/admin-panel-v2.css", "utf8");
const baseAdminCss = fs.readFileSync("src/admin-panel.css", "utf8");
const sectionsCss = fs.readFileSync("src/admin-panel-sections-v2.css", "utf8");

for (const asset of [
  "./src/admin-panel-v2.css",
  "./src/admin-panel-sections-v2.css",
  "./src/admin-panel-ui-v2.js",
  "./src/admin-panel-sections-v2.js",
]) assert.match(html, new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${asset} must be loaded by the real Super Admin entry`);

assert.ok(html.indexOf("./src/admin-panel.js") < html.indexOf("./src/admin-panel-ui-v2.js"), "presentation layer must load after the API/CRUD application layer");
assert.ok(html.indexOf("./src/admin-panel-inventory.js") < html.indexOf("./src/admin-panel-sections-v2.js"), "section enhancer must load after inventory handlers");

assert.match(shellJs, /MutationObserver/);
assert.match(shellJs, /Kitchen OS Control Center/);
assert.match(shellJs, /data-ui-section/);
assert.match(shellCss, /\.sa-dashboard-hero/);
assert.match(shellCss, /@media\(max-width:640px\)/);

assert.match(baseAdminCss, /Approved UI lock — 2026-10-06: Super Admin inventory permission console/);
assert.match(baseAdminCss, /\.iap-shell\{[\s\S]*?grid-template-columns:minmax\(270px,.72fr\) minmax\(0,1.68fr\)/);
assert.match(baseAdminCss, /\.iap-toolbar::before\{[\s\S]*?Đối tượng áp dụng/);
assert.match(baseAdminCss, /\.iap-scope-head>div:first-child>strong::before\{[\s\S]*?2\. /);
assert.match(baseAdminCss, /\.iap-site-chip:has\(input:checked\)/);
assert.match(baseAdminCss, /@media\(max-width:1050px\)[\s\S]*?\.iap-shell\{grid-template-columns:1fr\}/);
assert.match(baseAdminCss, /@media\(max-width:390px\)[\s\S]*?\.iap-site-grid\{grid-template-columns:1fr\}/);

for (const section of ["development", "users", "content", "data", "stores", "settings", "logs"]) {
  assert.match(sectionsJs, new RegExp(`${section}:\\s*\\{`), `${section} must have v2 section metadata`);
}
assert.match(sectionsJs, /MutationObserver/);
assert.match(sectionsJs, /\.sa-nav-item\.active/);
assert.match(sectionsJs, /data-export/);
assert.match(sectionsCss, /\.sa-section-hero-v2/);
assert.match(sectionsCss, /\.sa-table-v2/);
assert.match(sectionsCss, /\.sa-dev-link/);
assert.match(
  sectionsCss,
  /\.sa-dev-steps li\{[^}]*overflow-wrap:anywhere[^}]*word-break:break-word/,
  "development next steps must wrap long runtime flags on narrow devices"
);
assert.match(shellJs, /\["development", "⌘"\]/);
assert.match(sectionsCss, /@media\(max-width:720px\)/);

for (const presentationJs of [shellJs, sectionsJs]) {
  assert.doesNotMatch(presentationJs, /apiRequest\s*\(/, "v2 presentation layer must not bypass admin-panel API contracts");
  assert.doesNotMatch(presentationJs, /\bfetch\s*\(/, "v2 presentation layer must not make independent network calls");
  assert.doesNotMatch(presentationJs, /localStorage|sessionStorage/, "v2 presentation layer must not become a data authority");
}

console.log("SUPER_ADMIN_UI_V2_STATIC_REGRESSION_OK");
