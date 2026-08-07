/* tools/gen-pwa-icons.js — N-DIST: rasterize favicon.svg into the 192x192 + 512x512 PNGs a
   browser's install-banner / "Add to Home Screen" flow actually requires (most browsers won't
   consider a site installable off an SVG-only manifest icon list). Same technique as the Z12
   tools/gen-apple-touch-icon.js: no image-processing dependency, just the headless Chromium
   Playwright already vendors for tests/run.js, screenshotting the SVG at each target size.
   Run once (or whenever favicon.svg changes):
     NODE_PATH=$(npm root -g) node tools/gen-pwa-icons.js
   Writes icon-192.png / icon-512.png at the repo root — static, committed assets (like
   favicon.svg/apple-touch-icon.png), not a runtime/build-step dependency of exported dashboards. */
"use strict";
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SIZES = [192, 512];

(async () => {
  const svg = fs.readFileSync(path.join(ROOT, "favicon.svg"), "utf8");
  const exePath = process.env.PW_CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  const launchOpts = { headless: true };
  if (fs.existsSync(exePath)) launchOpts.executablePath = exePath;
  const browser = await chromium.launch(launchOpts);
  for (const size of SIZES) {
    const html = "<!doctype html><html><head><style>html,body{margin:0;padding:0}" +
      "svg{display:block;width:" + size + "px;height:" + size + "px}</style></head><body>" + svg + "</body></html>";
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(html);
    const outPath = path.join(ROOT, "icon-" + size + ".png");
    await page.screenshot({ path: outPath, omitBackground: false });
    await page.close();
    console.log("wrote " + outPath + " (" + size + "x" + size + ")");
  }
  await browser.close();
})();
