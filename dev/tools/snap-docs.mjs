/* tools/snap-docs.mjs — LIVE-e part 3: captures the real-app screenshots that fill
   docs/index.html's hidden .fig-slot placeholders (the IMAGE-SLOT comments describe
   each wanted shot). Deterministic: serves the repo statically, boots the app in
   headless Chromium with a seeded workspace (a few Views + foldered objects), stages
   each surface via the same window.__studio* hooks the test suite drives, and clips
   region screenshots into docs/img/*.png at 2x for crisp rendering.
   Run:  node tools/snap-docs.mjs           (from the repo root; global playwright)
   Re-run any time the UI changes materially — the captures are checked in. */
"use strict";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

// ESM ignores NODE_PATH — resolve the global playwright install explicitly
// (same global-install convention the test suite documents).
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.NODE_PATH ? path.join(process.env.NODE_PATH, "playwright") : "playwright");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "docs", "img");
const PORT = 8033;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };

function serve() {
  return new Promise((res) => {
    const srv = http.createServer((req, rep) => {
      let p = decodeURIComponent(req.url.split("?")[0]); if (p === "/") p = "/index.html";
      if (p === "/favicon.ico") { rep.writeHead(204); return rep.end(); }
      let fp = path.join(ROOT, p);
      if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, "index.html");
      fs.readFile(fp, (err, data) => {
        if (err) { rep.writeHead(404); return rep.end("nf"); }
        rep.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "application/octet-stream" });
        rep.end(data);
      });
    });
    srv.listen(PORT, () => res(srv));
  });
}

// Clip a padded region screenshot of one element into docs/img/<name>.png.
async function snapEl(page, selector, name, pad = 10, maxH = 0) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error("no box for " + selector + " (" + name + ")");
  const vp = page.viewportSize();
  const clip = {
    x: Math.max(0, box.x - pad),
    y: Math.max(0, box.y - pad),
    width: Math.min(vp.width - Math.max(0, box.x - pad), box.width + pad * 2),
    height: Math.min(vp.height - Math.max(0, box.y - pad), (maxH || box.height) + pad * 2),
  };
  await page.screenshot({ path: path.join(OUT, name + ".png"), clip });
  console.log("  ✓ " + name + ".png  (" + Math.round(clip.width) + "×" + Math.round(clip.height) + ")");
}

const srv = await serve();
fs.mkdirSync(OUT, { recursive: true });
const exePath = process.env.PW_EXECUTABLE || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const launchOpts = { headless: true };
if (fs.existsSync(exePath)) launchOpts.executablePath = exePath;
const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => { console.error("PAGEERROR: " + e); process.exitCode = 1; });
await page.addInitScript(() => {
  sessionStorage.setItem("studio-gate-ok", "1");
  localStorage.setItem("studio-welcome-seen", "1");
  localStorage.setItem("studio-shell-expanded", "1"); // rail open with labels — the shot the doc describes
});
await page.goto(`http://localhost:${PORT}/app/`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);

// Seed a small, tidy workspace so catalogs read as lived-in, not empty.
await page.evaluate(() => {
  const W = window.Studio.Workspace;
  const conn = W.put("connections", { name: "Warehouse (Postgres)", adapter: "postgrest", cfg: {}, folder: "Finance" });
  W.put("datasets", { name: "Quarterly revenue", kind: "sql", sql: "select region, quarter, revenue from finance.rev", connectionId: conn.id, columns: ["region", "quarter", "revenue"], folder: "Finance/2024" });
  W.put("datasets", { name: "Field acres by county", kind: "sql", sql: "select county_fips, acres from ops.fields", connectionId: conn.id, columns: ["county_fips", "acres"], folder: "Operations" });
  W.put("jobs", { name: "Nightly revenue rollup", steps: [{ kind: "aggregate" }, { kind: "rename" }], folder: "Finance" });
  W.put("analyses", { name: "Revenue by region", chartType: "bars", folder: "Finance", da: { id: "rev_region", columns: ["region", "revenue"] }, chart: { type: "bars", map: { labelCol: "region", valueCol: "revenue" }, opts: {} }, pinned: true, pinnedAt: new Date().toISOString() });
  W.put("analyses", { name: "Adoption trend", chartType: "line", folder: "Conservation", da: { id: "adoption", columns: ["year", "pct"] }, chart: { type: "line", map: { labelCol: "year", series: [{ col: "pct" }] }, opts: {} } });
  W.put("analyses", { name: "Practice share", chartType: "donut", da: { id: "share", columns: ["practice", "acres"] }, chart: { type: "donut", map: { labelCol: "practice", valueCol: "acres" }, opts: {} } });
});
await page.waitForTimeout(400);

// 1 + 2 + 3 — Home: the rail, the top bar, and the quick-action cards
await page.evaluate(() => { window.__studioShellSetSection("home"); window.__studioRenderHome(); });
await page.waitForTimeout(600);
await snapEl(page, "#railNav", "rail", 6);
await snapEl(page, "#topbar", "topbar", 6);
await page.evaluate(() => {
  const c = document.querySelector('.home-card[data-home="quickimport"]');
  if (c) c.classList.add("dragover"); // show the drop-target affordance in the shot
});
await snapEl(page, ".home-quick", "quickimport", 10);
await page.evaluate(() => {
  const c = document.querySelector('.home-card[data-home="quickimport"]');
  if (c) c.classList.remove("dragover");
});

// 4 — View Builder: sample dataset selected, a field on Rows + Columns, crosstab live
await page.evaluate(() => window.__studioShellSetSection("build"));
await page.waitForTimeout(300);
await page.evaluate(async () => {
  window.__studioRenderBuild();
  await new Promise((r) => setTimeout(r, 100));
  // a clean sample-catalog dataset (no live-run error badge in the shot)
  const cat = window.__STUDIO_STATE.catalog || {};
  const stems = Object.keys(cat).sort();
  for (const stem of stems) {
    const da = (cat[stem].dataAccesses || []).filter((d) => (d.columns || []).length >= 3 && !/^kpi/i.test(d.id))[0];
    if (da) { await window.__studioBuild.selectDataset("sample", stem + "\u0001" + da.id); return; }
  }
  const first = document.querySelector("#buildOutline [data-bd-ds]");
  if (first) first.click();
});
await page.waitForTimeout(900);
await page.evaluate(async () => {
  const B = window.__studioBuild;
  const cols = B.eff() ? B.eff().cols : [];
  // one dimension to Rows, one to Columns, first numeric-ish to Columns as a measure
  const dims = cols.filter((c) => B.state.run && true);
  if (cols.length >= 2) {
    B.addField(cols[0], "rows");
    B.addField(cols[1], "cols");
  }
  for (const c of cols.slice(2)) {
    B.addField(c, "cols");
    if (B.state.shelfCols.some((f) => f.agg)) break;
  }
  B.rerender();
});
await page.waitForTimeout(500);
await snapEl(page, "#secBuild .bd-wrap", "viewbuilder", 8);

// 5 — Dashboard Builder: a dashboard built from the seeded Views, with the
// Dashboard theme field scrolled into view in the inspector
const openedDash = await page.evaluate(async () => {
  const rows = window.Studio.Workspace.all("analyses").filter((a) => !a.builder);
  if (!rows.length) return false;
  window.Studio.Explore.addToNewDashboard(rows[0].id); // blank dashboard + first View
  await new Promise((r) => setTimeout(r, 200));
  if (rows[1]) window.Studio.Explore.addToSpec(rows[1].id);
  if (rows[2]) window.Studio.Explore.addToSpec(rows[2].id);
  return true;
});
if (openedDash) {
  await page.waitForTimeout(2500); // let the preview render fully
  await page.evaluate(() => {
    // the add selected the new panel — hop to the Dashboard-level inspector
    const crumbs = [].slice.call(document.querySelectorAll("#inspector button, #inspector a"));
    const dash = crumbs.filter((b) => (b.textContent || "").trim() === "Dashboard")[0];
    if (dash) dash.click();
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const labels = [].slice.call(document.querySelectorAll("#inspector label, #inspector .field > span, #inspector span"));
    const dt = labels.filter((l) => /^Dashboard theme$/.test((l.textContent || "").trim()))[0];
    if (dt) dt.scrollIntoView({ block: "center" });
  });
  await page.waitForTimeout(300);
  await snapEl(page, "#appBody", "dashtheme", 0);
} else {
  console.log("  – dashtheme.png skipped (no dashboards materialized)");
}

// 6 — Views catalog (list mode, chart-type icons + folder badges)
await page.evaluate(() => {
  try { localStorage.setItem("studio-vwc-view", "list"); } catch (e) {}
  window.__studioShellSetSection("views");
  window.__studioRenderViews();
});
await page.waitForTimeout(500);
await page.hover("#viewsResults .cx-row");
await page.waitForTimeout(200);
await snapEl(page, "#secViews .repo-wrap", "views", 8, 560);

// 7 — Repository: kind chips + the nested folder tree
await page.evaluate(() => { window.__studioShellSetSection("repository"); });
await page.waitForTimeout(600);
await snapEl(page, "#secRepository .repo-wrap", "repository", 8, 620);

// 8 — Settings: the Color theme picker cards
await page.evaluate(() => { window.__studioShellSetSection("settings"); });
await page.waitForTimeout(500);
await page.evaluate(() => {
  const cards = document.getElementById("appThemeCards");
  if (cards) cards.scrollIntoView({ block: "center" });
});
await page.waitForTimeout(300);
await page.evaluate(() => {
  const cards = document.getElementById("appThemeCards");
  const row = cards && cards.closest(".set-row");
  if (row) row.setAttribute("data-snap-target", "1");
  else if (cards) cards.setAttribute("data-snap-target", "1");
});
await snapEl(page, "[data-snap-target]", "colortheme", 14);

await browser.close();
srv.close();
console.log("done → docs/img/");
