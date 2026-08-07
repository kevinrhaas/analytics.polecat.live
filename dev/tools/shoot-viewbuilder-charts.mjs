/* Analytics Dashboard Studio — © 2026 Polecat.live. See LICENSE. */
// tools/shoot-viewbuilder-charts.mjs — hero shots of the VIEW BUILDER rendering
// real charts (not the plain table): a dense county Map (choropleth), a Donut,
// and a Treemap. The map + donut are captured as the full View Builder UI
// (shelves + live chart) so they drop straight into a "no-code pivot & chart"
// slide; the treemap is not a View Builder chart type, so it's rendered as a
// clean standalone dashboard export (buildHtml) instead.
//
//   node tools/shoot-viewbuilder-charts.mjs [--out <dir>]
//
// Writes <out>/NN-*.png (1440×900 @1.5x for the builder UI). Also overwrites
// the app-tour's 04-view-builder.png with the Map hero so the tour's builder
// shot matches. Every PNG carries the capture-session timestamp in tEXt.
// Default out dir: docs/shots/view-builder/<date>/.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

const require = createRequire(path.join(execSync("npm root -g").toString().trim(), "x.js"));
const { chromium } = require("playwright");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SESSION_ISO = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const DATE_DIR = SESSION_ISO.slice(0, 10);
const argOut = (() => { const i = process.argv.indexOf("--out"); return i > 0 ? process.argv[i + 1] : null; })();
const OUT = path.resolve(ROOT, argOut || path.join("docs", "shots", "view-builder", DATE_DIR));
const TOUR_HERO = path.join(ROOT, "docs", "shots", "app-tour", DATE_DIR, "desktop", "04-view-builder.png");
const PORT = 4313;
const VIEWPORT = { width: 1440, height: 900 };
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/json" };

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

const asciiSafe = (s) => String(s).replace(/[–—]/g, "--").replace(/·/g, "*").replace(/[^\x20-\x7e]/g, "?");
function pngChunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0); body.copy(out, 4);
  out.writeUInt32BE(zlib.crc32(body) >>> 0, body.length + 4);
  return out;
}
function stampPng(file, fields) {
  const buf = fs.readFileSync(file);
  let off = 8, iend = -1;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    if (buf.toString("latin1", off + 4, off + 8) === "IEND") { iend = off; break; }
    off += 12 + len;
  }
  if (iend < 0) return;
  const chunks = Object.entries(fields).map(([k, v]) =>
    pngChunk("tEXt", Buffer.concat([Buffer.from(k, "latin1"), Buffer.from([0]), Buffer.from(asciiSafe(v), "latin1")])));
  fs.writeFileSync(file, Buffer.concat([buf.subarray(0, iend), ...chunks, buf.subarray(iend)]));
}
function stamp(file, label) {
  stampPng(file, { "Creation Time": SESSION_ISO, Software: "analytics.polecat.live tools/shoot-viewbuilder-charts.mjs",
    Comment: `View Builder chart capture session ${SESSION_ISO} -- ${label}` });
}

const manifest = [];
let ok = 0, fail = 0;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve();
  const exePath = process.env.PW_CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  const launchOpts = { headless: true };
  if (fs.existsSync(exePath)) launchOpts.executablePath = exePath;
  const browser = await chromium.launch(launchOpts);

  try {
    const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1.5 });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      try {
        sessionStorage.setItem("studio-gate-ok", "1");
        localStorage.setItem("studio-welcome-seen", "1");
        localStorage.setItem("studio-theme", "dark");        // dark builder — matches the deck
        localStorage.setItem("studio-shell-expanded", "1");
      } catch (e) {}
    });
    await page.goto(`http://localhost:${PORT}/app/`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.__STUDIO_STATE && window.__STUDIO_STATE.assets.js.length > 0, { timeout: 20000 });
    await page.evaluate(async () => {
      for (const id of Object.keys(Studio.DEMO_PACKS)) { if (!Studio.demoPackInstalled(id)) Studio.installDemoPack(id); }
    });
    await page.evaluate(() => window.__studioShellSetSection("build"));
    await page.waitForTimeout(500);

    // Stage one chart in the View Builder: select a sample dataAccess, set the
    // shelves + chart type exactly the way bdDropFile does, render, wait.
    async function stageBuilder({ stem, da, cols, chartType, geo }) {
      await page.evaluate(async (args) => {
        await window.__studioBuild.selectDataset("sample", args.stem + "\u0001" + args.da);
        const B = window.__studioBuild;
        B.state.shelfRows = [];
        B.state.shelfCols = args.cols.map((c) => ({ col: c.col, agg: c.agg }));
        B.state.shelfColor = [];
        B.state.mapScale = "";
        B.state.chartType = args.chartType;
        B.rerender();
      }, { stem, da, cols, chartType });
      // The builder renders the chart INSIDE iframe.bd-ifr (srcdoc buildHtml),
      // so wait for the chart within the frame — choropleths also fetch geo
      // topology async before they paint.
      await page.waitForSelector("#secBuild iframe.bd-ifr", { timeout: 15000 }).catch(() => {});
      const chartSel = geo ? "path[data-geo-id]" : ".dk-grid svg";
      const charted = await page.frameLocator("#secBuild iframe.bd-ifr").locator(chartSel).first()
        .waitFor({ state: "visible", timeout: 15000 }).then(() => true).catch(() => false);
      await page.waitForTimeout(geo ? 1400 : 800);
      const st = await page.evaluate(() => {
        const wrap = document.querySelector("#secBuild .bd-wrap");
        return { cta: !!(wrap && wrap.querySelector(".bd-cta")),
          activeCt: (wrap && wrap.querySelector(".bd-ct.on") || {}).textContent || null };
      });
      st.charted = charted;
      return st;
    }
    async function snapBuilder(name, title, note) {
      await page.evaluate(() => {
        document.querySelectorAll("#toasts .toast").forEach((e) => e.remove());
        // the builder's file-drop overlay sits over the preview — hide it so the chart is clean
        document.querySelectorAll(".bd-drop-ov").forEach((e) => { e.hidden = true; e.style.display = "none"; });
        document.querySelectorAll(".dragover").forEach((e) => e.classList.remove("dragover"));
      });
      await page.waitForTimeout(150);
      const abs = path.join(OUT, name);
      await page.screenshot({ path: abs });
      stamp(abs, title);
      manifest.push({ file: name, title, note });
      console.log("  ✓", name);
      ok++;
      return abs;
    }

    // ---- 1) MAP: a dense county choropleth (144 Corn Belt counties) ----------
    const mapState = await stageBuilder({ stem: "field-and-geo", da: "county_cover_crop_pct",
      cols: [{ col: "county_fips", agg: null }, { col: "pct", agg: "avg" }], chartType: "choropleth", geo: true });
    if (mapState.charted && !mapState.cta) {
      const abs = await snapBuilder("01-view-builder-map.png", "View Builder — county Map (choropleth)",
        "cover-crop % by county, avg across providers; Map chart type, dense 144-county render");
      // upgrade the tour's builder hero to this map, if the tour folder exists
      try { if (fs.existsSync(path.dirname(TOUR_HERO))) { fs.copyFileSync(abs, TOUR_HERO); stamp(TOUR_HERO, "app-tour hero — View Builder Map"); console.log("  ↳ updated app-tour 04-view-builder.png"); } } catch (e) {}
    } else { fail++; console.log("  ✗ map — cta:", mapState.cta, "svg:", mapState.svg); }

    // ---- 2) DONUT: assets by source -----------------------------------------
    const donutState = await stageBuilder({ stem: "command-center", da: "storage_by_source",
      cols: [{ col: "src", agg: null }, { col: "assets", agg: "sum" }], chartType: "donut" });
    if (donutState.charted && !donutState.cta) await snapBuilder("02-view-builder-donut.png", "View Builder — Donut",
      "assets by source; Donut chart type");
    else { fail++; console.log("  ✗ donut — cta:", donutState.cta, "svg:", donutState.svg); }

    // ---- 3) TREEMAP: try the builder; fall back to a standalone export -------
    const treeState = await stageBuilder({ stem: "command-center", da: "storage_by_source",
      cols: [{ col: "src", agg: null }, { col: "assets", agg: "sum" }], chartType: "treemap" });
    if (treeState.charted && !treeState.cta && treeState.activeCt) {
      await snapBuilder("03-view-builder-treemap.png", "View Builder — Treemap", "assets by source; Treemap");
    } else {
      console.log("  – treemap not a View Builder chart type (cta:", treeState.cta, "activeCt:", treeState.activeCt, ") — rendering standalone export");
      const spec = {
        id: "vb-treemap", name: "vb-treemap", title: "Assets by source", dashboardTheme: "polecat",
        subtitle: "A treemap — the same shelves, a dashboard chart type",
        panels: [{ id: "t1", title: "Assets by source", span: "full",
          chart: { type: "treemap", da: "d", map: { labelCol: "src", valueCol: "assets" }, opts: { height: 720 } } }],
        kpis: [], filters: [], cda: { connections: [], dataAccesses: [{ id: "d", kind: "sql", columns: ["src", "assets"] }] }
      };
      const html = await page.evaluate(async (sp) => {
        const mock = Studio.genMock(sp);
        return Studio.buildHtml(sp, window.__STUDIO_STATE.assets, { preview: true, mock, launcher: false });
      }, spec);
      dynamic.set("/__vb/treemap.html", html);
      const tctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1.5 });
      const tp = await tctx.newPage();
      await tp.goto(`http://localhost:${PORT}/__vb/treemap.html`, { waitUntil: "networkidle" });
      await tp.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
      await tp.waitForSelector(".dk-grid svg", { timeout: 15000 }).catch(() => {});
      await tp.waitForTimeout(900);
      const abs = path.join(OUT, "03-treemap-standalone.png");
      await tp.screenshot({ path: abs, fullPage: true });
      stamp(abs, "Treemap (standalone dashboard export — not a View Builder chart type)");
      manifest.push({ file: "03-treemap-standalone.png", title: "Treemap (standalone export)",
        note: "treemap is a DASHBOARD chart type, not a View Builder one — rendered via buildHtml" });
      console.log("  ✓ 03-treemap-standalone.png");
      ok++;
      await tctx.close();
    }
    await ctx.close();

    // ---- manifests ----------------------------------------------------------
    let sha = "unknown";
    try { sha = execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim(); } catch (e) {}
    const lines = [
      `# View Builder chart hero shots — image session ${SESSION_ISO}`, "",
      "The View Builder rendering real charts instead of the plain table, for the",
      "\"pivot & crosstab, no code\" slide. Captured by `node tools/shoot-viewbuilder-charts.mjs`.", "",
      `- **Image session ran:** ${SESSION_ISO} (also in each PNG's tEXt metadata)`,
      `- **App commit at capture:** ${sha}`,
      "- **Map** and **Donut** are native View Builder chart types (full builder UI shown).",
      "- **Treemap** is a dashboard chart type, not a View Builder one; it's rendered as a clean standalone export.",
      "", "| Screenshot | Chart | Notes |", "|---|---|---|",
      ...manifest.map((m) => `| [\`${m.file}\`](${m.file}) | ${m.title} | ${m.note} |`), ""
    ];
    fs.writeFileSync(path.join(OUT, "README.md"), lines.join("\n"));
    fs.writeFileSync(path.join(OUT, "session.json"), JSON.stringify({
      session: SESSION_ISO, commit: sha, tool: "tools/shoot-viewbuilder-charts.mjs", viewport: VIEWPORT, shots: manifest
    }, null, 2) + "\n");

    console.log(`\nshoot-viewbuilder-charts: ${ok} captured, ${fail} failed → ${path.relative(ROOT, OUT)}/`);
    process.exitCode = fail && !ok ? 1 : 0;
  } catch (e) {
    console.error("shoot-viewbuilder-charts: fatal —", e.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
    srv.close();
  }
})();
