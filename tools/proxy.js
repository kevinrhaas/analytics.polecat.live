#!/usr/bin/env node
/* tools/proxy.js — dev proxy for live testing against a local Pentaho server.
   Serves the Studio AND forwards /pentaho/* (and /plugin/*) to your Pentaho
   server, so the browser talks to ONE origin → no CORS, cookie auth works, and
   the preview iframe (srcdoc, inherits this origin) can reach the server too.

   Usage:  node tools/proxy.js [pentahoBaseUrl] [port]
           node tools/proxy.js http://localhost:8080 8000   (defaults)

   Then open http://localhost:8000 and add a connection in ⚙ Servers with
   hostname=localhost port=8000 webAppName=pentaho — everything is same-origin.   */
"use strict";
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const ROOT = path.resolve(__dirname, "..");
const TARGET = (process.argv[2] || "http://localhost:8080").replace(/\/+$/, "");
const PORT = +(process.argv[3] || 8000);
const tgt = new URL(TARGET);
const driver = tgt.protocol === "https:" ? https : http;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };

function isProxied(p) { return /^\/(pentaho|plugin|api|sys-tmp|content)\b/.test(p); }

function serveStatic(req, res) {
  let p = decodeURIComponent(req.url.split("?")[0]); if (p === "/") p = "/index.html";
  const fp = path.join(ROOT, p);
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); return res.end("404 " + p); }
  res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "application/octet-stream" });
  fs.createReadStream(fp).pipe(res);
}

function proxy(req, res) {
  const headers = Object.assign({}, req.headers); headers.host = tgt.host;       // present as the Pentaho host
  const opts = { protocol: tgt.protocol, hostname: tgt.hostname, port: tgt.port || (tgt.protocol === "https:" ? 443 : 80), method: req.method, path: req.url, headers: headers };
  const preq = driver.request(opts, function (pres) {
    res.writeHead(pres.statusCode, pres.headers);   // pass through status + Set-Cookie etc.
    pres.pipe(res);
  });
  preq.on("error", function (e) { res.writeHead(502, { "Content-Type": "text/plain" }); res.end("proxy error → " + TARGET + ": " + e.message); });
  req.pipe(preq);
}

http.createServer(function (req, res) { (isProxied(req.url) ? proxy : serveStatic)(req, res); }).listen(PORT, function () {
  console.log("PDC Dashboard Studio (proxied) → http://localhost:" + PORT + "/");
  console.log("  /pentaho/*, /plugin/*, /api/* → " + TARGET);
  console.log("  In ⚙ Servers add: hostname=localhost  port=" + PORT + "  webAppName=pentaho");
});
