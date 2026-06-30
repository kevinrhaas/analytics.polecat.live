#!/usr/bin/env node
/* tools/export.js — generate deployable Pentaho artifacts from a .studio.json,
   reusing the SAME app/exporters.js the browser builder uses (no DOM needed).
   Usage: node tools/export.js <spec.studio.json> [outDir] [deployPath] */
"use strict";
const fs = require("fs");
const path = require("path");
const { loadStudio, buildArtifacts } = require("./lib");

function main() {
  const specPath = process.argv[2];
  const outDir = process.argv[3] || path.join(__dirname, "..", "dist");
  const deployPath = process.argv[4] || "/public/pdc-iteration/v2";
  if (!specPath) { console.error("usage: node tools/export.js <spec.studio.json> [outDir] [deployPath]"); process.exit(2); }

  const Studio = loadStudio();
  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  fs.mkdirSync(outDir, { recursive: true });
  const files = buildArtifacts(Studio, spec, deployPath);
  files.forEach(function (f) { fs.writeFileSync(path.join(outDir, f.name), f.body); });
  console.log("✓ " + spec.name + " → " + outDir + "  (" + files.map(function (f) { return f.name.split(".").pop(); }).join(", ") + ")");
}
main();
