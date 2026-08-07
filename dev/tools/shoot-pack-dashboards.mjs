/* Analytics Dashboard Studio — © 2026 Polecat.live. See LICENSE. */
// tools/shoot-pack-dashboards.mjs — capture EVERY dashboard in EVERY sample pack.
//
// Reference shots of the full pack catalog (Conservation Insight's seeded trio +
// its gallery examples, and the Data Management & Governance showcase set),
// rendered exactly the way the app itself renders a dashboard: the workspace row's
// spec through ensureGeoAssets + Build.ensureSpecMocks (real rows for builder-blob
// DAs) + genMock, then Studio.buildHtml — the same recipe Home's live tiles use.
//
//   node tools/shoot-pack-dashboards.mjs [--out <dir>]
//
// Writes <out>/<packId>/NN-<slug>.png (1440px wide, full-page, light theme),
// plus README.md + session.json manifests. Every PNG carries the capture-session
// timestamp in its tEXt metadata, so a file stays traceable even when it is
// copied out of its dated folder. Default out dir: docs/shots/sample-packs/<date>/.
// Resilient like gen-shots.mjs: a dashboard that fails to capture is logged and
// skipped rather than aborting the run.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

// Playwright lives in the GLOBAL npm root here (same install the test suite uses);
// ESM ignores NODE_PATH, so resolve it explicitly.
const require = createRequire(path.join(execSync("npm root -g").toString().trim(), "x.js"));
const { chromium } = require("playwright");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SESSION = new Date(); // one timestamp marks the whole image session
const SESSION_ISO = SESSION.toISOString().replace(/\.\d{3}Z$/, "Z");
const DATE_DIR = SESSION_ISO.slice(0, 10);
const argOut = (() => { const i = process.argv.indexOf("--out"); return i > 0 ? process.argv[i + 1] : null; })();
const OUT = path.resolve(ROOT, argOut || path.join("docs", "shots", "sample-packs", DATE_DIR));
const PORT = 4311; // gen-shots.mjs holds 4310
const VIEWPORT = { width: 1440, height: 900 };
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/json" };

// Export pages are generated inside the app page and served from memory so a
// fresh page can load them full-bleed, exactly as a recipient would see them.
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

// ---- PNG tEXt stamping -------------------------------------------------------
// Insert tEXt chunks (Creation Time + Comment) before IEND so each screenshot
// self-documents when the image session ran. Latin-1 payloads only, per spec.
function pngChunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(zlib.crc32(body) >>> 0, body.length + 4);
  return out;
}
// tEXt payloads are Latin-1; our strings are ASCII apart from typographic
// dashes (pack names use em-dashes) — translate those, replace anything else.
const asciiSafe = (s) => String(s).replace(/[–—]/g, "--").replace(/·/g, "*").replace(/[^\x20-\x7e]/g, "?");
function stampPng(file, fields) {
  const buf = fs.readFileSync(file);
  // Walk chunks to find IEND (always last, but walk defensively).
  let off = 8, iend = -1;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("latin1", off + 4, off + 8);
    if (type === "IEND") { iend = off; break; }
    off += 12 + len;
  }
  if (iend < 0) return; // not a PNG we understand — leave it untouched
  const chunks = Object.entries(fields).map(([k, v]) =>
    pngChunk("tEXt", Buffer.concat([Buffer.from(k, "latin1"), Buffer.from([0]), Buffer.from(asciiSafe(v), "latin1")])));
  fs.writeFileSync(file, Buffer.concat([buf.subarray(0, iend), ...chunks, buf.subarray(iend)]));
}

const slug = (s) => String(s).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);

let ok = 0, fail = 0;
const done = (name) => { console.log("  ✓", name); ok++; };
const oops = (name, e) => { console.log("  ✗", name, "—", (e && e.message) || e); fail++; };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve();
  const exePath = process.env.PW_CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  const launchOpts = { headless: true };
  if (fs.existsSync(exePath)) launchOpts.executablePath = exePath;
  const browser = await chromium.launch(launchOpts);
  const manifest = [];

  try {
    // ---- boot the real app (light theme, gate + welcome dismissed) ----------
    const appCtx = await browser.newContext({ viewport: VIEWPORT });
    const app = await appCtx.newPage();
    await app.addInitScript(() => {
      try {
        sessionStorage.setItem("studio-gate-ok", "1");
        localStorage.setItem("studio-welcome-seen", "1");
        localStorage.setItem("studio-theme", "light");
      } catch (e) {}
    });
    await app.goto(`http://localhost:${PORT}/app/`, { waitUntil: "networkidle" });
    await app.waitForFunction(() => window.__STUDIO_STATE && window.__STUDIO_STATE.assets.js.length > 0
      && Array.isArray(window.__STUDIO_STATE.examples) && window.__STUDIO_STATE.examples.length > 0, { timeout: 20000 });

    // ---- install both packs and materialize their gallery dashboards --------
    const packs = await app.evaluate(async () => {
      const out = {};
      for (const id of Object.keys(Studio.DEMO_PACKS)) {
        if (!Studio.demoPackInstalled(id)) Studio.installDemoPack(id);
        await window.__studioEnsurePackExamplesMaterialized(id);
        const p = Studio.DEMO_PACKS[id];
        out[id] = { name: p.name, tagline: p.tagline };
      }
      return out;
    });
    await app.waitForTimeout(400);

    // ---- enumerate every pack dashboard, in stable catalog order ------------
    const rows = await app.evaluate(() => {
      const exampleOrder = {};
      (window.__STUDIO_STATE.examples || []).forEach((e, i) => { exampleOrder[e.demoPackId + "|" + e.file] = i; });
      const seededOrder = { "conservation-insight-demo": 0, "conservation-watershed-map": 1, "conservation-system-metrics": 2 };
      const packOrder = Object.keys(Studio.DEMO_PACKS);
      return Studio.Workspace.all("dashboards")
        .filter((r) => r.demoPackId)
        .map((r) => ({
          wsId: r.id, pack: r.demoPackId, name: r.name || "", title: r.title || r.name || r.id,
          sourceFile: r.sourceFile || null,
          hasGeo: !!(Studio.geoAssetKeys && Studio.geoAssetKeys(r.spec).length),
          ord: [packOrder.indexOf(r.demoPackId),
            r.sourceFile ? 1 : 0,
            r.sourceFile ? (exampleOrder[r.demoPackId + "|" + r.sourceFile] ?? 999) : (seededOrder[r.name] ?? 99)]
        }))
        .sort((a, b) => a.ord[0] - b.ord[0] || a.ord[1] - b.ord[1] || a.ord[2] - b.ord[2]);
    });
    console.log(`Found ${rows.length} pack dashboards (${Object.keys(packs).join(", ")}) — capturing…`);

    // ---- render + capture each one, one export page at a time ---------------
    const counters = {};
    for (const row of rows) {
      const n = counters[row.pack] = (counters[row.pack] || 0) + 1;
      const file = `${String(n).padStart(2, "0")}-${slug(row.title)}.png`;
      const rel = path.join(row.pack, file);
      const label = `${row.pack}/${file}`;
      try {
        const html = await app.evaluate(async (wsId) => {
          const r = Studio.Workspace.all("dashboards").find((x) => x.id === wsId);
          if (!r || !r.spec) throw new Error("workspace row/spec missing");
          const spec = r.spec;
          await window.__studioEnsureGeoAssets(spec);
          // Real computed rows for builder-blob DAs (the Home live-tile recipe);
          // the sample engine fills everything else deterministically.
          const pend = Studio.Build && Studio.Build.ensureSpecMocks ? Studio.Build.ensureSpecMocks(spec) : null;
          if (pend) await pend;
          const mock = Studio.genMock(spec);
          if (Studio.Build && Studio.Build.specMocks) Object.assign(mock, Studio.Build.specMocks(spec));
          return Studio.buildHtml(spec, window.__STUDIO_STATE.assets, { preview: true, mock: mock, launcher: false });
        }, row.wsId);

        const route = `/__shot/${row.pack}-${n}.html`;
        dynamic.set(route, html);
        const ctx = await browser.newContext({ viewport: VIEWPORT });
        const page = await ctx.newPage();
        try {
          await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: "networkidle" });
          const waitSel = row.hasGeo ? "path[data-geo-id]" : ".dk-grid svg, .dk-grid canvas, .dk-grid table";
          await page.waitForSelector(waitSel, { timeout: 20000 }).catch(() => {});
          await page.waitForTimeout(row.hasGeo ? 1600 : 1000);
          const abs = path.join(OUT, rel);
          fs.mkdirSync(path.dirname(abs), { recursive: true });
          await page.screenshot({ path: abs, fullPage: true });
          stampPng(abs, {
            "Creation Time": SESSION_ISO,
            Software: "analytics.polecat.live tools/shoot-pack-dashboards.mjs",
            Comment: `Sample-pack dashboard capture session ${SESSION_ISO} -- pack: ${packs[row.pack].name} -- dashboard: ${row.title}`
          });
          manifest.push({ pack: row.pack, packName: packs[row.pack].name, file: rel.split(path.sep).join("/"),
            title: row.title, source: row.sourceFile ? `data/examples/${row.sourceFile}` : "seeded by installDemoPack" });
          done(label);
        } finally { await ctx.close(); dynamic.delete(route); }
      } catch (e) { oops(label, e); }
    }
    await appCtx.close();

    // ---- manifests: README.md (humans) + session.json (tooling) -------------
    let sha = "unknown";
    try { sha = execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim(); } catch (e) {}
    const byPack = {};
    manifest.forEach((m) => { (byPack[m.pack] = byPack[m.pack] || []).push(m); });
    const lines = [
      `# Sample-pack dashboard screenshots — image session ${SESSION_ISO}`,
      "",
      `Every dashboard in every sample pack, captured from the live app by`,
      "`node tools/shoot-pack-dashboards.mjs`.",
      "",
      `- **Image session ran:** ${SESSION_ISO} (also stamped into each PNG's tEXt metadata)`,
      `- **App commit at capture:** ${sha}`,
      `- **Render:** full-page, ${VIEWPORT.width}px wide, light theme; each dashboard wears its own dashboardTheme skin`,
      `- **Data:** the packs' own seeded/sample data (synthetic by design — see app/demopacks.js)`,
      ""
    ];
    Object.keys(byPack).forEach((id) => {
      lines.push(`## ${packs[id].name}`, "", packs[id].tagline, "", "| # | Screenshot | Dashboard | Source |", "|---|---|---|---|");
      byPack[id].forEach((m, i) => {
        lines.push(`| ${i + 1} | [\`${m.file}\`](${m.file}) | ${m.title} | \`${m.source}\` |`);
      });
      lines.push("");
    });
    fs.writeFileSync(path.join(OUT, "README.md"), lines.join("\n"));
    fs.writeFileSync(path.join(OUT, "session.json"), JSON.stringify({
      session: SESSION_ISO, commit: sha, tool: "tools/shoot-pack-dashboards.mjs",
      viewport: VIEWPORT, fullPage: true, theme: "light", packs, shots: manifest
    }, null, 2) + "\n");

    console.log(`\nshoot-pack-dashboards: ${ok} captured, ${fail} failed → ${path.relative(ROOT, OUT)}/`);
    process.exitCode = fail && !ok ? 1 : 0;
  } catch (e) {
    console.error("shoot-pack-dashboards: fatal —", e.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
    srv.close();
  }
})();
