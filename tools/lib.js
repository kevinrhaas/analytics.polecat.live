/* tools/lib.js — shared Node helpers for the CLI tools (export, push).
   Loads the browser app modules (DOM-free ones) into a fake window so the CLI
   builds byte-identical artifacts, and provides a Node-safe Kettle parser. */
"use strict";
const fs = require("fs");
const path = require("path");
const APP = path.join(__dirname, "..", "app");
const VENDOR = path.join(__dirname, "..", "vendor");

function loadStudio() {
  const win = {};
  ["model.js", "sampledata.js", "pentaho.js", "exporters.js"].forEach(function (f) {
    new Function("window", fs.readFileSync(path.join(APP, f), "utf8"))(win);
  });
  return win.Studio;
}

function assets() {
  return {
    css: fs.readFileSync(path.join(VENDOR, "pdc-ui.css"), "utf8"),
    js: fs.readFileSync(path.join(VENDOR, "pdc-ui.js"), "utf8"),
    render: fs.readFileSync(path.join(APP, "studio-render.js"), "utf8"),
    charts: fs.readFileSync(path.join(APP, "studio-charts.js"), "utf8")
  };
}

// spec → [{name, body, mime, path}] for the deploy path
function buildArtifacts(Studio, spec, deployPath) {
  const a = assets(), cde = Studio.exportCDE(spec, deployPath), stem = spec.name;
  return [
    { name: stem + ".cda", mime: "application/xml", body: Studio.exportCDA(spec) },
    { name: stem + ".html", mime: "text/html", body: Studio.exportCDF(spec, a, deployPath) },
    { name: stem + ".cdfde", mime: "application/json", body: cde.cdfde },
    { name: stem + ".wcdf", mime: "application/xml", body: cde.wcdf }
  ].map(function (f) { f.path = deployPath + "/" + f.name; return f; });
}

// Node-safe Kettle <slaveserver> parser (regex; no DOM) → connection objects
function nodeKettleParse(xml) {
  const out = [], re = /<slaveserver>([\s\S]*?)<\/slaveserver>/gi; let m;
  const tag = function (block, t) { const r = new RegExp("<" + t + ">([\\s\\S]*?)</" + t + ">", "i").exec(block); return r ? r[1].trim() : ""; };
  while ((m = re.exec(xml))) {
    const b = m[1], ssl = /^y/i.test(tag(b, "sslMode")), port = tag(b, "port");
    out.push({ name: tag(b, "name") || tag(b, "hostname"), scheme: ssl ? "https" : "http", hostname: tag(b, "hostname") || "localhost",
      port: port || (ssl ? "8443" : "8080"), webAppName: tag(b, "webAppName") || "pentaho", username: tag(b, "username"), password: tag(b, "password") });
  }
  return out;
}
function connBase(c) { return c.scheme + "://" + c.hostname + (c.port ? (":" + c.port) : "") + "/" + (c.webAppName || "pentaho"); }

module.exports = { loadStudio, assets, buildArtifacts, nodeKettleParse, connBase };
