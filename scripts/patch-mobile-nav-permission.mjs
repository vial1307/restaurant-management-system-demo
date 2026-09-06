import fs from "node:fs";

const path = "src/app.js";
let source = fs.readFileSync(path, "utf8");
const before = `function navItem(key, active, text) {\n  return \`<a class="nav-item \${active === key ? "active" : ""}" href="#\${key}" aria-current="\${active === key ? "page" : "false"}">\${icon(key)}<span>\${escapeHtml(text[key])}</span></a>\`;\n}`;
const after = `function navItem(key, active, text) {\n  const allowed = accountCan(key, "view");\n  const accessAttributes = allowed ? "" : ' hidden aria-hidden="true" tabindex="-1"';\n  return \`<a class="nav-item \${active === key ? "active" : ""}" href="#\${key}" aria-current="\${active === key ? "page" : "false"}"\${accessAttributes}>\${icon(key)}<span>\${escapeHtml(text[key])}</span></a>\`;\n}`;

if (!source.includes(before)) {
  throw new Error("navItem source contract changed; refusing non-deterministic patch");
}
source = source.replace(before, after);
fs.writeFileSync(path, source);
console.log("MOBILE_NAV_PERMISSION_PATCH_OK");
