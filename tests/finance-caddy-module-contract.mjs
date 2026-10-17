import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import path from "node:path";
const caddy=readFileSync("vps/Caddyfile","utf8");
const financeSection=caddy.slice(caddy.indexOf("finance.82.47.180.185.nip.io {"));
assert(financeSection.startsWith("finance.82.47.180.185.nip.io {"),"Finance origin must stay isolated");
assert(!/handle\s+\/src\/\*/.test(financeSection),"Finance cannot expose whole restaurant /src/*");
assert(/handle\s+\/api\/finance\/\*/.test(financeSection),"Owner finance API route required");
assert(/respond "Not Found" 404/.test(financeSection),"Cross-origin Restaurant API must remain blocked");
const checked=new Set();
function assertAllowed(file){
 const abs=path.resolve(file);
 assert(abs.startsWith(path.resolve("src")+path.sep),"Finance modules must be inside /src/");
 assert(existsSync(abs),"Missing finance asset: "+file);
 const url="/"+file.replaceAll("\\","/");
 const exact=new RegExp("handle\\s+"+url.replaceAll(".","\\.")+"\\s*\\{");
 assert(exact.test(financeSection),"Missing Caddy exact path for "+url+"; missing ES import blanks Finance website");
 if(checked.has(file))return;
 checked.add(file);
 const body=readFileSync(abs,"utf8");
 for(const m of body.matchAll(/(?:^|\n)\s*(?:import|export)\s+(?:(?:[^;\n]*?)\s+from\s+)?["'](\.[^"']+)["']/g)){
   const nested=path.posix.normalize(path.posix.join(path.posix.dirname(file),m[1]));
   if(nested.endsWith(".js"))assertAllowed(nested);
 }
}
assertAllowed("src/personal-finance.js");
assertAllowed("src/personal-finance.css");
assert(checked.has("src/finance-visuals.js"),"Finance charts JS must be reachable on private finance origin");
console.log("PASS finance Caddy exact asset routes, nested ESM imports and Restaurant 404 isolation");
