#!/usr/bin/env node
/* tools/schedule-job.js — register a Pentaho SCHEDULER job (run/email content on
   a schedule) via the server's scheduler API (/api/scheduler/job). This is the
   server-side scheduler — for scheduling existing repo content (a report,
   transformation, or a CDA refresh) to RUN. (To publish dashboards on a
   schedule, use tools/push.js instead.)

   Usage:
     node tools/schedule-job.js --input /public/pdc-iteration/v2/foo.prpt \
        --cron "0 0 6 * * ?" --name "Daily Foo" \
        --server http://localhost:8080/pentaho --user admin --password password [--output /home/admin] [--dry-run]
     node tools/schedule-job.js --input /path/x.prpt --every-hours 6 --server ... --dry-run

   Note: the exact JobScheduleRequest schema varies slightly by Pentaho version;
   --dry-run prints the JSON so you can confirm before sending.                  */
"use strict";

function arg(name, def) { var i = process.argv.indexOf(name); return i >= 0 ? (process.argv[i + 1] && process.argv[i + 1][0] !== "-" ? process.argv[i + 1] : true) : def; }
function flag(name) { return process.argv.indexOf(name) >= 0; }

function buildRequest() {
  var input = arg("--input");
  if (!input) { console.error("--input <repo path to the file to run> is required"); process.exit(2); }
  var req = { inputFile: input, outputFile: arg("--output", null) || null, jobName: arg("--name", input.split("/").pop()), jobParameters: [] };
  if (arg("--cron")) req.cronJobTrigger = { cronString: String(arg("--cron")), uiPassParam: arg("--ui", "CUSTOM") };
  else if (arg("--every-hours")) req.simpleJobTrigger = { repeatInterval: (+arg("--every-hours")) * 3600, repeatCount: -1, uiPassParam: "HOURS" };
  else if (arg("--every-minutes")) req.simpleJobTrigger = { repeatInterval: (+arg("--every-minutes")) * 60, repeatCount: -1, uiPassParam: "MINUTES" };
  else { console.error("Need a schedule: --cron \"0 0 6 * * ?\" | --every-hours N | --every-minutes N"); process.exit(2); }
  return req;
}

(async function () {
  var dryRun = flag("--dry-run");
  var server = (arg("--server") || process.env.PENTAHO_URL || "").replace(/\/+$/, "");
  var user = arg("--user", process.env.PENTAHO_USER || ""), password = arg("--password", process.env.PENTAHO_PASSWORD || "");
  if (!server && !dryRun) { console.error("No --server (or PENTAHO_URL)."); process.exit(2); }
  var body = buildRequest(), url = (server || "http://localhost:8080/pentaho") + "/api/scheduler/job";
  if (dryRun) { console.log("[dry-run] POST " + url); console.log("Content-Type: application/json"); console.log(JSON.stringify(body, null, 2)); return; }
  var headers = { "Content-Type": "application/json", Accept: "text/plain" };
  if (user) headers.Authorization = "Basic " + Buffer.from(user + ":" + password).toString("base64");
  try {
    var r = await fetch(url, { method: "POST", headers: headers, body: JSON.stringify(body) });
    var txt = await r.text();
    console.log((r.ok ? "✓ scheduled" : "✗ " + r.status) + ": " + txt);
    process.exit(r.ok ? 0 : 1);
  } catch (e) { console.error("✗ " + e.message); process.exit(1); }
})();
