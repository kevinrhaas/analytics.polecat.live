/* tools/gen-apple-touch-icon.js — Z12 follow-up: rasterize favicon.svg into a real PNG.
   iOS Safari's "Add to Home Screen" needs a genuine bitmap apple-touch-icon (it does not
   reliably rasterize an SVG referenced via <link rel="apple-touch-icon">); this project has
   no image-processing dependency, so this one-off script uses the same headless Chromium
   Playwright already vendors for tests/run.js to render the SVG and screenshot it at the
   standard 180x180 apple-touch-icon size. Run once (or whenever favicon.svg changes):
     node tools/gen-apple-touch-icon.js
   Writes apple-touch-icon.png at the repo root — a static, committed asset (like favicon.svg
   itself), not a runtime/build-step dependency of the exported dashboards. */
"use strict";
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SIZE = 180; // Apple's documented apple-touch-icon size

(async () => {
  const svg = fs.readFileSync(path.join(ROOT, "favicon.svg"), "utf8");
  const html = "<!doctype html><html><head><style>html,body{margin:0;padding:0}" +
    "svg{display:block;width:" + SIZE + "px;height:" + SIZE + "px}</style></head><body>" + svg + "</body></html>";

  const exePath = process.env.PW_CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  const launchOpts = { headless: true };
  if (fs.existsSync(exePath)) launchOpts.executablePath = exePath;
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
  await page.setContent(html);
  const outPath = path.join(ROOT, "apple-touch-icon.png");
  await page.screenshot({ path: outPath, omitBackground: false });
  await browser.close();
  console.log("wrote " + outPath + " (" + SIZE + "x" + SIZE + ")");
})();
