// PDC dashboard render-test harness for the CLOUD Pentaho (server.pentaho.space).
//
// Why this is non-trivial in the cloud session:
//  1. Chromium's own network stack CANNOT reach the localhost egress proxy
//     (127.0.0.1:$HTTPS_PROXY), so direct page navigation gets ERR_CONNECTION_CLOSED.
//     Fix: intercept EVERY request and serve it via Playwright's request context,
//     which DOES honor HTTPS_PROXY.
//  2. The server's fully-qualified-server-url is http://, so the CDF runtime emits
//     http:// <script> tags that an https page blocks as Mixed Content (breaks every
//     CDF twin). Fix: rewrite http://server.pentaho.space -> https in served html/js.
//     (Real fix is server-side: set fully-qualified-server-url to https.)
//  3. CDF/CCC charts take ~6-10s to draw — wait for an <svg> before asserting.
//
// Usage:
//   PENTAHO_PASS='...' NODE_PATH=/opt/node22/lib/node_modules \
//     node iteration/v2/dash-build/rtest.js <stem> [stem2 ...]
//   Optional env: PENTAHO_URL (default https://server.pentaho.space/pentaho),
//                 PENTAHO_USER (default admin), PENTAHO_PASS (required),
//                 PW_CHROME (chrome path), V2PATH (default /public/pdc-iteration/v2),
//                 INTERACT=1 (exercise a 2nd <select> to test a secondary filter).
// Exit code 0 = all stems rendered an <svg> with no real page errors.
const { chromium } = require('playwright');
const BASE = (process.env.PENTAHO_URL || 'https://server.pentaho.space/pentaho').replace(/\/$/, '');
const ORIGIN = BASE.replace(/\/pentaho$/, '');
const ORIGIN_H = ORIGIN.replace(/^https:/, 'http:');
const USER = process.env.PENTAHO_USER || 'admin';
const PASS = process.env.PENTAHO_PASS || '';
const PROXY = process.env.HTTPS_PROXY || '';   // empty on a CI runner (no egress proxy); set in the cloud session
const V2PATH = process.env.V2PATH || '/public/pdc-iteration/v2';
const CHROME = process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const INTERACT = process.env.INTERACT === '1';
const BENIGN = /favicon|ResizeObserver|\.map( |$)|Mixed Content|messages_supported_languages\.properties/;

(async () => {
  if (!PASS) { console.error('set PENTAHO_PASS'); process.exit(2); }
  const stems = process.argv.slice(2);
  if (!stems.length) { console.error('usage: node rtest.js <stem> [...]'); process.exit(2); }
  const fs = require('fs');
  const launchOpts = { args: ['--no-sandbox', '--disable-dev-shm-usage'] };
  if (fs.existsSync(CHROME)) launchOpts.executablePath = CHROME;   // else: Playwright's own installed chromium (CI)
  if (PROXY) launchOpts.proxy = { server: PROXY };
  const browser = await chromium.launch(launchOpts);
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, proxy: PROXY ? { server: PROXY } : undefined });
  const api = ctx.request;
  const login = await api.post(`${BASE}/j_spring_security_check`,
    { form: { j_username: USER, j_password: PASS }, maxRedirects: 0, failOnStatusCode: false });
  console.log('login status', login.status());
  let anyFail = false;
  for (const stem of stems) {
    const errs = [];
    const page = await ctx.newPage();
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });
    await page.route('**/*', async (route) => {
      const req = route.request(); const u = req.url();
      if (!u.startsWith(ORIGIN) && !u.startsWith(ORIGIN_H)) return route.continue().catch(() => route.abort());
      try {
        const resp = await api.fetch(u.replace(ORIGIN_H, ORIGIN),
          { method: req.method(), headers: req.headers(), data: req.postDataBuffer() || undefined, maxRedirects: 5, failOnStatusCode: false });
        let body = await resp.body(); const h = resp.headers(); delete h['content-encoding']; delete h['content-length'];
        if (/javascript|html|json/.test(h['content-type'] || '')) body = Buffer.from(body.toString('utf8').split(ORIGIN_H).join(ORIGIN));
        if (resp.status() >= 500 && !/properties/.test(u)) errs.push('HTTP ' + resp.status() + ' ' + u.split('?')[0].slice(-60));
        await route.fulfill({ status: resp.status(), headers: h, body });
      } catch (e) { errs.push('route: ' + e.message); route.abort().catch(() => {}); }
    });
    const url = `${BASE}/api/repos/${V2PATH.replace(/^\/+/, '').replace(/\//g, ':')}:${stem}.html/content?cb=${Date.now()}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e => errs.push('goto: ' + e.message));
    try { await page.waitForFunction(() => document.querySelectorAll('svg').length > 0, { timeout: 30000 }); }
    catch (e) { errs.push('no-svg-timeout'); }
    await page.waitForTimeout(2500);
    let stats = await page.evaluate(() => ({
      cards: document.querySelectorAll('.pdc-card, .card').length,
      svgs: document.querySelectorAll('svg').length,
      infodots: document.querySelectorAll('.pdc-i, [data-info]').length,
      selects: document.querySelectorAll('select').length
    }));
    if (INTERACT && stats.selects >= 2) {
      await page.evaluate(() => { const ss = Array.from(document.querySelectorAll('select'));
        const s = ss[1]; if (s && s.options.length > 1) { s.selectedIndex = 1; s.dispatchEvent(new Event('change', { bubbles: true })); } });
      await page.waitForTimeout(4000);
      stats.afterFilterSvgs = await page.evaluate(() => document.querySelectorAll('svg').length);
    }
    const real = errs.filter(e => !BENIGN.test(e));
    console.log(`\n=== ${stem} ===`);
    console.log('  stats', JSON.stringify(stats));
    console.log('  errors', real.length, real.slice(0, 8));
    if (real.length || stats.svgs === 0) anyFail = true;
    await page.close();
  }
  await browser.close();
  process.exit(anyFail ? 1 : 0);
})();
