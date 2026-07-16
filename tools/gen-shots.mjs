// tools/gen-shots.mjs — regenerate the marketing carousel screenshots from the REAL app.
//
// The public site (index.html) shows a hero carousel of genuine app screens; those
// must never go stale as the Studio evolves, so this script drives the actual app
// (and real dashboard exports built by Studio.buildHtml) in headless Chromium and
// captures every showcased view fresh. Run it whenever the marketing site or the
// showcased features change, and commit the results:
//
//   node tools/gen-shots.mjs
//
// Writes site/shots/*.png (2160×1350, 16:10 @1.5x). Resilient: a view that fails
// to capture is logged and skipped rather than aborting the run — the committed
// baseline PNG stays as a fallback.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

// Playwright lives in the GLOBAL npm root here (same install the test suite uses);
// ESM ignores NODE_PATH, so resolve it explicitly.
const require = createRequire(path.join(execSync("npm root -g").toString().trim(), "x.js"));
const { chromium } = require("playwright");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "site", "shots");
const PORT = 4310;
const VIEWPORT = { width: 1440, height: 900 }; // 16:10 — matches the carousel frame
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/json" };

// Dashboard exports are generated inside the app page (they need Studio + assets),
// handed back to Node, and served from memory here so a fresh page can load them
// full-bleed exactly as a recipient of the .html file would see them.
const dynamic = new Map();

function serve() {
  return new Promise((res) => {
    const srv = http.createServer((req, rep) => {
      let p = decodeURIComponent(req.url.split("?")[0]);
      if (dynamic.has(p)) { rep.writeHead(200, { "Content-Type": "text/html" }); return rep.end(dynamic.get(p)); }
      if (p === "/") p = "/index.html";
      let fp = path.join(ROOT, p);
      if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, "index.html");
      if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { rep.writeHead(404); return rep.end("404"); }
      rep.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "application/octet-stream" });
      fs.createReadStream(fp).pipe(rep);
    });
    srv.listen(PORT, () => res(srv));
  });
}

// Remove transient chrome so screenshots show the clean app: toasts, tour popovers.
const DECLUTTER = `document.querySelectorAll('#toasts .toast,.tour-pop,.tour-back,.confetti-root').forEach(e=>e.remove());`;

let ok = 0, fail = 0;
const done = (name) => { console.log("  ✓", name); ok++; };
const oops = (name, e) => { console.log("  ✗", name, "—", (e && e.message) || e); fail++; };

async function bootBuilder(browser, { theme }) {
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1.5 });
  const page = await ctx.newPage();
  await page.addInitScript((t) => {
    try {
      sessionStorage.setItem("studio-gate-ok", "1");
      localStorage.setItem("studio-welcome-seen", "1");
      localStorage.setItem("studio-theme", t);
    } catch (e) {}
  }, theme);
  await page.goto(`http://localhost:${PORT}/app/`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__STUDIO_STATE && window.__STUDIO_STATE.assets.js.length > 0, { timeout: 15000 });
  await page.waitForTimeout(600);
  return { ctx, page };
}

async function loadExample(page, file) {
  await page.evaluate(async (f) => {
    const spec = await fetch("data/examples/" + f).then((r) => r.json());
    window.__studioLoad(spec);
  }, file);
  await page.waitForTimeout(1400); // preview iframe render settles
  await page.evaluate(DECLUTTER);
  await page.waitForTimeout(120);
}

// Build a dashboard export INSIDE the app page (real Studio.buildHtml + real geo
// assets) with the given spec + mock rows, and return the standalone html string.
async function buildExport(page, spec, mock) {
  return await page.evaluate(async (args) => {
    await window.__studioEnsureGeoAssets(args.spec);
    const m = args.mock || Studio.genMock(args.spec);
    return Studio.buildHtml(args.spec, window.__STUDIO_STATE.assets, { preview: true, mock: m });
  }, { spec, mock });
}

async function shootExport(browser, name, html, { theme = "light", waitSel = ".pdc-grid svg", extraWait = 900, scrollY = 0 } = {}) {
  const route = `/__shot/${name}.html`;
  dynamic.set(route, html);
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1.5 });
  const page = await ctx.newPage();
  try {
    await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: "networkidle" });
    if (theme === "dark") await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    await page.waitForSelector(waitSel, { timeout: 20000 });
    await page.waitForTimeout(extraWait);
    if (scrollY) { await page.evaluate((y) => window.scrollTo(0, y), scrollY); await page.waitForTimeout(250); }
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    done(name);
  } catch (e) { oops(name, e); }
  await ctx.close();
}

// ---- the Viridis-style specs (synthetic, deterministic data) ----------------

// Corn Belt county FIPS come from the vendored topology (fetched in-page).
const CORN_BELT_STATES = ["17", "18", "19", "20", "26", "27", "29", "31", "39", "46", "55"];

function mapSpec() {
  return {
    id: "shot-map", name: "shot-map", title: "Cover crop adoption — common estimate, 2025",
    subtitle: "Median of five provider estimates · percent of cropland acres",
    panels: [{ id: "m1", title: "Adoption by county", span: "full",
      chart: { type: "choropleth", da: "geo", map: { idCol: "fips", valueCol: "pct" },
        opts: { scale: "county", fmt: "raw", height: 640, color: "--good" } } }],
    kpis: [], filters: [],
    cda: { connections: [], dataAccesses: [{ id: "geo", kind: "sql", columns: ["fips", "pct"] }] }
  };
}

function ensembleSpec() {
  return {
    id: "shot-ens", name: "shot-ens", title: "Conservation tillage — one estimate from five sources",
    subtitle: "Bold line: the common estimate (median) · muted lines: provider evidence · squares: AgCensus reference",
    panels: [{ id: "c1", title: "Adoption trend, 2015–2025", span: "full",
      chart: { type: "ensembleSeries", da: "ts", map: { labelCol: "year", seriesCol: "provider", valueCol: "pct" },
        opts: { refSeries: "AgCensus", fmt: "raw", height: 660 } } }],
    kpis: [], filters: [],
    cda: { connections: [], dataAccesses: [{ id: "ts", kind: "sql", columns: ["year", "provider", "pct"] }] }
  };
}

// Deterministic smooth-ish value per county so the map reads as real geography
// (a north-west→south-east adoption gradient plus per-county texture).
function countyValue(fips) {
  const s = parseInt(fips.slice(0, 2), 10), c = parseInt(fips.slice(2), 10);
  const base = { 17: 24, 18: 22, 19: 30, 20: 14, 26: 18, 27: 26, 29: 15, 31: 18, 39: 20, 46: 21, 55: 23 }[s] || 18;
  const wob = Math.sin(c * 0.37) * 6 + Math.sin(c * 0.11 + s) * 4 + ((c * 7919) % 13) * 0.6;
  return Math.max(2, Math.min(48, base + wob));
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve();
  const exePath = process.env.PW_CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  const launchOpts = { headless: true };
  if (fs.existsSync(exePath)) launchOpts.executablePath = exePath;
  const browser = await chromium.launch(launchOpts);

  try {
    // ---- 1+2: the builder, light (flagship) and dark (chart showcase) -------
    const light = await bootBuilder(browser, { theme: "light" });
    try {
      await loadExample(light.page, "studio-cost.studio.json");
      await light.page.screenshot({ path: path.join(OUT, "studio.png") });
      done("studio");
    } catch (e) { oops("studio", e); }

    // ---- exports are generated from the (already booted) light page ---------
    // 3: Corn Belt county choropleth — every county in 11 states gets a median value.
    let mapHtml = null, ensHtml = null, flagshipHtml = null, showcaseHtml = null;
    try {
      const fipsList = await light.page.evaluate(async (states) => {
        const topo = await fetch("vendor/geo/counties-albers-10m.json").then((r) => r.json());
        return topo.objects.counties.geometries.map((g) => String(g.id)).filter((id) => states.includes(id.slice(0, 2)));
      }, CORN_BELT_STATES);
      const rows = fipsList.map((f) => [f, +countyValue(f).toFixed(1)]);
      mapHtml = await buildExport(light.page, mapSpec(), { geo: { cols: ["fips", "pct"], rows } });
    } catch (e) { oops("map (build)", e); }

    // 4: the ensemble chart — five providers converging, AgCensus reference points.
    try {
      const providers = ["DTN", "Indigo", "Iowa State", "Regrow", "Terra"];
      const years = ["2015", "2016", "2017", "2018", "2019", "2020", "2021", "2022", "2023", "2024", "2025"];
      const rows = [];
      providers.forEach((pr, pi) => years.forEach((y, yi) => {
        const spread = 3.2 * (1 - yi / (years.length + 3)); // sources agree more over time
        rows.push([y, pr, +(11 + yi * 1.5 + Math.sin(pi * 2.3 + yi * 0.8) * spread).toFixed(2)]);
      }));
      rows.push(["2017", "AgCensus", 14.6]);
      rows.push(["2022", "AgCensus", 22.1]);
      ensHtml = await buildExport(light.page, ensembleSpec(), { ts: { cols: ["year", "provider", "pct"], rows } });
    } catch (e) { oops("ensemble (build)", e); }

    // 5+6: two bundled example dashboards as full-bleed exports.
    try {
      const flagship = await light.page.evaluate(async () => await fetch("data/examples/studio-cost.studio.json").then((r) => r.json()));
      flagshipHtml = await buildExport(light.page, flagship, null);
      const showcase = await light.page.evaluate(async () => await fetch("data/examples/marketing-growth.studio.json").then((r) => r.json()));
      showcaseHtml = await buildExport(light.page, showcase, null);
    } catch (e) { oops("exports (build)", e); }
    await light.ctx.close();

    const dark = await bootBuilder(browser, { theme: "dark" });
    try {
      await loadExample(dark.page, "finance-command.studio.json");
      await dark.page.screenshot({ path: path.join(OUT, "studio-dark.png") });
      done("studio-dark");
    } catch (e) { oops("studio-dark", e); }
    await dark.ctx.close();

    if (mapHtml) await shootExport(browser, "map", mapHtml, { waitSel: "path[data-geo-id]", extraWait: 1400 });
    if (ensHtml) await shootExport(browser, "ensemble", ensHtml, { waitSel: '[data-ens="median"]' });
    if (flagshipHtml) await shootExport(browser, "dashboard-dark", flagshipHtml, { theme: "dark" });
    if (showcaseHtml) await shootExport(browser, "showcase", showcaseHtml, {});

    console.log(`\ngen-shots: ${ok} captured, ${fail} failed → site/shots/`);
    process.exitCode = fail && !ok ? 1 : 0;
  } catch (e) {
    console.error("gen-shots: fatal —", e.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
    srv.close();
  }
})();
