// dev-smoke.mjs — the pipeline's LIGHT gate ("area tests").
//
//   NODE_PATH=$(npm root -g) node tools/dev-smoke.mjs
//   SMOKE_PREFIX=/stage … node tools/dev-smoke.mjs     (staged-preview form)
//
// The FULL suite (tests/run.js, ~2,900 checks, ~10 min) runs at stage-promotion
// time in promote-to-stage.yml. This is the fast boot sanity that gates work
// entering the `dev` integration branch: the marketing page, the app (past
// the gate), and the docs all render with ZERO pageerrors, on desktop and at
// the 390px mobile width. SMOKE_PREFIX re-points every URL at a staged
// /stage/ or /dev/ assembly (tools/stage-preview.mjs output), so base-href and
// path-rewrite bugs in the staging itself are caught by the stage gate too.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { createRequire } from "node:module";
// require() (not import) so the NODE_PATH=$(npm root -g) global install
// resolves — the same way tests/run.js loads Playwright.
const { chromium } = createRequire(import.meta.url)("playwright");

const PORT = 8013;
const PREFIX = (process.env.SMOKE_PREFIX || "").replace(/\/+$/, "");
const at = (p) => `http://localhost:${PORT}${PREFIX}${p}`;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2" };

const server = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p.endsWith("/")) p += "index.html";
    const data = await readFile(p.replace(/^\//, ""));
    res.writeHead(200, { "content-type": MIME[extname(p)] || "application/octet-stream" });
    res.end(data);
  } catch { res.writeHead(404); res.end("not found"); }
});
await new Promise((r) => server.listen(PORT, r));

const launchOpts = process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {};
const browser = await chromium.launch(launchOpts);
let code = 0;

async function checkPage(ctx, url, readyFn, label) {
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  // Same gate bypass the full suite uses — this tests the app, not the gate.
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("studio-gate-ok", "1");
      localStorage.setItem("studio-welcome-seen", "1");
    } catch (e) {}
  });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForFunction(readyFn, null, { timeout: 15000 });
  await page.waitForTimeout(700); // let late boot fetches surface any throw
  const real = errors.filter((e) => !/favicon|net::ERR|Failed to load resource/i.test(e));
  await page.close();
  if (real.length) throw new Error(`[${label}] errors:\n  ${real.join("\n  ")}`);
  console.log(`✓ ${label}`);
}

try {
  const desktop = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  await checkPage(desktop, at("/"),
    () => !!document.querySelector(".hero h1"), "marketing renders");
  await checkPage(desktop, at("/app/"),
    () => window.Studio && window.Studio.Workspace && !!document.getElementById("railSource"),
    "app boots past the gate (Studio + rail present)");
  await checkPage(desktop, at("/docs/"),
    () => !!document.body && document.body.textContent.length > 500, "docs render");
  await desktop.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  await checkPage(mobile, at("/app/"),
    () => window.Studio && window.Studio.Workspace, "app boots at 390px mobile");
  await mobile.close();

  console.log(`\n✅ dev-smoke passed${PREFIX ? ` (staged form at ${PREFIX})` : ""}`);
} catch (e) {
  console.error(`\n❌ dev-smoke FAILED:\n${e.message}`);
  code = 1;
} finally {
  await browser.close();
  server.close();
}
process.exit(code);
