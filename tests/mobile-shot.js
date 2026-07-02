/* mobile-shot.js — boots the Studio at a real-iPhone-ish 390×844 viewport and
   dumps a screenshot for the loop to actually LOOK at each mobile-track run.
   Headless Chromium has no browser chrome (no Safari toolbar/home-indicator), so
   DOM/CSS assertions alone can pass while a real phone still hides content behind
   the toolbar — this is the "look at the picture" check that catches that class
   of bug. Run:  node tests/mobile-shot.js [outfile.png] [route]            */
"use strict";
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PORT = 8012;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };

function serve() {
  return new Promise((res) => {
    const srv = http.createServer((req, rep) => {
      let p = decodeURIComponent(req.url.split("?")[0]); if (p === "/") p = "/index.html";
      if (p === "/favicon.ico") { rep.writeHead(204); return rep.end(); }
      const fp = path.join(ROOT, p);
      if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { rep.writeHead(404); return rep.end("404"); }
      rep.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "application/octet-stream" });
      fs.createReadStream(fp).pipe(rep);
    });
    srv.listen(PORT, () => res(srv));
  });
}

(async () => {
  const out = path.resolve(process.argv[2] || path.join(__dirname, "mobile-shot.png"));
  const route = process.argv[3] || "";
  const srv = await serve();
  const exePath = process.env.PW_CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  const launchOpts = { headless: true };
  if (fs.existsSync(exePath)) launchOpts.executablePath = exePath;
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  // unlock the gate + skip the welcome tour so the shot shows the real app, not the lock screen
  await page.addInitScript(() => { try { sessionStorage.setItem("studio-gate-ok", "1"); localStorage.setItem("studio-welcome-seen", "1"); } catch (e) {} });
  await page.goto(`http://localhost:${PORT}/${route}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  await page.screenshot({ path: out });
  console.log("wrote " + out);
  await browser.close();
  srv.close();
})();
