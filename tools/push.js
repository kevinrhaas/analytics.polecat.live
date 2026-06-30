#!/usr/bin/env node
/* tools/push.js — publish dashboard artifacts to a Pentaho server via the
   standard publish API. One-shot or on an interval (scheduled deploy).

   Source (one of):
     --spec <file.studio.json>     build + push one dashboard
     --all                         build + push every bundled example
     --dir <dir>                   push pre-built files in a directory

   Server (flags, env, or a Kettle XML you exported from ⚙ Servers):
     --server http://host:8080/pentaho   (or env PENTAHO_URL)
     --user U --password P               (or env PENTAHO_USER / PENTAHO_PASSWORD)
     --kettle slaveservers.xml [--connection "Name"]

   Options:
     --deploy /public/pdc-iteration/v2   target repo folder (default)
     --interval <minutes>                keep running, re-publish every N min
     --dry-run                           print what would be sent; no network

   Examples:
     node tools/push.js --all --server http://localhost:8080/pentaho --user admin --password password
     node tools/push.js --spec data/examples/studio-cost.studio.json --dry-run --server http://x/pentaho
     node tools/push.js --all --interval 30 --server $PENTAHO_URL          (scheduled deploy)            */
"use strict";
const fs = require("fs");
const path = require("path");
const glob = require("fs");
const { loadStudio, buildArtifacts, nodeKettleParse, connBase } = require("./lib");

function arg(name, def) { var i = process.argv.indexOf(name); return i >= 0 ? (process.argv[i + 1] && process.argv[i + 1][0] !== "-" ? process.argv[i + 1] : true) : def; }
function flag(name) { return process.argv.indexOf(name) >= 0; }

function resolveServer() {
  if (arg("--server")) return { base: String(arg("--server")).replace(/\/+$/, ""), user: arg("--user", process.env.PENTAHO_USER || ""), password: arg("--password", process.env.PENTAHO_PASSWORD || "") };
  if (arg("--kettle")) {
    var conns = nodeKettleParse(fs.readFileSync(arg("--kettle"), "utf8"));
    var want = arg("--connection"), c = want ? conns.filter(function (x) { return x.name === want; })[0] : conns[0];
    if (!c) throw new Error("no connection in " + arg("--kettle") + (want ? " named " + want : ""));
    return { base: connBase(c), user: c.username, password: c.password };
  }
  if (process.env.PENTAHO_URL) return { base: process.env.PENTAHO_URL.replace(/\/+$/, ""), user: process.env.PENTAHO_USER || "", password: process.env.PENTAHO_PASSWORD || "" };
  return null;
}

function gatherFiles(Studio, deployPath) {
  var ROOT = path.join(__dirname, "..");
  if (arg("--dir")) {
    var dir = arg("--dir");
    return fs.readdirSync(dir).filter(function (n) { return /\.(cda|html|cdfde|wcdf)$/.test(n); })
      .map(function (n) { return { name: n, mime: "application/octet-stream", body: fs.readFileSync(path.join(dir, n), "utf8"), path: deployPath + "/" + n }; });
  }
  var specs = [];
  if (flag("--all")) specs = fs.readdirSync(path.join(ROOT, "data", "examples")).filter(function (n) { return /\.studio\.json$/.test(n); }).map(function (n) { return path.join(ROOT, "data", "examples", n); });
  else if (arg("--spec")) specs = [arg("--spec")];
  else { console.error("Need a source: --spec <file> | --all | --dir <dir>"); process.exit(2); }
  var out = [];
  specs.forEach(function (sp) { out = out.concat(buildArtifacts(Studio, JSON.parse(fs.readFileSync(sp, "utf8")), deployPath)); });
  return out;
}

async function publish(srv, file, dryRun) {
  var dir = file.path.replace(/\/[^/]*$/, "") || "/public", url = srv.base + "/api/repo/publish/publishfile";
  if (dryRun) { console.log("  [dry-run] POST " + url + "  importPath=" + dir + "  file=" + file.name + " (" + file.body.length + " B)"); return { ok: true }; }
  var fd = new FormData();
  fd.append("importPath", dir);
  fd.append("fileUpload", new Blob([file.body], { type: file.mime }), file.name);
  fd.append("overwriteFile", "true"); fd.append("overwrite", "true");
  fd.append("applyAclPermissions", "false"); fd.append("retainOwnership", "true");
  var headers = {}; if (srv.user) headers.Authorization = "Basic " + Buffer.from(srv.user + ":" + srv.password).toString("base64");
  try {
    var r = await fetch(url, { method: "POST", headers: headers, body: fd });
    console.log("  " + (r.ok ? "✓" : "✗ " + r.status) + " " + dir + "/" + file.name);
    return { ok: r.ok, status: r.status };
  } catch (e) { console.log("  ✗ " + file.name + " — " + e.message); return { ok: false }; }
}

async function runOnce(Studio, srv, deployPath, dryRun) {
  var files = gatherFiles(Studio, deployPath);
  console.log((dryRun ? "[dry-run] " : "") + "Publishing " + files.length + " file(s) → " + srv.base + "  (" + deployPath + ")");
  var ok = 0, fail = 0;
  for (var i = 0; i < files.length; i++) { var r = await publish(srv, files[i], dryRun); r.ok ? ok++ : fail++; }
  console.log("Done: " + ok + " ok, " + fail + " failed" + (dryRun ? " (dry-run)" : ""));
  return fail;
}

(async function () {
  var dryRun = flag("--dry-run"), deployPath = arg("--deploy", "/public/pdc-iteration/v2"), interval = +arg("--interval", 0) || 0;
  var srv = resolveServer();
  if (!srv && !dryRun) { console.error("No server. Use --server URL (and --user/--password), --kettle file, or env PENTAHO_URL."); process.exit(2); }
  if (!srv) srv = { base: "http://localhost:8080/pentaho", user: "", password: "" };   // dry-run placeholder
  var Studio = loadStudio();
  await runOnce(Studio, srv, deployPath, dryRun);
  if (interval > 0 && !dryRun) {
    console.log("Scheduled: re-publishing every " + interval + " min. Ctrl-C to stop.");
    setInterval(function () { runOnce(Studio, srv, deployPath, dryRun).catch(function (e) { console.error(e.message); }); }, interval * 60000);
  }
})();
