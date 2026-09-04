import fs from "node:fs";
import path from "node:path";

const target = path.resolve(process.argv[2] || "");
const release = String(process.argv[3] || "").trim();

if (!target || !release || !/^[a-zA-Z0-9._-]+$/.test(release)) {
  console.error("Usage: node stamp-frontend-release.mjs <frontend-directory> <release>");
  process.exit(2);
}

const files = ["index.html", "vps-entry.html", "sw.js"];
for (const relative of files) {
  const file = path.join(target, relative);
  const source = fs.readFileSync(file, "utf8");
  if (!source.includes("__KITCHEN_RELEASE__")) {
    throw new Error(`${relative} is missing the release placeholder`);
  }
  fs.writeFileSync(file, source.replaceAll("__KITCHEN_RELEASE__", release));
}

console.log(`FRONTEND_RELEASE_STAMPED ${release}`);
