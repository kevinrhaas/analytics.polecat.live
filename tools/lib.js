/* tools/lib.js — shared Node helpers for the CLI tools (export).
   Loads the browser app modules (DOM-free ones) into a fake window so the CLI
   builds byte-identical artifacts. */
"use strict";
const fs = require("fs");
const path = require("path");
const APP = path.join(__dirname, "..", "app");
const VENDOR = path.join(__dirname, "..", "vendor");

function loadStudio() {
  const win = {};
  ["model.js", "sampledata.js", "exporters.js"].forEach(function (f) {
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
  const a = assets(), stem = spec.name;
  return [
    { name: stem + ".html", mime: "text/html", body: Studio.exportCDF(spec, a, deployPath) }
  ].map(function (f) { f.path = deployPath + "/" + f.name; return f; });
}

module.exports = { loadStudio, assets, buildArtifacts };
