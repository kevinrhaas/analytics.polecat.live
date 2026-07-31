/* Analytics Dashboard Studio — © 2026 Polecat.live. See LICENSE. */
// tools/shoot-app-tour.mjs — a screenshot TOUR of the app itself: every rail
// section plus the good menus and dialogs, staged with the sample packs
// installed so each surface reads as lived-in (real folders, datasets, jobs,
// Views and dashboards — never an empty state). Companion to
// tools/shoot-pack-dashboards.mjs, which captures the dashboards themselves.
//
//   node tools/shoot-app-tour.mjs [--out <dir>]
//
// Writes <out>/desktop/NN-<slug>.png (1440×900 @1.5x) and a small
// <out>/mobile/NN-<slug>.png set (390×780 @2x), plus README.md + session.json
// manifests. Every PNG carries the capture-session timestamp in its tEXt
// metadata. Default out dir: docs/shots/app-tour/<date>/. Resilient like
// gen-shots.mjs: a surface that fails to stage is logged and skipped.
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
const SESSION = new Date();
const SESSION_ISO = SESSION.toISOString().replace(/\.\d{3}Z$/, "Z");
const DATE_DIR = SESSION_ISO.slice(0, 10);
const argOut = (() => { const i = process.argv.indexOf("--out"); return i > 0 ? process.argv[i + 1] : null; })();
const OUT = path.resolve(ROOT, argOut || path.join("docs", "shots", "app-tour", DATE_DIR));
const PORT = 4312; // 4310 = gen-shots, 4311 = shoot-pack-dashboards
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 780 };
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

// ---- PNG tEXt stamping (same convention as shoot-pack-dashboards.mjs) -------
const asciiSafe = (s) => String(s).replace(/[–—]/g, "--").replace(/·/g, "*").replace(/[^\x20-\x7e]/g, "?");
function pngChunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(zlib.crc32(body) >>> 0, body.length + 4);
  return out;
}
function stampPng(file, fields) {
  const buf = fs.readFileSync(file);
  let off = 8, iend = -1;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("latin1", off + 4, off + 8);
    if (type === "IEND") { iend = off; break; }
    off += 12 + len;
  }
  if (iend < 0) return;
  const chunks = Object.entries(fields).map(([k, v]) =>
    pngChunk("tEXt", Buffer.concat([Buffer.from(k, "latin1"), Buffer.from([0]), Buffer.from(asciiSafe(v), "latin1")])));
  fs.writeFileSync(file, Buffer.concat([buf.subarray(0, iend), ...chunks, buf.subarray(iend)]));
}

const slug = (s) => String(s).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
let ok = 0, fail = 0;
const oops = (name, e) => { console.log("  ✗", name, "—", (e && e.message) || e); fail++; };

const DECLUTTER = `document.querySelectorAll('#toasts .toast,.confetti-root').forEach(e=>e.remove());
document.querySelectorAll('.bd-drop-ov').forEach(e=>{e.hidden=true;e.style.display='none';});
document.querySelectorAll('.dragover').forEach(e=>e.classList.remove('dragover'));`;
const manifest = [];
const counters = {};
async function shoot(page, group, title, note, opts = {}) {
  const n = counters[group] = (counters[group] || 0) + 1;
  const file = `${String(n).padStart(2, "0")}-${slug(title)}.png`;
  const abs = path.join(OUT, group, file);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  if (!opts.keepToasts) await page.evaluate(DECLUTTER).catch(() => {});
  await page.waitForTimeout(opts.settle || 250);
  await page.screenshot({ path: abs, fullPage: !!opts.fullPage });
  stampPng(abs, {
    "Creation Time": SESSION_ISO,
    Software: "analytics.polecat.live tools/shoot-app-tour.mjs",
    Comment: `App-tour capture session ${SESSION_ISO} -- ${group}: ${title}`
  });
  manifest.push({ group, file: `${group}/${file}`, title, note: note || "" });
  console.log("  ✓", `${group}/${file}`);
  ok++;
}

// Boot the app with packs installed + materialized so every catalog is populated.
async function bootApp(browser, { viewport = DESKTOP, dsf = 1.5, theme = "light", welcomeSeen = true, packs = true } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsf });
  const page = await ctx.newPage();
  await page.addInitScript(({ t, seen }) => {
    try {
      sessionStorage.setItem("studio-gate-ok", "1");
      if (seen) localStorage.setItem("studio-welcome-seen", "1");
      localStorage.setItem("studio-theme", t);
      localStorage.setItem("studio-shell-expanded", "1"); // rail open with labels
      localStorage.setItem("studio-vwc-view", "list");    // Views catalog in list mode
    } catch (e) {}
  }, { t: theme, seen: welcomeSeen });
  await page.goto(`http://localhost:${PORT}/app/`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__STUDIO_STATE && window.__STUDIO_STATE.assets.js.length > 0
    && Array.isArray(window.__STUDIO_STATE.examples) && window.__STUDIO_STATE.examples.length > 0, { timeout: 20000 });
  if (packs) {
    await page.evaluate(async () => {
      for (const id of Object.keys(Studio.DEMO_PACKS)) {
        if (!Studio.demoPackInstalled(id)) Studio.installDemoPack(id);
        await window.__studioEnsurePackExamplesMaterialized(id);
      }
    });
    await page.waitForTimeout(400);
  }
  return { ctx, page };
}

async function section(page, s, wait = 900) {
  await page.evaluate((x) => window.__studioShellSetSection(x), s);
  await page.waitForTimeout(wait);
}
async function esc(page, times = 2) {
  for (let i = 0; i < times; i++) { await page.keyboard.press("Escape"); await page.waitForTimeout(180); }
}
async function attempt(name, fn) {
  try { await fn(); } catch (e) { oops(name, e); }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve();
  const exePath = process.env.PW_CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  const launchOpts = { headless: true };
  if (fs.existsSync(exePath)) launchOpts.executablePath = exePath;
  const browser = await chromium.launch(launchOpts);

  try {
    // ================= DESKTOP: the main lived-in workspace ==================
    const { ctx, page } = await bootApp(browser, {});

    // ---- the rail sections, in rail order --------------------------------
    await attempt("home", async () => {
      await section(page, "home", 400);
      await page.evaluate(() => window.__studioRenderHome && window.__studioRenderHome());
      await page.waitForTimeout(2200); // featured live tile renders in an iframe
      await shoot(page, "desktop", "Home", "featured live dashboard tile, pinned Views, quick actions");
    });
    await attempt("dashboards", async () => {
      await section(page, "dashboards", 1400);
      await shoot(page, "desktop", "Dashboards catalog", "both packs' dashboards, filed in pack folders");
    });
    await attempt("views", async () => {
      await section(page, "views", 500);
      await page.evaluate(() => window.__studioRenderViews && window.__studioRenderViews());
      await page.waitForTimeout(700);
      const row = page.locator("#viewsResults .cx-row").first();
      if (await row.count()) await row.hover().catch(() => {});
      await shoot(page, "desktop", "Views catalog", "list mode, chart-type icons + folder badges");
    });
    await attempt("build", async () => {
      await section(page, "build", 400);
      await page.evaluate(async () => {
        window.__studioRenderBuild && window.__studioRenderBuild();
        await new Promise((r) => setTimeout(r, 120));
        const cat = window.__STUDIO_STATE.catalog || {};
        for (const stem of Object.keys(cat).sort()) {
          const da = (cat[stem].dataAccesses || []).filter((d) => (d.columns || []).length >= 3 && !/^kpi/i.test(d.id))[0];
          if (da) { await window.__studioBuild.selectDataset("sample", stem + "\u0001" + da.id); return; }
        }
      });
      await page.waitForTimeout(900);
      await page.evaluate(() => {
        const B = window.__studioBuild;
        const cols = B.eff() ? B.eff().cols : [];
        if (cols.length >= 2) { B.addField(cols[0], "rows"); B.addField(cols[1], "cols"); }
        for (const c of cols.slice(2)) { B.addField(c, "cols"); if (B.state.shelfCols.some((f) => f.agg)) break; }
        B.rerender();
      });
      await page.waitForTimeout(800);
      await shoot(page, "desktop", "View Builder", "dataset on the shelves, live crosstab + chart");
    });
    await attempt("explore", async () => {
      await section(page, "explore", 600);
      await page.evaluate(() => {
        const A = (window.Studio && Studio.Workspace) ? Studio.Workspace.all("analyses") : [];
        const pick = A.filter((a) => /no-?till|tillage|cover/i.test(a.name || ""))[0] || A[0];
        if (pick && window.__studioExplore) window.__studioExplore.load(pick.id);
      });
      await page.waitForTimeout(1800);
      await shoot(page, "desktop", "Explore", "a saved pack View open in the designer");
    });
    await attempt("datasets", async () => {
      await section(page, "datasets", 1200);
      await shoot(page, "desktop", "Datasets catalog", "pack datasets with folders, tags and kinds");
    });
    await attempt("connections", async () => {
      await section(page, "connections", 1000);
      await shoot(page, "desktop", "Connections", "the pack's demo file store + repo backend");
    });
    await attempt("jobs", async () => {
      await section(page, "jobs", 1000);
      await shoot(page, "desktop", "Jobs", "the county-to-state rollup job seeded by the pack");
    });
    await attempt("repository", async () => {
      await section(page, "repository", 1100);
      await shoot(page, "desktop", "Repository", "every kind in one tree — kind chips + nested folders");
    });
    await attempt("settings", async () => {
      await section(page, "settings", 900);
      await shoot(page, "desktop", "Settings", "color theme cards at the top");
    });
    await attempt("settings-packs", async () => {
      await page.evaluate(() => {
        const els = [...document.querySelectorAll("#secSettings h3, #secSettings h4, #secSettings .set-title")];
        const t = els.find((e) => /sample packs/i.test(e.textContent || ""));
        if (t) t.scrollIntoView({ block: "center" });
      });
      await page.waitForTimeout(400);
      await shoot(page, "desktop", "Settings — sample packs", "both packs installed, with Remove toggles");
    });

    // ---- the Dashboard Builder (studio) + its dialogs ----------------------
    const featured = await page.evaluate(() => {
      const r = Studio.Workspace.all("dashboards").find((x) => x.name === "conservation-insight-demo") ||
        Studio.Workspace.all("dashboards").filter((x) => x.demoPackId)[0];
      return r ? r.id : null;
    });
    await attempt("studio", async () => {
      await page.evaluate((id) => {
        const r = Studio.Workspace.all("dashboards").find((x) => x.id === id);
        window.__studioShellSetSection("studio");
        window.__studioLoad(r.spec);
      }, featured);
      await page.waitForTimeout(2800);
      await shoot(page, "desktop", "Dashboard Builder", "the featured pack dashboard on the canvas, inspector right");
    });
    await attempt("dashboard-theme", async () => {
      await page.evaluate(() => window.__studioSelectDashboard && window.__studioSelectDashboard());
      await page.waitForTimeout(400);
      await page.evaluate(() => {
        const labels = [...document.querySelectorAll("#inspector label, #inspector .field > span, #inspector span")];
        const dt = labels.find((l) => /^Dashboard theme$/.test((l.textContent || "").trim()));
        if (dt) dt.scrollIntoView({ block: "center" });
      });
      await page.waitForTimeout(350);
      await shoot(page, "desktop", "Dashboard theme picker", "per-dashboard skins in the inspector");
    });
    await attempt("backend-wizard", async () => {
      await page.evaluate(() => window.__studioOpenBackendWizard());
      await page.waitForTimeout(900);
      await shoot(page, "desktop", "Workspace backend wizard", "point the workspace at your own Turso / Supabase / Firebase");
      await esc(page);
    });
    await attempt("export-menu", async () => {
      await page.click("#btnExport");
      await page.waitForTimeout(500);
      await shoot(page, "desktop", "Export menu", "standalone HTML export options");
      await esc(page);
    });
    await attempt("save-as", async () => {
      await page.click("#btnSaveAsSpec");
      await page.waitForTimeout(500);
      await page.fill("#saveAsTitleInput", "Cover Crop & Tillage — Kevin's copy");
      await page.waitForTimeout(250);
      await shoot(page, "desktop", "Save as", "naming a copy of a protected pack dashboard");
      await esc(page);
    });
    await attempt("json-editor", async () => {
      await page.evaluate(() => window.__studioOpenJsonEditor());
      await page.waitForTimeout(700);
      await shoot(page, "desktop", "JSON editor", "the dashboard spec, editable in place");
      await esc(page);
    });
    await attempt("version-history", async () => {
      await page.evaluate(() => {
        window.__studioSnapshotVersion();
        window.__STUDIO_STATE.spec.title = "Cover Crop & Tillage Adoption — revised";
        window.__studioSnapshotVersion();
        window.__studioSelectDashboard && window.__studioSelectDashboard();
      });
      await page.waitForTimeout(400);
      await page.evaluate(() => {
        const h = [...document.querySelectorAll("#inspBody h4")].find((x) => /^Version history/.test(x.textContent || ""));
        if (h) h.scrollIntoView({ block: "center" });
      });
      await page.waitForTimeout(300);
      await shoot(page, "desktop", "Version history", "checkpoints in the dashboard inspector");
    });
    await attempt("version-diff", async () => {
      await page.evaluate(() => {
        const id = window.__STUDIO_STATE.spec.id;
        const list = (window.__studioVersions()[id]) || [];
        if (list.length) window.__studioOpenVersionDiff(list[list.length - 1]);
      });
      await page.waitForTimeout(700);
      await shoot(page, "desktop", "Version diff", "oldest checkpoint vs the current state");
      await esc(page);
    });
    await attempt("compare-dashboards", async () => {
      await page.evaluate(() => window.__studioOpenCompareDashboards());
      await page.waitForTimeout(800);
      await shoot(page, "desktop", "Compare dashboards", "any two dashboards, side by side");
      await esc(page);
    });
    await attempt("whats-new", async () => {
      await page.evaluate(() => window.__studioOpenWhatsNew());
      await page.waitForTimeout(700);
      await shoot(page, "desktop", "What's new", "the live changelog panel");
      await esc(page);
    });
    await attempt("shortcuts", async () => {
      await page.evaluate(() => window.__studioShowShortcuts());
      await page.waitForTimeout(600);
      await shoot(page, "desktop", "Keyboard shortcuts", "the shortcut reference overlay");
      await esc(page);
    });
    await attempt("command-palette", async () => {
      await page.keyboard.press("Control+k");
      await page.waitForTimeout(400);
      await page.keyboard.type("watershed", { delay: 40 });
      await page.waitForTimeout(600);
      await shoot(page, "desktop", "Command palette", "Ctrl+K, searching across the whole workspace");
      await esc(page);
    });
    await attempt("waffle", async () => {
      await page.click(".ps-waffle-btn");
      await page.waitForTimeout(500);
      await shoot(page, "desktop", "App switcher", "the Polecat fleet waffle menu");
      await esc(page);
    });

    // ---- catalog dialogs staged with sample input --------------------------
    await attempt("quick-import", async () => {
      await section(page, "home", 800);
      const csv = ["region,quarter,revenue,growth_pct",
        "Midwest,Q1,412000,4.1", "Midwest,Q2,436500,5.9", "South,Q1,388200,3.2",
        "South,Q2,401900,3.5", "West,Q1,512400,7.8", "West,Q2,540100,5.4"].join("\n");
      await page.setInputFiles("#secHome .home-quickimport-input",
        { name: "regional-revenue-sample.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
      await page.waitForTimeout(1800);
      await shoot(page, "desktop", "Quick import", "a dropped CSV becomes an instant dashboard — 1 KPI + 5 Views", { keepToasts: true });
      await esc(page);
    });
    await attempt("add-connection", async () => {
      await section(page, "connections", 900);
      await page.evaluate(() => Studio.Connections.openWizard());
      await page.waitForTimeout(800);
      await shoot(page, "desktop", "New connection", "the adapter picker — every supported backend");
      await esc(page);
    });
    await attempt("dataset-detail", async () => {
      await section(page, "datasets", 1000);
      await page.locator('#dsxResults :text("County cover-crop adoption")').first().click();
      await page.waitForTimeout(1400);
      await shoot(page, "desktop", "Dataset detail", "the pack's county dataset opened — columns + preview");
      await esc(page);
    });
    await attempt("job-detail", async () => {
      await section(page, "jobs", 900);
      await page.locator('#secJobs :text("Roll counties up to states")').first().click();
      await page.waitForTimeout(1200);
      await shoot(page, "desktop", "Job editor", "the acreage-weighted county-to-state rollup steps");
      await esc(page);
    });
    await attempt("folder-picker", async () => {
      await section(page, "datasets", 1000);
      await page.click("#dsxSelectBtn");
      await page.waitForTimeout(400);
      const cbs = page.locator("#dsxResults .dsx-select-cb");
      const n = Math.min(await cbs.count(), 2);
      for (let i = 0; i < n; i++) { await cbs.nth(i).click(); await page.waitForTimeout(150); }
      await page.click("#dsxSelMoveBtn");
      await page.waitForTimeout(700);
      await shoot(page, "desktop", "Move to folder", "bulk-select two datasets, one folder choice files both");
      await esc(page, 3);
    });

    // ---- guided tours -------------------------------------------------------
    await attempt("tour-chooser", async () => {
      await section(page, "home", 700);
      await page.evaluate(() => window.StudioTutorial.open());
      await page.waitForTimeout(700);
      await shoot(page, "desktop", "Interactive tours", "the tour chooser — overview, quick build, jobs, connect");
      await esc(page);
    });
    await attempt("tour-step", async () => {
      await page.evaluate(() => window.StudioTutorial.openTour("build"));
      await page.waitForTimeout(1200);
      await shoot(page, "desktop", "Tour in progress", "the View Builder tour — spotlight ring + step card", { keepToasts: true });
      await esc(page, 3);
    });
    await ctx.close();

    // ================= fresh-boot + dark-theme moments =======================
    await attempt("welcome", async () => {
      const b = await bootApp(browser, { welcomeSeen: false, packs: false });
      await b.page.waitForTimeout(1200);
      await shoot(b.page, "desktop", "Welcome", "the first-run welcome — before any data exists");
      await b.ctx.close();
    });
    {
      const d = await bootApp(browser, { theme: "dark" });
      await attempt("home-dark", async () => {
        await section(d.page, "home", 400);
        await d.page.evaluate(() => window.__studioRenderHome && window.__studioRenderHome());
        await d.page.waitForTimeout(2200);
        await shoot(d.page, "desktop", "Home — dark", "the same lived-in Home in the dark theme");
      });
      await attempt("studio-dark", async () => {
        await d.page.evaluate(() => {
          const r = Studio.Workspace.all("dashboards").find((x) => x.name === "conservation-insight-demo") ||
            Studio.Workspace.all("dashboards").filter((x) => x.demoPackId)[0];
          window.__studioShellSetSection("studio");
          window.__studioLoad(r.spec);
        });
        await d.page.waitForTimeout(2800);
        await shoot(d.page, "desktop", "Dashboard Builder — dark", "the builder in dark, preview matching");
      });
      await d.ctx.close();
    }

    // ================= MOBILE (390×780 @2x) ==================================
    {
      const m = await bootApp(browser, { viewport: MOBILE, dsf: 2 });
      await attempt("m-home", async () => {
        await section(m.page, "home", 400);
        await m.page.evaluate(() => window.__studioRenderHome && window.__studioRenderHome());
        await m.page.waitForTimeout(2000);
        await shoot(m.page, "mobile", "Home", "the phone layout — cards stack, rail collapses");
      });
      await attempt("m-menu", async () => {
        await m.page.click("#mobileNavBtn");
        await m.page.waitForTimeout(500);
        await shoot(m.page, "mobile", "Navigation drawer", "the rail as an off-canvas drawer");
        await esc(m.page);
      });
      await attempt("m-dashboards", async () => {
        await section(m.page, "dashboards", 1200);
        await shoot(m.page, "mobile", "Dashboards", "the catalog on a phone");
      });
      await attempt("m-palette", async () => {
        await m.page.keyboard.press("Control+k");
        await m.page.waitForTimeout(400);
        await m.page.keyboard.type("cover", { delay: 40 });
        await m.page.waitForTimeout(500);
        await shoot(m.page, "mobile", "Command palette", "workspace search on a phone");
        await esc(m.page);
      });
      await attempt("m-settings", async () => {
        await section(m.page, "settings", 900);
        await shoot(m.page, "mobile", "Settings", "theme cards in the phone layout");
      });
      // a real dashboard on a phone — the export page, full length
      await attempt("m-dashboard", async () => {
        const html = await m.page.evaluate(async () => {
          const r = Studio.Workspace.all("dashboards").find((x) => x.name === "conservation-watershed-map") ||
            Studio.Workspace.all("dashboards").filter((x) => x.demoPackId)[0];
          const spec = r.spec;
          await window.__studioEnsureGeoAssets(spec);
          const pend = Studio.Build && Studio.Build.ensureSpecMocks ? Studio.Build.ensureSpecMocks(spec) : null;
          if (pend) await pend;
          const mock = Studio.genMock(spec);
          if (Studio.Build && Studio.Build.specMocks) Object.assign(mock, Studio.Build.specMocks(spec));
          return Studio.buildHtml(spec, window.__STUDIO_STATE.assets, { preview: true, mock, launcher: false });
        });
        dynamic.set("/__tour/mobile-dash.html", html);
        const p2 = await (await browser.newContext({ viewport: MOBILE, deviceScaleFactor: 2 })).newPage();
        await p2.goto(`http://localhost:${PORT}/__tour/mobile-dash.html`, { waitUntil: "networkidle" });
        await p2.waitForSelector("path[data-geo-id]", { timeout: 20000 }).catch(() => {});
        await p2.waitForTimeout(1500);
        await shoot(p2, "mobile", "Dashboard on a phone", "the watershed map export at 390px, full length", { fullPage: true });
        await p2.context().close();
      });
      await m.ctx.close();
    }

    // ---- manifests -----------------------------------------------------------
    let sha = "unknown";
    try { sha = execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim(); } catch (e) {}
    const lines = [
      `# App tour screenshots — image session ${SESSION_ISO}`,
      "",
      "The app itself — every rail section plus the menus and dialogs, staged",
      "with both sample packs installed so nothing reads as an empty state.",
      "Captured by `node tools/shoot-app-tour.mjs`.",
      "",
      `- **Image session ran:** ${SESSION_ISO} (also stamped into each PNG's tEXt metadata)`,
      `- **App commit at capture:** ${sha}`,
      `- **Desktop:** ${DESKTOP.width}×${DESKTOP.height} @1.5x · **Mobile:** ${MOBILE.width}×${MOBILE.height} @2x`,
      ""
    ];
    for (const g of ["desktop", "mobile"]) {
      const rows = manifest.filter((m) => m.group === g);
      if (!rows.length) continue;
      lines.push(`## ${g[0].toUpperCase() + g.slice(1)}`, "", "| # | Screenshot | Surface | Notes |", "|---|---|---|---|");
      rows.forEach((m, i) => lines.push(`| ${i + 1} | [\`${m.file}\`](${m.file}) | ${m.title} | ${m.note} |`));
      lines.push("");
    }
    fs.writeFileSync(path.join(OUT, "README.md"), lines.join("\n"));
    fs.writeFileSync(path.join(OUT, "session.json"), JSON.stringify({
      session: SESSION_ISO, commit: sha, tool: "tools/shoot-app-tour.mjs",
      desktop: DESKTOP, mobile: MOBILE, shots: manifest
    }, null, 2) + "\n");

    console.log(`\nshoot-app-tour: ${ok} captured, ${fail} failed → ${path.relative(ROOT, OUT)}/`);
    process.exitCode = fail && !ok ? 1 : 0;
  } catch (e) {
    console.error("shoot-app-tour: fatal —", e.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
    srv.close();
  }
})();
