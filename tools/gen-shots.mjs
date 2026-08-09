// tools/gen-shots.mjs — regenerate the marketing carousel screenshots from the REAL app.
//
// The public site (index.html) shows a hero carousel of genuine app screens; those
// must never go stale as the Studio evolves, so this script drives the actual app
// (and real dashboard exports built by Studio.buildHtml) in headless Chromium and
// captures every showcased view fresh. Run it whenever the marketing site or the
// showcased features change, and commit the results:
//
//   node tools/gen-shots.mjs                  every shot
//   node tools/gen-shots.mjs explore-dark     just the named one(s)
//
// Writes site/shots/*.png (2160×1350, 16:10 @1.5x). Resilient: a view that fails
// to capture is logged and skipped rather than aborting the run — the committed
// baseline PNG stays as a fallback.
//
// The name filter exists because a slice that fixes ONE shot should not churn the
// other fifteen: every capture is a fresh browser context over live rendering, so
// re-shooting an untouched view still produces a byte-different PNG, and a ~6 MB
// binary diff buries the one image the PR is actually about. Naming the shot keeps
// the diff reviewable (and the run short). A full pass is still the right thing when
// the app's chrome itself changes — that is what the no-argument form is for.
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

// `node tools/gen-shots.mjs explore-dark` shoots only what it names; no argument
// shoots everything. Skipped shots are silent — the committed PNG stands.
const ONLY = new Set(process.argv.slice(2).filter((a) => !a.startsWith("-")));
const want = (name) => !ONLY.size || ONLY.has(name);

// `prefs` seeds extra localStorage keys BEFORE first paint, for shots whose caption
// promises a view the app does not open in by default. Pinning beats clicking: the
// catalog then renders in the advertised shape from the first frame, and a later
// default change (AUD-06 flipped Dashboards from tiles to list) re-skins the app
// without silently re-shooting the marketing carousel to contradict its own caption.
async function bootBuilder(browser, { theme, palette, prefs }) {
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1.5 });
  const page = await ctx.newPage();
  await page.addInitScript((seed) => {
    try {
      sessionStorage.setItem("studio-gate-ok", "1");
      localStorage.setItem("studio-welcome-seen", "1");
      localStorage.setItem("studio-tutorial-done", "1");
      localStorage.setItem("studio-theme", seed.t);
      if (seed.p) localStorage.setItem("studio-app-theme", seed.p);
      Object.keys(seed.ls || {}).forEach((k) => localStorage.setItem(k, seed.ls[k]));
    } catch (e) {}
  }, { t: theme, p: palette || "", ls: prefs || {} });
  await page.goto(`http://localhost:${PORT}/app/`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__STUDIO_STATE && window.__STUDIO_STATE.assets.js.length > 0, { timeout: 15000 });
  await page.waitForTimeout(600);
  return { ctx, page };
}

// `__studioLoad()` loads a spec INTO the Dashboard Builder but does not navigate to it —
// the shell stays where it was, which on a cold boot is Home. Both builder shots had been
// capturing the Home screen ever since, under carousel copy naming "The Dashboard Builder
// … with the data and inspector panels" (measured 2026-08-09; the committed baseline has
// the same defect, so it predates the 2026-07-31 generation). Three things are needed for
// the picture to be what the caption says it is:
//   • ask the shell for the `studio` section by name, the way snapSection does;
//   • open both side panes — STUDIO-PANELS made the builder open with them COLLAPSED, so
//     the caption's "data and inspector panels" would be two 34px rails otherwise. The
//     tour's silent opener is used, for the same reason the tour uses it;
//   • declutter LAST. The lint pass fires its "All clear — this dashboard has zero
//     warnings" toast about two seconds in, so the old 1.4s-then-declutter order removed
//     nothing and shot the toast — it is in the committed baseline too.
//
// Opening the PANE is not the same as showing its contents, and the two builder shots
// landed on opposite sides of that (measured 2026-08-09). LF19 gives the Data panel's
// "This dashboard's datasets" group progressive disclosure: `libGroupOpen` collapses it
// by default once it holds more than LIB_GROUP_MANY (6) items, unless the reader has
// toggled it themselves, which it remembers in `studio-lib-mine-open`. `studio-cost`
// binds 6 data accesses and `finance-command` binds 9 — so the LIGHT shot renders its
// six dataset cards and the DARK one, the one the marketing carousel actually publishes,
// rendered a single collapsed header over ~1000px of empty panel, beneath a caption
// reading "Drag datasets onto the canvas". Same function, same code path, one threshold
// apart. Seeding that same key is the reader's-choice path the group already honours,
// not a new mechanism — and `datasetsShown` then holds the picture to it the way
// `framedSteps` holds the Quick Views shot: declare what the frame shows, the shooter
// measures it, and doc-truth check 33 reads the same number.
const MIN_CARD_PX = 24;
async function loadExample(page, file, { datasetsShown = 0 } = {}) {
  await page.evaluate(async (f) => {
    const spec = await fetch("data/examples/" + f).then((r) => r.json());
    window.__studioLoad(spec);
    if (window.__studioShellSetSection) window.__studioShellSetSection("studio");
    ["library", "inspector"].forEach((p) => { try { window.__studioOpenPane(p); } catch (e) {} });
    try { localStorage.setItem("studio-lib-mine-open", "1"); } catch (e) {}
    try { Studio.buildLibrary(); } catch (e) {}
  }, file);
  await page.waitForTimeout(2800); // preview iframe render + the lint toast both settle
  await page.evaluate(DECLUTTER);
  await page.waitForTimeout(160);
  if (datasetsShown) {
    const shown = await page.evaluate((minPx) => [].slice.call(
      document.querySelectorAll("#libList .lib-mine .da")).filter((c) => {
        const b = c.getBoundingClientRect();
        if (!b.width) return false; // the group is collapsed — the box has no layout at all
        return Math.min(b.bottom, window.innerHeight) - Math.max(b.top, 0) >= minPx;
      }).length, MIN_CARD_PX);
    if (shown !== datasetsShown)
      throw new Error(`datasetsShown: declared ${datasetsShown}, the Data panel actually shows ${shown} — ` +
        "re-measure and update BOTH this number and the copy beside the image (doc-truth check 33)");
  }
}

// Snap a real app SECTION (Home tiles, Explore designer, Datasets catalog…) in
// DARK, with the Conservation sample pack installed so the workspace looks
// populated — the marketing "survey the app" shots.
//
// `framedSteps` is for the sections that render a NUMBERED walk (Quick Views' 1 · Data
// → 4 · Result). The 1440×900 frame cannot hold all of them, so the copy printed beside
// the image may only name the ones it reaches — and "how many does it reach" is a
// measurement, not an opinion. Declaring the count here makes the shooter check it
// (a step counts as framed when at least MIN_STEP_PX of it is inside the viewport, so a
// header peeking over the bottom edge does not count), and doc-truth check 32 reads the
// same number to hold the caption and the alt text to it. Get it wrong in either
// direction and the shot fails here rather than shipping a caption the picture disproves.
const MIN_STEP_PX = 100;
async function snapSection(browser, name, { section, extraWait = 1500, prep = null, theme = "dark", palette = "", prefs = null, framedSteps = 0 } = {}) {
  if (!want(name)) return;
  const { ctx, page } = await bootBuilder(browser, { theme, palette, prefs });
  try {
    await page.evaluate(() => {
      try {
        if (window.Studio && Studio.installDemoPack && !Studio.demoPackInstalled("conservation")) Studio.installDemoPack("conservation");
      } catch (e) {}
    });
    await page.waitForTimeout(500);
    await page.evaluate((s) => { if (window.__studioShellSetSection) window.__studioShellSetSection(s); }, section);
    await page.waitForTimeout(500);
    if (prep) { await page.evaluate(prep); await page.waitForTimeout(300); }
    await page.waitForTimeout(extraWait);
    await page.evaluate(DECLUTTER);
    await page.waitForTimeout(200);
    if (framedSteps) {
      const framed = await page.evaluate((minPx) => [].slice.call(document.querySelectorAll(".xp-step")).map((s) => {
        const b = s.getBoundingClientRect();
        const shown = Math.min(b.bottom, window.innerHeight) - Math.max(b.top, 0);
        return { label: ((s.querySelector(".xp-step-h") || {}).textContent || "").trim().slice(0, 12), shown: Math.round(shown) };
      }).filter((s) => s.shown >= minPx).length, MIN_STEP_PX);
      if (framed !== framedSteps)
        throw new Error(`framedSteps: declared ${framedSteps}, the frame actually holds ${framed} — ` +
          "re-measure and update BOTH this number and the copy beside the image (doc-truth check 32)");
    }
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    done(name);
  } catch (e) { oops(name, e); }
  await ctx.close();
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

async function shootExport(browser, name, html, { theme = "light", waitSel = ".dk-grid svg", extraWait = 900, scrollY = 0 } = {}) {
  if (!want(name)) return;
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
    dashboardTheme: "polecat",
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
    dashboardTheme: "polecat",
    subtitle: "Bold line: the common estimate (median) · muted lines: provider evidence · squares: AgCensus reference",
    panels: [{ id: "c1", title: "Adoption trend, 2015–2025", span: "full",
      chart: { type: "ensembleSeries", da: "ts", map: { labelCol: "year", seriesCol: "provider", valueCol: "pct" },
        opts: { refSeries: "AgCensus", fmt: "raw", height: 660 } } }],
    kpis: [], filters: [],
    cda: { connections: [], dataAccesses: [{ id: "ts", kind: "sql", columns: ["year", "provider", "pct"] }] }
  };
}

// HUC8 watershed choropleth — the "hydrology, not administrative borders" story
// (USGS subbasins, not a standard state/county cut), rendered in Polecat dark.
// The subtitle is BURNED INTO the image the marketing carousel shows, so it is held
// to the same source as the caption beside it: `huc8` is a shipped choice in
// Studio.CHARTS.choropleth's `scale` select, so it may not be called a geography the
// reader supplies (that is the `customMap` opt). doc-truth check 31 enforces it.
function huc8Spec() {
  return {
    id: "shot-huc8", name: "shot-huc8", title: "Cover crop adoption by watershed",
    dashboardTheme: "polecat",
    subtitle: "HUC8 subbasins from the USGS Watershed Boundary Dataset — one of six built-in scales",
    panels: [{ id: "w1", title: "Adoption by watershed (HUC8)", span: "full",
      chart: { type: "choropleth", da: "geo", map: { idCol: "huc8", valueCol: "pct" },
        opts: { scale: "huc8", fmt: "raw", height: 640, color: "--good" } } }],
    kpis: [], filters: [],
    cda: { connections: [], dataAccesses: [{ id: "geo", kind: "sql", columns: ["huc8", "pct"] }] }
  };
}
function huc8Value(id) {
  const n = parseInt(id, 10) || 0;
  const wob = Math.sin(n * 0.013) * 9 + Math.sin(n * 0.0007 + 1) * 7 + ((n * 7919) % 17) * 0.5;
  return Math.max(3, Math.min(46, 24 + wob));
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
    // Everything below the light page either IS the `studio` shot or is an export BUILT
    // on that page, so the whole block is skipped when the name filter wants none of them.
    let mapHtml = null, ensHtml = null, flagshipHtml = null, showcaseHtml = null, huc8Html = null;
    const LIGHT_GROUP = ["studio", "map", "watershed", "ensemble", "dashboard-dark", "showcase"];
    if (LIGHT_GROUP.some(want)) {
      const light = await bootBuilder(browser, { theme: "light" });
      if (want("studio")) try {
        await loadExample(light.page, "studio-cost.studio.json", { datasetsShown: 6 });
        await light.page.screenshot({ path: path.join(OUT, "studio.png") });
        done("studio");
      } catch (e) { oops("studio", e); }

      // ---- exports are generated from the (already booted) light page ---------
      // 3: Corn Belt county choropleth — every county in 11 states gets a median value.
      if (want("map")) try {
        const fipsList = await light.page.evaluate(async (states) => {
          const topo = await fetch("vendor/geo/counties-albers-10m.json").then((r) => r.json());
          return topo.objects.counties.geometries.map((g) => String(g.id)).filter((id) => states.includes(id.slice(0, 2)));
        }, CORN_BELT_STATES);
        const rows = fipsList.map((f) => [f, +countyValue(f).toFixed(1)]);
        mapHtml = await buildExport(light.page, mapSpec(), { geo: { cols: ["fips", "pct"], rows } });
      } catch (e) { oops("map (build)", e); }

      // 3b: HUC8 watershed choropleth — a custom geography (USGS subbasins).
      if (want("watershed")) try {
        const hucList = await light.page.evaluate(async () => {
          const topo = await fetch("vendor/geo/us-huc8-albers.json").then((r) => r.json());
          return topo.objects.huc8.geometries.map((g) => String(g.id));
        });
        const rows = hucList.map((h) => [h, +huc8Value(h).toFixed(1)]);
        huc8Html = await buildExport(light.page, huc8Spec(), { geo: { cols: ["huc8", "pct"], rows } });
      } catch (e) { oops("watershed (build)", e); }

      // 4: the ensemble chart — five providers converging, AgCensus reference points.
      if (want("ensemble")) try {
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
      if (want("dashboard-dark") || want("showcase")) try {
        const flagship = await light.page.evaluate(async () => await fetch("data/examples/studio-cost.studio.json").then((r) => r.json()));
        flagship.dashboardTheme = "polecat"; // marketing shots wear the Polecat brand look, not Classic Blue
        flagshipHtml = await buildExport(light.page, flagship, null);
        const showcase = await light.page.evaluate(async () => await fetch("data/examples/marketing-growth.studio.json").then((r) => r.json()));
        showcase.dashboardTheme = "polecat";
        showcaseHtml = await buildExport(light.page, showcase, null);
      } catch (e) { oops("exports (build)", e); }
      await light.ctx.close();
    }

    if (want("studio-dark")) {
      const dark = await bootBuilder(browser, { theme: "dark" });
      try {
        // 9 bound, 8 framed: the ninth card sits below the 900px fold. The caption
        // beside this slide claims no count, so 8 satisfies it — but the number has to
        // be the measured one, not the spec's total (check 33 holds it to both).
        await loadExample(dark.page, "finance-command.studio.json", { datasetsShown: 8 });
        await dark.page.screenshot({ path: path.join(OUT, "studio-dark.png") });
        done("studio-dark");
      } catch (e) { oops("studio-dark", e); }
      await dark.ctx.close();
    }

    // Marketing carousel is Polecat-DARK forward: the finished dashboard leads,
    // the maps + special charts render dark, the builder trails. (Kevin, live.)
    if (flagshipHtml) await shootExport(browser, "dashboard-dark", flagshipHtml, { theme: "dark" });
    if (mapHtml) await shootExport(browser, "map", mapHtml, { theme: "dark", waitSel: "path[data-geo-id]", extraWait: 1400 });
    if (huc8Html) await shootExport(browser, "watershed", huc8Html, { theme: "dark", waitSel: "path[data-geo-id]", extraWait: 1400 });
    if (showcaseHtml) await shootExport(browser, "showcase", showcaseHtml, { theme: "dark" });
    if (ensHtml) await shootExport(browser, "ensemble", ensHtml, { theme: "dark", waitSel: '[data-ens="median"]' });

    // App-survey shots in dark, sample pack installed: Home tiles (featured
    // dashboards + widget analyses + examples), the Explore designer, and the
    // Datasets/Connections workspace.
    await snapSection(browser, "home-dark", { section: "home", extraWait: 1900 });
    // Quick Views: open a DATASET, which is the section's own front door ("Start from a
    // dataset, see it as a table, pick a chart…" is its intro line, and the caption beside
    // this image says the same). It used to load a saved VIEW instead, and that quietly
    // became the wrong picture: CONS-4 made every View the conservation pack seeds View
    // Builder-native, and `xpLoadAnalysis` answers a builder-made View with the VB-5
    // cross-editor banner — so the flagship Quick Views slide led with a notice saying
    // Quick Views "can't edit its shelves, filters, or calculated columns", 53px of the
    // editor's own limitation above everything the caption promises. There is no saved View
    // to prefer instead: the pack seeds four and all four are builder-native (measured), so
    // the fix is not a better pick, it is not picking a saved View at all. Opening a dataset
    // also gives the table real depth (500 rows, not a 3-row saved blob) and lets the app
    // guess the mapping, which is the walk the caption describes.
    await snapSection(browser, "explore-dark", { section: "explore", extraWait: 1800, framedSteps: 3, prep: () => {
      try {
        var rows = [].slice.call(document.querySelectorAll("button.xp-ds"));
        var pick = rows.filter(function (b) { return /County cover-crop adoption/i.test(b.textContent || ""); })[0] || rows[0];
        if (pick) pick.click();
      } catch (e) {}
    } });
    await snapSection(browser, "datasets-dark", { section: "datasets", extraWait: 1400 });
    // The Dashboards tile browser (LF27) — the "your library" survey shot, and the
    // carousel caption beside it promises "searchable tiles". AUD-06 made `list` the
    // one default for every catalog, so the tile grid has to be pinned here or the
    // shot quietly becomes a list under a caption that says tiles.
    // Materialize the Data Management pack's showcase dashboards + run the
    // pack heals first so the grid reads like a real library, not 4 tiles;
    // thumbnails render asynchronously, so give them room.
    await snapSection(browser, "dashboards-dark", { section: "dashboards", extraWait: 3400, prefs: { "studio-dash-view": "tiles" }, prep: () => {
      try { if (window.__studioEnsurePackExamplesMaterialized) window.__studioEnsurePackExamplesMaterialized("datamanagement"); } catch (e) {}
      try { if (window.Studio && Studio.Sync && Studio.Sync.healAfterAdopt) Studio.Sync.healAfterAdopt(); } catch (e) {}
    } });
    // The View Builder (the flagship drag-drop canvas): load a Builder-native
    // pack View so the shelves + live chart are populated, not the empty state.
    await snapSection(browser, "viewbuilder-dark", { section: "build", extraWait: 2200, prep: () => {
      try {
        var A = (window.Studio && Studio.Workspace) ? Studio.Workspace.all("analyses") : [];
        var pick = A.filter(function (a) { return a.builder && /no-?till|tillage|cover/i.test(a.name || ""); })[0] ||
                   A.filter(function (a) { return a.builder; })[0];
        if (pick && window.__studioBuild && __studioBuild.load) __studioBuild.load(pick.id);
      } catch (e) {}
    } });

    // Theme thumbnails — the SAME screen (Home) in four different app palettes,
    // so the marketing "Make it yours" section can show the chrome re-skinning
    // itself. Palettes picked for maximum visual spread: warm light, editorial
    // light, neon dark, conservation dark.
    await snapSection(browser, "theme-classic", { section: "home", extraWait: 1900, theme: "light", palette: "classic" });
    await snapSection(browser, "theme-editorial", { section: "home", extraWait: 1900, theme: "light", palette: "editorial" });
    await snapSection(browser, "theme-neon", { section: "home", extraWait: 1900, theme: "dark", palette: "neon" });
    await snapSection(browser, "theme-conservation", { section: "home", extraWait: 1900, theme: "dark", palette: "conservation" });

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
