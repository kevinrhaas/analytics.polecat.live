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
  // Viridis V2: geo assets ride along so CLI exports of map dashboards stay
  // byte-identical to browser exports (exporters.js only inlines what the
  // spec's Studio.geoAssetKeys() actually needs).
  const geo = {};
  [["county", "geo/counties-albers-10m.json"], ["state", "geo/states-albers-10m.json"],
   ["huc8", "geo/us-huc8-cornbelt-albers.json"], ["crdMap", "geo/us-crd-counties.json"]]
    .forEach(function (kv) { geo[kv[0]] = fs.readFileSync(path.join(VENDOR, kv[1]), "utf8"); });
  return {
    css: fs.readFileSync(path.join(VENDOR, "pdc-ui.css"), "utf8"),
    js: fs.readFileSync(path.join(VENDOR, "pdc-ui.js"), "utf8"),
    render: fs.readFileSync(path.join(APP, "studio-render.js"), "utf8"),
    charts: fs.readFileSync(path.join(APP, "studio-charts.js"), "utf8"),
    topojson: fs.readFileSync(path.join(VENDOR, "geo/topojson-client.min.js"), "utf8"),
    geo: geo,
    maplibre: {
      js: fs.readFileSync(path.join(VENDOR, "maplibre/maplibre-gl.js"), "utf8"),
      css: fs.readFileSync(path.join(VENDOR, "maplibre/maplibre-gl.css"), "utf8")
    }
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
