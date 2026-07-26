#!/usr/bin/env node
/* tools/build-geo.mjs — rebuilds the vendor/geo geometry assets from their public
   sources. DEV-TIME ONLY (needs network + npm-fetched build deps); the app and its
   exports never run this. Outputs are committed so the runtime stays fully static.

   Rebuild:  node tools/build-geo.mjs [--workdir /tmp/geo-build]
   Produces: vendor/geo/counties-albers-10m.json   (us-atlas, verbatim)
             vendor/geo/states-albers-10m.json     (us-atlas, verbatim)
             vendor/geo/topojson-client.min.js     (npm dist, verbatim + LICENSE)
             vendor/geo/us-crd-counties.json       (parsed from USDA NASS county_list.txt)
             vendor/geo/us-huc8-albers.json        (USGS WBD → simplified → reprojected,
                                                     nationwide: all 50 states + DC)

   All redistribution licensing is recorded in THIRD-PARTY-NOTICES.md and
   vendor/geo/README.md. Sources: npm registry (topojson-client, us-atlas, and the
   build-only d3-geo/d3-array/internmap/topojson-server), nass.usda.gov (public
   domain), hydro.nationalmap.gov ArcGIS REST (public domain). */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, copyFileSync, symlinkSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..");
const OUT = path.join(ROOT, "vendor", "geo");
const WORK = process.argv.includes("--workdir")
  ? process.argv[process.argv.indexOf("--workdir") + 1]
  : "/tmp/geo-build";
mkdirSync(WORK, { recursive: true });
mkdirSync(path.join(WORK, "node_modules"), { recursive: true });

// All 50 states + DC — the full extent d3.geoAlbersUsa() can project (its AK/HI
// insets included). Territories (PR/VI/GU/AS/MP) fall outside AlbersUsa's plane
// (proj() returns null for them) so they're excluded at the query stage rather
// than fetched and silently dropped.
const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN",
  "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH",
  "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT",
  "VT", "VA", "WA", "WV", "WI", "WY"
];
// The d3/us-atlas standard pre-projection — HUC8 must land on the SAME plane
// as the atlas files or the scales won't overlay.
const ALBERS = { scale: 1300, translate: [487.5, 305] };

function sh(cmd) { execSync(cmd, { stdio: "inherit", cwd: WORK }); }

async function npmPkg(name) {
  const dir = path.join(WORK, name);
  if (!existsSync(dir)) {
    const meta = await (await fetch(`https://registry.npmjs.org/${name}/latest`)).json();
    console.log(`fetch ${name}@${meta.version} (${meta.license})`);
    sh(`curl -sSL "${meta.dist.tarball}" -o ${name}.tgz && mkdir -p ${name} && tar -xzf ${name}.tgz -C ${name} --strip-components=1`);
    const link = path.join(WORK, "node_modules", name);
    if (!existsSync(link)) symlinkSync(dir, link);
    // These d3/internmap packages ship "type":"module" with no "require" export
    // condition, so a plain CJS `require()` (what d3-geo's dist build does for its
    // own dependencies) falls through to Node's synchronous ESM interop — which,
    // on this Node version, hands back class exports (e.g. d3-array's `Adder`)
    // that fail `new`. Point bare `require("<name>")` resolution at the package's
    // own prebuilt CJS bundle instead (still the package's own published dist
    // output, just the CJS one) so it loads as ordinary CommonJS. Dev-tool-only
    // workdir patch — never touches anything committed.
    const pkgJsonPath = path.join(dir, "package.json");
    const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
    const cjsDist = `./dist/${name}.js`;
    if (existsSync(path.join(dir, "dist", `${name}.js`)) && pkg.exports) {
      pkg.main = cjsDist;
      pkg.exports = { require: cjsDist, default: cjsDist };
      // "type":"module" governs how Node interprets EVERY .js file under this
      // package (including the dist CJS bundle above) regardless of the exports
      // map, since d3-geo is loaded by direct file path (bypassing its own
      // package.json) — so its nested `require("d3-array")` still resolves
      // through d3-array's package.json and hits the same "module" typing.
      // Force plain CommonJS interpretation for the dist bundles.
      pkg.type = "commonjs";
      writeFileSync(pkgJsonPath, JSON.stringify(pkg));
    }
  }
  return dir;
}

// ── 1. runtime lib + atlas geometry (verbatim copies) ────────────────────────
const tj = await npmPkg("topojson-client");
copyFileSync(path.join(tj, "dist/topojson-client.min.js"), path.join(OUT, "topojson-client.min.js"));
copyFileSync(path.join(tj, "LICENSE"), path.join(OUT, "LICENSE-topojson-client"));
const atlas = await npmPkg("us-atlas");
copyFileSync(path.join(atlas, "counties-albers-10m.json"), path.join(OUT, "counties-albers-10m.json"));
copyFileSync(path.join(atlas, "states-albers-10m.json"), path.join(OUT, "states-albers-10m.json"));
copyFileSync(path.join(atlas, "LICENSE"), path.join(OUT, "LICENSE-us-atlas"));

// ── 2. NASS county → CRD mapping ─────────────────────────────────────────────
const nassTxt = await (await fetch(
  "https://www.nass.usda.gov/Data_and_Statistics/County_Data_Files/Frequently_Asked_Questions/county_list.txt"
)).text();
const counties = {};
let mapped = 0;
for (const ln of nassTxt.split(/\r?\n/)) {
  const m = ln.match(/^(\d{2})\s+(\d{2})\s+(\d{3})\s+(.+?)\t+\s*(\d)\s*$/);
  if (!m) continue;
  const [, st, dist, cty, , flag] = m;
  if (flag !== "1" || dist === "00" || cty === "000" || parseInt(cty, 10) >= 900) continue;
  counties[st + cty] = st + dist; mapped++;
}
writeFileSync(path.join(OUT, "us-crd-counties.json"), JSON.stringify({
  source: "USDA NASS county_list.txt (public domain), county FIPS -> crop reporting district (state FIPS + district code)",
  updated: "2007-08-15 (NASS file vintage; district assignments are stable)",
  counties
}));
console.log("CRD mapping:", mapped, "counties");

// ── 3. HUC8 nationwide: fetch simplified, reproject, quantize ────────────────
await npmPkg("d3-array"); await npmPkg("internmap"); await npmPkg("topojson-server");
const d3geoDir = await npmPkg("d3-geo");
const require2 = createRequire(path.join(WORK, "x.js"));
const d3 = require2(path.join(d3geoDir, "dist/d3-geo.js"));
const { topology } = require2(path.join(WORK, "topojson-server", "dist/topojson-server.js"));

const where = US_STATES.map((s) => `states LIKE '%${s}%'`).join(" OR ");
let offset = 0, feats = [];
for (;;) {
  const qs = new URLSearchParams({
    where, outFields: "huc8,name,states", f: "geojson",
    // Coarser than the original Corn-Belt-only pull (0.01/4) — going nationwide
    // multiplies the feature count ~6x, so simplify harder to keep the shipped
    // asset a reasonable size; still plenty crisp at the widget sizes this map
    // renders at.
    maxAllowableOffset: "0.02", geometryPrecision: "4",
    resultOffset: String(offset), resultRecordCount: "1000", returnGeometry: "true",
  });
  const j = await (await fetch(
    "https://hydro.nationalmap.gov/arcgis/rest/services/wbd/MapServer/4/query?" + qs,
    { signal: AbortSignal.timeout(180000) }
  )).json();
  if (j.error) throw new Error(JSON.stringify(j.error));
  feats = feats.concat(j.features || []);
  console.log("HUC8 batch @", offset, "→ total", feats.length);
  if (!(j.features || []).length || !j.exceededTransferLimit) break;
  offset += j.features.length;
}
const proj = d3.geoAlbersUsa().scale(ALBERS.scale).translate(ALBERS.translate);
const round = (n) => Math.round(n * 100) / 100;
const projRing = (ring) => {
  const out = [];
  for (const pt of ring) { const p = proj(pt); if (p) out.push([round(p[0]), round(p[1])]); }
  return out.length >= 4 ? out : null;
};
const projected = [];
for (const f of feats) {
  const g = f.geometry; if (!g) continue;
  const polys = (g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [])
    .map((poly) => poly.map(projRing).filter(Boolean)).filter((p) => p.length);
  if (!polys.length) continue;
  projected.push({ type: "Feature", id: f.properties.huc8, properties: { name: f.properties.name },
    geometry: polys.length === 1 ? { type: "Polygon", coordinates: polys[0] } : { type: "MultiPolygon", coordinates: polys } });
}
const topo = topology({ huc8: { type: "FeatureCollection", features: projected } }, 1e4);
delete topo.bbox;
writeFileSync(path.join(OUT, "us-huc8-albers.json"), JSON.stringify(topo));
console.log("HUC8:", projected.length, "features →", JSON.stringify(topo).length, "bytes");
console.log("build-geo: DONE");
