import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.TEST_WEB_PORT || 3000);
const apiPort = Number(process.env.TEST_API_PORT || 8080);

const MIME = {
  ".html":"text/html; charset=utf-8",
  ".js":"text/javascript; charset=utf-8",
  ".css":"text/css; charset=utf-8",
  ".json":"application/json; charset=utf-8",
  ".svg":"image/svg+xml",
  ".webmanifest":"application/manifest+json; charset=utf-8",
};

const PROXY_RESPONSE_HEADERS = new Set([
  "cache-control",
  "content-disposition",
  "content-type",
  "etag",
  "last-modified",
  "set-cookie",
]);

function proxyResponseHeaders(headers = {}) {
  return Object.fromEntries(
    Object.entries(headers).filter(([name, value]) =>
      value !== undefined && PROXY_RESPONSE_HEADERS.has(String(name).toLowerCase())
    )
  );
}

const server = http.createServer((req,res) => {
  if (req.url?.startsWith("/api/")) {
    const proxy = http.request({
      hostname:"127.0.0.1",
      port:apiPort,
      path:req.url,
      method:req.method,
      headers:{...req.headers,host:`127.0.0.1:${apiPort}`},
    }, (upstream) => {
      // The test server is a same-origin reverse proxy. Do not forward
      // hop-by-hop or CORS transport headers from the API server: WebKit can
      // interpret those headers against the proxy origin and reject an
      // otherwise successful same-origin response. Keep only application
      // response metadata that the browser/tests actually need.
      res.writeHead(
        upstream.statusCode || 500,
        proxyResponseHeaders(upstream.headers)
      );
      upstream.pipe(res);
    });
    proxy.on("error", (error) => {
      res.writeHead(502,{"content-type":"application/json"});
      res.end(JSON.stringify({error:"TEST_PROXY_ERROR",detail:error.message}));
    });
    req.pipe(proxy);
    return;
  }

  const url = new URL(req.url || "/", `http://localhost:${port}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const file = path.resolve(root, "." + pathname);
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403); res.end("Forbidden"); return;
  }
  fs.readFile(file,(error,data)=>{
    if(error){
      res.writeHead(404); res.end("Not found"); return;
    }
    res.writeHead(200,{
      "content-type":MIME[path.extname(file)] || "application/octet-stream",
      "cache-control":"no-store",
    });
    res.end(data);
  });
});

server.listen(port,"0.0.0.0",()=>{
  console.log(`TEST_WEB_READY http://localhost:${port}`);
});
